/**
 * Package-owned invariant registration for owned research execution attempts.
 * @module @deepseek-ai/dsh-research-task-runner/invariant
 */
const PACKAGE_NAME = '@f1star/dsh-research/research-task-runner';
/** Cordis companion plugin name. */
export const name = 'research-task-runner-invariant';
/** Invariant registry dependency. */
export const inject = ['invariants'];
/**
 * No runtime invariant: attempts may outlive their owned sessions or lack a terminal record after a crash;
 * the driver awaits owned teardown and validates persisted assessments before publication.
 */
const install = () => { };
/**
 * Register this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map