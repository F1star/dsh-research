/** Durable research-document archive over the configured domain-storage backend. */
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import z from '@deepseek-ai/schemastery';
import { ResearchDocumentError, } from "../research-document/index.js";
import { researchDocumentArchiveDomainSpec } from "./spec.js";
export { researchDocumentArchiveDomainSpec, researchDocumentArchiveRecord } from "./spec.js";
/** Cordis plugin name. */
export const name = 'research-document-storage';
/** Archive registration and durable domain dependencies. */
export const inject = ['researchDocuments', 'storageDomain'];
/** Loader schema for archive limits. */
export const Config = z.object({
    maxDocuments: z.number().step(1).min(1).default(1000),
    maxSourceBytes: z.number().step(1).min(1).default(50 * 1024 * 1024),
    maxRecordBytes: z.number().step(1).min(1).default(100 * 1024 * 1024),
    maxTotalBytes: z.number().step(1).min(1).default(512 * 1024 * 1024),
    maxParserRevisions: z.number().step(1).min(1).default(16),
});
/**
 * Register validated durable storage for research imports and on-demand restoration.
 * Teardown stops registration, rejects new writes, and drains accepted writes before closing storage.
 * @param ctx - host context owning documents and domain storage.
 * @param config - archive capacity policy.
 */
export async function apply(ctx, config = {}) {
    const resolved = resolveConfig(config);
    const domain = await ctx.storageDomain.open(researchDocumentArchiveDomainSpec);
    const archive = new DomainArchive(domain, resolved);
    ctx.effect(() => () => archive.close(), 'researchDocumentArchive.close');
    archive.validateStoredState();
    ctx.effect(() => ctx.researchDocuments.registerArchive(archive), 'researchDocumentArchive.registration');
}
class DomainArchive {
    domain;
    config;
    table;
    operationTail = Promise.resolve();
    closed = false;
    constructor(domain, config) {
        this.domain = domain;
        this.config = config;
        this.table = domain.table('documents');
    }
    validateStoredState() {
        if (this.table.size > this.config.maxDocuments)
            throw capacity('maxDocuments');
        let total = 0;
        for (const [key, record] of this.table.entries()) {
            const bytes = Buffer.from(record.sourceBase64, 'base64');
            if (key !== record.documentId || record.sourceBase64 !== bytes.toString('base64')
                || key !== `sha256:${createHash('sha256').update(bytes).digest('hex')}`) {
                throw new ResearchDocumentError(`archived source "${key}" has invalid identity or bytes`, 'RESEARCH_DOCUMENT_ARCHIVE_CORRUPT');
            }
            const identities = record.revisions.map(value => JSON.stringify([value.parserId, value.parsed.parserVersion]));
            if (new Set(identities).size !== identities.length) {
                throw new ResearchDocumentError(`archived source "${key}" repeats a parser revision`, 'RESEARCH_DOCUMENT_ARCHIVE_CORRUPT');
            }
            this.checkRecord(record, bytes.byteLength);
            total += recordBytes(record);
        }
        if (total > this.config.maxTotalBytes)
            throw capacity('maxTotalBytes');
    }
    save(snapshot) {
        if (this.closed)
            return Promise.reject(closedError());
        const result = this.operationTail.then(() => this.saveNow(snapshot));
        this.operationTail = result.then(() => undefined, () => undefined);
        return result;
    }
    load(documentId, parser) {
        if (this.closed)
            return Promise.reject(closedError());
        const record = this.table.get(documentId);
        if (record === undefined)
            return Promise.resolve(undefined);
        const revision = parser === undefined
            ? record.revisions[record.currentRevision]
            : record.revisions.find(value => value.parserId === parser.id && value.parsed.parserVersion === parser.version);
        return Promise.resolve(revision === undefined ? undefined : {
            documentId,
            mediaType: record.mediaType,
            bytes: new Uint8Array(Buffer.from(record.sourceBase64, 'base64')),
            parserId: revision.parserId,
            parsed: revision.parsed,
        });
    }
    async close() {
        this.closed = true;
        await this.operationTail;
        await this.domain.close();
    }
    async saveNow(snapshot) {
        const existing = this.table.get(snapshot.documentId);
        const sourceBase64 = Buffer.from(snapshot.bytes).toString('base64');
        if (existing !== undefined && (existing.mediaType !== snapshot.mediaType || existing.sourceBase64 !== sourceBase64)) {
            throw new ResearchDocumentError('archived source identity cannot change', 'RESEARCH_DOCUMENT_ARCHIVE_SOURCE_CONFLICT');
        }
        const revisions = [...existing?.revisions ?? []];
        const previousIndex = revisions.findIndex(value => value.parserId === snapshot.parserId
            && value.parsed.parserVersion === snapshot.parsed.parserVersion);
        const revision = { parserId: snapshot.parserId, parsed: snapshot.parsed };
        if (previousIndex >= 0 && !isDeepStrictEqual(revisions[previousIndex], revision)) {
            throw new ResearchDocumentError('parser output changed without a new parser revision', 'RESEARCH_DOCUMENT_ARCHIVE_REVISION_CONFLICT');
        }
        if (previousIndex < 0)
            revisions.push(revision);
        const record = {
            documentId: snapshot.documentId,
            mediaType: snapshot.mediaType,
            sourceBase64,
            currentRevision: previousIndex < 0 ? revisions.length - 1 : previousIndex,
            revisions,
        };
        if (existing !== undefined && isDeepStrictEqual(existing, record))
            return;
        if (existing === undefined && this.table.size >= this.config.maxDocuments)
            throw capacity('maxDocuments');
        this.checkRecord(record, snapshot.bytes.byteLength);
        let total = recordBytes(record);
        for (const [key, value] of this.table.entries()) {
            if (key !== snapshot.documentId)
                total += recordBytes(value);
        }
        if (total > this.config.maxTotalBytes)
            throw capacity('maxTotalBytes');
        await this.table.put(snapshot.documentId, record);
    }
    checkRecord(record, sourceBytes) {
        if (sourceBytes > this.config.maxSourceBytes)
            throw capacity('maxSourceBytes');
        if (record.revisions.length > this.config.maxParserRevisions)
            throw capacity('maxParserRevisions');
        if (recordBytes(record) > this.config.maxRecordBytes)
            throw capacity('maxRecordBytes');
    }
}
function resolveConfig(config) {
    const resolved = {
        maxDocuments: config.maxDocuments ?? 1000,
        maxSourceBytes: config.maxSourceBytes ?? 50 * 1024 * 1024,
        maxRecordBytes: config.maxRecordBytes ?? 100 * 1024 * 1024,
        maxTotalBytes: config.maxTotalBytes ?? 512 * 1024 * 1024,
        maxParserRevisions: config.maxParserRevisions ?? 16,
    };
    for (const [key, value] of Object.entries(resolved)) {
        if (!Number.isSafeInteger(value) || value < 1)
            throw new TypeError(`${key} must be a positive safe integer`);
    }
    return resolved;
}
function recordBytes(record) {
    return Buffer.byteLength(JSON.stringify(record), 'utf8');
}
function capacity(field) {
    return new ResearchDocumentError(`research archive exceeds ${field}; increase the configured limit`, 'RESEARCH_DOCUMENT_ARCHIVE_CAPACITY');
}
function closedError() {
    return new ResearchDocumentError('research archive is closed', 'RESEARCH_DOCUMENT_ARCHIVE_CLOSED');
}
//# sourceMappingURL=index.js.map