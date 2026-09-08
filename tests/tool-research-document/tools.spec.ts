import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import ResearchDocumentRuntime, {
  researchDocumentParseResultSchema,
  type ResearchDocumentParseResult,
  type ResearchDocumentParser,
} from '../../src/research-document/index.ts'
import { FileSystem, FsError, FsTargetKey, FsVersion } from '@deepseek-ai/dsh-fs'
import type {
  FsDirEntry,
  FsEditOutcome,
  FsEditRequest,
  FsInfo,
  FsPathInfo,
  FsTarget,
  FsWriteIntent,
  FsWriteOutcome,
} from '@deepseek-ai/dsh-fs'
import * as PaperTools from '../../src/tool-research-document/index.ts'

const signal = new AbortController().signal
let callCounter = 0

class FakeFs extends FileSystem {
  state: 'file' | 'directory' | 'missing' = 'file'
  bytes = Uint8Array.of(1, 2, 3)
  cwdSeen: string | undefined
  maxBytesSeen?: number

  override async resolve(
    path: string,
    opts?: { cwd?: string; signal?: AbortSignal },
  ): Promise<FsTarget> {
    this.cwdSeen = opts?.cwd
    return { targetKey: FsTargetKey(`key:${path}`), displayPath: `/workspace/${path}` }
  }

  override processPath(target: FsTarget): string { return String(target.targetKey) }
  override fileUrl(target: FsTarget): string { return `file://${target.targetKey}` }
  override contains(parent: FsTarget, child: FsTarget): boolean { return parent.targetKey === child.targetKey }

  override async stat(_target: FsTarget): Promise<FsInfo | undefined> {
    if (this.state === 'missing') return undefined
    return {
      version: FsVersion('fixture-v1'),
      type: this.state === 'file' ? 'file' : 'directory',
      ...(this.state === 'file' ? { size: this.bytes.length } : {}),
    }
  }

  override async lstat(_path: string): Promise<FsPathInfo | undefined> { return undefined }
  override async readText(_target: FsTarget): Promise<string> { throw new Error('unused') }
  override async streamText(_target: FsTarget): Promise<AsyncIterable<string>> { throw new Error('unused') }

  override async readBytes(
    target: FsTarget,
    _signal: AbortSignal | undefined,
    maxBytes: number,
  ): Promise<Uint8Array> {
    this.maxBytesSeen = maxBytes
    if (this.bytes.length > maxBytes) throw new FsError(`too large: ${target.displayPath}`, 'FS_TOO_LARGE')
    return this.bytes
  }

  override async listDir(_target: FsTarget): Promise<FsDirEntry[]> { return [] }
  override async writeText(
    _target: FsTarget,
    _content: string,
    _expected?: FsWriteIntent,
  ): Promise<FsWriteOutcome> { throw new Error('unused') }
  override async editText(
    _target: FsTarget,
    _edit: FsEditRequest,
    _expected?: { version: FsVersion },
  ): Promise<FsEditOutcome> { throw new Error('unused') }
}

function parsed(extraction: ResearchDocumentParseResult['extraction'] = { text: 'native', layout: 'approximate' }): ResearchDocumentParseResult {
  const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.04 }
  return {
    parserVersion: 'fixture-v1',
    title: 'Tool Fixture Paper',
    extraction,
    pages: [{
      pageIndex: 0,
      pageLabel: '1',
      width: 612,
      height: 792,
      blocks: extraction.text === 'none' ? [] : [
        { kind: 'heading', headingLevel: 1, text: 'Introduction', bbox: rect },
        { kind: 'paragraph', text: 'Alpha shared evidence with extended context.', bbox: rect },
        { kind: 'heading', headingLevel: 2, text: 'Methods', bbox: rect },
        { kind: 'paragraph', text: 'Beta shared evidence with extended context.', bbox: rect },
        { kind: 'heading', headingLevel: 2, text: 'Results', bbox: rect },
        { kind: 'paragraph', text: 'Gamma shared evidence with extended context.', bbox: rect },
      ],
    }],
  }
}

function untitledParsed(): ResearchDocumentParseResult {
  return {
    parserVersion: 'fixture-v1',
    extraction: { text: 'native', layout: 'approximate' },
    pages: [{
      pageIndex: 0,
      width: 612,
      height: 792,
      blocks: [{
        kind: 'paragraph',
        text: 'Tiny evidence.',
        bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.04 },
      }],
    }],
  }
}

function multilingualSectionsParsed(): ResearchDocumentParseResult {
  const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.04 }
  return {
    parserVersion: 'fixture-v1',
    title: 'Multilingual Sections',
    extraction: { text: 'native', layout: 'approximate' },
    pages: [{
      pageIndex: 0,
      width: 612,
      height: 792,
      blocks: [
        { kind: 'paragraph', text: 'Abstract. A concise contribution statement.', bbox: rect },
        { kind: 'heading', headingLevel: 1, text: '第1章 引言', bbox: rect },
        { kind: 'paragraph', text: '研究背景与目标。', bbox: rect },
        { kind: 'heading', headingLevel: 1, text: '二、结论', bbox: rect },
        { kind: 'paragraph', text: 'The final finding.', bbox: rect },
      ],
    }],
  }
}

function longMethodSectionParsed(): ResearchDocumentParseResult {
  const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.04 }
  return {
    parserVersion: 'fixture-v1',
    extraction: { text: 'native', layout: 'approximate' },
    pages: [{
      pageIndex: 0,
      width: 612,
      height: 792,
      blocks: [
        { kind: 'heading', headingLevel: 1, text: 'Methods', bbox: rect },
        { kind: 'paragraph', text: 'Method line one.', bbox: rect },
        { kind: 'paragraph', text: 'Method line two.', bbox: rect },
        { kind: 'paragraph', text: 'Method line three.', bbox: rect },
        { kind: 'heading', headingLevel: 2, text: 'Discussion', bbox: rect },
        { kind: 'paragraph', text: 'Discussion content.', bbox: rect },
      ],
    }],
  }
}

function titleLikeHeadingParsed(): ResearchDocumentParseResult {
  const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.04 }
  return {
    parserVersion: 'fixture-v1',
    title: 'Methods: Reliable Agents',
    extraction: { text: 'native', layout: 'approximate' },
    pages: [{
      pageIndex: 0,
      width: 612,
      height: 792,
      blocks: [
        { kind: 'heading', headingLevel: 1, text: 'Methods:', bbox: rect },
        { kind: 'heading', headingLevel: 1, text: 'Reliable Agents', bbox: rect },
        { kind: 'paragraph', text: 'A. Author', bbox: rect },
        { kind: 'heading', headingLevel: 1, text: 'Methods', bbox: rect },
        { kind: 'paragraph', text: 'The actual method.', bbox: rect },
      ],
    }],
  }
}

function emojiSectionParsed(): ResearchDocumentParseResult {
  const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.04 }
  return {
    parserVersion: 'fixture-v1',
    extraction: { text: 'native', layout: 'approximate' },
    pages: [{
      pageIndex: 0,
      width: 612,
      height: 792,
      blocks: [
        { kind: 'heading', headingLevel: 1, text: 'Methods', bbox: rect },
        { kind: 'paragraph', text: '😀x', bbox: rect },
      ],
    }],
  }
}

function exactlyBudgetedSectionParsed(): ResearchDocumentParseResult {
  const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.04 }
  return {
    parserVersion: 'fixture-v1',
    extraction: { text: 'native', layout: 'approximate' },
    pages: [{
      pageIndex: 0,
      width: 612,
      height: 792,
      blocks: [
        { kind: 'heading', headingLevel: 1, text: 'Methods', bbox: rect },
        { kind: 'paragraph', text: '12345678901234567890', bbox: rect },
      ],
    }],
  }
}

function parser(result = parsed()): ResearchDocumentParser {
  return {
    id: 'fixture',
    available: () => true,
    supports: mediaType => mediaType === 'application/pdf',
    parse: () => Promise.resolve(result),
  }
}

async function mount(options: {
  config?: PaperTools.Config
  result?: ResearchDocumentParseResult
} = {}): Promise<{
  ctx: Context
  fs: FakeFs
  toolFiber: Awaited<ReturnType<Context['plugin']>>
  call(name: string, args: unknown, cwd?: string): Promise<ToolExecutionResult>
}> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(ResearchDocumentRuntime, {})
  await ctx.plugin(FakeFs)
  ctx.researchDocuments.registerParser(parser(options.result))
  const toolFiber = await ctx.plugin(PaperTools, options.config ?? {})
  return {
    ctx,
    fs: ctx.fs as FakeFs,
    toolFiber,
    call: (name, args, cwd) => ctx.tools.execute({
      signal,
      callId: CallId(`paper-call-${++callCounter}`),
      name,
      arguments: args,
      ...(cwd === undefined ? {} : { agent: { session: { header: { cwd } } } as never }),
    }),
  }
}

function value(result: ToolExecutionResult): Record<string, unknown> {
  expect(result.isError).toBe(false)
  if (result.isError) throw new Error('expected successful tool result')
  return result.value as Record<string, unknown>
}

function text(result: ToolExecutionResult): string {
  return result.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
}

async function importPaper(setup: Awaited<ReturnType<typeof mount>>): Promise<string> {
  const result = await setup.call('paper_import', { file_path: 'paper.pdf' })
  return value(result).document_id as string
}

describe('paper tool composition and import', () => {
  it('renders unreviewed structures and refuses an oversized complete result without dropping cells', async () => {
    const result = researchDocumentParseResultSchema.parse(JSON.parse(readFileSync(new URL(
      '../fixtures/research-document/docling/extraction.json', import.meta.url,
    ), 'utf8')) as unknown)
    for (const maxStructureOutputBytes of [262144, 10]) {
      const setup = await mount({ result, config: { maxStructureOutputBytes } })
      try {
        const document = await setup.ctx.researchDocuments.import({ bytes: setup.fs.bytes, mediaType: 'application/pdf' })
        const table = document.pages[0]!.blocks.find(block => block.structure?.kind === 'table')!
        const read = await setup.call('paper_read', { document_id: document.id, block_id: table.id, before: 0, after: 0 })
        if (maxStructureOutputBytes === 10) {
          expect(read.isError).toBe(true)
          expect(text(read)).toContain('maxStructureOutputBytes')
        } else {
          expect(read.isError).toBe(false)
          expect(text(read)).toContain('Unreviewed scientific extraction')
          expect(text(read)).toContain('85.5')
        }
      } finally { await setup.ctx.fiber.dispose() }
    }
  })

  it('registers the bounded paper-reading workflow and native-text/OCR guidance', async () => {
    const { ctx } = await mount()
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual([
      'paper_import',
      'paper_outline',
      'paper_search',
      'paper_read',
      'paper_reading_pack',
      'paper_structure',
    ])
    const prompt = renderPrompt(await ctx.systemPrompt.assemble())
    expect(prompt).toContain('paper_import')
    expect(prompt).toContain('paper_reading_pack')
    expect(prompt).toContain('not a generated summary')
    expect(prompt).toContain('extraction.text=none')
    expect(prompt).toContain('OCR is required')

    const outline = ctx.tools.get('paper_outline')
    expect(outline?.isConcurrencySafe?.({ document_id: 'short' })).toBe(true)
    expect(outline?.presentCall?.({ document_id: 'short' })).toEqual({
      card: 'generic',
      title: 'Outline paper short',
      kind: 'read',
    })
    const search = ctx.tools.get('paper_search')
    expect(search?.isConcurrencySafe?.({ document_id: 'short', query: 'alpha' })).toBe(true)
    expect(search?.presentCall?.({ document_id: 'short', query: 'alpha' })).toEqual({
      card: 'generic',
      title: 'Search paper: alpha',
      kind: 'search',
      rawInput: 'alpha',
    })
    const blockId = `block:${'a'.repeat(64)}`
    const read = ctx.tools.get('paper_read')
    expect(read?.isConcurrencySafe?.({ document_id: 'short', block_id: blockId })).toBe(true)
    expect(read?.presentCall?.({ document_id: 'short', block_id: blockId })).toEqual({
      card: 'generic',
      title: `Read paper block ${blockId.slice(0, 12)}…${blockId.slice(-6)}`,
      kind: 'read',
    })
    const readingPack = ctx.tools.get('paper_reading_pack')
    expect(readingPack?.isConcurrencySafe?.({ document_id: 'short' })).toBe(true)
    expect(readingPack?.presentCall?.({ document_id: 'short' })).toEqual({
      card: 'generic',
      title: 'Build reading pack short',
      kind: 'read',
    })
  })

  it('imports bounded bytes, records observation, and persists future-viewer metadata', async () => {
    const setup = await mount({ config: { maxPdfBytes: 4 } })
    const observations: string[] = []
    setup.ctx.on('fs/observed', (target, observation) => {
      observations.push(`${target.displayPath}:${observation.kind}`)
    })
    const result = await setup.call('paper_import', { file_path: 'paper.pdf' }, '/session/project')
    const output = value(result)
    expect(output).toMatchObject({
      source_path: '/workspace/paper.pdf',
      title: 'Tool Fixture Paper',
      title_truncated: false,
      parser_id: 'fixture',
      parser_version: 'fixture-v1',
      page_count: 1,
      block_count: 6,
      extraction: { text: 'native', layout: 'approximate' },
    })
    expect(output.document_id).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(result.meta).toMatchObject({ kind: 'dsh/paper-import', version: 1, value: output })
    expect(text(result)).toContain('Use paper_outline or paper_search')
    expect(setup.fs.cwdSeen).toBe('/session/project')
    expect(setup.fs.maxBytesSeen).toBe(4)
    expect(observations).toEqual(['/workspace/paper.pdf:present'])
    expect(setup.ctx.tools.get('paper_import')?.presentCall?.({ file_path: 'paper.pdf' })).toEqual({
      card: 'generic',
      title: 'Import paper paper.pdf',
      kind: 'read',
      rawInput: 'paper.pdf',
    })
  })

  it('reports missing, non-file, oversized, and blank import arguments', async () => {
    const setup = await mount({ config: { maxPdfBytes: 2 } })
    const observations: string[] = []
    setup.ctx.on('fs/observed', (_target, observation) => { observations.push(observation.kind) })
    setup.fs.state = 'missing'
    const missing = await setup.call('paper_import', { file_path: 'absent.pdf' })
    expect(missing).toMatchObject({ isError: true, error: { info: { code: 'FS_NOT_FOUND' } } })
    expect(observations).toEqual(['absent'])

    setup.fs.state = 'directory'
    const directory = await setup.call('paper_import', { file_path: 'folder' })
    expect(directory).toMatchObject({ isError: true, error: { info: { code: 'FS_NOT_REGULAR_FILE' } } })

    setup.fs.state = 'file'
    const oversized = await setup.call('paper_import', { file_path: 'paper.pdf' })
    expect(oversized).toMatchObject({ isError: true, error: { info: { code: 'FS_TOO_LARGE' } } })

    const blank = await setup.call('paper_import', { file_path: '   ' })
    expect(blank.isError).toBe(true)
    expect(text(blank)).toContain('file_path must be a non-empty string')
  })

  it('surfaces the explicit no-native-text degradation', async () => {
    const setup = await mount({ result: parsed({ text: 'none', layout: 'page-only' }) })
    const result = await setup.call('paper_import', { file_path: 'scan.pdf' })
    expect(value(result)).toMatchObject({ block_count: 0, extraction: { text: 'none', layout: 'page-only' } })
    expect(text(result)).toContain('OCR is required')
  })
})

describe('paper navigation and anchored reading', () => {
  it('caps outline entries and preserves complete locators in value and metadata', async () => {
    const setup = await mount({
      config: {
        maxOutlineEntries: 2,
        maxOutputTextChars: 20,
        maxReadingPackSections: 1,
        maxReadingPackBlocksPerSection: 1,
        defaultReadingPackBlocksPerSection: 1,
      },
    })
    const documentId = await importPaper(setup)
    const result = await setup.call('paper_outline', { document_id: documentId })
    const output = value(result)
    expect(output).toMatchObject({ document_id: documentId, truncated: true, total_entries: 3 })
    const entries = output.entries as Array<Record<string, unknown>>
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ level: 1, text_truncated: true })
    expect(entries[0]?.locator).toMatchObject({
      kind: 'block',
      document_id: documentId,
      parser_id: 'fixture',
      parser_version: 'fixture-v1',
      page_index: 0,
      page_label: '1',
    })
    expect(result.meta).toMatchObject({ kind: 'dsh/paper-outline', value: output })
    expect(text(result)).toContain('Showing 2 of 3 headings')
  })

  it('searches deterministically, detects truncation, and validates query controls', async () => {
    const setup = await mount({
      config: {
        maxOutlineEntries: 2,
        maxSearchResults: 2,
        maxOutputTextChars: 20,
        maxReadingPackSections: 1,
        maxReadingPackBlocksPerSection: 1,
        defaultReadingPackBlocksPerSection: 1,
      },
    })
    const documentId = await importPaper(setup)
    const result = await setup.call('paper_search', {
      document_id: documentId,
      query: 'shared evidence',
      max_results: 1,
    })
    const output = value(result)
    const hits = output.hits as Array<Record<string, unknown>>
    expect(output).toMatchObject({ query: 'shared evidence', truncated: true })
    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({ text_truncated: true, score: 102 })
    expect(result.meta).toMatchObject({ kind: 'dsh/paper-search', value: output })
    expect(text(result)).toContain('Use paper_read')

    const blank = await setup.call('paper_search', { document_id: documentId, query: ' ' })
    expect(blank.isError).toBe(true)
    const excessive = await setup.call('paper_search', {
      document_id: documentId,
      query: 'shared',
      max_results: 3,
    })
    expect(excessive.isError).toBe(true)
    const malformed = await setup.call('paper_search', { document_id: 'bad', query: 'shared' })
    expect(malformed.isError).toBe(true)
  })

  it('reads a focus-centered window with bounded text and exact evidence anchors', async () => {
    const setup = await mount({
      config: {
        maxOutlineEntries: 12,
        maxSearchResults: 12,
        maxReadBlocks: 3,
        maxOutputTextChars: 12,
        defaultReadBefore: 1,
        defaultReadAfter: 1,
        maxReadingPackSections: 1,
        maxReadingPackBlocksPerSection: 1,
        defaultReadingPackBlocksPerSection: 1,
      },
    })
    const documentId = await importPaper(setup)
    const searched = value(await setup.call('paper_search', { document_id: documentId, query: 'beta' }))
    const hit = (searched.hits as Array<{ locator: { block_id: string } }>)[0]
    expect(hit).toBeDefined()
    const result = await setup.call('paper_read', {
      document_id: documentId,
      block_id: hit!.locator.block_id,
    })
    const output = value(result)
    const blocks = output.blocks as Array<Record<string, unknown>>
    expect(blocks).toHaveLength(3)
    expect(blocks.map(block => block.focus)).toEqual([false, true, false])
    expect(blocks.every(block => block.text_truncated === true)).toBe(true)
    expect(blocks.every(block => block.section_path_truncated === true)).toBe(true)
    expect(result.meta).toMatchObject({ kind: 'dsh/paper-read', value: output })
    expect(text(result)).toContain('FOCUS [page 1 (label 1)')
    expect(text(result)).toContain('quote sha256:')
  })

  it('rejects malformed block ids and read windows above the deployment cap', async () => {
    const setup = await mount({
      config: { maxReadBlocks: 4, defaultReadBefore: 1, defaultReadAfter: 2 },
    })
    const documentId = await importPaper(setup)
    const malformed = await setup.call('paper_read', { document_id: documentId, block_id: 'bad' })
    expect(malformed.isError).toBe(true)
    const tooWide = await setup.call('paper_read', {
      document_id: documentId,
      block_id: `block:${'0'.repeat(64)}`,
      before: 2,
      after: 2,
    })
    expect(tooWide.isError).toBe(true)
    expect(text(tooWide)).toContain('at most 4 blocks')
    const negative = await setup.call('paper_read', {
      document_id: documentId,
      block_id: `block:${'0'.repeat(64)}`,
      before: -1,
    })
    expect(negative.isError).toBe(true)
  })

  it('renders empty navigation results without implying text was found', async () => {
    const setup = await mount({ result: parsed({ text: 'none', layout: 'page-only' }) })
    const documentId = await importPaper(setup)
    const outline = await setup.call('paper_outline', { document_id: documentId })
    const search = await setup.call('paper_search', { document_id: documentId, query: 'anything' })
    expect(text(outline)).toContain('No parsed headings')
    expect(text(search)).toContain('No matching extracted blocks')
  })

  it('preserves unlabeled-page anchors and untitled, top-level evidence', async () => {
    const setup = await mount({
      result: untitledParsed(),
      config: {
        maxOutlineEntries: 100,
        maxReadBlocks: 1,
        maxOutputTextChars: 100,
        defaultReadBefore: 0,
        defaultReadAfter: 0,
      },
    })
    const imported = await setup.call('paper_import', { file_path: 'untitled.pdf' })
    const importedValue = value(imported)
    expect(importedValue).not.toHaveProperty('title')
    expect(text(imported)).toContain('Imported paper: /workspace/untitled.pdf')

    const documentId = importedValue.document_id as string
    const searched = await setup.call('paper_search', {
      document_id: documentId,
      query: 'tiny',
      max_results: 1,
    })
    const hit = (value(searched).hits as Array<{ locator: Record<string, unknown> }>)[0]
    expect(hit).toBeDefined()
    expect(hit!.locator).not.toHaveProperty('page_label')
    expect(text(searched)).toContain('[page 1 | block')

    const read = await setup.call('paper_read', {
      document_id: documentId,
      block_id: hit!.locator.block_id,
      before: 0,
      after: 0,
    })
    expect((value(read).blocks as Array<Record<string, unknown>>)[0]).toMatchObject({
      section_path: [],
      section_path_truncated: false,
      text: 'Tiny evidence.',
      text_truncated: false,
    })
    expect(text(read)).toContain('FOCUS [page 1 | block')
  })

  it('uses an ellipsis when one character is available for projected evidence', async () => {
    const setup = await mount({
      config: {
        maxOutlineEntries: 1,
        maxSearchResults: 1,
        maxReadBlocks: 1,
        maxOutputTextChars: 1,
        defaultReadBefore: 0,
        defaultReadAfter: 0,
        maxReadingPackSections: 1,
        maxReadingPackBlocksPerSection: 1,
        defaultReadingPackBlocksPerSection: 1,
      },
    })
    const imported = value(await setup.call('paper_import', { file_path: 'paper.pdf' }))
    expect(imported).toMatchObject({ title: '…', title_truncated: true })
    const documentId = imported.document_id as string
    const outline = value(await setup.call('paper_outline', { document_id: documentId }))
    expect(outline.entries).toMatchObject([{ text: '…', text_truncated: true }])
    const heading = (outline.entries as Array<{ locator: { block_id: string } }>)[0]
    const read = value(await setup.call('paper_read', {
      document_id: documentId,
      block_id: heading!.locator.block_id,
      before: 0,
      after: 0,
    }))
    expect(read.blocks).toMatchObject([{
      section_path: [],
      section_path_truncated: true,
      text: '…',
      text_truncated: true,
    }])
  })

  it('retains a complete section path when the block-text budget permits it', async () => {
    const setup = await mount({ config: { defaultReadBefore: 0, defaultReadAfter: 0 } })
    const documentId = await importPaper(setup)
    const searched = value(await setup.call('paper_search', { document_id: documentId, query: 'beta' }))
    const blockId = (searched.hits as Array<{ locator: { block_id: string } }>)[0]!.locator.block_id
    const read = value(await setup.call('paper_read', { document_id: documentId, block_id: blockId }))
    expect(read.blocks).toMatchObject([{
      section_path: ['Introduction', 'Methods'],
      section_path_truncated: false,
      text: 'Beta shared evidence with extended context.',
      text_truncated: false,
    }])
  })

  it('builds a deterministic semantic reading pack with exact anchors and explicit misses', async () => {
    const setup = await mount({
      config: {
        defaultReadingPackBlocksPerSection: 2,
        maxReadingPackBlocksPerSection: 3,
      },
    })
    const documentId = await importPaper(setup)
    const result = await setup.call('paper_reading_pack', {
      document_id: documentId,
      section_roles: ['introduction', 'method', 'results', 'conclusion', 'method'],
      blocks_per_section: 2,
    })
    const output = value(result)
    expect(output).toMatchObject({
      document_id: documentId,
      requested_roles: ['introduction', 'method', 'results', 'conclusion'],
      missing_roles: ['conclusion'],
      truncated: false,
    })
    const sections = output.sections as Array<Record<string, unknown>>
    expect(sections.map(section => section.role)).toEqual(['introduction', 'method', 'results'])
    expect(sections[0]).toMatchObject({ matched_by: 'heading', total_blocks: 2, truncated: false })
    expect(sections[1]).toMatchObject({ matched_by: 'heading', total_blocks: 2, truncated: false })
    const blocks = sections.flatMap(section => section.blocks as Array<Record<string, unknown>>)
    expect(blocks.every(block => (block.locator as Record<string, unknown>).quote_hash !== undefined)).toBe(true)
    expect(blocks.filter(block => block.focus).map(block => block.kind)).toEqual([
      'heading',
      'heading',
      'heading',
    ])
    expect(result.meta).toMatchObject({ kind: 'dsh/paper-reading-pack', value: output })
    expect(text(result)).toContain('Any returned passages are extracted source text, not a generated summary')
    expect(text(result)).toContain('This is not evidence that those topics are absent')
  })

  it('reports every role as unrecognized when a scan has no native text', async () => {
    const setup = await mount({ result: parsed({ text: 'none', layout: 'page-only' }) })
    const documentId = await importPaper(setup)
    const output = value(await setup.call('paper_reading_pack', {
      document_id: documentId,
      section_roles: ['abstract', 'conclusion'],
    }))
    expect(output).toMatchObject({
      sections: [],
      missing_roles: ['abstract', 'conclusion'],
      truncated: false,
    })
    expect(text(await setup.call('paper_reading_pack', {
      document_id: documentId,
      section_roles: ['abstract'],
    }))).toContain('OCR is required')
  })

  it('recognizes numbered Chinese headings and a labeled abstract paragraph', async () => {
    const setup = await mount({ result: multilingualSectionsParsed() })
    const documentId = await importPaper(setup)
    const output = value(await setup.call('paper_reading_pack', {
      document_id: documentId,
      section_roles: ['abstract', 'introduction', 'conclusion', 'method'],
      blocks_per_section: 2,
    }))
    expect(output).toMatchObject({ missing_roles: ['method'], truncated: false })
    expect(output.sections).toMatchObject([
      { role: 'abstract', matched_by: 'labeled-paragraph', total_blocks: 1 },
      { role: 'introduction', matched_by: 'heading', total_blocks: 2 },
      { role: 'conclusion', matched_by: 'heading', total_blocks: 2 },
    ])
  })

  it('does not mistake a title-like heading for a semantic section', async () => {
    const setup = await mount({ result: titleLikeHeadingParsed() })
    const documentId = await importPaper(setup)
    const output = value(await setup.call('paper_reading_pack', {
      document_id: documentId,
      section_roles: ['method'],
      blocks_per_section: 2,
    }))
    const section = (output.sections as Array<{ blocks: Array<{ text: string }> }>)[0]
    expect(section?.blocks.map(block => block.text)).toEqual(['Methods', 'The actual method.'])
  })

  it('bounds a long section and stops before a misleveled peer heading', async () => {
    const setup = await mount({ result: longMethodSectionParsed() })
    const documentId = await importPaper(setup)
    const result = await setup.call('paper_reading_pack', {
      document_id: documentId,
      section_roles: ['method'],
      blocks_per_section: 2,
    })
    const output = value(result)
    expect(output).toMatchObject({ truncated: true })
    expect(output.sections).toMatchObject([{
      role: 'method',
      total_blocks: 4,
      truncated: true,
      blocks: [{ text: 'Methods' }, { text: 'Method line one.' }],
    }])
    expect(text(result)).toContain('Showing 2 of 4 blocks for this section')
    expect(text(result)).not.toContain('Discussion')
  })

  it('marks projected text truncation without emitting a broken surrogate', async () => {
    const setup = await mount({
      result: emojiSectionParsed(),
      config: {
        maxOutlineEntries: 1,
        maxSearchResults: 1,
        maxReadBlocks: 1,
        maxOutputTextChars: 18,
        defaultReadBefore: 0,
        defaultReadAfter: 0,
        maxReadingPackSections: 1,
        maxReadingPackBlocksPerSection: 2,
        defaultReadingPackBlocksPerSection: 2,
      },
    })
    const documentId = await importPaper(setup)
    const result = await setup.call('paper_reading_pack', {
      document_id: documentId,
      section_roles: ['method'],
    })
    const output = value(result)
    expect(output).toMatchObject({ truncated: true })
    const section = (output.sections as Array<{ blocks: Array<{ text: string }> }>)[0]
    expect(section?.blocks[1]?.text).toBe('…')
    expect(JSON.stringify(output)).not.toContain('\\ud83d')
    expect(text(result)).toContain('Some displayed passages or section paths are text-truncated')
  })

  it('reuses short-block budget so an exactly fitting section remains complete', async () => {
    const setup = await mount({
      result: exactlyBudgetedSectionParsed(),
      config: {
        maxOutlineEntries: 1,
        maxSearchResults: 1,
        maxReadBlocks: 1,
        maxOutputTextChars: 41,
        defaultReadBefore: 0,
        defaultReadAfter: 0,
        maxReadingPackSections: 1,
        maxReadingPackBlocksPerSection: 2,
        defaultReadingPackBlocksPerSection: 2,
      },
    })
    const documentId = await importPaper(setup)
    const output = value(await setup.call('paper_reading_pack', {
      document_id: documentId,
      section_roles: ['method'],
    }))
    expect(output).toMatchObject({ truncated: false })
    expect(output.sections).toMatchObject([{
      blocks: [
        { text: 'Methods', text_truncated: false },
        { text: '12345678901234567890', text_truncated: false },
      ],
    }])
  })

  it('validates reading-pack roles and deployment block limits', async () => {
    const setup = await mount({
      config: {
        maxReadingPackSections: 2,
        maxReadingPackBlocksPerSection: 2,
        defaultReadingPackBlocksPerSection: 1,
      },
    })
    const documentId = await importPaper(setup)
    const empty = await setup.call('paper_reading_pack', { document_id: documentId, section_roles: [] })
    expect(empty.isError).toBe(true)
    expect(text(empty)).toContain('section_roles must contain at least one role')
    const tooMany = await setup.call('paper_reading_pack', {
      document_id: documentId,
      section_roles: ['introduction', 'method', 'results'],
    })
    expect(tooMany.isError).toBe(true)
    expect(text(tooMany)).toContain('at most 2 unique roles')
    const tooWide = await setup.call('paper_reading_pack', {
      document_id: documentId,
      blocks_per_section: 3,
    })
    expect(tooWide.isError).toBe(true)
    expect(text(tooWide)).toContain('from 1 through 2')
  })
})

describe('paper tool config', () => {
  it('rejects invalid integer limits and inconsistent read budgets before registration', () => {
    const ctx = new Context()
    expect(() => {
      PaperTools.apply(ctx, { maxPdfBytes: 0 })
    }).toThrow('maxPdfBytes')
    expect(() => {
      PaperTools.apply(ctx, { defaultReadBefore: -1 })
    }).toThrow('defaultReadBefore')
    expect(() => {
      PaperTools.apply(ctx, { maxReadBlocks: 1 })
    }).toThrow('default read window')
    expect(() => {
      PaperTools.apply(ctx, {
        maxReadBlocks: 2,
        defaultReadBefore: 1,
        defaultReadAfter: 1,
      })
    }).toThrow('default read window')
    expect(() => {
      PaperTools.apply(ctx, {
        maxReadBlocks: 4,
        maxOutputTextChars: 3,
        defaultReadBefore: 1,
        defaultReadAfter: 2,
      })
    }).toThrow('maxOutputTextChars')
    expect(() => {
      PaperTools.apply(ctx, {
        maxOutlineEntries: 5,
        maxSearchResults: 1,
        maxReadBlocks: 1,
        maxOutputTextChars: 4,
        defaultReadBefore: 0,
        defaultReadAfter: 0,
      })
    }).toThrow('every returned item')
    expect(() => {
      PaperTools.apply(ctx, {
        defaultReadingPackBlocksPerSection: 3,
        maxReadingPackBlocksPerSection: 2,
      })
    }).toThrow('default reading-pack block count')
    expect(() => {
      PaperTools.apply(ctx, { maxReadingPackSections: 8 })
    }).toThrow('maxReadingPackSections')
  })
})


describe('scientific structure navigation', () => {
  const fixture = () => researchDocumentParseResultSchema.parse(JSON.parse(readFileSync(new URL(
    '../fixtures/research-document/docling/extraction.json', import.meta.url,
  ), 'utf8')) as unknown)

  it('discovers scientific objects and reconstructs cell pages without changing recognized values', async () => {
    const setup = await mount({ result: fixture(), config: { maxStructureItems: 3 } })
    try {
      const id = await importPaper(setup)
      const listing = value(await setup.call('paper_structure', { document_id: id }))
      const entries = listing.items as { kind: string; locator: { block_id: string } }[]
      expect(entries.map(item => item.kind)).toEqual(['table', 'figure', 'formula'])
      const pin = { parser_id: listing.parser_id, parser_version: listing.parser_version }
      const tableId = entries[0]!.locator.block_id
      const cells: { index: number; text: string; row_span: number; column_header: boolean }[] = []
      let offset: number | undefined = 0
      while (offset !== undefined) {
        const result = value(await setup.call('paper_structure', { document_id: id, block_id: tableId, ...pin, offset }))
        expect(result).toMatchObject({ view: 'read', kind: 'table', rows: 3, columns: 4, total_items: 12, review_status: 'unreviewed' })
        cells.push(...result.cells as typeof cells)
        offset = result.next_offset as number | undefined
      }
      expect(cells.map(cell => cell.index)).toEqual(Array.from({ length: 12 }, (_, index) => index))
      expect(cells.map(cell => cell.text)).toEqual(['Method', 'Split', 'Accuracy (%)', 'SD', 'Baseline A', 'Test', '80.0', '1.2', 'Method B', 'Test', '85.5', '0.8'])
      expect(cells[0]).toMatchObject({ row_span: 1, column_header: true })
      const formula = value(await setup.call('paper_structure', {
        document_id: id, block_id: entries[2]!.locator.block_id, field: 'latex', ...pin,
      }))
      expect(formula.text).toBe(fixture().pages[0]!.blocks.flatMap(block => block.structure?.kind === 'formula' ? [block.structure.latex] : [])[0])
      const filtered = value(await setup.call('paper_structure', { document_id: id, kind: 'figure' }))
      expect(filtered.total_items).toBe(1)
      expect(filtered.items).toEqual([entries[1]])
      expect((await setup.call('paper_structure', { document_id: id, ...pin, offset: 3 })).isError).toBe(false)
    } finally { await setup.ctx.fiber.dispose() }
  })

  it('pages empty-text objects and long Unicode cells and captions within the complete byte limit', async () => {
    const sourceText = '测量😀é'.repeat(900)
    const result: ResearchDocumentParseResult = {
      ...parsed(), pages: [{ ...parsed().pages[0]!, blocks: [{
        kind: 'paragraph', text: '', bbox: { x: 0, y: 0, width: 1, height: 1 },
        structure: { kind: 'table', captions: [sourceText], footnotes: [], data: { rows: 1, columns: 1, cells: [{
          row: 0, column: 0, rowSpan: 1, columnSpan: 1, text: sourceText, columnHeader: false, rowHeader: false,
        }] } },
      }] }],
    }
    const setup = await mount({ result, config: { maxStructureOutputBytes: 6000 } })
    try {
      const id = await importPaper(setup)
      const listing = value(await setup.call('paper_structure', { document_id: id }))
      const pin = { parser_id: listing.parser_id, parser_version: listing.parser_version }
      const blockId = (listing.items as { locator: { block_id: string } }[])[0]!.locator.block_id
      const initial = value(await setup.call('paper_structure', { document_id: id, block_id: blockId }))
      const cell = (initial.cells as { text: string; next_text_offset: number; total_text_chars: number }[])[0]!
      expect(cell.total_text_chars).toBe(Array.from(sourceText).length)
      expect(cell.next_text_offset).toBeLessThan(2000)
      for (const field of ['cell', 'caption']) {
        let offset: number | undefined = field === 'cell' ? cell.next_text_offset : 0
        let reconstructed = field === 'cell' ? cell.text : ''
        while (offset !== undefined) {
          const response = await setup.call('paper_structure', {
            document_id: id, block_id: blockId, ...pin, field, field_index: 0, text_offset: offset,
          })
          const current = value(response)
          const emitted = { value: response.value, content: response.content, meta: response.meta }
          expect(Buffer.byteLength(JSON.stringify(emitted))).toBeLessThanOrEqual(6000)
          expect(current.text_offset).toBe(offset)
          reconstructed += current.text as string
          const next = current.next_text_offset as number | undefined
          if (next !== undefined) expect(next).toBeGreaterThan(offset)
          offset = next
        }
        expect(reconstructed).toBe(sourceText)
      }
      const empty = value(await setup.call('paper_structure', { document_id: id, block_id: blockId, field: 'text' }))
      expect(empty).toMatchObject({ text: '', total_text_chars: 0 })
    } finally { await setup.ctx.fiber.dispose() }
  })

  it('preserves unavailable fields and enforces the exact minimum complete-result budget', async () => {
    const setup = await mount({ result: fixture() })
    try {
      const id = await importPaper(setup)
      const listing = value(await setup.call('paper_structure', { document_id: id, kind: 'figure' }))
      const blockId = (listing.items as { locator: { block_id: string } }[])[0]!.locator.block_id
      const args = { document_id: id, block_id: blockId, field: 'description' }
      const initial = await setup.call('paper_structure', args)
      expect(value(initial)).toMatchObject({ text: null, total_text_chars: 0, text_offset: 0 })
      const bytes = Buffer.byteLength(JSON.stringify({ value: initial.value, content: initial.content, meta: initial.meta }))
      await setup.toolFiber.dispose()
      const exact = await setup.ctx.plugin(PaperTools, { maxStructureOutputBytes: bytes })
      expect(value(await setup.call('paper_structure', args))).toEqual(initial.value)
      await exact.dispose()
      await setup.ctx.plugin(PaperTools, { maxStructureOutputBytes: bytes - 1 })
      expect(text(await setup.call('paper_structure', args))).toContain('maxStructureOutputBytes')
    } finally { await setup.ctx.fiber.dispose() }
  })

  it('continues the selected archived revision after another reader changes the cached revision', async () => {
    const original = fixture()
    const setup = await mount({ result: original })
    try {
      const document = await setup.ctx.researchDocuments.import({ bytes: setup.fs.bytes, mediaType: 'application/pdf' })
      const snapshots = [original, { ...original, parserVersion: 'new-extraction' }].map(parsed => ({
        documentId: document.id, bytes: setup.fs.bytes, mediaType: document.mediaType, parserId: 'fixture', parsed,
      }))
      setup.ctx.researchDocuments.registerArchive({
        save: async () => { throw new Error('read-only archive fixture') },
        load: async (id, parser) => snapshots.find(snapshot => snapshot.documentId === id
          && parser?.id === snapshot.parserId && parser.version === snapshot.parsed.parserVersion),
      })
      const originalBlocks = setup.ctx.researchDocuments.structures(document)
      await setup.ctx.researchDocuments.restore(document.id, { id: 'fixture', version: 'new-extraction' })
      expect(setup.ctx.researchDocuments.peek(document.id)?.parser.version).toBe('new-extraction')
      const result = value(await setup.call('paper_structure', {
        document_id: document.id, parser_id: 'fixture', parser_version: original.parserVersion, offset: 1,
      }))
      expect(result.parser_version).toBe(original.parserVersion)
      expect((result.items as { locator: { block_id: string } }[]).map(item => item.locator.block_id))
        .toEqual(originalBlocks.slice(1).map(block => block.id))
    } finally { await setup.ctx.fiber.dispose() }
  })

  it('rejects mixed cursors, stale revisions, invalid indices and limits, and unregisters on disposal', async () => {
    const setup = await mount({ result: fixture() })
    try {
      const id = await importPaper(setup)
      const listing = value(await setup.call('paper_structure', { document_id: id }))
      const blockId = (listing.items as { locator: { block_id: string } }[])[0]!.locator.block_id
      const pin = { parser_id: listing.parser_id, parser_version: listing.parser_version }
      const invalid = [
        { offset: 1 }, { parser_id: 'fixture' }, { ...pin, parser_version: 'missing' },
        { ...pin, offset: 99 }, { max_items: 0 }, { max_items: 101 }, { offset: -1 },
        { field: 'text' }, { block_id: blockId, kind: 'table' },
        { block_id: blockId, field_index: 0 }, { block_id: blockId, text_offset: 0 },
        { block_id: blockId, field: 'cell' }, { block_id: blockId, field: 'text', field_index: 0 },
        { block_id: blockId, field: 'cell', field_index: -1 }, { block_id: blockId, field: 'cell', field_index: 99 },
        { block_id: blockId, field: 'latex' }, { block_id: blockId, field: 'text', offset: 0 },
        { block_id: blockId, field: 'text', ...pin, text_offset: 99999 }, { block_id: 'invalid' },
      ]
      for (const args of invalid) expect((await setup.call('paper_structure', { document_id: id, ...args })).isError, JSON.stringify(args)).toBe(true)
      await setup.toolFiber.dispose()
      expect(setup.ctx.tools.get('paper_structure')).toBeUndefined()
      await setup.ctx.plugin(PaperTools, { maxStructureOutputBytes: 1 })
      expect(text(await setup.call('paper_structure', { document_id: id }))).toContain('maxStructureOutputBytes')
    } finally { await setup.ctx.fiber.dispose() }
  })
})
