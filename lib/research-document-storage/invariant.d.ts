/** Invariant ownership for the durable research-document archive provider. */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "research-document-storage-invariant";
/** Invariant registry dependency. */
export declare const inject: string[];
/**
 * Register archive invariant ownership.
 * @param ctx - context carrying the invariant registry.
 * @returns installed registration disposer.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map