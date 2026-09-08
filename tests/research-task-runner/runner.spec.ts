/** Owned real Agent loops with scripted external model responses and durable session logs. */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import AgentPresets from '@deepseek-ai/dsh-agent-presets'
import AgentDefaultModel from '@deepseek-ai/dsh-agent-default-model'
import * as TaskTools from '../../src/tool-research-task/index.ts'
import { ResearchAuthorId } from '../../src/research-information/index.ts'
import { mount, create, paper, checkpoint, saved } from '../research-task/fixtures.ts'
import { MockAdapter, textResponse, toolCallResponse } from '../helpers/mock-adapter.ts'
import ResearchTaskRuns, { type Config, type ResearchTaskRunResult, type ResearchTaskRunView } from '../../src/research-task-runner/index.ts'

const researcher = { kind: 'researcher' as const, id: ResearchAuthorId('reviewer') }
const limits: Config = { agentPreset: 'worker', maxSteps: 10, maxDurationMs: 10000, maxUnchangedTurns: 1,
  maxConcurrentRuns: 2, maxRuns: 100, maxTextChars: 1000, maxRunBytes: 8192 }
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })

async function harness(adapter: MockAdapter, config: Partial<Config> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'research-runner-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const { ctx } = await mount()
  cleanups.push(() => ctx.fiber.dispose())
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  await mkdir(join(root, 'worker'))
  await writeFile(join(root, 'worker', 'agent.cordis.yml'), '[]\n')
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(JsonlSessionPersistence, { root: join(root, 'sessions') })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(TaskTools)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(AgentPresets, { default: 'worker', includeUserRoot: false, roots: [{ path: root, trust: 'system' }] })
  await ctx.plugin(AgentDefaultModel, { provider: 'mock', model: 'test-model' })
  ctx.llm.registerAdapter(['mock'], adapter)
  const runner = await ctx.plugin(ResearchTaskRuns, { ...limits, ...config })
  const task = await create(ctx)
  const source = await paper(ctx, task.questionId, 1)
  saved(await checkpoint(ctx, task.taskId, 'acquisition', { sources: [source.source] }))
  const start = () => ctx.researchTaskRuns.start({ taskId: task.taskId,
    expectedRevision: ctx.researchTasks.get(task.taskId)!.task.revision, author: researcher })
  return { ctx, task, source, start, runner }
}

function accepted(result: ResearchTaskRunResult): ResearchTaskRunView {
  expect(result.status).toBe('saved')
  if (result.status !== 'saved') throw new Error(result.status)
  return result.run
}

it('executes a checkpoint through the model tool and retains the session when human review is required', async () => {
  const adapter = new MockAdapter([])
  const { ctx, task, start } = await harness(adapter)
  const view = ctx.researchTasks.get(task.taskId)!
  const response = toolCallResponse('extract', 'research_task_write', { task_id: task.taskId,
    revision: view.task.revision, question_revision: view.questionRevision, action: 'checkpoint', stage: 'extraction', summary: 'Sources inspected.' })
  vi.spyOn(adapter, 'stream').mockImplementationOnce(async function* () { yield* response })
  const run = accepted(await start())
  await vi.waitFor(() => { expect(ctx.researchTaskRuns.get(run.record.id)?.record.phase).toBe('waiting-review') })
  const finished = ctx.researchTaskRuns.get(run.record.id)!
  expect(finished.record.steps).toBe(1)
  expect(finished.interrupted).toBe(false)
  expect(ctx.researchTasks.get(task.taskId)?.completedStages).toEqual(['acquisition', 'extraction'])
  expect(ctx.agents.get(run.record.sessionId)).toBeUndefined()
  const log = await ctx.sessionPersistence.load(run.record.sessionId)
  expect(log).toBeDefined()
  expect(JSON.stringify(log)).toContain('Sources inspected.')
  expect(JSON.stringify(log)).toContain('Continue research task')
  expect(await start()).toMatchObject({ status: 'cannot-start', reason: 'Researcher review is required before continuing.' })
})

it('does not interpret an idle assistant response as completed research', async () => {
  const { ctx, start } = await harness(new MockAdapter([textResponse('Everything is done.')]))
  const run = accepted(await start())
  await vi.waitFor(() => { expect(ctx.researchTaskRuns.get(run.record.id)?.record.phase).toBe('needs-attention') })
  expect(ctx.researchTaskRuns.get(run.record.id)?.record.reason).toContain('No research progress')
})

it('stops a live stream, waits for teardown, and retains researcher authorship', async () => {
  const adapter = new MockAdapter(['hang-slow'])
  const { ctx, start } = await harness(adapter)
  const run = accepted(await start())
  await vi.waitFor(() => { expect(adapter.requests).toHaveLength(1) })
  expect(await start()).toEqual({ status: 'already-running' })
  const stop = accepted(await ctx.researchTaskRuns.stop({ runId: run.record.id, author: researcher }))
  expect(stop.record.phase).toBe('stopped')
  expect(stop.record.stoppedBy).toEqual(researcher)
  expect(ctx.agents.get(run.record.sessionId)).toBeUndefined()
  expect(await ctx.sessionPersistence.load(run.record.sessionId)).toBeDefined()
})

it('applies the execution deadline to a stalled model', async () => {
  const { ctx, start } = await harness(new MockAdapter(['hang']), { maxDurationMs: 100 })
  const run = accepted(await start())
  await vi.waitFor(() => { expect(ctx.researchTaskRuns.get(run.record.id)?.record.phase).toBe('needs-attention') })
  expect(ctx.researchTaskRuns.get(run.record.id)?.record.reason).toBe('Execution deadline reached.')
})

it('limits actual model steps across repeated idle intervals', async () => {
  const adapter = new MockAdapter([textResponse('Checking.'), textResponse('Checking again.')])
  const { ctx, start } = await harness(adapter, { maxSteps: 1, maxUnchangedTurns: 5 })
  const run = accepted(await start())
  await vi.waitFor(() => { expect(ctx.researchTaskRuns.get(run.record.id)?.record.phase).toBe('needs-attention') })
  expect(adapter.requests).toHaveLength(1)
  expect(ctx.researchTaskRuns.get(run.record.id)?.record.reason).toBe('Model step limit reached.')
})

it('denies another task mutation through the real tool executor', async () => {
  const adapter = new MockAdapter([])
  const { ctx, start } = await harness(adapter)
  const other = await create(ctx)
  vi.spyOn(adapter, 'stream').mockImplementationOnce(async function* () {
    yield* toolCallResponse('cross-task', 'research_task_write', { task_id: other.taskId, revision: 0, action: 'pause', reason: 'Unrelated.' })
  }).mockImplementationOnce(async function* () { yield* textResponse('Unable to continue.') })
  const run = accepted(await start())
  await vi.waitFor(() => { expect(ctx.researchTaskRuns.get(run.record.id)?.record.phase).toBe('needs-attention') })
  expect(ctx.researchTasks.get(other.taskId)?.task.revision).toBe(0)
  expect(JSON.stringify(await ctx.sessionPersistence.load(run.record.sessionId))).toContain('Use the assigned research task.')
})

it('rejects model authorship and stale researcher revisions without starting an agent', async () => {
  const adapter = new MockAdapter([])
  const { ctx, task } = await harness(adapter)
  expect(await ctx.researchTaskRuns.start({ taskId: task.taskId, expectedRevision: 1,
    author: { kind: 'agent', id: ResearchAuthorId('model') } })).toEqual({ status: 'researcher-required' })
  expect(await ctx.researchTaskRuns.start({ taskId: task.taskId, expectedRevision: 0, author: researcher }))
    .toEqual({ status: 'stale-revision', currentRevision: 1 })
  expect(adapter.requests).toHaveLength(0)
})

it('unloads only after owned model work is drained and retains a stopped attempt on remount', async () => {
  const adapter = new MockAdapter(['hang-slow'])
  const { ctx, start, runner } = await harness(adapter)
  const run = accepted(await start())
  await vi.waitFor(() => { expect(adapter.requests).toHaveLength(1) })
  await runner.dispose()
  expect(ctx.agents.get(run.record.sessionId)).toBeUndefined()
  await ctx.plugin(ResearchTaskRuns, limits)
  expect(ctx.researchTaskRuns.get(run.record.id)?.record).toMatchObject({ phase: 'stopped', reason: 'Execution owner unloaded.' })
  expect(ctx.researchTaskRuns.list(run.record.taskId)).toHaveLength(1)
  expect(adapter.requests).toHaveLength(1)
})

it('denies further tool writes in the same step after an extraction checkpoint reaches human review', async () => {
  const adapter = new MockAdapter([])
  const { ctx, task, start } = await harness(adapter)
  const view = ctx.researchTasks.get(task.taskId)!
  const args = { task_id: task.taskId, revision: view.task.revision, question_revision: view.questionRevision,
    action: 'checkpoint', stage: 'extraction', summary: 'Completed extraction.' }
  const first = toolCallResponse('extract-batch', 'research_task_write', args)
  const second = toolCallResponse('review-batch', 'research_task_write', { ...args, revision: view.task.revision + 1, stage: 'review' })
  const chunks = [...first.filter(chunk => chunk.type !== 'usage' && chunk.type !== 'finish'),
    ...second.map(chunk => 'index' in chunk ? { ...chunk, index: 1 } : chunk)]
  vi.spyOn(adapter, 'stream').mockImplementationOnce(async function* () { yield* chunks })
  const run = accepted(await start())
  await vi.waitFor(() => { expect(ctx.researchTaskRuns.get(run.record.id)?.record.phase).toBe('waiting-review') })
  expect(ctx.researchTasks.get(task.taskId)?.task.revision).toBe(view.task.revision + 1)
  const log = await ctx.sessionPersistence.load(run.record.sessionId)
  expect(JSON.stringify(log)).toContain('Researcher review is required before continuing.')
})

it('does not republish a saved starting attempt as live after the execution owner restarts', async () => {
  const { ctx, task, runner } = await harness(new MockAdapter([]))
  await runner.dispose()
  const { researchTaskRunDomainSpec } = await import('../../src/research-task-runner/spec.ts')
  const { randomUUID } = await import('node:crypto')
  const domain = await ctx.storageDomain.open(researchTaskRunDomainSpec)
  const id = randomUUID() as ResearchTaskRunView['record']['id']
  const sessionId = randomUUID() as ResearchTaskRunView['record']['sessionId']
  await domain.table('runs').put(id, { id, taskId: task.taskId, taskRevision: 1, sessionId,
    agentPreset: 'worker', model: { provider: 'mock', model: 'test-model' }, requestedBy: researcher, stoppedBy: null,
    phase: 'starting', reason: '', steps: null, createdAt: new Date().toISOString(), finishedAt: null })
  await domain.close()
  await ctx.plugin(ResearchTaskRuns, limits)
  expect(ctx.researchTaskRuns.get(id)?.interrupted).toBe(true)
  expect(ctx.researchTaskRuns.get(id)?.record.steps).toBeNull()
  expect(ctx.agents.get(sessionId)).toBeUndefined()
})

it.each(['agent-requester', 'terminal-without-time', 'time-before-start', 'missing-task', 'wrong-key', 'unconfirmed-steps', 'completed-without-steps'] as const)(
  'rejects inconsistent durable execution history: %s', async (failure) => {
    const { ctx, task, runner } = await harness(new MockAdapter([]))
    await runner.dispose()
    const { researchTaskRunDomainSpec } = await import('../../src/research-task-runner/spec.ts')
    const { randomUUID } = await import('node:crypto')
    const domain = await ctx.storageDomain.open(researchTaskRunDomainSpec)
    const record: ResearchTaskRunView['record'] = {
      id: randomUUID() as ResearchTaskRunView['record']['id'], taskId: task.taskId, taskRevision: 1,
      sessionId: randomUUID() as ResearchTaskRunView['record']['sessionId'], agentPreset: 'worker',
      model: { provider: 'mock', model: 'test-model' }, requestedBy: researcher, stoppedBy: null,
      phase: 'starting', reason: '', steps: null, createdAt: '2026-09-08T00:00:00.000Z', finishedAt: null,
    }
    const invalid = failure === 'agent-requester' ? { ...record, requestedBy: { ...researcher, kind: 'agent' as const } }
      : failure === 'terminal-without-time' ? { ...record, phase: 'failed' as const }
        : failure === 'time-before-start' ? { ...record, phase: 'failed' as const, steps: 1, finishedAt: '2026-09-07T00:00:00.000Z' }
          : failure === 'missing-task' ? { ...record, taskId: randomUUID() as typeof task.taskId }
            : failure === 'unconfirmed-steps' ? { ...record, steps: 0 }
              : failure === 'completed-without-steps' ? { ...record, phase: 'completed' as const, finishedAt: record.createdAt } : record
    await domain.table('runs').put(failure === 'wrong-key' ? randomUUID() as typeof record.id : record.id, invalid)
    await domain.close()
    await expect(Promise.resolve(ctx.plugin(ResearchTaskRuns, limits))).rejects.toThrow(/Execution/)
  },
)


it('ends an owned attempt when the session receives additional user input', async () => {
  const adapter = new MockAdapter([])
  const { ctx, start } = await harness(adapter)
  ctx.on('agent/created', ({ agent }) => {
    agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'A different task.' }] }))
  })
  const run = accepted(await start())
  await vi.waitFor(() => { expect(ctx.researchTaskRuns.get(run.record.id)?.record.phase).toBe('needs-attention') })
  expect(ctx.researchTaskRuns.get(run.record.id)?.record.reason).toContain('additional user input')
  expect(adapter.requests).toHaveLength(0)
  expect(ctx.agents.get(run.record.sessionId)).toBeUndefined()
})

it('retains an unknown step count when stopped before an owned agent is returned', async () => {
  const adapter = new MockAdapter([])
  const { ctx, start, runner } = await harness(adapter)
  const run = accepted(await start())
  const stopped = accepted(await ctx.researchTaskRuns.stop({ runId: run.record.id, author: researcher }))
  expect(stopped.record.phase).toBe('stopped')
  expect(stopped.record.steps).toBeNull()
  expect(adapter.requests).toHaveLength(0)
  await runner.dispose()
  await ctx.plugin(ResearchTaskRuns, limits)
  expect(ctx.researchTaskRuns.get(run.record.id)?.record.steps).toBeNull()
})

it('prevents a new model step while the terminal transcript is being flushed', async () => {
  const adapter = new MockAdapter([textResponse('No saved progress.'), textResponse('Unrelated continuation.')])
  const { ctx, start } = await harness(adapter)
  let injected = false
  ctx.on('session/flush', (session) => {
    const agent = ctx.agents.get(session.id)
    if (injected || agent === undefined || adapter.requests.length === 0) return
    injected = true
    agent.followup(createUserMessage({ source: { kind: 'plugin', plugin: 'late-context' },
      content: [{ type: 'text', text: 'Context arriving during terminal persistence.' }] }))
  })
  const run = accepted(await start())
  await vi.waitFor(() => { expect(ctx.researchTaskRuns.get(run.record.id)?.record.phase).toBe('needs-attention') })
  expect(injected).toBe(true)
  expect(adapter.requests).toHaveLength(1)
  expect(ctx.researchTaskRuns.get(run.record.id)?.record.steps).toBe(1)
  expect((await ctx.sessionPersistence.load(run.record.sessionId)).events.filter(event => event.type === 'step/start')).toHaveLength(1)
})
