import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@deepseek-ai/dsh-tools'
import ResearchDocumentRuntime, {
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
        { kind: 'heading', headingLevel: 1, text: 'Introduction heading', bbox: rect },
        { kind: 'paragraph', text: 'Alpha shared evidence with extended context.', bbox: rect },
        { kind: 'heading', headingLevel: 2, text: 'Methods heading', bbox: rect },
        { kind: 'paragraph', text: 'Beta shared evidence with extended context.', bbox: rect },
        { kind: 'heading', headingLevel: 2, text: 'Results heading', bbox: rect },
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
  call(name: string, args: unknown, cwd?: string): Promise<ToolExecutionResult>
}> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(ResearchDocumentRuntime, {})
  await ctx.plugin(FakeFs)
  ctx.researchDocuments.registerParser(parser(options.result))
  if (options.config === undefined) await ctx.plugin(PaperTools)
  else await ctx.plugin(PaperTools, options.config)
  return {
    ctx,
    fs: ctx.fs as FakeFs,
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
  it('registers the bounded four-tool workflow and native-text/OCR guidance', async () => {
    const { ctx } = await mount()
    expect(ctx.tools.schemas().map(schema => schema.name)).toEqual([
      'paper_import',
      'paper_outline',
      'paper_search',
      'paper_read',
    ])
    const prompt = renderPrompt(await ctx.systemPrompt.assemble())
    expect(prompt).toContain('paper_import')
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
    const setup = await mount({ config: { maxOutlineEntries: 2, maxOutputTextChars: 20 } })
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
      config: { maxOutlineEntries: 2, maxSearchResults: 2, maxOutputTextChars: 20 },
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
      section_path: ['Introduction heading', 'Methods heading'],
      section_path_truncated: false,
      text: 'Beta shared evidence with extended context.',
      text_truncated: false,
    }])
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
  })
})
