/** Research workspace persistence and exact-source access through real domain providers. */

import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { MemoryMediaPool, MemoryStorageBackend } from '../helpers/memory-backend.ts'
import ResearchDocuments, { ResearchDocumentId } from '../../src/research-document/index.ts'
import ResearchInformation, { ResearchDecimal, ResearchAuthorId, ResearchClaimId, ResearchEvidenceId, ResearchQuestionId } from '../../src/research-information/index.ts'
import ResearchReport, { type Config as ReportConfig } from '../../src/research-report/index.ts'
import ResearchLibrary from '../../src/research-library/index.ts'
import ResearchTasks from '../../src/research-task/index.ts'
import * as Archive from '../../src/research-document-storage/index.ts'
import ResearchWorkspace, { researchWorkspaceDomainSpec, type Config } from '../../src/research-workspace/index.ts'

async function mount(pool = new MemoryMediaPool(), config: Config = {}, reportConfig: ReportConfig = {}) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory' })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  await ctx.plugin(ResearchDocuments)
  await ctx.plugin(ResearchLibrary)
  await ctx.plugin(ResearchInformation)
  await ctx.plugin(ResearchReport, reportConfig)
  await ctx.plugin(ResearchTasks)
  await ctx.plugin(Archive)
  try {
    const fiber = await ctx.plugin(ResearchWorkspace, config)
    return { ctx, pool, fiber, api: ctx.researchWorkspace }
  } catch (error) { await ctx.fiber.dispose(); throw error }
}

async function seed(setup: Awaited<ReturnType<typeof mount>>) {
  setup.ctx.researchDocuments.registerParser({
    id: 'fixture', available: () => true, supports: () => true,
    parse: async () => ({ parserVersion: 'v1', extraction: { text: 'native', layout: 'approximate' },
      pages: [0, 1].map(pageIndex => ({ pageIndex, width: 100, height: 100,
        blocks: [0, 1].map(index => ({ kind: 'paragraph', text: `原文😀${pageIndex}-${index}`, bbox: { x: 0, y: 0, width: 1, height: 1 } })) })) }),
  })
  const bytes = Uint8Array.from([1, 2, 3, 4, 5, 6, 7])
  const document = await setup.ctx.researchDocuments.import({ bytes, mediaType: 'application/pdf' })
  const registered = await setup.ctx.researchLibrary.register({
    metadata: { title: 'Scientific paper', authors: ['Researcher'], year: 2026, origin: 'declared' },
    document: { documentId: document.id, mediaType: document.mediaType, parserId: document.parser.id,
      parserVersion: document.parser.version, extraction: document.extraction,
      pageCount: document.pageCount, blockCount: document.blockCount },
  })
  expect(registered.status).toBe('created')
  return { bytes, document: { documentId: document.id, parserId: 'fixture', parserVersion: 'v1' } }
}

describe('research workspace', () => {
  it('browses metadata and reconstructs exact source chunks and page text', async () => {
    const setup = await mount(undefined, { sourceChunkBytes: 3, maxItems: 1, maxTextChars: 5 })
    try {
      const { bytes, document } = await seed(setup)
      expect(setup.api.list('scien', 0)).toMatchObject({ total: 1, nextOffset: null, papers: [{ title: 'Scientific paper', year: 2026 }] })
      expect(setup.api.list('none', 0).papers).toEqual([])
      let offset: number | null = 0
      const parts: Buffer[] = []
      while (offset !== null) {
        const chunk = await setup.api.source(document.documentId, offset)
        expect(chunk.offset).toBe(offset)
        parts.push(Buffer.from(chunk.base64, 'base64'))
        offset = chunk.nextOffset
      }
      expect(new Uint8Array(Buffer.concat(parts))).toEqual(bytes)
      expect(await setup.api.page(document, 0, 0)).toMatchObject({ pageIndex: 0, pageCount: 2, nextOffset: 1,
        blocks: [{ text: '原文😀0-', textTruncated: true }] })
      expect((await setup.api.page(document, 0, 1)).nextOffset).toBeNull()
      expect((await setup.api.page(document, 0, 2)).blocks).toEqual([])
      expect(setup.api.position(document.documentId)).toBeNull()
    } finally { await setup.ctx.fiber.dispose() }
  })

  it('serializes competing position writes and restores them without a parser after restart', async () => {
    const first = await mount()
    const { document } = await seed(first)
    const results = await Promise.all([first.api.savePosition(document, 1, 0), first.api.savePosition(document, 0, 0)])
    expect(results.map(result => result.status)).toEqual(['saved', 'conflict'])
    expect(first.api.position(document.documentId)).toMatchObject({ pageIndex: 1, revision: 1 })
    await first.ctx.fiber.dispose()
    const second = await mount(first.pool)
    try {
      expect(second.api.position(document.documentId)).toMatchObject({ ...document, pageIndex: 1, revision: 1 })
      expect((await second.api.page(document, 1, 0)).blocks[0]?.text).toBe('原文😀1-0')
      expect(await second.api.savePosition(document, 0, 1)).toMatchObject({ status: 'saved', position: { revision: 2 } })
    } finally { await second.ctx.fiber.dispose() }
  })

  it('rejects unregistered sources, unknown revisions, invalid offsets and oversized responses', async () => {
    const setup = await mount()
    try {
      const { document } = await seed(setup)
      expect(() => setup.api.list('', -1)).toThrow('offset')
      expect(() => setup.api.list('x'.repeat(2001), 0)).toThrow('maxTextChars')
      expect(() => setup.api.list('', 2)).toThrow('offset')
      await expect(setup.api.source(ResearchDocumentId(`sha256:${'0'.repeat(64)}`), 0)).rejects.toThrow('registered')
      await expect(setup.api.source(document.documentId, 8)).rejects.toThrow('offset')
      await expect(setup.api.page({ ...document, parserVersion: 'unknown' }, 0, 0)).rejects.toThrow('registered')
      await expect(setup.api.page(document, 2, 0)).rejects.toThrow('Page')
      await expect(setup.api.page(document, 0, 3)).rejects.toThrow('offset')
      await expect(setup.api.savePosition(document, 2, 0)).rejects.toThrow('outside')
      expect(setup.api.position(document.documentId)).toBeNull()
      await setup.fiber.dispose()
      await setup.ctx.plugin(ResearchWorkspace, { maxResponseBytes: 1 })
      expect(() => setup.ctx.researchWorkspace.list('', 0)).toThrow('maxResponseBytes')
      await expect(setup.ctx.researchWorkspace.source(document.documentId, 0)).rejects.toThrow('maxResponseBytes')
    } finally { await setup.ctx.fiber.dispose() }
  })

  it('rejects a durable position outside its archived source pages at startup', async () => {
    const first = await mount()
    const { document } = await seed(first)
    await first.fiber.dispose()
    const domain = await first.ctx.storageDomain.open(researchWorkspaceDomainSpec)
    await domain.table('positions').put(document.documentId, { ...document, pageIndex: 999, revision: 1 })
    await domain.close()
    await first.ctx.fiber.dispose()
    await expect(mount(first.pool)).rejects.toThrow('page count')
  })
})

it('requires registered reviewers and retains complete evidence, decisions, and local identities across restart', async () => {
  const setup = await mount()
  const author = { kind: 'agent' as const, id: ResearchAuthorId('fixture-agent') }
  const question = await setup.ctx.researchInformation.writeQuestion({ action: 'create', title: 'Review', question: 'Which inference is supported?', author })
  if (question.status !== 'created') throw new Error(question.status)
  const claim = await setup.ctx.researchInformation.writeClaim({
    questionId: question.question.id, expectedRevision: question.question.revision,
    kind: 'inference', facet: 'result', text: 'An untested interpretation', evidenceLinks: [], author })
  if (claim.status !== 'created') throw new Error(claim.status)
  const request = { questionId: claim.question.id, expectedRevision: claim.question.revision, claimId: claim.claimId,
    decision: 'rejected' as const, evidenceSupport: 'unsupported' as const, rationale: 'No supporting evidence has been captured.', counterEvidenceIds: [] }
  let reviewer: Awaited<ReturnType<typeof setup.api.registerReviewer>>
  try {
    await expect(setup.api.reviewClaim(ResearchAuthorId('unregistered'), request)).rejects.toThrow('registered local reviewer')
    reviewer = await setup.api.registerReviewer('  陈研究员  ')
    expect(reviewer.displayName).toBe('陈研究员')
    expect(setup.api.questions(0).questions[0]?.claimCount).toBe(1)
    expect(setup.api.claims(claim.question.id, 0).claims[0]?.latestReview).toBeNull()
    expect(await setup.api.reviewClaim(reviewer.id, request)).toMatchObject({ status: 'created', revision: 2 })
    expect(await setup.api.reviewClaim(reviewer.id, request)).toMatchObject({ status: 'stale-revision' })
    expect(setup.api.reviews(claim.question.id, claim.claimId, 0).reviews[0]).toMatchObject({
      decision: 'rejected', createdBy: { kind: 'researcher', id: reviewer.id }, rationale: request.rationale,
    })
    expect(setup.api.claims(claim.question.id, 0).claims[0]).toMatchObject({ active: true, latestReview: { decision: 'rejected' } })
    expect(() => setup.api.reviews(claim.question.id, ResearchClaimId('absent'), 0)).toThrow('Claim does not belong')
    expect(() => setup.api.questions(2)).toThrow('Offset exceeds')
  } finally { await setup.ctx.fiber.dispose() }
  const restored = await mount(setup.pool)
  try {
    expect(restored.api.reviewers()).toEqual([reviewer!])
    expect(restored.api.claims(claim.question.id, 0).claims[0]?.latestReview?.rationale).toBe(request.rationale)
  } finally { await restored.ctx.fiber.dispose() }
})

async function seedQuestion(setup: Awaited<ReturnType<typeof mount>>) {
  const { document } = await seed(setup)
  const parsed = await setup.ctx.researchDocuments.restore(document.documentId, { id: document.parserId, version: document.parserVersion })
  const paper = setup.ctx.researchLibrary.list()[0]!
  const block = parsed.pages[0]!.blocks[0]!
  const author = { kind: 'agent' as const, id: ResearchAuthorId('fixture-agent') }
  const created = await setup.ctx.researchInformation.writeQuestion({ action: 'create', title: 'Evidence notebook', question: 'What is supported?', author })
  if (created.status !== 'created') throw new Error(created.status)
  const captured = await setup.ctx.researchInformation.captureEvidence({ questionId: created.question.id, expectedRevision: 0,
    paperId: paper.id, sourceVersionId: paper.sourceVersions[0]!.id, locator: block.locator,
    blockText: block.text, sectionPath: block.sectionPath, author })
  if (captured.status !== 'created') throw new Error(captured.status)
  return { question: captured.question, evidenceId: captured.evidenceId, paper, author }
}

it('persists researcher note revisions, refuses stale or unanchored writes, and retains exact history after restart', async () => {
  const setup = await mount(undefined, { maxItems: 1 })
  const { question, evidenceId } = await seedQuestion(setup)
  const reviewer = await setup.api.registerReviewer('陈')
  const request = { questionId: question.id, expectedRevision: question.revision, evidenceId, kind: 'note' as const, text: '仅在报告条件下成立。😀' }
  try {
    await expect(setup.api.writeNote(ResearchAuthorId('missing'), request)).rejects.toThrow('registered')
    expect(await setup.api.writeNote(reviewer.id, { ...request, evidenceId: ResearchEvidenceId('missing') })).toMatchObject({ status: 'evidence-not-found' })
    expect(await setup.api.writeNote(reviewer.id, { ...request, kind: 'passage-question' })).toMatchObject({ status: 'passage-question-selection-required' })
    expect(await setup.api.writeNote(reviewer.id, request)).toEqual({ status: 'created', revision: 2 })
    expect(await setup.api.writeNote(reviewer.id, request)).toMatchObject({ status: 'stale-revision' })
    const original = setup.api.notes(question.id, 0).notes[0]!.note
    expect(original).toMatchObject({ text: request.text, evidenceId, createdBy: { kind: 'researcher', id: reviewer.id } })
    expect(await setup.api.writeNote(reviewer.id, { ...request, expectedRevision: 2, text: '还需要核对实验设置。', supersedes: original.id })).toEqual({ status: 'created', revision: 3 })
    expect(setup.api.notes(question.id, 0)).toMatchObject({ nextOffset: 1, notes: [{ active: false, note: { id: original.id } }] })
    expect(setup.api.notes(question.id, 1)).toMatchObject({ nextOffset: null,
      notes: [{ active: true, note: { supersedes: original.id } }] })
    expect(await setup.api.writeNote(reviewer.id, { ...request, expectedRevision: 3, supersedes: original.id })).toMatchObject({ status: 'supersedes-reading-note-inactive' })
    expect(() => setup.api.notes(question.id, 3)).toThrow('Offset exceeds')
    await setup.fiber.dispose()
    await setup.ctx.plugin(ResearchWorkspace, { maxResponseBytes: 1 })
    expect(() => setup.ctx.researchWorkspace.notes(question.id, 0)).toThrow('maxResponseBytes')
    expect(() => setup.ctx.researchWorkspace.writeNote(reviewer.id, { ...request, expectedRevision: 3 })).toThrow('maxResponseBytes')
    expect(setup.ctx.researchInformation.get(question.id)?.revision).toBe(3)
  } finally { await setup.ctx.fiber.dispose() }
  const restored = await mount(setup.pool)
  try {
    expect(restored.api.notes(question.id, 0).notes.map(value => [value.active, value.note.text])).toEqual([
      [false, request.text], [true, '还需要核对实验设置。'],
    ])
  } finally { await restored.ctx.fiber.dispose() }
})

it('separates source coverage, review decisions, inference, and historical replacements in matrix drill-down', async () => {
  const setup = await mount(undefined, { maxItems: 1 })
  try {
    const { question, evidenceId, paper, author } = await seedQuestion(setup)
    const info = setup.ctx.researchInformation
    const first = await info.writeClaim({ questionId: question.id, expectedRevision: 1, kind: 'source-statement', facet: 'result',
      text: 'Reported result', evidenceLinks: [{ evidenceId, relation: 'supports' }], author })
    if (first.status !== 'created') throw new Error(first.status)
    await info.writeClaim({ questionId: question.id, expectedRevision: 2, kind: 'inference', facet: 'result',
      text: 'An interpretation', evidenceLinks: [{ evidenceId, relation: 'background' }], author })
    const reviewer = await setup.api.registerReviewer('陈')
    const base = { questionId: question.id, claimId: first.claimId, evidenceSupport: 'partial' as const, rationale: 'Limited conditions', counterEvidenceIds: [] }
    await setup.api.reviewClaim(reviewer.id, { ...base, expectedRevision: 3, decision: 'rejected' })
    let matrix = setup.api.matrix(question.id, 0)
    expect(matrix.excludedInferenceCount).toBe(1)
    expect(matrix.rows[0]?.cells.find(cell => cell.facet === 'result')).toEqual({ facet: 'result', total: 1, accepted: 0, rejected: 1, unreviewed: 0 })
    expect(matrix.rows[0]?.cells.find(cell => cell.facet === 'method')?.total).toBe(0)
    const filter = { paperId: paper.id, facet: 'result' as const }
    expect(setup.api.claims(question.id, 0, filter).claims.map(value => value.claim.id)).toEqual([first.claimId])
    await setup.api.reviewClaim(reviewer.id, { ...base, expectedRevision: 4, decision: 'revised',
      replacement: { text: 'Qualified result', evidenceLinks: [{ evidenceId, relation: 'supports' }] } })
    matrix = setup.api.matrix(question.id, 0)
    expect(matrix.rows[0]?.cells.find(cell => cell.facet === 'result')).toEqual({ facet: 'result', total: 1, accepted: 1, rejected: 0, unreviewed: 0 })
    expect(setup.api.claims(question.id, 0, filter).claims[0]?.claim.text).toBe('Qualified result')
    expect(setup.api.claims(question.id, 0, { ...filter, facet: 'method' }).claims).toEqual([])
    expect(() => setup.api.matrix(question.id, -1)).toThrow('offset')
    expect(() => setup.api.matrix(question.id, 2)).toThrow('Offset exceeds')
    const secondDocument = await setup.ctx.researchDocuments.import({ bytes: Uint8Array.from([8, 9]), mediaType: 'application/pdf' })
    const secondPaper = await setup.ctx.researchLibrary.register({ metadata: { title: 'Second paper', origin: 'declared' },
      document: { documentId: secondDocument.id, mediaType: secondDocument.mediaType, parserId: secondDocument.parser.id,
        parserVersion: secondDocument.parser.version, extraction: secondDocument.extraction,
        pageCount: secondDocument.pageCount, blockCount: secondDocument.blockCount } })
    if (secondPaper.status !== 'created' || secondPaper.sourceVersionId === undefined) throw new Error('Second source missing')
    const secondBlock = secondDocument.pages[0]!.blocks[0]!
    const secondEvidence = await info.captureEvidence({ questionId: question.id, expectedRevision: 5,
      paperId: secondPaper.paper.id, sourceVersionId: secondPaper.sourceVersionId,
      locator: secondBlock.locator, blockText: secondBlock.text, sectionPath: secondBlock.sectionPath, author })
    if (secondEvidence.status !== 'created') throw new Error(secondEvidence.status)
    expect(setup.api.matrix(question.id, 0).nextOffset).toBe(1)
    expect(setup.api.matrix(question.id, 1)).toMatchObject({ nextOffset: null, rows: [{ title: 'Second paper' }] })
    expect(setup.api.matrix(question.id, 1).rows[0]!.cells.every(cell => cell.total === 0)).toBe(true)
    await info.writeClaim({ questionId: question.id, expectedRevision: 6, kind: 'source-statement', facet: 'method',
      text: 'Second method', evidenceLinks: [{ evidenceId: secondEvidence.evidenceId, relation: 'supports' }], author })
    expect(setup.api.matrix(question.id, 1).rows[0]!.cells.find(cell => cell.facet === 'method'))
      .toEqual({ facet: 'method', total: 1, accepted: 0, rejected: 0, unreviewed: 1 })
    expect(setup.api.claims(question.id, 0, { paperId: secondPaper.paper.id, facet: 'method' }).claims[0]?.claim.text).toBe('Second method')
    expect(setup.api.claims(question.id, 0, { paperId: paper.id, facet: 'method' }).claims).toEqual([])
    await setup.fiber.dispose()
    await setup.ctx.plugin(ResearchWorkspace, { maxResponseBytes: 1 })
    expect(() => setup.ctx.researchWorkspace.matrix(question.id, 0)).toThrow('maxResponseBytes')
  } finally { await setup.ctx.fiber.dispose() }
})

it('exports the inspected revision without writes and refuses stale, missing, and oversized reports', async () => {
  const setup = await mount()
  const { question } = await seedQuestion(setup)
  const request = { questionId: question.id, expectedRevision: question.revision }
  let readyBytes = 0
  try {
    const result = setup.api.report(request)
    if (result.status !== 'ready') throw new Error(result.status)
    expect(result.bundle.files.map(file => file.name)).toEqual([
      'report.md', 'report.tex', 'references.bib', 'references.csl.json', 'provenance.json',
    ])
    expect(result.bundle.files.find(file => file.name === 'report.md')?.text).toContain('原文😀0-0')
    const changedLibrary = vi.spyOn(setup.ctx.researchLibrary, 'list').mockReturnValueOnce([])
    expect(() => setup.api.report(request)).toThrow('unavailable paper')
    changedLibrary.mockRestore()
    readyBytes = Buffer.byteLength(JSON.stringify(result))
    expect(readyBytes).toBeGreaterThan(JSON.stringify(result).length)
    expect(setup.api.report({ ...request, expectedRevision: 0 })).toEqual({ status: 'stale-revision', currentRevision: 1 })
    expect(setup.api.report({ ...request, questionId: ResearchQuestionId('missing') })).toEqual({ status: 'question-not-found' })
    expect(() => setup.api.report({ ...request, expectedRevision: -1 })).toThrow('expectedRevision')
    expect(setup.ctx.researchInformation.get(question.id)).toEqual(question)
    await setup.fiber.dispose()
    await setup.ctx.plugin(ResearchWorkspace, { maxResponseBytes: readyBytes - 1 })
    expect(() => setup.ctx.researchWorkspace.report(request)).toThrow('maxResponseBytes')
  } finally { await setup.ctx.fiber.dispose() }
  for (const limit of [readyBytes, readyBytes - 1, 1]) {
    const restored = await mount(setup.pool, {}, { maxReportBytes: limit })
    try {
      const result = restored.api.report(request)
      expect(result.status).toBe(limit === readyBytes ? 'ready' : 'capacity')
      if (limit !== readyBytes) expect(result).toEqual({ status: 'capacity', maxReportBytes: limit })
      expect(restored.ctx.researchInformation.get(question.id)).toEqual(question)
    } finally { await restored.ctx.fiber.dispose() }
  }
})

it('reviews exact result revisions through local identities, preserves history, and exports rejected-source warnings', async () => {
  const setup = await mount(undefined, { maxItems: 1 })
  let restarted: Awaited<ReturnType<typeof mount>> | undefined
  try {
    const seed = await seedQuestion(setup)
    const info = setup.ctx.researchInformation
    let question = seed.question
    const references = new Map<string, { entityId: import('../../src/research-information/index.ts').ResearchEntityId; sourceClaimId: ResearchClaimId }>()
    for (const kind of ['method', 'dataset', 'metric'] as const) {
      const claim = await info.writeClaim({ questionId: question.id, expectedRevision: question.revision, kind: 'source-statement',
        facet: kind, text: `${kind} source`, evidenceLinks: [{ evidenceId: seed.evidenceId, relation: 'supports' }], author: seed.author })
      if (claim.status !== 'created') throw new Error(claim.status)
      const entity = await info.writeEntity({ questionId: question.id, expectedRevision: claim.question.revision,
        kind, canonicalName: kind, sourceClaimIds: [claim.claimId], author: seed.author })
      if (entity.status !== 'created') throw new Error(entity.status)
      question = entity.question
      references.set(kind, { entityId: entity.entityId, sourceClaimId: claim.claimId })
    }
    const result = await info.writeClaim({ questionId: question.id, expectedRevision: question.revision, kind: 'source-statement', facet: 'result',
      text: 'Observed 85.5%', evidenceLinks: [{ evidenceId: seed.evidenceId, relation: 'supports' }], author: seed.author })
    if (result.status !== 'created') throw new Error(result.status)
    const created = await info.writeObservation({ questionId: question.id, expectedRevision: result.question.revision,
      resultClaimId: result.claimId, method: { ...references.get('method')!, role: 'proposed' },
      dataset: { ...references.get('dataset')!, split: { status: 'not-recorded' } }, metric: references.get('metric')!,
      value: ResearchDecimal('85'), unit: { status: 'reported', symbol: '%' }, valueStatistic: 'point estimate', evaluationProtocol: { status: 'not-recorded' },
      uncertainty: { status: 'not-recorded' }, conditions: { status: 'not-recorded' }, author: seed.author })
    if (created.status !== 'created') throw new Error(created.status)
    const original = created.question.observations[0]!
    expect(setup.api.observations(question.id, 0)).toMatchObject({ observations: [{ observation: original,
      state: { active: true, stale: false, review: null, rejectedClaimIds: [] }, paperTitle: 'Scientific paper', evidenceIds: [seed.evidenceId] }] })
    let offset: number | null = 0
    const choices = []
    while (offset !== null) {
      const page = setup.api.observationChoices(question.id, original.id, offset)
      expect(page.questionRevision).toBe(created.question.revision)
      choices.push(...page.choices); offset = page.nextOffset
    }
    expect(choices.filter(value => value.kind === 'claim')).toHaveLength(4)
    expect(choices.filter(value => value.kind === 'entity')).toHaveLength(3)
    const reviewer = await setup.api.registerReviewer('结果审阅者')
    const review = { questionId: question.id, expectedRevision: created.question.revision, observationId: original.id,
      decision: 'revised' as const, evidenceSupport: 'supports' as const, rationale: '原文为 85.5%', qualifications: '仅为点估计', counterEvidenceIds: [seed.evidenceId],
      replacement: { ...original, value: ResearchDecimal('85.5'), dataset: { ...original.dataset, split: { status: 'reported' as const, value: 'test', sourceClaimId: result.claimId } },
        uncertainty: { status: 'reported' as const, value: { kind: 'confidence-interval' as const, lower: ResearchDecimal('84'), upper: ResearchDecimal('87'), confidenceLevelPercent: ResearchDecimal('95') } } } }
    await expect(setup.api.reviewObservation(ResearchAuthorId('unknown'), review)).rejects.toThrow('Select a registered local reviewer')
    expect(await setup.api.reviewObservation(reviewer.id, review)).toEqual({ status: 'created', revision: created.question.revision + 1 })
    const replacement = setup.api.observations(question.id, 1).observations[0]!
    expect(replacement).toMatchObject({ observation: { value: ResearchDecimal('85.5'), supersedes: original.id }, state: { active: true, review: { decision: 'revised' } } })
    expect(setup.api.observationReviews(question.id, replacement.observation.id, 0).reviews).toHaveLength(1)
    const report = setup.api.report({ questionId: question.id, expectedRevision: created.question.revision + 1 })
    if (report.status !== 'ready') throw new Error(report.status)
    const markdown = report.bundle.files.find(value => value.name === 'report.md')!.text
    expect(markdown).toContain('人工接受的结果记录')
    expect(markdown).toContain('95% 置信区间 84 至 87')
    expect(markdown).toContain('原文为 85.5%')
    expect(await setup.api.reviewObservation(reviewer.id, review)).toMatchObject({ status: 'stale-revision' })
    const rejected = await info.reviewClaim({ questionId: question.id, expectedRevision: created.question.revision + 1,
      claimId: result.claimId,
      decision: 'rejected', evidenceSupport: 'unsupported', rationale: '来源不能支持该结果', counterEvidenceIds: [], author: { kind: 'researcher', id: reviewer.id } })
    if (rejected.status !== 'created') throw new Error(rejected.status)
    expect(setup.api.observations(question.id, 1).observations[0]!.state.rejectedClaimIds).toEqual([result.claimId])
    const blockedReport = setup.api.report({ questionId: question.id, expectedRevision: rejected.question.revision })
    if (blockedReport.status !== 'ready') throw new Error(blockedReport.status)
    expect(blockedReport.bundle.files[0]!.text).toContain('不作为当前结论采用')
    expect(blockedReport.bundle.files[0]!.text).toContain('历史人工接受不解除此警告')
    const saved = setup.api.observationReviews(question.id, original.id, 0)
    await setup.ctx.fiber.dispose()
    restarted = await mount(setup.pool, { maxItems: 1 })
    expect(restarted.api.observationReviews(question.id, original.id, 0)).toEqual(saved)
    expect(restarted.api.observations(question.id, 1).observations[0]!.state.rejectedClaimIds).toEqual([result.claimId])
  } finally { await restarted?.ctx.fiber.dispose(); await setup.ctx.fiber.dispose() }
})

it('attributes task checkpoints to registered researchers and preserves revision-pinned history across restart', async () => {
  let setup = await mount(undefined, { maxItems: 1 })
  const pool = setup.pool
  try {
    await seed(setup)
    const reviewer = await setup.api.registerReviewer('任务研究者')
    const question = await setup.api.createQuestion(reviewer.id, '任务问题', '核对来源证据。')
    expect(setup.ctx.researchInformation.get(question.id)?.createdBy).toEqual({ kind: 'researcher', id: reviewer.id })
    expect(() => setup.api.createTask(ResearchAuthorId('unknown'), { questionId: question.id, kind: 'single-paper' })).toThrow('registered local reviewer')
    const created = await setup.api.createTask(reviewer.id, { questionId: question.id, kind: 'single-paper' })
    if (created.status !== 'saved') throw new Error('Task not created')
    const taskId = created.taskId
    expect(setup.api.tasks(question.id, 0).tasks).toMatchObject([{ id: taskId, revision: 0 }])
    const paper = setup.ctx.researchLibrary.list()[0]!
    const sources = [{ paperId: paper.id, sourceVersionId: paper.sourceVersions[0]!.id }]
    expect(await setup.api.updateTask(reviewer.id, { action: 'checkpoint', taskId, expectedRevision: 0,
      expectedQuestionRevision: question.revision + 1, stage: 'acquisition', sources, summary: '选定来源' })).toMatchObject({ status: 'stale-question' })
    expect(setup.api.taskHistory(taskId, 0, 0).checkpoints).toEqual([])
    expect(await setup.api.updateTask(reviewer.id, { action: 'checkpoint', taskId, expectedRevision: 0,
      expectedQuestionRevision: question.revision, stage: 'acquisition', sources, summary: '选定来源' })).toEqual({ status: 'saved', taskId, revision: 1 })
    expect(() => setup.api.taskSources(taskId, 0, null, 0)).toThrow('refresh')
    expect(setup.api.taskSources(taskId, 1, null, 0).sources)
      .toMatchObject([{ paperId: paper.id, source: { id: sources[0]!.sourceVersionId } }])
    expect(setup.api.taskHistory(taskId, 1, 0).checkpoints).toMatchObject([{ taskRevision: 1, stage: 'acquisition', effective: true,
      createdBy: { kind: 'researcher', id: reviewer.id }, sourceCount: 1 }])
    const denial = await setup.api.updateTask(reviewer.id, { action: 'checkpoint', taskId, expectedRevision: 1,
      expectedQuestionRevision: question.revision, stage: 'extraction', summary: '没有凭空生成证据' })
    expect(denial.status).toBe('cannot-advance')
    expect(setup.api.task(taskId, 0).task.revision).toBe(1)
    await setup.ctx.fiber.dispose()
    setup = await mount(pool, { maxItems: 1 })
    expect(setup.api.task(taskId, 0)).toMatchObject({ requiresResume: true, completedStages: ['acquisition'], nextStage: 'extraction' })
    expect(await setup.api.updateTask(reviewer.id, { action: 'resume', taskId, expectedRevision: 1, reason: '继续核对证据' }))
      .toEqual({ status: 'saved', taskId, revision: 2 })
    expect(await setup.api.updateTask(reviewer.id, { action: 'rewind', taskId, expectedRevision: 2, stage: 'acquisition', reason: '重新选择来源' }))
      .toEqual({ status: 'saved', taskId, revision: 3 })
    expect(setup.api.taskHistory(taskId, 3, 0).checkpoints).toMatchObject([{ effective: false, summary: '选定来源' }])
    expect(setup.api.taskSources(taskId, 3, 1, 0).sources).toHaveLength(1)
    expect(() => setup.api.taskSources(taskId, 3, 999, 0)).toThrow('checkpoint not found')
  } finally { await setup.ctx.fiber.dispose() }
})

it('rejects task and question creation before writing when their committed receipts cannot fit', async () => {
  const first = await mount()
  const reviewer = await first.api.registerReviewer('研究者')
  const question = await first.api.createQuestion(reviewer.id, '保留问题', '检查响应上限。')
  await first.ctx.fiber.dispose()
  const setup = await mount(first.pool, { maxResponseBytes: 64 })
  try {
    expect(() => setup.api.createTask(reviewer.id, { questionId: question.id, kind: 'single-paper' })).toThrow('maxResponseBytes')
    expect(() => setup.api.createQuestion(reviewer.id, '不能创建', '完整回执超过限制。')).toThrow('maxResponseBytes')
    expect(setup.ctx.researchTasks.list()).toEqual([])
    expect(setup.ctx.researchInformation.list()).toHaveLength(1)
  } finally { await setup.ctx.fiber.dispose() }
})


it('reports absent execution configuration and requires a registered researcher for execution requests', async () => {
  const { ctx, api } = await mount()
  try {
    const reviewer = await api.registerReviewer('Researcher')
    const question = await api.createQuestion(reviewer.id, 'Execution availability', 'What can be executed?')
    const created = await api.createTask(reviewer.id, { questionId: question.id, kind: 'single-paper' })
    expect(created.status).toBe('saved')
    if (created.status !== 'saved') throw new Error(created.status)
    expect(api.taskRuns(created.taskId, 0)).toEqual({ status: 'unavailable' })
    expect(() => api.startTaskRun(reviewer.id, created.taskId, created.revision)).toThrow('not configured')
    expect(() => api.startTaskRun(ResearchAuthorId('unregistered'), created.taskId, created.revision)).toThrow('registered local reviewer')
  } finally { await ctx.fiber.dispose() }
})
