/** Paged scientific-object navigation over exact, restorable parser revisions. */
import type { Context } from '@deepseek-ai/cordis';
/** Configured bounds for complete scientific results and their individual fields. */
export interface StructureToolConfig {
    readonly maxStructureItems: number;
    readonly maxStructureTextChars: number;
    readonly maxStructureOutputBytes: number;
}
/**
 * Register structure discovery, cell paging, and lossless text continuation.
 * @param ctx - owning plugin context with research documents and tools.
 * @param config - resolved, validated output limits.
 */
export declare function registerStructureTool(ctx: Context, config: StructureToolConfig): void;
//# sourceMappingURL=structure-tool.d.ts.map