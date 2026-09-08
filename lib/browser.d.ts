/** Standalone browser assembly: mount this bundle's Remote API before the workspace. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
/** Existing DSH browser services required by the research assembly. */
export declare const inject: string[];
/**
 * Mount the generated research namespace and its sidebar contribution.
 * @param ctx - browser context sharing the DSH Remote transport and slot registry.
 * @returns disposer withdrawing the generated namespace.
 */
export declare function apply(ctx: ClientContext): Promise<() => Promise<void>>;
//# sourceMappingURL=browser.d.ts.map