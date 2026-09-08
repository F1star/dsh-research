/**
 * Package-owned invariant registration for research-document tools.
 * @module @deepseek-ai/dsh-tool-research-document/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "tool-research-document-invariant";
/** Invariant registry dependency. */
export declare const inject: string[];
/**
 * Reserve this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map