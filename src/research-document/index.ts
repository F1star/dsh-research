/**
 * Provider-neutral runtime for importing parsed research
 * documents and reading stable, content-derived block anchors.
 * @module @f1star/dsh-research/research-document
 */

import { createHash } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import {
  ResearchDocumentBlockId,
  ResearchDocumentId,
  ResearchDocumentQuoteHash,
} from './types.ts'
import type {
  ResearchDocument,
  ResearchDocumentBlock,
  ResearchDocumentOutlineEntry,
  ResearchDocumentParser,
  ResearchDocumentReadResult,
  ResearchDocumentSearchHit,
} from './types.ts'

export type {
  ParsedResearchDocumentBlock,
  ParsedResearchDocumentPage,
  ResearchDocument,
  ResearchDocumentBlock,
  ResearchDocumentBlockLocator,
  ResearchDocumentExtraction,
  ResearchDocumentOutlineEntry,
  ResearchDocumentPage,
  ResearchDocumentParseRequest,
  ResearchDocumentParseResult,
  ResearchDocumentParser,
  ResearchDocumentReadResult,
  ResearchDocumentRect,
  ResearchDocumentSearchHit,
} from './types.ts'

export {
  ResearchDocumentBlockId,
  ResearchDocumentId,
  ResearchDocumentQuoteHash,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    researchDocuments: ResearchDocumentRuntime
  }
}

/** Shared runtime error codes; parser providers may add specific string codes. */
export type ResearchDocumentErrorCode =
  | 'RESEARCH_DOCUMENT_ABORTED'
  | 'RESEARCH_DOCUMENT_BLOCK_NOT_FOUND'
  | 'RESEARCH_DOCUMENT_DUPLICATE_PROVIDER'
  | 'RESEARCH_DOCUMENT_EMPTY_QUERY'
  | 'RESEARCH_DOCUMENT_MEDIA_TYPE_MISMATCH'
  | 'RESEARCH_DOCUMENT_NOT_FOUND'
  | 'RESEARCH_DOCUMENT_PROVIDER_AMBIGUOUS'
  | 'RESEARCH_DOCUMENT_PROVIDER_CONFIGURED_MISSING'
  | 'RESEARCH_DOCUMENT_PROVIDER_CONFIGURED_UNAVAILABLE'
  | 'RESEARCH_DOCUMENT_PROVIDER_UNAVAILABLE'

/** Typed error for provider selection, lookup, cancellation, and parsing. */
export class ResearchDocumentError extends HarnessError {
  override readonly code: string

  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, code, options)
    this.code = code
  }
}

/** Runtime provider selection and bounded in-memory retention policy. */
export interface Config {
  /** Explicit parser provider id. Omit to require one usable supporting parser. */
  readonly parserProvider?: string
  /** Maximum imported document versions retained in memory. Defaults to 16. */
  readonly maxDocuments?: number
}

/** Default maximum imported versions retained by one runtime. */
export const DEFAULT_MAX_DOCUMENTS = 16

interface ResolvedConfig {
  readonly parserProvider?: string
  readonly maxDocuments: number
}

/**
 * Research-document runtime. It selects one parser, assigns exact content and
 * block identities, and owns a bounded LRU of readonly parsed values.
 */
export class ResearchDocumentRuntime extends Service {
  static Config: z<Config> = z.object({
    parserProvider: z.string(),
    maxDocuments: z.number().step(1).min(1).default(DEFAULT_MAX_DOCUMENTS),
  })

  private readonly parsers = new Map<string, ResearchDocumentParser>()
  private readonly documents = new Map<ResearchDocumentId, ResearchDocument>()
  private readonly config: ResolvedConfig

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'researchDocuments')
    const maxDocuments = positiveSafeInteger('maxDocuments', config.maxDocuments ?? DEFAULT_MAX_DOCUMENTS)
    this.config = {
      maxDocuments,
      ...(config.parserProvider !== undefined ? { parserProvider: config.parserProvider } : {}),
    }
  }

  /**
   * Register one parser. Duplicate ids fail; the returned disposer removes
   * exactly this contribution.
   * @param parser - parser implementation and stable provider id.
   * @returns contribution disposer.
   */
  registerParser(parser: ResearchDocumentParser): () => void {
    if (this.parsers.has(parser.id)) {
      throw new ResearchDocumentError(
        `a research-document parser with id "${parser.id}" is already registered`,
        'RESEARCH_DOCUMENT_DUPLICATE_PROVIDER',
      )
    }
    const parsers = this.parsers
    const dispose = this.ctx.effect(function* () {
      parsers.set(parser.id, parser)
      yield () => parsers.delete(parser.id)
    }, 'researchDocuments.registerParser()')
    return () => void dispose()
  }

  /**
   * Parse and retain one exact byte sequence. Re-importing retained bytes
   * returns the same retained value without invoking a parser again.
   * @param request - complete bytes and declared media type.
   * @param signal - aborts provider work.
   * @returns parsed document with content-derived anchors.
   */
  async import(
    request: { readonly bytes: Uint8Array; readonly mediaType: string },
    signal?: AbortSignal,
  ): Promise<ResearchDocument> {
    if (signal?.aborted) throw abortedError()
    const bytes = new Uint8Array(request.bytes)
    const documentId = ResearchDocumentId(`sha256:${hashBytes(bytes)}`)
    const cached = this.documents.get(documentId)
    if (cached !== undefined) {
      if (cached.mediaType.toLowerCase() !== request.mediaType.toLowerCase()) {
        throw new ResearchDocumentError(
          `research document "${documentId}" is retained as ${cached.mediaType}, not ${request.mediaType}`,
          'RESEARCH_DOCUMENT_MEDIA_TYPE_MISMATCH',
        )
      }
      this.touch(documentId, cached)
      return cached
    }

    const parser = this.resolveParser(request.mediaType)
    const parsed = await parser.parse({ bytes, mediaType: request.mediaType }, signal)
    if (signal?.aborted) throw abortedError()
    const document = materializeDocument(documentId, request.mediaType, parser.id, parsed)
    this.touch(documentId, document)
    this.evictOverLimit()
    return document
  }

  /**
   * Read one retained document and refresh its LRU position.
   * @param documentId - exact imported version id.
   * @returns retained readonly document.
   */
  get(documentId: ResearchDocumentId): ResearchDocument {
    const document = this.documents.get(documentId)
    if (document === undefined) {
      throw new ResearchDocumentError(
        `research document "${documentId}" is not retained; import it again`,
        'RESEARCH_DOCUMENT_NOT_FOUND',
      )
    }
    this.touch(documentId, document)
    return document
  }

  /**
   * Inspect whether one exact document is retained without changing its LRU
   * position. Library consumers use this to report current readability
   * without evicting another document merely by checking coverage.
   * @param documentId - exact imported version id.
   * @returns the retained readonly document, or `undefined` when absent.
   */
  peek(documentId: ResearchDocumentId): ResearchDocument | undefined {
    return this.documents.get(documentId)
  }

  /**
   * Return all parsed heading blocks in reading order.
   * @param documentId - exact imported version id.
   * @returns deterministic outline entries.
   */
  outline(documentId: ResearchDocumentId): readonly ResearchDocumentOutlineEntry[] {
    return blocksOf(this.get(documentId))
      .filter((block): block is ResearchDocumentBlock & { readonly headingLevel: 1 | 2 | 3 } =>
        block.kind === 'heading' && block.headingLevel !== undefined)
      .map(block => ({ text: block.text, level: block.headingLevel, locator: block.locator }))
  }

  /**
   * Search retained block text using deterministic phrase-and-term scoring.
   * @param documentId - exact imported version id.
   * @param query - non-empty phrase or terms.
   * @param maxResults - positive caller-owned result bound.
   * @returns strongest hits, then reading order.
   */
  search(documentId: ResearchDocumentId, query: string, maxResults: number): readonly ResearchDocumentSearchHit[] {
    positiveSafeInteger('maxResults', maxResults)
    const normalized = normalizeSearchText(query)
    if (normalized.length === 0) {
      throw new ResearchDocumentError('paper search query must be non-empty', 'RESEARCH_DOCUMENT_EMPTY_QUERY')
    }
    const terms = [...new Set(normalized.split(' ').filter(Boolean))]
    return blocksOf(this.get(documentId))
      .map(block => ({ block, score: searchScore(normalizeSearchText(block.text), normalized, terms) }))
      .filter(hit => hit.score > 0)
      .sort((left, right) => right.score - left.score || left.block.readingOrder - right.block.readingOrder)
      .slice(0, maxResults)
      .map(({ block, score }) => ({ text: block.text, score, locator: block.locator }))
  }

  /**
   * Return a block window around one exact anchor.
   * @param documentId - exact imported version id.
   * @param blockId - focus block.
   * @param before - number of preceding blocks.
   * @param after - number of following blocks.
   * @returns ordered window including the focus block.
   */
  read(
    documentId: ResearchDocumentId,
    blockId: ResearchDocumentBlockId,
    before: number,
    after: number,
  ): ResearchDocumentReadResult {
    nonNegativeSafeInteger('before', before)
    nonNegativeSafeInteger('after', after)
    const blocks = blocksOf(this.get(documentId))
    const focus = blocks.findIndex(block => block.id === blockId)
    if (focus === -1) {
      throw new ResearchDocumentError(
        `block "${blockId}" does not belong to research document "${documentId}"`,
        'RESEARCH_DOCUMENT_BLOCK_NOT_FOUND',
      )
    }
    return {
      focusBlockId: blockId,
      blocks: blocks.slice(Math.max(0, focus - before), focus + after + 1),
    }
  }

  private resolveParser(mediaType: string): ResearchDocumentParser {
    const configuredId = this.config.parserProvider
    if (configuredId !== undefined) {
      const configured = this.parsers.get(configuredId)
      if (configured === undefined) {
        throw new ResearchDocumentError(
          `configured research-document parser "${configuredId}" is not registered`,
          'RESEARCH_DOCUMENT_PROVIDER_CONFIGURED_MISSING',
        )
      }
      if (!configured.available() || !configured.supports(mediaType)) {
        throw new ResearchDocumentError(
          `configured research-document parser "${configuredId}" cannot parse ${mediaType}`,
          'RESEARCH_DOCUMENT_PROVIDER_CONFIGURED_UNAVAILABLE',
        )
      }
      return configured
    }

    const usable = [...this.parsers.values()].filter(parser => parser.available() && parser.supports(mediaType))
    if (usable.length === 0) {
      throw new ResearchDocumentError(
        `no usable research-document parser accepts ${mediaType}`,
        'RESEARCH_DOCUMENT_PROVIDER_UNAVAILABLE',
      )
    }
    if (usable.length > 1) {
      throw new ResearchDocumentError(
        `multiple research-document parsers accept ${mediaType} (${usable.map(parser => parser.id).join(', ')}); configure one explicitly`,
        'RESEARCH_DOCUMENT_PROVIDER_AMBIGUOUS',
      )
    }
    return usable[0] as ResearchDocumentParser
  }

  private touch(documentId: ResearchDocumentId, document: ResearchDocument): void {
    this.documents.delete(documentId)
    this.documents.set(documentId, document)
  }

  private evictOverLimit(): void {
    while (this.documents.size > this.config.maxDocuments) {
      const oldest = this.documents.keys().next().value as ResearchDocumentId
      this.documents.delete(oldest)
    }
  }
}

function materializeDocument(
  documentId: ResearchDocumentId,
  mediaType: string,
  parserId: string,
  parsed: Awaited<ReturnType<ResearchDocumentParser['parse']>>,
): ResearchDocument {
  let readingOrder = 0
  const sectionPath: string[] = []
  const pages = parsed.pages.map(page => ({
    pageIndex: page.pageIndex,
    ...(page.pageLabel !== undefined ? { pageLabel: page.pageLabel } : {}),
    width: page.width,
    height: page.height,
    blocks: page.blocks.map((block, blockIndex) => {
      const headingLevel = block.kind === 'heading' ? block.headingLevel ?? 1 : undefined
      if (headingLevel !== undefined) {
        const parentCount = Math.min(headingLevel - 1, sectionPath.length)
        sectionPath.splice(parentCount)
        sectionPath.push(block.text)
      }
      const id = ResearchDocumentBlockId(`block:${hashText(
        `${documentId}\0${parserId}\0${parsed.parserVersion}\0${page.pageIndex}\0${blockIndex}`,
      )}`)
      const quoteHash = ResearchDocumentQuoteHash(`sha256:${hashText(block.text)}`)
      const value: ResearchDocumentBlock = {
        id,
        kind: block.kind,
        text: block.text,
        sectionPath: [...sectionPath],
        ...(headingLevel !== undefined ? { headingLevel } : {}),
        pageIndex: page.pageIndex,
        readingOrder: readingOrder++,
        locator: {
          kind: 'block',
          documentId,
          blockId: id,
          parserId,
          parserVersion: parsed.parserVersion,
          pageIndex: page.pageIndex,
          ...(page.pageLabel !== undefined ? { pageLabel: page.pageLabel } : {}),
          bbox: block.bbox,
          quoteHash,
        },
      }
      return value
    }),
  }))
  const blockCount = pages.reduce((total, page) => total + page.blocks.length, 0)
  return {
    id: documentId,
    mediaType,
    ...(parsed.title !== undefined ? { title: parsed.title } : {}),
    parser: { id: parserId, version: parsed.parserVersion },
    extraction: parsed.extraction,
    pageCount: pages.length,
    blockCount,
    pages,
  }
}

function blocksOf(document: ResearchDocument): readonly ResearchDocumentBlock[] {
  return document.pages.flatMap(page => page.blocks)
}

function hashBytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ')
}

function searchScore(text: string, phrase: string, terms: readonly string[]): number {
  let score = text.includes(phrase) ? 100 : 0
  for (const term of terms) {
    if (text.includes(term)) score += 1
  }
  return score
}

function positiveSafeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`research-document: ${name} must be a positive safe integer`)
  }
  return value
}

function nonNegativeSafeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`research-document: ${name} must be a non-negative safe integer`)
  }
  return value
}

function abortedError(): ResearchDocumentError {
  return new ResearchDocumentError('research-document import aborted', 'RESEARCH_DOCUMENT_ABORTED')
}

export default ResearchDocumentRuntime
