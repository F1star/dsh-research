/** Report companion reservation is released when its plugin unloads. */

import { expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Invariants from '@deepseek-ai/dsh-invariants'
import * as Companion from '../../src/research-report/invariant.ts'
import ResearchReport from '../../src/research-report/index.ts'

it('reserves and releases report invariant ownership through plugin disposal', async () => {
  const ctx = new Context()
  try {
    await ctx.plugin(Invariants)
    const fiber = await ctx.plugin(Companion)
    expect(() => ctx.invariants.register('@f1star/dsh-research/research-report', () => {})).toThrow('already registered')
    await fiber.dispose()
    const dispose = ctx.invariants.register('@f1star/dsh-research/research-report', () => {})
    dispose()
  } finally { await ctx.fiber.dispose() }
})

it('accepts constructor defaults and rejects non-finite or fractional export capacity', async () => {
  const ctx = new Context()
  try { expect(new ResearchReport(ctx)).toBeInstanceOf(ResearchReport) }
  finally { await ctx.fiber.dispose() }
  for (const limit of [0, -1, 1.5, Infinity, NaN]) {
    const invalid = new Context()
    try { expect(() => new ResearchReport(invalid, { maxReportBytes: limit })).toThrow('positive safe integer') }
    finally { await invalid.fiber.dispose() }
  }
})
