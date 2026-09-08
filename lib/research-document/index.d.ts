/**
 * Provider-neutral runtime for importing parsed research
 * documents and reading stable, content-derived block anchors.
 * @module @deepseek-ai/dsh-research-document
 */
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { HarnessError } from '@deepseek-ai/dsh-llm';
import type { ResearchDocumentBlockId as ResearchDocumentBlockIdBrand, ResearchDocumentId as ResearchDocumentIdBrand, ResearchDocumentQuoteHash as ResearchDocumentQuoteHashBrand } from './types.ts';
import type { ResearchDocument, ResearchDocumentArchive, ResearchDocumentBlock, ResearchDocumentOutlineEntry, ResearchDocumentParser, ResearchDocumentParserIdentity, ResearchDocumentReadResult, ResearchDocumentSearchHit, ResearchDocumentStructure } from './types.ts';
export { researchDocumentParseResultSchema } from './schema.ts';
export type { ParsedResearchDocumentBlock, ParsedResearchDocumentPage, ResearchDocument, ResearchDocumentArchive, ResearchDocumentBlock, ResearchDocumentBlockLocator, ResearchDocumentExtraction, ResearchDocumentOutlineEntry, ResearchDocumentPage, ResearchDocumentParseRequest, ResearchDocumentParseResult, ResearchDocumentParser, ResearchDocumentParserIdentity, ResearchDocumentReadResult, ResearchDocumentRect, ResearchDocumentSearchHit, ResearchDocumentSnapshot, ResearchDocumentStructure, ResearchDocumentTable, ResearchDocumentTableCell, } from './types.ts';
/** Content-derived identity of one exact imported document version. */
export type ResearchDocumentId = ResearchDocumentIdBrand;
/**
 * Brand an exact document content hash as a runtime document id.
 * @param value - validated or runtime-generated document hash.
 * @returns the same string with its document-id brand.
 */
export declare function ResearchDocumentId(value: string): ResearchDocumentId;
/** Stable identity of one parsed block inside an exact document version. */
export type ResearchDocumentBlockId = ResearchDocumentBlockIdBrand;
/**
 * Brand a runtime-owned block identity.
 * @param value - validated or runtime-generated block id.
 * @returns the same string with its block-id brand.
 */
export declare function ResearchDocumentBlockId(value: string): ResearchDocumentBlockId;
/** Content hash of the complete text carried by one block anchor. */
export type ResearchDocumentQuoteHash = ResearchDocumentQuoteHashBrand;
/**
 * Brand a complete block-text hash as a quote-integrity token.
 * @param value - runtime-generated quote hash.
 * @returns the same string with its quote-hash brand.
 */
export declare function ResearchDocumentQuoteHash(value: string): ResearchDocumentQuoteHash;
declare module '@deepseek-ai/cordis' {
    interface Context {
        researchDocuments: ResearchDocumentRuntime;
    }
}
/** Shared runtime error codes; parser providers may add specific string codes. */
export type ResearchDocumentErrorCode = 'RESEARCH_DOCUMENT_ABORTED' | 'RESEARCH_DOCUMENT_ARCHIVE_DUPLICATE' | 'RESEARCH_DOCUMENT_ARCHIVE_UNAVAILABLE' | 'RESEARCH_DOCUMENT_BLOCK_NOT_FOUND' | 'RESEARCH_DOCUMENT_DUPLICATE_PROVIDER' | 'RESEARCH_DOCUMENT_EMPTY_QUERY' | 'RESEARCH_DOCUMENT_MEDIA_TYPE_MISMATCH' | 'RESEARCH_DOCUMENT_NOT_FOUND' | 'RESEARCH_DOCUMENT_PROVIDER_AMBIGUOUS' | 'RESEARCH_DOCUMENT_PROVIDER_CONFIGURED_MISSING' | 'RESEARCH_DOCUMENT_PROVIDER_CONFIGURED_UNAVAILABLE' | 'RESEARCH_DOCUMENT_PROVIDER_UNAVAILABLE';
/** Typed error for provider selection, lookup, cancellation, and parsing. */
export declare class ResearchDocumentError extends HarnessError {
    readonly code: string;
    constructor(message: string, code: string, options?: ErrorOptions);
}
/** Runtime provider selection and bounded in-memory retention policy. */
export interface Config {
    /** Explicit parser provider id. Omit to require one usable supporting parser. */
    readonly parserProvider?: string;
    /** Maximum imported document versions retained in memory. Defaults to 16. */
    readonly maxDocuments?: number;
}
/** Default maximum imported versions retained by one runtime. */
export declare const DEFAULT_MAX_DOCUMENTS = 16;
/**
 * Research-document runtime. It selects one parser, assigns exact content and
 * block identities, and owns a bounded LRU of readonly parsed values.
 */
export declare class ResearchDocumentRuntime extends Service {
    static Config: z<Config>;
    private readonly parsers;
    private readonly documents;
    private archive;
    private readonly config;
    constructor(ctx: Context, config?: Config);
    /**
     * Register one parser. Duplicate ids fail; the returned disposer removes
     * exactly this contribution.
     * @param parser - parser implementation and stable provider id.
     * @returns contribution disposer.
     */
    registerParser(parser: ResearchDocumentParser): () => void;
    /**
     * Register the sole archive provider. Its owner must dispose this contribution
     * before closing its storage. An absent archive keeps imports process-local.
     * @param archive - durable source and parser-result provider.
     * @returns contribution disposer.
     */
    registerArchive(archive: ResearchDocumentArchive): () => void;
    /**
     * Parse and retain one exact byte sequence. Re-importing retained bytes
     * returns the same retained value without invoking a parser again.
     * @param request - complete bytes and declared media type.
     * @param signal - aborts provider work.
     * @returns parsed document with content-derived anchors.
     */
    import(request: {
        readonly bytes: Uint8Array;
        readonly mediaType: string;
    }, signal?: AbortSignal): Promise<ResearchDocument>;
    /**
     * Restore a missing document from its saved parser output. No parser or original
     * source path is needed. Selecting a historical revision replaces the cached
     * revision for this document; old block ids are never remapped to new content.
     * @param documentId - exact imported content id.
     * @param parser - optional exact historical extraction revision.
     * @returns retained document with the original block ids and quote hashes.
     */
    restore(documentId: ResearchDocumentId, parser?: ResearchDocumentParserIdentity): Promise<ResearchDocument>;
    /**
     * Read exact archived source bytes for a document viewer or export.
     * @param documentId - exact imported content id.
     * @returns an owned copy of the saved source bytes.
     */
    source(documentId: ResearchDocumentId): Promise<Uint8Array>;
    /**
     * Read one retained document and refresh its LRU position.
     * @param documentId - exact imported version id.
     * @returns retained readonly document.
     */
    get(documentId: ResearchDocumentId): ResearchDocument;
    /**
     * Inspect whether one exact document is retained without changing its LRU
     * position. Library consumers use this to report current readability
     * without evicting another document merely by checking coverage.
     * @param documentId - exact imported version id.
     * @returns the retained readonly document, or `undefined` when absent.
     */
    peek(documentId: ResearchDocumentId): ResearchDocument | undefined;
    /**
     * Return all parsed heading blocks in reading order.
     * @param document - retained id or restored snapshot; snapshots remain readable after cache eviction.
     * @returns deterministic outline entries.
     */
    outline(document: ResearchDocumentId | ResearchDocument): readonly ResearchDocumentOutlineEntry[];
    /**
     * Return scientific blocks in reading order, including blocks without OCR text.
     * @param document - retained id or restored snapshot; snapshots survive cache eviction.
     * @param kind - optional table, formula, or figure filter.
     * @returns source-owned blocks with their complete structures and exact locators.
     */
    structures(document: ResearchDocumentId | ResearchDocument, kind?: ResearchDocumentStructure['kind']): readonly (ResearchDocumentBlock & {
        readonly structure: ResearchDocumentStructure;
    })[];
    /**
     * Search retained block text using deterministic phrase-and-term scoring.
     * @param document - retained id or restored snapshot; snapshots remain readable after cache eviction.
     * @param query - non-empty phrase or terms.
     * @param maxResults - positive caller-owned result bound.
     * @returns strongest hits, then reading order.
     */
    search(document: ResearchDocumentId | ResearchDocument, query: string, maxResults: number): readonly ResearchDocumentSearchHit[];
    /**
     * Return a block window around one exact anchor.
     * @param document - retained id or restored snapshot; snapshots remain readable after cache eviction.
     * @param blockId - focus block.
     * @param before - number of preceding blocks.
     * @param after - number of following blocks.
     * @returns ordered window including the focus block.
     */
    read(document: ResearchDocumentId | ResearchDocument, blockId: ResearchDocumentBlockId, before: number, after: number): ResearchDocumentReadResult;
    private resolveParser;
    private touch;
    private evictOverLimit;
}
export default ResearchDocumentRuntime;
//# sourceMappingURL=index.d.ts.map