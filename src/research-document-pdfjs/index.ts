/**
 * PDF.js provider for native PDF text, page geometry, and approximate text
 * blocks. OCR and semantic object extraction are intentionally separate
 * providers.
 * @module @f1star/dsh-research/research-document-pdfjs
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  ResearchDocumentError,
  type ParsedResearchDocumentBlock,
  type ParsedResearchDocumentPage,
  type ResearchDocumentParseRequest,
  type ResearchDocumentParseResult,
  type ResearchDocumentParser,
  type ResearchDocumentRect,
} from '../research-document/index.ts'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { TextItem } from 'pdfjs-dist/types/src/display/api.d.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'research-document-pdfjs'

/** Service Definition required for parser registration. */
export const inject = ['researchDocuments']

/** Stable parser id used by explicit provider selection. */
export const PDFJS_PARSER_ID = 'pdfjs'

/** Extraction revision; bump whenever block ordering or classification changes. */
export const PDFJS_PARSER_VERSION = 'pdfjs-native-text-v1'

/** Default inclusive physical-page limit for one import. */
export const DEFAULT_MAX_PAGES = 500

/** Default inclusive PDF.js text-item limit for one page. */
export const DEFAULT_MAX_TEXT_ITEMS_PER_PAGE = 100_000

/** PDF parsing resource policy. */
export interface Config {
  /** Inclusive physical-page limit. Defaults to 500. */
  readonly maxPages?: number
  /** Inclusive PDF.js text-item limit per page. Defaults to 100000. */
  readonly maxTextItemsPerPage?: number
}

/** Loader schema for PDF parsing resource limits. */
export const Config: z<Config> = z.object({
  maxPages: z.number().step(1).min(1).default(DEFAULT_MAX_PAGES),
  maxTextItemsPerPage: z.number().step(1).min(1).default(DEFAULT_MAX_TEXT_ITEMS_PER_PAGE),
})

interface ResolvedConfig {
  readonly maxPages: number
  readonly maxTextItemsPerPage: number
}

interface PositionedText {
  readonly text: string
  readonly x: number
  readonly baselineY: number
  readonly width: number
  readonly height: number
  readonly hasEOL: boolean
}

interface MutableLine {
  text: string
  left: number
  top: number
  right: number
  bottom: number
  baselineY: number
  lastRight: number
  height: number
}

type PdfMatrix = readonly [number, number, number, number, number, number]

/** Native-text parser implementation registered by this plugin. */
export class PdfJsResearchDocumentParser implements ResearchDocumentParser {
  readonly id = PDFJS_PARSER_ID
  private readonly config: ResolvedConfig

  constructor(private readonly ctx: Context, config: Config = {}) {
    this.config = {
      maxPages: positiveSafeInteger('maxPages', config.maxPages ?? DEFAULT_MAX_PAGES),
      maxTextItemsPerPage: positiveSafeInteger(
        'maxTextItemsPerPage',
        config.maxTextItemsPerPage ?? DEFAULT_MAX_TEXT_ITEMS_PER_PAGE,
      ),
    }
  }

  /** @returns true because PDF.js is bundled with this provider. */
  available(): boolean {
    return true
  }

  /**
   * Accept only the canonical PDF media type.
   * @param mediaType - declared media type from the importing consumer.
   * @returns whether this provider parses the declaration.
   */
  supports(mediaType: string): boolean {
    return mediaType.toLowerCase() === 'application/pdf'
  }

  /**
   * Parse all native text sequentially and release PDF.js resources before
   * settling. Cancellation destroys the loading task and is normalized to the
   * research-document abort code.
   * @param request - complete consumer-bounded PDF bytes.
   * @param signal - cooperative cancellation signal.
   * @returns pages with approximate normalized line rectangles.
   */
  async parse(
    request: ResearchDocumentParseRequest,
    signal?: AbortSignal,
  ): Promise<ResearchDocumentParseResult> {
    throwIfAborted(signal)
    const loadingTask = getDocument({
      // `Buffer.prototype.slice()` preserves the Buffer subclass, which PDF.js
      // rejects even though Buffer extends Uint8Array. Construct the exact
      // platform-neutral carrier and give PDF.js its own transferable copy.
      data: new Uint8Array(request.bytes),
      useSystemFonts: true,
    })
    const abort = (): void => {
      void loadingTask.destroy().catch((error: unknown) => {
        this.ctx.logger.debug(`PDF.js destroy after cancellation failed: ${errorMessage(error)}`)
      })
    }
    signal?.addEventListener('abort', abort, { once: true })
    let primaryFailure: unknown
    try {
      const document = await loadingTask.promise
      if (document.numPages > this.config.maxPages) {
        throw new ResearchDocumentError(
          `PDF has ${document.numPages} pages; the configured limit is ${this.config.maxPages}`,
          'RESEARCH_DOCUMENT_PDF_PAGE_LIMIT',
        )
      }
      const labels = await document.getPageLabels()
      const metadata = await document.getMetadata()
      throwIfAborted(signal)
      const titleValue = (metadata.info as Record<string, unknown>).Title
      const title = typeof titleValue === 'string' && titleValue.trim().length > 0
        ? titleValue.trim()
        : undefined
      const pages: ParsedResearchDocumentPage[] = []
      let hasNativeText = false
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        throwIfAborted(signal)
        const page = await document.getPage(pageNumber)
        try {
          const viewport = page.getViewport({ scale: 1 })
          const content = await page.getTextContent({ includeMarkedContent: false })
          throwIfAborted(signal)
          const textItems = content.items.filter(isTextItem)
          if (textItems.length > this.config.maxTextItemsPerPage) {
            throw new ResearchDocumentError(
              `PDF page ${pageNumber} has ${textItems.length} text items; the configured limit is ${this.config.maxTextItemsPerPage}`,
              'RESEARCH_DOCUMENT_PDF_TEXT_ITEM_LIMIT',
            )
          }
          const blocks = lineBlocks(textItems, viewport.transform, viewport.width, viewport.height)
          if (blocks.length > 0) hasNativeText = true
          pages.push({
            pageIndex: pageNumber - 1,
            ...(labels?.[pageNumber - 1] !== undefined ? { pageLabel: labels[pageNumber - 1] } : {}),
            width: viewport.width,
            height: viewport.height,
            blocks,
          })
        } finally {
          page.cleanup()
        }
      }
      return {
        parserVersion: PDFJS_PARSER_VERSION,
        ...(title !== undefined ? { title } : {}),
        extraction: hasNativeText
          ? { text: 'native', layout: 'approximate' }
          : { text: 'none', layout: 'page-only' },
        pages,
      }
    } catch (error: unknown) {
      primaryFailure = normalizeParseError(error, signal)
      throw primaryFailure
    } finally {
      signal?.removeEventListener('abort', abort)
      try {
        await loadingTask.destroy()
      } catch (error: unknown) {
        if (primaryFailure === undefined) {
          throw new ResearchDocumentError(
            'PDF.js resource cleanup failed',
            'RESEARCH_DOCUMENT_PDF_CLEANUP_FAILED',
            { cause: error },
          )
        }
        this.ctx.logger.debug(`PDF.js cleanup after parse failure also failed: ${errorMessage(error)}`)
      }
    }
  }
}

/** Register one PDF.js parser contribution. */
export function apply(ctx: Context, config: Config): () => void {
  return ctx.researchDocuments.registerParser(new PdfJsResearchDocumentParser(ctx, config))
}

function positiveSafeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`research-document-pdfjs: ${name} must be a positive safe integer`)
  }
  return value
}

function isTextItem(value: unknown): value is TextItem {
  return typeof value === 'object' && value !== null && 'str' in value
}

function lineBlocks(
  items: readonly TextItem[],
  viewportTransform: unknown,
  pageWidth: number,
  pageHeight: number,
): ParsedResearchDocumentBlock[] {
  const positioned = items.map(item => positionItem(item, viewportTransform))
  const lines = mergeLines(positioned)
  const bodyHeight = lowerMedian(lines.map(line => line.bottom - line.top).filter(height => height > 0))
  return lines.flatMap((line) => {
    const text = normalizeLineText(line.text)
    if (text.length === 0) return []
    const height = line.bottom - line.top
    const headingLevel = classifyHeading(text, height, bodyHeight)
    return [{
      kind: headingLevel === undefined ? 'paragraph' : 'heading',
      text,
      bbox: normalizedRect(line.left, line.top, line.right, line.bottom, pageWidth, pageHeight),
      ...(headingLevel !== undefined ? { headingLevel } : {}),
    } satisfies ParsedResearchDocumentBlock]
  })
}

function positionItem(item: TextItem, viewportTransform: unknown): PositionedText {
  const transform = multiplyTransforms(
    requirePdfMatrix('viewport', viewportTransform),
    requirePdfMatrix('text item', item.transform),
  )
  const height = Math.max(Math.hypot(transform[2], transform[3]), item.height)
  const width = Math.max(0, item.width)
  return {
    text: item.str,
    x: transform[4],
    baselineY: transform[5],
    width,
    height,
    hasEOL: item.hasEOL,
  }
}

function requirePdfMatrix(name: string, value: unknown): PdfMatrix {
  if (!Array.isArray(value)) throw new TypeError(`PDF.js returned a non-array ${name} transform`)
  if (value.length !== 6) throw new TypeError(`PDF.js returned an invalid-length ${name} transform`)
  for (const entry of value) {
    if (typeof entry !== 'number') throw new TypeError(`PDF.js returned a non-numeric ${name} transform`)
    if (!Number.isFinite(entry)) throw new TypeError(`PDF.js returned a non-finite ${name} transform`)
  }
  return value as unknown as PdfMatrix
}

function multiplyTransforms(
  left: PdfMatrix,
  right: PdfMatrix,
): PdfMatrix {
  const [a, b, c, d, e, f] = left
  const [g, h, i, j, k, l] = right
  return [
    a * g + c * h,
    b * g + d * h,
    a * i + c * j,
    b * i + d * j,
    a * k + c * l + e,
    b * k + d * l + f,
  ]
}

function mergeLines(items: readonly PositionedText[]): MutableLine[] {
  const lines: MutableLine[] = []
  let current: MutableLine | undefined
  const flush = (): void => {
    if (current !== undefined) lines.push(current)
    current = undefined
  }
  for (const item of items) {
    const top = item.baselineY - item.height
    const right = item.x + item.width
    if (current === undefined) {
      current = newLine(item, top, right)
    } else {
      const tolerance = Math.max(current.height, item.height) * 0.5
      const sameLine = Math.abs(item.baselineY - current.baselineY) <= tolerance
        && item.x >= current.left - tolerance
      if (!sameLine) {
        flush()
        current = newLine(item, top, right)
      } else {
        current.text += separator(current.text, item.text, item.x - current.lastRight, item.height) + item.text
        current.left = Math.min(current.left, item.x)
        current.top = Math.min(current.top, top)
        current.right = Math.max(current.right, right)
        current.bottom = Math.max(current.bottom, item.baselineY)
        current.lastRight = right
        current.height = Math.max(current.height, item.height)
      }
    }
    if (item.hasEOL) flush()
  }
  flush()
  return lines
}

function newLine(item: PositionedText, top: number, right: number): MutableLine {
  return {
    text: item.text,
    left: item.x,
    top,
    right,
    bottom: item.baselineY,
    baselineY: item.baselineY,
    lastRight: right,
    height: item.height,
  }
}

function separator(leftText: string, rightText: string, gap: number, height: number): string {
  if (/\s$/u.test(leftText) || /^\s/u.test(rightText)) return ''
  return gap > height * 0.15 ? ' ' : ''
}

function normalizeLineText(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ')
}

function lowerMedian(values: readonly number[]): number {
  if (values.length === 0) return 0
  const ordered = [...values].sort((left, right) => left - right)
  return ordered[Math.floor((ordered.length - 1) / 2)] as number
}

function classifyHeading(text: string, height: number, bodyHeight: number): 1 | 2 | 3 | undefined {
  if (bodyHeight <= 0 || text.length > 180 || height < bodyHeight * 1.25) return undefined
  const ratio = height / bodyHeight
  if (ratio >= 1.8) return 1
  if (ratio >= 1.45) return 2
  return 3
}

function normalizedRect(
  left: number,
  top: number,
  right: number,
  bottom: number,
  pageWidth: number,
  pageHeight: number,
): ResearchDocumentRect {
  const x1 = clamp(left / pageWidth)
  const y1 = clamp(top / pageHeight)
  const x2 = clamp(right / pageWidth)
  const y2 = clamp(bottom / pageHeight)
  return { x: x1, y: y1, width: Math.max(0, x2 - x1), height: Math.max(0, y2 - y1) }
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function normalizeParseError(error: unknown, signal: AbortSignal | undefined): unknown {
  if (signal?.aborted) return abortedError()
  if (error instanceof ResearchDocumentError) return error
  if (error instanceof Error && error.name === 'PasswordException') {
    return new ResearchDocumentError(
      'encrypted PDF requires a password and cannot be imported by this provider',
      'RESEARCH_DOCUMENT_PDF_ENCRYPTED',
      { cause: error },
    )
  }
  return new ResearchDocumentError(
    `PDF.js could not parse the document: ${errorMessage(error)}`,
    'RESEARCH_DOCUMENT_PDF_PARSE_FAILED',
    { cause: error },
  )
}

function abortedError(): ResearchDocumentError {
  return new ResearchDocumentError('PDF import aborted', 'RESEARCH_DOCUMENT_ABORTED')
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortedError()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
