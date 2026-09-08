import researchWorkspaceRemote from '../generated/typert.remote-client.js';
import * as workspace from "./ui/index.js";
/** Existing DSH browser services required by the research assembly. */
export const inject = ['remote', 'slots'];
/**
 * Mount the generated research namespace and its sidebar contribution.
 * @param ctx - browser context sharing the DSH Remote transport and slot registry.
 * @returns disposer withdrawing the generated namespace.
 */
export async function apply(ctx) {
    const dispose = await ctx.remote.$mount(researchWorkspaceRemote);
    try {
        await ctx.plugin(workspace);
        return dispose;
    }
    catch (error) {
        await dispose();
        throw error;
    }
}
//# sourceMappingURL=browser.js.map