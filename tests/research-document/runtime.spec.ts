import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ResearchDocumentRuntime, {
  ResearchDocumentBlockId,
  ResearchDocumentError,
  ResearchDocumentId,
  type ResearchDocumentParseResult,
  type ResearchDocumentParser,
} from '../../src/research-document/index.ts'

const rect = { x: 0.1, y: 0.2, width: 0.3, height: 0.04 }

function parsed(parserVersion = 'fixture-v1'): ResearchDocumentParseResult {
  return {
    parserVersion,
    title: 'Fixture Paper',
    extraction: { text: 'native', layout: 'approximate' },
    pages: [
      {
        pageIndex: 0,
        pageLabel: 'i',
        width: 612,
        height: 792,
        blocks: [
          { kind: 'heading', headingLevel: 1, text: 'Introduction', bbox: rect },
          { kind: 'paragraph', text: 'Alpha evidence and shared term.', bbox: rect },
        ],
      },
      {
        pageIndex: 1,
        width: 612,
        height: 792,
        blocks: [
          { kind: 'heading', headingLevel: 2, text: 'Results', bbox: rect },
          { kind: 'paragraph', text: 'Beta evidence and shared term.', bbox: rect },
        ],
      },
    ],
  }
}

function parser(options: {
  id?: string
  available?: boolean
  supports?: boolean
  version?: string
  calls?: ResearchDocumentParseRequestLog[]
  onParse?: (signal: AbortSignal | undefined) => void
} = {}): ResearchDocumentParser {
  return {
    id: options.id ?? 'fixture',
    available: () => options.available ?? true,
    supports: () => options.supports ?? true,
    parse: (request, signal) => {
      options.calls?.push({
        bytes: request.bytes,
        mediaType: request.mediaType,
        ...(signal !== undefined ? { signal } : {}),
      })
      options.onParse?.(signal)
      return Promise.resolve(parsed(options.version))
    },
  }
}

interface ResearchDocumentParseRequestLog {
  readonly bytes: Uint8Array
  readonly mediaType: string
  readonly signal?: AbortSignal
}

async function mount(config: ConstructorParameters<typeof ResearchDocumentRuntime>[1] = {}) {
  const ctx = new Context()
  await ctx.plugin(ResearchDocumentRuntime, config)
  return { ctx, runtime: ctx.researchDocuments }
}

describe('research-document provider selection', () => {
  it('validates retention config and exposes typed errors', async () => {
    const defaultContext = new Context()
    expect(new ResearchDocumentRuntime(defaultContext)).toBeInstanceOf(ResearchDocumentRuntime)
    await defaultContext.fiber.dispose()

    const ctx = new Context()
    expect(() => new ResearchDocumentRuntime(ctx, { maxDocuments: 0 })).toThrow('maxDocuments')
    const error = new ResearchDocumentError('boom', 'CUSTOM_PROVIDER_CODE')
    expect(error).toMatchObject({ name: 'ResearchDocumentError', code: 'CUSTOM_PROVIDER_CODE' })
  })

  it('registers and disposes one parser contribution', async () => {
    const { runtime } = await mount()
    const dispose = runtime.registerParser(parser())
    await expect(runtime.import({ bytes: Uint8Array.of(1), mediaType: 'application/pdf' })).resolves.toBeDefined()
    dispose()
    await expect(runtime.import({ bytes: Uint8Array.of(2), mediaType: 'application/pdf' }))
      .rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_PROVIDER_UNAVAILABLE' })
  })

  it('rejects duplicate ids', async () => {
    const { runtime } = await mount()
    runtime.registerParser(parser())
    expect(() => runtime.registerParser(parser())).toThrow(
      expect.objectContaining({ code: 'RESEARCH_DOCUMENT_DUPLICATE_PROVIDER' }),
    )
  })

  it('fails explicit missing and unusable selections', async () => {
    const missing = await mount({ parserProvider: 'chosen' })
    await expect(missing.runtime.import({ bytes: Uint8Array.of(1), mediaType: 'application/pdf' }))
      .rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_PROVIDER_CONFIGURED_MISSING' })

    const unusable = await mount({ parserProvider: 'chosen' })
    unusable.runtime.registerParser(parser({ id: 'chosen', available: false }))
    await expect(unusable.runtime.import({ bytes: Uint8Array.of(1), mediaType: 'application/pdf' }))
      .rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_PROVIDER_CONFIGURED_UNAVAILABLE' })
  })

  it('auto-selects exactly one usable supporting parser and rejects ambiguity', async () => {
    const selected = await mount()
    selected.runtime.registerParser(parser({ id: 'unavailable', available: false }))
    selected.runtime.registerParser(parser({ id: 'wrong-media', supports: false }))
    selected.runtime.registerParser(parser({ id: 'selected' }))
    await expect(selected.runtime.import({ bytes: Uint8Array.of(1), mediaType: 'application/pdf' }))
      .resolves.toMatchObject({ parser: { id: 'selected' } })

    const ambiguous = await mount()
    ambiguous.runtime.registerParser(parser({ id: 'a' }))
    ambiguous.runtime.registerParser(parser({ id: 'b' }))
    await expect(ambiguous.runtime.import({ bytes: Uint8Array.of(1), mediaType: 'application/pdf' }))
      .rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_PROVIDER_AMBIGUOUS' })
  })

  it('uses an explicit usable parser despite another usable parser', async () => {
    const { runtime } = await mount({ parserProvider: 'chosen' })
    runtime.registerParser(parser({ id: 'other' }))
    runtime.registerParser(parser({ id: 'chosen' }))
    await expect(runtime.import({ bytes: Uint8Array.of(1), mediaType: 'application/pdf' }))
      .resolves.toMatchObject({ parser: { id: 'chosen' } })
  })
})

describe('research-document materialization and reading', () => {
  it('assigns exact versioned anchors, section paths, and deterministic reading order', async () => {
    const { runtime } = await mount()
    runtime.registerParser(parser())
    const document = await runtime.import({ bytes: new TextEncoder().encode('paper'), mediaType: 'application/pdf' })

    expect(document.id).toMatch(/^sha256:[0-9a-f]{64}$/u)
    expect(document).toMatchObject({
      title: 'Fixture Paper',
      mediaType: 'application/pdf',
      pageCount: 2,
      blockCount: 4,
    })
    expect(document.pages[0]?.blocks.map(block => block.readingOrder)).toEqual([0, 1])
    expect(document.pages[1]?.blocks[1]?.sectionPath).toEqual(['Introduction', 'Results'])
    const locator = document.pages[0]?.blocks[0]?.locator
    expect(locator).toMatchObject({
      documentId: document.id,
      parserId: 'fixture',
      parserVersion: 'fixture-v1',
      pageIndex: 0,
      pageLabel: 'i',
      bbox: rect,
    })
    expect(locator?.blockId).toMatch(/^block:[0-9a-f]{64}$/u)
    expect(locator?.quoteHash).toMatch(/^sha256:[0-9a-f]{64}$/u)
  })

  it('caches exact retained bytes and forwards one caller signal', async () => {
    const calls: ResearchDocumentParseRequestLog[] = []
    const { runtime } = await mount()
    runtime.registerParser(parser({ calls }))
    const controller = new AbortController()
    const request = { bytes: Uint8Array.of(1, 2, 3), mediaType: 'application/pdf' }
    const first = await runtime.import(request, controller.signal)
    const second = await runtime.import(request)
    expect(second).toBe(first)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ mediaType: 'application/pdf', signal: controller.signal })
    expect(calls[0]?.bytes).not.toBe(request.bytes)
    expect(calls[0]?.bytes).toEqual(request.bytes)
  })

  it('snapshots caller-owned bytes before asynchronous provider work', async () => {
    const calls: ResearchDocumentParseRequestLog[] = []
    const { runtime } = await mount()
    runtime.registerParser(parser({ calls }))
    const bytes = Uint8Array.of(1, 2, 3)
    const imported = runtime.import({ bytes, mediaType: 'application/pdf' })
    bytes.fill(9)
    await imported
    expect(calls[0]?.bytes).toEqual(Uint8Array.of(1, 2, 3))
  })

  it('rejects a new media type for retained source bytes', async () => {
    const { runtime } = await mount()
    runtime.registerParser(parser())
    const bytes = Uint8Array.of(1, 2, 3)
    await runtime.import({ bytes, mediaType: 'application/pdf' })
    await expect(runtime.import({ bytes, mediaType: 'text/plain' })).rejects.toMatchObject({
      code: 'RESEARCH_DOCUMENT_MEDIA_TYPE_MISMATCH',
    })
  })

  it('fails cancellation before and immediately after provider work', async () => {
    const before = await mount()
    before.runtime.registerParser(parser())
    const already = new AbortController()
    already.abort()
    await expect(before.runtime.import({ bytes: Uint8Array.of(1), mediaType: 'application/pdf' }, already.signal))
      .rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_ABORTED' })

    const after = await mount()
    const during = new AbortController()
    after.runtime.registerParser(parser({ onParse: () => {
      during.abort()
    } }))
    await expect(after.runtime.import({ bytes: Uint8Array.of(2), mediaType: 'application/pdf' }, during.signal))
      .rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_ABORTED' })
  })

  it('evicts the least-recently-used retained version', async () => {
    const { runtime } = await mount({ maxDocuments: 2 })
    runtime.registerParser(parser())
    const first = await runtime.import({ bytes: Uint8Array.of(1), mediaType: 'application/pdf' })
    const second = await runtime.import({ bytes: Uint8Array.of(2), mediaType: 'application/pdf' })
    runtime.get(first.id)
    await runtime.import({ bytes: Uint8Array.of(3), mediaType: 'application/pdf' })
    expect(runtime.get(first.id)).toBe(first)
    expect(() => runtime.get(second.id)).toThrow(
      expect.objectContaining({ code: 'RESEARCH_DOCUMENT_NOT_FOUND' }),
    )
  })

  it('peeks at current retention without refreshing LRU order', async () => {
    const { runtime } = await mount({ maxDocuments: 2 })
    runtime.registerParser(parser())
    const first = await runtime.import({ bytes: Uint8Array.of(1), mediaType: 'application/pdf' })
    const second = await runtime.import({ bytes: Uint8Array.of(2), mediaType: 'application/pdf' })
    expect(runtime.peek(first.id)).toBe(first)
    await runtime.import({ bytes: Uint8Array.of(3), mediaType: 'application/pdf' })
    expect(runtime.peek(first.id)).toBeUndefined()
    expect(runtime.peek(second.id)).toBe(second)
  })

  it('projects outline, scores phrase hits, and reads an anchored window', async () => {
    const { runtime } = await mount()
    runtime.registerParser(parser())
    const document = await runtime.import({ bytes: Uint8Array.of(1), mediaType: 'application/pdf' })
    const outline = runtime.outline(document.id)
    expect(outline.map(entry => [entry.level, entry.text])).toEqual([
      [1, 'Introduction'],
      [2, 'Results'],
    ])

    const hits = runtime.search(document.id, 'shared term', 2)
    expect(hits.map(hit => hit.text)).toEqual([
      'Alpha evidence and shared term.',
      'Beta evidence and shared term.',
    ])
    expect(hits[0]?.score).toBeGreaterThan(100)
    const focus = document.pages[1]?.blocks[1]
    expect(focus).toBeDefined()
    expect(runtime.read(document.id, focus!.id, 1, 1).blocks.map(block => block.text)).toEqual([
      'Results',
      'Beta evidence and shared term.',
    ])
  })

  it('rejects empty searches, foreign blocks, and absent documents', async () => {
    const { runtime } = await mount()
    runtime.registerParser(parser())
    const document = await runtime.import({ bytes: Uint8Array.of(1), mediaType: 'application/pdf' })
    expect(() => runtime.search(document.id, '  ', 1)).toThrow(
      expect.objectContaining({ code: 'RESEARCH_DOCUMENT_EMPTY_QUERY' }),
    )
    expect(() => runtime.read(document.id, ResearchDocumentBlockId('block:foreign'), 0, 0)).toThrow(
      expect.objectContaining({ code: 'RESEARCH_DOCUMENT_BLOCK_NOT_FOUND' }),
    )
    expect(() => runtime.get(ResearchDocumentId(`sha256:${'0'.repeat(64)}`))).toThrow(
      expect.objectContaining({ code: 'RESEARCH_DOCUMENT_NOT_FOUND' }),
    )
  })

  it('rejects invalid search and read bounds at the service API', async () => {
    const { runtime } = await mount()
    runtime.registerParser(parser())
    const document = await runtime.import({ bytes: Uint8Array.of(1), mediaType: 'application/pdf' })
    const blockId = document.pages[0]!.blocks[0]!.id
    expect(() => runtime.search(document.id, 'evidence', 0)).toThrow('maxResults')
    expect(() => runtime.search(document.id, 'evidence', 1.5)).toThrow('maxResults')
    expect(() => runtime.read(document.id, blockId, -1, 0)).toThrow('before')
    expect(() => runtime.read(document.id, blockId, 0, 0.5)).toThrow('after')
  })

  it('binds block identity to parser revision and defaults heading level without sparse ancestry', async () => {
    const custom = (version: string): ResearchDocumentParser => ({
      ...parser({ version }),
      parse: () => Promise.resolve({
        parserVersion: version,
        extraction: { text: 'native', layout: 'approximate' },
        pages: [{
          pageIndex: 0,
          width: 10,
          height: 10,
          blocks: [{ kind: 'heading', text: 'Deep heading', bbox: rect }],
        }],
      }),
    })
    const firstRuntime = await mount()
    firstRuntime.runtime.registerParser(custom('v1'))
    const first = await firstRuntime.runtime.import({ bytes: Uint8Array.of(9), mediaType: 'application/pdf' })
    const secondRuntime = await mount()
    secondRuntime.runtime.registerParser(custom('v2'))
    const second = await secondRuntime.runtime.import({ bytes: Uint8Array.of(9), mediaType: 'application/pdf' })
    expect(first.pages[0]?.blocks[0]).toMatchObject({ headingLevel: 1, sectionPath: ['Deep heading'] })
    expect(first.pages[0]?.blocks[0]?.id).not.toBe(second.pages[0]?.blocks[0]?.id)
  })
})
