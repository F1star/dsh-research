/**
 * Provider-neutral runtime for importing parsed research
 * documents and reading stable, content-derived block anchors.
 * @module @f1star/dsh-research/research-document
 */
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { HarnessError } from '@deepseek-ai/dsh-llm';
import { ResearchDocumentBlockId, ResearchDocumentId } from './types.ts';
import type { ResearchDocument, ResearchDocumentOutlineEntry, ResearchDocumentParser, ResearchDocumentReadResult, ResearchDocumentSearchHit } from './types.ts';
export type { ParsedResearchDocumentBlock, ParsedResearchDocumentPage, ResearchDocument, ResearchDocumentBlock, ResearchDocumentBlockLocator, ResearchDocumentExtraction, ResearchDocumentOutlineEntry, ResearchDocumentPage, ResearchDocumentParseRequest, ResearchDocumentParseResult, ResearchDocumentParser, ResearchDocumentReadResult, ResearchDocumentRect, ResearchDocumentSearchHit, } from './types.ts';
export { ResearchDocumentBlockId, ResearchDocumentId, ResearchDocumentQuoteHash, } from './types.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        researchDocuments: ResearchDocumentRuntime;
    }
}
/** Shared runtime error codes; parser providers may add specific string codes. */
export type ResearchDocumentErrorCode = 'RESEARCH_DOCUMENT_ABORTED' | 'RESEARCH_DOCUMENT_BLOCK_NOT_FOUND' | 'RESEARCH_DOCUMENT_DUPLICATE_PROVIDER' | 'RESEARCH_DOCUMENT_EMPTY_QUERY' | 'RESEARCH_DOCUMENT_MEDIA_TYPE_MISMATCH' | 'RESEARCH_DOCUMENT_NOT_FOUND' | 'RESEARCH_DOCUMENT_PROVIDER_AMBIGUOUS' | 'RESEARCH_DOCUMENT_PROVIDER_CONFIGURED_MISSING' | 'RESEARCH_DOCUMENT_PROVIDER_CONFIGURED_UNAVAILABLE' | 'RESEARCH_DOCUMENT_PROVIDER_UNAVAILABLE';
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
     * @param documentId - exact imported version id.
     * @returns deterministic outline entries.
     */
    outline(documentId: ResearchDocumentId): readonly ResearchDocumentOutlineEntry[];
    /**
     * Search retained block text using deterministic phrase-and-term scoring.
     * @param documentId - exact imported version id.
     * @param query - non-empty phrase or terms.
     * @param maxResults - positive caller-owned result bound.
     * @returns strongest hits, then reading order.
     */
    search(documentId: ResearchDocumentId, query: string, maxResults: number): readonly ResearchDocumentSearchHit[];
    /**
     * Return a block window around one exact anchor.
     * @param documentId - exact imported version id.
     * @param blockId - focus block.
     * @param before - number of preceding blocks.
     * @param after - number of following blocks.
     * @returns ordered window including the focus block.
     */
    read(documentId: ResearchDocumentId, blockId: ResearchDocumentBlockId, before: number, after: number): ResearchDocumentReadResult;
    private resolveParser;
    private touch;
    private evictOverLimit;
}
export default ResearchDocumentRuntime;
//# sourceMappingURL=index.d.ts.map