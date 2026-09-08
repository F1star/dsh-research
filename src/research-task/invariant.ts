/**
 * Package-owned invariant registration for structured research information.
 * @module @deepseek-ai/dsh-research-task/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@f1star/dsh-research/research-task'

/** Cordis companion plugin name. */
export const name = 'research-task-invariant'
/** Invariant registry dependency. */
export const inject = ['invariants']

/**
 * No runtime invariant: task checkpoints share one validated atomic aggregate;
 * current scientific dependencies are read from their owning services.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
