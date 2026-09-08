/**
 * Package-owned invariant registration for the Docling research-document provider.
 * @module @deepseek-ai/dsh-research-document-docling/invariant
 */

import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@f1star/dsh-research/research-document-docling'

/** Cordis companion plugin name. */
export const name = 'research-document-docling-invariant'
/** Invariant registry dependency. */
export const inject = ['invariants']

/** No runtime invariant: the Service Definition owns provider registration. */
const install: InvariantInstaller = () => {}

/**
 * Reserve this package's invariant ownership.
 * @param ctx - Cordis context carrying the invariant registry.
 * @returns the installed registration's disposer.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
