/** Package-owned invariant companion. @module @deepseek-ai/dsh-research-workspace/invariant */
const PACKAGE_NAME = '@f1star/dsh-research/research-workspace';
/** Cordis companion plugin name. */
export const name = 'research-workspace-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/**
 * No runtime invariant: stored positions are validated on load and write;
 * document and library providers own source identity.
 */
const install = () => { };
/** Register this package's invariant companion. */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
/* jscpd:ignore-end */
//# sourceMappingURL=invariant.js.map