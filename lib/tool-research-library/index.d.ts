/**
 * Model-facing tools for registering, finding, and explicitly reconciling
 * durable research-paper identities through `ctx.researchLibrary`.
 * @module @deepseek-ai/dsh-tool-research-library
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "tool-research-library";
/** Services required by the durable paper-library tool suite. */
export declare const inject: string[];
/** Default maximum papers returned by one library list call. */
export declare const DEFAULT_MAX_LIST_RESULTS = 50;
/** Default maximum exact source versions projected by one result. */
export declare const DEFAULT_MAX_SOURCES_PER_RESULT = 32;
/** Default combined author, identifier, alias, observation, and candidate count. */
export declare const DEFAULT_MAX_NESTED_ITEMS_PER_RESULT = 256;
/** Default combined human-text character budget for one canonical result and rendering. */
export declare const DEFAULT_MAX_OUTPUT_TEXT_CHARS = 100000;
/** Default maximum normalized query length accepted by the list tool. */
export declare const DEFAULT_MAX_QUERY_CHARS = 500;
/** Durable paper-library tool projection and query policy. */
export interface Config {
    /** Maximum papers returned by one list call. Defaults to 50. */
    readonly maxListResults?: number;
    /** Maximum exact source versions projected by one result. Defaults to 32. */
    readonly maxSourcesPerResult?: number;
    /** Combined nested collection-item cap per result. Defaults to 256. */
    readonly maxNestedItemsPerResult?: number;
    /** Human-text projection and rendered-content character budget. Defaults to 100000. */
    readonly maxOutputTextChars?: number;
    /** Maximum normalized list-query characters. Defaults to 500. */
    readonly maxQueryChars?: number;
}
/** Loader schema for paper-library tool limits. */
export declare const Config: z<Config>;
/** Register stable guidance and four explicit durable paper-library tools. */
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map