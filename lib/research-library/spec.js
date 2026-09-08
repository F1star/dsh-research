/**
 * Durable schema and domain declaration for the research-paper library.
 * @module @deepseek-ai/dsh-research-library/src/spec
 */
import { z } from 'zod';
import { ResearchDocumentId, } from "../research-document/index.js";
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
const metadataOrigin = z.enum(['declared', 'parser', 'source-derived']);
const paperId = z.string().transform(value => value);
const sourceVersionId = z.string().transform(value => value);
const instant = z.iso.datetime({ offset: true });
const textField = z.object({
    value: z.string(),
    origin: metadataOrigin,
});
const authorsField = z.object({
    value: z.array(z.string()),
    origin: metadataOrigin,
});
const yearField = z.object({
    value: z.number().int(),
    origin: metadataOrigin,
});
const extraction = z.discriminatedUnion('text', [
    z.object({ text: z.literal('native'), layout: z.literal('approximate') }),
    z.object({ text: z.literal('ocr-assisted'), layout: z.literal('approximate') }),
    z.object({ text: z.literal('none'), layout: z.literal('page-only') }),
]);
const externalId = z.object({
    kind: z.enum(['doi', 'arxiv']),
    value: z.string(),
    origin: metadataOrigin,
    addedAt: instant,
});
const sourceAlias = z.object({
    value: z.string(),
    origin: metadataOrigin,
    addedAt: instant,
});
const documentObservation = z.object({
    parserId: z.string(),
    parserVersion: z.string(),
    mediaType: z.string(),
    extraction,
    documentTitle: z.string().optional(),
    pageCount: z.number().int().nonnegative(),
    blockCount: z.number().int().nonnegative(),
    observedAt: instant,
});
const sourceVersion = z.object({
    id: sourceVersionId,
    documentId: z.string().transform(ResearchDocumentId),
    state: z.literal('imported'),
    aliases: z.array(sourceAlias),
    observations: z.array(documentObservation),
    createdAt: instant,
    updatedAt: instant,
});
/** Durable schema for one paper aggregate. */
export const researchPaperRecord = z.object({
    id: paperId,
    metadata: z.object({
        title: textField,
        authors: authorsField.optional(),
        year: yearField.optional(),
        venue: textField.optional(),
    }),
    externalIds: z.array(externalId),
    acquisitionState: z.enum(['metadata-only', 'imported']),
    sourceVersions: z.array(sourceVersion),
    createdAt: instant,
    updatedAt: instant,
});
/** Version-two, single-table durable library declaration. */
export const researchLibraryDomainSpec = defineDomain({
    name: 'research_library',
    version: 2,
    tables: {
        papers: domainTable(researchPaperRecord),
    },
});
//# sourceMappingURL=spec.js.map