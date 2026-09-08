/** Package-owned invariant companion. @module @deepseek-ai/dsh-research-report/invariant */
const PACKAGE_NAME = '@f1star/dsh-research/research-report';
/** Cordis companion plugin name. */
export const name = 'research-report-invariant';
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants'];
/**
 * No runtime invariant: report rendering is a pure projection of a pinned question;
 * the information and library services own the referenced durable records.
 */
const install = () => { };
/** Register this package's invariant companion. */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
/* jscpd:ignore-end */
//# sourceMappingURL=invariant.js.map