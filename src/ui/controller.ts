/** Browser workspace state over the trusted research Remote API. */

import type {
  ResearchWorkspaceTask, ResearchWorkspaceTasks, ResearchWorkspaceTaskProgress, ResearchWorkspaceTaskHistory,
  ResearchWorkspaceTaskSources, ResearchWorkspaceTaskCreateRequest, ResearchWorkspaceTaskUpdateRequest,
  ResearchWorkspaceTaskMutationResult,
  ResearchWorkspaceObservation, ResearchWorkspaceObservations, ResearchWorkspaceObservationReviews,
  ResearchWorkspaceObservationReviewRequest, ResearchWorkspaceObservationReviewResult, ResearchWorkspaceObservationChoices,
  ResearchReportRequest, ResearchReportResult, ResearchReportBundle,
  ResearchWorkspaceNotes, ResearchWorkspaceNoteRequest, ResearchWorkspaceNoteResult, ResearchWorkspaceMatrix, ResearchWorkspaceClaimFilter,
  ResearchWorkspaceReviewer, ResearchWorkspaceQuestion, ResearchWorkspaceQuestions, ResearchWorkspaceClaims,
  ResearchWorkspaceClaim, ResearchWorkspaceReviews,
  ResearchWorkspaceReviewRequest, ResearchWorkspaceReviewResult, ResearchWorkspaceEvidenceChoices, ResearchEvidence,
  ResearchReadingPosition, ResearchSourceChunk, ResearchWorkspaceCatalog, ResearchWorkspaceDocument,
  ResearchWorkspacePage, ResearchWorkspacePaper, ResearchWorkspaceSource, SaveResearchReadingPositionResult,
} from '../research-workspace/types.ts'

/** Required data operations; transport failures reject before reaching this controller. */
export interface WorkspaceApi {
  createQuestion(this: void, reviewer: ResearchWorkspaceReviewer['id'], title: string, question: string): Promise<ResearchWorkspaceQuestion>
  tasks(this: void, question: ResearchWorkspaceQuestion['id'], offset: number): Promise<ResearchWorkspaceTasks>
  task(this: void, id: ResearchWorkspaceTask['id'], offset: number): Promise<ResearchWorkspaceTaskProgress>
  taskHistory(this: void, id: ResearchWorkspaceTask['id'], revision: number, offset: number): Promise<ResearchWorkspaceTaskHistory>
  taskSources(this: void, id: ResearchWorkspaceTask['id'], revision: number, checkpoint: number | null, offset: number): Promise<ResearchWorkspaceTaskSources>
  createTask(this: void, reviewer: ResearchWorkspaceReviewer['id'], request: ResearchWorkspaceTaskCreateRequest): Promise<ResearchWorkspaceTaskMutationResult>
  updateTask(this: void, reviewer: ResearchWorkspaceReviewer['id'], request: ResearchWorkspaceTaskUpdateRequest): Promise<ResearchWorkspaceTaskMutationResult>
  observations(this: void, question: ResearchWorkspaceObservationReviewRequest['questionId'], offset: number): Promise<ResearchWorkspaceObservations>
  observationChoices(this: void, question: ResearchWorkspaceObservationReviewRequest['questionId'], observation: ResearchWorkspaceObservation['observation']['id'], offset: number): Promise<ResearchWorkspaceObservationChoices>
  observationReviews(this: void, question: ResearchWorkspaceObservationReviewRequest['questionId'], observation: ResearchWorkspaceObservation['observation']['id'], offset: number): Promise<ResearchWorkspaceObservationReviews>
  reviewObservation(this: void, reviewer: ResearchWorkspaceReviewer['id'], request: ResearchWorkspaceObservationReviewRequest): Promise<ResearchWorkspaceObservationReviewResult>
  report(this: void, request: ResearchReportRequest): Promise<ResearchReportResult>
  questions(this: void, offset: number): Promise<ResearchWorkspaceQuestions>
  claims(this: void, id: ResearchWorkspaceReviewRequest['questionId'], offset: number, filter?: ResearchWorkspaceClaimFilter): Promise<ResearchWorkspaceClaims>
  notes(this: void, id: ResearchWorkspaceNoteRequest['questionId'], offset: number): Promise<ResearchWorkspaceNotes>
  writeNote(this: void, reviewer: ResearchWorkspaceReviewer['id'], request: ResearchWorkspaceNoteRequest): Promise<ResearchWorkspaceNoteResult>
  matrix(this: void, id: ResearchWorkspaceReviewRequest['questionId'], offset: number): Promise<ResearchWorkspaceMatrix>
  reviewers(this: void): Promise<readonly ResearchWorkspaceReviewer[]>
  registerReviewer(this: void, name: string): Promise<ResearchWorkspaceReviewer>
  evidence(this: void, question: ResearchWorkspaceReviewRequest['questionId'], id: ResearchEvidence['id']): Promise<ResearchEvidence>
  evidenceChoices(this: void, question: ResearchWorkspaceReviewRequest['questionId'], offset: number): Promise<ResearchWorkspaceEvidenceChoices>
  reviews(this: void, question: ResearchWorkspaceReviewRequest['questionId'], claim: ResearchWorkspaceReviewRequest['claimId'], offset: number): Promise<ResearchWorkspaceReviews>
  reviewClaim(this: void, reviewer: ResearchWorkspaceReviewer['id'], request: ResearchWorkspaceReviewRequest): Promise<ResearchWorkspaceReviewResult>
  list(this: void, query: string, offset: number): Promise<ResearchWorkspaceCatalog>
  source(this: void, id: ResearchWorkspaceDocument['documentId'], offset: number): Promise<ResearchSourceChunk>
  position(this: void, id: ResearchWorkspaceDocument['documentId']): Promise<ResearchReadingPosition | null>
  page(this: void, document: ResearchWorkspaceDocument, page: number, offset: number): Promise<ResearchWorkspacePage>
  savePosition(this: void, document: ResearchWorkspaceDocument, page: number, revision: number): Promise<SaveResearchReadingPositionResult>
}

/** One selected PDF, its extracted page preview, and the last observed saved-position revision. */
export interface ReadingView {
  readonly title: string
  readonly document: ResearchWorkspaceDocument
  readonly page: ResearchWorkspacePage
  readonly sourceUrl: string
  readonly revision: number
}

/** Cached immutable snapshot consumed by the framework-created workspace hook. */
export interface WorkspaceView {
  readonly tasks: ResearchWorkspaceTasks | null
  readonly task: ResearchWorkspaceTaskProgress | null
  readonly taskHistory: ResearchWorkspaceTaskHistory | null
  readonly taskSources: ResearchWorkspaceTaskSources | null
  readonly taskSelection: NonNullable<Extract<ResearchWorkspaceTaskUpdateRequest, { action: 'checkpoint' }>['sources']>
  readonly catalogQuery: string
  readonly taskSourceCheckpoint: number | null
  readonly taskReceipt: { readonly taskId: ResearchWorkspaceTask['id']; readonly revision: number } | null
  readonly observations: ResearchWorkspaceObservations | null
  readonly selectedObservation: ResearchWorkspaceObservation | null
  readonly observationReviews: ResearchWorkspaceObservationReviews | null
  readonly observationChoices: ResearchWorkspaceObservationChoices | null
  readonly report: ResearchReportBundle | null
  readonly reportDownloads: readonly { readonly name: string; readonly url: string }[]
  readonly notes: ResearchWorkspaceNotes | null
  readonly matrix: ResearchWorkspaceMatrix | null
  readonly claimFilter: ResearchWorkspaceClaimFilter | null
  readonly questions: ResearchWorkspaceQuestions | null
  readonly claimPage: ResearchWorkspaceClaims | null
  readonly selectedClaim: ResearchWorkspaceClaim | null
  readonly evidence: ResearchEvidence | null
  readonly evidenceChoices: ResearchWorkspaceEvidenceChoices | null
  readonly reviews: ResearchWorkspaceReviews | null
  readonly reviewers: readonly ResearchWorkspaceReviewer[]
  readonly reviewerId: ResearchWorkspaceReviewer['id'] | null
  readonly catalog: ResearchWorkspaceCatalog | null
  readonly reading: ReadingView | null
  readonly busy: boolean
  readonly error: string | null
}

/** Owns request cancellation, verified source URLs, and committed reading state. */
export class WorkspaceController {
  private state: WorkspaceView = { tasks: null, task: null, taskHistory: null, taskSources: null, taskSelection: [], catalogQuery: '',
    taskSourceCheckpoint: null, taskReceipt: null, observations: null, selectedObservation: null, observationReviews: null,
    observationChoices: null, catalog: null, reading: null, busy: false, error: null,
    questions: null, claimPage: null, selectedClaim: null, evidence: null, evidenceChoices: null, reviews: null,
    reviewers: [], reviewerId: null, notes: null, matrix: null, claimFilter: null, report: null, reportDownloads: [] }
  private readonly listeners = new Set<() => void>()
  private operation: AbortController | undefined
  private disposed = false
  private notificationQueued = false

  constructor(private readonly api: WorkspaceApi) {}

  /**
   * Read the current library and reader state.
   * @returns the same snapshot until the next publication.
   */
  getSnapshot = (): WorkspaceView => this.state

  /**
   * Observe committed state and direct interaction feedback.
   * @param listener - framework invalidation callback.
   * @returns subscription disposer.
   */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  /**
   * Replace the catalog with the submitted query's result page.
   * @param query - submitted title or author filter.
   * @param offset - next catalog offset, or zero for a new filter.
   * @returns after the current response has published or been superseded.
   */
  load = (query: string, offset: number): Promise<void> => this.run(async (signal) => {
    const catalog = await this.api.list(query, offset)
    if (!signal.aborted) this.publish({ ...this.state, catalog, catalogQuery: query })
  })

  /**
   * Open a verified archived PDF at its saved parser revision and page.
   * @param paper - selected library entry.
   * @param source - exact source version belonging to that entry.
   * @returns after source verification and the saved page have loaded.
   */
  open = (paper: Pick<ResearchWorkspacePaper, 'title'>, source: ResearchWorkspaceSource): Promise<void> => this.run(async (signal) => {
    const position = await this.api.position(source.documentId)
    signal.throwIfAborted()
    const parser = source.parsers.at(-1)
    if (parser === undefined) throw new Error('该来源没有可用的解析记录。')
    const document = { documentId: source.documentId, parserId: position?.parserId ?? parser.id,
      parserVersion: position?.parserVersion ?? parser.version }
    const [page, bytes] = await Promise.all([
      this.api.page(document, position?.pageIndex ?? 0, 0),
      this.readSource(document.documentId, signal),
    ])
    signal.throwIfAborted()
    const sourceUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
    const previous = this.state.reading?.sourceUrl
    this.publish({ ...this.state, reading: { title: paper.title, document, page, sourceUrl, revision: position?.revision ?? 0 } })
    if (previous !== undefined) URL.revokeObjectURL(previous)
  })

  /**
   * Save a page selection before displaying its extracted text.
   * @param pageIndex - explicitly selected physical page.
   * @returns after the page selection commits; a stale write leaves the current view unchanged.
   */
  turn = (pageIndex: number): Promise<void> => this.run(async (signal) => {
    const reading = this.state.reading
    if (reading === null) return
    const page = await this.api.page(reading.document, pageIndex, 0)
    signal.throwIfAborted()
    const result = await this.api.savePosition(reading.document, pageIndex, reading.revision)
    signal.throwIfAborted()
    if (result.status === 'conflict') throw new Error('阅读位置已在其他窗口更新，请重新打开论文。')
    this.publish({ ...this.state, reading: { ...reading, page, revision: result.position.revision } })
  })

  /**
   * Continue extracted blocks on the selected page without changing the saved page.
   * @returns after the next preview page has loaded.
   */
  moreBlocks = (): Promise<void> => this.run(async (signal) => {
    const reading = this.state.reading
    if (reading === null || reading.page.nextOffset === null) return
    const next = await this.api.page(reading.document, reading.page.pageIndex, reading.page.nextOffset)
    if (!signal.aborted) this.publish({ ...this.state, reading: { ...reading, page: {
      ...next, blocks: [...reading.page.blocks, ...next.blocks],
    } } })
  })

  /**
   * Browse questions and load explicitly selectable local reviewer identities.
   * @param offset - question continuation offset.
   * @returns after the current selection page loads.
   */
  loadQuestions = (offset: number): Promise<void> => this.run(async (signal) => {
    const [questions, reviewers] = await Promise.all([this.api.questions(offset), this.api.reviewers()])
    signal.throwIfAborted()
    this.publish({ ...this.state, questions, reviewers })
  })

  /**
   * Select a question page; changed questions clear the previous evidence and assessment.
   * @param id - durable question id.
   * @param offset - claim continuation offset.
   * @param filter - selected matrix cell, or undefined to show all claims.
   * @returns after exact claim candidates load.
   */
  loadClaims = (id: ResearchWorkspaceReviewRequest['questionId'], offset: number, filter?: ResearchWorkspaceClaimFilter): Promise<void> => this.run(async (signal) => {
    const [claimPage, evidenceChoices] = await Promise.all([this.api.claims(id, offset, filter), this.api.evidenceChoices(id, 0)])
    signal.throwIfAborted()
    this.releaseReport()
    this.publish({ ...this.state, claimPage, evidenceChoices, selectedClaim: null, evidence: null, reviews: null,
      tasks: null, task: null, taskHistory: null, taskSources: null, taskSelection: [], taskSourceCheckpoint: null, taskReceipt: null,
      observations: null, selectedObservation: null, observationReviews: null, observationChoices: null,
      notes: null, matrix: null, claimFilter: filter ?? null, report: null, reportDownloads: [] })
  })

  /**
   * Create and select a question without creating a second task implicitly.
   * @param title - researcher-authored label.
   * @param question - research question text.
   * @returns true after a confirmed commit, even if a later request supersedes publication.
   */
  createQuestion = async (title: string, question: string): Promise<boolean> => {
    let committed = false
    await this.run(async (signal) => {
      const reviewer = this.state.reviewerId
      if (reviewer === null) throw new Error('请先选择本地审阅身份。')
      const created = await this.api.createQuestion(reviewer, title, question)
      committed = true
      signal.throwIfAborted()
      this.releaseReport()
      this.publish({ ...this.state, questions: { questions: [created], nextOffset: null },
        claimPage: { question: created, claims: [], nextOffset: null }, claimFilter: null, selectedClaim: null,
        notes: null, matrix: null, evidence: null, evidenceChoices: null, reviews: null,
        observations: null, selectedObservation: null, observationReviews: null, observationChoices: null,
        report: null, reportDownloads: [], tasks: { question: created, tasks: [], nextOffset: null },
        task: null, taskHistory: null, taskSources: null, taskSelection: [], taskSourceCheckpoint: null, taskReceipt: null })
    })
    return committed
  }

  /**
   * List tasks belonging to the selected research question.
   * @param offset - task continuation offset; zero refreshes the selection.
   * @returns after the current list page loads.
   */
  loadTasks = (offset: number): Promise<void> => this.run(async (signal) => {
    const question = this.state.claimPage?.question
    if (question === undefined) return
    const tasks = await this.api.tasks(question.id, offset)
    signal.throwIfAborted()
    this.publish({ ...this.state, tasks })
  })

  /**
   * Inspect a task, its first history/source pages, and its complete editable source selection.
   * @param id - task selected from the current question or a committed receipt.
   * @returns after a consistent task view loads; failed refreshes preserve the earlier inspected view.
   */
  selectTask = (id: ResearchWorkspaceTask['id']): Promise<void> => this.run(async (signal) => {
    await this.readTask(id, signal)
  })

  /**
   * Append a page of current task requirements without mixing question or task revisions.
   * @param offset - continuation offset returned by the current task view.
   * @returns after matching requirements append, or a visible refresh request.
   */
  loadTaskIssues = (offset: number): Promise<void> => this.run(async (signal) => {
    const current = this.state.task
    if (current === null) return
    const next = await this.api.task(current.task.id, offset)
    signal.throwIfAborted()
    if (next.task.revision !== current.task.revision || next.questionRevision !== current.questionRevision) {
      throw new Error('任务或研究问题已更新，请刷新任务后重新核对。')
    }
    this.publish({ ...this.state, task: { ...next, issues: [...current.issues, ...next.issues] } })
  })

  /**
   * Append retained checkpoints at the inspected task revision.
   * @param offset - history continuation offset.
   * @returns after complete historical summaries append.
   */
  loadTaskHistory = (offset: number): Promise<void> => this.run(async (signal) => {
    const current = this.state.task
    if (current === null) return
    const next = await this.api.taskHistory(current.task.id, current.task.revision, offset)
    signal.throwIfAborted()
    this.publish({ ...this.state, taskHistory: { ...next,
      checkpoints: [...this.state.taskHistory?.checkpoints ?? [], ...next.checkpoints] } })
  })

  /**
   * Inspect current or historical exact source selections.
   * @param checkpoint - historical checkpoint revision, or null for current sources.
   * @param offset - source continuation offset; zero replaces the selection view.
   * @returns after complete source choices load at the inspected task revision.
   */
  loadTaskSources = (checkpoint: number | null, offset: number): Promise<void> => this.run(async (signal) => {
    const current = this.state.task
    if (current === null) return
    const next = await this.api.taskSources(current.task.id, current.task.revision, checkpoint, offset)
    signal.throwIfAborted()
    if (offset !== 0 && this.state.taskSourceCheckpoint !== checkpoint) throw new Error('来源选择已变化，请重新打开检查点。')
    this.publish({ ...this.state, taskSourceCheckpoint: checkpoint, taskSources: { ...next,
      sources: offset === 0 ? next.sources : [...this.state.taskSources?.sources ?? [], ...next.sources] } })
  })

  /**
   * Create a task for the selected question and load its committed progress.
   * @param kind - research workflow selected by the user.
   * @returns true after a confirmed commit, including a failed subsequent refresh.
   */
  createTask = (kind: ResearchWorkspaceTaskCreateRequest['kind']): Promise<boolean> => this.writeTask(async (reviewer) => {
    const question = this.state.claimPage?.question
    if (question === undefined) throw new Error('请先选择或创建研究问题。')
    return this.api.createTask(reviewer, { questionId: question.id, kind })
  })

  /**
   * Submit an explicit task action against the revisions displayed by the browser.
   * @param request - user-authored action and inspected revisions.
   * @returns true after a confirmed commit; refusals retain the draft and never retry automatically.
   */
  updateTask = (request: ResearchWorkspaceTaskUpdateRequest): Promise<boolean> =>
    this.writeTask(reviewer => this.api.updateTask(reviewer, request))

  /**
   * Read results at the latest question revision and discard earlier result drafts.
   * @param offset - result continuation offset.
   * @returns after the selected result page loads.
   */
  loadObservations = (offset: number): Promise<void> => this.run(async (signal) => {
    const current = this.state.claimPage
    if (current === null) return
    const observations = await this.api.observations(current.question.id, offset)
    signal.throwIfAborted()
    this.releaseReport()
    this.publish({ ...this.state, observations, questions: this.updatedQuestions(observations.question),
      claimPage: { ...current, question: observations.question },
      selectedObservation: null, observationReviews: null, observationChoices: null, evidence: null, report: null, reportDownloads: [] })
  })

  /**
   * Inspect a result, its complete review history page, source evidence, and revision choices.
   * @param selectedObservation - result from the displayed question revision.
   * @returns after the inspected data loads without mixing question revisions.
   */
  selectObservation = (selectedObservation: ResearchWorkspaceObservation): Promise<void> => this.run(async (signal) => {
    const question = this.state.observations?.question
    if (question === undefined) return
    const first = selectedObservation.evidenceIds[0]
    const [observationReviews, observationChoices, evidence] = await Promise.all([
      this.api.observationReviews(question.id, selectedObservation.observation.id, 0),
      this.api.observationChoices(question.id, selectedObservation.observation.id, 0),
      first === undefined ? null : this.api.evidence(question.id, first),
    ])
    signal.throwIfAborted()
    if (observationChoices.questionRevision !== question.revision) throw new Error('研究问题已更新，请刷新实验结果。')
    this.publish({ ...this.state, selectedObservation, observationReviews, observationChoices, evidence })
  })

  /**
   * Append complete source choices from the same inspected revision.
   * @param offset - choice continuation offset.
   * @returns after the next choices append, or a visible revision conflict.
   */
  loadObservationChoices = (offset: number): Promise<void> => this.run(async (signal) => {
    const question = this.state.observations?.question
    const selected = this.state.selectedObservation
    if (question === undefined || selected === null) return
    const page = await this.api.observationChoices(question.id, selected.observation.id, offset)
    signal.throwIfAborted()
    if (page.questionRevision !== question.revision) throw new Error('研究问题已更新，请刷新实验结果后重新选择来源。')
    this.publish({ ...this.state, observationChoices:
      { ...page, choices: [...(this.state.observationChoices?.choices ?? []), ...page.choices] } })
  })

  /**
   * Append decisions for the selected result, including its approving revision.
   * @param offset - history continuation offset.
   * @returns after the next history page appends.
   */
  loadObservationReviews = (offset: number): Promise<void> => this.run(async (signal) => {
    const question = this.state.observations?.question
    const selected = this.state.selectedObservation
    if (question === undefined || selected === null) return
    const page = await this.api.observationReviews(question.id, selected.observation.id, offset)
    signal.throwIfAborted()
    this.publish({ ...this.state, observationReviews:
      { ...page, reviews: [...(this.state.observationReviews?.reviews ?? []), ...page.reviews] } })
  })

  /**
   * Commit the reviewed result and approval atomically; refresh failure never invites resubmission.
   * @param request - researcher-entered decision at the inspected question revision.
   * @returns true once the commit is confirmed, including when refresh fails; false on refusal.
   */
  submitObservationReview = async (request: ResearchWorkspaceObservationReviewRequest): Promise<boolean> => {
    let committed = false
    await this.run(async (signal) => {
      const reviewer = this.state.reviewerId
      if (reviewer === null) throw new Error('请先选择本地审阅身份。')
      const result = await this.api.reviewObservation(reviewer, request)
      if (result.status === 'created') committed = true
      signal.throwIfAborted()
      if (result.status !== 'created') {
        if (result.status === 'stale-revision') throw new Error('研究问题已更新，请刷新实验结果并重新核对后提交。')
        if (result.status === 'observation-rejected-claim') throw new Error('结果引用了已拒绝的来源表述，请先修订来源引用。')
        if (result.status === 'observation-stale') throw new Error('结果引用了历史来源，请修订引用后再接受。')
        throw new Error(`结果审阅未保存：${result.status}`)
      }
      this.releaseReport()
      this.publish({ ...this.state, selectedObservation: null, observationReviews: null, observationChoices: null,
        observations: null, notes: null, matrix: null, report: null, reportDownloads: [] })
      try {
        const [observations, claimPage] = await Promise.all([this.api.observations(request.questionId, 0),
          this.api.claims(request.questionId, 0)])
        signal.throwIfAborted()
        this.publish({ ...this.state, observations, questions: this.updatedQuestions(observations.question), claimPage, claimFilter: null })
      } catch (error) {
        signal.throwIfAborted()
        throw new Error(`结果审阅已保存，但刷新失败，请刷新实验结果查看。${error instanceof Error ? error.message : String(error)}`)
      }
    })
    return committed
  }

  /**
   * Generate downloadable report files from the inspected question revision.
   * @returns after complete file-content verification; stale questions require an explicit refresh.
   */
  prepareReport = (): Promise<void> => this.run(async (signal) => {
    const question = this.state.claimPage?.question
    if (question === undefined) return
    const result = await this.api.report({ questionId: question.id, expectedRevision: question.revision })
    signal.throwIfAborted()
    if (result.status !== 'ready') {
      if (result.status === 'stale-revision') throw new Error('研究问题已更新，请刷新问题后重新生成报告。')
      if (result.status === 'capacity') throw new Error('报告超过当前导出容量，请调整报告容量配置。')
      throw new Error('研究问题已不可用。')
    }
    const { bundle } = result
    const bytes = new TextEncoder().encode(JSON.stringify(bundle.files.map(file => [file.name, file.mediaType, file.text])))
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map(value => value.toString(16).padStart(2, '0')).join('')
    signal.throwIfAborted()
    if (bundle.questionId !== question.id || bundle.revision !== question.revision || bundle.digest !== `sha256:${hash}`) {
      throw new Error('报告内容与请求的研究问题或校验标识不一致。')
    }
    const downloads: { name: string; url: string }[] = []
    try {
      for (const file of bundle.files) downloads.push({ name: file.name,
        url: URL.createObjectURL(new Blob([file.text], { type: `${file.mediaType};charset=utf-8` })) })
    } catch (error) {
      for (const file of downloads) URL.revokeObjectURL(file.url)
      throw error
    }
    this.releaseReport()
    this.publish({ ...this.state, report: bundle, reportDownloads: downloads })
  })

  /**
   * Replace the selected question's note page, retaining exact text and historical versions.
   * @param offset - note continuation offset.
   * @returns after notes load; selecting a note's evidence remains an explicit action.
   */
  loadNotes = (offset: number): Promise<void> => this.run(async (signal) => {
    const question = this.state.claimPage?.question
    if (question === undefined) return
    const notes = await this.api.notes(question.id, offset)
    signal.throwIfAborted()
    this.publish({ ...this.state, notes, selectedClaim: null, reviews: null, evidence: null })
  })

  /**
   * Read paper-by-facet source coverage at the current durable question revision.
   * @param offset - paper continuation offset.
   * @returns after the matrix page replaces the previous page.
   */
  loadMatrix = (offset: number): Promise<void> => this.run(async (signal) => {
    const question = this.state.claimPage?.question
    if (question === undefined) return
    const matrix = await this.api.matrix(question.id, offset)
    signal.throwIfAborted()
    this.publish({ ...this.state, matrix })
  })

  /**
   * Append a locally attributed note and reload its committed history.
   * @param request - user-authored text, evidence, and the inspected question revision.
   * @returns true once committed, including when the subsequent refresh fails; false on refusal.
   */
  submitNote = async (request: ResearchWorkspaceNoteRequest): Promise<boolean> => {
    let committed = false
    await this.run(async (signal) => {
      const reviewer = this.state.reviewerId
      if (reviewer === null) throw new Error('请先选择本地审阅身份。')
      const result = await this.api.writeNote(reviewer, request)
      signal.throwIfAborted()
      if (result.status !== 'created') {
        if (result.status === 'stale-revision') throw new Error('研究问题已更新，请刷新笔记并重新核对后提交。')
        if (result.status === 'passage-question-selection-required') throw new Error('段落问题需要关联精确摘录，请先在对话中捕获选中的原文。')
        throw new Error(`笔记未保存：${result.status}`)
      }
      committed = true
      this.releaseReport()
      this.publish({ ...this.state, notes: null, matrix: null, report: null, reportDownloads: [] })
      try {
        const [notes, claimPage] = await Promise.all([this.api.notes(request.questionId, 0), this.api.claims(request.questionId, 0)])
        signal.throwIfAborted()
        this.publish({ ...this.state, notes, claimPage, claimFilter: null })
      } catch (error) {
        signal.throwIfAborted()
        throw new Error(`笔记已保存，但刷新失败，请刷新笔记查看。${error instanceof Error ? error.message : String(error)}`)
      }
    })
    return committed
  }

  /**
   * Inspect one exact claim and its historical decisions before editing.
   * @param claim - claim from the current question page.
   * @returns after its first evidence block and review page load.
   */
  selectClaim = (claim: ResearchWorkspaceClaim): Promise<void> => this.run(async (signal) => {
    const question = this.state.claimPage?.question
    if (question === undefined) return
    const first = claim.claim.evidenceLinks[0]
    const [reviews, evidence] = await Promise.all([
      this.api.reviews(question.id, claim.claim.id, 0),
      first === undefined ? null : this.api.evidence(question.id, first.evidenceId),
    ])
    signal.throwIfAborted()
    this.publish({ ...this.state, selectedClaim: claim, reviews, evidence })
  })

  /**
   * Continue the current question's evidence selector.
   * @param offset - evidence continuation offset.
   * @returns after the requested evidence choices load.
   */
  loadEvidenceChoices = (offset: number): Promise<void> => this.run(async (signal) => {
    const question = this.state.claimPage?.question
    if (question === undefined) return
    const evidenceChoices = await this.api.evidenceChoices(question.id, offset)
    signal.throwIfAborted()
    this.publish({ ...this.state, evidenceChoices })
  })

  /**
   * Read a complete captured evidence block without preview clipping.
   * @param id - selected evidence id in the current question.
   * @returns after the exact block loads.
   */
  readEvidence = (id: ResearchEvidence['id']): Promise<void> => this.run(async (signal) => {
    const question = this.state.claimPage?.question
    if (question === undefined) return
    const evidence = await this.api.evidence(question.id, id)
    signal.throwIfAborted()
    this.publish({ ...this.state, evidence })
  })

  /**
   * Continue immutable review history for the selected claim.
   * @param offset - review continuation offset.
   * @returns after the history page appends.
   */
  loadReviews = (offset: number): Promise<void> => this.run(async (signal) => {
    const question = this.state.claimPage?.question
    const claim = this.state.selectedClaim
    if (question === undefined || claim === null) return
    const page = await this.api.reviews(question.id, claim.claim.id, offset)
    signal.throwIfAborted()
    this.publish({ ...this.state, reviews: { ...page, reviews: [...(this.state.reviews?.reviews ?? []), ...page.reviews] } })
  })

  /**
   * Select a local identity without treating it as authenticated remote identity.
   * @param id - explicitly selected registered reviewer id, or null to clear.
   */
  chooseReviewer = (id: ResearchWorkspaceReviewer['id'] | null): void => {
    this.publish({ ...this.state, reviewerId: id }, true)
  }

  /**
   * Register and select a distinct local reviewer after its durable commit.
   * @param name - local display name entered by the researcher.
   * @returns after registration commits.
   */
  registerReviewer = (name: string): Promise<void> => this.run(async (signal) => {
    const reviewer = await this.api.registerReviewer(name)
    signal.throwIfAborted()
    this.publish({ ...this.state, reviewers: [...this.state.reviewers, reviewer], reviewerId: reviewer.id })
  })

  /**
   * Save the explicit assessment and refresh committed candidates; stale edits retain the draft.
   * @param request - exact question revision and researcher-entered assessment.
   * @returns after commit or a visible refusal; never retries a stale assessment automatically.
   */
  submitReview = (request: ResearchWorkspaceReviewRequest): Promise<void> => this.run(async (signal) => {
    const reviewer = this.state.reviewerId
    if (reviewer === null) throw new Error('请先选择本地审阅身份。')
    const result = await this.api.reviewClaim(reviewer, request)
    signal.throwIfAborted()
    if (result.status !== 'created') {
      if (result.status === 'stale-revision') throw new Error('研究问题已更新，请刷新论断并重新核对后提交。')
      throw new Error(`审阅未保存：${result.status}`)
    }
    const claimPage = await this.api.claims(request.questionId, 0)
    signal.throwIfAborted()
    const questions = this.updatedQuestions(claimPage.question)
    this.releaseReport()
    this.publish({ ...this.state, questions, claimPage, selectedClaim: null, reviews: null, evidence: null,
      claimFilter: null, notes: null, matrix: null, report: null, reportDownloads: [] })
  })

  /**
   * Open the evidence's archived parser revision and physical source page.
   * @returns after source verification; this inspection does not overwrite the saved reading position.
   */
  openEvidence = async (): Promise<boolean> => {
    let opened = false
    await this.run(async (signal) => {
      const evidence = this.state.evidence
      if (evidence === null) return
      const { documentId, parserId, parserVersion, pageIndex } = evidence.locator
      const document = { documentId, parserId, parserVersion }
      const [page, bytes, position] = await Promise.all([
        this.api.page(document, pageIndex, 0), this.readSource(documentId, signal), this.api.position(documentId),
      ])
      signal.throwIfAborted()
      const sourceUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      const previous = this.state.reading?.sourceUrl
      this.publish({ ...this.state, reading: { title: '证据原文', document, page, sourceUrl, revision: position?.revision ?? 0 } })
      opened = true
      if (previous !== undefined) URL.revokeObjectURL(previous)
    })
    return opened
  }

  /** Stop publication and release the owned source URL when the plugin unloads. */
  dispose(): void {
    this.disposed = true
    this.operation?.abort()
    this.listeners.clear()
    this.releaseReport()
    if (this.state.reading !== null) URL.revokeObjectURL(this.state.reading.sourceUrl)
  }

  private releaseReport(): void {
    for (const file of this.state.reportDownloads) URL.revokeObjectURL(file.url)
  }

  private async readTask(id: ResearchWorkspaceTask['id'], signal: AbortSignal): Promise<void> {
    const task = await this.api.task(id, 0)
    signal.throwIfAborted()
    const question = this.state.claimPage?.question
    if (task.task.questionId !== question?.id) throw new Error('任务不属于当前研究问题，请重新选择。')
    const [taskHistory, taskSources, tasks] = await Promise.all([
      this.api.taskHistory(id, task.task.revision, 0), this.api.taskSources(id, task.task.revision, null, 0),
      this.api.tasks(task.task.questionId, 0),
    ])
    signal.throwIfAborted()
    const taskSelection = taskSources.sources.map(value => ({ paperId: value.paperId, sourceVersionId: value.source.id }))
    let offset = taskSources.nextOffset
    while (offset !== null) {
      const page = await this.api.taskSources(id, task.task.revision, null, offset)
      signal.throwIfAborted()
      taskSelection.push(...page.sources.map(value => ({ paperId: value.paperId, sourceVersionId: value.source.id })))
      offset = page.nextOffset
    }
    this.publish({ ...this.state, task, tasks, taskHistory, taskSources, taskSelection, taskSourceCheckpoint: null })
  }

  private async writeTask(operation: (reviewer: ResearchWorkspaceReviewer['id']) => Promise<ResearchWorkspaceTaskMutationResult>): Promise<boolean> {
    let committed = false
    await this.run(async (signal) => {
      const reviewer = this.state.reviewerId
      if (reviewer === null) throw new Error('请先选择本地审阅身份。')
      const result = await operation(reviewer)
      if (result.status !== 'saved') {
        if (result.status === 'stale-revision' || result.status === 'stale-question') {
          throw new Error('任务或研究问题已更新，请刷新任务并重新核对后提交。')
        }
        if (result.status === 'cannot-advance') throw new Error(`任务尚不能推进：${result.issues.join(' ')}`)
        throw new Error(`任务未保存：${result.status}`)
      }
      committed = true
      signal.throwIfAborted()
      this.publish({ ...this.state, task: null, taskHistory: null, taskSources: null, taskSelection: [],
        taskReceipt: { taskId: result.taskId, revision: result.revision } })
      try { await this.readTask(result.taskId, signal) }
      catch (error) {
        signal.throwIfAborted()
        throw new Error(`任务已保存，但刷新失败。请刷新已保存任务，勿重复创建。${error instanceof Error ? error.message : String(error)}`)
      }
    })
    return committed
  }

  private updatedQuestions(question: ResearchWorkspaceQuestion): ResearchWorkspaceQuestions | null {
    const current = this.state.questions
    return current === null ? null : { ...current,
      questions: current.questions.map(value => value.id === question.id ? question : value) }
  }

  private async readSource(id: ResearchWorkspaceDocument['documentId'], signal: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
    let offset: number | null = 0
    let bytes: Uint8Array<ArrayBuffer> | undefined
    while (offset !== null) {
      signal.throwIfAborted()
      const chunk = await this.api.source(id, offset)
      signal.throwIfAborted()
      if (bytes === undefined) bytes = new Uint8Array(chunk.totalBytes)
      const part = Uint8Array.from(atob(chunk.base64), value => value.charCodeAt(0))
      const end = offset + part.length
      if (chunk.documentId !== id || chunk.offset !== offset || chunk.totalBytes !== bytes.length
        || end > bytes.length || (chunk.nextOffset === null ? end !== bytes.length : chunk.nextOffset !== end || end <= offset)) {
        throw new Error('PDF 分块不连续，无法确认原文完整性。')
      }
      bytes.set(part, offset)
      offset = chunk.nextOffset
    }
    if (bytes === undefined) throw new Error('归档没有返回 PDF 内容。')
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
      .map(value => value.toString(16).padStart(2, '0')).join('')
    if (`sha256:${hash}` !== id) throw new Error('PDF 内容与归档标识不一致。')
    return bytes
  }

  private async run(operation: (signal: AbortSignal) => Promise<void>): Promise<void> {
    if (this.disposed) return
    this.operation?.abort()
    const lifetime = new AbortController()
    this.operation = lifetime
    this.publish({ ...this.state, busy: true, error: null }, true)
    try {
      await operation(lifetime.signal)
    } catch (error) {
      if (!lifetime.signal.aborted) this.publish({ ...this.state, error: error instanceof Error ? error.message : String(error) })
    } finally {
      if (!lifetime.signal.aborted) this.publish({ ...this.state, busy: false })
      lifetime.abort()
    }
  }

  private publish(state: WorkspaceView, immediate = false): void {
    if (this.disposed) return
    this.state = state
    const notify = () => {
      if (this.disposed) return
      for (const listener of this.listeners) {
        try { listener() } catch (error) { console.error('Research workspace listener failed', error) }
      }
    }
    if (immediate) notify()
    else if (!this.notificationQueued) {
      this.notificationQueued = true
      queueMicrotask(() => { this.notificationQueued = false; notify() })
    }
  }
}
