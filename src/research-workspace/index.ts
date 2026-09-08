/** Trusted-client access to the research library, archived PDFs, and reading positions. */

import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { Service, type Context } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { ResearchDocumentId } from '../research-document/types.ts'
import type { ResearchPaperId } from '../research-library/types.ts'
import type {} from '../research-library/index.ts'
import { researchObservationState } from '../research-information/index.ts'
import type {} from '../research-report/index.ts'
import type {} from '../research-task/index.ts'
import type {} from '../research-task-runner/index.ts'
import type { ResearchTaskRunId, ResearchTaskRunResult } from '../research-task-runner/types.ts'
import type { ResearchTaskId, ResearchTaskRecord, ResearchTaskMutationResult } from '../research-task/types.ts'
import type { ResearchReportRequest, ResearchReportResult } from '../research-report/types.ts'
import type { ResearchAuthorId, ResearchQuestionId, ResearchClaimId, ResearchEvidenceId,
  ResearchEvidence, ResearchQuestionRecord, ResearchFacet, ResearchObservationId } from '../research-information/types.ts'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { researchReadingPositionSchema, researchWorkspaceDomainSpec } from './spec.ts'
import type {
  ResearchReadingPosition, ResearchSourceChunk, ResearchWorkspaceCatalog, ResearchWorkspaceDocument,
  ResearchWorkspacePage, SaveResearchReadingPositionResult,
  ResearchWorkspaceEvidenceChoices, ResearchWorkspaceReviewer, ResearchWorkspaceQuestion,
  ResearchWorkspaceQuestions, ResearchWorkspaceClaims,
  ResearchWorkspaceReviews, ResearchWorkspaceReviewRequest, ResearchWorkspaceReviewResult,
  ResearchWorkspaceNotes, ResearchWorkspaceNoteRequest, ResearchWorkspaceNoteResult,
  ResearchWorkspaceClaimFilter, ResearchWorkspaceMatrix, ResearchWorkspaceMatrixRow,
  ResearchWorkspaceObservation, ResearchWorkspaceObservations, ResearchWorkspaceObservationReviews,
  ResearchWorkspaceObservationChoice, ResearchWorkspaceObservationChoices,
  ResearchWorkspaceObservationReviewRequest, ResearchWorkspaceObservationReviewResult,
  ResearchWorkspaceTask, ResearchWorkspaceTasks, ResearchWorkspaceTaskProgress, ResearchWorkspaceTaskHistory,
  ResearchWorkspaceTaskSources, ResearchWorkspaceTaskCreateRequest, ResearchWorkspaceTaskUpdateRequest,
  ResearchWorkspaceTaskMutationResult, ResearchWorkspaceTaskRuns, ResearchWorkspaceTaskRunResult,
} from './types.ts'

export type * from './types.ts'
export { researchWorkspaceDomainSpec, researchReadingPositionSchema } from './spec.ts'

/** Workspace response and persistence capacity policy. */
export interface Config {
  /** Maximum catalog entries or extracted blocks per response. Defaults to 100. */
  readonly maxItems?: number
  /** Maximum Unicode code points per extracted text preview. Defaults to 2000. */
  readonly maxTextChars?: number
  /** Maximum raw PDF bytes per source response. Defaults to 262144. */
  readonly sourceChunkBytes?: number
  /** Maximum complete JSON response size. Defaults to 2097152. */
  readonly maxResponseBytes?: number
  /** Maximum saved document positions. Defaults to 1000. */
  readonly maxPositions?: number
  /** Maximum local declared reviewer profiles. Defaults to 100. */
  readonly maxReviewers?: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    researchWorkspace: ResearchWorkspace
  }
}

/** Profile-local workspace API; it neither creates Agents nor writes model-visible content. */
export class ResearchWorkspace extends TypertRemoteService {
  static inject = ['researchLibrary', 'researchDocuments', 'researchInformation', 'researchReport', 'researchTasks', 'storageDomain']

  /** Loader defaults for response and saved-position bounds. */
  static Config: s<Config> = s.object({
    maxItems: s.number().step(1).min(1).default(100),
    maxTextChars: s.number().step(1).min(1).default(2000),
    sourceChunkBytes: s.number().step(1).min(1).default(262144),
    maxResponseBytes: s.number().step(1).min(1).default(2097152),
    maxPositions: s.number().step(1).min(1).default(1000),
    maxReviewers: s.number().step(1).min(1).default(100),
  })

  private readonly limits: Required<Config>
  private positions?: KvTable<ResearchDocumentId, ResearchReadingPosition>
  private reviewerTable?: KvTable<ResearchAuthorId, ResearchWorkspaceReviewer>
  private tail: Promise<void> = Promise.resolve()
  private closed = false

  /**
   * @param ctx - host context with library, document archive, and domain storage.
   * @param config - workspace response and persistence limits.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'researchWorkspace')
    this.limits = {
      maxItems: config.maxItems ?? 100, maxTextChars: config.maxTextChars ?? 2000,
      sourceChunkBytes: config.sourceChunkBytes ?? 262144, maxResponseBytes: config.maxResponseBytes ?? 2097152,
      maxPositions: config.maxPositions ?? 1000, maxReviewers: config.maxReviewers ?? 100,
    }
    for (const [key, value] of Object.entries(this.limits)) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${key} must be a positive safe integer`)
    }
  }

  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(researchWorkspaceDomainSpec)
    this.ctx.effect(() => async () => {
      this.closed = true
      await this.tail
      await domain.close()
    }, 'research-workspace.domain')
    this.reviewerTable = domain.table('reviewers')
    if (this.reviewerTable.size > this.limits.maxReviewers) throw new Error('Local reviewers exceed maxReviewers')
    for (const [id, reviewer] of this.reviewerTable.entries()) {
      if (id !== reviewer.id || reviewer.displayName.trim() !== reviewer.displayName
        || Array.from(reviewer.displayName).length > this.limits.maxTextChars) {
        throw new Error('Stored reviewer identity is not canonical or exceeds maxTextChars')
      }
    }
    this.positions = domain.table('positions')
    if (this.positions.size > this.limits.maxPositions) throw new Error('Saved reading positions exceed maxPositions')
    for (const [id, position] of this.positions.entries()) {
      if (id !== position.documentId) throw new Error('Reading-position key does not match its document')
      const document = await this.restore(position)
      if (position.pageIndex >= document.pageCount) throw new Error('Saved reading position exceeds its archived page count')
    }
  }

  /**
   * Browse registered papers in library order without changing identities.
   * @param query - case-insensitive title or author substring; empty selects every paper.
   * @param offset - zero-based position after filtering.
   * @returns a bounded catalog page with a continuation offset.
   */
  @Remote('list')
  list(query: string, offset: number): ResearchWorkspaceCatalog {
    nonNegative('offset', offset)
    if (query.length > this.limits.maxTextChars) throw new Error('Catalog query exceeds maxTextChars')
    const normalized = query.trim().toLowerCase()
    const papers = this.ctx.researchLibrary.list().filter(paper =>
      [paper.metadata.title.value, ...(paper.metadata.authors?.value ?? [])].some(value => value.toLowerCase().includes(normalized)))
    if (offset > papers.length) throw new Error('Catalog offset exceeds the filtered paper count')
    const candidates = papers.slice(offset, offset + this.limits.maxItems).map(paper => ({
      id: paper.id, title: paper.metadata.title.value, authors: [...(paper.metadata.authors?.value ?? [])],
      year: paper.metadata.year?.value ?? null,
      sources: paper.sourceVersions.map(source => ({
        id: source.id, documentId: source.documentId,
        parsers: source.observations.map(parser => ({ id: parser.parserId, version: parser.parserVersion })),
      })),
    }))
    for (;;) {
      const next = offset + candidates.length
      const result = { papers: candidates, total: papers.length, nextOffset: next < papers.length ? next : null }
      if (this.fits(result)) return result
      if (candidates.length <= 1) throw new Error('One catalog entry exceeds maxResponseBytes')
      candidates.pop()
    }
  }

  /**
   * Read exact archived PDF bytes through the trusted Remote carrier.
   * @param documentId - registered source content id.
   * @param offset - zero-based raw byte offset; repeat nextOffset until null.
   * @returns an encoded chunk whose identity and total refer to the complete source.
   */
  @Remote('source')
  async source(documentId: ResearchDocumentId, offset: number): Promise<ResearchSourceChunk> {
    this.requireSource(documentId)
    nonNegative('offset', offset)
    const bytes = await this.ctx.researchDocuments.source(documentId)
    if (offset > bytes.length) throw new Error('Source offset exceeds the archived byte count')
    const end = Math.min(bytes.length, offset + this.limits.sourceChunkBytes)
    return this.bounded({ documentId, offset, totalBytes: bytes.length,
      base64: Buffer.from(bytes.subarray(offset, end)).toString('base64'), nextOffset: end < bytes.length ? end : null })
  }

  /**
   * Read located text previews for one physical page of a selected parser revision.
   * @param document - exact registered source and parser revision.
   * @param pageIndex - zero-based physical page.
   * @param offset - zero-based block offset within that page.
   * @returns bounded text previews and geometry; clipped text is explicitly marked.
   */
  @Remote('page')
  async page(document: ResearchWorkspaceDocument, pageIndex: number, offset: number): Promise<ResearchWorkspacePage> {
    const parsed = await this.restore(document)
    nonNegative('pageIndex', pageIndex)
    nonNegative('offset', offset)
    const page = parsed.pages[pageIndex]
    if (page === undefined) throw new Error('Page does not exist in the selected extraction')
    if (offset > page.blocks.length) throw new Error('Block offset exceeds the page block count')
    const blocks = page.blocks.slice(offset, offset + this.limits.maxItems).map((block) => {
      const chars = Array.from(block.text)
      return { id: block.id, text: chars.slice(0, this.limits.maxTextChars).join(''),
        textTruncated: chars.length > this.limits.maxTextChars, bbox: { ...block.locator.bbox },
        structureKind: block.structure?.kind ?? null }
    })
    for (;;) {
      const end = offset + blocks.length
      const result = { ...document, pageIndex, pageCount: parsed.pageCount, blocks, nextOffset: end < page.blocks.length ? end : null }
      if (this.fits(result)) return result
      if (blocks.length <= 1) throw new Error('One extracted block exceeds maxResponseBytes')
      blocks.pop()
    }
  }

  /**
   * Read the profile-local last explicit page selection.
   * @param documentId - registered source content id.
   * @returns saved position or null; callers restore its exact parser revision.
   */
  @Remote('position')
  position(documentId: ResearchDocumentId): ResearchReadingPosition | null {
    this.requireSource(documentId)
    return this.bounded(this.table().get(documentId) ?? null)
  }

  /**
   * Save an explicit page selection after validating source, parser, and page ownership.
   * @param document - selected source and registered parser revision.
   * @param pageIndex - zero-based physical page.
   * @param expectedRevision - last observed revision, or zero for a first position.
   * @returns committed position, or the newer position on conflict without a write.
   */
  @Remote('savePosition')
  savePosition(
    document: ResearchWorkspaceDocument, pageIndex: number, expectedRevision: number,
  ): Promise<SaveResearchReadingPositionResult> {
    if (this.closed) return Promise.reject(new Error('Research workspace is closed'))
    nonNegative('expectedRevision', expectedRevision)
    nonNegative('pageIndex', pageIndex)
    const operation = this.tail.then(async (): Promise<SaveResearchReadingPositionResult> => {
      const parsed = await this.restore(document)
      if (pageIndex >= parsed.pageCount) throw new Error('Cannot save a page outside the selected extraction')
      const table = this.table()
      const current = table.get(document.documentId) ?? null
      if ((current?.revision ?? 0) !== expectedRevision) return this.bounded({ status: 'conflict', position: current })
      if (current === null && table.size >= this.limits.maxPositions) throw new Error('Saved reading positions exceed maxPositions')
      const position = researchReadingPositionSchema.parse({ ...document, pageIndex, revision: expectedRevision + 1 })
      const result = this.bounded({ status: 'saved' as const, position })
      await table.put(position.documentId, position)
      return result
    })
    this.tail = operation.then(() => undefined, () => undefined)
    return operation
  }

  /**
   * List locally declared identities; selecting one does not authenticate a remote person.
   * @returns registered reviewer names and host-generated ids.
   */
  @Remote('reviewers')
  reviewers(): readonly ResearchWorkspaceReviewer[] {
    return this.bounded([...this.reviewersTable().entries()].map(([, value]) => value))
  }

  /**
   * Register a distinct local reviewer through the trusted browser carrier.
   * @param displayName - nonempty local display name; duplicate names remain separate identities.
   * @returns the durable identity after its commit.
   */
  @Remote('registerReviewer')
  registerReviewer(displayName: string): Promise<ResearchWorkspaceReviewer> {
    if (this.closed) return Promise.reject(new Error('Research workspace is closed'))
    const name = displayName.trim()
    if (!name || Array.from(name).length > this.limits.maxTextChars) {
      return Promise.reject(new Error('Reviewer name is empty or exceeds maxTextChars'))
    }
    const operation = this.tail.then(async () => {
      const table = this.reviewersTable()
      if (table.size >= this.limits.maxReviewers) throw new Error('Local reviewers exceed maxReviewers')
      const reviewer = this.bounded({ id: randomUUID() as ResearchAuthorId, displayName: name })
      this.bounded([...[...table.entries()].map(([, value]) => value), reviewer])
      await table.put(reviewer.id, reviewer)
      return reviewer
    })
    this.tail = operation.then(() => undefined, () => undefined)
    return operation
  }

  /**
   * Browse research questions without exposing complete evidence aggregates.
   * @param offset - zero-based question offset.
   * @returns an exact-text, bounded selection page.
   */
  @Remote('questions')
  questions(offset: number): ResearchWorkspaceQuestions {
    const values = this.ctx.researchInformation.list().map(questionSummary)
    return this.pageItems(values, offset, (questions, nextOffset) => ({ questions, nextOffset }))
  }

  /**
   * Create a research question with explicit local researcher authorship.
   * @param reviewerId - registered local identity selected by the user.
   * @param title - question label.
   * @param question - research question text, locked once scientific records are attached.
   * @returns the committed question summary; validation and capacity failures create no question.
   */
  @Remote('createQuestion')
  createQuestion(reviewerId: ResearchAuthorId, title: string, question: string): Promise<ResearchWorkspaceQuestion> {
    const author = this.taskAuthor(reviewerId)
    this.bounded({ id: '0'.repeat(36), title, question, revision: 0, claimCount: 0 })
    const operation = this.ctx.researchInformation.writeQuestion({ action: 'create', title, question, author }).then((result) => {
      if (result.status !== 'created') throw new Error(`Research question creation refused: ${result.status}`)
      return questionSummary(result.question)
    })
    return this.trackTaskWrite(operation)
  }

  /**
   * List saved tasks for the selected research question.
   * @param questionId - question owning the tasks.
   * @param offset - zero-based task continuation offset.
   * @returns bounded task summaries; saved complete phases can have stale scientific inputs.
   */
  @Remote('tasks')
  tasks(questionId: ResearchQuestionId, offset: number): ResearchWorkspaceTasks {
    const question = questionSummary(this.question(questionId))
    const values = this.ctx.researchTasks.list().filter(task => task.questionId === questionId).map(taskSummary)
    return this.pageItems(values, offset, (tasks, nextOffset) => ({ question, tasks, nextOffset }))
  }

  /**
   * Inspect the earliest unfinished stage against current scientific records.
   * @param taskId - selected task.
   * @param offset - zero-based requirement-message continuation offset.
   * @returns exact requirements and current task/question revisions; reads never activate a task.
   */
  @Remote('task')
  task(taskId: ResearchTaskId, offset: number): ResearchWorkspaceTaskProgress {
    const view = this.ctx.researchTasks.get(taskId)
    if (view === undefined) throw new Error('Research task not found')
    return this.pageItems(view.issues, offset, (issues, nextOffset) => ({ task: taskSummary(view.task),
      questionRevision: view.questionRevision, completedStages: view.completedStages, nextStage: view.nextStage,
      stale: view.stale, requiresResume: view.requiresResume, issues, nextOffset }))
  }

  /**
   * Inspect checkpoint history without embedding large source and artifact collections.
   * @param taskId - selected task.
   * @param expectedRevision - task revision inspected by the client.
   * @param offset - zero-based historical checkpoint offset.
   * @returns complete checkpoint summaries at the pinned revision; changed tasks require refresh.
   */
  @Remote('taskHistory')
  taskHistory(taskId: ResearchTaskId, expectedRevision: number, offset: number): ResearchWorkspaceTaskHistory {
    const task = this.inspectedTask(taskId, expectedRevision)
    const values = task.checkpoints.map(checkpoint => ({ taskRevision: checkpoint.taskRevision, stage: checkpoint.stage,
      summary: checkpoint.summary, createdBy: checkpoint.createdBy, createdAt: checkpoint.createdAt,
      ...(checkpoint.comparisonOutcome === undefined ? {} : { comparisonOutcome: checkpoint.comparisonOutcome }),
      effective: task.checkpointRevisions.includes(checkpoint.taskRevision), sourceCount: checkpoint.sources.length,
      artifactCount: Object.values(checkpoint.artifacts).reduce((count: number, value) =>
        count + (Array.isArray(value) ? value.length : 1), 0) }))
    return this.pageItems(values, offset, (checkpoints, nextOffset) => ({ taskRevision: task.revision, checkpoints, nextOffset }))
  }

  /**
   * Read exact current or historical source selections and their registered parser choices.
   * @param taskId - selected task.
   * @param expectedRevision - task revision inspected by the client.
   * @param checkpointRevision - historical checkpoint revision, or null for current selected sources.
   * @param offset - zero-based source continuation offset.
   * @returns complete source entries at the pinned task revision; bibliographic titles are current.
   */
  @Remote('taskSources')
  taskSources(taskId: ResearchTaskId, expectedRevision: number,
    checkpointRevision: number | null, offset: number): ResearchWorkspaceTaskSources {
    const task = this.inspectedTask(taskId, expectedRevision)
    const checkpoint = checkpointRevision === null ? undefined : task.checkpoints.find(value => value.taskRevision === checkpointRevision)
    if (checkpointRevision !== null && checkpoint === undefined) throw new Error('Research task checkpoint not found')
    const values = (checkpoint?.sources ?? task.sources).map((selected) => {
      const paper = this.ctx.researchLibrary.get(selected.paperId)
      assert(paper !== undefined)
      const source = paper.sourceVersions.find(value => value.id === selected.sourceVersionId)
      assert(source !== undefined)
      return { paperId: paper.id, title: paper.metadata.title.value, source: { id: source.id, documentId: source.documentId,
        parsers: source.observations.map(parser => ({ id: parser.parserId, version: parser.parserVersion })) } }
    })
    return this.pageItems(values, offset, (sources, nextOffset) => ({ taskRevision: task.revision, sources, nextOffset }))
  }

  /**
   * Create a task for an existing question under the selected researcher identity.
   * @param reviewerId - explicitly selected registered local identity.
   * @param request - existing question and workflow kind.
   * @returns a compact committed receipt or refusal; response capacity is checked before writing.
   */
  @Remote('createTask')
  createTask(reviewerId: ResearchAuthorId, request: ResearchWorkspaceTaskCreateRequest): Promise<ResearchWorkspaceTaskMutationResult> {
    const author = this.taskAuthor(reviewerId)
    this.bounded({ status: 'saved', taskId: '0'.repeat(36), revision: Number.MAX_SAFE_INTEGER })
    return this.trackTaskWrite(this.ctx.researchTasks.create({ ...request, author }).then(result => this.taskReceipt(result)))
  }

  /**
   * Save explicit task progress without scheduling model work or fabricating scientific records.
   * @param reviewerId - explicitly selected registered local identity.
   * @param request - inspected task/question revisions and authored action fields.
   * @returns a compact committed receipt or complete refusal; accepted writes drain on unload.
   */
  @Remote('updateTask')
  updateTask(reviewerId: ResearchAuthorId, request: ResearchWorkspaceTaskUpdateRequest): Promise<ResearchWorkspaceTaskMutationResult> {
    const author = this.taskAuthor(reviewerId)
    this.bounded({ status: 'saved', taskId: '0'.repeat(36), revision: Number.MAX_SAFE_INTEGER })
    return this.trackTaskWrite(this.ctx.researchTasks.update({ ...request, author }).then(result => this.taskReceipt(result)))
  }

  /**
   * Read execution history without starting or recovering an agent.
   * @param taskId - selected task whose attempts are requested.
   * @param offset - zero-based execution offset.
   * @returns complete paged attempts, or explicit unavailability when no executor is mounted.
   */
  @Remote('taskRuns')
  taskRuns(taskId: ResearchTaskId, offset: number): ResearchWorkspaceTaskRuns {
    const runner = this.ctx.get('researchTaskRuns')
    if (runner === undefined) return this.bounded({ status: 'unavailable' })
    if (this.ctx.researchTasks.get(taskId) === undefined) throw new Error('Research task not found')
    return this.pageItems(runner.list(taskId), offset, (runs, nextOffset) => ({ status: 'available', runs, nextOffset }))
  }

  /**
   * Start a separate logged execution from inspected task progress.
   * @param reviewerId - explicitly selected registered local identity.
   * @param taskId - task with confirmed exact sources.
   * @param expectedRevision - task revision the researcher inspected.
   * @returns a compact durable receipt or refusal; the receipt does not imply model completion.
   */
  @Remote('startTaskRun')
  startTaskRun(reviewerId: ResearchAuthorId, taskId: ResearchTaskId, expectedRevision: number): Promise<ResearchWorkspaceTaskRunResult> {
    const author = this.taskAuthor(reviewerId)
    const runner = this.ctx.get('researchTaskRuns')
    if (runner === undefined) throw new Error('Research task execution is not configured')
    this.bounded({ status: 'saved', runId: '0'.repeat(36) })
    return this.trackTaskWrite(runner.start({ taskId, expectedRevision, author }).then(result => this.runReceipt(result)))
  }

  /**
   * Stop an exact attempt and wait for its owned work to settle.
   * @param reviewerId - explicitly selected registered local identity.
   * @param runId - exact execution, preventing cancellation of a newer attempt.
   * @returns a compact persisted receipt or refusal; read history for the terminal assessment.
   */
  @Remote('stopTaskRun')
  stopTaskRun(reviewerId: ResearchAuthorId, runId: ResearchTaskRunId): Promise<ResearchWorkspaceTaskRunResult> {
    const author = this.taskAuthor(reviewerId)
    const runner = this.ctx.get('researchTaskRuns')
    if (runner === undefined) throw new Error('Research task execution is not configured')
    this.bounded({ status: 'saved', runId: '0'.repeat(36) })
    return this.trackTaskWrite(runner.stop({ runId, author }).then(result => this.runReceipt(result)))
  }

  private runReceipt(result: ResearchTaskRunResult): ResearchWorkspaceTaskRunResult {
    return this.bounded(result.status === 'saved' ? { status: 'saved', runId: result.run.record.id } : result)
  }

  /**
   * Read claim candidates and latest explicit researcher decisions.
   * @param questionId - selected question.
   * @param offset - zero-based claim offset, including historical claims.
   * @param filter - optional matrix cell; selects only current source statements for its paper and facet.
   * @returns exact claim text, activity, and the current question revision.
   */
  @Remote('claims')
  claims(questionId: ResearchQuestionId, offset: number, filter?: ResearchWorkspaceClaimFilter): ResearchWorkspaceClaims {
    const question = this.question(questionId)
    const papers = new Map(question.evidence.map(value => [value.id, value.paperId]))
    const values = projectClaims(question).filter(value => filter === undefined || (value.active
      && value.claim.kind === 'source-statement' && value.claim.facet === filter.facet
      && value.claim.evidenceLinks.some(link => papers.get(link.evidenceId) === filter.paperId)))
    return this.pageItems(values, offset, (claims, nextOffset) => ({ question: questionSummary(question), claims, nextOffset }))
  }

  /**
   * Read immutable notes, including superseded versions, without clipping their text.
   * @param questionId - question owning the notes.
   * @param offset - zero-based note offset in durable insertion order.
   * @returns exact notes and their current activity at the returned question revision.
   */
  @Remote('notes')
  notes(questionId: ResearchQuestionId, offset: number): ResearchWorkspaceNotes {
    const question = this.question(questionId)
    const replaced = new Set(question.readingNotes.flatMap(note => note.supersedes === undefined ? [] : [note.supersedes]))
    const values = question.readingNotes.map(note => ({ note, active: !replaced.has(note.id) }))
    return this.pageItems(values, offset, (notes, nextOffset) => ({ question: questionSummary(question), notes, nextOffset }))
  }

  /**
   * Append a researcher note or revision using the existing evidence and supersession rules.
   * @param reviewerId - explicitly selected local identity.
   * @param request - exact question revision, evidence, note text, and optional predecessor.
   * @returns committed revision or a refusal; the author is derived from the registered identity.
   */
  @Remote('writeNote')
  writeNote(reviewerId: ResearchAuthorId, request: ResearchWorkspaceNoteRequest): Promise<ResearchWorkspaceNoteResult> {
    if (this.closed) return Promise.reject(new Error('Research workspace is closed'))
    const reviewer = this.reviewersTable().get(reviewerId)
    if (reviewer === undefined) return Promise.reject(new Error('Select a registered local reviewer'))
    this.bounded({ status: 'created', revision: Number.MAX_SAFE_INTEGER })
    const operation = this.ctx.researchInformation.writeReadingNote({ ...request, author: { kind: 'researcher', id: reviewer.id } })
      .then((result): ResearchWorkspaceNoteResult => result.status === 'created'
        ? { status: 'created', revision: result.question.revision } : this.bounded(result))
    const previous = this.tail
    this.tail = Promise.allSettled([previous, operation]).then(() => undefined)
    return operation
  }

  /**
   * Summarize captured source-statement coverage without treating inference as source content.
   * @param questionId - selected research question.
   * @param offset - zero-based paper offset in first-evidence order.
   * @returns bounded paper rows, independent review counts, and the count of excluded current inferences.
   */
  @Remote('matrix')
  matrix(questionId: ResearchQuestionId, offset: number): ResearchWorkspaceMatrix {
    const question = this.question(questionId)
    const evidencePapers = new Map(question.evidence.map(value => [value.id, value.paperId]))
    const rows = new Map<ResearchPaperId, ResearchWorkspaceMatrixRow>()
    for (const paperId of evidencePapers.values()) {
      if (rows.has(paperId)) continue
      const paper = this.ctx.researchLibrary.get(paperId)
      if (paper === undefined) throw new Error('Captured evidence references an unavailable paper')
      rows.set(paperId, { paperId, title: paper.metadata.title.value, cells: [] })
    }
    const counts = new Map<string, { facet: ResearchFacet; total: number; accepted: number; rejected: number; unreviewed: number }>()
    let excludedInferenceCount = 0
    for (const value of projectClaims(question)) {
      if (!value.active) continue
      if (value.claim.kind === 'inference') { excludedInferenceCount++; continue }
      const first = value.claim.evidenceLinks[0]
      assert(first !== undefined, 'Source statement must reference captured evidence')
      const paperId = evidencePapers.get(first.evidenceId)
      assert(paperId !== undefined, 'Source statement must reference a captured paper')
      const key = `${paperId}:${value.claim.facet}`
      let cell = counts.get(key)
      if (cell === undefined) {
        cell = { facet: value.claim.facet, total: 0, accepted: 0, rejected: 0, unreviewed: 0 }
        counts.set(key, cell)
      }
      cell.total++
      if (value.latestReview === null) cell.unreviewed++
      else if (value.latestReview.decision === 'rejected') cell.rejected++
      else cell.accepted++
    }
    const values = [...rows.values()].map(row => ({ ...row, cells: facets.map(facet =>
      counts.get(`${row.paperId}:${facet}`) ?? { facet, total: 0, accepted: 0, rejected: 0, unreviewed: 0 }) }))
    return this.pageItems(values, offset, (rows, nextOffset) => ({
      question: questionSummary(question), rows, excludedInferenceCount, nextOffset,
    }))
  }

  /**
   * Browse captured evidence for claim revision and counterevidence selection.
   * @param questionId - question owning the evidence.
   * @param offset - zero-based evidence offset.
   * @returns located previews, with clipping explicitly marked and complete blocks separately available.
   */
  @Remote('evidenceChoices')
  evidenceChoices(questionId: ResearchQuestionId, offset: number): ResearchWorkspaceEvidenceChoices {
    const values = this.question(questionId).evidence.map((value) => {
      const text = Array.from(value.selection?.text ?? value.blockText)
      return { id: value.id, pageIndex: value.locator.pageIndex,
        excerpt: text.slice(0, this.limits.maxTextChars).join(''), excerptTruncated: text.length > this.limits.maxTextChars }
    })
    return this.pageItems(values, offset, (evidence, nextOffset) => ({ evidence, nextOffset }))
  }

  /**
   * Read a captured source block without preview truncation.
   * @param questionId - question owning the evidence.
   * @param evidenceId - exact evidence selected from a claim or review.
   * @returns complete evidence with source and parser locators; oversize responses fail explicitly.
   */
  @Remote('evidence')
  evidence(questionId: ResearchQuestionId, evidenceId: ResearchEvidenceId): ResearchEvidence {
    const evidence = this.question(questionId).evidence.find(value => value.id === evidenceId)
    if (evidence === undefined) throw new Error('Evidence does not belong to the selected question')
    return this.bounded(evidence)
  }

  /**
   * Read immutable review history in committed revision order.
   * @param questionId - question owning the claim.
   * @param claimId - original or replacement claim whose assessments are requested.
   * @param offset - zero-based review offset.
   * @returns a bounded history page with exact reasons and counterevidence references.
   */
  @Remote('reviews')
  reviews(questionId: ResearchQuestionId, claimId: ResearchClaimId, offset: number): ResearchWorkspaceReviews {
    const question = this.question(questionId)
    if (!question.claims.some(value => value.id === claimId)) throw new Error('Claim does not belong to the selected question')
    const values = question.claimReviews.filter(value => value.claimId === claimId
      || (value.decision === 'revised' && value.replacementClaimId === claimId))
    return this.pageItems(values, offset, (reviews, nextOffset) => ({ reviews, nextOffset }))
  }

  /**
   * Submit a researcher decision through the trusted browser carrier.
   * @param reviewerId - identity registered by the local workspace.
   * @param request - question revision, assessment, and optional replacement; no author fields.
   * @returns committed revision or explicit refusal; agent tools cannot supply a researcher author here.
   */
  @Remote('reviewClaim')
  reviewClaim(reviewerId: ResearchAuthorId, request: ResearchWorkspaceReviewRequest): Promise<ResearchWorkspaceReviewResult> {
    if (this.closed) return Promise.reject(new Error('Research workspace is closed'))
    const reviewer = this.reviewersTable().get(reviewerId)
    if (reviewer === undefined) return Promise.reject(new Error('Select a registered local reviewer'))
    this.bounded({ status: 'created', revision: Number.MAX_SAFE_INTEGER })
    const operation = this.ctx.researchInformation.reviewClaim({ ...request, author: { kind: 'researcher', id: reviewer.id } })
      .then((result): ResearchWorkspaceReviewResult => result.status === 'created'
        ? { status: 'created', revision: result.question.revision } : this.bounded(result))
    const previous = this.tail
    this.tail = Promise.allSettled([previous, operation]).then(() => undefined)
    return operation
  }

  /**
   * Read complete normalized results with source names and current review state.
   * @param questionId - research question owning the observations.
   * @param offset - zero-based observation offset.
   * @returns complete bounded records, including superseded and rejected results for audit.
   */
  @Remote('observations')
  observations(questionId: ResearchQuestionId, offset: number): ResearchWorkspaceObservations {
    const question = this.question(questionId)
    const records: ResearchWorkspaceObservation[] = question.observations.map((observation) => {
      const result = question.claims.find(value => value.id === observation.resultClaimId)
      const source = question.evidence.find(value => value.id === result?.evidenceLinks[0]?.evidenceId)
      if (source === undefined) throw new Error('Observation result lacks source evidence')
      const paper = this.ctx.researchLibrary.get(source.paperId)
      if (paper === undefined) throw new Error('Observation source paper is unavailable')
      const entityName = (id: typeof observation.method.entityId): string => {
        const entity = question.entities.find(value => value.id === id)
        if (entity === undefined) throw new Error('Observation entity is unavailable')
        return entity.canonicalName
      }
      const claims = new Set([observation.resultClaimId, observation.method.sourceClaimId,
        observation.dataset.sourceClaimId, observation.metric.sourceClaimId,
        ...(observation.dataset.split.status === 'reported' ? [observation.dataset.split.sourceClaimId] : []),
        ...(observation.evaluationProtocol.status === 'reported' ? [observation.evaluationProtocol.sourceClaimId] : []),
        ...(observation.conditions.status === 'reported' ? observation.conditions.values.map(value => value.sourceClaimId) : [])])
      return { observation, state: researchObservationState(question, observation), paperId: source.paperId,
        paperTitle: paper.metadata.title.value, methodName: entityName(observation.method.entityId),
        datasetName: entityName(observation.dataset.entityId), metricName: entityName(observation.metric.entityId),
        evidenceIds: [...new Set(question.claims.filter(value => claims.has(value.id)).flatMap(value =>
          value.evidenceLinks.map(link => link.evidenceId)))] }
    })
    return this.pageItems(records, offset, (observations, nextOffset) => ({ question: questionSummary(question),
      observations, nextOffset }))
  }

  /**
   * Read complete current source choices for revising a paper-local result.
   * @param questionId - question owning the result.
   * @param observationId - result whose paper limits available source claims.
   * @param offset - continuation offset across claims followed by entities.
   * @returns bounded choices and the question revision required for consistent continuation.
   */
  @Remote('observationChoices')
  observationChoices(questionId: ResearchQuestionId,
    observationId: ResearchObservationId, offset: number): ResearchWorkspaceObservationChoices {
    const question = this.question(questionId)
    const observation = question.observations.find(value => value.id === observationId)
    if (observation === undefined) throw new Error('Observation does not belong to the selected question')
    const result = question.claims.find(value => value.id === observation.resultClaimId)
    const paperId = question.evidence.find(value => value.id === result?.evidenceLinks[0]?.evidenceId)?.paperId
    assert(paperId !== undefined, 'Observation requires a source paper')
    const retiredClaims = new Set(question.claims.flatMap(value => value.supersedes === undefined ? [] : [value.supersedes]))
    const retiredEntities = new Set(question.entities.flatMap(value => value.supersedes))
    const evidenceIds = new Set(question.evidence.filter(value => value.paperId === paperId).map(value => value.id))
    const claims = question.claims.filter(value => value.kind === 'source-statement' && !retiredClaims.has(value.id)
      && value.evidenceLinks.some(link => evidenceIds.has(link.evidenceId)))
    const claimIds = new Set(claims.map(value => value.id))
    const choices: ResearchWorkspaceObservationChoice[] = [
      ...claims.map(claim => ({ kind: 'claim' as const, claim })),
      ...question.entities.filter(value => !retiredEntities.has(value.id)
        && value.sourceClaimIds.every(id => !retiredClaims.has(id)) && value.sourceClaimIds.some(id => claimIds.has(id)))
        .map(entity => ({ kind: 'entity' as const, entity })),
    ]
    return this.pageItems(choices, offset, (items, nextOffset) => ({ questionRevision: question.revision, choices: items, nextOffset }))
  }

  /**
   * Read exact observation decision history, including the decision that created a replacement.
   * @param questionId - question owning the observation.
   * @param observationId - original or replacement observation.
   * @param offset - zero-based decision offset.
   * @returns bounded, ordered decisions with complete reasons and counterevidence references.
   */
  @Remote('observationReviews')
  observationReviews(questionId: ResearchQuestionId,
    observationId: ResearchObservationId, offset: number): ResearchWorkspaceObservationReviews {
    const question = this.question(questionId)
    if (!question.observations.some(value => value.id === observationId)) throw new Error('Observation does not belong to the selected question')
    const values = question.observationReviews.filter(value => value.observationId === observationId
      || (value.decision === 'revised' && value.replacementObservationId === observationId))
    return this.pageItems(values, offset, (reviews, nextOffset) => ({ reviews, nextOffset }))
  }

  /**
   * Assess a result under a registered local researcher identity.
   * @param reviewerId - identity explicitly selected in the browser.
   * @param request - inspected question revision, decision, and optional complete replacement.
   * @returns committed revision or an explicit refusal; unload waits for admitted writes.
   */
  @Remote('reviewObservation')
  reviewObservation(reviewerId: ResearchAuthorId,
    request: ResearchWorkspaceObservationReviewRequest): Promise<ResearchWorkspaceObservationReviewResult> {
    if (this.closed) return Promise.reject(new Error('Research workspace is closed'))
    const reviewer = this.reviewersTable().get(reviewerId)
    if (reviewer === undefined) return Promise.reject(new Error('Select a registered local reviewer'))
    this.bounded({ status: 'created', revision: Number.MAX_SAFE_INTEGER })
    const operation = this.ctx.researchInformation.reviewObservation({ ...request, author: { kind: 'researcher', id: reviewer.id } })
      .then((result): ResearchWorkspaceObservationReviewResult => result.status === 'created'
        ? { status: 'created', revision: result.question.revision } : this.bounded(result))
    const previous = this.tail
    this.tail = Promise.allSettled([previous, operation]).then(() => undefined)
    return operation
  }

  /**
   * Export the inspected question as a report draft and complete audit/citation files.
   * @param request - question id and the revision the researcher inspected.
   * @returns complete files or a non-writing refusal; the workspace response bound applies to the whole result.
   */
  @Remote('report')
  report(request: ResearchReportRequest): ResearchReportResult {
    return this.bounded(this.ctx.researchReport.render(request))
  }

  private reviewersTable() {
    if (this.reviewerTable === undefined) throw new Error('Research workspace storage is not ready')
    return this.reviewerTable
  }

  private taskAuthor(reviewerId: ResearchAuthorId) {
    if (this.closed) throw new Error('Research workspace is closed')
    const reviewer = this.reviewersTable().get(reviewerId)
    if (reviewer === undefined) throw new Error('Select a registered local reviewer')
    return { kind: 'researcher' as const, id: reviewer.id }
  }

  private inspectedTask(taskId: ResearchTaskId, expectedRevision: number): ResearchTaskRecord {
    nonNegative('expectedRevision', expectedRevision)
    const view = this.ctx.researchTasks.get(taskId)
    if (view === undefined) throw new Error('Research task not found')
    if (view.task.revision !== expectedRevision) throw new Error('Research task changed; refresh before continuing')
    return view.task
  }

  private taskReceipt(result: ResearchTaskMutationResult): ResearchWorkspaceTaskMutationResult {
    if (result.status === 'saved') return { status: 'saved', taskId: result.view.task.id, revision: result.view.task.revision }
    if (result.status === 'cannot-advance') return this.bounded({ status: result.status, issues: result.issues })
    return this.bounded(result)
  }

  private trackTaskWrite<T>(operation: Promise<T>): Promise<T> {
    const previous = this.tail
    this.tail = Promise.allSettled([previous, operation]).then(() => undefined)
    return operation
  }

  private question(id: ResearchQuestionId): ResearchQuestionRecord {
    const question = this.ctx.researchInformation.get(id)
    if (question === undefined) throw new Error('Research question not found')
    return question
  }

  private pageItems<T, R>(values: readonly T[], offset: number, wrap: (items: T[], nextOffset: number | null) => R): R {
    nonNegative('offset', offset)
    if (offset > values.length) throw new Error('Offset exceeds available records')
    const items = values.slice(offset, offset + this.limits.maxItems)
    for (;;) {
      const next = offset + items.length
      const result = wrap(items, next < values.length ? next : null)
      if (this.fits(result)) return result
      if (items.length <= 1) throw new Error('One research record exceeds maxResponseBytes')
      items.pop()
    }
  }

  private requireSource(documentId: ResearchDocumentId) {
    const source = this.ctx.researchLibrary.list().flatMap(paper => paper.sourceVersions)
      .find(source => source.documentId === documentId)
    if (source === undefined) throw new Error('Document is not registered in this research library')
    return source
  }

  private restore(document: ResearchWorkspaceDocument) {
    const source = this.requireSource(document.documentId)
    if (!source.observations.some(parser => parser.parserId === document.parserId && parser.parserVersion === document.parserVersion)) {
      throw new Error('Parser revision is not registered for this source')
    }
    return this.ctx.researchDocuments.restore(document.documentId, { id: document.parserId, version: document.parserVersion })
  }

  private table() {
    if (this.positions === undefined) throw new Error('Research workspace storage is not ready')
    return this.positions
  }

  private fits(value: unknown): boolean { return Buffer.byteLength(JSON.stringify(value)) <= this.limits.maxResponseBytes }

  private bounded<T>(value: T): T {
    if (!this.fits(value)) throw new Error('Research workspace response exceeds maxResponseBytes')
    return value
  }
}

function nonNegative(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer`)
}

function questionSummary(question: ResearchQuestionRecord): ResearchWorkspaceQuestion {
  return { id: question.id, title: question.title, question: question.question,
    revision: question.revision, claimCount: question.claims.length }
}

const facets: readonly ResearchFacet[] = ['aim', 'method', 'dataset', 'metric', 'result', 'limitation', 'validity-threat', 'other']

function projectClaims(question: ResearchQuestionRecord) {
  const replaced = new Set(question.claims.flatMap(claim => claim.supersedes === undefined ? [] : [claim.supersedes]))
  const reviews = new Map<ResearchClaimId, ResearchQuestionRecord['claimReviews'][number]>()
  for (const review of question.claimReviews) {
    reviews.set(review.claimId, review)
    if (review.decision === 'revised') reviews.set(review.replacementClaimId, review)
  }
  return question.claims.map(claim => ({ claim, active: !replaced.has(claim.id), latestReview: reviews.get(claim.id) ?? null }))
}

export default ResearchWorkspace

function taskSummary(task: ResearchTaskRecord): ResearchWorkspaceTask {
  return { id: task.id, questionId: task.questionId, kind: task.kind, revision: task.revision, phase: task.phase, reason: task.reason }
}
