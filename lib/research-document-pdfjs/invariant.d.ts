/**
 * Package-owned invariant registration for the PDF.js research-document provider.
 * @module @deepseek-ai/dsh-research-document-pdfjs/invariant
 */
import type { Context } from '@deepseek-ai/cordis';
/** Cordis companion plugin name. */
export declare const name = "research-document-pdfjs-invariant";
/** Invariant registry dependency. */
export declare const inject: string[];
/**
 * Reserve this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export declare const apply: (ctx: Context) => Promise<() => void>;
//# sourceMappingURL=invariant.d.ts.map