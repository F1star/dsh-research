/**
 * Package-owned invariant registration for research-library tools.
 * @module @deepseek-ai/dsh-tool-research-library/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@f1star/dsh-research/tool-research-library'

/** Cordis companion plugin name. */
export const name = 'tool-research-library-invariant'
/** Invariant registry dependency. */
export const inject = ['invariants']

/** No runtime invariant: the tool registry owns every contribution relation. */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
