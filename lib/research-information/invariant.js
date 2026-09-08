/**
 * Package-owned invariant registration for structured research information.
 * @module @deepseek-ai/dsh-research-information/invariant
 */
const PACKAGE_NAME = '@f1star/dsh-research/research-information';
/** Cordis companion plugin name. */
export const name = 'research-information-invariant';
/** Invariant registry dependency. */
export const inject = ['invariants'];
/**
 * No runtime invariant: every question and its references share one durable
 * aggregate, and the service validates claims, normalized entities,
 * observations, comparison protocols, and all cited relations before put.
 */
const install = () => { };
/**
 * Register this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map