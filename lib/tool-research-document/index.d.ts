/**
 * Model-facing tools for importing local PDFs and reading citeable native-text
 * evidence through `ctx.researchDocuments`.
 * @module @f1star/dsh-research/tool-research-document
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "tool-research-document";
/** Services required by the paper-reading tool suite. */
export declare const inject: string[];
/** Default complete-PDF byte limit for one local import. */
export declare const DEFAULT_MAX_PDF_BYTES: number;
/** Default maximum headings returned by one outline call. */
export declare const DEFAULT_MAX_OUTLINE_ENTRIES = 200;
/** Default maximum hits returned by one search call. */
export declare const DEFAULT_MAX_SEARCH_RESULTS = 20;
/** Default maximum blocks returned by one anchored read. */
export declare const DEFAULT_MAX_READ_BLOCKS = 12;
/** Default combined text-character budget for one tool result. */
export declare const DEFAULT_MAX_OUTPUT_TEXT_CHARS = 100000;
/** Default cooperative timeout declared by `paper_import`. */
export declare const DEFAULT_IMPORT_TIMEOUT_MS = 120000;
/** Default preceding context for `paper_read`. */
export declare const DEFAULT_READ_BEFORE = 1;
/** Default following context for `paper_read`. */
export declare const DEFAULT_READ_AFTER = 2;
/** Paper tool resource and output policy. */
export interface Config {
    /** Inclusive complete-PDF byte cap. Defaults to 50 MiB. */
    readonly maxPdfBytes?: number;
    /** Maximum outline entries. Defaults to 200. */
    readonly maxOutlineEntries?: number;
    /** Maximum search hits. Defaults to 20. */
    readonly maxSearchResults?: number;
    /** Maximum context blocks in one anchored read. Defaults to 12. */
    readonly maxReadBlocks?: number;
    /** Imported-title cap and combined block-text budget per call. Defaults to 100000. */
    readonly maxOutputTextChars?: number;
    /** Cooperative `paper_import` timeout in milliseconds. Defaults to 120000. */
    readonly importTimeoutMs?: number;
    /** Default number of preceding blocks for `paper_read`. Defaults to 1. */
    readonly defaultReadBefore?: number;
    /** Default number of following blocks for `paper_read`. Defaults to 2. */
    readonly defaultReadAfter?: number;
}
/** Loader schema for paper tool limits. */
export declare const Config: z<Config>;
/** Register paper-reading prompt guidance and four tools. */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map