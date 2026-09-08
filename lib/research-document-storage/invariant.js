/** Invariant ownership for the durable research-document archive provider. */
/** Cordis companion plugin name. */
export const name = 'research-document-storage-invariant';
/** Invariant registry dependency. */
export const inject = ['invariants'];
/**
 * No runtime invariant: source bytes and parser revisions commit in one domain
 * record. The storage-domain invariant checks its independent changed-event stream;
 * this provider publishes no second stream or independently mutable derived state.
 */
const install = () => { };
/**
 * Register archive invariant ownership.
 * @param ctx - context carrying the invariant registry.
 * @returns installed registration disposer.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register('@f1star/dsh-research/research-document-storage', install));
//# sourceMappingURL=invariant.js.map