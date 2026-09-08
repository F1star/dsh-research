/**
 * Package-owned invariant registration for structured research information.
 * @module @deepseek-ai/dsh-research-task/invariant
 */
const PACKAGE_NAME = '@f1star/dsh-research/research-task';
/** Cordis companion plugin name. */
export const name = 'research-task-invariant';
/** Invariant registry dependency. */
export const inject = ['invariants'];
/**
 * No runtime invariant: task checkpoints share one validated atomic aggregate;
 * current scientific dependencies are read from their owning services.
 */
const install = () => { };
/**
 * Register this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map