import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ResearchDocumentRuntime from '../../src/research-document/index.ts'
import {
  PDFJS_PARSER_ID,
  PDFJS_PARSER_VERSION,
  PdfJsResearchDocumentParser,
} from '../../src/research-document-pdfjs/index.ts'
import { RESEARCH_PDF_BYTES } from './fixture.ts'

async function mount(config: ConstructorParameters<typeof PdfJsResearchDocumentParser>[1] = {}) {
  const ctx = new Context()
  await ctx.plugin(ResearchDocumentRuntime, {})
  const parser = new PdfJsResearchDocumentParser(ctx, config)
  ctx.researchDocuments.registerParser(parser)
  return { ctx, parser }
}

describe('PDF.js research-document provider', () => {
  it('extracts a visually verified native-text PDF with versioned page anchors', async () => {
    const { ctx } = await mount()
    const document = await ctx.researchDocuments.import({
      bytes: RESEARCH_PDF_BYTES,
      mediaType: 'application/pdf',
    })

    expect(document).toMatchObject({
      title: 'Research Harness Fixture',
      parser: { id: PDFJS_PARSER_ID, version: PDFJS_PARSER_VERSION },
      extraction: { text: 'native', layout: 'approximate' },
      pageCount: 2,
      blockCount: 7,
    })
    expect(ctx.researchDocuments.outline(document.id).map(entry => entry.text)).toEqual([
      'Research Harness Fixture',
      'Methods',
      'Results',
    ])
    const hit = ctx.researchDocuments.search(document.id, 'anchor beta', 1)[0]
    expect(hit?.text).toContain('deterministic in-document retrieval')
    expect(hit?.locator).toMatchObject({
      parserId: PDFJS_PARSER_ID,
      parserVersion: PDFJS_PARSER_VERSION,
      pageIndex: 1,
    })
    expect(hit?.locator.bbox.x).toBeGreaterThanOrEqual(0)
    expect(hit?.locator.bbox.width).toBeLessThanOrEqual(1)
  })

  it('accepts only the canonical PDF media type, case-insensitively', async () => {
    const { parser } = await mount()
    expect(parser.available()).toBe(true)
    expect(parser.supports('application/pdf')).toBe(true)
    expect(parser.supports('APPLICATION/PDF')).toBe(true)
    expect(parser.supports('text/plain')).toBe(false)
  })

  it('rejects invalid limits during construction', async () => {
    const ctx = new Context()
    expect(() => new PdfJsResearchDocumentParser(ctx, { maxPages: 0 })).toThrow('maxPages')
    expect(() => new PdfJsResearchDocumentParser(ctx, { maxTextItemsPerPage: 1.5 })).toThrow(
      'maxTextItemsPerPage',
    )
  })

  it('enforces page and per-page text-item limits', async () => {
    const pageLimited = await mount({ maxPages: 1 })
    await expect(pageLimited.parser.parse({ bytes: RESEARCH_PDF_BYTES, mediaType: 'application/pdf' }))
      .rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_PDF_PAGE_LIMIT' })

    const itemLimited = await mount({ maxTextItemsPerPage: 1 })
    await expect(itemLimited.parser.parse({ bytes: RESEARCH_PDF_BYTES, mediaType: 'application/pdf' }))
      .rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_PDF_TEXT_ITEM_LIMIT' })
  })

  it('normalizes pre-cancellation and malformed bytes', async () => {
    const { parser } = await mount()
    const controller = new AbortController()
    controller.abort()
    await expect(parser.parse({ bytes: RESEARCH_PDF_BYTES, mediaType: 'application/pdf' }, controller.signal))
      .rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_ABORTED' })
    await expect(parser.parse({ bytes: new Uint8Array([1, 2, 3]), mediaType: 'application/pdf' }))
      .rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_PDF_PARSE_FAILED' })
  })
})
