import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Invariants from '@deepseek-ai/dsh-invariants'
import { apply } from '../../src/research-task/invariant.ts'

describe('research-task invariant companion', () => {
  it('reserves package ownership without installing a relationship listener', async () => {
    const ctx = new Context()
    await ctx.plugin(Invariants)
    const on = vi.spyOn(ctx, 'on')
    const dispose = await apply(ctx)
    expect(on).not.toHaveBeenCalled()
    dispose()
  })
})
