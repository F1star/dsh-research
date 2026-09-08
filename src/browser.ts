/** Standalone browser assembly: mount this bundle's Remote API before the workspace. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import researchWorkspaceRemote from '../generated/typert.remote-client.js'
import * as workspace from './ui/index.ts'

/** Existing DSH browser services required by the research assembly. */
export const inject = ['remote', 'slots']

/**
 * Mount the generated research namespace and its sidebar contribution.
 * @param ctx - browser context sharing the DSH Remote transport and slot registry.
 * @returns disposer withdrawing the generated namespace.
 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  const dispose = await ctx.remote.$mount(researchWorkspaceRemote)
  try {
    await ctx.plugin(workspace)
    return dispose
  } catch (error) {
    await dispose()
    throw error
  }
}
