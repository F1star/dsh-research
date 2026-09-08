/** Browser request races, source integrity, and committed navigation. */

import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ResearchWorkspacePaper, ResearchReportBundle, ResearchReportFile } from '../../src/research-workspace/types.ts'
import { WorkspaceController, type WorkspaceApi } from '../../src/ui/controller.ts'

const bytes = Uint8Array.from([1, 2, 3, 4])
const documentId = `sha256:${createHash('sha256').update(bytes).digest('hex')}` as ResearchWorkspacePaper['sources'][number]['documentId']
const document = { documentId, parserId: 'native', parserVersion: 'v1' }
const source = { id: 'source' as ResearchWorkspacePaper['sources'][number]['id'], documentId, parsers: [{ id: 'native', version: 'v1' }] }
const paper: ResearchWorkspacePaper = { id: 'paper' as ResearchWorkspacePaper['id'], title: '论文', authors: [], year: null, sources: [source] }
const page = { ...document, pageIndex: 0, pageCount: 2, blocks: [], nextOffset: null }

function setup(overrides: Partial<WorkspaceApi> = {}) {
  const api: WorkspaceApi = {
    createQuestion: vi.fn(async () => { throw new Error('No question creation requested') }),
    tasks: vi.fn(async () => { throw new Error('No task question selected') }),
    task: vi.fn(async () => { throw new Error('No task selected') }),
    taskHistory: vi.fn(async () => { throw new Error('No task selected') }),
    taskSources: vi.fn(async () => { throw new Error('No task selected') }),
    createTask: vi.fn(async () => { throw new Error('No task creation requested') }),
    updateTask: vi.fn(async () => { throw new Error('No task update requested') }),
    observations: vi.fn(async () => { throw new Error('No result selected') }),
    observationChoices: vi.fn(async () => { throw new Error('No result selected') }),
    observationReviews: vi.fn(async () => ({ reviews: [], nextOffset: null })),
    reviewObservation: vi.fn<WorkspaceApi['reviewObservation']>(async () => ({ status: 'researcher-required' })),
    report: vi.fn(async () => { throw new Error('No report requested') }),
    notes: vi.fn(async () => { throw new Error('No selected question') }),
    matrix: vi.fn(async () => { throw new Error('No selected question') }),
    writeNote: vi.fn(async () => { throw new Error('No note requested') }),
    questions: vi.fn(async () => ({ questions: [], nextOffset: null })),
    claims: vi.fn(async () => { throw new Error('No selected question') }),
    reviewers: vi.fn(async () => []),
    registerReviewer: vi.fn(async () => { throw new Error('No reviewer registration requested') }),
    evidence: vi.fn(async () => { throw new Error('No evidence selected') }),
    evidenceChoices: vi.fn(async () => ({ evidence: [], nextOffset: null })),
    reviews: vi.fn(async () => ({ reviews: [], nextOffset: null })),
    reviewClaim: vi.fn<WorkspaceApi['reviewClaim']>(async () => ({ status: 'researcher-required' })),
    list: vi.fn(async () => ({ papers: [paper], total: 1, nextOffset: null })),
    position: vi.fn(async () => null),
    source: vi.fn<WorkspaceApi['source']>(async (id, offset) => ({ documentId: id, offset, totalBytes: bytes.length,
      base64: Buffer.from(bytes.slice(offset, offset + 2)).toString('base64'), nextOffset: offset === 0 ? 2 : null })),
    page: vi.fn<WorkspaceApi['page']>(async (doc, index) => ({ ...page, ...doc, pageIndex: index })),
    savePosition: vi.fn<WorkspaceApi['savePosition']>(async (doc, index, revision) => ({
      status: 'saved', position: { ...doc, pageIndex: index, revision: revision + 1 },
    })),
    ...overrides,
  }
  return { api, controller: new WorkspaceController(api) }
}

afterEach(() => { vi.restoreAllMocks() })

describe('research workspace controller', () => {
  it('opens the saved parser revision, verifies source bytes, and releases replaced URLs', async () => {
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second')
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const { api, controller } = setup({ position: async () => ({ ...document, parserVersion: 'saved', pageIndex: 1, revision: 4 }) })
    await controller.open(paper, source)
    expect(api.page).toHaveBeenCalledWith({ ...document, parserVersion: 'saved' }, 1, 0)
    expect(controller.getSnapshot().reading).toMatchObject({ revision: 4, page: { pageIndex: 1 }, sourceUrl: 'blob:first' })
    const blob = create.mock.calls[0]![0]
    if (!(blob instanceof Blob)) throw new Error('The reader did not create a PDF Blob')
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes)
    await controller.open(paper, source)
    expect(revoke).toHaveBeenCalledWith('blob:first')
    controller.dispose()
    expect(revoke).toHaveBeenCalledWith('blob:second')
  })

  it('publishes navigation only after its durable save and reports competing edits', async () => {
    let commit!: (value: Awaited<ReturnType<WorkspaceApi['savePosition']>>) => void
    const { controller } = setup({ savePosition: () => new Promise((resolve) => { commit = resolve }) })
    await controller.open(paper, source)
    const turn = controller.turn(1)
    await vi.waitFor(() => { expect(commit).toBeDefined() })
    expect(controller.getSnapshot().reading?.page.pageIndex).toBe(0)
    commit({ status: 'saved', position: { ...document, pageIndex: 1, revision: 1 } })
    await turn
    expect(controller.getSnapshot().reading?.page.pageIndex).toBe(1)
    const stale = controller.turn(0)
    await Promise.resolve()
    commit({ status: 'conflict', position: { ...document, pageIndex: 0, revision: 2 } })
    await stale
    expect(controller.getSnapshot().reading?.page.pageIndex).toBe(1)
    expect(controller.getSnapshot().error).toContain('其他窗口')
    controller.dispose()
  })

  it('ignores an older catalog response and contains subscriber failures', async () => {
    let finish!: (value: Awaited<ReturnType<WorkspaceApi['list']>>) => void
    const { controller } = setup({ list: query => query === 'old'
      ? new Promise((resolve) => { finish = resolve }) : Promise.resolve({ papers: [], total: 0, nextOffset: null }) })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    controller.subscribe(() => { throw new Error('listener') })
    const listener = vi.fn()
    controller.subscribe(listener)
    const old = controller.load('old', 0)
    await controller.load('new', 0)
    finish({ papers: [paper], total: 1, nextOffset: null })
    await old
    expect(controller.getSnapshot()).toMatchObject({ catalog: { total: 0 }, busy: false, error: null })
    expect(listener).toHaveBeenCalled()
    controller.dispose()
  })

  it('does not publish a PDF or request more chunks after disposal during a source read', async () => {
    let finish!: (value: Awaited<ReturnType<WorkspaceApi['source']>>) => void
    const { api, controller } = setup({ source: vi.fn<WorkspaceApi['source']>(() => new Promise((resolve) => { finish = resolve })) })
    const create = vi.spyOn(URL, 'createObjectURL')
    const opening = controller.open(paper, source)
    await vi.waitFor(() => { expect(finish).toBeDefined() })
    controller.dispose()
    finish({ documentId, offset: 0, totalBytes: 4, base64: 'AQI=', nextOffset: 2 })
    await opening
    expect(api.source).toHaveBeenCalledTimes(1)
    expect(create).not.toHaveBeenCalled()
    expect(controller.getSnapshot().reading).toBeNull()
  })

  it('stops remaining source chunks when the page read fails', async () => {
    let finish!: (value: Awaited<ReturnType<WorkspaceApi['source']>>) => void
    const { api, controller } = setup({
      page: async () => { throw new Error('Page unavailable') },
      source: vi.fn<WorkspaceApi['source']>(() => new Promise((resolve) => { finish = resolve })),
    })
    await controller.open(paper, source)
    expect(controller.getSnapshot().error).toBe('Page unavailable')
    finish({ documentId, offset: 0, totalBytes: 4, base64: 'AQI=', nextOffset: 2 })
    await Promise.resolve()
    await Promise.resolve()
    expect(api.source).toHaveBeenCalledTimes(1)
    controller.dispose()
  })

  it.each([
    { chunk: { documentId, offset: 0, totalBytes: 4, base64: 'AQI=', nextOffset: 3 }, error: '不连续' },
    { chunk: { documentId, offset: 0, totalBytes: 2, base64: 'AQI=', nextOffset: null }, error: '不一致' },
  ])('rejects corrupt or incomplete source data before opening it: $error', async ({ chunk, error }) => {
    const { controller } = setup({ source: async () => chunk })
    await controller.open(paper, source)
    expect(controller.getSnapshot()).toMatchObject({ reading: null, busy: false })
    expect(controller.getSnapshot().error).toContain(error)
    controller.dispose()
  })
})

it('waits for review commit, refreshes question counts, and retains stale decisions for reassessment', async () => {
  type ClaimsPage = Awaited<ReturnType<WorkspaceApi['claims']>>
  type ReviewRequest = Parameters<WorkspaceApi['reviewClaim']>[1]
  const questionId = 'question' as ReviewRequest['questionId']
  const claimId = 'claim' as ReviewRequest['claimId']
  const reviewerId = 'reviewer' as Parameters<WorkspaceApi['reviewClaim']>[0]
  const initial: ClaimsPage = { question: { id: questionId, title: 'Question', question: 'What is supported?', revision: 1, claimCount: 1 },
    claims: [{ claim: { id: claimId, kind: 'inference', facet: 'result', text: 'A hypothesis', evidenceLinks: [],
      createdBy: { kind: 'agent', id: reviewerId }, createdAt: '2026-09-08T00:00:00.000Z' }, active: true, latestReview: null }], nextOffset: null }
  let committed = false
  let commit!: (value: Awaited<ReturnType<WorkspaceApi['reviewClaim']>>) => void
  const { api, controller } = setup({
    questions: async () => ({ questions: [initial.question], nextOffset: null }),
    claims: async () => committed ? { ...initial, question: { ...initial.question, revision: 2, claimCount: 2 } } : initial,
    reviewClaim: vi.fn<WorkspaceApi['reviewClaim']>(() => new Promise((resolve) => { commit = resolve })),
  })
  const request: ReviewRequest = { questionId, claimId, expectedRevision: 1, decision: 'accepted', evidenceSupport: 'uncertain',
    rationale: 'Retain as a hypothesis.', counterEvidenceIds: [] }
  await controller.loadQuestions(0)
  await controller.loadClaims(questionId, 0)
  await controller.selectClaim(initial.claims[0]!)
  await controller.submitReview(request)
  expect(controller.getSnapshot().error).toContain('请先选择')
  expect(api.reviewClaim).not.toHaveBeenCalled()
  controller.chooseReviewer(reviewerId)
  const saved = controller.submitReview(request)
  await vi.waitFor(() => { expect(commit).toBeDefined() })
  expect(controller.getSnapshot().selectedClaim).toEqual(initial.claims[0])
  expect(controller.getSnapshot().questions?.questions[0]?.claimCount).toBe(1)
  committed = true
  commit({ status: 'created', revision: 2 })
  await saved
  expect(controller.getSnapshot().questions?.questions[0]?.claimCount).toBe(2)
  expect(controller.getSnapshot().selectedClaim).toBeNull()
  await controller.selectClaim(initial.claims[0]!)
  const stale = controller.submitReview(request)
  commit({ status: 'stale-revision', questionId, expectedRevision: 1, currentRevision: 2 })
  await stale
  expect(controller.getSnapshot().error).toContain('重新核对')
  expect(controller.getSnapshot().selectedClaim).toEqual(initial.claims[0])
  expect(api.reviewClaim).toHaveBeenCalledTimes(2)
  controller.dispose()
})

it('distinguishes a refused note from a committed note whose refresh failed', async () => {
  type NoteRequest = Parameters<WorkspaceApi['writeNote']>[1]
  const question = { id: 'question' as NoteRequest['questionId'], title: 'Notebook', question: 'What is supported?', revision: 2, claimCount: 0 }
  const reviewer = 'reviewer' as Parameters<WorkspaceApi['writeNote']>[0]
  const request: NoteRequest = { questionId: question.id, expectedRevision: 2, kind: 'note', text: 'A reading note',
    evidenceId: 'evidence' as NoteRequest['evidenceId'] }
  const writeNote = vi.fn<WorkspaceApi['writeNote']>()
  const notes = vi.fn<WorkspaceApi['notes']>().mockResolvedValue({ question, notes: [], nextOffset: null })
  const { api, controller } = setup({ notes, writeNote,
    claims: async () => ({ question, claims: [], nextOffset: null }),
  })
  await controller.loadClaims(question.id, 0)
  await controller.loadNotes(0)
  expect(await controller.submitNote(request)).toBe(false)
  expect(api.writeNote).not.toHaveBeenCalled()
  controller.chooseReviewer(reviewer)
  writeNote.mockResolvedValueOnce({ status: 'stale-revision', questionId: question.id, expectedRevision: 2, currentRevision: 3 })
  expect(await controller.submitNote(request)).toBe(false)
  expect(controller.getSnapshot().notes?.question.revision).toBe(2)
  expect(controller.getSnapshot().error).toContain('重新核对')
  writeNote.mockResolvedValueOnce({ status: 'created', revision: 3 })
  notes.mockRejectedValueOnce(new Error('Connection lost'))
  expect(await controller.submitNote(request)).toBe(true)
  expect(controller.getSnapshot().error).toContain('笔记已保存，但刷新失败')
  expect(controller.getSnapshot().notes).toBeNull()
  expect(writeNote).toHaveBeenCalledTimes(2)
  controller.dispose()
})

function exportFixture(): ResearchReportBundle {
  const files: ResearchReportFile[] = [
    { name: 'report.md', mediaType: 'text/markdown', text: '精确报告😀\n' },
    { name: 'report.tex', mediaType: 'application/x-tex', text: 'LaTeX\n' },
    { name: 'references.bib', mediaType: 'application/x-bibtex', text: 'BibTeX\n' },
    { name: 'references.csl.json', mediaType: 'application/json', text: '[]\n' },
    { name: 'provenance.json', mediaType: 'application/json', text: '{}\n' },
  ]
  return { questionId: 'question' as ResearchReportBundle['questionId'], revision: 2,
    files, digest: `sha256:${createHash('sha256').update(JSON.stringify(files.map(file =>
      [file.name, file.mediaType, file.text]))).digest('hex')}` as ResearchReportBundle['digest'],
    summary: { currentClaims: 0, unreviewedClaims: 0, rejectedClaims: 0, includedFindings: 0,
      excludedFindings: 0, evidenceCount: 0, missingFacetCount: 0 } }
}

it('verifies complete report downloads and releases them on question refresh and disposal', async () => {
  const bundle = exportFixture()
  const report = vi.fn<WorkspaceApi['report']>().mockResolvedValue({ status: 'ready', bundle })
  const create = vi.spyOn(URL, 'createObjectURL')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const question = { id: bundle.questionId, revision: bundle.revision, title: 'Question', question: 'Which evidence?', claimCount: 0 }
  const { controller } = setup({ report, claims: async () => ({ question, claims: [], nextOffset: null }) })
  await controller.prepareReport()
  expect(report).not.toHaveBeenCalled()
  await controller.loadClaims(question.id, 0)
  await controller.prepareReport()
  expect(report).toHaveBeenCalledWith({ questionId: question.id, expectedRevision: 2 })
  expect(controller.getSnapshot().report).toEqual(bundle)
  expect(controller.getSnapshot().reportDownloads.map(file => file.name)).toEqual(bundle.files.map(file => file.name))
  for (const [index, call] of create.mock.calls.entries()) {
    const blob = call[0]
    if (!(blob instanceof Blob)) throw new Error('Expected a report Blob')
    expect(await blob.text()).toBe(bundle.files[index]!.text)
  }
  const first = controller.getSnapshot().reportDownloads
  await controller.loadClaims(question.id, 0)
  expect(controller.getSnapshot().reportDownloads).toEqual([])
  for (const file of first) expect(revoke).toHaveBeenCalledWith(file.url)
  await controller.prepareReport()
  const second = controller.getSnapshot().reportDownloads
  controller.dispose()
  for (const file of second) expect(revoke).toHaveBeenCalledWith(file.url)
})

it('retains an existing report on refusal or corrupt content and cleans up partial download allocation', async () => {
  const bundle = exportFixture()
  const report = vi.fn<WorkspaceApi['report']>().mockResolvedValue({ status: 'ready', bundle })
  const create = vi.spyOn(URL, 'createObjectURL')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const question = { id: bundle.questionId, revision: 2, title: 'Question', question: 'Which evidence?', claimCount: 0 }
  const { controller } = setup({ report, claims: async () => ({ question, claims: [], nextOffset: null }) })
  await controller.loadClaims(question.id, 0)
  await controller.prepareReport()
  const previous = controller.getSnapshot().reportDownloads
  for (const result of [
    { status: 'stale-revision' as const, currentRevision: 3 },
    { status: 'capacity' as const, maxReportBytes: 1 },
    { status: 'question-not-found' as const },
    { status: 'ready' as const, bundle: { ...bundle, files: bundle.files.map(file => ({ ...file, text: 'corrupted' })) } },
    { status: 'ready' as const, bundle: { ...bundle, revision: 3 } },
  ]) {
    report.mockResolvedValueOnce(result)
    await controller.prepareReport()
    expect(controller.getSnapshot().error).not.toBeNull()
    expect(controller.getSnapshot().reportDownloads).toEqual(previous)
  }
  expect(create).toHaveBeenCalledTimes(5)
  expect(revoke).not.toHaveBeenCalled()
  create.mockReturnValueOnce('blob:partial').mockImplementationOnce(() => { throw new Error('Allocation failed') })
  await controller.prepareReport()
  expect(controller.getSnapshot().error).toBe('Allocation failed')
  expect(revoke).toHaveBeenCalledWith('blob:partial')
  expect(controller.getSnapshot().reportDownloads).toEqual(previous)
  controller.dispose()
})

it('keeps result review drafts on refusal and reports a confirmed commit independently of refresh failure', async () => {
  type Result = Awaited<ReturnType<WorkspaceApi['observations']>>
  const question: Result['question'] = { id: 'results' as Result['question']['id'], title: 'Results', question: 'What changed?', revision: 4, claimCount: 1 }
  const reviewObservation = vi.fn<WorkspaceApi['reviewObservation']>()
  const observations = vi.fn<WorkspaceApi['observations']>().mockResolvedValue({ question, observations: [], nextOffset: null })
  const { controller } = setup({ reviewObservation, observations, claims: async () => ({ question, claims: [], nextOffset: null }) })
  await controller.loadClaims(question.id, 0)
  await controller.loadObservations(0)
  const request: Parameters<WorkspaceApi['reviewObservation']>[1] = { questionId: question.id, expectedRevision: 4,
    observationId: 'result' as Parameters<WorkspaceApi['reviewObservation']>[1]['observationId'],
    decision: 'accepted', evidenceSupport: 'supports', rationale: 'Checked the source', counterEvidenceIds: [] }
  expect(await controller.submitObservationReview(request)).toBe(false)
  expect(reviewObservation).not.toHaveBeenCalled()
  controller.chooseReviewer('reviewer' as Parameters<WorkspaceApi['reviewObservation']>[0])
  reviewObservation.mockResolvedValueOnce({ status: 'stale-revision', questionId: question.id, expectedRevision: 4, currentRevision: 5 })
  expect(await controller.submitObservationReview(request)).toBe(false)
  expect(controller.getSnapshot().error).toContain('重新核对')
  expect(controller.getSnapshot().observations?.question.revision).toBe(4)
  reviewObservation.mockResolvedValueOnce({ status: 'created', revision: 5 })
  observations.mockRejectedValueOnce(new Error('Connection unavailable'))
  expect(await controller.submitObservationReview(request)).toBe(true)
  expect(controller.getSnapshot().error).toContain('结果审阅已保存，但刷新失败')
  expect(controller.getSnapshot().observations).toBeNull()
  expect(reviewObservation).toHaveBeenCalledTimes(2)
  controller.dispose()
})

function taskSetup(overrides: Partial<WorkspaceApi> = {}) {
  type Progress = Awaited<ReturnType<WorkspaceApi['task']>>
  const question = { id: 'task-question' as Progress['task']['questionId'], title: 'Review', question: 'What is supported?', revision: 3, claimCount: 0 }
  const task: Progress['task'] = { id: 'task' as Progress['task']['id'], questionId: question.id,
    kind: 'topic-review', revision: 4, phase: 'active', reason: '' }
  const progress: Progress = { task, questionRevision: question.revision, completedStages: [], nextStage: 'acquisition',
    stale: false, requiresResume: false, issues: [], nextOffset: null }
  const choices = [source, { ...source, id: 'second-source' as typeof source.id }].map(value => ({ paperId: paper.id, title: paper.title, source: value }))
  const state = setup({
    claims: async () => ({ question, claims: [], nextOffset: null }),
    task: vi.fn(async () => progress),
    tasks: async () => ({ question, tasks: [task], nextOffset: null }),
    taskHistory: async () => ({ taskRevision: task.revision, checkpoints: [], nextOffset: null }),
    taskSources: vi.fn<WorkspaceApi['taskSources']>(async (_id, revision, checkpoint, offset) => ({ taskRevision: revision,
      sources: checkpoint === null ? choices.slice(offset, offset + 1) : [], nextOffset: checkpoint === null && offset === 0 ? 1 : null })),
    ...overrides,
  })
  return { ...state, task, question, progress, choices }
}

it('loads every saved source before publishing an editable task and keeps history browsing separate', async () => {
  const { api, controller, task, question, choices } = taskSetup()
  await controller.loadClaims(question.id, 0)
  await controller.selectTask(task.id)
  expect(api.taskSources).toHaveBeenNthCalledWith(2, task.id, task.revision, null, 1)
  const selection = choices.map(value => ({ paperId: value.paperId, sourceVersionId: value.source.id }))
  expect(controller.getSnapshot().taskSelection).toEqual(selection)
  expect(controller.getSnapshot().taskSources?.sources).toHaveLength(1)
  await controller.loadTaskSources(1, 0)
  expect(controller.getSnapshot().taskSources?.sources).toEqual([])
  expect(controller.getSnapshot().taskSelection).toEqual(selection)
  controller.dispose()
})

it('does not expose a partial editable task when its source continuation fails', async () => {
  const { controller, task, question } = taskSetup({ taskSources: async (_id, revision, _checkpoint, offset) => {
    if (offset !== 0) throw new Error('Task revision changed')
    return { taskRevision: revision, sources: [{ paperId: paper.id, title: paper.title, source }], nextOffset: 1 }
  } })
  await controller.loadClaims(question.id, 0)
  await controller.selectTask(task.id)
  expect(controller.getSnapshot()).toMatchObject({ task: null, taskSelection: [], error: 'Task revision changed' })
  controller.dispose()
})

it('retains the committed task receipt when refresh fails and never repeats creation', async () => {
  const createTask = vi.fn<WorkspaceApi['createTask']>(async () => ({ status: 'saved', taskId: 'created-task' as Parameters<WorkspaceApi['task']>[0], revision: 0 }))
  const { controller, question } = taskSetup({ createTask, task: async () => { throw new Error('Connection interrupted') } })
  await controller.loadClaims(question.id, 0)
  controller.chooseReviewer('reviewer' as Parameters<WorkspaceApi['createTask']>[0])
  expect(await controller.createTask('topic-review')).toBe(true)
  expect(controller.getSnapshot()).toMatchObject({ task: null, taskReceipt: { taskId: 'created-task', revision: 0 } })
  expect(controller.getSnapshot().error).toContain('任务已保存')
  expect(createTask).toHaveBeenCalledTimes(1)
  expect(createTask).toHaveBeenCalledWith('reviewer', { questionId: question.id, kind: 'topic-review' })
  controller.dispose()
})

it('preserves the inspected task on a competing update and requires explicit reassessment', async () => {
  const updateTask = vi.fn<WorkspaceApi['updateTask']>(async () => ({ status: 'stale-revision', currentRevision: 5 }))
  const { controller, question, task, progress } = taskSetup({ updateTask })
  await controller.loadClaims(question.id, 0)
  await controller.selectTask(task.id)
  controller.chooseReviewer('reviewer' as Parameters<WorkspaceApi['updateTask']>[0])
  expect(await controller.updateTask({ action: 'pause', taskId: task.id, expectedRevision: task.revision, reason: 'Review pending' })).toBe(false)
  expect(controller.getSnapshot().task).toEqual(progress)
  expect(controller.getSnapshot().error).toContain('重新核对')
  expect(updateTask).toHaveBeenCalledTimes(1)
  controller.dispose()
})

it('retains the displayed catalog filter when a replacement search fails', async () => {
  const { controller } = setup({ list: async (query) => {
    if (query === 'failed') throw new Error('Search unavailable')
    return { papers: [paper], total: 2, nextOffset: 1 }
  } })
  await controller.load('displayed', 0)
  await controller.load('failed', 0)
  expect(controller.getSnapshot()).toMatchObject({ catalogQuery: 'displayed', catalog: { nextOffset: 1 }, error: 'Search unavailable' })
  controller.dispose()
})
