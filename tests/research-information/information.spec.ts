import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import type { StorageBackend } from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import {
  ResearchDocumentBlockId,
  ResearchDocumentId,
  ResearchDocumentQuoteHash,
  type ResearchDocumentBlockLocator,
} from '../../src/research-document/index.ts'
import ResearchLibrary, {
  ResearchPaperId,
  ResearchSourceVersionId,
  type ResearchPaperRecord,
} from '../../src/research-library/index.ts'
import {
  MemoryMediaPool,
  MemoryStorageBackend,
} from '../helpers/memory-backend.ts'
import ResearchInformation, {
  ResearchAuthorId,
  ResearchClaimId,
  ResearchComparisonProtocolId,
  ResearchDecimal,
  ResearchEntityId,
  ResearchEvidenceId,
  ResearchEvidenceTextHash,
  ResearchFindingId,
  ResearchObservationId,
  ResearchQuestionId,
  ResearchReadingNoteId,
  ResearchSynthesisId,
  type CaptureResearchEvidenceRequest,
  type Config,
  type ResearchAuthorship,
  type ResearchClaim,
  type ResearchComparisonProtocol,
  type ResearchEvidence,
  type ResearchEntity,
  type ResearchObservation,
  type ResearchQuestionRecord,
  type ResearchReadingNote,
  type ResearchSynthesis,
  type WriteResearchObservationRequest,
} from '../../src/research-information/index.ts'

const earlierAt = '2026-08-31T23:59:00.000Z'
const storedAt = '2026-09-01T00:00:00.000Z'
const laterAt = '2026-09-01T00:01:00.000Z'
const latestAt = '2026-09-01T00:02:00.000Z'
const offsetFutureAt = '2026-09-01T00:00:00.000-05:00'
const author: ResearchAuthorship = { kind: 'agent', id: ResearchAuthorId('agent-one') }

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function documentId(character: string) {
  return ResearchDocumentId(`sha256:${character.repeat(64)}`)
}

function paper(character: string): ResearchPaperRecord {
  return {
    id: ResearchPaperId(`paper-${character}`),
    metadata: { title: { value: `Paper ${character}`, origin: 'declared' } },
    externalIds: [],
    acquisitionState: 'imported',
    sourceVersions: [{
      id: ResearchSourceVersionId(`source-${character}`),
      documentId: documentId(character),
      state: 'imported',
      aliases: [],
      observations: [{
        parserId: 'fixture-parser',
        parserVersion: 'parser-v1',
        mediaType: 'application/pdf',
        extraction: { text: 'native', layout: 'approximate' },
        pageCount: 1,
        blockCount: 2,
        observedAt: storedAt,
      }],
      createdAt: storedAt,
      updatedAt: storedAt,
    }],
    createdAt: storedAt,
    updatedAt: storedAt,
  }
}

function locator(character: string, text: string, suffix = '0'): ResearchDocumentBlockLocator {
  return {
    kind: 'block',
    documentId: documentId(character),
    blockId: ResearchDocumentBlockId(`block-${character}-${suffix}`),
    parserId: 'fixture-parser',
    parserVersion: 'parser-v1',
    pageIndex: 0,
    pageLabel: '1',
    bbox: { x: 0.1, y: 0.2, width: 0.7, height: 0.1 },
    quoteHash: ResearchDocumentQuoteHash(`sha256:${hash(text)}`),
  }
}

function evidence(character = 'a', text = 'Alpha evidence'): ResearchEvidence {
  return {
    id: ResearchEvidenceId(`evidence-${character}`),
    paperId: ResearchPaperId(`paper-${character}`),
    sourceVersionId: ResearchSourceVersionId(`source-${character}`),
    locator: locator(character, text),
    blockText: text,
    sectionPath: ['Results'],
    createdBy: author,
    createdAt: storedAt,
  }
}

function claim(id = 'claim-a', evidenceId = ResearchEvidenceId('evidence-a')): ResearchClaim {
  return {
    id: ResearchClaimId(id),
    kind: 'source-statement',
    facet: 'result',
    text: `Claim ${id}`,
    evidenceLinks: [{ evidenceId, relation: 'supports' }],
    createdBy: author,
    createdAt: storedAt,
  }
}

function synthesis(id = 'synthesis-a', claimId = ResearchClaimId('claim-a')): ResearchSynthesis {
  return {
    id: ResearchSynthesisId(id),
    findings: [{
      id: ResearchFindingId(`finding-${id}`),
      kind: 'source-summary',
      stance: 'agreement',
      text: `Finding ${id}`,
      claimIds: [claimId],
    }],
    createdBy: author,
    createdAt: laterAt,
  }
}

function readingNote(
  id = 'reading-note-a',
  evidenceId = ResearchEvidenceId('evidence-a'),
): ResearchReadingNote {
  return {
    id: ResearchReadingNoteId(id),
    kind: 'note',
    text: `Note ${id}`,
    evidenceId,
    createdBy: author,
    createdAt: laterAt,
  }
}

function entity(
  id = 'entity-a',
  claimId = ResearchClaimId('claim-a'),
): ResearchEntity {
  return {
    id: ResearchEntityId(id),
    kind: 'method',
    canonicalName: `Method ${id}`,
    sourceClaimIds: [claimId],
    supersedes: [],
    createdBy: author,
    createdAt: laterAt,
  }
}

function storedQuestion(): ResearchQuestionRecord {
  return {
    id: ResearchQuestionId('question-a'),
    revision: 3,
    title: 'Stored question',
    question: 'What does the evidence show?',
    createdBy: author,
    updatedBy: author,
    evidence: [evidence()],
    claims: [claim()],
    syntheses: [synthesis()],
    readingNotes: [],
    entities: [],
    observations: [],
    comparisonProtocols: [],
    createdAt: storedAt,
    updatedAt: laterAt,
  }
}

function poolWithQuestions(records: readonly [string, ResearchQuestionRecord][] = []): MemoryMediaPool {
  const pool = new MemoryMediaPool()
  pool.versions.set('research_library', 1)
  pool.media.set('research_library', {
    global: null,
    tables: new Map([['papers', new Map([
      ['paper-a', paper('a')],
      ['paper-b', paper('b')],
    ])]]),
  })
  if (records.length > 0) {
    pool.versions.set('research_information', 4)
    pool.media.set('research_information', {
      global: null,
      tables: new Map([['questions', new Map(records)]]),
    })
  }
  return pool
}

async function mount(options: {
  pool?: MemoryMediaPool
  backend?: StorageBackend
  config?: Config
} = {}) {
  const pool = options.pool ?? poolWithQuestions()
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', options.backend ?? new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  const libraryFiber = await ctx.plugin(ResearchLibrary)
  const informationFiber = await ctx.plugin(ResearchInformation, options.config ?? {})
  return { ctx, pool, libraryFiber, informationFiber, information: ctx.researchInformation }
}

async function createQuestion(information: ResearchInformation) {
  const result = await information.writeQuestion({
    action: 'create',
    title: '  Comparison\u00a0study ',
    question: ' How   do the results compare? ',
    author: { kind: 'agent', id: ResearchAuthorId(' agent-one ') },
  })
  expect(result.status).toBe('created')
  if (result.status !== 'created') throw new Error(`expected question creation, got ${result.status}`)
  return result.question
}

function captureRequest(
  question: ResearchQuestionRecord,
  character = 'a',
  text = 'Alpha evidence',
  suffix = '0',
): CaptureResearchEvidenceRequest {
  return {
    questionId: question.id,
    expectedRevision: question.revision,
    paperId: ResearchPaperId(`paper-${character}`),
    sourceVersionId: ResearchSourceVersionId(`source-${character}`),
    locator: locator(character, text, suffix),
    blockText: text,
    sectionPath: ['Results'],
    author,
  }
}

async function capture(
  information: ResearchInformation,
  question: ResearchQuestionRecord,
  character = 'a',
  text = 'Alpha evidence',
  suffix = '0',
) {
  const result = await information.captureEvidence(captureRequest(question, character, text, suffix))
  expect(result.status).toBe('created')
  if (result.status !== 'created') throw new Error(`expected evidence creation, got ${result.status}`)
  return result
}

async function createObservationFoundation(information: ResearchInformation) {
  let question = await createQuestion(information)
  const evidenceA = await capture(information, question, 'a', 'Paper A evaluation evidence', 'observation')
  const evidenceB = await capture(
    information,
    evidenceA.question,
    'b',
    'Paper B evaluation evidence',
    'observation',
  )
  question = evidenceB.question
  const claimIds: Record<'a' | 'b', Partial<Record<'result' | 'method' | 'dataset' | 'metric', ResearchClaimId>>> = {
    a: {},
    b: {},
  }
  for (const character of ['a', 'b'] as const) {
    const evidenceId = character === 'a' ? evidenceA.evidenceId : evidenceB.evidenceId
    for (const facet of ['result', 'method', 'dataset', 'metric'] as const) {
      const written = await information.writeClaim({
        questionId: question.id,
        expectedRevision: question.revision,
        kind: 'source-statement',
        facet,
        text: `Paper ${character.toUpperCase()} ${facet} statement.`,
        evidenceLinks: [{ evidenceId, relation: 'supports' }],
        author,
      })
      if (written.status !== 'created') throw new Error(`expected ${facet} claim for paper ${character}`)
      claimIds[character][facet] = written.claimId
      question = written.question
    }
  }
  const entityIds: Partial<Record<'method' | 'dataset' | 'metric', ResearchEntityId>> = {}
  for (const kind of ['method', 'dataset', 'metric'] as const) {
    const written = await information.writeEntity({
      questionId: question.id,
      expectedRevision: question.revision,
      kind,
      canonicalName: `Shared ${kind}`,
      sourceClaimIds: [claimIds.a[kind]!, claimIds.b[kind]!],
      author,
    })
    if (written.status !== 'created') throw new Error(`expected ${kind} entity`)
    entityIds[kind] = written.entityId
    question = written.question
  }
  return {
    question,
    claims: {
      a: claimIds.a as Record<'result' | 'method' | 'dataset' | 'metric', ResearchClaimId>,
      b: claimIds.b as Record<'result' | 'method' | 'dataset' | 'metric', ResearchClaimId>,
    },
    entities: entityIds as Record<'method' | 'dataset' | 'metric', ResearchEntityId>,
  }
}

function observationRequest(
  foundation: Awaited<ReturnType<typeof createObservationFoundation>>,
  character: 'a' | 'b',
  expectedRevision: number,
): WriteResearchObservationRequest {
  const claims = foundation.claims[character]
  return {
    questionId: foundation.question.id,
    expectedRevision,
    resultClaimId: claims.result,
    method: {
      entityId: foundation.entities.method,
      sourceClaimId: claims.method,
      role: character === 'a' ? 'proposed' : 'baseline',
    },
    dataset: {
      entityId: foundation.entities.dataset,
      sourceClaimId: claims.dataset,
      split: { status: 'reported', value: ' official test ', sourceClaimId: claims.dataset },
    },
    metric: {
      entityId: foundation.entities.metric,
      sourceClaimId: claims.metric,
    },
    value: ResearchDecimal(character === 'a' ? '+9.200e1' : '90.0'),
    unit: { status: 'reported', symbol: ' % ' },
    valueStatistic: ' mean over five runs ',
    evaluationProtocol: {
      status: 'reported',
      value: ' frozen evaluation ',
      sourceClaimId: claims.result,
    },
    uncertainty: {
      status: 'reported',
      value: {
        kind: 'confidence-interval',
        lower: ResearchDecimal(character === 'a' ? '91' : '89'),
        upper: ResearchDecimal(character === 'a' ? '93' : '91'),
        confidenceLevelPercent: ResearchDecimal('95.0'),
      },
    },
    conditions: {
      status: 'reported',
      values: [
        {
          name: ' temperature ',
          value: ' 0 ',
          sourceClaimId: claims.result,
          comparisonRole: 'descriptive',
        },
        {
          name: ' decoding ',
          value: ' greedy ',
          sourceClaimId: claims.method,
          comparisonRole: 'must-match',
        },
      ],
    },
    author,
  }
}

async function createComparableState(information: ResearchInformation) {
  const foundation = await createObservationFoundation(information)
  const observationA = await information.writeObservation(
    observationRequest(foundation, 'a', foundation.question.revision),
  )
  if (observationA.status !== 'created') throw new Error('expected observation A')
  const observationB = await information.writeObservation(
    observationRequest(foundation, 'b', observationA.question.revision),
  )
  if (observationB.status !== 'created') throw new Error('expected observation B')
  return { foundation, observationA, observationB }
}

async function createProtocolState(information: ResearchInformation) {
  const comparable = await createComparableState(information)
  const protocol = await information.writeComparisonProtocol({
    questionId: comparable.foundation.question.id,
    expectedRevision: comparable.observationB.question.revision,
    observationIds: [comparable.observationA.observationId, comparable.observationB.observationId],
    direction: 'higher-is-better',
    referenceObservationId: comparable.observationA.observationId,
    compatibilityRationale: 'Compatible reported evaluation setup.',
    author,
  })
  if (protocol.status !== 'created') throw new Error('expected comparison protocol')
  return { ...comparable, protocol, record: protocol.question }
}

function cloneRecord(record: ResearchQuestionRecord): ResearchQuestionRecord {
  return structuredClone(record)
}

describe('ResearchInformation question and evidence lifecycle', () => {
  it('brands public ids and creates, reads, orders, updates, and compare-and-sets questions', async () => {
    expect(ResearchQuestionId('q')).toBe('q')
    expect(ResearchEvidenceId('e')).toBe('e')
    expect(ResearchClaimId('c')).toBe('c')
    expect(ResearchSynthesisId('s')).toBe('s')
    expect(ResearchFindingId('f')).toBe('f')
    expect(ResearchReadingNoteId('n')).toBe('n')
    expect(ResearchEntityId('r')).toBe('r')
    expect(ResearchAuthorId('a')).toBe('a')
    expect(ResearchEvidenceTextHash('h')).toBe('h')

    const { information } = await mount()
    const first = await createQuestion(information)
    expect(first).toMatchObject({
      revision: 0,
      title: 'Comparison study',
      question: 'How do the results compare?',
      createdBy: { kind: 'agent', id: 'agent-one' },
    })
    expect(information.get(first.id)).toEqual(first)
    expect(information.get(ResearchQuestionId('missing'))).toBeUndefined()
    const fieldCapped = await mount({ config: { maxFieldBytes: 40 } })
    const cappedQuestion = await createQuestion(fieldCapped.information)
    await expect(fieldCapped.information.writeQuestion({
      action: 'update', questionId: cappedQuestion.id, expectedRevision: 0,
      title: 'x'.repeat(41), author,
    })).resolves.toEqual({ status: 'capacity', resource: 'field-bytes' })

    const unchanged = await information.writeQuestion({
      action: 'update', questionId: first.id, expectedRevision: 0,
      title: first.title, author,
    })
    expect(unchanged.status).toBe('unchanged')
    const updated = await information.writeQuestion({
      action: 'update', questionId: first.id, expectedRevision: 0,
      question: 'Which result is stronger?', author,
    })
    expect(updated.status).toBe('updated')
    if (updated.status !== 'updated') throw new Error('expected update')
    expect(updated.question).toMatchObject({ revision: 1, title: first.title, question: 'Which result is stronger?' })
    await expect(information.writeQuestion({
      action: 'update', questionId: first.id, expectedRevision: 0, title: 'Stale', author,
    })).resolves.toMatchObject({ status: 'stale-revision', currentRevision: 1 })
    await expect(information.writeQuestion({
      action: 'update', questionId: ResearchQuestionId('missing'), expectedRevision: 0,
      title: 'Missing', author,
    })).resolves.toEqual({ status: 'question-not-found', questionId: 'missing' })
    expect(() => information.writeQuestion({
      action: 'update', questionId: first.id, expectedRevision: 1, author,
    })).toThrow(/requires title or question/)
    expect(() => information.writeQuestion({
      action: 'update', questionId: first.id, expectedRevision: -1, title: 'Bad', author,
    })).toThrow(/non-negative safe integer/)

    const secondResult = await information.writeQuestion({
      action: 'create', title: 'Second', question: 'Second?', author,
    })
    expect(secondResult.status).toBe('created')
    expect(information.list()).toHaveLength(2)
  })

  it('locks question text after research content exists but keeps the title editable', async () => {
    const { information } = await mount()
    const question = await createQuestion(information)
    const reframed = await information.writeQuestion({
      action: 'update',
      questionId: question.id,
      expectedRevision: question.revision,
      question: 'Which result is stronger?',
      author,
    })
    expect(reframed.status).toBe('updated')
    if (reframed.status !== 'updated') throw new Error('expected question update')
    const captured = await capture(information, reframed.question)

    await expect(information.writeQuestion({
      action: 'update',
      questionId: question.id,
      expectedRevision: captured.question.revision,
      question: 'Can this question still change?',
      author,
    })).resolves.toEqual({ status: 'question-text-locked', questionId: question.id })
    const retitled = await information.writeQuestion({
      action: 'update',
      questionId: question.id,
      expectedRevision: captured.question.revision,
      title: 'Retitled study',
      question: captured.question.question,
      author,
    })
    expect(retitled.status).toBe('updated')
    if (retitled.status !== 'updated') throw new Error('expected title update')
    expect(retitled.question).toMatchObject({
      title: 'Retitled study',
      question: 'Which result is stronger?',
      revision: captured.question.revision + 1,
    })

    const base = storedQuestion()
    const inferenceClaim: ResearchClaim = {
      ...base.claims[0]!, kind: 'inference', evidenceLinks: [],
    }
    const inferenceSynthesis: ResearchSynthesis = {
      ...base.syntheses[0]!,
      findings: [{
        ...base.syntheses[0]!.findings[0]!, kind: 'inference', claimIds: [],
      }],
    }
    for (const record of [
      { ...base, evidence: [], claims: [inferenceClaim], syntheses: [] },
      { ...base, evidence: [], claims: [], syntheses: [inferenceSynthesis] },
    ]) {
      const mounted = await mount({
        pool: poolWithQuestions([[String(record.id), record]]),
      })
      await expect(mounted.information.writeQuestion({
        action: 'update',
        questionId: record.id,
        expectedRevision: record.revision,
        question: 'A rewritten question?',
        author,
      })).resolves.toEqual({ status: 'question-text-locked', questionId: record.id })
    }
  })

  it('checks every durable provenance relation and captures a unique exact selection', async () => {
    const { information } = await mount()
    const question = await createQuestion(information)
    const base = captureRequest(question)
    await expect(information.captureEvidence({ ...base, questionId: ResearchQuestionId('missing') }))
      .resolves.toMatchObject({ status: 'question-not-found' })
    await expect(information.captureEvidence({ ...base, expectedRevision: 1 }))
      .resolves.toMatchObject({ status: 'stale-revision' })
    await expect(information.captureEvidence({ ...base, paperId: ResearchPaperId('missing') }))
      .resolves.toEqual({ status: 'paper-not-found', paperId: 'missing' })
    await expect(information.captureEvidence({
      ...base, sourceVersionId: ResearchSourceVersionId('missing'),
    })).resolves.toMatchObject({ status: 'source-not-found' })
    await expect(information.captureEvidence({
      ...base, locator: { ...base.locator, documentId: documentId('b') },
    })).resolves.toEqual({ status: 'provenance-mismatch', reason: 'document' })
    await expect(information.captureEvidence({
      ...base, locator: { ...base.locator, parserVersion: 'unknown' },
    })).resolves.toEqual({ status: 'provenance-mismatch', reason: 'parser-observation' })
    await expect(information.captureEvidence({
      ...base, locator: { ...base.locator, quoteHash: ResearchDocumentQuoteHash(`sha256:${'0'.repeat(64)}`) },
    })).resolves.toEqual({ status: 'provenance-mismatch', reason: 'block-hash' })

    const selected = 'évidence'
    const selectedText = `Alpha ${selected} result`
    const selectedBase = captureRequest(question, 'a', selectedText, 'selection')
    const selection = {
      text: selected,
      startUtf8Byte: 6,
      endUtf8Byte: 15,
      textHash: ResearchEvidenceTextHash(`sha256:${hash(selected)}`),
    }
    await expect(information.captureEvidence({
      ...selectedBase,
      selection: { ...selection, textHash: ResearchEvidenceTextHash(`sha256:${'0'.repeat(64)}`) },
    })).resolves.toEqual({ status: 'provenance-mismatch', reason: 'selection-hash' })
    await expect(information.captureEvidence({
      ...selectedBase, selection: { ...selection, startUtf8Byte: 0 },
    })).resolves.toEqual({ status: 'provenance-mismatch', reason: 'selection-offset' })
    await expect(information.captureEvidence({
      ...captureRequest(question, 'a', 'same same', 'ambiguous'),
      selection: {
        text: 'same', startUtf8Byte: 0, endUtf8Byte: 4,
        textHash: ResearchEvidenceTextHash(`sha256:${hash('same')}`),
      },
    })).resolves.toEqual({ status: 'provenance-mismatch', reason: 'selection-offset' })

    const created = await information.captureEvidence({ ...selectedBase, selection })
    expect(created.status).toBe('created')
    if (created.status !== 'created') throw new Error('expected evidence')
    expect(created.question.evidence[0]).toMatchObject({
      blockText: selectedText,
      selection: { text: selected, startUtf8Byte: 6, endUtf8Byte: 15 },
    })
    await expect(information.captureEvidence({
      ...selectedBase, expectedRevision: created.question.revision, selection,
    })).resolves.toMatchObject({ status: 'unchanged', evidenceId: created.evidenceId })
  })

  it('enforces input and aggregate capacities without publishing partial state', async () => {
    const capped = await mount({
      config: {
        maxQuestions: 1,
        maxEvidencePerQuestion: 1,
        maxClaimsPerQuestion: 1,
        maxSynthesesPerQuestion: 1,
        maxFindingsPerSynthesis: 1,
        maxEvidenceLinksPerClaim: 1,
        maxClaimReferencesPerFinding: 1,
        maxFieldBytes: 40,
        maxBlockBytes: 20,
      },
    })
    const question = await createQuestion(capped.information)
    await expect(capped.information.writeQuestion({
      action: 'create', title: 'Other', question: 'Other?', author,
    })).resolves.toEqual({ status: 'capacity', resource: 'questions' })
    await expect(capped.information.writeQuestion({
      action: 'create', title: 'x'.repeat(41), question: 'Valid', author,
    })).resolves.toEqual({ status: 'capacity', resource: 'field-bytes' })
    expect(() => capped.information.writeQuestion({
      action: 'create', title: ' ', question: 'Valid', author,
    })).toThrow(/must not be empty/)
    expect(() => capped.information.captureEvidence({
      ...captureRequest(question), blockText: '',
    })).toThrow(/block text must not be empty/)
    await expect(capped.information.captureEvidence({
      ...captureRequest(question), blockText: 'x'.repeat(21),
    })).resolves.toEqual({ status: 'capacity', resource: 'block-bytes' })
    await expect(capped.information.captureEvidence({
      ...captureRequest(question), sectionPath: ['x'.repeat(41)],
    })).resolves.toEqual({ status: 'capacity', resource: 'field-bytes' })
    await expect(capped.information.captureEvidence({
      ...captureRequest(question),
      selection: {
        text: 'x'.repeat(41), startUtf8Byte: 0, endUtf8Byte: 41,
        textHash: ResearchEvidenceTextHash(`sha256:${hash('x'.repeat(41))}`),
      },
    })).resolves.toEqual({ status: 'capacity', resource: 'field-bytes' })
    expect(() => capped.information.captureEvidence({
      ...captureRequest(question), blockText: 'x'.repeat(21), sectionPath: [''],
    })).toThrow(/section path 0 must not be empty/)
    const firstEvidence = await capture(capped.information, question)
    await expect(capped.information.captureEvidence(
      captureRequest(firstEvidence.question, 'a', 'Different evidence', '1'),
    )).resolves.toEqual({ status: 'capacity', resource: 'evidence' })

    const tiny = await mount({ config: { maxAggregateBytes: 1 } })
    await expect(tiny.information.writeQuestion({
      action: 'create', title: 'Tiny', question: 'Tiny?', author,
    })).resolves.toEqual({ status: 'capacity', resource: 'aggregate-bytes' })
    expect(tiny.information.list()).toEqual([])
  })
})

describe('ResearchInformation reading notes', () => {
  it('anchors authored notes, requires exact passages for questions, and preserves replacements', async () => {
    const { information } = await mount()
    const question = await createQuestion(information)
    const missingBase = {
      questionId: ResearchQuestionId('missing'),
      expectedRevision: 0,
      kind: 'note' as const,
      text: 'A reading note',
      evidenceId: ResearchEvidenceId('missing'),
      author,
    }
    await expect(information.writeReadingNote(missingBase)).resolves.toEqual({
      status: 'question-not-found',
      questionId: 'missing',
    })

    const selectedText = 'Alpha selected passage'
    const selectedPassage = 'selected'
    const selectedEvidence = await information.captureEvidence({
      ...captureRequest(question, 'a', selectedText, 'reading-note'),
      selection: {
        text: selectedPassage,
        startUtf8Byte: 6,
        endUtf8Byte: 14,
        textHash: ResearchEvidenceTextHash(`sha256:${hash(selectedPassage)}`),
      },
    })
    expect(selectedEvidence.status).toBe('created')
    if (selectedEvidence.status !== 'created') throw new Error('expected selected evidence')
    const plainEvidence = await capture(
      information,
      selectedEvidence.question,
      'b',
      'Beta evidence',
      'reading-note',
    )
    const base = {
      questionId: question.id,
      expectedRevision: plainEvidence.question.revision,
      kind: 'note' as const,
      text: '  ## Ｎote\r\n\r\n- first  \r\n- second  ',
      evidenceId: selectedEvidence.evidenceId,
      author,
    }
    await expect(information.writeReadingNote({ ...base, expectedRevision: 0 }))
      .resolves.toMatchObject({ status: 'stale-revision', currentRevision: 2 })
    await expect(information.writeReadingNote({
      ...base,
      evidenceId: ResearchEvidenceId('missing'),
    })).resolves.toEqual({ status: 'evidence-not-found', evidenceId: 'missing' })
    await expect(information.writeReadingNote({
      ...base,
      kind: 'passage-question',
      evidenceId: plainEvidence.evidenceId,
    })).resolves.toEqual({
      status: 'passage-question-selection-required',
      evidenceId: plainEvidence.evidenceId,
    })
    expect(information.get(question.id)?.revision).toBe(2)

    const first = await information.writeReadingNote(base)
    expect(first.status).toBe('created')
    if (first.status !== 'created') throw new Error('expected reading note')
    expect(first.question.readingNotes[0]).toMatchObject({
      id: first.readingNoteId,
      kind: 'note',
      text: '## Note\n\n- first  \n- second',
      evidenceId: selectedEvidence.evidenceId,
      createdBy: author,
    })
    const revisionBeforeFailures = first.question.revision
    await expect(information.writeReadingNote({
      ...base,
      expectedRevision: revisionBeforeFailures,
      supersedes: ResearchReadingNoteId('missing'),
    })).resolves.toEqual({
      status: 'supersedes-reading-note-not-found',
      readingNoteId: 'missing',
    })
    await expect(information.writeReadingNote({
      ...base,
      expectedRevision: revisionBeforeFailures,
      kind: 'passage-question',
      supersedes: first.readingNoteId,
    })).resolves.toEqual({
      status: 'supersedes-reading-note-kind-mismatch',
      readingNoteId: first.readingNoteId,
    })
    expect(information.get(question.id)?.revision).toBe(revisionBeforeFailures)

    const replacement = await information.writeReadingNote({
      ...base,
      expectedRevision: revisionBeforeFailures,
      text: 'Corrected anchor',
      evidenceId: plainEvidence.evidenceId,
      supersedes: first.readingNoteId,
    })
    expect(replacement.status).toBe('created')
    if (replacement.status !== 'created') throw new Error('expected replacement reading note')
    expect(replacement.question.readingNotes).toMatchObject([
      { id: first.readingNoteId, evidenceId: selectedEvidence.evidenceId },
      {
        id: replacement.readingNoteId,
        evidenceId: plainEvidence.evidenceId,
        supersedes: first.readingNoteId,
      },
    ])
    await expect(information.writeReadingNote({
      ...base,
      expectedRevision: replacement.question.revision,
      supersedes: first.readingNoteId,
    })).resolves.toEqual({
      status: 'supersedes-reading-note-inactive',
      readingNoteId: first.readingNoteId,
    })
    const passageQuestion = await information.writeReadingNote({
      ...base,
      expectedRevision: replacement.question.revision,
      kind: 'passage-question',
      text: 'How should this passage be interpreted?',
    })
    expect(passageQuestion.status).toBe('created')
    if (passageQuestion.status !== 'created') throw new Error('expected passage question')
    expect(passageQuestion.question.readingNotes).toHaveLength(3)
  })

  it('returns field, record, and aggregate capacities without writing', async () => {
    const capped = await mount({
      config: { maxReadingNotesPerQuestion: 1, maxFieldBytes: 40 },
    })
    const question = await createQuestion(capped.information)
    const captured = await capture(capped.information, question)
    const base = {
      questionId: question.id,
      expectedRevision: captured.question.revision,
      kind: 'note' as const,
      text: 'Within capacity',
      evidenceId: captured.evidenceId,
      author,
    }
    expect(() => capped.information.writeReadingNote({ ...base, text: ' \r\n ' }))
      .toThrow(/reading note text must not be empty/)
    expect(() => capped.information.writeReadingNote({ ...base, expectedRevision: -1 }))
      .toThrow(/non-negative safe integer/)
    await expect(capped.information.writeReadingNote({ ...base, text: 'x'.repeat(41) }))
      .resolves.toEqual({ status: 'capacity', resource: 'field-bytes' })
    const first = await capped.information.writeReadingNote(base)
    expect(first.status).toBe('created')
    if (first.status !== 'created') throw new Error('expected reading note')
    await expect(capped.information.writeReadingNote({
      ...base,
      expectedRevision: first.question.revision,
      text: 'Second note',
    })).resolves.toEqual({ status: 'capacity', resource: 'reading-notes' })
    expect(capped.information.get(question.id)?.readingNotes).toHaveLength(1)
  })
})

describe('ResearchInformation claims and synthesis', () => {
  it('keeps source statements single-paper and inferences explicitly separable', async () => {
    const { information } = await mount()
    let question = await createQuestion(information)
    const first = await capture(information, question, 'a')
    question = first.question
    await expect(information.captureEvidence(captureRequest(question, 'a')))
      .resolves.toMatchObject({ status: 'unchanged', evidenceId: first.evidenceId })
    const second = await capture(information, question, 'b', 'Beta evidence')
    question = second.question

    const base = {
      questionId: question.id,
      expectedRevision: question.revision,
      kind: 'source-statement' as const,
      facet: 'result' as const,
      text: 'The source reports an improvement.',
      evidenceLinks: [{ evidenceId: first.evidenceId, relation: 'supports' as const }],
      author,
    }
    await expect(information.writeClaim({ ...base, questionId: ResearchQuestionId('missing') }))
      .resolves.toMatchObject({ status: 'question-not-found' })
    await expect(information.writeClaim({ ...base, expectedRevision: 0 }))
      .resolves.toMatchObject({ status: 'stale-revision' })
    await expect(information.writeClaim({ ...base, evidenceLinks: [] }))
      .resolves.toEqual({ status: 'source-claim-uncited' })
    await expect(information.writeClaim({
      ...base,
      evidenceLinks: [{ evidenceId: ResearchEvidenceId('missing'), relation: 'supports' }],
    })).resolves.toEqual({ status: 'evidence-not-found', evidenceId: 'missing' })
    await expect(information.writeClaim({
      ...base,
      evidenceLinks: [
        { evidenceId: first.evidenceId, relation: 'supports' },
        { evidenceId: second.evidenceId, relation: 'contradicts' },
      ],
    })).resolves.toMatchObject({ status: 'source-evidence-paper-mismatch' })

    const source = await information.writeClaim({
      ...base,
      evidenceLinks: [
        { evidenceId: first.evidenceId, relation: 'supports' },
        { evidenceId: first.evidenceId, relation: 'supports' },
      ],
    })
    expect(source.status).toBe('created')
    if (source.status !== 'created') throw new Error('expected source claim')
    expect(source.question.claims[0]?.evidenceLinks).toHaveLength(1)
    const inference = await information.writeClaim({
      questionId: question.id,
      expectedRevision: source.question.revision,
      kind: 'inference',
      facet: 'other',
      otherFacet: '  transfer   risk ',
      text: 'This may not transfer.',
      evidenceLinks: [],
      author,
    })
    expect(inference.status).toBe('created')
    if (inference.status !== 'created') throw new Error('expected inference')
    expect(inference.question.claims.at(-1)).toMatchObject({
      kind: 'inference', facet: 'other', otherFacet: 'transfer risk', evidenceLinks: [],
    })

    await expect(information.writeClaim({
      ...base, expectedRevision: inference.question.revision,
      supersedes: ResearchClaimId('missing'),
    })).resolves.toEqual({ status: 'supersedes-claim-not-found', claimId: 'missing' })
    await expect(information.writeClaim({
      ...base, expectedRevision: inference.question.revision,
      kind: 'source-statement', supersedes: inference.claimId,
    })).resolves.toEqual({ status: 'supersedes-claim-kind-mismatch', claimId: inference.claimId })
    const replacement = await information.writeClaim({
      ...base, expectedRevision: inference.question.revision,
      text: 'The source reports a larger improvement.', supersedes: source.claimId,
    })
    expect(replacement.status).toBe('created')
    if (replacement.status !== 'created') throw new Error('expected replacement')
    await expect(information.writeClaim({
      ...base, expectedRevision: replacement.question.revision, supersedes: source.claimId,
    })).resolves.toEqual({ status: 'supersedes-claim-inactive', claimId: source.claimId })
  })

  it('validates claim input and claim capacity before writing', async () => {
    const { information } = await mount({
      config: { maxClaimsPerQuestion: 1, maxEvidenceLinksPerClaim: 1, maxFieldBytes: 40 },
    })
    let question = await createQuestion(information)
    const captured = await capture(information, question)
    question = captured.question
    const common = {
      questionId: question.id,
      expectedRevision: question.revision,
      kind: 'inference' as const,
      facet: 'result' as const,
      text: 'Inference',
      evidenceLinks: [],
      author,
    }
    expect(() => information.writeClaim({ ...common, facet: 'other' }))
      .toThrow(/other facet requires/)
    expect(() => information.writeClaim({ ...common, otherFacet: 'wrong' }))
      .toThrow(/otherFacet is valid only/)
    await expect(information.writeClaim({ ...common, text: 'x'.repeat(41) }))
      .resolves.toEqual({ status: 'capacity', resource: 'field-bytes' })
    await expect(information.writeClaim({
      ...common,
      evidenceLinks: [
        { evidenceId: captured.evidenceId, relation: 'supports' },
        { evidenceId: captured.evidenceId, relation: 'qualifies' },
      ],
    })).resolves.toEqual({ status: 'capacity', resource: 'evidence-links' })
    expect(() => information.writeClaim({
      ...common,
      facet: 'other',
      evidenceLinks: [
        { evidenceId: captured.evidenceId, relation: 'supports' },
        { evidenceId: captured.evidenceId, relation: 'qualifies' },
      ],
    })).toThrow(/other facet requires/)
    const created = await information.writeClaim(common)
    expect(created.status).toBe('created')
    if (created.status !== 'created') throw new Error('expected claim')
    await expect(information.writeClaim({
      ...common, expectedRevision: created.question.revision,
    })).resolves.toEqual({ status: 'capacity', resource: 'claims' })
  })

  it('groups cross-paper source claims into authored entities and merges active lineages', async () => {
    const { information } = await mount()
    let question = await createQuestion(information)
    const evidenceA = await capture(information, question, 'a', 'Method evidence A')
    const evidenceB = await capture(information, evidenceA.question, 'b', 'Method evidence B')
    const methodA = await information.writeClaim({
      questionId: question.id,
      expectedRevision: evidenceB.question.revision,
      kind: 'source-statement',
      facet: 'method',
      text: 'Paper A applies retrieval augmentation.',
      evidenceLinks: [{ evidenceId: evidenceA.evidenceId, relation: 'supports' }],
      author,
    })
    if (methodA.status !== 'created') throw new Error('expected method A claim')
    const methodB = await information.writeClaim({
      questionId: question.id,
      expectedRevision: methodA.question.revision,
      kind: 'source-statement',
      facet: 'method',
      text: 'Paper B uses retrieval-augmented generation.',
      evidenceLinks: [{ evidenceId: evidenceB.evidenceId, relation: 'supports' }],
      author,
    })
    if (methodB.status !== 'created') throw new Error('expected method B claim')
    const dataset = await information.writeClaim({
      questionId: question.id,
      expectedRevision: methodB.question.revision,
      kind: 'source-statement',
      facet: 'dataset',
      text: 'Paper A evaluates on Dataset One.',
      evidenceLinks: [{ evidenceId: evidenceA.evidenceId, relation: 'supports' }],
      author,
    })
    if (dataset.status !== 'created') throw new Error('expected dataset claim')
    const inference = await information.writeClaim({
      questionId: question.id,
      expectedRevision: dataset.question.revision,
      kind: 'inference',
      facet: 'method',
      text: 'The two pipelines may be equivalent.',
      evidenceLinks: [],
      author,
    })
    if (inference.status !== 'created') throw new Error('expected inference')
    question = inference.question
    const base = {
      questionId: question.id,
      expectedRevision: question.revision,
      kind: 'method' as const,
      canonicalName: 'Retrieval-augmented generation',
      sourceClaimIds: [methodA.claimId],
      author,
    }

    await expect(information.writeEntity({ ...base, questionId: ResearchQuestionId('missing') }))
      .resolves.toEqual({ status: 'question-not-found', questionId: 'missing' })
    await expect(information.writeEntity({ ...base, expectedRevision: 0 }))
      .resolves.toMatchObject({ status: 'stale-revision', currentRevision: question.revision })
    await expect(information.writeEntity({ ...base, sourceClaimIds: [ResearchClaimId('missing')] }))
      .resolves.toEqual({ status: 'claim-not-found', claimId: 'missing' })
    await expect(information.writeEntity({ ...base, sourceClaimIds: [inference.claimId] }))
      .resolves.toEqual({ status: 'entity-claim-kind-mismatch', claimId: inference.claimId })
    await expect(information.writeEntity({ ...base, sourceClaimIds: [dataset.claimId] }))
      .resolves.toEqual({
        status: 'entity-claim-facet-mismatch',
        claimId: dataset.claimId,
        entityKind: 'method',
        claimFacet: 'dataset',
      })

    const entityA = await information.writeEntity({
      ...base,
      canonicalName: '  Retrieval   Augmentation ',
      sourceClaimIds: [methodA.claimId, methodA.claimId],
    })
    expect(entityA.status).toBe('created')
    if (entityA.status !== 'created') throw new Error('expected entity A')
    expect(entityA.question.entities[0]).toMatchObject({
      kind: 'method',
      canonicalName: 'Retrieval Augmentation',
      sourceClaimIds: [methodA.claimId],
      supersedes: [],
      createdBy: author,
    })
    const entityB = await information.writeEntity({
      ...base,
      expectedRevision: entityA.question.revision,
      canonicalName: 'RAG',
      sourceClaimIds: [methodB.claimId],
    })
    if (entityB.status !== 'created') throw new Error('expected entity B')
    const datasetEntity = await information.writeEntity({
      questionId: question.id,
      expectedRevision: entityB.question.revision,
      kind: 'dataset',
      canonicalName: 'Dataset One',
      sourceClaimIds: [dataset.claimId],
      author,
    })
    if (datasetEntity.status !== 'created') throw new Error('expected dataset entity')
    await expect(information.writeEntity({
      ...base,
      expectedRevision: datasetEntity.question.revision,
      supersedes: [ResearchEntityId('missing')],
    })).resolves.toEqual({ status: 'supersedes-entity-not-found', entityId: 'missing' })
    await expect(information.writeEntity({
      ...base,
      expectedRevision: datasetEntity.question.revision,
      supersedes: [datasetEntity.entityId],
    })).resolves.toEqual({
      status: 'supersedes-entity-kind-mismatch',
      entityId: datasetEntity.entityId,
    })

    const merged = await information.writeEntity({
      ...base,
      expectedRevision: datasetEntity.question.revision,
      canonicalName: 'Retrieval-augmented generation',
      sourceClaimIds: [methodA.claimId, methodB.claimId],
      supersedes: [entityA.entityId, entityA.entityId, entityB.entityId],
    })
    expect(merged.status).toBe('created')
    if (merged.status !== 'created') throw new Error('expected merged entity')
    expect(merged.question.entities.at(-1)).toMatchObject({
      sourceClaimIds: [methodA.claimId, methodB.claimId],
      supersedes: [entityA.entityId, entityB.entityId],
    })
    const evidenceById = new Map(merged.question.evidence.map(value => [value.id, value]))
    const claimById = new Map(merged.question.claims.map(value => [value.id, value]))
    const groupedPapers = merged.question.entities.at(-1)?.sourceClaimIds.map((claimId) => {
      const claim = claimById.get(claimId)
      return evidenceById.get(claim?.evidenceLinks[0]?.evidenceId ?? ResearchEvidenceId('missing'))?.paperId
    })
    expect(groupedPapers).toEqual([ResearchPaperId('paper-a'), ResearchPaperId('paper-b')])
    await expect(information.writeEntity({
      ...base,
      expectedRevision: merged.question.revision,
      supersedes: [entityA.entityId],
    })).resolves.toEqual({ status: 'supersedes-entity-inactive', entityId: entityA.entityId })

    const replacementClaim = await information.writeClaim({
      questionId: question.id,
      expectedRevision: merged.question.revision,
      kind: 'source-statement',
      facet: 'method',
      text: 'Paper A applies a corrected retrieval pipeline.',
      evidenceLinks: [{ evidenceId: evidenceA.evidenceId, relation: 'supports' }],
      supersedes: methodA.claimId,
      author,
    })
    if (replacementClaim.status !== 'created') throw new Error('expected replacement claim')
    await expect(information.writeEntity({
      ...base,
      expectedRevision: replacementClaim.question.revision,
    })).resolves.toEqual({ status: 'claim-inactive', claimId: methodA.claimId })
  })

  it('validates entity inputs and configured entity capacities', async () => {
    const { information } = await mount({
      config: {
        maxEntitiesPerQuestion: 1,
        maxClaimReferencesPerEntity: 1,
        maxSupersededEntitiesPerEntity: 1,
        maxFieldBytes: 40,
      },
    })
    let question = await createQuestion(information)
    const captured = await capture(information, question)
    const source = await information.writeClaim({
      questionId: question.id,
      expectedRevision: captured.question.revision,
      kind: 'source-statement',
      facet: 'metric',
      text: 'The source reports accuracy.',
      evidenceLinks: [{ evidenceId: captured.evidenceId, relation: 'supports' }],
      author,
    })
    if (source.status !== 'created') throw new Error('expected source claim')
    question = source.question
    const base = {
      questionId: question.id,
      expectedRevision: question.revision,
      kind: 'metric' as const,
      canonicalName: 'Accuracy',
      sourceClaimIds: [source.claimId],
      author,
    }
    expect(() => information.writeEntity({ ...base, sourceClaimIds: [] }))
      .toThrow(/entity requires a claim/)
    expect(() => information.writeEntity({ ...base, expectedRevision: -1 }))
      .toThrow(/non-negative safe integer/)
    expect(() => information.writeEntity({ ...base, canonicalName: ' ' }))
      .toThrow(/entity canonical name must not be empty/)
    await expect(information.writeEntity({ ...base, canonicalName: 'x'.repeat(41) }))
      .resolves.toEqual({ status: 'capacity', resource: 'field-bytes' })
    await expect(information.writeEntity({
      ...base,
      sourceClaimIds: [source.claimId, ResearchClaimId('extra')],
    })).resolves.toEqual({ status: 'capacity', resource: 'entity-claim-references' })
    await expect(information.writeEntity({
      ...base,
      supersedes: [ResearchEntityId('a'), ResearchEntityId('b')],
    })).resolves.toEqual({ status: 'capacity', resource: 'entity-supersession-references' })
    const created = await information.writeEntity(base)
    expect(created.status).toBe('created')
    if (created.status !== 'created') throw new Error('expected entity')
    await expect(information.writeEntity({ ...base, expectedRevision: created.question.revision }))
      .resolves.toEqual({ status: 'capacity', resource: 'entities' })
  })

  it('refuses an entity if its referenced source statement is no longer evidence-backed', async () => {
    const { information } = await mount()
    const question = await createQuestion(information)
    const captured = await capture(information, question)
    const source = await information.writeClaim({
      questionId: question.id,
      expectedRevision: captured.question.revision,
      kind: 'source-statement',
      facet: 'method',
      text: 'Evidence-backed method',
      evidenceLinks: [{ evidenceId: captured.evidenceId, relation: 'supports' }],
      author,
    })
    if (source.status !== 'created') throw new Error('expected source claim')
    const mutableClaim = source.question.claims[0] as {
      evidenceLinks: ResearchClaim['evidenceLinks']
    }
    mutableClaim.evidenceLinks = []

    await expect(information.writeEntity({
      questionId: question.id,
      expectedRevision: source.question.revision,
      kind: 'method',
      canonicalName: 'Method',
      sourceClaimIds: [source.claimId],
      author,
    })).resolves.toEqual({ status: 'entity-claim-uncited', claimId: source.claimId })
  })

  it('writes cited findings, marks supersession, and rejects stale references', async () => {
    const { information } = await mount()
    let question = await createQuestion(information)
    const captured = await capture(information, question)
    question = captured.question
    const source = await information.writeClaim({
      questionId: question.id,
      expectedRevision: question.revision,
      kind: 'source-statement', facet: 'result', text: 'Supported result',
      evidenceLinks: [{ evidenceId: captured.evidenceId, relation: 'supports' }],
      author,
    })
    if (source.status !== 'created') throw new Error('expected claim')
    const inference = await information.writeClaim({
      questionId: question.id,
      expectedRevision: source.question.revision,
      kind: 'inference', facet: 'limitation', text: 'Uncited inference', evidenceLinks: [], author,
    })
    if (inference.status !== 'created') throw new Error('expected inference')
    const base = {
      questionId: question.id,
      expectedRevision: inference.question.revision,
      findings: [{
        kind: 'source-summary' as const,
        stance: 'agreement' as const,
        text: 'The source agrees.',
        claimIds: [source.claimId],
      }],
      author,
    }
    await expect(information.writeSynthesis({ ...base, questionId: ResearchQuestionId('missing') }))
      .resolves.toMatchObject({ status: 'question-not-found' })
    await expect(information.writeSynthesis({ ...base, expectedRevision: 0 }))
      .resolves.toMatchObject({ status: 'stale-revision' })
    await expect(information.writeSynthesis({
      ...base,
      findings: [{ ...base.findings[0]!, claimIds: [ResearchClaimId('missing')] }],
    })).resolves.toEqual({ status: 'claim-not-found', claimId: 'missing' })
    await expect(information.writeSynthesis({
      ...base,
      findings: [{ ...base.findings[0]!, claimIds: [] }],
    })).resolves.toEqual({ status: 'source-summary-uncited', findingIndex: 0 })
    await expect(information.writeSynthesis({
      ...base,
      findings: [{ ...base.findings[0]!, claimIds: [inference.claimId] }],
    })).resolves.toEqual({
      status: 'source-summary-claim-kind-mismatch',
      findingIndex: 0,
      claimId: inference.claimId,
    })
    await expect(information.writeSynthesis({
      ...base, supersedes: ResearchSynthesisId('missing'),
    })).resolves.toEqual({ status: 'supersedes-synthesis-not-found', synthesisId: 'missing' })

    const first = await information.writeSynthesis(base)
    expect(first.status).toBe('created')
    if (first.status !== 'created') throw new Error('expected synthesis')
    const replacement = await information.writeSynthesis({
      ...base,
      expectedRevision: first.question.revision,
      findings: [{
        kind: 'inference', stance: 'open-question', text: 'More work is needed.', claimIds: [],
      }],
      supersedes: first.synthesisId,
    })
    expect(replacement.status).toBe('created')
    if (replacement.status !== 'created') throw new Error('expected replacement synthesis')
    await expect(information.writeSynthesis({
      ...base, expectedRevision: replacement.question.revision, supersedes: first.synthesisId,
    })).resolves.toEqual({ status: 'supersedes-synthesis-inactive', synthesisId: first.synthesisId })

    const replacedClaim = await information.writeClaim({
      questionId: question.id,
      expectedRevision: replacement.question.revision,
      kind: 'source-statement', facet: 'result', text: 'Replacement source claim',
      evidenceLinks: [{ evidenceId: captured.evidenceId, relation: 'supports' }],
      supersedes: source.claimId,
      author,
    })
    if (replacedClaim.status !== 'created') throw new Error('expected replacement claim')
    await expect(information.writeSynthesis({
      ...base, expectedRevision: replacedClaim.question.revision,
    })).resolves.toEqual({ status: 'claim-inactive', claimId: source.claimId })
  })

  it('validates synthesis input and configured capacities', async () => {
    const { information } = await mount({
      config: {
        maxSynthesesPerQuestion: 1,
        maxFindingsPerSynthesis: 1,
        maxClaimReferencesPerFinding: 1,
        maxFieldBytes: 40,
      },
    })
    const question = await createQuestion(information)
    const base = {
      questionId: question.id,
      expectedRevision: question.revision,
      findings: [{
        kind: 'inference' as const,
        stance: 'open-question' as const,
        text: 'Open question',
        claimIds: [] as ResearchClaimId[],
      }],
      author,
    }
    expect(() => information.writeSynthesis({ ...base, findings: [] }))
      .toThrow(/requires a finding/)
    await expect(information.writeSynthesis({
      ...base, findings: [base.findings[0]!, base.findings[0]!],
    })).resolves.toEqual({ status: 'capacity', resource: 'findings' })
    await expect(information.writeSynthesis({
      ...base,
      findings: [{ ...base.findings[0]!, text: 'x'.repeat(41) }],
    })).resolves.toEqual({ status: 'capacity', resource: 'field-bytes' })
    await expect(information.writeSynthesis({
      ...base,
      findings: [{
        ...base.findings[0]!, claimIds: [ResearchClaimId('a'), ResearchClaimId('b')],
      }],
    })).resolves.toEqual({ status: 'capacity', resource: 'claim-references' })
    expect(() => information.writeSynthesis({
      ...base,
      findings: [base.findings[0]!, { ...base.findings[0]!, text: ' ' }],
    })).toThrow(/finding 1 text must not be empty/)
    const created = await information.writeSynthesis(base)
    expect(created.status).toBe('created')
    if (created.status !== 'created') throw new Error('expected synthesis')
    await expect(information.writeSynthesis({ ...base, expectedRevision: created.question.revision }))
      .resolves.toEqual({ status: 'capacity', resource: 'syntheses' })
  })
})

describe('ResearchInformation normalized observations and comparison protocols', () => {
  it('writes canonical source-backed observations and one explicit cross-paper protocol', async () => {
    const pool = poolWithQuestions()
    const first = await mount({ pool })
    const foundation = await createObservationFoundation(first.information)
    const observationA = await first.information.writeObservation(
      observationRequest(foundation, 'a', foundation.question.revision),
    )
    expect(observationA.status).toBe('created')
    if (observationA.status !== 'created') throw new Error('expected observation A')
    expect(observationA.question.observations[0]).toMatchObject({
      value: '92',
      unit: { status: 'reported', symbol: '%' },
      valueStatistic: 'mean over five runs',
      dataset: { split: { status: 'reported', value: 'official test' } },
      evaluationProtocol: { status: 'reported', value: 'frozen evaluation' },
      uncertainty: {
        status: 'reported',
        value: { lower: '91', upper: '93', confidenceLevelPercent: '95' },
      },
      conditions: {
        status: 'reported',
        values: [{ name: 'decoding' }, { name: 'temperature' }],
      },
      createdBy: author,
    })
    const observationB = await first.information.writeObservation(
      observationRequest(foundation, 'b', observationA.question.revision),
    )
    if (observationB.status !== 'created') throw new Error('expected observation B')
    const protocol = await first.information.writeComparisonProtocol({
      questionId: foundation.question.id,
      expectedRevision: observationB.question.revision,
      observationIds: [observationA.observationId, observationA.observationId, observationB.observationId],
      direction: 'higher-is-better',
      referenceObservationId: observationB.observationId,
      compatibilityRationale: ' Same dataset, metric, split, unit, and evaluation protocol. ',
      author,
    })
    expect(protocol.status).toBe('created')
    if (protocol.status !== 'created') throw new Error('expected comparison protocol')
    expect(protocol.question.comparisonProtocols[0]).toMatchObject({
      observationIds: [observationA.observationId, observationB.observationId],
      direction: 'higher-is-better',
      referenceObservationId: observationB.observationId,
      compatibilityRationale: 'Same dataset, metric, split, unit, and evaluation protocol.',
      createdBy: author,
    })
    await first.informationFiber.dispose()
    await first.libraryFiber.dispose()

    const second = await mount({ pool })
    expect(second.information.get(foundation.question.id)).toEqual(protocol.question)
    await second.informationFiber.dispose()
    await second.libraryFiber.dispose()
  })

  it('rejects invalid numeric fields and unsupported source or entity relations without writing', async () => {
    const { information } = await mount()
    const foundation = await createObservationFoundation(information)
    const base = observationRequest(foundation, 'a', foundation.question.revision)
    expect(ResearchObservationId('observation')).toBe('observation')
    expect(ResearchComparisonProtocolId('protocol')).toBe('protocol')
    expect(ResearchDecimal('1.0')).toBe('1.0')
    expect(() => information.writeObservation({ ...base, value: ResearchDecimal('NaN') }))
      .toThrow(/finite base-ten number/)
    expect(() => information.writeObservation({
      ...base,
      method: { ...base.method, role: 'other' },
    })).toThrow(/other method role requires/)
    expect(() => information.writeObservation({
      ...base,
      uncertainty: {
        status: 'reported',
        value: { kind: 'standard-error', magnitude: ResearchDecimal('-1') },
      },
    })).toThrow(/magnitude must not be negative/)
    expect(() => information.writeObservation({
      ...base,
      uncertainty: {
        status: 'reported',
        value: {
          kind: 'standard-error',
          magnitude: ResearchDecimal('-1e-9000000000000001'),
        },
      },
    })).toThrow(/must not underflow decimal storage/)
    expect(() => information.writeObservation({
      ...base,
      conditions: {
        status: 'reported',
        values: [
          base.conditions.status === 'reported' ? base.conditions.values[0]! : neverCondition(),
          base.conditions.status === 'reported' ? base.conditions.values[0]! : neverCondition(),
        ],
      },
    })).toThrow(/condition names must be unique/)
    await expect(information.writeObservation({
      ...base,
      resultClaimId: ResearchClaimId('missing'),
    })).resolves.toEqual({
      status: 'observation-claim-not-found',
      claimRole: 'result',
      claimId: 'missing',
    })
    await expect(information.writeObservation({
      ...base,
      resultClaimId: foundation.claims.a.method,
    })).resolves.toMatchObject({
      status: 'observation-claim-facet-mismatch',
      claimRole: 'result',
      claimFacet: 'method',
    })
    await expect(information.writeObservation({
      ...base,
      method: {
        ...base.method,
        entityId: foundation.entities.dataset,
      },
    })).resolves.toMatchObject({
      status: 'observation-entity-kind-mismatch',
      entityRole: 'method',
      entityKind: 'dataset',
    })
    await expect(information.writeObservation({
      ...base,
      method: {
        ...base.method,
        sourceClaimId: foundation.claims.b.method,
      },
    })).resolves.toMatchObject({
      status: 'observation-claim-paper-mismatch',
      claimRole: 'method',
      paperId: ResearchPaperId('paper-b'),
    })
    expect(information.get(foundation.question.id)?.observations).toEqual([])
  })

  it('requires explicit structural alignment and preserves protocols after later staleness', async () => {
    const pool = poolWithQuestions()
    const first = await mount({ pool })
    const foundation = await createObservationFoundation(first.information)
    const observationA = await first.information.writeObservation(
      observationRequest(foundation, 'a', foundation.question.revision),
    )
    if (observationA.status !== 'created') throw new Error('expected observation A')
    const missingUnitRequest: WriteResearchObservationRequest = {
      ...observationRequest(foundation, 'b', observationA.question.revision),
      unit: { status: 'not-recorded' },
    }
    const missingUnit = await first.information.writeObservation(missingUnitRequest)
    if (missingUnit.status !== 'created') throw new Error('expected missing-unit observation')
    await expect(first.information.writeComparisonProtocol({
      questionId: foundation.question.id,
      expectedRevision: missingUnit.question.revision,
      observationIds: [observationA.observationId, missingUnit.observationId],
      direction: 'non-directional',
      compatibilityRationale: 'Attempted comparison.',
      author,
    })).resolves.toEqual({
      status: 'comparison-field-not-recorded',
      observationId: missingUnit.observationId,
      dimension: 'unit',
    })
    const mismatchedRequest: WriteResearchObservationRequest = {
      ...observationRequest(foundation, 'b', missingUnit.question.revision),
      dataset: {
        ...observationRequest(foundation, 'b', 0).dataset,
        split: {
          status: 'reported',
          value: 'validation',
          sourceClaimId: foundation.claims.b.dataset,
        },
      },
    }
    const mismatched = await first.information.writeObservation(mismatchedRequest)
    if (mismatched.status !== 'created') throw new Error('expected mismatched observation')
    await expect(first.information.writeComparisonProtocol({
      questionId: foundation.question.id,
      expectedRevision: mismatched.question.revision,
      observationIds: [observationA.observationId, mismatched.observationId],
      direction: 'non-directional',
      compatibilityRationale: 'Attempted comparison.',
      author,
    })).resolves.toEqual({
      status: 'comparison-dimension-mismatch',
      observationId: mismatched.observationId,
      dimension: 'dataset-split',
    })
    const observationB = await first.information.writeObservation(
      observationRequest(foundation, 'b', mismatched.question.revision),
    )
    if (observationB.status !== 'created') throw new Error('expected observation B')
    expect(() => first.information.writeComparisonProtocol({
      questionId: foundation.question.id,
      expectedRevision: observationB.question.revision,
      observationIds: [observationA.observationId, observationA.observationId],
      direction: 'non-directional',
      compatibilityRationale: 'One-paper comparison.',
      author,
    })).toThrow(/requires two observations/)
    const protocol = await first.information.writeComparisonProtocol({
      questionId: foundation.question.id,
      expectedRevision: observationB.question.revision,
      observationIds: [observationA.observationId, observationB.observationId],
      direction: 'non-directional',
      compatibilityRationale: 'Explicit compatible evaluation context.',
      author,
    })
    if (protocol.status !== 'created') throw new Error('expected protocol')
    const replacementClaim = await first.information.writeClaim({
      questionId: foundation.question.id,
      expectedRevision: protocol.question.revision,
      kind: 'source-statement',
      facet: 'result',
      text: 'Corrected paper A result.',
      evidenceLinks: protocol.question.claims
        .find(value => value.id === foundation.claims.a.result)!.evidenceLinks,
      supersedes: foundation.claims.a.result,
      author,
    })
    if (replacementClaim.status !== 'created') throw new Error('expected replacement claim')
    await expect(first.information.writeComparisonProtocol({
      questionId: foundation.question.id,
      expectedRevision: replacementClaim.question.revision,
      observationIds: [observationA.observationId, observationB.observationId],
      direction: 'non-directional',
      compatibilityRationale: 'Stale comparison attempt.',
      author,
    })).resolves.toEqual({ status: 'observation-stale', observationId: observationA.observationId })
    await first.informationFiber.dispose()
    await first.libraryFiber.dispose()

    const second = await mount({ pool })
    expect(second.information.get(foundation.question.id)?.comparisonProtocols).toEqual(
      protocol.question.comparisonProtocols,
    )
    await second.informationFiber.dispose()
    await second.libraryFiber.dispose()
  })

  it('enforces observation and protocol capacities before publishing state', async () => {
    const { information } = await mount({
      config: {
        maxObservationsPerQuestion: 1,
        maxConditionsPerObservation: 1,
        maxComparisonProtocolsPerQuestion: 1,
        maxObservationReferencesPerProtocol: 2,
      },
    })
    const foundation = await createObservationFoundation(information)
    const oversizedConditions = observationRequest(foundation, 'a', foundation.question.revision)
    await expect(information.writeObservation(oversizedConditions))
      .resolves.toEqual({ status: 'capacity', resource: 'observation-conditions' })
    const oneCondition: WriteResearchObservationRequest = {
      ...oversizedConditions,
      conditions: {
        status: 'reported',
        values: oversizedConditions.conditions.status === 'reported'
          ? [oversizedConditions.conditions.values[0]!]
          : [],
      },
    }
    const created = await information.writeObservation(oneCondition)
    if (created.status !== 'created') throw new Error('expected observation')
    await expect(information.writeObservation({
      ...observationRequest(foundation, 'b', created.question.revision),
      conditions: { status: 'not-applicable' },
    })).resolves.toEqual({ status: 'capacity', resource: 'observations' })
  })

  it('normalizes every observation value form and rejects ambiguous uncertainty', async () => {
    const { information } = await mount()
    const foundation = await createObservationFoundation(information)
    const base = observationRequest(foundation, 'a', foundation.question.revision)
    expect(() => information.writeObservation({
      ...base,
      method: { ...base.method, otherRole: 'unexpected' },
    })).toThrow(/otherRole is valid only/)
    expect(() => information.writeObservation({
      ...base,
      conditions: { status: 'reported', values: [] },
    })).toThrow(/conditions require a value/)
    expect(() => information.writeObservation({
      ...base,
      uncertainty: {
        status: 'reported',
        value: { kind: 'range', lower: ResearchDecimal('93'), upper: ResearchDecimal('91') },
      },
    })).toThrow(/lower bound must not exceed/)
    expect(() => information.writeObservation({
      ...base,
      uncertainty: {
        status: 'reported',
        value: { kind: 'range', lower: ResearchDecimal('89'), upper: ResearchDecimal('91') },
      },
    })).toThrow(/bounds must contain/)
    for (const confidenceLevelPercent of ['0', '101']) {
      expect(() => information.writeObservation({
        ...base,
        uncertainty: {
          status: 'reported',
          value: {
            kind: 'confidence-interval',
            lower: ResearchDecimal('91'),
            upper: ResearchDecimal('93'),
            confidenceLevelPercent: ResearchDecimal(confidenceLevelPercent),
          },
        },
      })).toThrow(/confidence level percent must be above zero/)
    }
    expect(() => information.writeObservation({
      ...base,
      value: ResearchDecimal(`1e${'9'.repeat(40)}`),
    })).toThrow(/finite base-ten number/)
    expect(() => information.writeObservation({
      ...base,
      value: ResearchDecimal('1e-9000000000000001'),
    })).toThrow(/must not underflow decimal storage/)

    let revision = foundation.question.revision
    const requests: WriteResearchObservationRequest[] = [
      {
        ...base,
        expectedRevision: revision,
        method: { ...base.method, role: 'other', otherRole: ' external baseline ' },
        value: ResearchDecimal('-0.0'),
        unit: { status: 'not-applicable' },
        dataset: { ...base.dataset, split: { status: 'not-applicable' } },
        evaluationProtocol: { status: 'not-applicable' },
        uncertainty: { status: 'not-applicable' },
        conditions: { status: 'not-applicable' },
      },
      {
        ...base,
        uncertainty: {
          status: 'reported',
          value: { kind: 'standard-deviation', magnitude: ResearchDecimal('+1.500') },
        },
      },
      {
        ...base,
        uncertainty: {
          status: 'reported',
          value: { kind: 'range', lower: ResearchDecimal('91'), upper: ResearchDecimal('93') },
        },
      },
      {
        ...base,
        unit: { status: 'not-recorded' },
        dataset: { ...base.dataset, split: { status: 'not-recorded' } },
        evaluationProtocol: { status: 'not-recorded' },
        uncertainty: { status: 'not-recorded' },
        conditions: { status: 'not-recorded' },
      },
    ]
    for (const request of requests) {
      const written = await information.writeObservation({ ...request, expectedRevision: revision })
      expect(written.status).toBe('created')
      if (written.status !== 'created') throw new Error('expected normalized observation')
      revision = written.question.revision
    }
    expect(information.get(foundation.question.id)?.observations).toMatchObject([
      {
        value: '0',
        method: { role: 'other', otherRole: 'external baseline' },
        unit: { status: 'not-applicable' },
      },
      { uncertainty: { status: 'reported', value: { magnitude: '1.5' } } },
      { uncertainty: { status: 'reported', value: { kind: 'range', lower: '91', upper: '93' } } },
      { uncertainty: { status: 'not-recorded' }, conditions: { status: 'not-recorded' } },
    ])
  })

  it('returns every resolvable observation reference and supersession failure', async () => {
    const { information } = await mount()
    const foundation = await createObservationFoundation(information)
    const base = observationRequest(foundation, 'a', foundation.question.revision)
    await expect(information.writeObservation({
      ...base,
      questionId: ResearchQuestionId('missing'),
    })).resolves.toEqual({ status: 'question-not-found', questionId: 'missing' })
    await expect(information.writeObservation({ ...base, expectedRevision: base.expectedRevision - 1 }))
      .resolves.toMatchObject({ status: 'stale-revision' })
    await expect(information.writeObservation({
      ...base,
      dataset: {
        ...base.dataset,
        split: {
          status: 'reported',
          value: 'official test',
          sourceClaimId: ResearchClaimId('missing-context'),
        },
      },
    })).resolves.toEqual({
      status: 'observation-claim-not-found',
      claimRole: 'dataset-split',
      claimId: 'missing-context',
    })
    await expect(information.writeObservation({
      ...base,
      method: { ...base.method, entityId: ResearchEntityId('missing') },
    })).resolves.toEqual({
      status: 'observation-entity-not-found',
      entityRole: 'method',
      entityId: 'missing',
    })
    await expect(information.writeObservation({
      ...base,
      method: { ...base.method, sourceClaimId: foundation.claims.a.dataset },
    })).resolves.toMatchObject({
      status: 'observation-entity-claim-mismatch',
      entityRole: 'method',
    })

    const inference = await information.writeClaim({
      questionId: foundation.question.id,
      expectedRevision: foundation.question.revision,
      kind: 'inference',
      facet: 'result',
      text: 'Derived result.',
      evidenceLinks: [],
      author,
    })
    if (inference.status !== 'created') throw new Error('expected inference')
    await expect(information.writeObservation({
      ...base,
      expectedRevision: inference.question.revision,
      resultClaimId: inference.claimId,
    })).resolves.toEqual({
      status: 'observation-claim-kind-mismatch',
      claimRole: 'result',
      claimId: inference.claimId,
    })
    await expect(information.writeObservation({
      ...base,
      expectedRevision: inference.question.revision,
      supersedes: ResearchObservationId('missing'),
    })).resolves.toEqual({
      status: 'supersedes-observation-not-found',
      observationId: 'missing',
    })
    const original = await information.writeObservation({
      ...base,
      expectedRevision: inference.question.revision,
    })
    if (original.status !== 'created') throw new Error('expected original observation')
    const replacement = await information.writeObservation({
      ...base,
      expectedRevision: original.question.revision,
      supersedes: original.observationId,
    })
    if (replacement.status !== 'created') throw new Error('expected replacement observation')
    await expect(information.writeObservation({
      ...base,
      expectedRevision: replacement.question.revision,
      supersedes: original.observationId,
    })).resolves.toEqual({
      status: 'supersedes-observation-inactive',
      observationId: original.observationId,
    })
    await expect(information.writeObservation({
      ...observationRequest(foundation, 'b', replacement.question.revision),
      supersedes: replacement.observationId,
    })).resolves.toEqual({
      status: 'supersedes-observation-paper-mismatch',
      observationId: replacement.observationId,
    })

    const correctedResult = await information.writeClaim({
      questionId: foundation.question.id,
      expectedRevision: replacement.question.revision,
      kind: 'source-statement',
      facet: 'result',
      text: 'Corrected result.',
      evidenceLinks: replacement.question.claims
        .find(value => value.id === foundation.claims.a.result)!.evidenceLinks,
      supersedes: foundation.claims.a.result,
      author,
    })
    if (correctedResult.status !== 'created') throw new Error('expected corrected result claim')
    await expect(information.writeObservation({
      ...base,
      expectedRevision: correctedResult.question.revision,
    })).resolves.toEqual({
      status: 'observation-claim-inactive',
      claimRole: 'result',
      claimId: foundation.claims.a.result,
    })
  })

  it('detects stale and inactive normalized entities before accepting an observation', async () => {
    const first = await mount()
    const firstFoundation = await createObservationFoundation(first.information)
    const replacementEntity = await first.information.writeEntity({
      questionId: firstFoundation.question.id,
      expectedRevision: firstFoundation.question.revision,
      kind: 'method',
      canonicalName: 'Replacement method',
      sourceClaimIds: [firstFoundation.claims.a.method, firstFoundation.claims.b.method],
      supersedes: [firstFoundation.entities.method],
      author,
    })
    if (replacementEntity.status !== 'created') throw new Error('expected replacement entity')
    await expect(first.information.writeObservation({
      ...observationRequest(firstFoundation, 'a', replacementEntity.question.revision),
    })).resolves.toEqual({
      status: 'observation-entity-inactive',
      entityRole: 'method',
      entityId: firstFoundation.entities.method,
    })

    const second = await mount()
    const secondFoundation = await createObservationFoundation(second.information)
    const correctedMethod = await second.information.writeClaim({
      questionId: secondFoundation.question.id,
      expectedRevision: secondFoundation.question.revision,
      kind: 'source-statement',
      facet: 'method',
      text: 'Corrected method description.',
      evidenceLinks: secondFoundation.question.claims
        .find(value => value.id === secondFoundation.claims.a.method)!.evidenceLinks,
      supersedes: secondFoundation.claims.a.method,
      author,
    })
    if (correctedMethod.status !== 'created') throw new Error('expected corrected method claim')
    await expect(second.information.writeObservation({
      ...observationRequest(secondFoundation, 'a', correctedMethod.question.revision),
    })).resolves.toEqual({
      status: 'observation-entity-stale',
      entityRole: 'method',
      entityId: secondFoundation.entities.method,
      staleClaimIds: [secondFoundation.claims.a.method],
    })
  })

  it('reports protocol lookup, paper, reference, supersession, and capacity failures', async () => {
    const { information } = await mount()
    const { foundation, observationA, observationB } = await createComparableState(information)
    const revision = observationB.question.revision
    const request = {
      questionId: foundation.question.id,
      expectedRevision: revision,
      observationIds: [observationA.observationId, observationB.observationId],
      direction: 'non-directional' as const,
      compatibilityRationale: 'Compatible setup.',
      author,
    }
    await expect(information.writeComparisonProtocol({
      ...request,
      questionId: ResearchQuestionId('missing'),
    })).resolves.toEqual({ status: 'question-not-found', questionId: 'missing' })
    await expect(information.writeComparisonProtocol({ ...request, expectedRevision: revision - 1 }))
      .resolves.toMatchObject({ status: 'stale-revision' })
    await expect(information.writeComparisonProtocol({
      ...request,
      observationIds: [observationA.observationId, ResearchObservationId('missing')],
    })).resolves.toEqual({ status: 'observation-not-found', observationId: 'missing' })
    const samePaper = await information.writeObservation(
      observationRequest(foundation, 'a', revision),
    )
    if (samePaper.status !== 'created') throw new Error('expected same-paper observation')
    await expect(information.writeComparisonProtocol({
      ...request,
      expectedRevision: samePaper.question.revision,
      observationIds: [observationA.observationId, samePaper.observationId],
    })).resolves.toEqual({
      status: 'comparison-insufficient-papers',
      paperIds: [ResearchPaperId('paper-a')],
    })
    await expect(information.writeComparisonProtocol({
      ...request,
      expectedRevision: samePaper.question.revision,
      referenceObservationId: ResearchObservationId('outside'),
    })).resolves.toEqual({
      status: 'reference-observation-not-member',
      observationId: 'outside',
    })
    await expect(information.writeComparisonProtocol({
      ...request,
      expectedRevision: samePaper.question.revision,
      supersedes: ResearchComparisonProtocolId('missing'),
    })).resolves.toEqual({
      status: 'supersedes-comparison-protocol-not-found',
      comparisonProtocolId: 'missing',
    })
    const original = await information.writeComparisonProtocol({
      ...request,
      expectedRevision: samePaper.question.revision,
    })
    if (original.status !== 'created') throw new Error('expected original protocol')
    const replacement = await information.writeComparisonProtocol({
      ...request,
      expectedRevision: original.question.revision,
      supersedes: original.comparisonProtocolId,
    })
    if (replacement.status !== 'created') throw new Error('expected replacement protocol')
    await expect(information.writeComparisonProtocol({
      ...request,
      expectedRevision: replacement.question.revision,
      supersedes: original.comparisonProtocolId,
    })).resolves.toEqual({
      status: 'supersedes-comparison-protocol-inactive',
      comparisonProtocolId: original.comparisonProtocolId,
    })
    const replacementObservation = await information.writeObservation({
      ...observationRequest(foundation, 'a', replacement.question.revision),
      supersedes: observationA.observationId,
    })
    if (replacementObservation.status !== 'created') throw new Error('expected replacement observation')
    await expect(information.writeComparisonProtocol({
      ...request,
      expectedRevision: replacementObservation.question.revision,
    })).resolves.toEqual({ status: 'observation-inactive', observationId: observationA.observationId })

    const capped = await mount({
      config: {
        maxFieldBytes: 40,
        maxObservationReferencesPerProtocol: 2,
        maxComparisonProtocolsPerQuestion: 1,
      },
    })
    const cappedState = await createComparableState(capped.information)
    const third = await capped.information.writeObservation(observationRequest(
      cappedState.foundation,
      'b',
      cappedState.observationB.question.revision,
    ))
    if (third.status !== 'created') throw new Error('expected third observation')
    const cappedRequest = {
      questionId: cappedState.foundation.question.id,
      expectedRevision: third.question.revision,
      observationIds: [
        cappedState.observationA.observationId,
        cappedState.observationB.observationId,
      ],
      direction: 'non-directional' as const,
      compatibilityRationale: 'Compatible setup.',
      author,
    }
    await expect(capped.information.writeComparisonProtocol({
      ...cappedRequest,
      observationIds: [...cappedRequest.observationIds, third.observationId],
    })).resolves.toEqual({ status: 'capacity', resource: 'comparison-observation-references' })
    await expect(capped.information.writeComparisonProtocol({
      ...cappedRequest,
      compatibilityRationale: 'x'.repeat(41),
    })).resolves.toEqual({ status: 'capacity', resource: 'field-bytes' })
    const cappedProtocol = await capped.information.writeComparisonProtocol(cappedRequest)
    if (cappedProtocol.status !== 'created') throw new Error('expected capped protocol')
    await expect(capped.information.writeComparisonProtocol({
      ...cappedRequest,
      expectedRevision: cappedProtocol.question.revision,
    })).resolves.toEqual({ status: 'capacity', resource: 'comparison-protocols' })
  })

  it('requires every comparison dimension to be explicitly available and identical', async () => {
    const { information } = await mount()
    const initial = await createObservationFoundation(information)
    const extraDataset = await information.writeEntity({
      questionId: initial.question.id,
      expectedRevision: initial.question.revision,
      kind: 'dataset',
      canonicalName: 'Alternate dataset',
      sourceClaimIds: [initial.claims.b.dataset],
      author,
    })
    if (extraDataset.status !== 'created') throw new Error('expected alternate dataset')
    const extraMetric = await information.writeEntity({
      questionId: initial.question.id,
      expectedRevision: extraDataset.question.revision,
      kind: 'metric',
      canonicalName: 'Alternate metric',
      sourceClaimIds: [initial.claims.b.metric],
      author,
    })
    if (extraMetric.status !== 'created') throw new Error('expected alternate metric')
    const foundation = { ...initial, question: extraMetric.question }
    const first = await information.writeObservation(
      observationRequest(foundation, 'a', extraMetric.question.revision),
    )
    if (first.status !== 'created') throw new Error('expected comparison anchor')
    let revision = first.question.revision
    const compare = async (
      request: WriteResearchObservationRequest,
      expectedStatus: object,
    ) => {
      const written = await information.writeObservation({ ...request, expectedRevision: revision })
      if (written.status !== 'created') throw new Error('expected comparison candidate')
      revision = written.question.revision
      await expect(information.writeComparisonProtocol({
        questionId: foundation.question.id,
        expectedRevision: revision,
        observationIds: [first.observationId, written.observationId],
        direction: 'non-directional',
        compatibilityRationale: 'Dimension check.',
        author,
      })).resolves.toMatchObject(expectedStatus)
    }
    const missingCases: readonly [
      string,
      (request: WriteResearchObservationRequest) => WriteResearchObservationRequest,
    ][] = [
      ['dataset-split', request => ({ ...request, dataset: { ...request.dataset, split: { status: 'not-recorded' } } })],
      ['unit', request => ({ ...request, unit: { status: 'not-recorded' } })],
      ['evaluation-protocol', request => ({ ...request, evaluationProtocol: { status: 'not-recorded' } })],
      ['must-match-conditions', request => ({ ...request, conditions: { status: 'not-recorded' } })],
    ]
    for (const [dimension, mutate] of missingCases) {
      await compare(mutate(observationRequest(foundation, 'b', revision)), {
        status: 'comparison-field-not-recorded',
        dimension,
      })
    }
    const mismatchCases: readonly [
      string,
      (request: WriteResearchObservationRequest) => WriteResearchObservationRequest,
    ][] = [
      ['dataset', request => ({
        ...request,
        dataset: { ...request.dataset, entityId: extraDataset.entityId },
      })],
      ['metric', request => ({
        ...request,
        metric: { ...request.metric, entityId: extraMetric.entityId },
      })],
      ['dataset-split', request => ({
        ...request,
        dataset: {
          ...request.dataset,
          split: {
            status: 'reported',
            value: 'validation',
            sourceClaimId: foundation.claims.b.dataset,
          },
        },
      })],
      ['unit', request => ({ ...request, unit: { status: 'reported', symbol: 'fraction' } })],
      ['value-statistic', request => ({ ...request, valueStatistic: 'single run' })],
      ['evaluation-protocol', request => ({
        ...request,
        evaluationProtocol: {
          status: 'reported',
          value: 'tuned evaluation',
          sourceClaimId: foundation.claims.b.result,
        },
      })],
      ['must-match-conditions', request => ({
        ...request,
        conditions: request.conditions.status === 'reported'
          ? {
            status: 'reported',
            values: request.conditions.values.map(value => value.comparisonRole === 'must-match'
              ? { ...value, value: 'beam search' }
              : value),
          }
          : request.conditions,
      })],
    ]
    for (const [dimension, mutate] of mismatchCases) {
      await compare(mutate(observationRequest(foundation, 'b', revision)), {
        status: 'comparison-dimension-mismatch',
        dimension,
      })
    }

    const notApplicable = (character: 'a' | 'b'): WriteResearchObservationRequest => ({
      ...observationRequest(foundation, character, revision),
      unit: { status: 'not-applicable' },
      dataset: {
        ...observationRequest(foundation, character, revision).dataset,
        split: { status: 'not-applicable' },
      },
      evaluationProtocol: { status: 'not-applicable' },
      uncertainty: { status: 'not-applicable' },
      conditions: { status: 'not-applicable' },
    })
    const notApplicableA = await information.writeObservation(notApplicable('a'))
    if (notApplicableA.status !== 'created') throw new Error('expected not-applicable observation A')
    revision = notApplicableA.question.revision
    const notApplicableB = await information.writeObservation(notApplicable('b'))
    if (notApplicableB.status !== 'created') throw new Error('expected not-applicable observation B')
    revision = notApplicableB.question.revision
    const notApplicableProtocol = await information.writeComparisonProtocol({
      questionId: foundation.question.id,
      expectedRevision: revision,
      observationIds: [notApplicableA.observationId, notApplicableB.observationId],
      direction: 'non-directional',
      compatibilityRationale: 'Both contexts are explicitly inapplicable.',
      author,
    })
    expect(notApplicableProtocol.status).toBe('created')
    if (notApplicableProtocol.status !== 'created') throw new Error('expected not-applicable protocol')
    revision = notApplicableProtocol.question.revision

    const descriptiveDifference = observationRequest(foundation, 'b', revision)
    const descriptive = await information.writeObservation({
      ...descriptiveDifference,
      conditions: descriptiveDifference.conditions.status === 'reported'
        ? {
          status: 'reported',
          values: descriptiveDifference.conditions.values.map(value => value.comparisonRole === 'descriptive'
            ? { ...value, value: 'different but descriptive' }
            : value),
        }
        : descriptiveDifference.conditions,
    })
    if (descriptive.status !== 'created') throw new Error('expected descriptive-difference observation')
    await expect(information.writeComparisonProtocol({
      questionId: foundation.question.id,
      expectedRevision: descriptive.question.revision,
      observationIds: [first.observationId, descriptive.observationId],
      direction: 'non-directional',
      compatibilityRationale: 'Only a descriptive condition differs.',
      author,
    })).resolves.toMatchObject({ status: 'created' })
  })

  it('applies field and aggregate byte limits to observation and protocol writes', async () => {
    const fieldLimited = await mount({ config: { maxFieldBytes: 40 } })
    const fieldFoundation = await createObservationFoundation(fieldLimited.information)
    await expect(fieldLimited.information.writeObservation({
      ...observationRequest(fieldFoundation, 'a', fieldFoundation.question.revision),
      valueStatistic: 'x'.repeat(41),
    })).resolves.toEqual({ status: 'capacity', resource: 'field-bytes' })

    const observationPool = poolWithQuestions()
    const observationBuilder = await mount({ pool: observationPool })
    const observationFoundation = await createObservationFoundation(observationBuilder.information)
    await observationBuilder.informationFiber.dispose()
    await observationBuilder.libraryFiber.dispose()
    const observationLimit = Buffer.byteLength(JSON.stringify(observationFoundation.question), 'utf8')
    const observationMounted = await mount({
      pool: observationPool,
      config: { maxAggregateBytes: observationLimit },
    })
    await expect(observationMounted.information.writeObservation(observationRequest(
      observationFoundation,
      'a',
      observationFoundation.question.revision,
    ))).resolves.toEqual({ status: 'capacity', resource: 'aggregate-bytes' })

    const protocolPool = poolWithQuestions()
    const protocolBuilder = await mount({ pool: protocolPool })
    const comparable = await createComparableState(protocolBuilder.information)
    await protocolBuilder.informationFiber.dispose()
    await protocolBuilder.libraryFiber.dispose()
    const protocolRecord = comparable.observationB.question
    const protocolLimit = Buffer.byteLength(JSON.stringify(protocolRecord), 'utf8')
    const protocolMounted = await mount({
      pool: protocolPool,
      config: { maxAggregateBytes: protocolLimit },
    })
    await expect(protocolMounted.information.writeComparisonProtocol({
      questionId: comparable.foundation.question.id,
      expectedRevision: protocolRecord.revision,
      observationIds: [comparable.observationA.observationId, comparable.observationB.observationId],
      direction: 'non-directional',
      compatibilityRationale: 'Compatible setup.',
      author,
    })).resolves.toEqual({ status: 'capacity', resource: 'aggregate-bytes' })
  })
})

function neverCondition(): never {
  throw new Error('unreachable condition fixture')
}

describe('ResearchInformation durability and stored-state validation', () => {
  it('clamps existing-aggregate timestamps across wall-clock rollback and remount', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(latestAt))
      const pool = poolWithQuestions()
      const first = await mount({ pool })
      const question = await createQuestion(first.information)
      vi.setSystemTime(new Date(storedAt))
      const retitled = await first.information.writeQuestion({
        action: 'update',
        questionId: question.id,
        expectedRevision: question.revision,
        title: 'Clock-safe title',
        author,
      })
      expect(retitled.status).toBe('updated')
      if (retitled.status !== 'updated') throw new Error('expected title update')
      expect(retitled.question.updatedAt).toBe(latestAt)
      await first.informationFiber.dispose()
      await first.libraryFiber.dispose()

      const second = await mount({ pool })
      const captured = await capture(second.information, retitled.question)
      expect(captured.question.updatedAt).toBe(latestAt)
      expect(captured.question.evidence[0]?.createdAt).toBe(latestAt)
      const noted = await second.information.writeReadingNote({
        questionId: question.id,
        expectedRevision: captured.question.revision,
        kind: 'note',
        text: 'Clock-safe note',
        evidenceId: captured.evidenceId,
        author,
      })
      expect(noted.status).toBe('created')
      if (noted.status !== 'created') throw new Error('expected reading note')
      expect(noted.question.updatedAt).toBe(latestAt)
      expect(noted.question.readingNotes[0]?.createdAt).toBe(latestAt)
      const claimed = await second.information.writeClaim({
        questionId: question.id,
        expectedRevision: noted.question.revision,
        kind: 'source-statement',
        facet: 'metric',
        text: 'Clock-safe claim',
        evidenceLinks: [{ evidenceId: captured.evidenceId, relation: 'supports' }],
        author,
      })
      expect(claimed.status).toBe('created')
      if (claimed.status !== 'created') throw new Error('expected claim')
      expect(claimed.question.updatedAt).toBe(latestAt)
      expect(claimed.question.claims[0]?.createdAt).toBe(latestAt)
      const normalized = await second.information.writeEntity({
        questionId: question.id,
        expectedRevision: claimed.question.revision,
        kind: 'metric',
        canonicalName: 'Clock-safe metric',
        sourceClaimIds: [claimed.claimId],
        author,
      })
      expect(normalized.status).toBe('created')
      if (normalized.status !== 'created') throw new Error('expected entity')
      expect(normalized.question.updatedAt).toBe(latestAt)
      expect(normalized.question.entities[0]?.createdAt).toBe(latestAt)
      const synthesized = await second.information.writeSynthesis({
        questionId: question.id,
        expectedRevision: normalized.question.revision,
        findings: [{
          kind: 'source-summary',
          stance: 'agreement',
          text: 'Clock-safe finding',
          claimIds: [claimed.claimId],
        }],
        author,
      })
      expect(synthesized.status).toBe('created')
      if (synthesized.status !== 'created') throw new Error('expected synthesis')
      expect(synthesized.question.updatedAt).toBe(latestAt)
      expect(synthesized.question.syntheses[0]?.createdAt).toBe(latestAt)
      await second.informationFiber.dispose()
      await second.libraryFiber.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('compares persisted offset timestamps by instant when clamping mutations', async () => {
    vi.useFakeTimers()
    try {
      const base = storedQuestion()
      const record: ResearchQuestionRecord = {
        ...base,
        createdAt: '2026-08-31T23:59:00.000Z',
        updatedAt: offsetFutureAt,
      }
      vi.setSystemTime(new Date('2026-09-01T04:00:00.000Z'))
      const mounted = await mount({
        pool: poolWithQuestions([[String(record.id), record]]),
      })
      const result = await mounted.information.writeQuestion({
        action: 'update',
        questionId: record.id,
        expectedRevision: record.revision,
        title: 'Offset-safe title',
        author,
      })
      expect(result.status).toBe('updated')
      if (result.status !== 'updated') throw new Error('expected title update')
      expect(result.question.updatedAt).toBe(offsetFutureAt)
      await mounted.informationFiber.dispose()
      await mounted.libraryFiber.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reopens complete aggregates, including historical findings whose claims became inactive', async () => {
    const pool = poolWithQuestions()
    const first = await mount({ pool })
    let question = await createQuestion(first.information)
    const captured = await capture(first.information, question)
    question = captured.question
    const original = await first.information.writeClaim({
      questionId: question.id, expectedRevision: question.revision,
      kind: 'source-statement', facet: 'method', text: 'Original',
      evidenceLinks: [{ evidenceId: captured.evidenceId, relation: 'supports' }], author,
    })
    if (original.status !== 'created') throw new Error('expected claim')
    const cited = await first.information.writeSynthesis({
      questionId: question.id, expectedRevision: original.question.revision,
      findings: [{
        kind: 'source-summary', stance: 'agreement', text: 'Original summary', claimIds: [original.claimId],
      }], author,
    })
    if (cited.status !== 'created') throw new Error('expected synthesis')
    const normalized = await first.information.writeEntity({
      questionId: question.id,
      expectedRevision: cited.question.revision,
      kind: 'method',
      canonicalName: 'Durable method',
      sourceClaimIds: [original.claimId],
      author,
    })
    if (normalized.status !== 'created') throw new Error('expected entity')
    const alias = await first.information.writeEntity({
      questionId: question.id,
      expectedRevision: normalized.question.revision,
      kind: 'method',
      canonicalName: 'Durable method alias',
      sourceClaimIds: [original.claimId],
      author,
    })
    if (alias.status !== 'created') throw new Error('expected alias entity')
    const merged = await first.information.writeEntity({
      questionId: question.id,
      expectedRevision: alias.question.revision,
      kind: 'method',
      canonicalName: 'Merged durable method',
      sourceClaimIds: [original.claimId],
      supersedes: [normalized.entityId, alias.entityId],
      author,
    })
    if (merged.status !== 'created') throw new Error('expected merged entity')
    const replacement = await first.information.writeClaim({
      questionId: question.id, expectedRevision: merged.question.revision,
      kind: 'source-statement', facet: 'method', text: 'Replacement',
      evidenceLinks: [{ evidenceId: captured.evidenceId, relation: 'supports' }],
      supersedes: original.claimId, author,
    })
    if (replacement.status !== 'created') throw new Error('expected replacement')
    const additionalEvidence = await capture(
      first.information,
      replacement.question,
      'b',
      'Beta evidence',
      'durable-reading-note',
    )
    const originalNote = await first.information.writeReadingNote({
      questionId: question.id,
      expectedRevision: additionalEvidence.question.revision,
      kind: 'note',
      text: 'Durable reading note',
      evidenceId: captured.evidenceId,
      author,
    })
    if (originalNote.status !== 'created') throw new Error('expected reading note')
    const noted = await first.information.writeReadingNote({
      questionId: question.id,
      expectedRevision: originalNote.question.revision,
      kind: 'note',
      text: 'Corrected durable reading note',
      evidenceId: additionalEvidence.evidenceId,
      supersedes: originalNote.readingNoteId,
      author,
    })
    if (noted.status !== 'created') throw new Error('expected replacement reading note')
    await first.informationFiber.dispose()
    await first.libraryFiber.dispose()

    const second = await mount({ pool })
    expect(second.information.get(question.id)).toEqual(noted.question)
    await second.informationFiber.dispose()
    await second.libraryFiber.dispose()
  })

  it('does not publish a failed write and continues its serialized operation queue', async () => {
    const pool = poolWithQuestions()
    const mounted = await mount({ pool })
    pool.failNextWrites = 1
    await expect(mounted.information.writeQuestion({
      action: 'create', title: 'Rejected', question: 'Rejected?', author,
    })).rejects.toThrow(/injected write failure/)
    expect(mounted.information.list()).toEqual([])
    const question = await createQuestion(mounted.information)
    const [left, right] = await Promise.all([
      mounted.information.writeQuestion({
        action: 'update', questionId: question.id, expectedRevision: 0, title: 'Left', author,
      }),
      mounted.information.writeQuestion({
        action: 'update', questionId: question.id, expectedRevision: 0, title: 'Right', author,
      }),
    ])
    expect([left.status, right.status].sort()).toEqual(['stale-revision', 'updated'])
  })

  it('returns aggregate capacity from every material mutation path', async () => {
    const stored = storedQuestion()
    const base: ResearchQuestionRecord = {
      ...stored,
      claims: [{ ...stored.claims[0]!, facet: 'metric' }],
    }
    const maxAggregateBytes = Buffer.byteLength(JSON.stringify(base), 'utf8')
    const { information } = await mount({
      pool: poolWithQuestions([[String(base.id), base]]),
      config: { maxAggregateBytes },
    })
    await expect(information.writeQuestion({
      action: 'update', questionId: base.id, expectedRevision: base.revision,
      title: `${base.title} extended`, author,
    })).resolves.toEqual({ status: 'capacity', resource: 'aggregate-bytes' })
    await expect(information.captureEvidence(captureRequest(base, 'b', 'Beta evidence')))
      .resolves.toEqual({ status: 'capacity', resource: 'aggregate-bytes' })
    await expect(information.writeClaim({
      questionId: base.id, expectedRevision: base.revision,
      kind: 'inference', facet: 'limitation', text: 'Additional inference',
      evidenceLinks: [], author,
    })).resolves.toEqual({ status: 'capacity', resource: 'aggregate-bytes' })
    await expect(information.writeSynthesis({
      questionId: base.id, expectedRevision: base.revision,
      findings: [{
        kind: 'inference', stance: 'open-question', text: 'Additional finding', claimIds: [],
      }],
      author,
    })).resolves.toEqual({ status: 'capacity', resource: 'aggregate-bytes' })
    await expect(information.writeReadingNote({
      questionId: base.id,
      expectedRevision: base.revision,
      kind: 'note',
      text: 'Additional reading note',
      evidenceId: base.evidence[0]!.id,
      author,
    })).resolves.toEqual({ status: 'capacity', resource: 'aggregate-bytes' })
    await expect(information.writeEntity({
      questionId: base.id,
      expectedRevision: base.revision,
      kind: 'metric',
      canonicalName: 'Additional metric',
      sourceClaimIds: [base.claims[0]!.id],
      author,
    })).resolves.toEqual({ status: 'capacity', resource: 'aggregate-bytes' })
    expect(information.get(base.id)).toEqual(base)
  })

  it('loads selected evidence, inference findings, and stable id tie-breaking', async () => {
    const base = storedQuestion()
    const selectedEvidence: ResearchEvidence = {
      ...base.evidence[0]!,
      locator: {
        kind: base.evidence[0]!.locator.kind,
        documentId: base.evidence[0]!.locator.documentId,
        blockId: base.evidence[0]!.locator.blockId,
        parserId: base.evidence[0]!.locator.parserId,
        parserVersion: base.evidence[0]!.locator.parserVersion,
        pageIndex: base.evidence[0]!.locator.pageIndex,
        bbox: base.evidence[0]!.locator.bbox,
        quoteHash: base.evidence[0]!.locator.quoteHash,
      },
      selection: {
        text: 'Alpha',
        startUtf8Byte: 0,
        endUtf8Byte: 5,
        textHash: ResearchEvidenceTextHash(`sha256:${hash('Alpha')}`),
      },
    }
    const inferenceSynthesis: ResearchSynthesis = {
      ...base.syntheses[0]!,
      findings: [{
        ...base.syntheses[0]!.findings[0]!,
        kind: 'inference',
        stance: 'open-question',
        claimIds: [],
      }],
    }
    const questionB: ResearchQuestionRecord = {
      ...base,
      id: ResearchQuestionId('question-b'),
      evidence: [selectedEvidence],
      syntheses: [inferenceSynthesis],
    }
    const questionA = { ...questionB, id: ResearchQuestionId('question-0') }
    const mounted = await mount({
      pool: poolWithQuestions([
        [String(questionB.id), questionB],
        [String(questionA.id), questionA],
      ]),
    })
    expect(mounted.information.list().map(value => value.id)).toEqual(['question-0', 'question-b'])
    expect(mounted.information.get(questionB.id)?.evidence[0]?.selection?.text).toBe('Alpha')
  })

  it('conservatively accepts same-timestamp entity and synthesis claim-supersession history', async () => {
    const base = storedQuestion()
    const methodClaim: ResearchClaim = { ...base.claims[0]!, facet: 'method' }
    const replacement: ResearchClaim = {
      ...methodClaim,
      id: ResearchClaimId('claim-replacement'),
      text: 'Replacement claim',
      supersedes: methodClaim.id,
      createdAt: laterAt,
    }
    const record: ResearchQuestionRecord = {
      ...base,
      claims: [methodClaim, replacement],
      entities: [entity()],
    }

    const mounted = await mount({
      pool: poolWithQuestions([[String(record.id), record]]),
    })

    expect(mounted.information.get(record.id)?.entities).toEqual(record.entities)
    expect(mounted.information.get(record.id)?.syntheses).toEqual(record.syntheses)
  })

  it('validates stored observation and comparison timelines, references, and capacities', async () => {
    const builder = await mount()
    const state = await createProtocolState(builder.information)
    const base = state.record
    const observationA = base.observations.find(value => value.id === state.observationA.observationId)!
    const observationB = base.observations.find(value => value.id === state.observationB.observationId)!
    const protocol = base.comparisonProtocols.find(
      value => value.id === state.protocol.comparisonProtocolId,
    )!
    const methodEntity = base.entities.find(value => value.kind === 'method')!
    const datasetEntity = base.entities.find(value => value.kind === 'dataset')!
    const resultClaimA = base.claims.find(value => value.id === state.foundation.claims.a.result)!
    const methodClaimA = base.claims.find(value => value.id === state.foundation.claims.a.method)!
    const methodClaimB = base.claims.find(value => value.id === state.foundation.claims.b.method)!
    const at = (seconds: number) => new Date(Date.parse(base.createdAt) + seconds * 1_000).toISOString()
    const until = (record: ResearchQuestionRecord): ResearchQuestionRecord => ({
      ...record,
      updatedAt: at(100),
    })
    const successorObservation = (
      source: ResearchObservation,
      id: string,
      supersedes: ResearchObservation['id'],
      createdAt = at(60),
    ): ResearchObservation => ({
      ...source,
      id: ResearchObservationId(id),
      supersedes,
      createdAt,
    })
    const successorProtocol = (
      id: string,
      supersedes: ResearchComparisonProtocol['id'],
      createdAt = at(90),
    ): ResearchComparisonProtocol => ({
      ...protocol,
      id: ResearchComparisonProtocolId(id),
      supersedes,
      createdAt,
    })
    const cases: Array<{
      name: string
      record: ResearchQuestionRecord
      config?: Config
      pattern: RegExp
    }> = [
      {
        name: 'observation capacity',
        record: base,
        config: { maxObservationsPerQuestion: 1 },
        pattern: /observations exceed configured maximum/,
      },
      {
        name: 'comparison protocol capacity',
        record: {
          ...base,
          comparisonProtocols: [protocol, successorProtocol('protocol-capacity', protocol.id)],
          updatedAt: at(100),
        },
        config: { maxComparisonProtocolsPerQuestion: 1 },
        pattern: /comparison protocols exceed configured maximum/,
      },
      {
        name: 'observation condition capacity',
        record: base,
        config: { maxConditionsPerObservation: 1 },
        pattern: /conditions exceed configured maximum/,
      },
      {
        name: 'invalid observation field',
        record: {
          ...base,
          observations: [{ ...observationA, value: ResearchDecimal('NaN') }, observationB],
        },
        pattern: /observation value must be a finite base-ten number/,
      },
      {
        name: 'non-canonical observation field',
        record: {
          ...base,
          observations: [observationA, { ...observationB, value: ResearchDecimal('90.0') }],
        },
        pattern: /observation.*fields are not normalized/,
      },
      {
        name: 'observation field capacity',
        record: {
          ...base,
          observations: [
            { ...observationA, valueStatistic: 'x'.repeat(41) },
            observationB,
          ],
        },
        config: { maxFieldBytes: 40 },
        pattern: /observation.*fields exceed configured UTF-8 limit/,
      },
      {
        name: 'observation result facet',
        record: {
          ...base,
          observations: [{ ...observationA, resultClaimId: methodClaimA.id }, observationB],
          comparisonProtocols: [],
        },
        pattern: /result claim has facet 'method'/,
      },
      {
        name: 'observation missing entity',
        record: {
          ...base,
          observations: [{
            ...observationA,
            method: { ...observationA.method, entityId: ResearchEntityId('missing') },
          }, observationB],
          comparisonProtocols: [],
        },
        pattern: /missing or later method entity/,
      },
      {
        name: 'observation later entity',
        record: until({
          ...base,
          entities: base.entities.map(value => value.id === methodEntity.id
            ? { ...value, createdAt: at(60) }
            : value),
          observations: [{ ...observationA, createdAt: at(50) }, observationB],
          comparisonProtocols: [],
        }),
        pattern: /missing or later method entity/,
      },
      {
        name: 'observation entity kind',
        record: {
          ...base,
          observations: [{
            ...observationA,
            method: {
              ...observationA.method,
              entityId: datasetEntity.id,
              sourceClaimId: state.foundation.claims.a.dataset,
            },
          }, observationB],
          comparisonProtocols: [],
        },
        pattern: /method reference has kind 'dataset'/,
      },
      {
        name: 'observation entity claim membership',
        record: {
          ...base,
          observations: [{
            ...observationA,
            method: { ...observationA.method, sourceClaimId: state.foundation.claims.a.dataset },
          }, observationB],
          comparisonProtocols: [],
        },
        pattern: /method claim is not an entity member/,
      },
      {
        name: 'observation missing claim',
        record: {
          ...base,
          observations: [{ ...observationA, resultClaimId: ResearchClaimId('missing') }, observationB],
          comparisonProtocols: [],
        },
        pattern: /result claim is missing or later/,
      },
      {
        name: 'observation later claim',
        record: until({
          ...base,
          claims: base.claims.map(value => value.id === resultClaimA.id
            ? { ...value, createdAt: at(60) }
            : value),
          observations: [{ ...observationA, createdAt: at(50) }, observationB],
          comparisonProtocols: [],
        }),
        pattern: /result claim is missing or later/,
      },
      {
        name: 'observation inference claim',
        record: {
          ...base,
          claims: base.claims.map(value => value.id === resultClaimA.id
            ? { ...value, kind: 'inference' }
            : value),
          comparisonProtocols: [],
        },
        pattern: /result claim lacks source-statement evidence/,
      },
      {
        name: 'observation cross-paper entity claim',
        record: {
          ...base,
          observations: [{
            ...observationA,
            method: { ...observationA.method, sourceClaimId: methodClaimB.id },
          }, observationB],
          comparisonProtocols: [],
        },
        pattern: /method claim comes from another paper/,
      },
      {
        name: 'entity superseded before observation',
        record: until({
          ...base,
          entities: [...base.entities, {
            ...methodEntity,
            id: ResearchEntityId('replacement-method'),
            canonicalName: 'Replacement method',
            supersedes: [methodEntity.id],
            createdAt: at(40),
          }],
          observations: [{ ...observationA, createdAt: at(50) }, observationB],
          comparisonProtocols: [],
        }),
        pattern: /superseded before observation creation/,
      },
      {
        name: 'observation supersedes missing',
        record: {
          ...base,
          observations: [
            observationA,
            observationB,
            successorObservation(observationA, 'observation-missing-predecessor', ResearchObservationId('missing')),
          ],
          comparisonProtocols: [],
          updatedAt: at(100),
        },
        pattern: /supersedes a missing or later observation/,
      },
      {
        name: 'observation superseded twice',
        record: {
          ...base,
          observations: [
            observationA,
            observationB,
            successorObservation(observationA, 'observation-successor-one', observationA.id),
            successorObservation(observationA, 'observation-successor-two', observationA.id, at(70)),
          ],
          comparisonProtocols: [],
          updatedAt: at(100),
        },
        pattern: /observation.*superseded more than once/,
      },
      {
        name: 'observation successor precedes predecessor',
        record: until({
          ...base,
          observations: [
            { ...observationA, createdAt: at(60) },
            observationB,
            successorObservation(observationA, 'observation-early-successor', observationA.id, at(50)),
          ],
          comparisonProtocols: [],
        }),
        pattern: /createdAt precedes superseded observation/,
      },
      {
        name: 'observation supersession changes paper',
        record: until({
          ...base,
          observations: [
            observationA,
            observationB,
            successorObservation(observationB, 'observation-cross-paper-successor', observationA.id),
          ],
          comparisonProtocols: [],
        }),
        pattern: /changes paper across supersession/,
      },
      {
        name: 'comparison too few observations',
        record: {
          ...base,
          comparisonProtocols: [{ ...protocol, observationIds: [observationA.id] }],
        },
        pattern: /fewer than two observations/,
      },
      {
        name: 'comparison observation capacity',
        record: until({
          ...base,
          observations: [
            observationA,
            observationB,
            { ...observationA, id: ResearchObservationId('observation-third'), createdAt: at(50) },
          ],
          comparisonProtocols: [{
            ...protocol,
            observationIds: [observationA.id, observationB.id, ResearchObservationId('observation-third')],
            createdAt: at(80),
          }],
        }),
        config: { maxObservationReferencesPerProtocol: 2 },
        pattern: /observation references exceed configured maximum/,
      },
      {
        name: 'comparison reference not member',
        record: {
          ...base,
          comparisonProtocols: [{
            ...protocol,
            referenceObservationId: ResearchObservationId('missing'),
          }],
        },
        pattern: /reference observation is not a member/,
      },
      {
        name: 'comparison missing observation',
        record: {
          ...base,
          comparisonProtocols: [{
            ...protocol,
            observationIds: [observationA.id, ResearchObservationId('missing')],
            referenceObservationId: observationA.id,
          }],
        },
        pattern: /references a missing or later observation/,
      },
      {
        name: 'comparison later observation',
        record: until({
          ...base,
          observations: [observationA, { ...observationB, createdAt: at(90) }],
          comparisonProtocols: [{ ...protocol, createdAt: at(80) }],
        }),
        pattern: /references a missing or later observation/,
      },
      {
        name: 'comparison superseded observation',
        record: until({
          ...base,
          observations: [
            observationA,
            observationB,
            successorObservation(observationA, 'observation-protocol-successor', observationA.id),
          ],
          comparisonProtocols: [{ ...protocol, createdAt: at(80) }],
        }),
        pattern: /observation.*superseded before protocol creation/,
      },
      {
        name: 'comparison stale claim',
        record: until({
          ...base,
          claims: [...base.claims, {
            ...resultClaimA,
            id: ResearchClaimId('replacement-result-a'),
            text: 'Replacement result A',
            supersedes: resultClaimA.id,
            createdAt: at(60),
          }],
          observations: [{ ...observationA, createdAt: at(50) }, observationB],
          comparisonProtocols: [{ ...protocol, createdAt: at(80) }],
        }),
        pattern: /comparison protocol.*references claim.*superseded before comparison protocol creation/,
      },
      {
        name: 'comparison stale entity',
        record: until({
          ...base,
          entities: [...base.entities, {
            ...methodEntity,
            id: ResearchEntityId('protocol-replacement-method'),
            canonicalName: 'Protocol replacement method',
            supersedes: [methodEntity.id],
            createdAt: at(60),
          }],
          observations: [{ ...observationA, createdAt: at(50) }, observationB],
          comparisonProtocols: [{ ...protocol, createdAt: at(80) }],
        }),
        pattern: /observation.*with a superseded entity/,
      },
      {
        name: 'comparison one paper',
        record: until({
          ...base,
          observations: [
            observationA,
            observationB,
            { ...observationA, id: ResearchObservationId('observation-same-paper'), createdAt: at(50) },
          ],
          comparisonProtocols: [{
            ...protocol,
            observationIds: [observationA.id, ResearchObservationId('observation-same-paper')],
            referenceObservationId: observationA.id,
            createdAt: at(80),
          }],
        }),
        pattern: /does not span two papers/,
      },
      {
        name: 'comparison incompatible dimension',
        record: {
          ...base,
          observations: [observationA, {
            ...observationB,
            unit: { status: 'reported', symbol: 'fraction' },
          }],
        },
        pattern: /has incompatible unit/,
      },
      {
        name: 'comparison supersedes missing',
        record: until({
          ...base,
          comparisonProtocols: [{
            ...protocol,
            supersedes: ResearchComparisonProtocolId('missing'),
            createdAt: at(80),
          }],
        }),
        pattern: /supersedes a missing or later protocol/,
      },
      {
        name: 'comparison superseded twice',
        record: until({
          ...base,
          comparisonProtocols: [
            { ...protocol, createdAt: at(80) },
            successorProtocol('protocol-successor-one', protocol.id),
            successorProtocol('protocol-successor-two', protocol.id, at(95)),
          ],
        }),
        pattern: /comparison protocol.*superseded more than once/,
      },
      {
        name: 'comparison successor precedes predecessor',
        record: until({
          ...base,
          comparisonProtocols: [
            { ...protocol, createdAt: at(90) },
            successorProtocol('protocol-early-successor', protocol.id, at(80)),
          ],
        }),
        pattern: /createdAt precedes superseded protocol/,
      },
    ]

    for (const scenario of cases) {
      const record = cloneRecord(scenario.record)
      let message: string | undefined
      try {
        await mount({
          pool: poolWithQuestions([[String(record.id), record]]),
          ...(scenario.config === undefined ? {} : { config: scenario.config }),
        })
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      if (message === undefined) throw new Error(`${scenario.name} unexpectedly mounted`)
      expect(message, scenario.name).toMatch(scenario.pattern)
    }

    const activeSuccessor = successorObservation(
      observationA,
      'active-observation-successor',
      observationA.id,
      at(60),
    )
    const activeProtocol = successorProtocol('active-protocol-successor', protocol.id, at(90))
    const validHistory = until({
      ...base,
      observations: [observationA, observationB, activeSuccessor],
      comparisonProtocols: [
        { ...protocol, createdAt: at(50) },
        {
          ...activeProtocol,
          observationIds: [activeSuccessor.id, observationB.id],
          referenceObservationId: activeSuccessor.id,
        },
      ],
    })
    const mountedHistory = await mount({
      pool: poolWithQuestions([[String(validHistory.id), validHistory]]),
    })
    expect(mountedHistory.information.get(validHistory.id)?.comparisonProtocols).toHaveLength(2)

    const explicitInapplicableSource = cloneRecord(base)
    const explicitInapplicable: ResearchQuestionRecord = {
      ...explicitInapplicableSource,
      observations: explicitInapplicableSource.observations.map((value): ResearchObservation => ({
        ...value,
        method: { ...value.method, role: 'other', otherRole: 'External baseline' },
        dataset: { ...value.dataset, split: { status: 'not-applicable' } },
        unit: { status: 'not-applicable' },
        evaluationProtocol: { status: 'not-applicable' },
        uncertainty: { status: 'not-applicable' },
        conditions: { status: 'not-applicable' },
      })),
    }
    const mountedInapplicable = await mount({
      pool: poolWithQuestions([[String(explicitInapplicable.id), explicitInapplicable]]),
    })
    expect(mountedInapplicable.information.get(explicitInapplicable.id)?.observations).toHaveLength(2)
  })

  it('rejects malformed aggregate relationships and configured stored capacities', async () => {
    const base = storedQuestion()
    const evidenceB = evidence('b', 'Beta evidence')
    const sourceB = claim('claim-b', evidenceB.id)
    const replacement: ResearchClaim = {
      ...claim('claim-replacement'), supersedes: ResearchClaimId('claim-a'), createdAt: laterAt,
    }
    const secondSynthesis = synthesis('synthesis-b')
    const noteA = readingNote()
    const noteReplacement: ResearchReadingNote = {
      ...readingNote('reading-note-replacement'),
      supersedes: noteA.id,
      createdAt: laterAt,
    }
    const selectedEvidenceA: ResearchEvidence = {
      ...base.evidence[0]!,
      selection: {
        text: 'Alpha',
        startUtf8Byte: 0,
        endUtf8Byte: 5,
        textHash: ResearchEvidenceTextHash(`sha256:${hash('Alpha')}`),
      },
    }
    const methodClaim: ResearchClaim = { ...base.claims[0]!, facet: 'method' }
    const entityA = entity()
    const entityB = { ...entity('entity-b'), createdAt: laterAt }
    const entityReplacement: ResearchEntity = {
      ...entity('entity-replacement'),
      supersedes: [entityA.id],
      createdAt: latestAt,
    }
    const entityRecord: ResearchQuestionRecord = {
      ...base,
      claims: [methodClaim],
      entities: [entityA],
    }
    const cases: Array<{
      name: string
      record: ResearchQuestionRecord
      config?: Config
      pattern: RegExp
    }> = [
      { name: 'non-normalized title', record: { ...base, title: ' Stored ' }, pattern: /title is not normalized/ },
      { name: 'empty question', record: { ...base, question: '' }, pattern: /question must not be empty/ },
      {
        name: 'non-normalized creator',
        record: { ...base, createdBy: { ...author, id: ResearchAuthorId(' agent ') } },
        pattern: /author id is not normalized/,
      },
      {
        name: 'non-normalized updater',
        record: { ...base, updatedBy: { ...author, id: ResearchAuthorId(' agent ') } },
        pattern: /author id is not normalized/,
      },
      { name: 'time reversal', record: { ...base, createdAt: latestAt }, pattern: /updatedAt precedes/ },
      {
        name: 'offset time reversal',
        record: {
          ...base,
          createdAt: offsetFutureAt,
          updatedAt: '2026-09-01T04:00:00.000Z',
        },
        pattern: /updatedAt precedes/,
      },
      {
        name: 'evidence capacity', record: { ...base, evidence: [base.evidence[0]!, evidenceB] },
        config: { maxEvidencePerQuestion: 1 }, pattern: /evidence exceeds/,
      },
      {
        name: 'claim capacity', record: { ...base, claims: [base.claims[0]!, sourceB] },
        config: { maxClaimsPerQuestion: 1 }, pattern: /claims exceed/,
      },
      {
        name: 'synthesis capacity', record: { ...base, syntheses: [base.syntheses[0]!, secondSynthesis] },
        config: { maxSynthesesPerQuestion: 1 }, pattern: /syntheses exceed/,
      },
      {
        name: 'reading note capacity',
        record: {
          ...base,
          readingNotes: [noteA, { ...readingNote('reading-note-b'), createdAt: latestAt }],
        },
        config: { maxReadingNotesPerQuestion: 1 },
        pattern: /reading notes exceed/,
      },
      {
        name: 'entity capacity',
        record: { ...entityRecord, entities: [entityA, entityB] },
        config: { maxEntitiesPerQuestion: 1 },
        pattern: /entities exceed/,
      },
      { name: 'aggregate capacity', record: base, config: { maxAggregateBytes: 1 }, pattern: /aggregate exceeds/ },
      {
        name: 'duplicate evidence ids', record: { ...base, evidence: [base.evidence[0]!, base.evidence[0]!] },
        pattern: /evidence ids.*duplicates/,
      },
      {
        name: 'duplicate claim ids', record: { ...base, claims: [base.claims[0]!, base.claims[0]!] },
        pattern: /claim ids.*duplicates/,
      },
      {
        name: 'duplicate synthesis ids',
        record: { ...base, syntheses: [base.syntheses[0]!, base.syntheses[0]!] },
        pattern: /synthesis ids.*duplicates/,
      },
      {
        name: 'duplicate reading note ids',
        record: { ...base, readingNotes: [noteA, noteA] },
        pattern: /reading note ids.*duplicates/,
      },
      {
        name: 'duplicate entity ids',
        record: { ...entityRecord, entities: [entityA, entityA] },
        pattern: /entity ids.*duplicates/,
      },
      {
        name: 'evidence creator',
        record: {
          ...base,
          evidence: [{ ...base.evidence[0]!, createdBy: { ...author, id: ResearchAuthorId(' bad ') } }],
        },
        pattern: /author id is not normalized/,
      },
      {
        name: 'empty block', record: { ...base, evidence: [{ ...base.evidence[0]!, blockText: '' }] },
        pattern: /block text must not be empty/,
      },
      {
        name: 'block capacity', record: base, config: { maxBlockBytes: 1 },
        pattern: /block text exceeds/,
      },
      {
        name: 'empty section',
        record: { ...base, evidence: [{ ...base.evidence[0]!, sectionPath: [''] }] },
        pattern: /section path must not be empty/,
      },
      {
        name: 'section capacity', record: base, config: { maxFieldBytes: 10 },
        pattern: /UTF-8 limit|section path exceeds/,
      },
      {
        name: 'invalid evidence provenance',
        record: {
          ...base,
          evidence: [{ ...base.evidence[0]!, paperId: ResearchPaperId('missing') }],
        },
        pattern: /invalid provenance/,
      },
      {
        name: 'evidence before question',
        record: { ...base, evidence: [{ ...base.evidence[0]!, createdAt: earlierAt }] },
        pattern: /evidence.*createdAt precedes question createdAt/,
      },
      {
        name: 'evidence after aggregate update',
        record: { ...base, evidence: [{ ...base.evidence[0]!, createdAt: latestAt }] },
        pattern: /evidence.*createdAt follows question updatedAt/,
      },
      {
        name: 'reading note text',
        record: { ...base, readingNotes: [{ ...noteA, text: ' Note ' }] },
        pattern: /reading note text is not normalized/,
      },
      {
        name: 'reading note field capacity',
        record: { ...base, readingNotes: [{ ...noteA, text: 'x'.repeat(41) }] },
        config: { maxFieldBytes: 40 },
        pattern: /reading note text exceeds configured UTF-8 limit/,
      },
      {
        name: 'empty reading note text',
        record: { ...base, readingNotes: [{ ...noteA, text: '' }] },
        pattern: /reading note text must not be empty/,
      },
      {
        name: 'reading note creator',
        record: {
          ...base,
          readingNotes: [{ ...noteA, createdBy: { ...author, id: ResearchAuthorId(' bad ') } }],
        },
        pattern: /author id is not normalized/,
      },
      {
        name: 'reading note before question',
        record: {
          ...base,
          readingNotes: [{ ...noteA, createdAt: earlierAt }],
        },
        pattern: /createdAt precedes question createdAt/,
      },
      {
        name: 'reading note after aggregate update',
        record: { ...base, readingNotes: [{ ...noteA, createdAt: latestAt }] },
        pattern: /createdAt follows question updatedAt/,
      },
      {
        name: 'missing reading note evidence',
        record: {
          ...base,
          readingNotes: [{ ...noteA, evidenceId: ResearchEvidenceId('missing') }],
        },
        pattern: /references missing or later evidence/,
      },
      {
        name: 'later reading note evidence',
        record: {
          ...base,
          evidence: [{ ...base.evidence[0]!, createdAt: latestAt }],
          readingNotes: [noteA],
          updatedAt: latestAt,
        },
        pattern: /references missing or later evidence/,
      },
      {
        name: 'passage question without selection',
        record: { ...base, readingNotes: [{ ...noteA, kind: 'passage-question' }] },
        pattern: /passage question.*lacks exact selected evidence/,
      },
      {
        name: 'reading note supersedes missing',
        record: {
          ...base,
          readingNotes: [{ ...noteReplacement, supersedes: ResearchReadingNoteId('missing') }],
        },
        pattern: /supersedes a missing or later reading note/,
      },
      {
        name: 'reading note superseded twice',
        record: {
          ...base,
          readingNotes: [
            noteA,
            noteReplacement,
            {
              ...noteReplacement,
              id: ResearchReadingNoteId('reading-note-third'),
              evidenceId: evidenceB.id,
            },
          ],
          evidence: [base.evidence[0]!, evidenceB],
        },
        pattern: /reading note.*superseded more than once/,
      },
      {
        name: 'reading note replacement before predecessor',
        record: {
          ...base,
          updatedAt: latestAt,
          readingNotes: [
            noteA,
            { ...noteReplacement, createdAt: storedAt },
          ],
        },
        pattern: /createdAt precedes superseded reading note/,
      },
      {
        name: 'reading note changes kind',
        record: {
          ...base,
          evidence: [selectedEvidenceA],
          readingNotes: [
            { ...noteA, kind: 'passage-question' },
            noteReplacement,
          ],
        },
        pattern: /changes reading note kind/,
      },
      {
        name: 'claim text', record: { ...base, claims: [{ ...base.claims[0]!, text: ' Claim ' }] },
        pattern: /claim text is not normalized/,
      },
      {
        name: 'claim creator',
        record: {
          ...base,
          claims: [{ ...base.claims[0]!, createdBy: { ...author, id: ResearchAuthorId(' bad ') } }],
        },
        pattern: /author id is not normalized/,
      },
      {
        name: 'claim before question',
        record: { ...base, claims: [{ ...base.claims[0]!, createdAt: earlierAt }] },
        pattern: /claim.*createdAt precedes question createdAt/,
      },
      {
        name: 'claim after aggregate update',
        record: { ...base, claims: [{ ...base.claims[0]!, createdAt: latestAt }] },
        pattern: /claim.*createdAt follows question updatedAt/,
      },
      {
        name: 'other facet missing',
        record: { ...base, claims: [{ ...base.claims[0]!, facet: 'other' }] },
        pattern: /lacks otherFacet/,
      },
      {
        name: 'other facet unexpected',
        record: { ...base, claims: [{ ...base.claims[0]!, otherFacet: 'extra' }] },
        pattern: /stores otherFacet/,
      },
      {
        name: 'other facet non-normalized',
        record: { ...base, claims: [{ ...base.claims[0]!, facet: 'other', otherFacet: ' Other ' }] },
        pattern: /other facet is not normalized/,
      },
      {
        name: 'claim link capacity',
        record: {
          ...base,
          claims: [{
            ...base.claims[0]!,
            evidenceLinks: [
              base.claims[0]!.evidenceLinks[0]!,
              { evidenceId: ResearchEvidenceId('evidence-a'), relation: 'qualifies' },
            ],
          }],
        },
        config: { maxEvidenceLinksPerClaim: 1 }, pattern: /evidence links exceed/,
      },
      {
        name: 'duplicate claim links',
        record: {
          ...base,
          claims: [{
            ...base.claims[0]!, evidenceLinks: [base.claims[0]!.evidenceLinks[0]!, base.claims[0]!.evidenceLinks[0]!],
          }],
        },
        pattern: /evidence links.*duplicates/,
      },
      {
        name: 'missing claim evidence',
        record: {
          ...base,
          claims: [{
            ...base.claims[0]!,
            evidenceLinks: [{ evidenceId: ResearchEvidenceId('missing'), relation: 'supports' }],
          }],
        },
        pattern: /references missing or later evidence/,
      },
      {
        name: 'later claim evidence',
        record: {
          ...base,
          evidence: [{ ...base.evidence[0]!, createdAt: laterAt }],
        },
        pattern: /references missing or later evidence/,
      },
      {
        name: 'uncited source claim',
        record: { ...base, claims: [{ ...base.claims[0]!, evidenceLinks: [] }] },
        pattern: /has no evidence/,
      },
      {
        name: 'multi-paper source claim',
        record: {
          ...base,
          evidence: [base.evidence[0]!, evidenceB],
          claims: [{
            ...base.claims[0]!,
            evidenceLinks: [
              base.claims[0]!.evidenceLinks[0]!,
              { evidenceId: evidenceB.id, relation: 'contradicts' },
            ],
          }],
        },
        pattern: /spans multiple papers/,
      },
      {
        name: 'claim supersedes missing',
        record: { ...base, claims: [{ ...base.claims[0]!, supersedes: ResearchClaimId('missing') }] },
        pattern: /supersedes a missing or later claim/,
      },
      {
        name: 'claim superseded twice',
        record: {
          ...base,
          claims: [base.claims[0]!, replacement, { ...replacement, id: ResearchClaimId('claim-third') }],
        },
        pattern: /superseded more than once/,
      },
      {
        name: 'claim changes kind',
        record: {
          ...base,
          claims: [base.claims[0]!, { ...replacement, kind: 'inference' }],
        },
        pattern: /changes claim kind/,
      },
      {
        name: 'claim replacement before predecessor',
        record: {
          ...base,
          claims: [
            { ...base.claims[0]!, createdAt: laterAt },
            { ...replacement, createdAt: storedAt },
          ],
        },
        pattern: /createdAt precedes superseded claim/,
      },
      {
        name: 'entity canonical name',
        record: { ...entityRecord, entities: [{ ...entityA, canonicalName: ' Method ' }] },
        pattern: /entity canonical name is not normalized/,
      },
      {
        name: 'empty entity canonical name',
        record: { ...entityRecord, entities: [{ ...entityA, canonicalName: '' }] },
        pattern: /entity canonical name must not be empty/,
      },
      {
        name: 'entity canonical name capacity',
        record: { ...entityRecord, entities: [{ ...entityA, canonicalName: 'x'.repeat(41) }] },
        config: { maxFieldBytes: 40 },
        pattern: /entity canonical name exceeds configured UTF-8 limit/,
      },
      {
        name: 'entity creator',
        record: {
          ...entityRecord,
          entities: [{ ...entityA, createdBy: { ...author, id: ResearchAuthorId(' bad ') } }],
        },
        pattern: /author id is not normalized/,
      },
      {
        name: 'entity before question',
        record: {
          ...entityRecord,
          entities: [{ ...entityA, createdAt: earlierAt }],
        },
        pattern: /entity.*createdAt precedes question createdAt/,
      },
      {
        name: 'entity after aggregate update',
        record: { ...entityRecord, entities: [{ ...entityA, createdAt: latestAt }] },
        pattern: /entity.*createdAt follows question updatedAt/,
      },
      {
        name: 'entity without source claims',
        record: { ...entityRecord, entities: [{ ...entityA, sourceClaimIds: [] }] },
        pattern: /entity.*has no source claims/,
      },
      {
        name: 'entity claim reference capacity',
        record: {
          ...entityRecord,
          entities: [{ ...entityA, sourceClaimIds: [methodClaim.id, methodClaim.id] }],
        },
        config: { maxClaimReferencesPerEntity: 1 },
        pattern: /claim references exceed/,
      },
      {
        name: 'entity supersession reference capacity',
        record: {
          ...entityRecord,
          entities: [
            entityA,
            entityB,
            {
              ...entity('entity-merge'),
              supersedes: [entityA.id, entityB.id],
              createdAt: latestAt,
            },
          ],
          updatedAt: latestAt,
        },
        config: { maxSupersededEntitiesPerEntity: 1 },
        pattern: /supersession references exceed/,
      },
      {
        name: 'duplicate entity source claims',
        record: {
          ...entityRecord,
          entities: [{ ...entityA, sourceClaimIds: [methodClaim.id, methodClaim.id] }],
        },
        pattern: /source claim ids.*duplicates/,
      },
      {
        name: 'duplicate entity predecessors',
        record: {
          ...entityRecord,
          entities: [
            entityA,
            { ...entityReplacement, supersedes: [entityA.id, entityA.id] },
          ],
          updatedAt: latestAt,
        },
        pattern: /superseded entity ids.*duplicates/,
      },
      {
        name: 'missing entity claim',
        record: {
          ...entityRecord,
          entities: [{ ...entityA, sourceClaimIds: [ResearchClaimId('missing')] }],
        },
        pattern: /references a missing or later claim/,
      },
      {
        name: 'later entity claim',
        record: {
          ...entityRecord,
          claims: [{ ...methodClaim, createdAt: latestAt }],
          updatedAt: latestAt,
        },
        pattern: /references a missing or later claim/,
      },
      {
        name: 'entity claim superseded before entity creation',
        record: {
          ...entityRecord,
          claims: [
            methodClaim,
            {
              ...methodClaim,
              id: ResearchClaimId('claim-replacement'),
              text: 'Replacement claim',
              supersedes: methodClaim.id,
              createdAt: laterAt,
            },
          ],
          entities: [{ ...entityA, createdAt: latestAt }],
          updatedAt: latestAt,
        },
        pattern: /entity 'entity-a' references claim 'claim-a' superseded before entity creation/,
      },
      {
        name: 'entity inference claim',
        record: {
          ...entityRecord,
          claims: [{ ...methodClaim, kind: 'inference' }],
          syntheses: [],
        },
        pattern: /lacks source-statement evidence/,
      },
      {
        name: 'entity claim facet mismatch',
        record: { ...base, entities: [entityA] },
        pattern: /claim 'claim-a' has facet 'result'/,
      },
      {
        name: 'entity supersedes missing',
        record: {
          ...entityRecord,
          entities: [{ ...entityReplacement, supersedes: [ResearchEntityId('missing')] }],
          updatedAt: latestAt,
        },
        pattern: /supersedes a missing or later entity/,
      },
      {
        name: 'entity superseded twice',
        record: {
          ...entityRecord,
          entities: [
            entityA,
            entityReplacement,
            { ...entityReplacement, id: ResearchEntityId('entity-third') },
          ],
          updatedAt: latestAt,
        },
        pattern: /entity.*superseded more than once/,
      },
      {
        name: 'entity changes kind',
        record: {
          ...entityRecord,
          claims: [
            methodClaim,
            { ...methodClaim, id: ResearchClaimId('claim-metric'), facet: 'metric' },
          ],
          entities: [
            entityA,
            {
              ...entityReplacement,
              kind: 'metric',
              sourceClaimIds: [ResearchClaimId('claim-metric')],
            },
          ],
          updatedAt: latestAt,
        },
        pattern: /changes entity kind/,
      },
      {
        name: 'entity replacement before predecessor',
        record: {
          ...entityRecord,
          entities: [
            { ...entityA, createdAt: laterAt },
            { ...entityReplacement, createdAt: storedAt },
          ],
          updatedAt: latestAt,
        },
        pattern: /createdAt precedes superseded entity/,
      },
      {
        name: 'synthesis creator',
        record: {
          ...base,
          syntheses: [{ ...base.syntheses[0]!, createdBy: { ...author, id: ResearchAuthorId(' bad ') } }],
        },
        pattern: /author id is not normalized/,
      },
      {
        name: 'synthesis before question',
        record: { ...base, syntheses: [{ ...base.syntheses[0]!, createdAt: earlierAt }] },
        pattern: /synthesis.*createdAt precedes question createdAt/,
      },
      {
        name: 'synthesis after aggregate update',
        record: { ...base, syntheses: [{ ...base.syntheses[0]!, createdAt: latestAt }] },
        pattern: /synthesis.*createdAt follows question updatedAt/,
      },
      {
        name: 'empty synthesis',
        record: { ...base, syntheses: [{ ...base.syntheses[0]!, findings: [] }] },
        pattern: /has no findings/,
      },
      {
        name: 'finding capacity',
        record: {
          ...base,
          syntheses: [{
            ...base.syntheses[0]!,
            findings: [
              base.syntheses[0]!.findings[0]!,
              { ...base.syntheses[0]!.findings[0]!, id: ResearchFindingId('finding-extra') },
            ],
          }],
        },
        config: { maxFindingsPerSynthesis: 1 }, pattern: /findings exceed/,
      },
      {
        name: 'duplicate finding ids',
        record: {
          ...base,
          syntheses: [{
            ...base.syntheses[0]!, findings: [base.syntheses[0]!.findings[0]!, base.syntheses[0]!.findings[0]!],
          }],
        },
        pattern: /finding ids.*duplicates/,
      },
      {
        name: 'finding text',
        record: {
          ...base,
          syntheses: [{
            ...base.syntheses[0]!, findings: [{ ...base.syntheses[0]!.findings[0]!, text: ' Finding ' }],
          }],
        },
        pattern: /finding text is not normalized/,
      },
      {
        name: 'finding reference capacity',
        record: {
          ...base,
          syntheses: [{
            ...base.syntheses[0]!,
            findings: [{
              ...base.syntheses[0]!.findings[0]!,
              claimIds: [ResearchClaimId('claim-a'), ResearchClaimId('claim-b')],
            }],
          }],
        },
        config: { maxClaimReferencesPerFinding: 1 }, pattern: /claim references exceed/,
      },
      {
        name: 'duplicate finding claims',
        record: {
          ...base,
          syntheses: [{
            ...base.syntheses[0]!, findings: [{
              ...base.syntheses[0]!.findings[0]!, claimIds: [ResearchClaimId('claim-a'), ResearchClaimId('claim-a')],
            }],
          }],
        },
        pattern: /claim ids.*duplicates/,
      },
      {
        name: 'missing finding claim',
        record: {
          ...base,
          syntheses: [{
            ...base.syntheses[0]!, findings: [{
              ...base.syntheses[0]!.findings[0]!, claimIds: [ResearchClaimId('missing')],
            }],
          }],
        },
        pattern: /missing or later claim/,
      },
      {
        name: 'later finding claim',
        record: {
          ...base,
          updatedAt: '2026-09-01T06:00:00.000Z',
          claims: [{ ...base.claims[0]!, createdAt: offsetFutureAt }],
          syntheses: [{ ...base.syntheses[0]!, createdAt: '2026-09-01T04:00:00.000Z' }],
        },
        pattern: /missing or later claim/,
      },
      {
        name: 'uncited source summary',
        record: {
          ...base,
          claims: [{ ...base.claims[0]!, kind: 'inference', evidenceLinks: [] }],
        },
        pattern: /source-summary.*lacks source-statement evidence/,
      },
      {
        name: 'synthesis supersedes missing',
        record: {
          ...base,
          syntheses: [{ ...base.syntheses[0]!, supersedes: ResearchSynthesisId('missing') }],
        },
        pattern: /supersedes a missing or later synthesis/,
      },
      {
        name: 'synthesis superseded twice',
        record: {
          ...base,
          syntheses: [
            base.syntheses[0]!,
            { ...secondSynthesis, supersedes: ResearchSynthesisId('synthesis-a') },
            {
              ...secondSynthesis,
              id: ResearchSynthesisId('synthesis-c'),
              supersedes: ResearchSynthesisId('synthesis-a'),
            },
          ],
        },
        pattern: /synthesis.*superseded more than once/,
      },
      {
        name: 'synthesis replacement before predecessor',
        record: {
          ...base,
          syntheses: [
            base.syntheses[0]!,
            {
              ...secondSynthesis,
              supersedes: ResearchSynthesisId('synthesis-a'),
              createdAt: storedAt,
            },
          ],
        },
        pattern: /createdAt precedes superseded synthesis/,
      },
      {
        name: 'synthesis claim superseded before synthesis creation',
        record: {
          ...base,
          claims: [base.claims[0]!, replacement],
          syntheses: [{ ...base.syntheses[0]!, createdAt: latestAt }],
          updatedAt: latestAt,
        },
        pattern: /synthesis.*references claim.*superseded before synthesis creation/,
      },
    ]

    for (const scenario of cases) {
      let message: string | undefined
      try {
        await mount({
          pool: poolWithQuestions([[String(scenario.record.id), scenario.record]]),
          ...(scenario.config === undefined ? {} : { config: scenario.config }),
        })
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      if (message === undefined) throw new Error(`${scenario.name} unexpectedly mounted`)
      expect(message, scenario.name).toMatch(scenario.pattern)
    }

    await expect(mount({
      pool: poolWithQuestions([['wrong-key', base]]),
    })).rejects.toThrow(/table key 'wrong-key' differs/)
    await expect(mount({
      pool: poolWithQuestions([
        ['question-a', base],
        ['question-b', { ...base, id: ResearchQuestionId('question-b') }],
      ]),
      config: { maxQuestions: 1 },
    })).rejects.toThrow(/question count 2 exceeds/)
  })

  it('fails loud on a mismatching domain version and invalid direct configuration', async () => {
    const mismatch = poolWithQuestions()
    mismatch.versions.set('research_information', 3)
    await expect(mount({ pool: mismatch })).rejects.toMatchObject({ code: 'version-mismatch' })

    const oldRecord = poolWithQuestions()
    const {
      entities: _entities,
      observations: _observations,
      comparisonProtocols: _comparisonProtocols,
      ...versionThreeRecord
    } = storedQuestion()
    oldRecord.media.set('research_information', {
      global: null,
      tables: new Map([['questions', new Map([['question-a', versionThreeRecord]])]]),
    })
    await expect(mount({ pool: oldRecord })).rejects.toMatchObject({ code: 'invalid-record' })

    const invalidContext = new Context()
    expect(() => new ResearchInformation(invalidContext, { maxQuestions: Number.MAX_SAFE_INTEGER + 1 }))
      .toThrow(/positive safe integer/)
    expect(() => new ResearchInformation(new Context(), { maxObservationReferencesPerProtocol: 1 }))
      .toThrow(/safe integer at least 2/)
    const notStarted = new ResearchInformation(new Context())
    expect(() => notStarted.list()).toThrow(/not started yet/)
  })
})
