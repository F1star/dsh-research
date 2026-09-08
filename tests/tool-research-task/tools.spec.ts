/** Logged task output, producer authorship, continuation, and registration lifetime. */

import { expect, it } from 'vitest'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { CallId } from '@deepseek-ai/dsh-llm'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { mount, create, paper, checkpoint } from '../research-task/fixtures.ts'
import * as TaskTools from '../../src/tool-research-task/index.ts'

function value(result: ToolExecutionResult): Record<string, unknown> {
  if (result.isError) throw new Error(result.error.message)
  return result.value as Record<string, unknown>
}

it('projects current requirements and paged historical sources without allowing model-authored human approval', async () => {
  const { ctx } = await mount()
  try {
    const { taskId, questionId } = await create(ctx, 'topic-review')
    const first = await paper(ctx, questionId, 1)
    const second = await paper(ctx, questionId, 2)
    await checkpoint(ctx, taskId, 'acquisition', { sources: [first.source, second.source] })
    await checkpoint(ctx, taskId, 'extraction')
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    const fiber = await ctx.plugin(TaskTools, { maxItems: 1 })
    const agent = { id: 'task-tool-agent' } as unknown as Agent
    let count = 0
    const call = (name: string, args: unknown, withAgent = true) => ctx.tools.execute({ signal: new AbortController().signal,
      callId: CallId(`task-tool-${++count}`), name, arguments: args, ...(withAgent ? { agent } : {}) })
    expect(value(await call('research_task_get', { task_id: taskId }))).toMatchObject({
      status: 'ready', next_stage: 'review', stale: false, requires_resume: false, total: 2, next_offset: 1,
    })
    const reviewPage = value(await call('research_task_get', { task_id: taskId, offset: 1 }))
    expect(reviewPage.next_offset).toBeNull()
    expect(reviewPage.issues).toEqual([expect.stringContaining(second.claimId)])
    expect(value(await call('research_task_get', { task_id: taskId, view: 'sources', checkpoint_revision: 1 }))).toMatchObject({
      sources: [{ paper_id: first.source.paperId, source_version_id: first.source.sourceVersionId }], next_offset: 1,
    })
    expect(value(await call('research_task_get', { task_id: taskId, view: 'history' }))).toMatchObject({
      history: [{ stage: 'acquisition', task_revision: 1, effective: true }], next_offset: 1,
    })
    expect(value(await call('research_task_get', { task_id: taskId, view: 'artifacts', checkpoint_revision: 2, artifact_kind: 'claimIds' })))
      .toMatchObject({ artifact_ids: [first.claimId], total: 2, next_offset: 1 })
    const refusal = value(await call('research_task_write', { action: 'checkpoint', task_id: taskId, revision: 2,
      question_revision: ctx.researchInformation.get(questionId)!.revision, stage: 'review', summary: 'The model read the source.' }))
    expect(refusal).toEqual({ status: 'cannot-advance', issues: [
      `Researcher review is required for claim ${first.claimId}.`, `Researcher review is required for claim ${second.claimId}.`,
    ] })
    expect((await call('research_task_write', { action: 'create', question_id: questionId, kind: 'single-paper' }, false)).isError).toBe(true)
    const created = value(await call('research_task_write', { action: 'create', question_id: questionId, kind: 'single-paper' }))
    expect(created.status).toBe('saved')
    expect(ctx.researchTasks.list().at(-1)?.createdBy).toEqual({ kind: 'agent', id: 'task-tool-agent' })
    expect(value(await call('research_task_list', { question_id: questionId }))).toMatchObject({ total: 2, next_offset: 1 })
    expect((await call('research_task_get', { task_id: taskId, view: 'sources', offset: 9 })).isError).toBe(true)
    await fiber.dispose()
    expect((await call('research_task_list', {})).isError).toBe(true)
  } finally { await ctx.fiber.dispose() }
})

it('refuses insufficient output capacity before creating a task', async () => {
  const { ctx } = await mount()
  try {
    const { questionId } = await create(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(TaskTools, { maxOutputBytes: 1 })
    const before = ctx.researchTasks.list()
    const result = await ctx.tools.execute({ signal: new AbortController().signal, callId: CallId('task-capacity'),
      name: 'research_task_write', arguments: { action: 'create', question_id: questionId, kind: 'single-paper' },
      agent: { id: 'task-agent' } as unknown as Agent })
    expect(result.isError).toBe(true)
    expect(ctx.researchTasks.list()).toEqual(before)
  } finally { await ctx.fiber.dispose() }
})
