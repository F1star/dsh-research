/**
 * PDF.js provider for native PDF text, page geometry, and approximate text
 * blocks. OCR and semantic object extraction are intentionally separate
 * providers.
 * @module @deepseek-ai/dsh-research-document-pdfjs
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { type ResearchDocumentParseRequest, type ResearchDocumentParseResult, type ResearchDocumentParser } from '../research-document/index.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "research-document-pdfjs";
/** Service Definition required for parser registration. */
export declare const inject: string[];
/** Stable parser id used by explicit provider selection. */
export declare const PDFJS_PARSER_ID = "pdfjs";
/** Extraction revision; bump whenever block ordering or classification changes. */
export declare const PDFJS_PARSER_VERSION = "pdfjs-native-text-v1";
/** Default inclusive physical-page limit for one import. */
export declare const DEFAULT_MAX_PAGES = 500;
/** Default inclusive PDF.js text-item limit for one page. */
export declare const DEFAULT_MAX_TEXT_ITEMS_PER_PAGE = 100000;
/** PDF parsing resource policy. */
export interface Config {
    /** Inclusive physical-page limit. Defaults to 500. */
    readonly maxPages?: number;
    /** Inclusive PDF.js text-item limit per page. Defaults to 100000. */
    readonly maxTextItemsPerPage?: number;
}
/** Loader schema for PDF parsing resource limits. */
export declare const Config: z<Config>;
/** Native-text parser implementation registered by this plugin. */
export declare class PdfJsResearchDocumentParser implements ResearchDocumentParser {
    private readonly ctx;
    readonly id = "pdfjs";
    private readonly config;
    constructor(ctx: Context, config?: Config);
    /** @returns true because PDF.js is bundled with this provider. */
    available(): boolean;
    /**
     * Accept only the canonical PDF media type.
     * @param mediaType - declared media type from the importing consumer.
     * @returns whether this provider parses the declaration.
     */
    supports(mediaType: string): boolean;
    /**
     * Parse all native text sequentially and release PDF.js resources before
     * settling. Cancellation destroys the loading task and is normalized to the
     * research-document abort code.
     * @param request - complete consumer-bounded PDF bytes.
     * @param signal - cooperative cancellation signal.
     * @returns pages with approximate normalized line rectangles.
     */
    parse(request: ResearchDocumentParseRequest, signal?: AbortSignal): Promise<ResearchDocumentParseResult>;
}
/** Register one PDF.js parser contribution. */
export declare function apply(ctx: Context, config: Config): () => void;
//# sourceMappingURL=index.d.ts.map