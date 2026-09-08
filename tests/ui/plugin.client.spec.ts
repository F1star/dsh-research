/** Research sidebar registration follows declaration and plugin lifetimes. */

import { Context, Service } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '../helpers/browser-runtime.ts'
import { apply, inject } from '../../src/ui/index.ts'
import type { WorkspaceInjected } from '../../src/ui/Workspace.tsx'

describe('research browser plugin', () => {
  it('loads lazily, exposes read failures, and withdraws its sidebar contribution on unload', async () => {
    const ctx = new Context()
    await ctx.plugin(SlotRegistry)
    class RemoteService extends Service {
      constructor() { super(ctx, 'remote') }
    }
    new RemoteService()
    const list = vi.fn(async () => ({ ok: true as const, value: { papers: [], total: 0, nextOffset: null } }))
    ctx.provide('remote.researchWorkspace', { list })
    const slots = ctx.get('slots') as InstanceType<typeof SlotRegistry>
    const fiber = await ctx.plugin({ inject, apply })
    try {
      const declare = () => slots.register({
        name: 'root', children: { 'sidebar.footer.action': { kind: 'list', scope: 'root' } },
      } as never, () => null)
      const remove = declare()
      await vi.waitFor(() => { expect(slots.entries('sidebar.footer.action')).toHaveLength(1) })
      expect(list).not.toHaveBeenCalled()
      const entry = slots.entries('sidebar.footer.action')[0]!
      const inputs = (entry.inject as unknown as () => WorkspaceInjected)()
      await inputs.load('', 0)
      expect(inputs.hooks.workspace.getSnapshot().catalog?.total).toBe(0)
      list.mockRejectedValueOnce(new Error('read failed'))
      await inputs.load('', 0)
      expect(inputs.hooks.workspace.getSnapshot().error).toBe('read failed')
      remove()
      const removeAgain = declare()
      await vi.waitFor(() => { expect(slots.entries('sidebar.footer.action')).toHaveLength(1) })
      await fiber.dispose()
      expect(slots.entries('sidebar.footer.action')).toEqual([])
      const calls = list.mock.calls.length
      await inputs.load('', 0)
      expect(list.mock.calls).toHaveLength(calls)
      removeAgain()
    } finally { await ctx.fiber.dispose() }
  })
})
