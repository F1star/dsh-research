/** Research task persistence, review requirements, and recovery. */

import { describe, expect, it } from 'vitest'
import { mount, create, paper, checkpoint, review, synthesize, saved, author } from './fixtures.ts'

describe('resumable research tasks', () => {
  it('requires explicit resume after an active task restarts and does not activate a failed resume', async () => {
    const first = await mount()
    const { taskId, questionId } = await create(first.ctx)
    const source = await paper(first.ctx, questionId, 1)
    saved(await checkpoint(first.ctx, taskId, 'acquisition', { sources: [source.source] }))
    await first.ctx.fiber.dispose()
    const second = await mount(first.pool)
    try {
      const before = second.ctx.researchTasks.get(taskId)!
      expect(before).toMatchObject({ task: { phase: 'active' }, requiresResume: true, nextStage: 'extraction' })
      expect(await checkpoint(second.ctx, taskId, 'extraction')).toMatchObject({ status: 'cannot-advance' })
      const resume = { taskId, expectedRevision: before.task.revision, action: 'resume' as const,
        reason: 'Continue the retained task.', author }
      first.pool.failNextWrites = 1
      await expect(second.ctx.researchTasks.update(resume)).rejects.toThrow('injected write failure')
      expect(second.ctx.researchTasks.get(taskId)).toEqual(before)
      expect(saved(await second.ctx.researchTasks.update(resume)).requiresResume).toBe(false)
      expect(saved(await checkpoint(second.ctx, taskId, 'extraction')).nextStage).toBe('review')
    } finally { await second.ctx.fiber.dispose() }
  })

  it('compares persisted timestamps as instants across offsets and rejects a checkpoint after its update', async () => {
    const first = await mount()
    const { taskId, questionId } = await create(first.ctx)
    const source = await paper(first.ctx, questionId, 1)
    const before = saved(await checkpoint(first.ctx, taskId, 'acquisition', { sources: [source.source] }))
    await first.ctx.fiber.dispose()
    const records = first.pool.media.get('research_task')!.tables.get('tasks')!
    const checkpointRecord = before.task.checkpoints[0]!
    const stored = { ...before.task, createdAt: '2026-09-01T09:00:00+08:00', updatedAt: '2026-09-01T02:00:00Z',
      checkpoints: [{ ...checkpointRecord, createdAt: '2026-09-01T09:30:00+08:00' }] }
    records.set(taskId, stored)
    const second = await mount(first.pool)
    try { expect(second.ctx.researchTasks.get(taskId)?.completedStages).toEqual(['acquisition']) }
    finally { await second.ctx.fiber.dispose() }
    records.set(taskId, { ...stored, checkpoints: [{ ...checkpointRecord, createdAt: '2026-09-01T03:00:00Z' }] })
    await expect(mount(first.pool)).rejects.toThrow('chronology')
  })

  it('enforces source capacity on historical checkpoints after the current source selection shrinks', async () => {
    const first = await mount()
    const { taskId, questionId } = await create(first.ctx, 'topic-review')
    const alpha = await paper(first.ctx, questionId, 1)
    const beta = await paper(first.ctx, questionId, 2)
    const initial = saved(await checkpoint(first.ctx, taskId, 'acquisition', { sources: [alpha.source, beta.source] }))
    saved(await first.ctx.researchTasks.update({ taskId, expectedRevision: initial.task.revision, action: 'rewind',
      stage: 'acquisition', reason: 'Narrow the source selection.', author }))
    saved(await checkpoint(first.ctx, taskId, 'acquisition', { sources: [alpha.source] }))
    await first.ctx.fiber.dispose()
    await expect(mount(first.pool, { maxSourcesPerTask: 1 })).rejects.toThrow('Checkpoint sources exceed maxSourcesPerTask')
  })

  it('stops for researcher review, resumes after a complete service restart, and invalidates only affected stages', async () => {
    const first = await mount()
    const { taskId, questionId } = await create(first.ctx)
    const source = await paper(first.ctx, questionId, 1)
    saved(await checkpoint(first.ctx, taskId, 'acquisition', { sources: [source.source] }))
    saved(await checkpoint(first.ctx, taskId, 'extraction'))
    expect(await checkpoint(first.ctx, taskId, 'review')).toMatchObject({ status: 'cannot-advance', issues: [expect.stringContaining('Researcher review')] })
    const beforePause = first.ctx.researchTasks.get(taskId)!
    saved(await first.ctx.researchTasks.update({ taskId, expectedRevision: beforePause.task.revision, action: 'pause', reason: 'Awaiting review.', author }))
    await first.ctx.fiber.dispose()
    const second = await mount(first.pool)
    try {
      const paused = second.ctx.researchTasks.get(taskId)!
      expect(paused).toMatchObject({ task: { phase: 'paused' }, completedStages: ['acquisition', 'extraction'], nextStage: 'review' })
      expect(await checkpoint(second.ctx, taskId, 'review')).toMatchObject({ status: 'cannot-advance' })
      await review(second.ctx, questionId, source.claimId)
      saved(await second.ctx.researchTasks.update({ taskId, expectedRevision: paused.task.revision, action: 'resume', reason: 'Review is available.', author }))
      saved(await checkpoint(second.ctx, taskId, 'review'))
      await synthesize(second.ctx, questionId, [source.claimId])
      saved(await checkpoint(second.ctx, taskId, 'synthesis'))
      const completed = saved(await checkpoint(second.ctx, taskId, 'export'))
      expect(completed).toMatchObject({ task: { phase: 'complete' }, nextStage: null, stale: false })
      expect(completed.task.checkpoints.at(-1)?.artifacts.reportDigest).toMatch(/^sha256:/)
      await review(second.ctx, questionId, source.claimId, 'rejected')
      const stale = second.ctx.researchTasks.get(taskId)!
      expect(stale).toMatchObject({ task: { phase: 'complete' }, completedStages: ['acquisition', 'extraction'], nextStage: 'review', stale: true })
      expect(stale.task.checkpoints).toEqual(completed.task.checkpoints)
      saved(await second.ctx.researchTasks.update({ taskId, expectedRevision: stale.task.revision, action: 'resume', reason: 'Source was rejected.', author }))
      saved(await checkpoint(second.ctx, taskId, 'review'))
      expect(await checkpoint(second.ctx, taskId, 'synthesis')).toMatchObject({ status: 'cannot-advance' })
      await synthesize(second.ctx, questionId, [])
      saved(await checkpoint(second.ctx, taskId, 'synthesis'))
      const revised = saved(await checkpoint(second.ctx, taskId, 'export'))
      expect(revised.task.checkpoints).toHaveLength(8)
      expect(revised.task.checkpoints.at(-1)?.artifacts.reportDigest).not.toBe(completed.task.checkpoints.at(-1)?.artifacts.reportDigest)
      await second.ctx.researchInformation.writeQuestion({ action: 'update', questionId,
        expectedRevision: revised.questionRevision, title: 'Retitled research task', author })
      expect(second.ctx.researchTasks.get(taskId)).toMatchObject({ nextStage: 'export', stale: true,
        completedStages: ['acquisition', 'extraction', 'review', 'synthesis'] })
    } finally { await second.ctx.fiber.dispose() }
    const third = await mount(first.pool)
    try { expect(third.ctx.researchTasks.get(taskId)?.task.checkpoints).toHaveLength(8) }
    finally { await third.ctx.fiber.dispose() }
  })

  it.each(['topic-review', 'method-comparison'] as const)('completes %s with explicit evidence coverage and comparison limitations', async (kind) => {
    const { ctx } = await mount()
    try {
      const { taskId, questionId } = await create(ctx, kind)
      const first = await paper(ctx, questionId, 1)
      const second = await paper(ctx, questionId, 2)
      saved(await checkpoint(ctx, taskId, 'acquisition', { sources: [first.source, second.source] }))
      saved(await checkpoint(ctx, taskId, 'extraction'))
      await review(ctx, questionId, first.claimId)
      await review(ctx, questionId, second.claimId)
      saved(await checkpoint(ctx, taskId, 'review'))
      if (kind === 'method-comparison') {
        expect(await checkpoint(ctx, taskId, 'comparison', { comparisonOutcome: 'protocol' })).toMatchObject({ status: 'cannot-advance' })
        saved(await checkpoint(ctx, taskId, 'comparison', { comparisonOutcome: 'not-comparable' }))
      }
      await synthesize(ctx, questionId, [first.claimId, second.claimId])
      saved(await checkpoint(ctx, taskId, 'synthesis'))
      expect(saved(await checkpoint(ctx, taskId, 'export')).nextStage).toBeNull()
    } finally { await ctx.fiber.dispose() }
  })

  it('serializes competing checkpoints, preserves progress on storage failure, and retains history when sources change', async () => {
    const { ctx, pool } = await mount()
    try {
      const { taskId, questionId } = await create(ctx, 'topic-review')
      const first = await paper(ctx, questionId, 1)
      const competing = await Promise.all([
        checkpoint(ctx, taskId, 'acquisition', { sources: [first.source] }),
        checkpoint(ctx, taskId, 'acquisition', { sources: [first.source] }),
      ])
      expect(competing.map(value => value.status)).toEqual(['saved', 'stale-revision'])
      const before = ctx.researchTasks.get(taskId)!
      pool.failNextWrites = 1
      await expect(checkpoint(ctx, taskId, 'extraction')).rejects.toThrow('injected write failure')
      expect(ctx.researchTasks.get(taskId)).toEqual(before)
      saved(await ctx.researchTasks.update({ taskId, expectedRevision: before.task.revision, action: 'rewind', stage: 'acquisition',
        reason: 'Include another source.', author }))
      const second = await paper(ctx, questionId, 2)
      const changed = saved(await checkpoint(ctx, taskId, 'acquisition', { sources: [first.source, second.source] }))
      expect(changed.task.checkpoints).toHaveLength(2)
      expect(changed.task.checkpoints[0]?.sources).toEqual([first.source])
      expect(changed.task.sources).toEqual([first.source, second.source])
    } finally { await ctx.fiber.dispose() }
  })

  it('rejects impossible persisted progress and complete-record capacity without partial checkpoints', async () => {
    const first = await mount(undefined, { maxCheckpointsPerTask: 1 })
    const { taskId, questionId } = await create(first.ctx)
    const source = await paper(first.ctx, questionId, 1)
    saved(await checkpoint(first.ctx, taskId, 'acquisition', { sources: [source.source] }))
    const before = first.ctx.researchTasks.get(taskId)!
    await expect(checkpoint(first.ctx, taskId, 'extraction')).rejects.toThrow('maxCheckpointsPerTask')
    expect(first.ctx.researchTasks.get(taskId)).toEqual(before)
    await first.ctx.fiber.dispose()
    const records = first.pool.media.get('research_task')!.tables.get('tasks')!
    records.set(taskId, { ...before.task, checkpointRevisions: [999] })
    await expect(mount(first.pool)).rejects.toThrow('ordered prefix')
  })
})
