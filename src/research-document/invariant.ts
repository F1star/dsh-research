/**
 * Package-owned invariant registration for the research-document runtime.
 * @module @f1star/dsh-research/research-document/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '../research-document/index.ts'

/** Cordis companion plugin name. */
export const name = 'research-document-invariant'
/** Invariant registry dependency. */
export const inject = ['invariants']

/**
 * No runtime invariant: the runtime assigns every cached document and block
 * relation synchronously and publishes no independent relationship stream.
 */
const install: InvariantInstaller = () => {}

/**
 * Reserve this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
