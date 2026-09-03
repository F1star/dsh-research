import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import ResearchDocumentRuntime, {
  type ResearchDocument,
  type ResearchDocumentParseResult,
  type ResearchDocumentParser,
} from '../../src/research-document/index.ts'
import ResearchLibrary, {
  type Config as LibraryConfig,
} from '../../src/research-library/index.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../helpers/memory-backend.ts'
import * as LibraryTools from '../../src/tool-research-library/index.ts'

const signal = new AbortController().signal
let callCounter = 0

function parseResult(options: {
  parserVersion?: string
  title?: string
  omitTitle?: boolean
  extraction?: ResearchDocumentParseResult['extraction']
} = {}): ResearchDocumentParseResult {
  const extraction = options.extraction ?? { text: 'native', layout: 'approximate' }
  return {
    parserVersion: options.parserVersion ?? 'fixture-v1',
    ...(options.omitTitle === true
      ? {}
      : { title: options.title === undefined ? 'Runtime Paper' : options.title }),
    extraction,
    pages: [{
      pageIndex: 0,
      width: 612,
      height: 792,
      blocks: extraction.text === 'none' ? [] : [{
        kind: 'paragraph',
        text: 'Exact evidence.',
        bbox: { x: 0.1, y: 0.2, width: 0.5, height: 0.04 },
      }],
    }],
  }
}

function parser(id: string, result: ResearchDocumentParseResult): ResearchDocumentParser {
  return {
    id,
    available: () => true,
    supports: mediaType => mediaType === 'application/pdf',
    parse: () => Promise.resolve(result),
  }
}

async function mount(options: {
  pool?: MemoryMediaPool
  libraryConfig?: LibraryConfig
  toolConfig?: LibraryTools.Config
  parserId?: string
  parserResult?: ResearchDocumentParseResult
} = {}) {
  const pool = options.pool ?? new MemoryMediaPool()
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  const libraryFiber = await ctx.plugin(ResearchLibrary, options.libraryConfig ?? {})
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  const documentFiber = await ctx.plugin(ResearchDocumentRuntime, {})
  ctx.researchDocuments.registerParser(parser(
    options.parserId ?? 'fixture-parser',
    options.parserResult ?? parseResult(),
  ))
  const toolFiber = await ctx.plugin(LibraryTools, options.toolConfig ?? {})
  return {
    ctx,
    pool,
    libraryFiber,
    documentFiber,
    toolFiber,
    call: (name: string, args: unknown) => ctx.tools.execute({
      signal,
      callId: CallId(`library-call-${++callCounter}`),
      name,
      arguments: args,
    }),
    importDocument: (bytes = Uint8Array.of(1, 2, 3)): Promise<ResearchDocument> =>
      ctx.researchDocuments.import({ bytes, mediaType: 'application/pdf' }),
  }
}

async function dispose(setup: Awaited<ReturnType<typeof mount>>): Promise<void> {
  await setup.toolFiber.dispose()
  await setup.documentFiber.dispose()
  await setup.libraryFiber.dispose()
}

function value(result: ToolExecutionResult): Record<string, unknown> {
  expect(result.isError).toBe(false)
  if (result.isError) throw new Error('expected successful tool result')
  return result.value as Record<string, unknown>
}

function text(result: ToolExecutionResult): string {
  return result.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

async function registerDocument(
  setup: Awaited<ReturnType<typeof mount>>,
  args: Record<string, unknown> = {},
  bytes = Uint8Array.of(1, 2, 3),
): Promise<{ result: ToolExecutionResult; output: Record<string, unknown>; document: ResearchDocument }> {
  const document = await setup.importDocument(bytes)
  const result = await setup.call('paper_library_register', { document_id: document.id, ...args })
  return { result, output: value(result), document }
}

function projectedPaper(output: Record<string, unknown>): Record<string, unknown> {
  return output.paper as Record<string, unknown>
}

describe('research-library tool composition', () => {
  it('registers the four-tool workflow, stable prompt guidance, and generic render intents', async () => {
    const setup = await mount()
    expect(setup.ctx.tools.schemas().map(schema => schema.name)).toEqual([
      'paper_library_register',
      'paper_library_list',
      'paper_library_get',
      'paper_library_alias',
    ])
    const prompt = renderPrompt(await setup.ctx.systemPrompt.assemble())
    expect(prompt).toContain('paper_import before paper_library_register')
    expect(prompt).toContain('last_observed_state=imported is historical')
    expect(prompt).toContain('possible_duplicate_ids')

    expect(setup.ctx.tools.get('paper_library_list')?.isConcurrencySafe?.({})).toBe(true)
    expect(setup.ctx.tools.get('paper_library_get')?.isConcurrencySafe?.({ paper_id: 'x' })).toBe(true)
    expect(setup.ctx.tools.get('paper_library_register')?.presentCall?.({})).toEqual({
      card: 'generic', title: 'Register paper in library', kind: 'edit',
    })
    expect(setup.ctx.tools.get('paper_library_list')?.presentCall?.({})).toEqual({
      card: 'generic', title: 'List paper library', kind: 'read',
    })
    expect(setup.ctx.tools.get('paper_library_list')?.presentCall?.({ query: 'alpha' })).toEqual({
      card: 'generic', title: 'Search paper library: alpha', kind: 'search', rawInput: 'alpha',
    })
    expect(setup.ctx.tools.get('paper_library_alias')?.presentCall?.({
      action: 'add', kind: 'doi', paper_id: 'short', value: '10.1/x',
    })).toEqual({
      card: 'generic', title: 'Add doi alias for short', kind: 'edit', rawInput: '10.1/x',
    })
    expect(setup.ctx.tools.get('paper_library_get')?.presentCall?.({ paper_id: 'short' })).toEqual({
      card: 'generic', title: 'Read library paper short', kind: 'read',
    })
    expect(setup.ctx.tools.get('paper_library_alias')?.presentCall?.({
      action: 'remove', kind: 'arxiv', paper_id: 'short', value: '2608.1',
    })).toMatchObject({ title: 'Remove arxiv alias for short' })
  })

  it('registers a trusted runtime observation and returns tagged readable projections', async () => {
    const setup = await mount()
    const { result, output, document } = await registerDocument(setup, {
      title: 'Declared Paper',
      authors: ['Ada', 'Grace'],
      year: 2026,
      venue: 'HarnessConf',
      doi: 'DOI:10.1000/TOOL',
      arxiv_id: 'arXiv:2608.001v1',
      source_alias: 'submitted PDF',
    })
    expect(output.status).toBe('created')
    expect(output.source_version_id).toEqual(expect.any(String))
    const paper = projectedPaper(output)
    expect(paper).toMatchObject({
      metadata: {
        title: { value: 'Declared Paper', origin: 'declared', value_truncated: false },
        authors: { total_values: 2, origin: 'declared', truncated: false },
        year: { value: 2026, origin: 'declared' },
        venue: { value: 'HarnessConf', origin: 'declared', value_truncated: false },
      },
      external_ids: [
        { kind: 'doi', value: '10.1000/tool', value_truncated: false, origin: 'declared' },
        { kind: 'arxiv', value: '2608.001v1', value_truncated: false, origin: 'declared' },
      ],
      acquisition_state: 'imported',
      last_observed_state: 'imported',
      current_runtime_coverage: 'readable',
      total_sources: 1,
      sources: [{
        document_id: document.id,
        last_observed_state: 'imported',
        current_runtime_coverage: 'readable',
        aliases: [{ value: 'submitted PDF', value_truncated: false, origin: 'declared' }],
        observations: [{
          parser_id: 'fixture-parser',
          parser_id_truncated: false,
          parser_version: 'fixture-v1',
          parser_version_truncated: false,
          media_type: 'application/pdf',
          media_type_truncated: false,
          document_title: 'Runtime Paper',
          extraction: { text: 'native', layout: 'approximate' },
          page_count: 1,
          block_count: 1,
        }],
      }],
    })
    expect(result.meta).toMatchObject({ kind: 'dsh/paper-library-register', version: 1, value: output })
    expect(text(result)).toContain('Paper library registration')
    expect(setup.ctx.tools.get('paper_library_register')?.presentCall?.({
      paper_id: paper.paper_id as string,
      document_id: document.id,
    })).toMatchObject({ card: 'generic', kind: 'edit', rawInput: document.id })
  })

  it('uses a parser title only as parser provenance when no declared title exists', async () => {
    const setup = await mount()
    const { output } = await registerDocument(setup)
    expect(projectedPaper(output)).toMatchObject({
      metadata: { title: { value: 'Runtime Paper', origin: 'parser' } },
    })
  })

  it('registers an untitled runtime document when declared bibliography supplies the title', async () => {
    const setup = await mount({ parserResult: parseResult({ omitTitle: true }) })
    const { output } = await registerDocument(setup, { title: 'Declared untitled runtime' })
    expect(projectedPaper(output)).toMatchObject({
      metadata: { title: { value: 'Declared untitled runtime', origin: 'declared' } },
      sources: [{ observations: [{ parser_id: 'fixture-parser' }] }],
    })
    const observation = ((projectedPaper(output).sources as Record<string, unknown>[])[0]!
      .observations as Record<string, unknown>[])[0]!
    expect(observation).not.toHaveProperty('document_title')
  })
})

describe('research-library coverage across restarts and parser states', () => {
  it('persists a paper across a complete remount and reports reimport-required separately from history', async () => {
    const pool = new MemoryMediaPool()
    const first = await mount({ pool })
    const registered = await registerDocument(first, { title: 'Persistent Paper' })
    const paperId = (projectedPaper(registered.output).paper_id as string)
    await dispose(first)

    const second = await mount({ pool })
    const get = await second.call('paper_library_get', { paper_id: paperId })
    const getOutput = value(get)
    expect(getOutput).toMatchObject({ status: 'found', paper_id: paperId, truncated: false })
    expect(projectedPaper(getOutput)).toMatchObject({
      acquisition_state: 'imported',
      last_observed_state: 'imported',
      current_runtime_coverage: 'reimport-required',
      sources: [{ last_observed_state: 'imported', current_runtime_coverage: 'reimport-required' }],
    })
    expect(get.meta).toMatchObject({ kind: 'dsh/paper-library-get', version: 1 })

    const list = await second.call('paper_library_list', { query: 'persistent', max_results: 1 })
    const listOutput = value(list)
    expect(listOutput).toMatchObject({ query: 'persistent', total_matches: 1, truncated: false })
    expect((listOutput.papers as Record<string, unknown>[])[0]).toMatchObject({
      paper_id: paperId, current_runtime_coverage: 'reimport-required',
    })
    expect(list.meta).toMatchObject({ kind: 'dsh/paper-library-list', version: 1 })

    const document = await second.importDocument()
    const repeated = value(await second.call('paper_library_register', {
      paper_id: paperId,
      document_id: document.id,
      title: 'Persistent Paper',
    }))
    expect(repeated.status).toBe('unchanged')
    expect(projectedPaper(repeated).current_runtime_coverage).toBe('readable')
  })

  it('distinguishes parser mismatch from OCR-required extraction', async () => {
    const pool = new MemoryMediaPool()
    const first = await mount({ pool, parserId: 'parser-a', parserResult: parseResult({ parserVersion: 'v1' }) })
    const registered = await registerDocument(first)
    const paperId = projectedPaper(registered.output).paper_id as string
    await dispose(first)

    const second = await mount({ pool, parserId: 'parser-b', parserResult: parseResult({ parserVersion: 'v2' }) })
    await second.importDocument()
    const mismatch = value(await second.call('paper_library_get', { paper_id: paperId }))
    expect(projectedPaper(mismatch).current_runtime_coverage).toBe('parser-mismatch')
    const updated = value(await second.call('paper_library_register', {
      paper_id: paperId,
      document_id: registered.document.id,
    }))
    expect(updated.status).toBe('updated')
    expect(projectedPaper(updated).current_runtime_coverage).toBe('readable')

    const ocr = await mount({
      parserResult: parseResult({ extraction: { text: 'none', layout: 'page-only' } }),
    })
    const noText = await registerDocument(ocr)
    expect(projectedPaper(noText.output)).toMatchObject({
      current_runtime_coverage: 'needs-ocr',
      sources: [{ current_runtime_coverage: 'needs-ocr' }],
    })
  })
})

describe('research-library lookup, conflict, and alias tools', () => {
  it('keeps title duplicates separate, filters bibliography, and bounds list counts', async () => {
    const setup = await mount({ toolConfig: { maxListResults: 1 } })
    const first = value(await setup.call('paper_library_register', {
      title: 'Same Title', authors: ['Alice'], venue: 'Venue A', doi: '10.1/a',
    }))
    const second = value(await setup.call('paper_library_register', {
      title: 'same title', authors: ['Bob'], venue: 'Venue B', doi: '10.1/b',
    }))
    const firstId = projectedPaper(first).paper_id as string
    const secondPaper = projectedPaper(second)
    expect(secondPaper.paper_id).not.toBe(firstId)
    expect(secondPaper.possible_duplicate_ids).toEqual([firstId])

    const list = value(await setup.call('paper_library_list', {}))
    expect(list).toMatchObject({ total_matches: 2, truncated: true })
    expect(list.papers).toHaveLength(1)
    const byAuthor = value(await setup.call('paper_library_list', { query: 'bob' }))
    expect(byAuthor).toMatchObject({ total_matches: 1, truncated: false })
    expect((byAuthor.papers as Record<string, unknown>[])[0]?.paper_id).toBe(secondPaper.paper_id)
    const byIdentifier = value(await setup.call('paper_library_list', { query: 'doi:10.1/b' }))
    expect(byIdentifier).toMatchObject({ total_matches: 1 })

    const sourceRegistered = await registerDocument(setup, {
      title: 'Source alias search', source_alias: 'accepted manuscript',
    }, Uint8Array.of(4, 5, 6))
    const bySourceAlias = value(await setup.call('paper_library_list', { query: 'accepted manuscript' }))
    expect(bySourceAlias).toMatchObject({ total_matches: 1 })
    expect((bySourceAlias.papers as Record<string, unknown>[])[0]?.paper_id)
      .toBe(projectedPaper(sourceRegistered.output).paper_id)

    const missing = value(await setup.call('paper_library_get', {
      paper_id: '00000000-0000-4000-8000-000000000000',
    }))
    expect(missing).toEqual({
      status: 'paper-not-found',
      paper_id: '00000000-0000-4000-8000-000000000000',
      truncated: false,
    })
  })

  it('projects exact identifier, document, metadata, and capacity conflicts without writes', async () => {
    const setup = await mount({ libraryConfig: { maxExternalIdsPerPaper: 1 } })
    const alpha = await registerDocument(setup, { title: 'Alpha', doi: '10.1/alpha' })
    const beta = value(await setup.call('paper_library_register', { title: 'Beta', arxiv_id: '2608.beta' }))
    const alphaId = projectedPaper(alpha.output).paper_id as string
    const betaId = projectedPaper(beta).paper_id as string

    expect(value(await setup.call('paper_library_register', {
      doi: '10.1/alpha', arxiv_id: '2608.beta',
    }))).toMatchObject({ status: 'identifier-conflict', truncated: false })
    expect(value(await setup.call('paper_library_register', {
      paper_id: betaId, document_id: alpha.document.id,
    }))).toMatchObject({ status: 'document-conflict', paper_id: alphaId })
    expect(value(await setup.call('paper_library_register', {
      paper_id: alphaId, title: 'Different',
    }))).toMatchObject({ status: 'metadata-conflict', paper_id: alphaId, fields: ['title'] })
    expect(value(await setup.call('paper_library_register', {
      paper_id: alphaId, arxiv_id: '2608.extra',
    }))).toEqual({ status: 'capacity', resource: 'external-ids', truncated: false })
    expect(value(await setup.call('paper_library_register', {
      paper_id: '00000000-0000-4000-8000-000000000000', title: 'Missing',
    }))).toEqual({
      status: 'paper-not-found',
      paper_id: '00000000-0000-4000-8000-000000000000',
      truncated: false,
    })
  })

  it('adds and removes reversible external and source aliases with tagged results', async () => {
    const setup = await mount()
    const registered = await registerDocument(setup)
    const paper = projectedPaper(registered.output)
    const paperId = paper.paper_id as string
    const sourceId = registered.output.source_version_id as string

    const added = await setup.call('paper_library_alias', {
      paper_id: paperId, action: 'add', kind: 'doi', value: 'DOI:10.1/ALIAS',
    })
    expect(value(added)).toMatchObject({ status: 'updated', truncated: false })
    expect(added.meta).toMatchObject({ kind: 'dsh/paper-library-alias', version: 1 })
    expect(value(await setup.call('paper_library_alias', {
      paper_id: paperId, action: 'remove', kind: 'doi', value: '10.1/alias',
    }))).toMatchObject({ status: 'updated' })
    expect(value(await setup.call('paper_library_alias', {
      paper_id: paperId, action: 'add', kind: 'source', value: 'camera ready', source_version_id: sourceId,
    }))).toMatchObject({ status: 'updated' })
    expect(value(await setup.call('paper_library_alias', {
      paper_id: paperId, action: 'remove', kind: 'source', value: 'camera ready', source_version_id: sourceId,
    }))).toMatchObject({ status: 'updated' })

    expect(value(await setup.call('paper_library_alias', {
      paper_id: paperId,
      action: 'add',
      kind: 'source',
      value: 'x',
      source_version_id: '00000000-0000-4000-8000-000000000000',
    }))).toMatchObject({ status: 'source-not-found' })
    expect(value(await setup.call('paper_library_alias', {
      paper_id: '00000000-0000-4000-8000-000000000000',
      action: 'add', kind: 'doi', value: '10.1/missing',
    }))).toMatchObject({ status: 'paper-not-found' })
  })

  it('projects alias identity conflicts and both alias capacity categories', async () => {
    const setup = await mount({
      libraryConfig: { maxExternalIdsPerPaper: 1, maxAliasesPerSource: 1 },
    })
    const first = await registerDocument(setup, {
      title: 'First', doi: '10.1/first', source_alias: 'first source',
    })
    const second = await registerDocument(
      setup,
      { title: 'Second', doi: '10.1/second' },
      Uint8Array.of(7, 8, 9),
    )
    const firstPaper = projectedPaper(first.output)
    const secondPaper = projectedPaper(second.output)
    expect(value(await setup.call('paper_library_alias', {
      paper_id: secondPaper.paper_id,
      action: 'add', kind: 'doi', value: '10.1/first',
    }))).toMatchObject({ status: 'identifier-conflict', identifiers: ['doi:10.1/first'] })
    expect(value(await setup.call('paper_library_alias', {
      paper_id: firstPaper.paper_id,
      action: 'add', kind: 'arxiv', value: '2608.extra',
    }))).toEqual({ status: 'capacity', resource: 'external-ids', truncated: false })
    expect(value(await setup.call('paper_library_alias', {
      paper_id: firstPaper.paper_id,
      action: 'add', kind: 'source', value: 'extra source alias',
      source_version_id: first.output.source_version_id,
    }))).toEqual({ status: 'capacity', resource: 'source-aliases', truncated: false })
  })
})

describe('research-library tool limits and invalid arguments', () => {
  it('clips canonical nested text, collections, and rendered output with explicit flags', async () => {
    const setup = await mount({
      toolConfig: {
        maxSourcesPerResult: 1,
        maxNestedItemsPerResult: 1,
        maxOutputTextChars: 256,
      },
    })
    const output = value(await setup.call('paper_library_register', {
      title: 'T'.repeat(300),
      authors: ['A'.repeat(100), 'B'.repeat(100)],
      doi: `10.1/${'d'.repeat(300)}`,
    }))
    const paper = projectedPaper(output)
    expect(output.truncated).toBe(true)
    expect(paper).toMatchObject({
      truncated: true,
      metadata: { title: { value_truncated: true } },
      external_ids_truncated: true,
    })
    expect((paper.external_ids as Record<string, unknown>[])).toHaveLength(0)
    expect(text(await setup.call('paper_library_get', { paper_id: paper.paper_id }))).toHaveLength(256)

    const oneCharacterSetup = await mount({ toolConfig: { maxOutputTextChars: 256 } })
    const oneCharacter = value(await oneCharacterSetup.call('paper_library_register', {
      title: 'T'.repeat(255),
      doi: '10.1/exactly-one-character-remains',
    }))
    expect((projectedPaper(oneCharacter).external_ids as Record<string, unknown>[])[0]).toMatchObject({
      value: '…', value_truncated: true,
    })
  })

  it('bounds exact sources and truncates nested source observations explicitly', async () => {
    const setup = await mount({
      toolConfig: { maxSourcesPerResult: 1, maxNestedItemsPerResult: 1, maxOutputTextChars: 256 },
    })
    const first = await registerDocument(setup, { title: 'Many sources', source_alias: 'first source' })
    const paperId = projectedPaper(first.output).paper_id
    const secondDocument = await setup.importDocument(Uint8Array.of(4, 4, 4))
    value(await setup.call('paper_library_register', {
      paper_id: paperId,
      document_id: secondDocument.id,
      title: 'Many sources',
    }))
    const output = value(await setup.call('paper_library_get', { paper_id: paperId }))
    expect(projectedPaper(output)).toMatchObject({
      total_sources: 2,
      sources_truncated: true,
      truncated: true,
    })
  })

  it('rejects invalid ids, source alias combinations, query bounds, counts, and direct config', async () => {
    const setup = await mount({ toolConfig: { maxQueryChars: 3, maxListResults: 2 } })
    const invalidCalls: Array<[string, unknown, RegExp]> = [
      ['paper_library_register', { document_id: 'bad' }, /document_id/],
      ['paper_library_register', { source_alias: 'x', title: 'X' }, /requires document_id/],
      ['paper_library_get', { paper_id: 'bad' }, /paper_id/],
      ['paper_library_list', { query: '   ' }, /non-empty/],
      ['paper_library_list', { query: 'four' }, /at most 3/],
      ['paper_library_list', { max_results: 0 }, /from 1 through 2/],
      ['paper_library_alias', {
        paper_id: '00000000-0000-4000-8000-000000000000', action: 'add', kind: 'source', value: 'x',
      }, /source_version_id is required/],
      ['paper_library_alias', {
        paper_id: '00000000-0000-4000-8000-000000000000', action: 'add', kind: 'doi', value: 'x',
        source_version_id: '00000000-0000-4000-8000-000000000000',
      }, /only valid when kind=source/],
      ['paper_library_alias', {
        paper_id: '00000000-0000-4000-8000-000000000000', action: 'add', kind: 'source', value: 'x',
        source_version_id: 'bad',
      }, /source_version_id/],
      ['paper_library_register', { authors: ['Ada'] }, /requires metadata.title or a parsed document title/],
    ]
    for (const [name, args, pattern] of invalidCalls) {
      const result = await setup.call(name, args)
      expect(result.isError).toBe(true)
      if (result.isError) expect(result.error.message).toMatch(pattern)
    }

    await expect(mount({ toolConfig: { maxOutputTextChars: 255 } })).rejects.toThrow(/expected number >= 256/)
    await expect(mount({ toolConfig: { maxListResults: Number.MAX_SAFE_INTEGER + 1 } }))
      .rejects.toThrow(/positive safe integer|safe integer/)

    expect(() => { LibraryTools.apply(setup.ctx, { maxOutputTextChars: 255 }) }).toThrow(/at least 256/)
    await setup.toolFiber.dispose()
    expect(() => { LibraryTools.apply(setup.ctx) }).not.toThrow()
  })
})
