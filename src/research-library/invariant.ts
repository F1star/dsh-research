/**
 * Package-owned invariant registration for the durable research library.
 * @module @deepseek-ai/dsh-research-library/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@f1star/dsh-research/research-library'

/** Cordis companion plugin name. */
export const name = 'research-library-invariant'
/** Invariant registry dependency. */
export const inject = ['invariants']

/**
 * No runtime invariant: the domain table is the public service's synchronous
 * read source, so the package publishes no independent cache relationship.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
