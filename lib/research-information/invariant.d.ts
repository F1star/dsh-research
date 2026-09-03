/**
 * Package-owned invariant registration for structured research information.
 * @module @f1star/dsh-research/research-information/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "research-information-invariant";
/** Invariant registry dependency. */
export declare const inject: string[];
/**
 * Register this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map