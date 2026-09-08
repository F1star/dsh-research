/** Durable, revision-checked research task checkpoints over source and review records. */

import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { Service, type Context } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import { assertNever } from '@deepseek-ai/dsh-llm'
import type {} from '../research-information/index.ts'
import type {} from '../research-library/index.ts'
import type {} from '../research-report/index.ts'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import type { ResearchQuestionRecord } from '../research-information/types.ts'
import { researchTaskDomainSpec, researchTaskSchema, createResearchTaskSchema, updateResearchTaskSchema } from './spec.ts'
import { inspectStage, taskStages } from './stages.ts'
import type {
  ResearchTaskId, ResearchTaskRecord, ResearchTaskView, ResearchTaskCheckpoint, ResearchTaskMutationResult,
  CreateResearchTaskRequest, UpdateResearchTaskRequest,
} from './types.ts'

export type * from './types.ts'
export { researchTaskDomainSpec } from './spec.ts'

/** Storage and authored-checkpoint capacity, validated before opening the task domain. */
export interface Config {
  /** Maximum retained tasks. Defaults to 1000. */
  readonly maxTasks?: number
  /** Maximum historical checkpoints per task. Defaults to 1000. */
  readonly maxCheckpointsPerTask?: number
  /** Maximum selected exact sources per task. Defaults to 1000. */
  readonly maxSourcesPerTask?: number
  /** Maximum Unicode code points in a summary, reason, or author id. Defaults to 10000. */
  readonly maxTextChars?: number
  /** Maximum UTF-8 JSON bytes of one complete task record. Defaults to 2097152. */
  readonly maxTaskBytes?: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    researchTasks: ResearchTasks
  }
}

/** Owns saved research progress; task phases do not schedule or authenticate agents. */
export class ResearchTasks extends Service {
  static inject = ['storageDomain', 'researchInformation', 'researchLibrary', 'researchReport']
  /** Task storage and checkpoint bounds. */
  static Config: s<Config> = s.object({
    maxTasks: s.number().step(1).min(1).default(1000),
    maxCheckpointsPerTask: s.number().step(1).min(1).default(1000),
    maxSourcesPerTask: s.number().step(1).min(1).default(1000),
    maxTextChars: s.number().step(1).min(1).default(10000),
    maxTaskBytes: s.number().step(1).min(1).default(2097152),
  })
  private readonly limits: Required<Config>
  private tasks?: KvTable<ResearchTaskId, ResearchTaskRecord>
  private tail: Promise<void> = Promise.resolve()
  private closed = false
  private readonly activated = new Set<ResearchTaskId>()

  /**
   * @param ctx - scientific record owners, report renderer, and domain storage.
   * @param config - complete task and history limits.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'researchTasks')
    this.limits = { maxTasks: config.maxTasks ?? 1000, maxCheckpointsPerTask: config.maxCheckpointsPerTask ?? 1000,
      maxSourcesPerTask: config.maxSourcesPerTask ?? 1000, maxTextChars: config.maxTextChars ?? 10000,
      maxTaskBytes: config.maxTaskBytes ?? 2097152 }
    for (const [key, value] of Object.entries(this.limits)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${key} must be a positive safe integer`)
    }
  }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(researchTaskDomainSpec)
    this.ctx.effect(() => async () => {
      this.closed = true
      await this.tail
      this.activated.clear()
      await domain.close()
    }, 'research-task.domain')
    this.tasks = domain.table('tasks')
    if (this.tasks.size > this.limits.maxTasks) throw new Error('Stored tasks exceed maxTasks')
    for (const [id, task] of this.tasks.entries()) {
      if (id !== task.id) throw new Error('Task key differs from its saved id')
      this.validate(task)
    }
  }

  /**
   * List saved progress in insertion order; a saved complete phase may have stale scientific inputs.
   * @returns detached records; use get to assess current completion and the next stage.
   */
  list(): readonly ResearchTaskRecord[] {
    this.assertOpen()
    return [...this.table().entries()].map(([, task]) => structuredClone(task))
  }

  /**
   * Inspect live progress, stopping at the first changed or incomplete checkpoint.
   * @param id - saved task identity.
   * @returns a detached view, or undefined when the task does not exist; reads never resume work.
   */
  get(id: ResearchTaskId): ResearchTaskView | undefined {
    this.assertOpen()
    const task = this.table().get(id)
    return task === undefined ? undefined : this.view(task)
  }

  /**
   * Create a workflow for an existing question without changing scientific records.
   * @param request - workflow, question, and producer-derived author.
   * @returns committed progress or a missing-question refusal; storage and capacity failures reject.
   */
  create(request: CreateResearchTaskRequest): Promise<ResearchTaskMutationResult> {
    const input = createResearchTaskSchema.parse(request)
    return this.enqueue(async () => {
      if (this.ctx.researchInformation.get(input.questionId) === undefined) return { status: 'question-not-found' }
      if (this.table().size >= this.limits.maxTasks) throw new Error('Research tasks exceed maxTasks')
      const time = new Date().toISOString()
      const task: ResearchTaskRecord = { id: randomUUID() as ResearchTaskId, questionId: input.questionId,
        kind: input.kind, revision: 0, phase: 'active', reason: '', sources: [], checkpoints: [], checkpointRevisions: [],
        createdBy: input.author, updatedBy: input.author, createdAt: time, updatedAt: time }
      return this.commit(task, true)
    })
  }

  /**
   * Save a stage, pause, block, explicitly resume, or rewind while retaining checkpoint history.
   * @param request - inspected revisions, action fields, and producer-derived author.
   * @returns committed progress or a non-writing refusal; concurrent scientific changes remain visible as stale inputs.
   */
  update(request: UpdateResearchTaskRequest): Promise<ResearchTaskMutationResult> {
    const input = updateResearchTaskSchema.parse(request)
    return this.enqueue(async () => {
      const task = this.table().get(input.taskId)
      if (task === undefined) return { status: 'task-not-found' }
      if (task.revision !== input.expectedRevision) return { status: 'stale-revision', currentRevision: task.revision }
      const view = this.view(task)
      const deny = (...issues: string[]): ResearchTaskMutationResult => ({ status: 'cannot-advance', issues, view })
      const time = new Date(Math.max(Date.now(), Date.parse(task.updatedAt))).toISOString()
      const updated = { ...task, revision: task.revision + 1, updatedBy: input.author, updatedAt: time }
      const stages = taskStages(task.kind)
      switch (input.action) {
        case 'pause':
        case 'block': {
          if (task.phase === 'complete') return deny('Resume or rewind a completed task before changing its phase.')
          return this.commit({ ...updated, phase: input.action === 'pause' ? 'paused' : 'blocked', reason: input.reason }, false)
        }
        case 'resume': {
          if (task.phase === 'active' && !view.requiresResume && !view.stale) return deny('The task is already active.')
          if (view.nextStage === null) return deny('The completed task still matches its scientific inputs; rewind explicitly to do new work.')
          return this.commit({ ...updated, phase: 'active', reason: input.reason,
            checkpointRevisions: task.checkpointRevisions.slice(0, view.completedStages.length) }, true)
        }
        case 'rewind': {
          const index = stages.indexOf(input.stage)
          if (index < 0 || index > view.completedStages.length) return deny('Rewind may select only a completed or current workflow stage.')
          return this.commit({ ...updated, phase: 'active', reason: input.reason, checkpointRevisions: task.checkpointRevisions.slice(0, index) }, true)
        }
        case 'checkpoint': {
          if (task.phase !== 'active' || view.requiresResume) return deny('Explicitly resume this task before recording a checkpoint.')
          if (input.expectedQuestionRevision !== view.questionRevision) return { status: 'stale-question', currentRevision: view.questionRevision }
          if (input.stage !== view.nextStage) return deny(`The next stage is ${view.nextStage ?? 'none'}.`)
          if (input.stage !== 'acquisition' && input.sources !== undefined) return deny('Source selection belongs to acquisition; rewind to change it.')
          if ((input.stage === 'comparison') !== (input.comparisonOutcome !== undefined)) return deny('Only comparison checkpoints require a comparison outcome.')
          const sources = input.stage === 'acquisition' ? input.sources ?? [] : task.sources
          const question = this.question(task)
          const inspection = inspectStage(input.stage, task.kind, question, sources, this.ctx.researchLibrary.list(),
            () => this.ctx.researchReport.render({ questionId: question.id, expectedRevision: question.revision }), input.comparisonOutcome)
          if (inspection.issues.length > 0) return deny(...inspection.issues)
          const checkpoint: ResearchTaskCheckpoint = { taskRevision: updated.revision, stage: input.stage,
            questionRevision: question.revision, basisDigest: inspection.basisDigest, artifacts: inspection.artifacts,
            sources, summary: input.summary,
            ...(input.comparisonOutcome === undefined ? {} : { comparisonOutcome: input.comparisonOutcome }),
            createdBy: input.author, createdAt: time }
          const checkpointRevisions = [...task.checkpointRevisions.slice(0, view.completedStages.length), updated.revision]
          return this.commit({ ...updated, sources, reason: '', checkpointRevisions, checkpoints: [...task.checkpoints, checkpoint],
            phase: checkpointRevisions.length === stages.length ? 'complete' : 'active' }, checkpointRevisions.length !== stages.length)
        }
        default: return assertNever(input)
      }
    })
  }

  private view(task: ResearchTaskRecord): ResearchTaskView {
    const question = this.question(task)
    const stages = taskStages(task.kind)
    const completedStages: ResearchTaskView['completedStages'][number][] = []
    let issues: readonly string[] = []
    for (const revision of task.checkpointRevisions) {
      const checkpoint = task.checkpoints.find(value => value.taskRevision === revision)
      assert(checkpoint !== undefined)
      const inspection = inspectStage(checkpoint.stage, task.kind, question, task.sources, this.ctx.researchLibrary.list(),
        () => this.ctx.researchReport.render({ questionId: question.id, expectedRevision: question.revision }),
        checkpoint.comparisonOutcome)
      issues = inspection.issues
      if (issues.length === 0 && inspection.basisDigest !== checkpoint.basisDigest) issues = [`The ${checkpoint.stage} inputs changed; reassess that stage.`]
      if (issues.length > 0) break
      completedStages.push(checkpoint.stage)
    }
    const nextStage = stages[completedStages.length] ?? null
    const stale = completedStages.length !== task.checkpointRevisions.length
    if (!stale && nextStage !== null) {
      issues = inspectStage(nextStage, task.kind, question, task.sources, this.ctx.researchLibrary.list(),
        () => this.ctx.researchReport.render({ questionId: question.id, expectedRevision: question.revision })).issues
    }
    return { task: structuredClone(task), questionRevision: question.revision, completedStages, nextStage, stale,
      requiresResume: task.phase === 'active' && !this.activated.has(task.id), issues }
  }

  private question(task: ResearchTaskRecord): ResearchQuestionRecord {
    const question = this.ctx.researchInformation.get(task.questionId)
    if (question === undefined) throw new Error('Research task references an unavailable question')
    return question
  }

  private validate(task: ResearchTaskRecord): void {
    researchTaskSchema.parse(task)
    const question = this.question(task)
    const stages = taskStages(task.kind)
    if (task.sources.length > this.limits.maxSourcesPerTask) throw new Error('Task sources exceed maxSourcesPerTask')
    if (task.checkpoints.length > this.limits.maxCheckpointsPerTask) throw new Error('Task history exceeds maxCheckpointsPerTask')
    if (Buffer.byteLength(JSON.stringify(task)) > this.limits.maxTaskBytes) throw new Error('Task record exceeds maxTaskBytes')
    const texts = [task.reason, task.createdBy.id, task.updatedBy.id,
      ...task.checkpoints.flatMap(value => [value.summary, value.createdBy.id])]
    if (texts.some(value => Array.from(value).length > this.limits.maxTextChars)) throw new Error('Task text exceeds maxTextChars')
    const updatedTime = Date.parse(task.updatedAt)
    if (updatedTime < Date.parse(task.createdAt)) throw new Error('Task update precedes creation')
    let previousRevision = 0
    let previousTime = Date.parse(task.createdAt)
    const ids = {
      evidenceIds: new Set(question.evidence.map(value => value.id)), claimIds: new Set(question.claims.map(value => value.id)),
      claimReviewIds: new Set(question.claimReviews.map(value => value.id)),
      observationIds: new Set(question.observations.map(value => value.id)),
      observationReviewIds: new Set(question.observationReviews.map(value => value.id)),
      comparisonProtocolIds: new Set(question.comparisonProtocols.map(value => value.id)),
      synthesisIds: new Set(question.syntheses.map(value => value.id)),
    }
    for (const checkpoint of task.checkpoints) {
      const checkpointTime = Date.parse(checkpoint.createdAt)
      if (checkpoint.sources.length > this.limits.maxSourcesPerTask) throw new Error('Checkpoint sources exceed maxSourcesPerTask')
      if (checkpoint.taskRevision <= previousRevision || checkpoint.taskRevision > task.revision
        || checkpoint.questionRevision > question.revision || checkpointTime < previousTime || checkpointTime > updatedTime) {
        throw new Error('Task checkpoint chronology is invalid')
      }
      if (!stages.includes(checkpoint.stage) || (checkpoint.stage === 'comparison') !== (checkpoint.comparisonOutcome !== undefined)
        || (checkpoint.stage === 'export') !== (checkpoint.artifacts.reportDigest !== undefined)) {
        throw new Error('Task checkpoint fields do not match its stage')
      }
      const sourceIssues = inspectStage('acquisition', task.kind, question, checkpoint.sources, this.ctx.researchLibrary.list(),
        () => { throw new Error('Acquisition does not render reports') }).issues
      if (sourceIssues.length > 0) throw new Error(`Saved checkpoint sources are invalid: ${sourceIssues.join(' ')}`)
      for (const key of Object.keys(ids) as (keyof typeof ids)[]) {
        const allowed: ReadonlySet<string> = ids[key]
        if (checkpoint.artifacts[key].some(id => !allowed.has(id))) throw new Error(`Task checkpoint references unavailable ${key}`)
      }
      previousRevision = checkpoint.taskRevision
      previousTime = checkpointTime
    }
    if (task.checkpointRevisions.length > stages.length) throw new Error('Task has more checkpoints than workflow stages')
    for (const [index, revision] of task.checkpointRevisions.entries()) {
      const checkpoint = task.checkpoints.find(value => value.taskRevision === revision)
      if (checkpoint === undefined || checkpoint.stage !== stages[index]
        || JSON.stringify(checkpoint.sources) !== JSON.stringify(task.sources)) {
        throw new Error('Task progress is not an ordered prefix over its selected sources')
      }
    }
    if ((task.phase === 'complete') !== (task.checkpointRevisions.length === stages.length)) throw new Error('Task phase disagrees with its saved progress')
  }

  private table(): KvTable<ResearchTaskId, ResearchTaskRecord> {
    if (this.tasks === undefined) throw new Error('Research task storage is unavailable')
    return this.tasks
  }

  private assertOpen(): void {
    if (this.closed) throw new Error('Research task storage is unavailable')
  }

  private async commit(task: ResearchTaskRecord, activate: boolean): Promise<ResearchTaskMutationResult> {
    this.validate(task)
    await this.table().put(task.id, task)
    if (activate) this.activated.add(task.id)
    else this.activated.delete(task.id)
    return { status: 'saved', view: this.view(task) }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    this.assertOpen()
    this.table()
    const result = this.tail.then(operation)
    // The caller retains rejection; the lifecycle tail waits for both successful and failed writes.
    this.tail = result.then(() => {}, () => {})
    return result
  }
}

export default ResearchTasks
