/**
 * Model-facing tools for importing local PDFs and reading citeable extracted
 * evidence through `ctx.researchDocuments`.
 * @module @deepseek-ai/dsh-tool-research-document
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
/** Default blocks returned for each semantic section in `paper_reading_pack`. */
export declare const DEFAULT_READING_PACK_BLOCKS_PER_SECTION = 12;
/** Maximum blocks selectable for each semantic section in `paper_reading_pack`. */
export declare const DEFAULT_MAX_READING_PACK_BLOCKS_PER_SECTION = 14;
/** Maximum semantic sections selectable in one `paper_reading_pack` call. */
export declare const DEFAULT_MAX_READING_PACK_SECTIONS = 7;
/** Paper tool resource and output policy. */
export interface Config {
    /** Maximum objects or cells per scientific page. Defaults to 100. */
    readonly maxStructureItems?: number;
    /** Maximum Unicode code points per scientific text field or page. Defaults to 2000. */
    readonly maxStructureTextChars?: number;
    /** Complete structured reading result byte limit, including metadata and rendered text. Defaults to 262144. */
    readonly maxStructureOutputBytes?: number;
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
    /** Default blocks per semantic section in `paper_reading_pack`. Defaults to 12. */
    readonly defaultReadingPackBlocksPerSection?: number;
    /** Maximum blocks per semantic section in `paper_reading_pack`. Defaults to 14. */
    readonly maxReadingPackBlocksPerSection?: number;
    /** Maximum semantic sections in `paper_reading_pack`. Defaults to 7. */
    readonly maxReadingPackSections?: number;
}
/** Loader schema for paper tool limits. */
export declare const Config: z<Config>;
/**
 * Register paper navigation and scientific-structure reading tools.
 * @param ctx - owning plugin context.
 * @param config - paper reading resource policy.
 */
export declare function apply(ctx: Context, config: Config): void;
//# sourceMappingURL=index.d.ts.map