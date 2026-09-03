import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ResearchDocumentRuntime from '../../src/research-document/index.ts'

const { getDocumentMock } = vi.hoisted(() => ({ getDocumentMock: vi.fn() }))

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ getDocument: getDocumentMock }))

import {
  PdfJsResearchDocumentParser,
  apply,
} from '../../src/research-document-pdfjs/index.ts'

interface MockPage {
  readonly cleanup: ReturnType<typeof vi.fn<() => void>>
  readonly getTextContent: ReturnType<typeof vi.fn<() => Promise<{ readonly items: readonly unknown[] }>>>
  readonly getViewport: ReturnType<typeof vi.fn<() => {
    readonly transform: unknown
    readonly width: number
    readonly height: number
  }>>
}

interface MockDocument {
  readonly numPages: number
  readonly getMetadata: ReturnType<typeof vi.fn<() => Promise<{ readonly info: Record<string, unknown> }>>>
  readonly getPage: ReturnType<typeof vi.fn<(pageNumber: number) => Promise<MockPage>>>
  readonly getPageLabels: ReturnType<typeof vi.fn<() => Promise<readonly (string | undefined)[] | null>>>
}

interface MockTask {
  readonly promise: Promise<MockDocument>
  readonly destroy: ReturnType<typeof vi.fn<() => Promise<void>>>
}

interface TextItemOptions {
  readonly baseline?: number
  readonly hasEOL?: boolean
  readonly height?: number
  readonly transform?: unknown
  readonly width?: number
  readonly x?: number
}

const contexts: Context[] = []
const IDENTITY_MATRIX = [1, 0, 0, 1, 0, 0] as const

afterEach(async () => {
  getDocumentMock.mockReset()
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
})

function createContext(): Context {
  const ctx = new Context()
  contexts.push(ctx)
  return ctx
}

function textItem(text: string, options: TextItemOptions = {}): Record<string, unknown> {
  const height = options.height ?? 10
  const x = options.x ?? 0
  const baseline = options.baseline ?? 20
  return {
    str: text,
    dir: 'ltr',
    transform: options.transform ?? [1, 0, 0, height, x, baseline],
    width: options.width ?? 10,
    height,
    fontName: 'FixtureFont',
    hasEOL: options.hasEOL ?? true,
  }
}

function mockPage(
  items: readonly unknown[],
  viewport: { readonly transform?: unknown; readonly width?: number; readonly height?: number } = {},
): MockPage {
  return {
    cleanup: vi.fn<() => void>(),
    getTextContent: vi.fn<() => Promise<{ readonly items: readonly unknown[] }>>()
      .mockResolvedValue({ items }),
    getViewport: vi.fn<() => { readonly transform: unknown; readonly width: number; readonly height: number }>()
      .mockReturnValue({
        transform: viewport.transform ?? IDENTITY_MATRIX,
        width: viewport.width ?? 100,
        height: viewport.height ?? 100,
      }),
  }
}

function mockDocument(
  pages: readonly MockPage[],
  options: { readonly labels?: readonly (string | undefined)[] | null; readonly title?: unknown } = {},
): MockDocument {
  return {
    numPages: pages.length,
    getMetadata: vi.fn<() => Promise<{ readonly info: Record<string, unknown> }>>()
      .mockResolvedValue({ info: { Title: options.title } }),
    getPage: vi.fn<(pageNumber: number) => Promise<MockPage>>(pageNumber =>
      Promise.resolve(pages[pageNumber - 1] as MockPage)),
    getPageLabels: vi.fn<() => Promise<readonly (string | undefined)[] | null>>()
      .mockResolvedValue(options.labels ?? null),
  }
}

function resolvedDestroy(): ReturnType<typeof vi.fn<() => Promise<void>>> {
  return vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
}

function queueTask(promise: Promise<MockDocument>, destroy = resolvedDestroy()): MockTask {
  const task = { promise, destroy }
  getDocumentMock.mockReturnValueOnce(task)
  return task
}

function queueDocument(document: MockDocument, destroy = resolvedDestroy()): MockTask {
  return queueTask(Promise.resolve(document), destroy)
}

describe('PDF.js provider lifecycle and layout branches', () => {
  it('registers the provider contribution and applies constructor defaults', async () => {
    const ctx = createContext()
    await ctx.plugin(ResearchDocumentRuntime, {})
    const dispose = apply(ctx, {})
    expect(new PdfJsResearchDocumentParser(ctx).available()).toBe(true)
    dispose()
  })

  it('reports a page-only import when a page has no text items', async () => {
    const page = mockPage([])
    queueDocument(mockDocument([page], { labels: [undefined], title: 42 }))
    const result = await new PdfJsResearchDocumentParser(createContext()).parse({
      bytes: Uint8Array.of(1),
      mediaType: 'application/pdf',
    })
    expect(result).toMatchObject({ extraction: { text: 'none', layout: 'page-only' } })
    expect(result).not.toHaveProperty('title')
    expect(result.pages[0]).not.toHaveProperty('pageLabel')
    expect(page.cleanup).toHaveBeenCalledOnce()
  })

  it('groups text, classifies all heading levels, and normalizes rectangles', async () => {
    const longText = 'L'.repeat(181)
    const items = [
      textItem('A', { baseline: 95, hasEOL: false, width: 5 }),
      textItem('B', { baseline: 95, hasEOL: false, width: 5, x: 10 }),
      textItem(' C', { baseline: 95, hasEOL: false, width: 5, x: 15 }),
      textItem('D ', { baseline: 95, hasEOL: false, width: 5, x: 20 }),
      textItem('E', { baseline: 95, width: 5, x: 25 }),
      textItem('   ', { baseline: 85 }),
      textItem('Body one', { baseline: 75 }),
      textItem('Body two', { baseline: 65 }),
      textItem('Body three', { baseline: 55 }),
      textItem(longText, { baseline: 45, height: 20 }),
      textItem('Level One', { baseline: 35, height: 18 }),
      textItem('Level Two', { baseline: 25, height: 15 }),
      textItem('Level Three', { baseline: 15, height: 13 }),
      textItem('Wide', { baseline: 5, width: 150, x: -10 }),
      textItem('Zero width', { baseline: -5, width: -4, x: -10 }),
      textItem('Forward', { baseline: -15, hasEOL: false, x: 50 }),
      textItem('Back', { baseline: -15, x: 0 }),
      { type: 'beginMarkedContent', id: 'ignored' },
    ]
    queueDocument(mockDocument([mockPage(items)], { labels: ['A'], title: '   ' }))
    const result = await new PdfJsResearchDocumentParser(createContext()).parse({
      bytes: Uint8Array.of(2),
      mediaType: 'application/pdf',
    })
    const blocks = result.pages[0]?.blocks ?? []
    expect(blocks.map(block => block.headingLevel).filter(level => level !== undefined)).toEqual([1, 2, 3])
    expect(blocks[0]?.text).toBe('A B CD E')
    expect(blocks.some(block => block.text === '')).toBe(false)
    expect(blocks.find(block => block.text === 'Wide')?.bbox).toMatchObject({ x: 0, width: 1 })
    expect(result.pages[0]).toMatchObject({ pageLabel: 'A' })
    expect(result).not.toHaveProperty('title')
  })

  it.each([
    ['non-array', { invalid: true }],
    ['invalid-length', [1, 0]],
    ['non-numeric', [1, 0, 0, 1, 'x', 0]],
    ['non-finite', [1, 0, 0, 1, Number.POSITIVE_INFINITY, 0]],
  ])('rejects a %s text transform', async (_label, transform) => {
    queueDocument(mockDocument([mockPage([textItem('bad', { transform })])]))
    await expect(new PdfJsResearchDocumentParser(createContext()).parse({
      bytes: Uint8Array.of(3),
      mediaType: 'application/pdf',
    })).rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_PDF_PARSE_FAILED' })
  })

  it('rejects an invalid viewport transform', async () => {
    queueDocument(mockDocument([mockPage([textItem('bad')], { transform: { invalid: true } })]))
    await expect(new PdfJsResearchDocumentParser(createContext()).parse({
      bytes: Uint8Array.of(4),
      mediaType: 'application/pdf',
    })).rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_PDF_PARSE_FAILED' })
  })

  it('normalizes non-finite zero-page geometry', async () => {
    const page = mockPage([
      textItem('flat', { baseline: 0, height: 0, width: 0, transform: [0, 0, 0, 0, 0, 0] }),
    ], { width: 0, height: 0 })
    queueDocument(mockDocument([page]))
    const result = await new PdfJsResearchDocumentParser(createContext()).parse({
      bytes: Uint8Array.of(5),
      mediaType: 'application/pdf',
    })
    expect(result.pages[0]?.blocks[0]?.bbox).toEqual({ x: 0, y: 0, width: 0, height: 0 })
  })

  it('normalizes cancellation while parsing and contains destroy rejection', async () => {
    const destroy = vi.fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error('abort destroy failed'))
      .mockResolvedValue(undefined)
    queueDocument(mockDocument([mockPage([])]), destroy)
    const controller = new AbortController()
    const parsing = new PdfJsResearchDocumentParser(createContext()).parse({
      bytes: Uint8Array.of(6),
      mediaType: 'application/pdf',
    }, controller.signal)
    controller.abort()
    await expect(parsing).rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_ABORTED' })
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('honors cancellation that arrives with the final page text', async () => {
    const controller = new AbortController()
    const page = mockPage([textItem('late')])
    page.getTextContent.mockImplementationOnce(() => {
      controller.abort()
      return Promise.resolve({ items: [textItem('late')] })
    })
    const task = queueDocument(mockDocument([page]))
    const parsing = new PdfJsResearchDocumentParser(createContext()).parse({
      bytes: Uint8Array.of(10),
      mediaType: 'application/pdf',
    }, controller.signal)
    await expect(parsing).rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_ABORTED' })
    expect(page.cleanup).toHaveBeenCalledOnce()
    expect(task.destroy).toHaveBeenCalledTimes(2)
  })

  it('keeps a primary failure when cleanup also fails', async () => {
    const destroy = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('cleanup failed'))
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- PDF.js may reject with arbitrary values.
    queueTask(Promise.reject('bad payload'), destroy)
    const parsing = new PdfJsResearchDocumentParser(createContext()).parse({
      bytes: Uint8Array.of(7),
      mediaType: 'application/pdf',
    })
    await expect(parsing).rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_PDF_PARSE_FAILED' })
    await expect(parsing).rejects.toThrow('bad payload')
  })

  it('reports password and successful-parse cleanup failures separately', async () => {
    const password = new Error('password required')
    password.name = 'PasswordException'
    queueTask(Promise.reject(password))
    const parser = new PdfJsResearchDocumentParser(createContext())
    await expect(parser.parse({ bytes: Uint8Array.of(8), mediaType: 'application/pdf' }))
      .rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_PDF_ENCRYPTED' })

    queueDocument(mockDocument([]), vi.fn<() => Promise<void>>().mockRejectedValue(new Error('destroy failed')))
    await expect(parser.parse({ bytes: Uint8Array.of(9), mediaType: 'application/pdf' }))
      .rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_PDF_CLEANUP_FAILED' })
  })
})
