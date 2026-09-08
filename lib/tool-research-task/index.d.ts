/** Model-facing research task planning, checkpointing, and explicit recovery. */
import type { Context } from '@deepseek-ai/cordis';
import s from '@deepseek-ai/schemastery';
/** Cordis plugin name. */
export declare const name = "tool-research-task";
/** Task storage and ordinary logged tool execution. */
export declare const inject: string[];
/** Complete tool-result and continuation limits. */
export interface Config {
    /** Maximum rows per list, issue, history, source, or artifact page. Defaults to 50. */
    readonly maxItems?: number;
    /** Maximum complete value, rendered text, and presentation metadata JSON bytes. Defaults to 262144. */
    readonly maxOutputBytes?: number;
}
/** Validated task tool response limits. */
export declare const Config: s<Config>;
/**
 * Register bounded research task tools and stable workflow guidance.
 * @param ctx - task service and tool/prompt registries.
 * @param config - complete response limits.
 */
export declare function apply(ctx: Context, config?: Config): void;
//# sourceMappingURL=index.d.ts.map