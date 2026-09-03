import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Invariants from '@deepseek-ai/dsh-invariants'
import { apply } from '../../src/research-information/invariant.ts'

describe('research-information invariant companion', () => {
  it('keeps aggregate-owned claim, entity, and citation checks inside the service', async () => {
    const ctx = new Context()
    await ctx.plugin(Invariants)
    const on = vi.spyOn(ctx, 'on')
    const dispose = await apply(ctx)
    expect(on).not.toHaveBeenCalled()
    dispose()
  })
})
