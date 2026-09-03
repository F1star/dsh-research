/**
 * Package-owned invariant registration for the PDF.js research-document provider.
 * @module @f1star/dsh-research/research-document-pdfjs/invariant
 */
const PACKAGE_NAME = '@f1star/dsh-research/research-document-pdfjs';
/** Cordis companion plugin name. */
export const name = 'research-document-pdfjs-invariant';
/** Invariant registry dependency. */
export const inject = ['invariants'];
/** No runtime invariant: the Service Definition owns provider registration. */
const install = () => { };
/**
 * Reserve this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map