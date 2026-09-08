/**
 * Model-facing tools for durable research questions, exact evidence, authored
 * reading notes, claims, normalized entities, comparison matrices, provenance audits,
 * and cited synthesis.
 * @module @deepseek-ai/dsh-tool-research-information
 */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "tool-research-information";
/** Services required by the structured research-information tool suite. */
export declare const inject: string[];
/** Default maximum questions returned by one list call. */
export declare const DEFAULT_MAX_LIST_RESULTS = 50;
/** Default combined evidence, note, claim, entity, observation, protocol, finding, matrix-cell, and audit-item count per result. */
export declare const DEFAULT_MAX_ITEMS_PER_RESULT = 256;
/** Default combined id and relation count projected by one tool result. */
export declare const DEFAULT_MAX_REFERENCES_PER_RESULT = 512;
/** Default combined variable-text character budget for one canonical result and rendering. */
export declare const DEFAULT_MAX_OUTPUT_TEXT_CHARS = 100000;
/** Default maximum normalized query length accepted by list and named-field retrieval. */
export declare const DEFAULT_MAX_QUERY_CHARS = 500;
/** Default maximum UTF-16 code units in one complete review before paging. */
export declare const DEFAULT_MAX_REVIEW_TEXT_CHARS = 2000000;
/** Structured research-information tool projection and query policy. */
export interface Config {
    /** Maximum questions returned by one list call. Defaults to 50. */
    readonly maxListResults?: number;
    /** Combined evidence, note, claim, entity, observation, protocol, finding, matrix-cell, and audit-item cap. Defaults to 256. */
    readonly maxItemsPerResult?: number;
    /** Combined id, evidence-link, and claim-reference cap. Defaults to 512. */
    readonly maxReferencesPerResult?: number;
    /** Variable-text projection and rendered-content character budget. Defaults to 100000. */
    readonly maxOutputTextChars?: number;
    /** Maximum normalized list and named-field query characters. Defaults to 500. */
    readonly maxQueryChars?: number;
    /** Maximum UTF-16 code units in one complete deterministic review. Defaults to 2000000. */
    readonly maxReviewTextChars?: number;
}
/** Loader schema for research-information tool limits. */
export declare const Config: z<Config>;
/** Register stable guidance and eleven structured research-information tools. */
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map