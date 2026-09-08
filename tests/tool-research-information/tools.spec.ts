import { describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import ResearchDocumentRuntime, {
  type ResearchDocument,
  type ResearchDocumentParseResult,
  type ResearchDocumentParser,
} from '../../src/research-document/index.ts'
import ResearchInformation, {
  ResearchClaimId,
  ResearchAuthorId,
  ResearchComparisonProtocolId,
  ResearchEntityId,
  ResearchEvidenceId,
  ResearchObservationId,
  ResearchQuestionId,
  ResearchSynthesisId,
  type Config as InformationConfig,
} from '../../src/research-information/index.ts'
import ResearchLibrary, {
  ResearchPaperId,
  ResearchSourceVersionId,
} from '../../src/research-library/index.ts'
import { CallId } from '@deepseek-ai/dsh-llm'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import { MemoryMediaPool, MemoryStorageBackend } from '../helpers/memory-backend.ts'
import * as ResearchInformationTools from '../../src/tool-research-information/index.ts'

const signal = new AbortController().signal
const agent = { id: 'research-information-test-agent' } as unknown as Agent
let callCounter = 0

function parseResult(options: {
  readonly text?: string
  readonly headingText?: string
  readonly secondHeadingText?: string
  readonly parserVersion?: string
  readonly extraction?: ResearchDocumentParseResult['extraction']
  readonly pageLabel?: string | false
} = {}): ResearchDocumentParseResult {
  const extraction = options.extraction ?? { text: 'native', layout: 'approximate' }
  return {
    parserVersion: options.parserVersion ?? 'fixture-v1',
    title: 'Fixture Paper',
    extraction,
    pages: [{
      pageIndex: 0,
      ...(options.pageLabel === false ? {} : { pageLabel: options.pageLabel ?? '1' }),
      width: 612,
      height: 792,
      blocks: extraction.text === 'none' ? [] : [
        {
          kind: 'heading',
          headingLevel: 1,
          text: options.headingText ?? 'Results',
          bbox: { x: 0.1, y: 0.1, width: 0.8, height: 0.04 },
        },
        ...(options.secondHeadingText === undefined
          ? []
          : [{
            kind: 'heading' as const,
            headingLevel: 2 as const,
            text: options.secondHeadingText,
            bbox: { x: 0.1, y: 0.15, width: 0.8, height: 0.04 },
          }]),
        {
          kind: 'paragraph',
          text: options.text ?? 'Alpha improves accuracy. Alpha improves robustness.',
          bbox: { x: 0.1, y: 0.2, width: 0.8, height: 0.08 },
        },
      ],
    }],
  }
}

function mutableParser(
  state: { result: ResearchDocumentParseResult },
  id = 'fixture-parser',
): ResearchDocumentParser {
  return {
    id,
    available: () => true,
    supports: mediaType => mediaType === 'application/pdf',
    parse: () => Promise.resolve(state.result),
  }
}

async function mount(options: {
  readonly pool?: MemoryMediaPool
  readonly maxDocuments?: number
  readonly toolConfig?: ResearchInformationTools.Config
  readonly parserState?: { result: ResearchDocumentParseResult }
  readonly parserId?: string
  readonly informationConfig?: InformationConfig
} = {}) {
  const pool = options.pool ?? new MemoryMediaPool()
  const parserState = options.parserState ?? { result: parseResult() }
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  const libraryFiber = await ctx.plugin(ResearchLibrary)
  const informationFiber = await ctx.plugin(ResearchInformation, options.informationConfig ?? {})
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const documentFiber = await ctx.plugin(ResearchDocumentRuntime, {
    maxDocuments: options.maxDocuments ?? 16,
  })
  ctx.researchDocuments.registerParser(mutableParser(parserState, options.parserId))
  const toolFiber = await ctx.plugin(ResearchInformationTools, options.toolConfig ?? {})
  return {
    ctx,
    pool,
    parserState,
    toolFiber,
    documentFiber,
    informationFiber,
    libraryFiber,
    call: (name: string, args: unknown, owner: Agent | null = agent) => ctx.tools.execute({
      signal,
      callId: CallId(`research-information-call-${++callCounter}`),
      name,
      arguments: args,
      ...(owner === null ? {} : { agent: owner }),
    }),
  }
}

async function dispose(setup: Awaited<ReturnType<typeof mount>>): Promise<void> {
  await setup.toolFiber.dispose()
  await setup.documentFiber.dispose()
  await setup.informationFiber.dispose()
  await setup.libraryFiber.dispose()
}

function value(result: ToolExecutionResult): Record<string, unknown> {
  expect(result.isError, JSON.stringify(result)).toBe(false)
  if (result.isError) throw new Error('expected successful tool execution')
  return result.value as Record<string, unknown>
}

function text(result: ToolExecutionResult): string {
  return result.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

async function createQuestion(setup: Awaited<ReturnType<typeof mount>>, title = 'RQ1') {
  const result = await setup.call('research_question_write', {
    action: 'create',
    title,
    question: 'What improves the measured outcome?',
  })
  const output = value(result)
  return {
    result,
    output,
    questionId: output.question_id as string,
    revision: output.revision as number,
  }
}

async function importAndRegister(
  setup: Awaited<ReturnType<typeof mount>>,
  bytes = Uint8Array.of(1, 2, 3),
  options: { readonly parserId?: string; readonly parserVersion?: string } = {},
): Promise<ResearchDocument> {
  const document = await setup.ctx.researchDocuments.import({
    bytes,
    mediaType: 'application/pdf',
  })
  const registered = await setup.ctx.researchLibrary.register({
    metadata: { title: document.title ?? 'Fixture Paper', origin: 'declared' },
    document: {
      documentId: document.id,
      mediaType: document.mediaType,
      parserId: options.parserId ?? document.parser.id,
      parserVersion: options.parserVersion ?? document.parser.version,
      extraction: document.extraction,
      ...(document.title === undefined ? {} : { documentTitle: document.title }),
      pageCount: document.pageCount,
      blockCount: document.blockCount,
    },
  })
  expect(registered.status).toBe('created')
  return document
}

function paragraph(document: ResearchDocument) {
  const block = document.pages[0]?.blocks.find(value => value.kind === 'paragraph')
  if (block === undefined) throw new Error('fixture paragraph missing')
  return block
}

describe('research-information tool composition', () => {
  it('registers eleven tools, stable workflow guidance, render metadata, and intended concurrency', async () => {
    const setup = await mount()
    expect(setup.ctx.tools.schemas().map(schema => schema.name)).toEqual([
      'research_question_write',
      'research_question_list',
      'research_question_get',
      'research_review_render',
      'research_evidence_capture',
      'research_note_write',
      'research_claim_write',
      'research_entity_write',
      'research_observation_write',
      'research_comparison_protocol_write',
      'research_synthesis_write',
    ])
    const prompt = renderPrompt(await setup.ctx.systemPrompt.assemble())
    expect(prompt).toContain('paper_import, paper_library_register, and paper_read')
    expect(prompt).toContain('never present an uncited inference as a source claim')
    expect(prompt).toContain('A reading note is authored commentary, not a source statement')
    expect(prompt).toContain('write a separate research_claim_write claim')
    expect(prompt).toContain('An entity canonical name is authored normalization, not source text')
    expect(prompt).toContain('does not mean a paper adopts or endorses the entity')
    expect(prompt).toContain('The observations view lists raw observations in insertion order')
    expect(prompt).toContain('a candidate is not a compatibility decision')
    expect(prompt).toContain('Never convert units or aliases, average, calculate a delta, rank results, or infer statistical significance from raw observations or candidates')
    expect(prompt).toContain('statistical significance remains unassessed')
    expect(prompt).toContain('pass its active, non-stale authored protocol in comparison_protocol_ids')
    expect(prompt).toContain('include every member observation result claim in claim_ids')
    expect(prompt).toContain('The deterministic review expands each referenced protocol')
    expect(prompt).toContain('missing matrix cell means no captured source statement')
    expect(prompt).toContain('Item and reference paging is deterministic')
    expect(prompt).toContain('Use not-applicable only as a positive authored assertion')
    expect(prompt).toContain('research_review_render only with an explicit active synthesis id')
    expect(prompt).toContain('it never writes state or generates new research prose')
    expect(prompt).toContain('Note text, selected observation decimals, and rendered review Markdown have continuation cursors')
    expect(prompt).toContain('Other truncated text, including entity canonical names')
    expect(prompt).toContain('repeat the same question_id, view=notes, evidence_id filter, and item offset')
    expect(prompt).toContain('repeat the exact observation filter, max_items=1, decimal_field')
    const observationWriteSchema = setup.ctx.tools.schemas().find(schema =>
      schema.name === 'research_observation_write')
    expect(JSON.stringify(observationWriteSchema)).toContain(
      'Use not-applicable only for a dimensionless metric',
    )
    expect(JSON.stringify(observationWriteSchema)).toContain(
      'Use not-applicable only when experimental conditions genuinely do not apply',
    )
    const synthesisWriteSchema = setup.ctx.tools.schemas().find(schema =>
      schema.name === 'research_synthesis_write')
    expect(JSON.stringify(synthesisWriteSchema)).toContain('comparison_protocol_ids')
    expect(JSON.stringify(synthesisWriteSchema)).toContain(
      'Optional authored comparison bases for an inference. Omit when empty',
    )
    expect(setup.ctx.tools.get('research_question_list')?.isConcurrencySafe?.({})).toBe(true)
    expect(setup.ctx.tools.get('research_question_get')?.isConcurrencySafe?.({
      question_id: 'not-a-valid-execution-id', view: 'audit',
    })).toBe(true)
    expect(setup.ctx.tools.get('research_review_render')?.isConcurrencySafe?.({
      question_id: 'question', synthesis_id: 'synthesis',
    })).toBe(true)
    expect(Object.hasOwn(setup.ctx.tools.get('research_question_write') ?? {}, 'isConcurrencySafe')).toBe(false)
    expect(Object.hasOwn(setup.ctx.tools.get('research_note_write') ?? {}, 'isConcurrencySafe')).toBe(false)
    expect(Object.hasOwn(setup.ctx.tools.get('research_entity_write') ?? {}, 'isConcurrencySafe')).toBe(false)
    expect(Object.hasOwn(setup.ctx.tools.get('research_observation_write') ?? {}, 'isConcurrencySafe')).toBe(false)
    expect(Object.hasOwn(setup.ctx.tools.get('research_comparison_protocol_write') ?? {}, 'isConcurrencySafe')).toBe(false)
    expect(setup.ctx.tools.get('research_question_write')?.presentCall?.({
      action: 'create', title: 'T', question: 'Q',
    })).toEqual({ card: 'generic', title: 'Create research question', kind: 'edit', rawInput: 'Q' })
    expect(setup.ctx.tools.get('research_question_list')?.presentCall?.({})).toEqual({
      card: 'generic', title: 'List research questions', kind: 'read',
    })
    expect(setup.ctx.tools.get('research_question_list')?.presentCall?.({ query: 'alpha' })).toEqual({
      card: 'generic', title: 'Search research questions: alpha', kind: 'search', rawInput: 'alpha',
    })
    expect(setup.ctx.tools.get('research_question_write')?.presentCall?.({
      action: 'update',
      question_id: '00000000-0000-4000-8000-123456789012',
      revision: 0,
      title: 'T',
    })).toEqual({
      card: 'generic',
      title: 'Update research question 00000000-000…789012',
      kind: 'edit',
    })
    expect(setup.ctx.tools.get('research_question_write')?.presentCall?.({
      action: 'update', revision: 0, title: 'T',
    })).toMatchObject({ title: 'Update research question ' })
    expect(setup.ctx.tools.get('research_question_get')?.presentCall?.({
      question_id: 'short',
    })).toEqual({ card: 'generic', title: 'Read research overview short', kind: 'read' })
    expect(setup.ctx.tools.get('research_question_get')?.presentCall?.({
      question_id: '00000000-0000-4000-8000-123456789012',
      view: 'matrix',
    })).toEqual({ card: 'generic', title: 'Read research matrix 00000000-000…789012', kind: 'read' })
    expect(setup.ctx.tools.get('research_review_render')?.presentCall?.({
      question_id: 'short', synthesis_id: '00000000-0000-4000-8000-123456789012',
    })).toEqual({
      card: 'generic',
      title: 'Render research review 00000000-000…789012',
      kind: 'read',
    })
    expect(setup.ctx.tools.get('research_evidence_capture')?.presentCall?.({
      question_id: 'short', revision: 0, document_id: 'document', block_id: 'block',
    })).toEqual({ card: 'generic', title: 'Capture evidence for short', kind: 'edit', rawInput: 'block' })
    expect(setup.ctx.tools.get('research_evidence_capture')?.presentCall?.({
      question_id: 'short', revision: 0, document_id: 'document', block_id: 'block', quote: 'quote',
    })).toMatchObject({ rawInput: 'quote' })
    expect(setup.ctx.tools.get('research_note_write')?.presentCall?.({
      question_id: 'short', revision: 0, kind: 'passage-question', text: 'Why?', evidence_id: 'evidence',
    })).toEqual({
      card: 'generic', title: 'Write research passage-question for short', kind: 'edit', rawInput: 'Why?',
    })
    expect(setup.ctx.tools.get('research_claim_write')?.presentCall?.({
      question_id: 'short', revision: 0, kind: 'inference', facet: 'aim', text: 'claim', evidence_links: [],
    })).toEqual({ card: 'generic', title: 'Write inference for short', kind: 'edit', rawInput: 'claim' })
    expect(setup.ctx.tools.get('research_entity_write')?.presentCall?.({
      question_id: 'short', revision: 0, kind: 'method', canonical_name: 'RAG', source_claim_ids: [],
    })).toEqual({
      card: 'generic', title: 'Normalize research method for short', kind: 'edit', rawInput: 'RAG',
    })
    expect(setup.ctx.tools.get('research_observation_write')?.presentCall?.({
      question_id: 'short',
      revision: 0,
      result_claim_id: 'claim',
      method: { entity_id: 'method', source_claim_id: 'claim', role: 'proposed' },
      dataset: {
        entity_id: 'dataset', source_claim_id: 'claim', split: { status: 'reported', value: 'test' },
      },
      metric: { entity_id: 'metric', source_claim_id: 'claim' },
      value: '0.84',
      unit: { status: 'not-applicable' },
      value_statistic: 'single score',
      evaluation_protocol: { status: 'not-applicable' },
      uncertainty: { status: 'not-recorded' },
      conditions: { status: 'not-applicable' },
    })).toEqual({
      card: 'generic',
      title: 'Normalize reported observation for short',
      kind: 'edit',
      rawInput: '0.84 not-applicable',
    })
    expect(setup.ctx.tools.get('research_observation_write')?.presentCall?.({
      question_id: 'short',
      revision: 0,
      result_claim_id: 'claim',
      method: { entity_id: 'method', source_claim_id: 'claim', role: 'proposed' },
      dataset: {
        entity_id: 'dataset', source_claim_id: 'claim', split: { status: 'not-applicable' },
      },
      metric: { entity_id: 'metric', source_claim_id: 'claim' },
      value: '0.84',
      unit: { status: 'reported', symbol: '%' },
      value_statistic: 'single score',
      evaluation_protocol: { status: 'not-applicable' },
      uncertainty: { status: 'not-recorded' },
      conditions: { status: 'not-applicable' },
    })).toMatchObject({ rawInput: '0.84 %' })
    expect(setup.ctx.tools.get('research_observation_write')?.presentCall?.({
      question_id: 'short',
      revision: 0,
      result_claim_id: 'claim',
      method: { entity_id: 'method', source_claim_id: 'claim', role: 'proposed' },
      dataset: {
        entity_id: 'dataset', source_claim_id: 'claim', split: { status: 'not-applicable' },
      },
      metric: { entity_id: 'metric', source_claim_id: 'claim' },
      value: '0.84',
      unit: { status: 'reported' },
      value_statistic: 'single score',
      evaluation_protocol: { status: 'not-applicable' },
      uncertainty: { status: 'not-recorded' },
      conditions: { status: 'not-applicable' },
    })).toMatchObject({ rawInput: '0.84' })
    expect(setup.ctx.tools.get('research_comparison_protocol_write')?.presentCall?.({
      question_id: 'short',
      revision: 0,
      observation_ids: [],
      direction: 'higher-is-better',
      compatibility_rationale: 'Exact benchmark protocol.',
    })).toEqual({
      card: 'generic',
      title: 'Record comparison protocol for short',
      kind: 'edit',
      rawInput: 'Exact benchmark protocol.',
    })
    expect(setup.ctx.tools.get('research_synthesis_write')?.presentCall?.({
      question_id: 'short', revision: 0, findings: [],
    })).toEqual({ card: 'generic', title: 'Write synthesis for short', kind: 'edit', rawInput: [] })
    await dispose(setup)
  })

  it('removes and restores every registration across a tool-plugin remount', async () => {
    const setup = await mount()
    await setup.toolFiber.dispose()
    expect(setup.ctx.tools.schemas()).toEqual([])
    expect(renderPrompt(await setup.ctx.systemPrompt.assemble())).not.toContain('research_note_write')

    setup.toolFiber = await setup.ctx.plugin(ResearchInformationTools)
    expect(setup.ctx.tools.schemas().map(schema => schema.name)).toHaveLength(11)
    expect(renderPrompt(await setup.ctx.systemPrompt.assemble())).toContain('research_note_write')
    await dispose(setup)
  })

  it('runs exact evidence, source claim, inference, synthesis, overview, matrix, and audit', async () => {
    const setup = await mount()
    const created = await createQuestion(setup)
    expect(created.output).toMatchObject({ status: 'created', revision: 0, truncated: false })
    expect(created.result.meta).toMatchObject({ kind: 'dsh/research-question-write', version: 1 })
    expect(text(created.result)).toContain('Research question write')

    const document = await importAndRegister(setup)
    const block = paragraph(document)
    const captured = value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: block.id,
      quote: 'accuracy',
    }))
    expect(captured).toMatchObject({
      status: 'created', revision: 1, document_id: document.id, block_id: block.id,
    })

    const source = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision: 1,
      kind: 'source-statement',
      facet: 'result',
      text: 'The paper reports improved accuracy.',
      evidence_links: [{ evidence_id: captured.evidence_id, relation: 'supports' }],
    }))
    expect(source).toMatchObject({ status: 'created', revision: 2 })
    const inference = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision: 2,
      kind: 'inference',
      facet: 'validity-threat',
      text: 'The evaluation may not generalize.',
      evidence_links: [],
    }))
    expect(inference).toMatchObject({ status: 'created', revision: 3 })

    const synthesis = await setup.call('research_synthesis_write', {
      question_id: created.questionId,
      revision: 3,
      findings: [
        {
          kind: 'source-summary',
          stance: 'agreement',
          text: 'The captured source reports a gain.',
          claim_ids: [source.claim_id],
        },
        {
          kind: 'inference',
          stance: 'open-question',
          text: 'External validity remains open.',
          claim_ids: [],
        },
      ],
    })
    const synthesisOutput = value(synthesis)
    expect(synthesisOutput).toMatchObject({ status: 'created', revision: 4 })
    expect(synthesis.meta).toMatchObject({ kind: 'dsh/research-synthesis-write', version: 1 })

    const overview = value(await setup.call('research_question_get', {
      question_id: created.questionId,
    }))
    expect(overview).toMatchObject({
      status: 'found',
      view: 'overview',
      offset: 0,
      returned_items: 4,
      total_items: 4,
      reference_offset: 0,
      returned_references: 4,
      total_references: 4,
      question: { total_evidence: 1, total_claims: 2, total_syntheses: 1 },
      evidence: [{
        selected_text: 'accuracy',
        selected_start_utf8_byte: 15,
        created_by_truncated: false,
      }],
      claims: [
        {
          kind: 'source-statement', active: true, total_evidence_links: 1, created_by_truncated: false,
        },
        { kind: 'inference', active: true, total_evidence_links: 0, created_by_truncated: false },
      ],
      syntheses: [{
        active: true, finding_offset: 0, total_findings: 2, created_by_truncated: false,
      }],
      truncated: false,
    })

    const matrixResult = await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'matrix',
    })
    const matrixOutput = value(matrixResult)
    expect(matrixOutput).toMatchObject({
      offset: 0,
      returned_items: 8,
      total_items: 8,
      reference_offset: 0,
    })
    const matrix = matrixOutput.matrix as Record<string, unknown>
    expect(matrixResult.meta).toMatchObject({ kind: 'dsh/research-question-get', version: 1 })
    expect(matrix).toMatchObject({ total_cells: 8, cells_truncated: false })
    expect(matrix.uncited_inference_claim_ids).toEqual([inference.claim_id])
    expect(matrix.cells).toContainEqual(expect.objectContaining({
      facet: 'result',
      missing_source_statement: false,
      source_statement_claim_ids: [source.claim_id],
      evidence_ids: [captured.evidence_id],
    }))

    const auditOutput = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'audit',
    }))
    expect(auditOutput).toMatchObject({
      offset: 0,
      returned_items: 1,
      total_items: 1,
      reference_offset: 0,
    })
    const audit = auditOutput.audit as Record<string, unknown>
    expect(audit).toMatchObject({
      coverage_counts: { readable: 1 },
      uncited_inference_claim_ids: [inference.claim_id],
      inactive_claim_ids: [],
      inactive_synthesis_ids: [],
      stale_synthesis_comparison_references: [],
    })
    expect(audit.uncited_inference_finding_ids).toHaveLength(1)

    const rendered = await setup.call('research_review_render', {
      question_id: created.questionId,
      synthesis_id: synthesisOutput.synthesis_id,
      include_selected_quotes: true,
    })
    const renderedOutput = value(rendered)
    expect(renderedOutput).toMatchObject({
      status: 'ready-with-warnings',
      question_id: created.questionId,
      synthesis_id: synthesisOutput.synthesis_id,
      text_offset: 0,
      total_warnings: 2,
      warnings_omitted: false,
      truncated: false,
    })
    expect(renderedOutput.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'uncited-inference-finding' }),
      expect.objectContaining({ code: 'bibliography-incomplete' }),
    ]))
    expect(renderedOutput.markdown).toContain('# RQ1')
    expect(renderedOutput.markdown).toContain('**[Source summary]**')
    expect(renderedOutput.markdown).toContain('**[Inference]**')
    expect(renderedOutput.markdown).toContain('[E1](#evidence-e1) (supports)')
    expect(renderedOutput.markdown).toContain('Selected quote UTF-8 bytes: 15-23')
    expect(renderedOutput.markdown).toContain('Selected quote (exact):\n\n```text\naccuracy\n```')
    expect(renderedOutput.render_digest).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(renderedOutput.markdown).not.toContain(block.text)
    expect(rendered.meta).toMatchObject({ kind: 'dsh/research-review-render', version: 1 })
    expect(text(rendered)).toContain('status=ready-with-warnings')
    expect(setup.ctx.researchInformation.get(ResearchQuestionId(created.questionId))?.revision).toBe(4)
    await dispose(setup)
  })

  it('pages review Markdown, preserves adverse evidence relations, and refuses inactive syntheses', async () => {
    const setup = await mount({ maxDocuments: 1, toolConfig: { maxOutputTextChars: 256 } })
    const created = await createQuestion(setup, 'Paged review')
    const document = await importAndRegister(setup, Uint8Array.of(31))
    const block = paragraph(document)
    const captured = value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: block.id,
    }))
    const claim = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision: 1,
      kind: 'source-statement',
      facet: 'result',
      text: 'The retained result challenges the proposed interpretation.',
      evidence_links: [{ evidence_id: captured.evidence_id, relation: 'contradicts' }],
    }))
    const synthesis = value(await setup.call('research_synthesis_write', {
      question_id: created.questionId,
      revision: 2,
      findings: [{
        kind: 'source-summary',
        stance: 'conflict',
        text: 'The source conflicts with the proposed interpretation.',
        claim_ids: [claim.claim_id],
      }],
    }))

    await importAndRegister(setup, Uint8Array.of(32))
    const pages: string[] = []
    let offset = 0
    let renderDigest: string | undefined
    let firstOutput: Record<string, unknown> | undefined
    for (;;) {
      const result = await setup.call('research_review_render', {
        question_id: created.questionId,
        synthesis_id: synthesis.synthesis_id,
        text_offset: offset,
        ...(renderDigest === undefined ? {} : { render_digest: renderDigest }),
      })
      const output = value(result)
      firstOutput ??= output
      renderDigest ??= output.render_digest as string
      expect(output.render_digest).toBe(renderDigest)
      if (offset > 0) {
        expect(output).toMatchObject({ warnings: [], warnings_omitted: true })
      }
      pages.push(output.markdown as string)
      if (typeof output.next_text_offset !== 'number') break
      expect(output.next_text_offset).toBeGreaterThan(offset)
      offset = output.next_text_offset
    }
    expect(firstOutput).toMatchObject({ status: 'ready-with-warnings', text_offset: 0, truncated: true })
    expect(firstOutput?.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'source-summary-without-supporting-evidence' }),
      expect.objectContaining({ code: 'evidence-not-currently-readable' }),
      expect.objectContaining({ code: 'bibliography-incomplete' }),
    ]))
    const markdown = pages.join('')
    expect(markdown).toContain('[E1](#evidence-e1) (contradicts)')
    expect(markdown).toContain('Current verification: **reimport-required**')
    expect(markdown).toContain('Selected quote: not recorded')
    expect(markdown).not.toContain(block.text)

    const continuationOffset = firstOutput?.next_text_offset as number
    const missingDigest = await setup.call('research_review_render', {
      question_id: created.questionId,
      synthesis_id: synthesis.synthesis_id,
      text_offset: continuationOffset,
    })
    expect(missingDigest.isError).toBe(true)
    expect(text(missingDigest)).toContain('render_digest is required')
    const changedDigest = await setup.call('research_review_render', {
      question_id: created.questionId,
      synthesis_id: synthesis.synthesis_id,
      text_offset: continuationOffset,
      render_digest: `sha256:${'0'.repeat(64)}`,
    })
    expect(changedDigest.isError).toBe(true)
    expect(text(changedDigest)).toContain('render changed')

    const replacement = value(await setup.call('research_synthesis_write', {
      question_id: created.questionId,
      revision: 3,
      findings: [{
        kind: 'source-summary',
        stance: 'qualification',
        text: 'The source qualifies the interpretation.',
        claim_ids: [claim.claim_id],
      }],
      supersedes_synthesis_id: synthesis.synthesis_id,
    }))
    expect(replacement).toMatchObject({ status: 'created', revision: 4 })
    const inactive = await setup.call('research_review_render', {
      question_id: created.questionId,
      synthesis_id: synthesis.synthesis_id,
    })
    expect(value(inactive)).toMatchObject({
      status: 'not-ready',
      warnings: [{ code: 'synthesis-inactive' }],
      markdown: '',
      truncated: false,
    })
    expect(text(inactive)).toContain('Research review is not ready')

    const missing = value(await setup.call('research_review_render', {
      question_id: '00000000-0000-4000-8000-000000000001',
      synthesis_id: '00000000-0000-4000-8000-000000000002',
    }))
    expect(missing).toMatchObject({
      status: 'not-ready',
      warnings: [{ code: 'question-not-found' }],
    })
    expect(setup.ctx.researchInformation.get(ResearchQuestionId(created.questionId))?.revision).toBe(4)
    await dispose(setup)
  })

  it('preserves exact selected whitespace and safely renders parser metadata', async () => {
    const selected = 'alpha  beta\n gamma'
    const setup = await mount({
      parserState: { result: parseResult({ text: selected }) },
      parserId: 'fixture-`<script>alert(1)</script>',
    })
    const created = await createQuestion(setup, 'Exact quote review')
    const document = await importAndRegister(setup, Uint8Array.of(33))
    const evidence = value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: paragraph(document).id,
      quote: selected,
    }))
    const claim = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision: 1,
      kind: 'source-statement',
      facet: 'result',
      text: 'The source contains an exact selected passage.',
      evidence_links: [{ evidence_id: evidence.evidence_id, relation: 'supports' }],
    }))
    const synthesis = value(await setup.call('research_synthesis_write', {
      question_id: created.questionId,
      revision: 2,
      findings: [{
        kind: 'source-summary',
        stance: 'agreement',
        text: 'The retained source statement is represented.',
        claim_ids: [claim.claim_id],
      }],
    }))
    const output = value(await setup.call('research_review_render', {
      question_id: created.questionId,
      synthesis_id: synthesis.synthesis_id,
      include_selected_quotes: true,
    }))
    const markdown = output.markdown as string
    expect(markdown).toContain(`Selected quote UTF-8 bytes: 0-${selected.length}`)
    expect(markdown).toContain(`\`\`\`text\n${selected}\n\`\`\``)
    expect(markdown).not.toContain('<script>')
    expect(markdown).toContain('fixture-\\`\\<script\\>alert')
    await dispose(setup)
  })

  it('fails closed before a complete review exceeds its deployment limit', async () => {
    const setup = await mount({ toolConfig: { maxReviewTextChars: 256 } })
    const created = await createQuestion(setup, 'Bounded review')
    const document = await importAndRegister(setup, Uint8Array.of(34))
    const evidence = value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: paragraph(document).id,
    }))
    const claim = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision: 1,
      kind: 'source-statement',
      facet: 'result',
      text: 'A bounded source statement.',
      evidence_links: [{ evidence_id: evidence.evidence_id, relation: 'supports' }],
    }))
    const synthesis = value(await setup.call('research_synthesis_write', {
      question_id: created.questionId,
      revision: 2,
      findings: [{
        kind: 'source-summary',
        stance: 'agreement',
        text: 'A bounded finding.',
        claim_ids: [claim.claim_id],
      }],
    }))
    const output = value(await setup.call('research_review_render', {
      question_id: created.questionId,
      synthesis_id: synthesis.synthesis_id,
    }))
    expect(output).toMatchObject({
      status: 'not-ready',
      warnings: [{ code: 'review-too-large' }],
      total_warnings: 1,
      markdown: '',
      truncated: false,
    })
    await dispose(setup)
  })

  it('normalizes method, dataset, and metric source claims with merge lineage and stale audit', async () => {
    const setup = await mount()
    const created = await createQuestion(setup)
    let revision = created.revision

    const writeSource = async (
      bytes: number,
      facet: 'method' | 'dataset' | 'metric',
      sourceText: string,
    ) => {
      const document = await importAndRegister(setup, Uint8Array.of(bytes))
      const evidence = value(await setup.call('research_evidence_capture', {
        question_id: created.questionId,
        revision,
        document_id: document.id,
        block_id: paragraph(document).id,
      }))
      revision = evidence.revision as number
      const claim = value(await setup.call('research_claim_write', {
        question_id: created.questionId,
        revision,
        kind: 'source-statement',
        facet,
        text: sourceText,
        evidence_links: [{ evidence_id: evidence.evidence_id, relation: 'supports' }],
      }))
      revision = claim.revision as number
      const paper = setup.ctx.researchLibrary.findByDocumentId(document.id)
      if (paper === undefined) throw new Error('registered paper missing')
      return { claim, evidence, paper }
    }

    const firstMethod = await writeSource(81, 'method', 'The first paper uses retrieval.')
    const secondMethod = await writeSource(82, 'method', 'The second paper uses a retriever.')
    const dataset = await writeSource(83, 'dataset', 'The paper evaluates on FixtureBench.')
    const metric = await writeSource(84, 'metric', 'The paper reports exact-match accuracy.')

    const firstGroup = value(await setup.call('research_entity_write', {
      question_id: created.questionId,
      revision,
      kind: 'method',
      canonical_name: 'Retrieval system',
      source_claim_ids: [firstMethod.claim.claim_id],
    }))
    revision = firstGroup.revision as number
    expect(firstGroup).toMatchObject({
      status: 'created', question: { total_entities: 1, active_entities: 1, stale_active_entities: 0 },
    })
    const firstEntityId = firstGroup.entity_id as string
    const secondGroup = value(await setup.call('research_entity_write', {
      question_id: created.questionId,
      revision,
      kind: 'method',
      canonical_name: 'Retriever',
      source_claim_ids: [secondMethod.claim.claim_id],
    }))
    revision = secondGroup.revision as number
    const secondEntityId = secondGroup.entity_id as string
    const merged = await setup.call('research_entity_write', {
      question_id: created.questionId,
      revision,
      kind: 'method',
      canonical_name: 'Shared Retrieval',
      source_claim_ids: [firstMethod.claim.claim_id, secondMethod.claim.claim_id],
      supersedes_entity_ids: [firstEntityId, secondEntityId],
    })
    const mergedValue = value(merged)
    revision = mergedValue.revision as number
    expect(merged.meta).toMatchObject({ kind: 'dsh/research-entity-write', version: 1 })
    expect(mergedValue).toMatchObject({
      status: 'created', question: { total_entities: 3, active_entities: 1 },
    })
    const mergedEntityId = mergedValue.entity_id as string

    for (const [kind, canonicalName, sourceClaimId] of [
      ['dataset', 'FixtureBench', dataset.claim.claim_id],
      ['metric', 'Exact-match accuracy', metric.claim.claim_id],
    ] as const) {
      const result = value(await setup.call('research_entity_write', {
        question_id: created.questionId,
        revision,
        kind,
        canonical_name: canonicalName,
        source_claim_ids: [sourceClaimId],
      }))
      revision = result.revision as number
    }

    const allEntityPages: Array<Record<string, unknown>> = []
    let offset = 0
    for (;;) {
      const output = value(await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'entities',
        offset,
        max_items: 1,
      }))
      allEntityPages.push(output)
      if (typeof output.next_offset !== 'number') break
      offset = output.next_offset
    }
    expect(allEntityPages.map(page => [page.offset, page.returned_items, page.total_items]))
      .toEqual(Array.from({ length: 5 }, (_, index) => [index, 1, 5]))
    const entities = allEntityPages.flatMap(page => page.entities as Array<Record<string, unknown>>)
    expect(entities.map(entity => entity.entity_id)).toEqual([
      firstEntityId,
      secondEntityId,
      mergedEntityId,
      expect.any(String),
      expect.any(String),
    ])
    expect(entities[0]).toMatchObject({ kind: 'method', active: false, stale: false })
    expect(entities[2]).toMatchObject({
      kind: 'method',
      content_role: 'authored-normalization',
      canonical_name: 'Shared Retrieval',
      source_claim_ids: [firstMethod.claim.claim_id, secondMethod.claim.claim_id],
      total_source_claims: 2,
      linked_paper_ids: [firstMethod.paper.id, secondMethod.paper.id].sort(),
      total_linked_papers: 2,
      evidence_ids: [firstMethod.evidence.evidence_id, secondMethod.evidence.evidence_id].sort(),
      total_evidence: 2,
      stale_source_claim_ids: [],
      total_stale_source_claims: 0,
      supersedes_entity_ids: [firstEntityId, secondEntityId],
      total_supersedes_entities: 2,
      references_truncated: false,
      active: true,
      stale: false,
      created_by: 'agent:research-information-test-agent',
    })

    const filtered = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'entities',
      entity_kind: 'method',
      entity_query: '  SHARED   retrieval  ',
      max_items: 1,
    }))
    expect(filtered).toMatchObject({
      entity_kind: 'method',
      entity_query: 'shared retrieval',
      entity_query_truncated: false,
      returned_items: 1,
      total_items: 1,
      total_entities: 1,
      entities_truncated: false,
    })
    expect((filtered.entities as Array<Record<string, unknown>>)[0]?.entity_id).toBe(mergedEntityId)

    const replacementClaim = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision,
      kind: 'source-statement',
      facet: 'method',
      text: 'The first paper uses corrected retrieval wording.',
      evidence_links: [{ evidence_id: firstMethod.evidence.evidence_id, relation: 'supports' }],
      supersedes_claim_id: firstMethod.claim.claim_id,
    }))
    revision = replacementClaim.revision as number
    const staleEntity = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'entities',
      entity_query: 'shared retrieval',
    }))
    expect(staleEntity.question).toMatchObject({ stale_active_entities: 1 })
    expect((staleEntity.entities as Array<Record<string, unknown>>)[0]).toMatchObject({
      entity_id: mergedEntityId,
      stale: true,
      stale_source_claim_ids: [firstMethod.claim.claim_id],
      total_stale_source_claims: 1,
    })

    const audit = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'audit',
    })).audit as Record<string, unknown>
    expect(audit).toMatchObject({
      inactive_entity_ids: [firstEntityId, secondEntityId],
      stale_entity_references: [{
        entity_id: mergedEntityId,
        claim_id: firstMethod.claim.claim_id,
      }],
      unnormalized_source_claim_ids: [replacementClaim.claim_id],
    })
    expect(revision).toBe(14)
    await dispose(setup)
  })

  it('keeps raw observations unordered until an explicit compatible comparison protocol is active', async () => {
    const setup = await mount()
    const created = await createQuestion(setup)
    let revision = created.revision
    const writePaperClaims = async (byte: number, label: string) => {
      const document = await importAndRegister(setup, Uint8Array.of(byte))
      const evidence = value(await setup.call('research_evidence_capture', {
        question_id: created.questionId,
        revision,
        document_id: document.id,
        block_id: paragraph(document).id,
      }))
      revision = evidence.revision as number
      const claims: Record<'method' | 'dataset' | 'metric' | 'result', string> = {
        method: '',
        dataset: '',
        metric: '',
        result: '',
      }
      for (const facet of ['method', 'dataset', 'metric', 'result'] as const) {
        const claim = value(await setup.call('research_claim_write', {
          question_id: created.questionId,
          revision,
          kind: 'source-statement',
          facet,
          text: `${label} reports its ${facet}.`,
          evidence_links: [{ evidence_id: evidence.evidence_id, relation: 'supports' }],
        }))
        revision = claim.revision as number
        claims[facet] = claim.claim_id as string
      }
      const paper = setup.ctx.researchLibrary.findByDocumentId(document.id)
      if (paper === undefined) throw new Error('registered paper missing')
      return { claims, evidenceId: evidence.evidence_id as string, paperId: paper.id }
    }
    const alpha = await writePaperClaims(101, 'Alpha')
    const beta = await writePaperClaims(102, 'Beta')
    const writeEntity = async (
      kind: 'method' | 'dataset' | 'metric',
      canonicalName: string,
      sourceClaimIds: readonly string[],
    ) => {
      const output = value(await setup.call('research_entity_write', {
        question_id: created.questionId,
        revision,
        kind,
        canonical_name: canonicalName,
        source_claim_ids: sourceClaimIds,
      }))
      revision = output.revision as number
      return output.entity_id as string
    }
    const alphaMethodId = await writeEntity('method', 'Alpha method', [alpha.claims.method])
    const betaMethodId = await writeEntity('method', 'Beta method', [beta.claims.method])
    const datasetId = await writeEntity(
      'dataset',
      'FixtureBench',
      [alpha.claims.dataset, beta.claims.dataset],
    )
    const metricId = await writeEntity(
      'metric',
      'Fixture score',
      [alpha.claims.metric, beta.claims.metric],
    )
    const writeObservation = async (options: {
      readonly paper: typeof alpha
      readonly methodEntityId: string
      readonly methodRole: 'proposed' | 'baseline' | 'other'
      readonly otherRole?: string
      readonly value: string
      readonly resultClaimId?: string
      readonly supersedes?: string
      readonly uncertainty?: Record<string, string>
      readonly incompleteBasis?: boolean
      readonly notApplicableBasis?: boolean
    }) => {
      const resultClaimId = options.resultClaimId ?? options.paper.claims.result
      const output = value(await setup.call('research_observation_write', {
        question_id: created.questionId,
        revision,
        result_claim_id: resultClaimId,
        method: {
          entity_id: options.methodEntityId,
          source_claim_id: options.paper.claims.method,
          role: options.methodRole,
          ...(options.otherRole === undefined ? {} : { other_role: options.otherRole }),
        },
        dataset: {
          entity_id: datasetId,
          source_claim_id: options.paper.claims.dataset,
          split: options.incompleteBasis
            ? { status: 'not-recorded' }
            : options.notApplicableBasis
              ? { status: 'not-applicable' }
              : {
                status: 'reported',
                value: 'test',
                source_claim_id: options.paper.claims.dataset,
              },
        },
        metric: {
          entity_id: metricId,
          source_claim_id: options.paper.claims.metric,
        },
        value: options.value,
        unit: options.incompleteBasis
          ? { status: 'not-recorded' }
          : options.notApplicableBasis
            ? { status: 'not-applicable' }
            : { status: 'reported', symbol: '%' },
        value_statistic: 'single reported score',
        evaluation_protocol: options.incompleteBasis
          ? { status: 'not-recorded' }
          : options.notApplicableBasis
            ? { status: 'not-applicable' }
            : {
              status: 'reported',
              value: 'official evaluation',
              source_claim_id: resultClaimId,
            },
        uncertainty: options.uncertainty
          ?? (options.incompleteBasis ? { status: 'not-applicable' } : { status: 'not-recorded' }),
        conditions: options.incompleteBasis
          ? { status: 'not-recorded' }
          : options.notApplicableBasis
            ? { status: 'not-applicable' }
            : {
              status: 'reported',
              values: [
                {
                  name: 'shots_[k]',
                  value: '0',
                  source_claim_id: resultClaimId,
                  comparison_role: 'must-match',
                },
                {
                  name: 'temperature',
                  value: 'fixed',
                  source_claim_id: resultClaimId,
                  comparison_role: 'descriptive',
                },
              ],
            },
        ...(options.supersedes === undefined
          ? {}
          : { supersedes_observation_id: options.supersedes }),
      }))
      revision = output.revision as number
      return output.observation_id as string
    }
    const alphaObservationId = await writeObservation({
      paper: alpha,
      methodEntityId: alphaMethodId,
      methodRole: 'proposed',
      value: '90',
      uncertainty: { status: 'reported', kind: 'standard-deviation', magnitude: '2' },
    })
    const betaObservationId = await writeObservation({
      paper: beta,
      methodEntityId: betaMethodId,
      methodRole: 'baseline',
      value: '80',
      uncertainty: {
        status: 'reported',
        kind: 'confidence-interval',
        lower: '75',
        upper: '85',
        confidence_level_percent: '95',
      },
    })
    const incompleteObservationId = await writeObservation({
      paper: beta,
      methodEntityId: betaMethodId,
      methodRole: 'baseline',
      value: '92',
      incompleteBasis: true,
    })

    const rawPages: Array<Record<string, unknown>> = []
    for (const offset of [0, 1, 2]) {
      rawPages.push(value(await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'observations',
        offset,
        max_items: 1,
      })))
    }
    expect(rawPages.map(page => [
      page.offset,
      page.returned_items,
      page.total_items,
      page.next_offset,
    ])).toEqual([
      [0, 1, 3, 1],
      [1, 1, 3, 2],
      [2, 1, 3, undefined],
    ])
    const rawObservations = rawPages.flatMap(page =>
      page.observations as Array<Record<string, unknown>>)
    expect(rawObservations.map(observation => [observation.observation_id, observation.value])).toEqual([
      [alphaObservationId, '90'],
      [betaObservationId, '80'],
      [incompleteObservationId, '92'],
    ])
    expect(rawObservations.slice(0, 2)).toMatchObject([
      {
        comparison_status: 'not-established',
        alignment_status: 'candidate',
        alignment_blockers: [],
        candidate_observation_ids: [betaObservationId],
        comparison_protocol_ids: [],
        uncertainty: { status: 'reported', kind: 'standard-deviation', magnitude: '2' },
      },
      {
        comparison_status: 'not-established',
        alignment_status: 'candidate',
        alignment_blockers: [],
        candidate_observation_ids: [alphaObservationId],
        comparison_protocol_ids: [],
        uncertainty: {
          status: 'reported',
          kind: 'confidence-interval',
          lower: '75',
          upper: '85',
          confidence_level_percent: '95',
        },
      },
    ])
    expect(rawObservations[2]).toMatchObject({
      comparison_status: 'not-established',
      alignment_status: 'blocked',
      alignment_blockers: [
        'unit-not-recorded',
        'dataset-split-not-recorded',
        'evaluation-protocol-not-recorded',
        'conditions-not-recorded',
      ],
      candidate_observation_ids: [],
      unit: { status: 'not-recorded' },
      dataset: { split: { status: 'not-recorded' } },
      evaluation_protocol: { status: 'not-recorded' },
      conditions_status: 'not-recorded',
      uncertainty: { status: 'not-applicable' },
    })
    for (const observation of rawObservations) {
      expect(Object.hasOwn(observation, 'rank')).toBe(false)
      expect(Object.hasOwn(observation, 'delta')).toBe(false)
      expect(Object.hasOwn(observation, 'converted_value')).toBe(false)
      expect(Object.hasOwn(observation, 'statistical_significance')).toBe(false)
    }
    const readDecimal = async (observationId: string, decimalField: string) =>
      setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'observations',
        observation_id: observationId,
        max_items: 1,
        decimal_field: decimalField,
      })
    expect(value(await readDecimal(alphaObservationId, 'uncertainty-magnitude'))).toMatchObject({
      decimal_text: '2',
      total_decimal_chars: 1,
    })
    expect(value(await readDecimal(betaObservationId, 'uncertainty-lower'))).toMatchObject({
      decimal_text: '75',
    })
    expect(value(await readDecimal(betaObservationId, 'uncertainty-upper'))).toMatchObject({
      decimal_text: '85',
    })
    expect(value(await readDecimal(betaObservationId, 'confidence-level-percent'))).toMatchObject({
      decimal_text: '95',
    })
    expect((await readDecimal(incompleteObservationId, 'uncertainty-magnitude')).isError).toBe(true)
    expect((await readDecimal(betaObservationId, 'uncertainty-magnitude')).isError).toBe(true)
    expect((await readDecimal(alphaObservationId, 'uncertainty-lower')).isError).toBe(true)
    const preProtocolAudit = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'audit',
    })).audit as Record<string, unknown>
    expect(preProtocolAudit).toMatchObject({
      unprotocolled_observation_ids: [
        alphaObservationId,
        betaObservationId,
        incompleteObservationId,
      ],
      unobserved_result_claim_ids: [],
      observation_alignment_blockers: [{
        observation_id: incompleteObservationId,
        blockers: [
          'unit-not-recorded',
          'dataset-split-not-recorded',
          'evaluation-protocol-not-recorded',
          'conditions-not-recorded',
        ],
      }],
    })

    for (const args of [
      { observation_id: alphaObservationId },
      { paper_id: alpha.paperId },
      { method_entity_id: alphaMethodId },
      { dataset_entity_id: datasetId },
      { metric_entity_id: metricId },
    ]) {
      const filtered = value(await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'observations',
        ...args,
      }))
      expect(filtered.total_observations).toBe(
        'dataset_entity_id' in args || 'metric_entity_id' in args ? 3 : 1,
      )
    }

    const protocolResult = await setup.call('research_comparison_protocol_write', {
      question_id: created.questionId,
      revision,
      observation_ids: [alphaObservationId, betaObservationId],
      direction: 'higher-is-better',
      reference_observation_id: betaObservationId,
      compatibility_rationale: 'Same dataset, split, metric, unit, statistic, protocol, and conditions.',
    })
    const protocolWrite = value(protocolResult)
    revision = protocolWrite.revision as number
    const protocolId = protocolWrite.comparison_protocol_id as string
    expect(protocolResult.meta).toMatchObject({
      kind: 'dsh/research-comparison-protocol-write', version: 1,
    })
    const protocolSynthesis = value(await setup.call('research_synthesis_write', {
      question_id: created.questionId,
      revision,
      findings: [
        {
          kind: 'inference',
          stance: 'agreement',
          text: 'Alpha and Beta are compared under the retained protocol.',
          claim_ids: [alpha.claims.result, beta.claims.result],
          comparison_protocol_ids: [protocolId],
        },
        {
          kind: 'inference',
          stance: 'qualification',
          text: 'The same retained protocol also qualifies the comparison.',
          claim_ids: [alpha.claims.result, beta.claims.result],
          comparison_protocol_ids: [protocolId],
        },
      ],
    }))
    revision = protocolSynthesis.revision as number
    const retainedQuestion = setup.ctx.researchInformation.get(
      ResearchQuestionId(created.questionId),
    )
    const retainedSynthesis = retainedQuestion?.syntheses.find(
      synthesis => synthesis.id === protocolSynthesis.synthesis_id,
    )
    const retainedProtocol = retainedQuestion?.comparisonProtocols.find(
      protocol => protocol.id === protocolId,
    )
    const retainedAlphaObservation = retainedQuestion?.observations.find(
      observation => observation.id === alphaObservationId,
    )
    const retainedBetaObservation = retainedQuestion?.observations.find(
      observation => observation.id === betaObservationId,
    )
    if (retainedSynthesis === undefined
      || retainedProtocol === undefined
      || retainedAlphaObservation === undefined
      || retainedBetaObservation === undefined) {
      throw new Error('protocol review records missing')
    }
    const protocolFindingIds = retainedSynthesis.findings.map(finding => String(finding.id))
    expect(protocolFindingIds).toHaveLength(2)
    const synthesisOverview = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'overview',
    }))
    const projectedProtocolFinding = (
      synthesisOverview.syntheses as Array<{ findings: Array<Record<string, unknown>> }>
    )[0]?.findings[0]
    expect(projectedProtocolFinding).toMatchObject({
      comparison_protocol_ids: [protocolId],
      total_comparison_protocols: 1,
      comparison_protocol_ids_truncated: false,
    })
    expect(setup.ctx.researchInformation.get(
      ResearchQuestionId(created.questionId),
    )?.syntheses[0]?.findings[0]?.comparisonProtocolIds).toEqual([
      ResearchComparisonProtocolId(protocolId),
    ])
    const protocolReview = value(await setup.call('research_review_render', {
      question_id: created.questionId,
      synthesis_id: protocolSynthesis.synthesis_id,
    }))
    const protocolMarkdown = protocolReview.markdown as string
    expect(protocolReview.warnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'comparison-protocol-inactive' }),
      expect.objectContaining({ code: 'comparison-protocol-stale' }),
    ]))
    expect(protocolReview.markdown).toContain('Comparison basis:')
    expect(protocolReview.markdown).toContain('[C1](#comparison-protocol-c1) **[Current]**')
    expect(protocolReview.markdown).toContain('## Comparison protocol ledger')
    expect(protocolReview.markdown).toContain('## Observation ledger')
    expect(protocolReview.markdown).toContain('Content role: **authored-comparison-decision**')
    expect(protocolMarkdown).toContain(
      `- Created by: ${retainedProtocol.createdBy.kind}:${retainedProtocol.createdBy.id}`,
    )
    expect(protocolMarkdown).toContain(`- Created at: ${retainedProtocol.createdAt}`)
    expect(protocolReview.markdown).toContain('Current state: **current**')
    expect(protocolReview.markdown).toContain('Direction: **higher-is-better**')
    expect(protocolReview.markdown).toContain('Statistical significance: **not-assessed**')
    expect(protocolReview.markdown).toContain(
      'Observations, in authored order: [O1](#observation-o1), [O2](#observation-o2)',
    )
    expect(protocolReview.markdown).toContain(
      '- Compatibility rationale:\n\nSame dataset, split, metric, unit, statistic, protocol, and conditions.',
    )
    expect(protocolReview.markdown).toContain('Content role: **authored-normalization**')
    const observationLedger = protocolMarkdown.slice(
      protocolMarkdown.indexOf('## Observation ledger'),
      protocolMarkdown.indexOf('## Evidence ledger'),
    )
    expect(observationLedger.split('- Created by: ')).toHaveLength(3)
    expect(observationLedger.split('- Created at: ')).toHaveLength(3)
    for (const observation of [retainedAlphaObservation, retainedBetaObservation]) {
      expect(observationLedger).toContain(
        `- Created by: ${observation.createdBy.kind}:${observation.createdBy.id}`,
      )
      expect(observationLedger).toContain(`- Created at: ${observation.createdAt}`)
    }
    expect(protocolReview.markdown).toContain(`Alpha method (entity \`${alphaMethodId}\`)`)
    expect(protocolReview.markdown).toContain(`FixtureBench (entity \`${datasetId}\`)`)
    expect(protocolReview.markdown).toContain(`Fixture score (entity \`${metricId}\`)`)
    expect(protocolReview.markdown).toContain('- Value: `90`')
    expect(protocolReview.markdown).toContain('- Value: `80`')
    expect(protocolReview.markdown.indexOf('- Value: `90`'))
      .toBeLessThan(protocolReview.markdown.indexOf('- Value: `80`'))
    expect(protocolReview.markdown).not.toContain('- Delta:')
    expect(protocolReview.markdown).not.toContain('- Rank:')
    expect(protocolMarkdown.split('[C1](#comparison-protocol-c1)')).toHaveLength(3)
    expect(protocolMarkdown.split('### <a id="comparison-protocol-c1"></a>C1')).toHaveLength(2)
    expect(protocolMarkdown).toContain(
      `(result claim; source claim \`${alpha.claims.result}\`; supports)`,
    )
    expect(protocolMarkdown).toContain(
      `(condition source claim "shots\\_\\[k\\]"; source claim \`${alpha.claims.result}\`; supports)`,
    )
    const comparison = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'comparisons',
      comparison_protocol_id: protocolId,
    }))
    expect(comparison).toMatchObject({
      total_comparison_protocols: 1,
      comparison_protocol_id: protocolId,
      comparison_protocols: [{
        comparison_protocol_id: protocolId,
        content_role: 'authored-comparison-decision',
        active: true,
        stale: false,
        compatibility_status: 'established-by-active-protocol',
        statistical_significance: 'not-assessed',
        direction: 'higher-is-better',
        compatibility_rationale: 'Same dataset, split, metric, unit, statistic, protocol, and conditions.',
        observation_ids: [alphaObservationId, betaObservationId],
        reference_observation_id: betaObservationId,
      }],
    })
    const protocolBacked = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'observations',
    })).observations as Array<Record<string, unknown>>
    expect(protocolBacked.map(observation => observation.comparison_status)).toEqual([
      'protocol-backed',
      'protocol-backed',
      'not-established',
    ])
    expect(protocolBacked.map(observation => observation.value)).toEqual(['90', '80', '92'])

    const reviewBase = { questionId: ResearchQuestionId(created.questionId), observationId: ResearchObservationId(alphaObservationId),
      evidenceSupport: 'unsupported' as const, rationale: 'The chart value requires correction.', counterEvidenceIds: [],
      author: { kind: 'researcher' as const, id: ResearchAuthorId('chart-reviewer') } }
    const rejectedResult = await setup.ctx.researchInformation.reviewObservation({ ...reviewBase, expectedRevision: revision, decision: 'rejected' })
    if (rejectedResult.status !== 'created') throw new Error(rejectedResult.status)
    revision = rejectedResult.question.revision
    expect(value(await setup.call('research_question_get', { question_id: created.questionId, view: 'comparisons' })))
      .toMatchObject({ comparison_protocols: [{ stale: false, review_blocked: true,
        review_blocked_observation_ids: [alphaObservationId], compatibility_status: 'not-current' }] })
    expect(value(await setup.call('research_question_get', { question_id: created.questionId, view: 'observations', observation_id: alphaObservationId })))
      .toMatchObject({ observations: [{ review_status: 'rejected', comparison_status: 'not-established',
        latest_review: { rationale: reviewBase.rationale, created_by: 'researcher:chart-reviewer' } }] })
    expect(value(await setup.call('research_comparison_protocol_write', { question_id: created.questionId, revision,
      observation_ids: [alphaObservationId, betaObservationId], direction: 'higher-is-better', compatibility_rationale: 'Same conditions' })))
      .toMatchObject({ status: 'observation-rejected', observation_id: alphaObservationId })
    const acceptedResult = await setup.ctx.researchInformation.reviewObservation({ ...reviewBase, expectedRevision: revision,
      evidenceSupport: 'supports', decision: 'accepted', rationale: 'The source was checked again.' })
    if (acceptedResult.status !== 'created') throw new Error(acceptedResult.status)
    revision = acceptedResult.question.revision
    expect(value(await setup.call('research_question_get', { question_id: created.questionId, view: 'comparisons' })))
      .toMatchObject({ comparison_protocols: [{ review_blocked: false, compatibility_status: 'established-by-active-protocol' }] })

    const alphaPeerObservationId = await writeObservation({
      paper: alpha,
      methodEntityId: alphaMethodId,
      methodRole: 'baseline',
      value: '88',
    })
    const betaPeerObservationId = await writeObservation({
      paper: beta,
      methodEntityId: betaMethodId,
      methodRole: 'baseline',
      value: '78',
    })
    await setup.toolFiber.dispose()
    setup.toolFiber = await setup.ctx.plugin(ResearchInformationTools, {
      maxReferencesPerResult: 1,
    })
    const recoveredFindingProtocolIds: string[] = []
    const findingReferencePages: Array<Record<string, unknown>> = []
    let findingReferenceOffset = 0
    for (;;) {
      const output = value(await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'overview',
        offset: retainedQuestion.evidence.length + retainedQuestion.claims.length,
        max_items: 1,
        reference_offset: findingReferenceOffset,
      }))
      findingReferencePages.push(output)
      const synthesis = (output.syntheses as Array<Record<string, unknown>>)[0]
      const findings = synthesis?.findings as Array<Record<string, unknown>> | undefined
      recoveredFindingProtocolIds.push(...(findings ?? []).flatMap(finding =>
        finding.comparison_protocol_ids as string[]))
      if (typeof output.next_reference_offset !== 'number') break
      findingReferenceOffset = output.next_reference_offset
    }
    expect(findingReferencePages.map(page => page.reference_offset)).toEqual(
      Array.from({ length: findingReferencePages.length }, (_, index) => index),
    )
    expect(recoveredFindingProtocolIds).toEqual([protocolId, protocolId])
    const candidatePages = async (observationId: string) => Promise.all([0, 1].map(
      async referenceOffset => value(await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'observations',
        observation_id: observationId,
        max_items: 1,
        reference_offset: referenceOffset,
      })),
    ))
    const alphaCandidatePages = await candidatePages(alphaObservationId)
    const betaCandidatePages = await candidatePages(betaObservationId)
    expect(alphaCandidatePages.map(page => ({
      referenceOffset: page.reference_offset,
      returnedReferences: page.returned_references,
      candidates: ((page.observations as Array<Record<string, unknown>>)[0]
        ?.candidate_observation_ids),
      totalCandidates: ((page.observations as Array<Record<string, unknown>>)[0]
        ?.total_candidate_observations),
    }))).toEqual([
      {
        referenceOffset: 0,
        returnedReferences: 1,
        candidates: [betaObservationId],
        totalCandidates: 2,
      },
      {
        referenceOffset: 1,
        returnedReferences: 1,
        candidates: [betaPeerObservationId],
        totalCandidates: 2,
      },
    ])
    expect(betaCandidatePages.map(page => ({
      referenceOffset: page.reference_offset,
      returnedReferences: page.returned_references,
      candidates: ((page.observations as Array<Record<string, unknown>>)[0]
        ?.candidate_observation_ids),
      totalCandidates: ((page.observations as Array<Record<string, unknown>>)[0]
        ?.total_candidate_observations),
    }))).toEqual([
      {
        referenceOffset: 0,
        returnedReferences: 1,
        candidates: [alphaObservationId],
        totalCandidates: 2,
      },
      {
        referenceOffset: 1,
        returnedReferences: 1,
        candidates: [alphaPeerObservationId],
        totalCandidates: 2,
      },
    ])
    await setup.toolFiber.dispose()
    setup.toolFiber = await setup.ctx.plugin(ResearchInformationTools)

    const replacementClaim = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision,
      kind: 'source-statement',
      facet: 'result',
      text: 'Alpha reports a corrected result.',
      evidence_links: [{ evidence_id: alpha.evidenceId, relation: 'supports' }],
      supersedes_claim_id: alpha.claims.result,
    }))
    revision = replacementClaim.revision as number
    const staleComparison = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'comparisons',
      comparison_protocol_id: protocolId,
    })).comparison_protocols as Array<Record<string, unknown>>
    expect(staleComparison[0]).toMatchObject({
      active: true,
      stale: true,
      compatibility_status: 'not-current',
      statistical_significance: 'not-assessed',
      stale_observation_ids: [alphaObservationId],
    })
    const staleAudit = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'audit',
    })).audit as Record<string, unknown>
    expect(staleAudit).toMatchObject({
      stale_comparison_protocol_ids: [protocolId],
      stale_synthesis_comparison_references: expect.arrayContaining(
        protocolFindingIds.map(findingId => ({
          synthesis_id: protocolSynthesis.synthesis_id,
          finding_id: findingId,
          comparison_protocol_id: protocolId,
          active: true,
          stale: true,
        })),
      ),
      unprotocolled_observation_ids: [betaObservationId, incompleteObservationId, betaPeerObservationId],
      unobserved_result_claim_ids: [replacementClaim.claim_id],
    })
    expect(staleAudit.stale_observation_references).toContainEqual({
      observation_id: alphaObservationId,
      reference_kind: 'result-claim',
      claim_id: alpha.claims.result,
    })
    const staleProtocolReview = value(await setup.call('research_review_render', {
      question_id: created.questionId,
      synthesis_id: protocolSynthesis.synthesis_id,
    }))
    const staleProtocolWarnings = (staleProtocolReview.warnings as Array<Record<string, unknown>>)
      .filter(warning => warning.code === 'comparison-protocol-stale')
    expect(staleProtocolWarnings).toEqual(protocolFindingIds.map(findingId =>
      expect.objectContaining({
        code: 'comparison-protocol-stale',
        finding_id: findingId,
        comparison_protocol_id: protocolId,
      })))
    expect((staleProtocolReview.markdown as string)
      .split('### <a id="comparison-protocol-c1"></a>C1')).toHaveLength(2)
    expect(staleProtocolReview.markdown).toContain('Current state: **stale**')

    const replacementObservationId = await writeObservation({
      paper: alpha,
      methodEntityId: alphaMethodId,
      methodRole: 'proposed',
      value: '91',
      resultClaimId: replacementClaim.claim_id as string,
      supersedes: alphaObservationId,
      uncertainty: { status: 'reported', kind: 'range', lower: '89', upper: '93' },
    })
    expect((await readDecimal(
      replacementObservationId,
      'confidence-level-percent',
    )).isError).toBe(true)
    const replacementProtocol = value(await setup.call('research_comparison_protocol_write', {
      question_id: created.questionId,
      revision,
      observation_ids: [replacementObservationId, betaObservationId],
      direction: 'higher-is-better',
      reference_observation_id: betaObservationId,
      compatibility_rationale: 'Corrected Alpha result with the same exact comparison basis.',
      supersedes_comparison_protocol_id: protocolId,
    }))
    revision = replacementProtocol.revision as number
    const replacementProtocolId = replacementProtocol.comparison_protocol_id as string
    const parallelProtocol = value(await setup.call('research_comparison_protocol_write', {
      question_id: created.questionId,
      revision,
      observation_ids: [replacementObservationId, betaObservationId],
      direction: 'non-directional',
      compatibility_rationale: 'A second authored view of the same exact comparison basis.',
    }))
    revision = parallelProtocol.revision as number
    const parallelProtocolId = parallelProtocol.comparison_protocol_id as string
    const allComparisons = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'comparisons',
    })).comparison_protocols as Array<Record<string, unknown>>
    expect(allComparisons).toMatchObject([
      { comparison_protocol_id: protocolId, active: false, compatibility_status: 'not-current' },
      {
        comparison_protocol_id: replacementProtocolId,
        active: true,
        compatibility_status: 'established-by-active-protocol',
        supersedes_comparison_protocol_id: protocolId,
      },
      {
        comparison_protocol_id: parallelProtocolId,
        active: true,
        compatibility_status: 'established-by-active-protocol',
      },
    ])
    expect(Object.hasOwn(allComparisons[2]!, 'reference_observation_id')).toBe(false)
    const finalAudit = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'audit',
    })).audit as Record<string, unknown>
    expect(finalAudit).toMatchObject({
      inactive_observation_ids: [alphaObservationId],
      inactive_comparison_protocol_ids: [protocolId],
      stale_synthesis_comparison_references: expect.arrayContaining(
        protocolFindingIds.map(findingId => ({
          synthesis_id: protocolSynthesis.synthesis_id,
          finding_id: findingId,
          comparison_protocol_id: protocolId,
          active: false,
          stale: true,
        })),
      ),
      stale_comparison_protocol_ids: [],
      unprotocolled_observation_ids: [incompleteObservationId, betaPeerObservationId],
      unobserved_result_claim_ids: [],
    })
    const inactiveProtocolReview = value(await setup.call('research_review_render', {
      question_id: created.questionId,
      synthesis_id: protocolSynthesis.synthesis_id,
    }))
    expect(inactiveProtocolReview.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'comparison-protocol-inactive',
        comparison_protocol_id: protocolId,
      }),
      expect.objectContaining({
        code: 'comparison-protocol-stale',
        comparison_protocol_id: protocolId,
      }),
    ]))
    const inactiveProtocolWarnings = (
      inactiveProtocolReview.warnings as Array<Record<string, unknown>>
    ).filter(warning => warning.code === 'comparison-protocol-inactive')
    expect(inactiveProtocolWarnings).toEqual(protocolFindingIds.map(findingId =>
      expect.objectContaining({
        code: 'comparison-protocol-inactive',
        finding_id: findingId,
        comparison_protocol_id: protocolId,
      })))
    expect(inactiveProtocolReview.markdown).toContain('Current state: **inactive; stale**')

    await setup.toolFiber.dispose()
    setup.toolFiber = await setup.ctx.plugin(ResearchInformationTools, {
      maxItemsPerResult: 1,
      maxReferencesPerResult: 1,
    })
    const recoveredStaleSynthesisComparisonReferences: Array<Record<string, unknown>> = []
    const staleComparisonAuditPages: Array<Record<string, unknown>> = []
    let staleComparisonReferenceOffset = 0
    for (;;) {
      const output = value(await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'audit',
        max_items: 1,
        reference_offset: staleComparisonReferenceOffset,
      }))
      staleComparisonAuditPages.push(output)
      recoveredStaleSynthesisComparisonReferences.push(
        ...((output.audit as Record<string, unknown>)
          .stale_synthesis_comparison_references as Array<Record<string, unknown>>),
      )
      if (typeof output.next_reference_offset !== 'number') break
      staleComparisonReferenceOffset = output.next_reference_offset
    }
    expect(staleComparisonAuditPages.map(page => page.reference_offset)).toEqual(
      Array.from({ length: staleComparisonAuditPages.length }, (_, index) => index),
    )
    expect(recoveredStaleSynthesisComparisonReferences).toEqual(
      protocolFindingIds.map(findingId => ({
        synthesis_id: protocolSynthesis.synthesis_id,
        finding_id: findingId,
        comparison_protocol_id: protocolId,
        active: false,
        stale: true,
      })),
    )
    const recoveredReferences: string[] = []
    const referencePages: Array<Record<string, unknown>> = []
    let referenceOffset = 0
    for (;;) {
      const output = value(await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'observations',
        observation_id: replacementObservationId,
        max_items: 1,
        reference_offset: referenceOffset,
      }))
      referencePages.push(output)
      const observation = (output.observations as Array<Record<string, unknown>>)[0]!
      recoveredReferences.push(
        ...(observation.candidate_observation_ids as string[]),
        ...(observation.comparison_protocol_ids as string[]),
        ...(observation.conditions as Array<{ readonly source_claim_id: string }>)
          .map(value => value.source_claim_id),
        ...(observation.evidence_ids as string[]),
        ...(typeof observation.supersedes_observation_id === 'string'
          ? [observation.supersedes_observation_id]
          : []),
        ...((output.question as Record<string, unknown>).paper_ids as string[]),
      )
      if (typeof output.next_reference_offset !== 'number') break
      referenceOffset = output.next_reference_offset
    }
    expect(referencePages.map(page => [
      page.reference_offset,
      page.returned_references,
      page.total_references,
      page.next_reference_offset,
    ])).toEqual(Array.from({ length: 10 }, (_, index) => [
      index,
      1,
      10,
      index === 9 ? undefined : index + 1,
    ]))
    expect(recoveredReferences).toEqual([
      betaObservationId,
      betaPeerObservationId,
      replacementProtocolId,
      parallelProtocolId,
      replacementClaim.claim_id as string,
      replacementClaim.claim_id as string,
      alpha.evidenceId,
      alphaObservationId,
      ...[alpha.paperId, beta.paperId].sort((left, right) => left.localeCompare(right)),
    ])
    const notApplicableObservationId = await writeObservation({
      paper: alpha,
      methodEntityId: alphaMethodId,
      methodRole: 'other',
      otherRole: 'reported comparator',
      value: '1',
      resultClaimId: replacementClaim.claim_id as string,
      notApplicableBasis: true,
    })
    const notApplicableObservation = (value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'observations',
      observation_id: notApplicableObservationId,
    })).observations as Array<Record<string, unknown>>)[0]!
    expect(notApplicableObservation).toMatchObject({
      method: { role: 'other', other_role: 'reported comparator' },
      unit: { status: 'not-applicable' },
      dataset: { split: { status: 'not-applicable' } },
      evaluation_protocol: { status: 'not-applicable' },
      conditions_status: 'not-applicable',
      uncertainty: { status: 'not-recorded' },
      alignment_status: 'blocked',
      alignment_blockers: ['no-cross-paper-structural-match'],
    })

    await setup.toolFiber.dispose()
    setup.toolFiber = await setup.ctx.plugin(ResearchInformationTools)
    const betaMethodReplacement = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision,
      kind: 'source-statement',
      facet: 'method',
      text: 'Beta reports corrected method details.',
      evidence_links: [{ evidence_id: beta.evidenceId, relation: 'supports' }],
      supersedes_claim_id: beta.claims.method,
    }))
    revision = betaMethodReplacement.revision as number
    const staleEntityAudit = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'audit',
    })).audit as Record<string, unknown>
    expect(staleEntityAudit.stale_observation_references).toContainEqual({
      observation_id: betaObservationId,
      reference_kind: 'method-entity-source-claim',
      entity_id: betaMethodId,
      claim_id: beta.claims.method,
    })
    const betaMethodReplacementEntity = value(await setup.call('research_entity_write', {
      question_id: created.questionId,
      revision,
      kind: 'method',
      canonical_name: 'Corrected Beta method',
      source_claim_ids: [betaMethodReplacement.claim_id],
      supersedes_entity_ids: [betaMethodId],
    }))
    revision = betaMethodReplacementEntity.revision as number
    const inactiveEntityAudit = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'audit',
    })).audit as Record<string, unknown>
    expect(inactiveEntityAudit.stale_observation_references).toContainEqual({
      observation_id: betaObservationId,
      reference_kind: 'method-entity',
      entity_id: betaMethodId,
    })
    const samePaperAlignedObservationId = await writeObservation({
      paper: alpha,
      methodEntityId: alphaMethodId,
      methodRole: 'baseline',
      value: '89',
      resultClaimId: replacementClaim.claim_id as string,
    })
    const samePaperAlignedObservation = (value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'observations',
      observation_id: samePaperAlignedObservationId,
    })).observations as Array<Record<string, unknown>>)[0]!
    expect(samePaperAlignedObservation).toMatchObject({
      candidate_observation_ids: [],
      alignment_status: 'blocked',
      alignment_blockers: ['no-cross-paper-structural-match'],
    })
    const exactDecimal = `0.${'123456789'.repeat(80)}`
    const longDecimalObservationId = await writeObservation({
      paper: alpha,
      methodEntityId: alphaMethodId,
      methodRole: 'baseline',
      value: exactDecimal,
      resultClaimId: replacementClaim.claim_id as string,
      uncertainty: {
        status: 'reported',
        kind: 'standard-deviation',
        magnitude: exactDecimal,
      },
    })
    await setup.toolFiber.dispose()
    setup.toolFiber = await setup.ctx.plugin(ResearchInformationTools, {
      maxItemsPerResult: 1,
      maxOutputTextChars: 256,
    })
    const decimalParts: string[] = []
    const decimalPages: Array<Record<string, unknown>> = []
    let decimalTextOffset = 0
    for (;;) {
      const result = await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'observations',
        observation_id: longDecimalObservationId,
        max_items: 1,
        decimal_field: 'value',
        decimal_text_offset: decimalTextOffset,
      })
      const output = value(result)
      decimalPages.push(output)
      decimalParts.push(output.decimal_text as string)
      const observation = (output.observations as Array<Record<string, unknown>>)[0]!
      expect(observation).toMatchObject({
        value_truncated: true,
        uncertainty: { magnitude_truncated: true },
      })
      expect(output).toMatchObject({
        decimal_field: 'value',
        decimal_text_offset: decimalTextOffset,
        total_decimal_chars: Array.from(exactDecimal).length,
        truncated: true,
      })
      expect(text(result)).toContain('exact canonical decimal page')
      expect(text(result)).toContain(output.decimal_text as string)
      expect(text(result).length).toBeLessThanOrEqual(256)
      if (typeof output.next_decimal_text_offset !== 'number') break
      decimalTextOffset = output.next_decimal_text_offset
    }
    expect(decimalPages.length).toBeGreaterThan(1)
    expect(decimalParts.join('')).toBe(exactDecimal)
    expect(revision).toBe(32)
    const replacementDataset = value(await setup.call('research_entity_write', {
      question_id: created.questionId,
      revision,
      kind: 'dataset',
      canonical_name: 'Replacement FixtureBench',
      source_claim_ids: [alpha.claims.dataset, beta.claims.dataset],
      supersedes_entity_ids: [datasetId],
    }))
    revision = replacementDataset.revision as number
    const multiEntityStaleAudit = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'audit',
    })).audit as Record<string, unknown>
    expect(multiEntityStaleAudit.stale_observation_references).toEqual(
      expect.arrayContaining([
        {
          observation_id: betaObservationId,
          reference_kind: 'method-entity',
          entity_id: betaMethodId,
        },
        {
          observation_id: betaObservationId,
          reference_kind: 'dataset-entity',
          entity_id: datasetId,
        },
      ]),
    )
    const alphaMethodReplacement = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision,
      kind: 'source-statement',
      facet: 'method',
      text: 'Alpha reports corrected method details.',
      evidence_links: [{ evidence_id: alpha.evidenceId, relation: 'supports' }],
      supersedes_claim_id: alpha.claims.method,
    }))
    revision = alphaMethodReplacement.revision as number
    await setup.toolFiber.dispose()
    setup.toolFiber = await setup.ctx.plugin(ResearchInformationTools, {
      maxItemsPerResult: 1,
      maxReferencesPerResult: 1,
    })
    const pagedStaleEntityReferences: Array<Record<string, unknown>> = []
    const pagedStaleObservationReferences: Array<Record<string, unknown>> = []
    const auditReferencePages: Array<Record<string, unknown>> = []
    let auditReferenceOffset = 0
    for (;;) {
      const output = value(await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'audit',
        max_items: 1,
        reference_offset: auditReferenceOffset,
      }))
      auditReferencePages.push(output)
      const audit = output.audit as Record<string, unknown>
      pagedStaleEntityReferences.push(
        ...(audit.stale_entity_references as Array<Record<string, unknown>>),
      )
      pagedStaleObservationReferences.push(
        ...(audit.stale_observation_references as Array<Record<string, unknown>>),
      )
      if (typeof output.next_reference_offset !== 'number') break
      auditReferenceOffset = output.next_reference_offset
    }
    expect(auditReferencePages.map(page => page.reference_offset)).toEqual(
      Array.from({ length: auditReferencePages.length }, (_, index) => index),
    )
    expect(pagedStaleEntityReferences).toContainEqual({
      entity_id: alphaMethodId,
      claim_id: alpha.claims.method,
    })
    expect(pagedStaleObservationReferences).toEqual(expect.arrayContaining([
      {
        observation_id: replacementObservationId,
        reference_kind: 'method-entity-source-claim',
        entity_id: alphaMethodId,
        claim_id: alpha.claims.method,
      },
      {
        observation_id: replacementObservationId,
        reference_kind: 'dataset-entity',
        entity_id: datasetId,
      },
    ]))
    await dispose(setup)
  })

  it('bounds normalized entity text and recoverably pages every derived reference', async () => {
    const setup = await mount({
      toolConfig: {
        maxItemsPerResult: 1,
        maxReferencesPerResult: 1,
        maxOutputTextChars: 256,
      },
    })
    const created = await createQuestion(setup)
    let revision = created.revision
    const sourceClaims: string[] = []
    const evidenceIds: string[] = []
    const paperIds: string[] = []
    for (const byte of [91, 92]) {
      const document = await importAndRegister(setup, Uint8Array.of(byte))
      const evidence = value(await setup.call('research_evidence_capture', {
        question_id: created.questionId,
        revision,
        document_id: document.id,
        block_id: paragraph(document).id,
      }))
      revision = evidence.revision as number
      evidenceIds.push(evidence.evidence_id as string)
      const paper = setup.ctx.researchLibrary.findByDocumentId(document.id)
      if (paper === undefined) throw new Error('registered paper missing')
      paperIds.push(paper.id)
      const claim = value(await setup.call('research_claim_write', {
        question_id: created.questionId,
        revision,
        kind: 'source-statement',
        facet: 'method',
        text: `Source method ${byte}`,
        evidence_links: [{ evidence_id: evidence.evidence_id, relation: 'supports' }],
      }))
      revision = claim.revision as number
      sourceClaims.push(claim.claim_id as string)
    }
    const canonicalName = `normalized-method-${'😀'.repeat(129)}`
    value(await setup.call('research_entity_write', {
      question_id: created.questionId,
      revision,
      kind: 'method',
      canonical_name: canonicalName,
      source_claim_ids: sourceClaims,
    }))

    const recovered: string[] = []
    const pages: Array<Record<string, unknown>> = []
    let referenceOffset = 0
    for (;;) {
      const result = await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'entities',
        entity_query: 'NORMALIZED-method',
        max_items: 1,
        reference_offset: referenceOffset,
      })
      const output = value(result)
      pages.push(output)
      const entity = (output.entities as Array<Record<string, unknown>>)[0]!
      recovered.push(
        ...(entity.source_claim_ids as string[]),
        ...(entity.linked_paper_ids as string[]),
        ...(entity.evidence_ids as string[]),
        ...(entity.stale_source_claim_ids as string[]),
        ...(entity.supersedes_entity_ids as string[]),
        ...((output.question as Record<string, unknown>).paper_ids as string[]),
      )
      expect(output).toMatchObject({
        returned_items: 1,
        total_items: 1,
        entity_query: '',
        entity_query_truncated: true,
        truncated: true,
      })
      expect(entity).toMatchObject({
        canonical_name_truncated: true,
        source_claim_ids_truncated: true,
        linked_paper_ids_truncated: true,
        evidence_ids_truncated: true,
        stale_source_claim_ids_truncated: false,
        supersedes_entity_ids_truncated: false,
        references_truncated: true,
        created_by: '',
        created_by_truncated: true,
      })
      expect(String(entity.canonical_name)).toBe(`normalized-method-${'😀'.repeat(118)}…`)
      expect(String(entity.canonical_name)).not.toMatch(/[\uD800-\uDFFF]/u)
      expect(String(entity.canonical_name).length).toBeLessThanOrEqual(256)
      expect(text(result).length).toBeLessThanOrEqual(256)
      expect(JSON.stringify(result.meta)).not.toContain(canonicalName)
      if (typeof output.next_reference_offset !== 'number') break
      referenceOffset = output.next_reference_offset
    }
    expect(pages.map(page => [
      page.reference_offset,
      page.returned_references,
      page.total_references,
      page.next_reference_offset,
    ])).toEqual(Array.from({ length: 8 }, (_, index) => [
      index,
      1,
      8,
      index === 7 ? undefined : index + 1,
    ]))
    expect(recovered).toEqual([
      ...sourceClaims,
      ...paperIds.sort((left, right) => left.localeCompare(right)),
      ...evidenceIds.sort((left, right) => left.localeCompare(right)),
      ...paperIds,
    ])
    const beyond = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'entities',
      entity_query: 'normalized-method',
      max_items: 1,
      reference_offset: 99,
    }))
    expect(beyond).toMatchObject({
      reference_offset: 99,
      returned_references: 0,
      total_references: 8,
    })
    expect(Object.hasOwn(beyond, 'next_reference_offset')).toBe(false)

    const rendered = text(await setup.call('research_question_list', {
      query: `x${'😀'.repeat(100)}`,
    }))
    expect(rendered).toContain('😀')
    expect(rendered).not.toMatch(/[\uD800-\uDFFF]/u)
    expect(rendered.length).toBeLessThanOrEqual(256)
    await dispose(setup)
  })

  it('writes authored reading notes, preserves reading order, and projects exact evidence anchors', async () => {
    const setup = await mount({
      toolConfig: { maxItemsPerResult: 1, maxReferencesPerResult: 1 },
    })
    const created = await createQuestion(setup)
    const firstDocument = await importAndRegister(setup, Uint8Array.of(71))
    const firstBlock = paragraph(firstDocument)
    const firstEvidence = value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: firstDocument.id,
      block_id: firstBlock.id,
      quote: 'accuracy',
    }))
    const firstNoteResult = await setup.call('research_note_write', {
      question_id: created.questionId,
      revision: 1,
      kind: 'note',
      text: 'Observation\r\n\r\n- retained detail',
      evidence_id: firstEvidence.evidence_id,
    })
    const firstNote = value(firstNoteResult)
    expect(firstNote).toMatchObject({
      status: 'created', revision: 2, question: { total_notes: 1, active_notes: 1 },
    })
    expect(firstNoteResult.meta).toMatchObject({ kind: 'dsh/research-note-write', version: 1 })

    const passageQuestion = value(await setup.call('research_note_write', {
      question_id: created.questionId,
      revision: 2,
      kind: 'passage-question',
      text: 'Does this gain hold outside the benchmark?',
      evidence_id: firstEvidence.evidence_id,
    }))
    const secondDocument = await importAndRegister(setup, Uint8Array.of(72))
    const secondEvidence = value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 3,
      document_id: secondDocument.id,
      block_id: paragraph(secondDocument).id,
      quote: 'robustness',
    }))
    const replacement = value(await setup.call('research_note_write', {
      question_id: created.questionId,
      revision: 4,
      kind: 'note',
      text: 'Corrected anchor after rereading.',
      evidence_id: secondEvidence.evidence_id,
      supersedes_note_id: firstNote.note_id,
    }))
    expect(replacement).toMatchObject({
      status: 'created', revision: 5, question: { total_notes: 3, active_notes: 2 },
    })

    const pages: Array<Record<string, unknown>> = []
    let offset = 0
    for (;;) {
      const output = value(await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'notes',
        offset,
        max_items: 1,
      }))
      pages.push(output)
      if (typeof output.next_offset !== 'number') break
      offset = output.next_offset
    }
    expect(pages.map(page => [page.offset, page.returned_items, page.total_items, page.next_offset]))
      .toEqual([[0, 1, 3, 1], [1, 1, 3, 2], [2, 1, 3, undefined]])
    expect(pages[0]).toMatchObject({
      text_offset: 0,
      returned_text_chars: Array.from('Observation\n\n- retained detail').length,
      total_text_chars: Array.from('Observation\n\n- retained detail').length,
    })
    expect(Object.hasOwn(pages[0] ?? {}, 'next_text_offset')).toBe(false)
    const notes = pages.flatMap(page => page.notes as Array<Record<string, unknown>>)
    expect(notes.map(note => note.note_id)).toEqual([
      firstNote.note_id,
      passageQuestion.note_id,
      replacement.note_id,
    ])
    expect(notes[0]).toMatchObject({
      kind: 'note',
      content_role: 'authored-commentary',
      text: 'Observation\n\n- retained detail',
      evidence_id: firstEvidence.evidence_id,
      active: false,
      created_by: 'agent:research-information-test-agent',
      references_truncated: false,
      anchor: {
        document_id: firstDocument.id,
        block_id: firstBlock.id,
        page_index: 0,
        page_label: '1',
        section_path: ['Results'],
        section_path_truncated: false,
        selected_text: 'accuracy',
      },
    })
    expect(notes[1]).toMatchObject({
      kind: 'passage-question', content_role: 'authored-commentary', active: true,
    })
    expect(notes[2]).toMatchObject({
      kind: 'note',
      evidence_id: secondEvidence.evidence_id,
      active: true,
      references_truncated: true,
      anchor: {
        document_id: secondDocument.id,
        section_path: ['Results'],
        selected_text: 'robustness',
      },
    })

    const filtered = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'notes',
      evidence_id: firstEvidence.evidence_id,
      max_items: 1,
    }))
    expect(filtered).toMatchObject({ total_items: 2, total_notes: 2, next_offset: 1 })
    expect((filtered.notes as Array<Record<string, unknown>>)[0]?.note_id).toBe(firstNote.note_id)

    const replacementPage = pages[2]!
    expect(replacementPage).toMatchObject({
      reference_offset: 0,
      returned_references: 1,
      total_references: 4,
      next_reference_offset: 1,
    })
    const continuedReferences = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'notes',
      offset: 2,
      max_items: 1,
      reference_offset: 1,
    }))
    expect(continuedReferences).toMatchObject({
      returned_references: 1,
      total_references: 4,
      next_reference_offset: 2,
    })
    expect((continuedReferences.notes as Array<Record<string, unknown>>)[0]).toMatchObject({
      note_id: replacement.note_id,
      evidence_id: secondEvidence.evidence_id,
      supersedes_note_id: firstNote.note_id,
      references_truncated: true,
      anchor: { document_id: secondDocument.id, section_path: [], selected_text: 'robustness' },
    })
    await dispose(setup)
  })

  it('projects reading-note reference failures without writing the aggregate', async () => {
    const parserState = { result: parseResult({ pageLabel: false }) }
    const setup = await mount({ parserState })
    const created = await createQuestion(setup)
    const document = await importAndRegister(setup, Uint8Array.of(73))
    const block = paragraph(document)
    const evidence = value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: block.id,
    }))
    const missingEvidence = '00000000-0000-4000-8000-000000000071'
    const missingNote = '00000000-0000-4000-8000-000000000072'

    expect(value(await setup.call('research_note_write', {
      question_id: '00000000-0000-4000-8000-000000000073',
      revision: 0,
      kind: 'note',
      text: 'Missing question',
      evidence_id: missingEvidence,
    }))).toMatchObject({ status: 'question-not-found' })
    expect(value(await setup.call('research_note_write', {
      question_id: created.questionId,
      revision: 0,
      kind: 'note',
      text: 'Stale',
      evidence_id: evidence.evidence_id,
    }))).toMatchObject({ status: 'stale-revision', current_revision: 1 })
    expect(value(await setup.call('research_note_write', {
      question_id: created.questionId,
      revision: 1,
      kind: 'note',
      text: 'Missing evidence',
      evidence_id: missingEvidence,
    }))).toEqual({ status: 'evidence-not-found', evidence_id: missingEvidence, truncated: false })
    expect(value(await setup.call('research_note_write', {
      question_id: created.questionId,
      revision: 1,
      kind: 'passage-question',
      text: 'Which passage?',
      evidence_id: evidence.evidence_id,
    }))).toEqual({
      status: 'passage-question-selection-required',
      evidence_id: evidence.evidence_id,
      truncated: false,
    })

    const original = value(await setup.call('research_note_write', {
      question_id: created.questionId,
      revision: 1,
      kind: 'note',
      text: 'Whole-block note',
      evidence_id: evidence.evidence_id,
    }))
    expect(value(await setup.call('research_note_write', {
      question_id: created.questionId,
      revision: 2,
      kind: 'note',
      text: 'Missing predecessor',
      evidence_id: evidence.evidence_id,
      supersedes_note_id: missingNote,
    }))).toEqual({
      status: 'supersedes-reading-note-not-found', note_id: missingNote, truncated: false,
    })
    const replacement = value(await setup.call('research_note_write', {
      question_id: created.questionId,
      revision: 2,
      kind: 'note',
      text: 'Replacement',
      evidence_id: evidence.evidence_id,
      supersedes_note_id: original.note_id,
    }))
    expect(value(await setup.call('research_note_write', {
      question_id: created.questionId,
      revision: 3,
      kind: 'note',
      text: 'Cannot replace inactive note',
      evidence_id: evidence.evidence_id,
      supersedes_note_id: original.note_id,
    }))).toEqual({
      status: 'supersedes-reading-note-inactive', note_id: original.note_id, truncated: false,
    })

    const selectedEvidence = value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 3,
      document_id: document.id,
      block_id: block.id,
      quote: 'accuracy',
    }))
    expect(value(await setup.call('research_note_write', {
      question_id: created.questionId,
      revision: 4,
      kind: 'passage-question',
      text: 'Kind mismatch',
      evidence_id: selectedEvidence.evidence_id,
      supersedes_note_id: replacement.note_id,
    }))).toEqual({
      status: 'supersedes-reading-note-kind-mismatch', note_id: replacement.note_id, truncated: false,
    })

    const notes = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'notes',
    }))
    const projected = (notes.notes as Array<Record<string, unknown>>)[0]!
    expect(projected).toMatchObject({
      note_id: original.note_id,
      active: false,
      anchor: { section_path: ['Results'], section_path_truncated: false },
      references_truncated: false,
    })
    expect(Object.hasOwn(projected.anchor as object, 'page_label')).toBe(false)
    expect(Object.hasOwn(projected.anchor as object, 'selected_text')).toBe(false)
    await dispose(setup)
  })

  it('bounds note text and anchor prose in canonical values, rendering, and presentation metadata', async () => {
    const noteText = `${'n'.repeat(197)}\n${'界'.repeat(200)}\n🙂`
    const selectedText = 'b'.repeat(400)
    const sectionText = 's'.repeat(400)
    const pageLabel = 'p'.repeat(400)
    const authorId = 'a'.repeat(400)
    const parserState = {
      result: parseResult({ text: selectedText, headingText: sectionText, pageLabel }),
    }
    const setup = await mount({
      parserState,
      toolConfig: {
        maxItemsPerResult: 1,
        maxReferencesPerResult: 1,
        maxOutputTextChars: 256,
      },
    })
    const owner = { id: authorId } as unknown as Agent
    const created = value(await setup.call('research_question_write', {
      action: 'create', title: 'T', question: 'Q',
    }, owner))
    const document = await importAndRegister(setup, Uint8Array.of(74))
    const evidence = value(await setup.call('research_evidence_capture', {
      question_id: created.question_id,
      revision: 0,
      document_id: document.id,
      block_id: paragraph(document).id,
      quote: selectedText,
    }, owner))
    value(await setup.call('research_note_write', {
      question_id: created.question_id,
      revision: 1,
      kind: 'note',
      text: noteText,
      evidence_id: evidence.evidence_id,
    }, owner))
    const secondDocument = await importAndRegister(setup, Uint8Array.of(75))
    const secondEvidence = value(await setup.call('research_evidence_capture', {
      question_id: created.question_id,
      revision: 2,
      document_id: secondDocument.id,
      block_id: paragraph(secondDocument).id,
      quote: selectedText,
    }, owner))
    const secondNote = value(await setup.call('research_note_write', {
      question_id: created.question_id,
      revision: 3,
      kind: 'note',
      text: 'z'.repeat(400),
      evidence_id: secondEvidence.evidence_id,
    }, owner))
    const thirdNote = value(await setup.call('research_note_write', {
      question_id: created.question_id,
      revision: 4,
      kind: 'note',
      text: 'y'.repeat(400),
      evidence_id: secondEvidence.evidence_id,
    }, owner))

    const chunks: string[] = []
    let textOffset = 0
    for (;;) {
      const result = await setup.call('research_question_get', {
        question_id: created.question_id,
        view: 'notes',
        max_items: 1,
        text_offset: textOffset,
      })
      const output = value(result)
      const note = (output.notes as Array<Record<string, unknown>>)[0]!
      const chunk = note.text as string
      chunks.push(chunk)
      expect(output).toMatchObject({
        text_offset: textOffset,
        returned_text_chars: Array.from(chunk).length,
        total_text_chars: 400,
        truncated: true,
      })
      expect(note).toMatchObject({
        text_truncated: true,
        created_by_truncated: true,
        anchor: {
          document_id: document.id,
          page_label_truncated: true,
          section_path_truncated: true,
          selected_text_truncated: true,
        },
      })
      expect(chunk).not.toContain('…')
      expect(text(result)).toContain(chunk)
      expect(text(result)).toContain('content_role=authored-commentary')
      expect(text(result)).toContain('not a source statement')
      expect(text(result)).toContain(`note_id=${String(note.note_id)}`)
      expect(text(result)).toContain(`evidence_id=${String(evidence.evidence_id)}`)
      expect(text(result).length).toBeLessThanOrEqual(256)
      const metadata = JSON.stringify(result.meta)
      expect(metadata).not.toContain(noteText)
      expect(metadata).not.toContain(selectedText)
      expect(metadata).not.toContain(sectionText)
      expect(metadata).not.toContain(pageLabel)
      expect(metadata).not.toContain(authorId)
      if (typeof output.next_text_offset !== 'number') break
      expect(text(result)).toContain(`text_offset=${output.next_text_offset}`)
      expect(output.next_text_offset).toBeGreaterThan(textOffset)
      textOffset = output.next_text_offset
    }
    expect(chunks.join('')).toBe(noteText)

    const secondByOffset = await setup.call('research_question_get', {
      question_id: created.question_id,
      view: 'notes',
      offset: 1,
      max_items: 1,
      text_offset: 0,
    })
    const secondByOffsetValue = value(secondByOffset)
    expect((secondByOffsetValue.notes as Array<Record<string, unknown>>)[0]).toMatchObject({
      note_id: secondNote.note_id,
      evidence_id: secondEvidence.evidence_id,
    })
    expect(text(secondByOffset)).toContain('same notes query/offset')
    expect(text(secondByOffset)).toContain(`text_offset=${String(secondByOffsetValue.next_text_offset)}`)

    const thirdByFilter = await setup.call('research_question_get', {
      question_id: created.question_id,
      view: 'notes',
      evidence_id: secondEvidence.evidence_id,
      offset: 1,
      max_items: 1,
      text_offset: 0,
    })
    const thirdByFilterValue = value(thirdByFilter)
    expect((thirdByFilterValue.notes as Array<Record<string, unknown>>)[0]).toMatchObject({
      note_id: thirdNote.note_id,
      evidence_id: secondEvidence.evidence_id,
    })
    expect(text(thirdByFilter)).toContain('same notes query/offset')
    expect(text(thirdByFilter)).toContain(`text_offset=${String(thirdByFilterValue.next_text_offset)}`)

    const beyond = await setup.call('research_question_get', {
      question_id: created.question_id,
      view: 'notes',
      max_items: 1,
      text_offset: 401,
    })
    expect(value(beyond)).toMatchObject({
      text_offset: 401,
      returned_text_chars: 0,
      total_text_chars: 400,
    })
    expect(Object.hasOwn(value(beyond), 'next_text_offset')).toBe(false)
    expect(text(beyond)).toContain('next_text_offset=none')
    await dispose(setup)
  })

  it('fails loud when compact note metadata cannot leave room for one Unicode code point', async () => {
    const setup = await mount({
      toolConfig: { maxItemsPerResult: 1, maxOutputTextChars: 256 },
    })
    const created = await createQuestion(setup)
    const document = await importAndRegister(setup, Uint8Array.of(76))
    const evidence = value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: paragraph(document).id,
    }))
    value(await setup.call('research_note_write', {
      question_id: created.questionId,
      revision: 1,
      kind: 'note',
      text: `🙂${'x'.repeat(400)}`,
      evidence_id: evidence.evidence_id,
    }))
    const record = setup.ctx.researchInformation.get(ResearchQuestionId(created.questionId))
    const storedEvidence = record?.evidence[0]
    const storedNote = record?.readingNotes[0]
    if (record === undefined || storedEvidence === undefined || storedNote === undefined) {
      throw new Error('reading-note fixture record missing')
    }
    const malformedEvidenceId = 'e'.repeat(58) as typeof storedEvidence.id
    vi.spyOn(setup.ctx.researchInformation, 'get').mockReturnValue({
      ...record,
      evidence: [{ ...storedEvidence, id: malformedEvidenceId }],
      readingNotes: [{
        ...storedNote,
        id: 'n'.repeat(58) as typeof storedNote.id,
        evidenceId: malformedEvidenceId,
      }],
    })

    const result = await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'notes',
      max_items: 1,
      text_offset: 0,
    })
    expect(result.isError).toBe(true)
    expect(text(result)).toContain('reading-note text cannot advance within maxOutputTextChars')
    await dispose(setup)
  })

  it('recovers overview items and synthesis findings from returned offsets', async () => {
    const setup = await mount({ toolConfig: { maxItemsPerResult: 2 } })
    const created = await createQuestion(setup)
    const document = await importAndRegister(setup, Uint8Array.of(31))
    const captured = value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: paragraph(document).id,
    }))
    const source = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision: 1,
      kind: 'source-statement',
      facet: 'result',
      text: 'The source reports a result.',
      evidence_links: [{ evidence_id: captured.evidence_id, relation: 'supports' }],
    }))
    const inference = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision: 2,
      kind: 'inference',
      facet: 'validity-threat',
      text: 'The result may not generalize.',
      evidence_links: [],
    }))
    const synthesis = value(await setup.call('research_synthesis_write', {
      question_id: created.questionId,
      revision: 3,
      findings: [
        {
          kind: 'source-summary',
          stance: 'agreement',
          text: 'Reported result.',
          claim_ids: [source.claim_id],
        },
        {
          kind: 'inference',
          stance: 'qualification',
          text: 'Generalization is uncertain.',
          claim_ids: [inference.claim_id],
        },
        {
          kind: 'inference',
          stance: 'open-question',
          text: 'Replication remains open.',
          claim_ids: [],
        },
      ],
    }))

    const pages: Array<Record<string, unknown>> = []
    let offset = 0
    for (;;) {
      const page = value(await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'overview',
        offset,
        max_items: 1,
      }))
      pages.push(page)
      if (typeof page.next_offset !== 'number') break
      offset = page.next_offset
    }
    expect(pages.map(page => [
      page.offset,
      page.returned_items,
      page.total_items,
      page.next_offset,
    ])).toEqual([
      [0, 1, 4, 1],
      [1, 1, 4, 2],
      [2, 1, 4, 3],
      [3, 1, 4, undefined],
    ])
    expect(pages.every(page =>
      page.reference_offset === 0
      && typeof page.returned_references === 'number'
      && typeof page.total_references === 'number')).toBe(true)
    expect(pages.flatMap(page => page.evidence as Array<Record<string, unknown>>)
      .map(item => item.evidence_id)).toEqual([captured.evidence_id])
    expect(pages.flatMap(page => page.claims as Array<Record<string, unknown>>)
      .map(item => item.claim_id)).toEqual([source.claim_id, inference.claim_id])
    expect(pages.flatMap(page => page.syntheses as Array<Record<string, unknown>>)
      .map(item => item.synthesis_id)).toEqual([synthesis.synthesis_id])

    const firstSynthesisPage = (pages[3]?.syntheses as Array<Record<string, unknown>> | undefined)?.[0]
    expect(firstSynthesisPage).toMatchObject({
      finding_offset: 0,
      next_finding_offset: 2,
      total_findings: 3,
      findings_truncated: true,
    })
    const tail = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'overview',
      offset: 3,
      max_items: 1,
      finding_offset: firstSynthesisPage?.next_finding_offset,
    }))
    const tailSynthesis = (tail.syntheses as Array<Record<string, unknown>>)[0]
    expect(tailSynthesis).toMatchObject({
      finding_offset: 2,
      total_findings: 3,
      findings_truncated: true,
    })
    expect(Object.hasOwn(tailSynthesis ?? {}, 'next_finding_offset')).toBe(false)
    const recoveredFindings = [firstSynthesisPage, tailSynthesis].flatMap(projected =>
      (projected?.findings as Array<Record<string, unknown>> | undefined) ?? [])
    expect(recoveredFindings).toMatchObject([
      {
        text: 'Reported result.',
        comparison_protocol_ids: [],
        total_comparison_protocols: 0,
        comparison_protocol_ids_truncated: false,
      },
      {
        text: 'Generalization is uncertain.',
        comparison_protocol_ids: [],
        total_comparison_protocols: 0,
        comparison_protocol_ids_truncated: false,
      },
      {
        text: 'Replication remains open.',
        comparison_protocol_ids: [],
        total_comparison_protocols: 0,
        comparison_protocol_ids_truncated: false,
      },
    ])

    const beyondItems = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'overview',
      offset: 99,
      max_items: 1,
    }))
    expect(beyondItems).toMatchObject({
      offset: 99,
      returned_items: 0,
      total_items: 4,
      evidence: [],
      claims: [],
      syntheses: [],
    })
    expect(Object.hasOwn(beyondItems, 'next_offset')).toBe(false)

    const beyondFindings = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'overview',
      offset: 3,
      max_items: 1,
      finding_offset: 99,
    }))
    const beyondSynthesis = (beyondFindings.syntheses as Array<Record<string, unknown>>)[0]
    expect(beyondSynthesis).toMatchObject({
      finding_offset: 99,
      findings: [],
      total_findings: 3,
      findings_truncated: true,
    })
    expect(Object.hasOwn(beyondSynthesis ?? {}, 'next_finding_offset')).toBe(false)
    await dispose(setup)
  })

  it('recovers matrix references and audit evidence from their page offsets', async () => {
    const setup = await mount({
      toolConfig: { maxItemsPerResult: 1, maxReferencesPerResult: 1 },
    })
    const created = await createQuestion(setup)
    const firstDocument = await importAndRegister(setup, Uint8Array.of(41))
    const firstEvidence = value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: firstDocument.id,
      block_id: paragraph(firstDocument).id,
    }))
    const secondDocument = await importAndRegister(setup, Uint8Array.of(42))
    const secondEvidence = value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 1,
      document_id: secondDocument.id,
      block_id: paragraph(secondDocument).id,
    }))
    const source = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision: 2,
      kind: 'source-statement',
      facet: 'result',
      text: 'The first paper reports a result.',
      evidence_links: [{ evidence_id: firstEvidence.evidence_id, relation: 'supports' }],
    }))
    const inference = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision: 3,
      kind: 'inference',
      facet: 'result',
      text: 'The first result suggests a consequence.',
      evidence_links: [{ evidence_id: firstEvidence.evidence_id, relation: 'supports' }],
    }))

    const matrixPages: Array<{
      readonly offset: number
      readonly output: Record<string, unknown>
      readonly cell: Record<string, unknown>
    }> = []
    let offset = 0
    for (;;) {
      const output = value(await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'matrix',
        offset,
        max_items: 1,
      }))
      const matrix = output.matrix as Record<string, unknown>
      const cell = (matrix.cells as Array<Record<string, unknown>>)[0]
      if (cell === undefined) throw new Error('matrix page did not return its requested cell')
      matrixPages.push({ offset, output, cell })
      if (typeof output.next_offset !== 'number') break
      offset = output.next_offset
    }
    expect(matrixPages).toHaveLength(16)
    expect(matrixPages.map(page => [
      page.output.offset,
      page.output.returned_items,
      page.output.total_items,
      page.output.next_offset,
    ])).toEqual(Array.from({ length: 16 }, (_, index) => [
      index,
      1,
      16,
      index === 15 ? undefined : index + 1,
    ]))
    expect(new Set(matrixPages.map(page => `${page.cell.facet}:${page.cell.paper_id}`)).size).toBe(16)

    const target = matrixPages.find(page =>
      page.cell.facet === 'result' && page.cell.missing_source_statement === false)
    if (target === undefined) throw new Error('matrix result cell with captured source is missing')
    const referencePages: Array<Record<string, unknown>> = []
    const recoveredReferences: string[] = []
    let referenceOffset = 0
    for (;;) {
      const output = value(await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'matrix',
        offset: target.offset,
        max_items: 1,
        reference_offset: referenceOffset,
      }))
      referencePages.push(output)
      const matrix = output.matrix as Record<string, unknown>
      const cell = (matrix.cells as Array<Record<string, unknown>>)[0]
      if (cell === undefined) throw new Error('matrix reference page omitted its cell')
      recoveredReferences.push(
        ...(cell.source_statement_claim_ids as string[]),
        ...(cell.inference_claim_ids as string[]),
        ...(cell.evidence_ids as string[]),
        ...(matrix.uncited_inference_claim_ids as string[]),
        ...(matrix.paper_ids as string[]),
        ...((output.question as Record<string, unknown>).paper_ids as string[]),
      )
      if (typeof output.next_reference_offset !== 'number') break
      referenceOffset = output.next_reference_offset
    }
    expect(referencePages.map(page => [
      page.reference_offset,
      page.returned_references,
      page.total_references,
      page.next_reference_offset,
    ])).toEqual([
      [0, 1, 7, 1],
      [1, 1, 7, 2],
      [2, 1, 7, 3],
      [3, 1, 7, 4],
      [4, 1, 7, 5],
      [5, 1, 7, 6],
      [6, 1, 7, undefined],
    ])
    const firstPaper = setup.ctx.researchLibrary.findByDocumentId(firstDocument.id)
    const secondPaper = setup.ctx.researchLibrary.findByDocumentId(secondDocument.id)
    if (firstPaper === undefined || secondPaper === undefined) throw new Error('registered paper missing')
    const paperIds = [String(firstPaper.id), String(secondPaper.id)]
      .sort((left, right) => left.localeCompare(right))
    expect(recoveredReferences).toEqual([
      source.claim_id,
      inference.claim_id,
      firstEvidence.evidence_id,
      ...paperIds,
      ...paperIds,
    ])

    const beyondReferences = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'matrix',
      offset: target.offset,
      max_items: 1,
      reference_offset: 99,
    }))
    expect(beyondReferences).toMatchObject({
      reference_offset: 99,
      returned_references: 0,
      total_references: 7,
    })
    expect(Object.hasOwn(beyondReferences, 'next_reference_offset')).toBe(false)

    const auditPages: Array<Record<string, unknown>> = []
    offset = 0
    for (;;) {
      const output = value(await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'audit',
        offset,
        max_items: 1,
      }))
      auditPages.push(output)
      if (typeof output.next_offset !== 'number') break
      offset = output.next_offset
    }
    expect(auditPages.map(page => [
      page.offset,
      page.returned_items,
      page.total_items,
      page.next_offset,
    ])).toEqual([
      [0, 1, 2, 1],
      [1, 1, 2, undefined],
    ])
    expect(auditPages.flatMap((page) => {
      const audit = page.audit as Record<string, unknown>
      return audit.evidence as Array<Record<string, unknown>>
    }).map(item => item.evidence_id)).toEqual([
      firstEvidence.evidence_id,
      secondEvidence.evidence_id,
    ])
    const beyondAudit = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'audit',
      offset: 99,
      max_items: 1,
    }))
    expect(beyondAudit).toMatchObject({ offset: 99, returned_items: 0, total_items: 2 })
    expect((beyondAudit.audit as Record<string, unknown>).evidence).toEqual([])
    expect(Object.hasOwn(beyondAudit, 'next_offset')).toBe(false)
    await dispose(setup)
  })

  it('lists, filters, updates with compare-and-set, and reports lookup failures', async () => {
    const setup = await mount()
    const first = await createQuestion(setup, 'Alpha topic')
    await createQuestion(setup, 'Beta topic')
    const list = await setup.call('research_question_list', { query: ' alpha ', max_results: 1 })
    expect(value(list)).toMatchObject({ query: 'alpha', total_matches: 1, truncated: false })
    expect(list.meta).toMatchObject({ kind: 'dsh/research-question-list', version: 1 })
    const updated = value(await setup.call('research_question_write', {
      action: 'update',
      question_id: first.questionId,
      revision: 0,
      title: 'Alpha revised',
    }))
    expect(updated).toMatchObject({ status: 'updated', revision: 1 })
    expect(value(await setup.call('research_question_write', {
      action: 'update',
      question_id: first.questionId,
      revision: 0,
      question: 'stale',
    }))).toMatchObject({ status: 'stale-revision', expected_revision: 0, current_revision: 1 })
    expect(value(await setup.call('research_question_get', {
      question_id: '00000000-0000-4000-8000-000000000000',
      view: 'audit',
    }))).toEqual({
      status: 'question-not-found',
      question_id: '00000000-0000-4000-8000-000000000000',
      view: 'audit',
      truncated: false,
    })
    await dispose(setup)
  })

  it('derives capture provenance and returns runtime prerequisites without writing', async () => {
    const setup = await mount()
    const created = await createQuestion(setup)
    const document = await setup.ctx.researchDocuments.import({
      bytes: Uint8Array.of(5, 6, 7), mediaType: 'application/pdf',
    })
    const block = paragraph(document)
    expect(value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: block.id,
    }))).toMatchObject({ status: 'document-not-registered' })
    await setup.ctx.researchLibrary.register({
      metadata: { title: 'Mismatched parser paper', origin: 'declared' },
      document: {
        documentId: document.id,
        mediaType: document.mediaType,
        parserId: 'different-parser',
        parserVersion: 'different-version',
        extraction: document.extraction,
        pageCount: document.pageCount,
        blockCount: document.blockCount,
      },
    })
    expect(value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: block.id,
    }))).toMatchObject({ status: 'parser-observation-missing' })
    expect(setup.ctx.researchInformation.get(created.questionId as never)?.revision).toBe(0)
    await dispose(setup)
  })

  it('checks question revision and exact runtime identities before evidence derivation', async () => {
    const setup = await mount()
    const created = await createQuestion(setup)
    const document = await importAndRegister(setup)
    const block = paragraph(document)
    const missingQuestion = '00000000-0000-4000-8000-000000000010'
    expect(value(await setup.call('research_evidence_capture', {
      question_id: missingQuestion,
      revision: 0,
      document_id: document.id,
      block_id: block.id,
    }))).toMatchObject({ status: 'question-not-found' })
    expect(value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 1,
      document_id: document.id,
      block_id: block.id,
    }))).toMatchObject({ status: 'stale-revision', expected_revision: 1, current_revision: 0 })

    const paper = setup.ctx.researchLibrary.findByDocumentId(document.id)
    if (paper === undefined) throw new Error('registered paper missing')
    const findByDocumentId = vi.spyOn(setup.ctx.researchLibrary, 'findByDocumentId')
      .mockReturnValue({ ...paper, sourceVersions: [] })
    expect(value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: block.id,
    }))).toMatchObject({ status: 'document-not-registered' })
    findByDocumentId.mockRestore()
    await dispose(setup)
  })

  it('reports exact quote and anchor failures without weakening whole-block evidence', async () => {
    const setup = await mount()
    const created = await createQuestion(setup)
    const document = await importAndRegister(setup)
    const block = paragraph(document)
    const emptyQuote = await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: block.id,
      quote: '',
    })
    expect(emptyQuote.isError).toBe(true)
    expect(text(emptyQuote)).toContain('quote must not be empty')
    expect(value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: block.id,
      quote: 'absent quote',
    }))).toMatchObject({ status: 'quote-not-found', matches: 0 })
    expect(value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: block.id,
      quote: 'Alpha improves',
    }))).toMatchObject({ status: 'quote-ambiguous', matches: 2 })
    expect(value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: `block:${'0'.repeat(64)}`,
    }))).toMatchObject({ status: 'block-not-found' })
    const whole = value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: block.id,
    }))
    expect(whole).toMatchObject({ status: 'created', revision: 1 })
    const overview = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'overview',
    }))
    const projected = overview.evidence as Array<Record<string, unknown>>
    expect(projected).toHaveLength(1)
    expect(Object.hasOwn(projected[0] ?? {}, 'selected_text')).toBe(false)
    await dispose(setup)
  })

  it('omits an unavailable printed page label from the overview', async () => {
    const setup = await mount({ parserState: { result: parseResult({ pageLabel: false }) } })
    const created = await createQuestion(setup)
    const document = await importAndRegister(setup)
    const block = paragraph(document)
    await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: block.id,
    })
    const overview = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'overview',
    }))
    const projected = overview.evidence as Array<Record<string, unknown>>
    expect(projected).toHaveLength(1)
    expect(Object.hasOwn(projected[0] ?? {}, 'page_label')).toBe(false)
    await dispose(setup)
  })

  it('separates needs-ocr and reimport-required from durable paper history', async () => {
    const ocrSetup = await mount({
      parserState: { result: parseResult({ extraction: { text: 'none', layout: 'page-only' } }) },
    })
    const ocrQuestion = await createQuestion(ocrSetup)
    const ocrDocument = await importAndRegister(ocrSetup)
    expect(value(await ocrSetup.call('research_evidence_capture', {
      question_id: ocrQuestion.questionId,
      revision: 0,
      document_id: ocrDocument.id,
      block_id: `block:${'0'.repeat(64)}`,
    }))).toMatchObject({ status: 'needs-ocr' })
    await dispose(ocrSetup)

    const evicted = await mount({ maxDocuments: 1 })
    const question = await createQuestion(evicted)
    const first = await importAndRegister(evicted, Uint8Array.of(1))
    await evicted.ctx.researchDocuments.import({ bytes: Uint8Array.of(2), mediaType: 'application/pdf' })
    expect(value(await evicted.call('research_evidence_capture', {
      question_id: question.questionId,
      revision: 0,
      document_id: first.id,
      block_id: paragraph(first).id,
    }))).toMatchObject({ status: 'reimport-required' })
    await dispose(evicted)
  })

  it('audits every current runtime coverage state without changing durable evidence', async () => {
    const setup = await mount()
    const created = await createQuestion(setup)
    const document = await importAndRegister(setup)
    const block = paragraph(document)
    const captured = value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: block.id,
      quote: 'accuracy',
    }))
    expect(captured.status).toBe('created')

    const auditCounts = async () => {
      const audit = value(await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'audit',
      })).audit as { coverage_counts: Record<string, number> }
      return audit.coverage_counts
    }
    const peek = vi.spyOn(setup.ctx.researchDocuments, 'peek')
    peek.mockReturnValue(undefined)
    expect(await auditCounts()).toMatchObject({ reimport_required: 1 })
    peek.mockReturnValue({ ...document, extraction: { text: 'none', layout: 'page-only' } })
    expect(await auditCounts()).toMatchObject({ needs_ocr: 1 })
    peek.mockReturnValue({ ...document, parser: { ...document.parser, version: 'fixture-v2' } })
    expect(await auditCounts()).toMatchObject({ parser_mismatch: 1 })
    peek.mockReturnValue({
      ...document,
      pages: document.pages.map(page => ({ ...page, blocks: [] })),
    })
    expect(await auditCounts()).toMatchObject({ locator_mismatch: 1 })
    peek.mockReturnValue({
      ...document,
      pages: document.pages.map(page => ({
        ...page,
        blocks: page.blocks.map(value => value.id === block.id ? { ...value, text: 'Changed text' } : value),
      })),
    })
    expect(await auditCounts()).toMatchObject({ locator_mismatch: 1 })
    peek.mockReturnValue(document)
    const libraryGet = vi.spyOn(setup.ctx.researchLibrary, 'get').mockReturnValue(undefined)
    expect(await auditCounts()).toMatchObject({ parser_mismatch: 1 })
    libraryGet.mockRestore()
    peek.mockRestore()
    expect(await auditCounts()).toMatchObject({ readable: 1 })
    await dispose(setup)
  })

  it('keeps evidence-linked inferences separate and labels missing paper metadata', async () => {
    const setup = await mount()
    const created = await createQuestion(setup)
    const document = await importAndRegister(setup)
    const block = paragraph(document)
    const captured = value(await setup.call('research_evidence_capture', {
      question_id: created.questionId,
      revision: 0,
      document_id: document.id,
      block_id: block.id,
    }))
    const inference = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision: 1,
      kind: 'inference',
      facet: 'method',
      text: 'The selected procedure may explain the result.',
      evidence_links: [{ evidence_id: captured.evidence_id, relation: 'background' }],
    }))
    const paper = setup.ctx.researchLibrary.findByDocumentId(document.id)
    if (paper === undefined) throw new Error('registered paper missing')
    const libraryGet = vi.spyOn(setup.ctx.researchLibrary, 'get').mockReturnValue(undefined)
    const matrix = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'matrix',
    })).matrix as { cells: Array<Record<string, unknown>> }
    expect(matrix.cells).toContainEqual(expect.objectContaining({
      facet: 'method',
      paper_id: paper.id,
      paper_title: `[missing paper ${paper.id}]`,
      source_statement_claim_ids: [],
      inference_claim_ids: [inference.claim_id],
      evidence_ids: [captured.evidence_id],
      missing_source_statement: true,
    }))
    libraryGet.mockRestore()
    await dispose(setup)
  })

  it('enforces source citation rules and exposes superseded references in the audit', async () => {
    const setup = await mount()
    const created = await createQuestion(setup)
    expect(value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision: 0,
      kind: 'source-statement',
      facet: 'other',
      other_facet: 'cost',
      text: 'No evidence.',
      evidence_links: [],
    }))).toMatchObject({ status: 'source-claim-uncited' })
    const inference = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision: 0,
      kind: 'inference',
      facet: 'other',
      other_facet: 'cost',
      text: 'Initial inference.',
      evidence_links: [],
    }))
    const firstSynthesis = value(await setup.call('research_synthesis_write', {
      question_id: created.questionId,
      revision: 1,
      findings: [
        {
          kind: 'inference',
          stance: 'open-question',
          text: 'Initial synthesis.',
          claim_ids: [inference.claim_id],
        },
        {
          kind: 'inference',
          stance: 'qualification',
          text: 'Second initial synthesis.',
          claim_ids: [inference.claim_id],
        },
      ],
    }))
    const replacement = value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision: 2,
      kind: 'inference',
      facet: 'other',
      other_facet: 'cost',
      text: 'Replacement inference.',
      evidence_links: [],
      supersedes_claim_id: inference.claim_id,
    }))
    expect(replacement).toMatchObject({ status: 'created', revision: 3 })
    const secondSynthesis = value(await setup.call('research_synthesis_write', {
      question_id: created.questionId,
      revision: 3,
      findings: [{
        kind: 'inference', stance: 'qualification', text: 'Replacement synthesis.', claim_ids: [replacement.claim_id],
      }],
      supersedes_synthesis_id: firstSynthesis.synthesis_id,
    }))
    expect(secondSynthesis).toMatchObject({ status: 'created', revision: 4 })
    const audit = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'audit',
    })).audit as Record<string, unknown>
    expect(audit).toMatchObject({
      inactive_claim_ids: [inference.claim_id],
      inactive_synthesis_ids: [firstSynthesis.synthesis_id],
    })
    expect(audit.stale_synthesis_references).toContainEqual(expect.objectContaining({
      synthesis_id: firstSynthesis.synthesis_id,
      claim_id: inference.claim_id,
    }))
    await setup.toolFiber.dispose()
    setup.toolFiber = await setup.ctx.plugin(ResearchInformationTools, {
      maxReferencesPerResult: 1,
    })
    const staleSynthesisReferences: Array<Record<string, unknown>> = []
    const auditReferencePages: Array<Record<string, unknown>> = []
    let referenceOffset = 0
    for (;;) {
      const output = value(await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'audit',
        reference_offset: referenceOffset,
      }))
      auditReferencePages.push(output)
      staleSynthesisReferences.push(
        ...((output.audit as Record<string, unknown>)
          .stale_synthesis_references as Array<Record<string, unknown>>),
      )
      if (typeof output.next_reference_offset !== 'number') break
      referenceOffset = output.next_reference_offset
    }
    expect(auditReferencePages.map(page => page.reference_offset)).toEqual(
      Array.from({ length: auditReferencePages.length }, (_, index) => index),
    )
    expect(staleSynthesisReferences).toHaveLength(2)
    expect(staleSynthesisReferences.map(reference => [
      reference.synthesis_id,
      reference.claim_id,
    ])).toEqual([
      [firstSynthesis.synthesis_id, inference.claim_id],
      [firstSynthesis.synthesis_id, inference.claim_id],
    ])
    expect(new Set(staleSynthesisReferences.map(reference => reference.finding_id)).size).toBe(2)
    const overview = value(await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'overview',
    }))
    expect(overview.claims).toContainEqual(expect.objectContaining({
      claim_id: replacement.claim_id,
      other_facet: 'cost',
      supersedes_claim_id: inference.claim_id,
      active: true,
    }))
    expect(overview.syntheses).toContainEqual(expect.objectContaining({
      synthesis_id: secondSynthesis.synthesis_id,
      supersedes_synthesis_id: firstSynthesis.synthesis_id,
      active: true,
    }))
    await dispose(setup)
  })

  it('requires an owning agent on every mutation and validates cross-field arguments', async () => {
    const setup = await mount()
    const noAgent = await setup.call('research_question_write', {
      action: 'create', title: 'T', question: 'Q',
    }, null)
    expect(noAgent.isError).toBe(true)
    expect(text(noAgent)).toContain('require an owning agent session')
    const noNoteAgent = await setup.call('research_note_write', {
      question_id: '00000000-0000-4000-8000-000000000001',
      revision: 0,
      kind: 'note',
      text: 'Authored note',
      evidence_id: '00000000-0000-4000-8000-000000000002',
    }, null)
    expect(noNoteAgent.isError).toBe(true)
    expect(text(noNoteAgent)).toContain('require an owning agent session')
    const noEntityAgent = await setup.call('research_entity_write', {
      question_id: '00000000-0000-4000-8000-000000000001',
      revision: 0,
      kind: 'method',
      canonical_name: 'Authored normalization',
      source_claim_ids: ['00000000-0000-4000-8000-000000000002'],
    }, null)
    expect(noEntityAgent.isError).toBe(true)
    expect(text(noEntityAgent)).toContain('require an owning agent session')
    const noObservationAgent = await setup.call('research_observation_write', {
      question_id: '00000000-0000-4000-8000-000000000001',
      revision: 0,
      result_claim_id: '00000000-0000-4000-8000-000000000002',
      method: {
        entity_id: '00000000-0000-4000-8000-000000000003',
        source_claim_id: '00000000-0000-4000-8000-000000000004',
        role: 'proposed',
      },
      dataset: {
        entity_id: '00000000-0000-4000-8000-000000000005',
        source_claim_id: '00000000-0000-4000-8000-000000000006',
        split: { status: 'not-applicable' },
      },
      metric: {
        entity_id: '00000000-0000-4000-8000-000000000007',
        source_claim_id: '00000000-0000-4000-8000-000000000008',
      },
      value: '1',
      unit: { status: 'not-applicable' },
      value_statistic: 'single score',
      evaluation_protocol: { status: 'not-applicable' },
      uncertainty: { status: 'not-recorded' },
      conditions: { status: 'not-applicable' },
    }, null)
    expect(noObservationAgent.isError).toBe(true)
    expect(text(noObservationAgent)).toContain('require an owning agent session')
    const noProtocolAgent = await setup.call('research_comparison_protocol_write', {
      question_id: '00000000-0000-4000-8000-000000000001',
      revision: 0,
      observation_ids: [
        '00000000-0000-4000-8000-000000000002',
        '00000000-0000-4000-8000-000000000003',
      ],
      direction: 'non-directional',
      compatibility_rationale: 'Authored rationale.',
    }, null)
    expect(noProtocolAgent.isError).toBe(true)
    expect(text(noProtocolAgent)).toContain('require an owning agent session')
    for (const args of [
      { action: 'create', title: 'T', question: 'Q', revision: 0 },
      { action: 'create', title: 'T' },
      { action: 'update', title: 'T' },
      { action: 'update', question_id: '00000000-0000-4000-8000-000000000000', revision: 0 },
    ]) {
      const result = await setup.call('research_question_write', args)
      expect(result.isError).toBe(true)
    }
    await dispose(setup)
  })

  it('validates every tagged observation field before calling the durable service', async () => {
    const setup = await mount()
    const created = await createQuestion(setup)
    const questionId = ResearchQuestionId(created.questionId)
    const id = '00000000-0000-4000-8000-000000000002'
    const base = {
      question_id: created.questionId,
      revision: 0,
      result_claim_id: id,
      method: { entity_id: id, source_claim_id: id, role: 'proposed' },
      dataset: {
        entity_id: id,
        source_claim_id: id,
        split: { status: 'not-applicable' },
      },
      metric: { entity_id: id, source_claim_id: id },
      value: '1',
      unit: { status: 'not-applicable' },
      value_statistic: 'single score',
      evaluation_protocol: { status: 'not-applicable' },
      uncertainty: { status: 'not-recorded' },
      conditions: { status: 'not-applicable' },
    }
    const observationWrite = vi.spyOn(setup.ctx.researchInformation, 'writeObservation')
      .mockResolvedValue({ status: 'question-not-found', questionId })
    const succeeds = async (overrides: Record<string, unknown>) => {
      expect(value(await setup.call('research_observation_write', { ...base, ...overrides })))
        .toMatchObject({ status: 'question-not-found', question_id: questionId })
    }
    const fails = async (overrides: Record<string, unknown>) => {
      expect((await setup.call('research_observation_write', { ...base, ...overrides })).isError)
        .toBe(true)
    }

    await succeeds({
      method: { entity_id: id, source_claim_id: id, role: 'other', other_role: 'ablation' },
    })
    await succeeds({
      uncertainty: { status: 'reported', kind: 'standard-deviation', magnitude: '0.1' },
    })
    await succeeds({
      uncertainty: { status: 'reported', kind: 'standard-error', magnitude: '0.1' },
    })
    await succeeds({
      uncertainty: { status: 'reported', kind: 'unspecified-plus-minus', magnitude: '0.1' },
    })
    await succeeds({
      uncertainty: { status: 'reported', kind: 'range', lower: '0', upper: '2' },
    })
    await succeeds({
      uncertainty: {
        status: 'reported',
        kind: 'confidence-interval',
        lower: '0',
        upper: '2',
        confidence_level_percent: '95',
      },
    })

    await fails({ method: { entity_id: id, source_claim_id: id, role: 'other' } })
    await fails({
      method: { entity_id: id, source_claim_id: id, role: 'proposed', other_role: 'invalid' },
    })
    await fails({
      dataset: {
        entity_id: id,
        source_claim_id: id,
        split: { status: 'reported', source_claim_id: id },
      },
    })
    await fails({
      dataset: {
        entity_id: id,
        source_claim_id: id,
        split: { status: 'reported', value: 'test' },
      },
    })
    await fails({
      dataset: {
        entity_id: id,
        source_claim_id: id,
        split: { status: 'not-applicable', value: 'invalid' },
      },
    })
    await fails({ unit: { status: 'reported' } })
    await fails({ unit: { status: 'not-applicable', symbol: '%' } })
    await fails({ uncertainty: { status: 'not-recorded', kind: 'range' } })
    await fails({ uncertainty: { status: 'reported' } })
    await fails({ uncertainty: { status: 'reported', kind: 'standard-error' } })
    await fails({
      uncertainty: {
        status: 'reported', kind: 'standard-error', magnitude: '0.1', lower: '0',
      },
    })
    await fails({ uncertainty: { status: 'reported', kind: 'range', upper: '2' } })
    await fails({ uncertainty: { status: 'reported', kind: 'range', lower: '0' } })
    await fails({
      uncertainty: { status: 'reported', kind: 'range', magnitude: '1', lower: '0', upper: '2' },
    })
    await fails({
      uncertainty: {
        status: 'reported',
        kind: 'range',
        lower: '0',
        upper: '2',
        confidence_level_percent: '95',
      },
    })
    await fails({
      uncertainty: { status: 'reported', kind: 'confidence-interval', lower: '0', upper: '2' },
    })
    await fails({ conditions: { status: 'reported' } })
    await fails({ conditions: { status: 'not-applicable', values: [] } })
    expect(observationWrite).toHaveBeenCalledTimes(6)
    observationWrite.mockRestore()
    await dispose(setup)
  })

  it('projects every explicit durable-service failure without hiding its reference', async () => {
    const setup = await mount()
    const created = await createQuestion(setup)
    const document = await importAndRegister(setup)
    const block = paragraph(document)
    const missingQuestion = ResearchQuestionId('00000000-0000-4000-8000-000000000010')
    const missingEvidence = ResearchEvidenceId('00000000-0000-4000-8000-000000000020')
    const missingClaim = ResearchClaimId('00000000-0000-4000-8000-000000000030')
    const missingEntity = ResearchEntityId('00000000-0000-4000-8000-000000000035')
    const missingObservation = ResearchObservationId('00000000-0000-4000-8000-000000000037')
    const otherObservation = ResearchObservationId('00000000-0000-4000-8000-000000000038')
    const missingProtocol = ResearchComparisonProtocolId('00000000-0000-4000-8000-000000000039')
    const missingSynthesis = ResearchSynthesisId('00000000-0000-4000-8000-000000000040')

    const questionWrite = vi.spyOn(setup.ctx.researchInformation, 'writeQuestion')
    questionWrite
      .mockResolvedValueOnce({ status: 'question-not-found', questionId: missingQuestion })
      .mockResolvedValueOnce({ status: 'capacity', resource: 'questions' })
    expect(value(await setup.call('research_question_write', {
      action: 'update', question_id: missingQuestion, revision: 0, title: 'Missing',
    }))).toMatchObject({ status: 'question-not-found', question_id: missingQuestion })
    expect(value(await setup.call('research_question_write', {
      action: 'create', title: 'Capacity', question: 'Capacity?',
    }))).toMatchObject({ status: 'capacity', resource: 'questions' })
    questionWrite.mockRestore()

    const evidenceWrite = vi.spyOn(setup.ctx.researchInformation, 'captureEvidence')
    evidenceWrite
      .mockResolvedValueOnce({ status: 'paper-not-found', paperId: ResearchPaperId('paper-missing') })
      .mockResolvedValueOnce({
        status: 'source-not-found',
        paperId: ResearchPaperId('paper-missing'),
        sourceVersionId: ResearchSourceVersionId('source-missing'),
      })
      .mockResolvedValueOnce({ status: 'provenance-mismatch', reason: 'block-hash' })
      .mockResolvedValueOnce({ status: 'capacity', resource: 'aggregate-bytes' })
    for (const expected of [
      { status: 'paper-not-found', paper_id: 'paper-missing' },
      { status: 'source-not-found', source_version_id: 'source-missing' },
      { status: 'provenance-mismatch', reason: 'block-hash' },
      { status: 'capacity', resource: 'aggregate-bytes' },
    ]) {
      expect(value(await setup.call('research_evidence_capture', {
        question_id: created.questionId,
        revision: 0,
        document_id: document.id,
        block_id: block.id,
      }))).toMatchObject(expected)
    }
    evidenceWrite.mockRestore()

    const claimWrite = vi.spyOn(setup.ctx.researchInformation, 'writeClaim')
    claimWrite
      .mockResolvedValueOnce({ status: 'evidence-not-found', evidenceId: missingEvidence })
      .mockResolvedValueOnce({
        status: 'source-evidence-paper-mismatch',
        paperIds: [ResearchPaperId('paper-a'), ResearchPaperId('paper-b')],
      })
      .mockResolvedValueOnce({ status: 'supersedes-claim-not-found', claimId: missingClaim })
      .mockResolvedValueOnce({ status: 'supersedes-claim-inactive', claimId: missingClaim })
      .mockResolvedValueOnce({ status: 'supersedes-claim-kind-mismatch', claimId: missingClaim })
    for (const expected of [
      { status: 'evidence-not-found', evidence_id: missingEvidence },
      {
        status: 'source-evidence-paper-mismatch',
        paper_ids: ['paper-a', 'paper-b'],
        total_papers: 2,
        paper_ids_truncated: false,
        truncated: false,
      },
      { status: 'supersedes-claim-not-found', claim_id: missingClaim },
      { status: 'supersedes-claim-inactive', claim_id: missingClaim },
      { status: 'supersedes-claim-kind-mismatch', claim_id: missingClaim },
    ]) {
      expect(value(await setup.call('research_claim_write', {
        question_id: created.questionId,
        revision: 0,
        kind: 'inference',
        facet: 'result',
        text: 'Projected failure',
        evidence_links: [],
      }))).toMatchObject(expected)
    }
    claimWrite.mockRestore()

    const entityWrite = vi.spyOn(setup.ctx.researchInformation, 'writeEntity')
    entityWrite
      .mockResolvedValueOnce({ status: 'claim-not-found', claimId: missingClaim })
      .mockResolvedValueOnce({ status: 'claim-inactive', claimId: missingClaim })
      .mockResolvedValueOnce({ status: 'entity-claim-kind-mismatch', claimId: missingClaim })
      .mockResolvedValueOnce({ status: 'entity-claim-uncited', claimId: missingClaim })
      .mockResolvedValueOnce({
        status: 'entity-claim-facet-mismatch',
        claimId: missingClaim,
        entityKind: 'method',
        claimFacet: 'dataset',
      })
      .mockResolvedValueOnce({ status: 'supersedes-entity-not-found', entityId: missingEntity })
      .mockResolvedValueOnce({ status: 'supersedes-entity-inactive', entityId: missingEntity })
      .mockResolvedValueOnce({ status: 'supersedes-entity-kind-mismatch', entityId: missingEntity })
    for (const expected of [
      { status: 'claim-not-found', claim_id: missingClaim },
      { status: 'claim-inactive', claim_id: missingClaim },
      { status: 'entity-claim-kind-mismatch', claim_id: missingClaim },
      { status: 'entity-claim-uncited', claim_id: missingClaim },
      {
        status: 'entity-claim-facet-mismatch',
        claim_id: missingClaim,
        entity_kind: 'method',
        claim_facet: 'dataset',
      },
      { status: 'supersedes-entity-not-found', entity_id: missingEntity },
      { status: 'supersedes-entity-inactive', entity_id: missingEntity },
      { status: 'supersedes-entity-kind-mismatch', entity_id: missingEntity },
    ]) {
      expect(value(await setup.call('research_entity_write', {
        question_id: created.questionId,
        revision: 0,
        kind: 'method',
        canonical_name: 'Projected entity',
        source_claim_ids: [missingClaim],
      }))).toMatchObject(expected)
    }
    entityWrite.mockRestore()

    const observationWrite = vi.spyOn(setup.ctx.researchInformation, 'writeObservation')
    observationWrite
      .mockResolvedValueOnce({
        status: 'observation-claim-not-found', claimRole: 'result', claimId: missingClaim,
      })
      .mockResolvedValueOnce({
        status: 'observation-claim-inactive', claimRole: 'method', claimId: missingClaim,
      })
      .mockResolvedValueOnce({
        status: 'observation-claim-kind-mismatch', claimRole: 'dataset', claimId: missingClaim,
      })
      .mockResolvedValueOnce({
        status: 'observation-claim-uncited', claimRole: 'metric', claimId: missingClaim,
      })
      .mockResolvedValueOnce({
        status: 'observation-claim-facet-mismatch',
        claimRole: 'result',
        claimId: missingClaim,
        claimFacet: 'method',
      })
      .mockResolvedValueOnce({
        status: 'observation-claim-paper-mismatch',
        claimRole: 'condition',
        claimId: missingClaim,
        paperId: ResearchPaperId('paper-mismatch'),
      })
      .mockResolvedValueOnce({
        status: 'observation-entity-not-found', entityRole: 'method', entityId: missingEntity,
      })
      .mockResolvedValueOnce({
        status: 'observation-entity-inactive', entityRole: 'dataset', entityId: missingEntity,
      })
      .mockResolvedValueOnce({
        status: 'observation-entity-stale',
        entityRole: 'metric',
        entityId: missingEntity,
        staleClaimIds: [missingClaim],
      })
      .mockResolvedValueOnce({
        status: 'observation-entity-kind-mismatch',
        entityRole: 'method',
        entityId: missingEntity,
        entityKind: 'dataset',
      })
      .mockResolvedValueOnce({
        status: 'observation-entity-claim-mismatch',
        entityRole: 'method',
        entityId: missingEntity,
        claimId: missingClaim,
      })
      .mockResolvedValueOnce({
        status: 'supersedes-observation-not-found', observationId: missingObservation,
      })
      .mockResolvedValueOnce({
        status: 'supersedes-observation-inactive', observationId: missingObservation,
      })
      .mockResolvedValueOnce({
        status: 'supersedes-observation-paper-mismatch', observationId: missingObservation,
      })
    const observationArgs = {
      question_id: created.questionId,
      revision: 0,
      result_claim_id: missingClaim,
      method: { entity_id: missingEntity, source_claim_id: missingClaim, role: 'proposed' },
      dataset: {
        entity_id: missingEntity,
        source_claim_id: missingClaim,
        split: { status: 'not-applicable' },
      },
      metric: { entity_id: missingEntity, source_claim_id: missingClaim },
      value: '1',
      unit: { status: 'not-applicable' },
      value_statistic: 'single score',
      evaluation_protocol: { status: 'not-applicable' },
      uncertainty: { status: 'not-recorded' },
      conditions: { status: 'not-applicable' },
    } as const
    for (const expected of [
      { status: 'observation-claim-not-found', claim_role: 'result', claim_id: missingClaim },
      { status: 'observation-claim-inactive', claim_role: 'method', claim_id: missingClaim },
      { status: 'observation-claim-kind-mismatch', claim_role: 'dataset', claim_id: missingClaim },
      { status: 'observation-claim-uncited', claim_role: 'metric', claim_id: missingClaim },
      {
        status: 'observation-claim-facet-mismatch',
        claim_role: 'result',
        claim_id: missingClaim,
        claim_facet: 'method',
      },
      {
        status: 'observation-claim-paper-mismatch',
        claim_role: 'condition',
        claim_id: missingClaim,
        paper_id: 'paper-mismatch',
      },
      { status: 'observation-entity-not-found', entity_role: 'method', entity_id: missingEntity },
      { status: 'observation-entity-inactive', entity_role: 'dataset', entity_id: missingEntity },
      {
        status: 'observation-entity-stale',
        entity_role: 'metric',
        entity_id: missingEntity,
        stale_claim_ids: [missingClaim],
        total_stale_claims: 1,
        stale_claim_ids_truncated: false,
      },
      {
        status: 'observation-entity-kind-mismatch',
        entity_role: 'method',
        entity_id: missingEntity,
        entity_kind: 'dataset',
      },
      {
        status: 'observation-entity-claim-mismatch',
        entity_role: 'method',
        entity_id: missingEntity,
        claim_id: missingClaim,
      },
      { status: 'supersedes-observation-not-found', observation_id: missingObservation },
      { status: 'supersedes-observation-inactive', observation_id: missingObservation },
      { status: 'supersedes-observation-paper-mismatch', observation_id: missingObservation },
    ]) {
      expect(value(await setup.call('research_observation_write', observationArgs))).toMatchObject(expected)
    }
    observationWrite.mockRestore()

    const protocolWrite = vi.spyOn(setup.ctx.researchInformation, 'writeComparisonProtocol')
    protocolWrite
      .mockResolvedValueOnce({ status: 'observation-not-found', observationId: missingObservation })
      .mockResolvedValueOnce({ status: 'observation-inactive', observationId: missingObservation })
      .mockResolvedValueOnce({ status: 'observation-stale', observationId: missingObservation })
      .mockResolvedValueOnce({
        status: 'comparison-insufficient-papers',
        paperIds: [ResearchPaperId('paper-only')],
      })
      .mockResolvedValueOnce({
        status: 'comparison-field-not-recorded',
        observationId: missingObservation,
        dimension: 'unit',
      })
      .mockResolvedValueOnce({
        status: 'comparison-dimension-mismatch',
        observationId: otherObservation,
        dimension: 'must-match-conditions',
      })
      .mockResolvedValueOnce({
        status: 'reference-observation-not-member', observationId: missingObservation,
      })
      .mockResolvedValueOnce({
        status: 'supersedes-comparison-protocol-not-found', comparisonProtocolId: missingProtocol,
      })
      .mockResolvedValueOnce({
        status: 'supersedes-comparison-protocol-inactive', comparisonProtocolId: missingProtocol,
      })
    const protocolArgs = {
      question_id: created.questionId,
      revision: 0,
      observation_ids: [missingObservation, otherObservation],
      direction: 'non-directional',
      compatibility_rationale: 'Projected protocol failure.',
    } as const
    for (const expected of [
      { status: 'observation-not-found', observation_id: missingObservation },
      { status: 'observation-inactive', observation_id: missingObservation },
      { status: 'observation-stale', observation_id: missingObservation },
      {
        status: 'comparison-insufficient-papers',
        paper_ids: ['paper-only'],
        total_papers: 1,
        paper_ids_truncated: false,
      },
      {
        status: 'comparison-field-not-recorded',
        observation_id: missingObservation,
        dimension: 'unit',
      },
      {
        status: 'comparison-dimension-mismatch',
        observation_id: otherObservation,
        dimension: 'must-match-conditions',
      },
      { status: 'reference-observation-not-member', observation_id: missingObservation },
      {
        status: 'supersedes-comparison-protocol-not-found',
        comparison_protocol_id: missingProtocol,
      },
      {
        status: 'supersedes-comparison-protocol-inactive',
        comparison_protocol_id: missingProtocol,
      },
    ]) {
      expect(value(await setup.call('research_comparison_protocol_write', protocolArgs)))
        .toMatchObject(expected)
    }
    protocolWrite.mockRestore()

    const synthesisWrite = vi.spyOn(setup.ctx.researchInformation, 'writeSynthesis')
    synthesisWrite
      .mockResolvedValueOnce({ status: 'claim-not-found', claimId: missingClaim })
      .mockResolvedValueOnce({ status: 'claim-inactive', claimId: missingClaim })
      .mockResolvedValueOnce({ status: 'source-summary-uncited', findingIndex: 2 })
      .mockResolvedValueOnce({
        status: 'source-summary-claim-kind-mismatch', findingIndex: 3, claimId: missingClaim,
      })
      .mockResolvedValueOnce({
        status: 'comparison-protocol-not-found',
        findingIndex: 4,
        comparisonProtocolId: missingProtocol,
      })
      .mockResolvedValueOnce({
        status: 'comparison-protocol-inactive',
        findingIndex: 5,
        comparisonProtocolId: missingProtocol,
      })
      .mockResolvedValueOnce({
        status: 'comparison-protocol-stale',
        findingIndex: 6,
        comparisonProtocolId: missingProtocol,
      })
      .mockResolvedValueOnce({
        status: 'comparison-protocol-finding-kind-mismatch',
        findingIndex: 7,
        comparisonProtocolId: missingProtocol,
      })
      .mockResolvedValueOnce({
        status: 'comparison-protocol-result-claim-missing',
        findingIndex: 8,
        comparisonProtocolId: missingProtocol,
        claimId: missingClaim,
      })
      .mockResolvedValueOnce({ status: 'supersedes-synthesis-not-found', synthesisId: missingSynthesis })
      .mockResolvedValueOnce({ status: 'supersedes-synthesis-inactive', synthesisId: missingSynthesis })
    for (const expected of [
      { status: 'claim-not-found', claim_id: missingClaim },
      { status: 'claim-inactive', claim_id: missingClaim },
      { status: 'source-summary-uncited', finding_index: 2 },
      { status: 'source-summary-claim-kind-mismatch', finding_index: 3, claim_id: missingClaim },
      {
        status: 'comparison-protocol-not-found',
        finding_index: 4,
        comparison_protocol_id: missingProtocol,
      },
      {
        status: 'comparison-protocol-inactive',
        finding_index: 5,
        comparison_protocol_id: missingProtocol,
      },
      {
        status: 'comparison-protocol-stale',
        finding_index: 6,
        comparison_protocol_id: missingProtocol,
      },
      {
        status: 'comparison-protocol-finding-kind-mismatch',
        finding_index: 7,
        comparison_protocol_id: missingProtocol,
      },
      {
        status: 'comparison-protocol-result-claim-missing',
        finding_index: 8,
        comparison_protocol_id: missingProtocol,
        claim_id: missingClaim,
      },
      { status: 'supersedes-synthesis-not-found', synthesis_id: missingSynthesis },
      { status: 'supersedes-synthesis-inactive', synthesis_id: missingSynthesis },
    ]) {
      expect(value(await setup.call('research_synthesis_write', {
        question_id: created.questionId,
        revision: 0,
        findings: [{
          kind: 'inference',
          stance: 'open-question',
          text: 'Projected',
          claim_ids: [],
          comparison_protocol_ids: [missingProtocol],
        }],
      }))).toMatchObject(expected)
    }
    expect(synthesisWrite.mock.calls[0]?.[0].findings[0]?.comparisonProtocolIds).toEqual([
      missingProtocol,
    ])
    synthesisWrite.mockRestore()
    await dispose(setup)
  })

  it('bounds source-evidence paper mismatch references with recovery metadata', async () => {
    const setup = await mount({ toolConfig: { maxReferencesPerResult: 1 } })
    const created = await createQuestion(setup)
    const claimWrite = vi.spyOn(setup.ctx.researchInformation, 'writeClaim').mockResolvedValueOnce({
      status: 'source-evidence-paper-mismatch',
      paperIds: [
        ResearchPaperId('paper-a'),
        ResearchPaperId('paper-b'),
        ResearchPaperId('paper-c'),
      ],
    })
    expect(value(await setup.call('research_claim_write', {
      question_id: created.questionId,
      revision: 0,
      kind: 'inference',
      facet: 'result',
      text: 'Projected mismatch',
      evidence_links: [],
    }))).toEqual({
      status: 'source-evidence-paper-mismatch',
      paper_ids: ['paper-a'],
      total_papers: 3,
      paper_ids_truncated: true,
      truncated: true,
    })
    claimWrite.mockRestore()
    await dispose(setup)
  })

  it('rejects malformed opaque ids and unsafe revisions before service calls', async () => {
    const setup = await mount()
    const created = await createQuestion(setup)
    const calls: Array<[string, Record<string, unknown>]> = [
      ['research_question_get', { question_id: 'bad-question' }],
      ['research_question_write', {
        action: 'update', question_id: created.questionId, revision: -1, title: 'Bad revision',
      }],
      ['research_evidence_capture', {
        question_id: created.questionId,
        revision: 0,
        document_id: 'bad-document',
        block_id: `block:${'0'.repeat(64)}`,
      }],
      ['research_evidence_capture', {
        question_id: created.questionId,
        revision: 0,
        document_id: `sha256:${'0'.repeat(64)}`,
        block_id: 'bad-block',
      }],
      ['research_note_write', {
        question_id: created.questionId,
        revision: 0,
        kind: 'note',
        text: 'Bad evidence id',
        evidence_id: 'bad-evidence',
      }],
      ['research_note_write', {
        question_id: created.questionId,
        revision: 0,
        kind: 'note',
        text: 'Bad supersession',
        evidence_id: '00000000-0000-4000-8000-000000000002',
        supersedes_note_id: 'bad-note',
      }],
      ['research_claim_write', {
        question_id: created.questionId,
        revision: 0,
        kind: 'inference',
        facet: 'result',
        text: 'Bad evidence id',
        evidence_links: [{ evidence_id: 'bad-evidence', relation: 'supports' }],
      }],
      ['research_claim_write', {
        question_id: created.questionId,
        revision: 0,
        kind: 'inference',
        facet: 'result',
        text: 'Bad supersession',
        evidence_links: [],
        supersedes_claim_id: 'bad-claim',
      }],
      ['research_entity_write', {
        question_id: created.questionId,
        revision: 0,
        kind: 'method',
        canonical_name: 'Bad source claim',
        source_claim_ids: ['bad-claim'],
      }],
      ['research_entity_write', {
        question_id: created.questionId,
        revision: 0,
        kind: 'method',
        canonical_name: 'Bad predecessor',
        source_claim_ids: ['00000000-0000-4000-8000-000000000002'],
        supersedes_entity_ids: ['bad-entity'],
      }],
      ['research_synthesis_write', {
        question_id: created.questionId,
        revision: 0,
        findings: [{
          kind: 'inference', stance: 'open-question', text: 'Bad claim', claim_ids: ['bad-claim'],
        }],
      }],
      ['research_synthesis_write', {
        question_id: created.questionId,
        revision: 0,
        findings: [{
          kind: 'inference',
          stance: 'open-question',
          text: 'Bad comparison protocol',
          claim_ids: [],
          comparison_protocol_ids: ['bad-comparison-protocol'],
        }],
      }],
      ['research_synthesis_write', {
        question_id: created.questionId,
        revision: 0,
        findings: [{ kind: 'inference', stance: 'open-question', text: 'Bad synthesis', claim_ids: [] }],
        supersedes_synthesis_id: 'bad-synthesis',
      }],
    ]
    for (const [name, args] of calls) {
      const result = await setup.call(name, args)
      expect(result.isError, name).toBe(true)
    }
    await dispose(setup)
  })

  it('rejects invalid research-question page arguments before projection', async () => {
    const setup = await mount({ toolConfig: { maxItemsPerResult: 2 } })
    const created = await createQuestion(setup)
    const invalidArguments: Array<Record<string, unknown>> = [
      { offset: -1 },
      { offset: 1.5 },
      { offset: Number.MAX_SAFE_INTEGER + 1 },
      { max_items: 0 },
      { max_items: 1.5 },
      { max_items: 3 },
      { finding_offset: -1 },
      { finding_offset: 1.5 },
      { finding_offset: Number.MAX_SAFE_INTEGER + 1 },
      { reference_offset: -1 },
      { reference_offset: 1.5 },
      { reference_offset: Number.MAX_SAFE_INTEGER + 1 },
    ]
    for (const args of invalidArguments) {
      const result = await setup.call('research_question_get', {
        question_id: created.questionId,
        ...args,
      })
      expect(result.isError, JSON.stringify(args)).toBe(true)
    }
    expect((await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'overview',
      evidence_id: '00000000-0000-4000-8000-000000000001',
    })).isError).toBe(true)
    expect((await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'overview',
      entity_kind: 'method',
    })).isError).toBe(true)
    expect((await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'overview',
      entity_query: 'retrieval',
    })).isError).toBe(true)
    for (const [field, fieldValue] of [
      ['observation_id', '00000000-0000-4000-8000-000000000001'],
      ['paper_id', '00000000-0000-4000-8000-000000000001'],
      ['method_entity_id', '00000000-0000-4000-8000-000000000001'],
      ['dataset_entity_id', '00000000-0000-4000-8000-000000000001'],
      ['metric_entity_id', '00000000-0000-4000-8000-000000000001'],
      ['comparison_protocol_id', '00000000-0000-4000-8000-000000000001'],
    ] as const) {
      expect((await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'overview',
        [field]: fieldValue,
      })).isError, field).toBe(true)
    }
    expect((await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'notes',
      evidence_id: 'bad-evidence',
    })).isError).toBe(true)
    for (const [view, field] of [
      ['observations', 'observation_id'],
      ['observations', 'paper_id'],
      ['observations', 'method_entity_id'],
      ['observations', 'dataset_entity_id'],
      ['observations', 'metric_entity_id'],
      ['comparisons', 'comparison_protocol_id'],
    ] as const) {
      expect((await setup.call('research_question_get', {
        question_id: created.questionId,
        view,
        [field]: 'malformed-id',
      })).isError, field).toBe(true)
    }
    expect((await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'overview',
      text_offset: 0,
      max_items: 1,
    })).isError).toBe(true)
    expect((await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'notes',
      text_offset: 0,
      max_items: 2,
    })).isError).toBe(true)
    for (const textOffset of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect((await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'notes',
        text_offset: textOffset,
        max_items: 1,
      })).isError).toBe(true)
    }
    expect((await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'overview',
      decimal_field: 'value',
    })).isError).toBe(true)
    expect((await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'observations',
      decimal_text_offset: 0,
    })).isError).toBe(true)
    expect((await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'observations',
      decimal_field: 'value',
      max_items: 1,
    })).isError).toBe(true)
    expect((await setup.call('research_question_get', {
      question_id: created.questionId,
      view: 'observations',
      observation_id: '00000000-0000-4000-8000-000000000001',
      decimal_field: 'value',
      max_items: 2,
    })).isError).toBe(true)
    for (const decimalTextOffset of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect((await setup.call('research_question_get', {
        question_id: created.questionId,
        view: 'observations',
        observation_id: '00000000-0000-4000-8000-000000000001',
        decimal_field: 'value',
        decimal_text_offset: decimalTextOffset,
        max_items: 1,
      })).isError).toBe(true)
    }
    await dispose(setup)
  })

  it('bounds list, overview, and matrix projections with explicit truncation', async () => {
    const setup = await mount({
      toolConfig: {
        maxListResults: 1,
        maxItemsPerResult: 1,
        maxReferencesPerResult: 1,
        maxOutputTextChars: 256,
        maxQueryChars: 5,
      },
    })
    const first = await createQuestion(setup, 'A'.repeat(300))
    await createQuestion(setup, 'Second')
    const oneCharacter = await createQuestion(setup, 'B'.repeat(255))
    expect(oneCharacter.output.question).toMatchObject({ question: '…', question_truncated: true })
    const firstDocument = await importAndRegister(setup, Uint8Array.of(11))
    const firstBlock = paragraph(firstDocument)
    const firstEvidence = value(await setup.call('research_evidence_capture', {
      question_id: first.questionId,
      revision: 0,
      document_id: firstDocument.id,
      block_id: firstBlock.id,
    }))
    const firstClaim = value(await setup.call('research_claim_write', {
      question_id: first.questionId,
      revision: 1,
      kind: 'source-statement',
      facet: 'result',
      text: 'First source result',
      evidence_links: [{ evidence_id: firstEvidence.evidence_id, relation: 'supports' }],
    }))
    const secondDocument = await importAndRegister(setup, Uint8Array.of(12))
    const secondBlock = paragraph(secondDocument)
    const secondEvidence = value(await setup.call('research_evidence_capture', {
      question_id: first.questionId,
      revision: 2,
      document_id: secondDocument.id,
      block_id: secondBlock.id,
    }))
    await setup.call('research_claim_write', {
      question_id: first.questionId,
      revision: 3,
      kind: 'source-statement',
      facet: 'result',
      text: 'Second source result',
      evidence_links: [{ evidence_id: secondEvidence.evidence_id, relation: 'supports' }],
    })
    expect(firstClaim.status).toBe('created')
    expect(value(await setup.call('research_question_list', {}))).toMatchObject({
      total_matches: 3, truncated: true,
    })
    const overview = value(await setup.call('research_question_get', {
      question_id: first.questionId,
      view: 'overview',
    }))
    expect(overview).toMatchObject({ truncated: true, question: { title_truncated: true } })
    const matrix = value(await setup.call('research_question_get', {
      question_id: first.questionId,
      view: 'matrix',
    }))
    expect(matrix).toMatchObject({ truncated: true, matrix: { references_truncated: true } })
    const tooLong = await setup.call('research_question_list', { query: '123456' })
    expect(tooLong.isError).toBe(true)
    const emptyQuery = await setup.call('research_question_list', { query: '   ' })
    expect(emptyQuery.isError).toBe(true)
    const tooLongEntityQuery = await setup.call('research_question_get', {
      question_id: first.questionId,
      view: 'entities',
      entity_query: '123456',
    })
    expect(tooLongEntityQuery.isError).toBe(true)
    const emptyEntityQuery = await setup.call('research_question_get', {
      question_id: first.questionId,
      view: 'entities',
      entity_query: '   ',
    })
    expect(emptyEntityQuery.isError).toBe(true)
    const tooMany = await setup.call('research_question_list', { max_results: 2 })
    expect(tooMany.isError).toBe(true)
    const zeroResults = await setup.call('research_question_list', { max_results: 0 })
    expect(zeroResults.isError).toBe(true)
    await dispose(setup)
  })

  it('charges query, page labels, section paths, and authorship to the shared text budget', async () => {
    const parserState = {
      result: parseResult({ headingText: 'H', text: 'B', pageLabel: false }),
    }
    const setup = await mount({
      parserState,
      toolConfig: {
        maxItemsPerResult: 1,
        maxReferencesPerResult: 1,
        maxOutputTextChars: 256,
        maxQueryChars: 500,
      },
    })
    const authorId = 'a'.repeat(400)
    const owner = { id: authorId } as unknown as Agent
    const created = value(await setup.call('research_question_write', {
      action: 'create',
      title: 'T',
      question: 'Q',
    }, owner))
    const questionId = created.question_id as string

    const firstDocument = await importAndRegister(setup, Uint8Array.of(21))
    const firstEvidence = value(await setup.call('research_evidence_capture', {
      question_id: questionId,
      revision: 0,
      document_id: firstDocument.id,
      block_id: paragraph(firstDocument).id,
    }, owner))

    const sectionText = 's'.repeat(400)
    parserState.result = parseResult({ headingText: sectionText, text: 'B', pageLabel: false })
    const secondDocument = await importAndRegister(setup, Uint8Array.of(22))
    const secondEvidence = value(await setup.call('research_evidence_capture', {
      question_id: questionId,
      revision: firstEvidence.revision,
      document_id: secondDocument.id,
      block_id: paragraph(secondDocument).id,
    }, owner))

    const pageLabel = 'p'.repeat(400)
    parserState.result = parseResult({
      headingText: 'H', secondHeadingText: 'Nested', text: 'B', pageLabel,
    })
    const thirdDocument = await importAndRegister(setup, Uint8Array.of(23))
    const thirdEvidence = value(await setup.call('research_evidence_capture', {
      question_id: questionId,
      revision: secondEvidence.revision,
      document_id: thirdDocument.id,
      block_id: paragraph(thirdDocument).id,
    }, owner))
    const claim = value(await setup.call('research_claim_write', {
      question_id: questionId,
      revision: thirdEvidence.revision,
      kind: 'inference',
      facet: 'aim',
      text: 'C',
      evidence_links: [],
    }, owner))
    await setup.call('research_synthesis_write', {
      question_id: questionId,
      revision: claim.revision,
      findings: [{
        kind: 'inference', stance: 'open-question', text: 'F', claim_ids: [],
      }],
    }, owner)

    const authorPage = await setup.call('research_question_get', {
      question_id: questionId,
      offset: 0,
      max_items: 1,
    })
    const authorEvidence = (value(authorPage).evidence as Array<Record<string, unknown>>)[0]!
    expect(value(authorPage).truncated).toBe(true)
    expect(authorEvidence).toMatchObject({
      section_path: ['H'],
      block_text: 'B',
      created_by_truncated: true,
    })
    expect(authorEvidence.created_by).toHaveLength(254)
    expect(String(authorEvidence.created_by)).toMatch(/^agent:a+…$/u)
    expect(text(authorPage)).toHaveLength(256)
    expect(JSON.stringify(authorPage.meta)).not.toContain(authorId)

    const sectionPage = await setup.call('research_question_get', {
      question_id: questionId,
      offset: 1,
      max_items: 1,
    })
    const sectionEvidence = (value(sectionPage).evidence as Array<Record<string, unknown>>)[0]!
    expect(value(sectionPage).truncated).toBe(true)
    expect(sectionEvidence).toMatchObject({
      section_path_truncated: true,
      block_text: '',
      block_text_truncated: true,
      created_by: '',
      created_by_truncated: true,
    })
    expect((sectionEvidence.section_path as string[])[0]).toHaveLength(256)
    expect(JSON.stringify(sectionPage.meta)).not.toContain(sectionText)

    const labelPage = await setup.call('research_question_get', {
      question_id: questionId,
      offset: 2,
      max_items: 1,
    })
    const labelEvidence = (value(labelPage).evidence as Array<Record<string, unknown>>)[0]!
    expect(value(labelPage).truncated).toBe(true)
    expect(labelEvidence).toMatchObject({
      page_label_truncated: true,
      section_path: [''],
      section_path_truncated: true,
      created_by_truncated: true,
    })
    expect(labelEvidence.page_label).toHaveLength(256)
    expect(JSON.stringify(labelPage.meta)).not.toContain(pageLabel)

    const claimPage = await setup.call('research_question_get', {
      question_id: questionId,
      offset: 3,
      max_items: 1,
    })
    const projectedClaim = (value(claimPage).claims as Array<Record<string, unknown>>)[0]!
    expect(value(claimPage).truncated).toBe(true)
    expect(projectedClaim).toMatchObject({ text: 'C', created_by_truncated: true })
    expect(projectedClaim.created_by).toHaveLength(255)
    expect(JSON.stringify(claimPage.meta)).not.toContain(authorId)

    const synthesisPage = await setup.call('research_question_get', {
      question_id: questionId,
      offset: 4,
      max_items: 1,
    })
    const projectedSynthesis = (value(synthesisPage).syntheses as Array<Record<string, unknown>>)[0]!
    expect(value(synthesisPage).truncated).toBe(true)
    expect(projectedSynthesis).toMatchObject({ created_by_truncated: true })
    expect(projectedSynthesis.created_by).toHaveLength(255)
    expect(JSON.stringify(synthesisPage.meta)).not.toContain(authorId)

    const query = 'q'.repeat(300)
    const list = await setup.call('research_question_list', { query })
    expect(value(list)).toMatchObject({
      query_truncated: true,
      questions: [],
      total_matches: 0,
      truncated: true,
    })
    expect(value(list).query).toHaveLength(256)
    expect(JSON.stringify(list.meta)).not.toContain(query)
    await dispose(setup)
  })

  it('rejects invalid configuration values at composition', async () => {
    const setup = await mount()
    expect(() => {
      ResearchInformationTools.apply(setup.ctx, { maxListResults: 0 })
    }).toThrow(
      'maxListResults must be a positive safe integer',
    )
    expect(() => {
      ResearchInformationTools.apply(setup.ctx, { maxOutputTextChars: 255 })
    }).toThrow(
      'maxOutputTextChars must be at least 256',
    )
    expect(() => {
      ResearchInformationTools.apply(setup.ctx, { maxReviewTextChars: 255 })
    }).toThrow(
      'maxReviewTextChars must be at least 256',
    )
    const promptSection = vi.spyOn(setup.ctx.systemPrompt, 'section').mockReturnValue(() => {})
    const toolRegister = vi.spyOn(setup.ctx.tools, 'register').mockReturnValue(() => {})
    ResearchInformationTools.apply(setup.ctx)
    expect(promptSection).toHaveBeenCalledTimes(2)
    expect(toolRegister).toHaveBeenCalledTimes(11)
    promptSection.mockRestore()
    toolRegister.mockRestore()
    await dispose(setup)
  })
})

it('projects human rejection and replacement approval through the logged question tool', async () => {
  const setup = await mount()
  try {
    const question = await createQuestion(setup)
    const written = value(await setup.call('research_claim_write', {
      question_id: question.questionId, revision: question.revision,
      kind: 'inference', facet: 'result', text: 'A candidate inference', evidence_links: [],
    }))
    const initial = value(await setup.call('research_question_get', { question_id: question.questionId }))
    expect(initial).toMatchObject({ claims: [{ active: true, review_status: 'unreviewed' }] })
    const current = setup.ctx.researchInformation.get(ResearchQuestionId(question.questionId))!
    const rejected = await setup.ctx.researchInformation.reviewClaim({ questionId: current.id, expectedRevision: current.revision,
      claimId: ResearchClaimId(written.claim_id as string), decision: 'rejected', evidenceSupport: 'unsupported',
      rationale: 'The captured material does not support this inference.', qualifications: 'Needs a controlled comparison.', counterEvidenceIds: [],
      author: { kind: 'researcher', id: ResearchAuthorId('local-reviewer') } })
    if (rejected.status !== 'created') throw new Error(rejected.status)
    const afterRejection = value(await setup.call('research_question_get', { question_id: current.id }))
    expect(afterRejection).toMatchObject({ claims: [{ active: true, review_status: 'rejected', latest_review: {
      decision: 'rejected', evidence_support: 'unsupported', rationale: 'The captured material does not support this inference.',
      qualifications: 'Needs a controlled comparison.', created_by: 'researcher:local-reviewer',
    } }] })
    const revised = await setup.ctx.researchInformation.reviewClaim({ questionId: current.id, expectedRevision: rejected.question.revision,
      claimId: ResearchClaimId(written.claim_id as string), decision: 'revised', evidenceSupport: 'uncertain',
      rationale: 'Retain it only as an open hypothesis.', counterEvidenceIds: [],
      replacement: { text: 'A hypothesis requiring further evidence', evidenceLinks: [] },
      author: { kind: 'researcher', id: ResearchAuthorId('local-reviewer') } })
    if (revised.status !== 'created') throw new Error(revised.status)
    const output = value(await setup.call('research_question_get', { question_id: current.id }))
    expect(output).toMatchObject({ claims: [
      { active: false, review_status: 'replaced', latest_review: { decision: 'revised' } },
      { active: true, review_status: 'accepted-after-revision', latest_review: { evidence_support: 'uncertain' } },
    ] })
  } finally { await dispose(setup) }
})
