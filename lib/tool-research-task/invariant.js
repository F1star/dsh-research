/**
 * Package-owned invariant registration for research-library tools.
 * @module @deepseek-ai/dsh-tool-research-task/invariant
 */
const PACKAGE_NAME = '@f1star/dsh-research/tool-research-task';
/** Cordis companion plugin name. */
export const name = 'tool-research-task-invariant';
/** Invariant registry dependency. */
export const inject = ['invariants'];
/** No runtime invariant: the tool registry owns every contribution relation. */
const install = () => { };
/**
 * Register this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map