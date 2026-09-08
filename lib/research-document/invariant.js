/**
 * Package-owned invariant registration for the research-document runtime.
 * @module @deepseek-ai/dsh-research-document/invariant
 */
const PACKAGE_NAME = '@f1star/dsh-research/research-document';
/** Cordis companion plugin name. */
export const name = 'research-document-invariant';
/** Invariant registry dependency. */
export const inject = ['invariants'];
/**
 * No runtime invariant: the runtime assigns every cached document and block
 * relation synchronously and publishes no independent relationship stream.
 */
const install = () => { };
/**
 * Reserve this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map