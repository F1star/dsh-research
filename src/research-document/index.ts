/**
 * Provider-neutral runtime for importing parsed research
 * documents and reading stable, content-derived block anchors.
 * @module @deepseek-ai/dsh-research-document
 */

import { createHash } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import type {
  ResearchDocumentBlockId as ResearchDocumentBlockIdBrand,
  ResearchDocumentId as ResearchDocumentIdBrand,
  ResearchDocumentQuoteHash as ResearchDocumentQuoteHashBrand,
} from './types.ts'
import type {
  ResearchDocument,
  ResearchDocumentArchive,
  ResearchDocumentBlock,
  ResearchDocumentOutlineEntry,
  ResearchDocumentParser,
  ResearchDocumentParserIdentity,
  ResearchDocumentReadResult,
  ResearchDocumentSearchHit,
  ResearchDocumentStructure,
} from './types.ts'

export { researchDocumentParseResultSchema } from './schema.ts'

export type {
  ParsedResearchDocumentBlock,
  ParsedResearchDocumentPage,
  ResearchDocument,
  ResearchDocumentArchive,
  ResearchDocumentBlock,
  ResearchDocumentBlockLocator,
  ResearchDocumentExtraction,
  ResearchDocumentOutlineEntry,
  ResearchDocumentPage,
  ResearchDocumentParseRequest,
  ResearchDocumentParseResult,
  ResearchDocumentParser,
  ResearchDocumentParserIdentity,
  ResearchDocumentReadResult,
  ResearchDocumentRect,
  ResearchDocumentSearchHit,
  ResearchDocumentSnapshot,
  ResearchDocumentStructure,
  ResearchDocumentTable,
  ResearchDocumentTableCell,
} from './types.ts'

/** Content-derived identity of one exact imported document version. */
export type ResearchDocumentId = ResearchDocumentIdBrand

/**
 * Brand an exact document content hash as a runtime document id.
 * @param value - validated or runtime-generated document hash.
 * @returns the same string with its document-id brand.
 */
export function ResearchDocumentId(value: string): ResearchDocumentId {
  return value as ResearchDocumentId
}

/** Stable identity of one parsed block inside an exact document version. */
export type ResearchDocumentBlockId = ResearchDocumentBlockIdBrand

/**
 * Brand a runtime-owned block identity.
 * @param value - validated or runtime-generated block id.
 * @returns the same string with its block-id brand.
 */
export function ResearchDocumentBlockId(value: string): ResearchDocumentBlockId {
  return value as ResearchDocumentBlockId
}

/** Content hash of the complete text carried by one block anchor. */
export type ResearchDocumentQuoteHash = ResearchDocumentQuoteHashBrand

/**
 * Brand a complete block-text hash as a quote-integrity token.
 * @param value - runtime-generated quote hash.
 * @returns the same string with its quote-hash brand.
 */
export function ResearchDocumentQuoteHash(value: string): ResearchDocumentQuoteHash {
  return value as ResearchDocumentQuoteHash
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    researchDocuments: ResearchDocumentRuntime
  }
}

/** Shared runtime error codes; parser providers may add specific string codes. */
export type ResearchDocumentErrorCode =
  | 'RESEARCH_DOCUMENT_ABORTED'
  | 'RESEARCH_DOCUMENT_ARCHIVE_DUPLICATE'
  | 'RESEARCH_DOCUMENT_ARCHIVE_UNAVAILABLE'
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
  private archive: ResearchDocumentArchive | undefined
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
   * Register the sole archive provider. Its owner must dispose this contribution
   * before closing its storage. An absent archive keeps imports process-local.
   * @param archive - durable source and parser-result provider.
   * @returns contribution disposer.
   */
  registerArchive(archive: ResearchDocumentArchive): () => void {
    if (this.archive !== undefined) {
      throw new ResearchDocumentError('a research-document archive is already registered', 'RESEARCH_DOCUMENT_ARCHIVE_DUPLICATE')
    }
    const dispose = this.ctx.effect(() => {
      this.archive = archive
      return () => { this.archive = undefined }
    }, 'researchDocuments.registerArchive()')
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
    await this.archive?.save({ documentId, bytes, mediaType: request.mediaType, parserId: parser.id, parsed })
    if (signal?.aborted) throw abortedError()
    this.touch(documentId, document)
    this.evictOverLimit()
    return document
  }

  /**
   * Restore a missing document from its saved parser output. No parser or original
   * source path is needed. Selecting a historical revision replaces the cached
   * revision for this document; old block ids are never remapped to new content.
   * @param documentId - exact imported content id.
   * @param parser - optional exact historical extraction revision.
   * @returns retained document with the original block ids and quote hashes.
   */
  async restore(documentId: ResearchDocumentId, parser?: ResearchDocumentParserIdentity): Promise<ResearchDocument> {
    const cached = this.documents.get(documentId)
    if (cached !== undefined && (parser === undefined
      || (cached.parser.id === parser.id && cached.parser.version === parser.version))) {
      this.touch(documentId, cached)
      return cached
    }
    const snapshot = await this.archive?.load(documentId, parser)
    if (snapshot === undefined) {
      throw new ResearchDocumentError(
        `research document "${documentId}"${parser ? ` at ${parser.id}@${parser.version}` : ''} is not retained or archived; import it again`,
        'RESEARCH_DOCUMENT_NOT_FOUND',
      )
    }
    const document = materializeDocument(documentId, snapshot.mediaType, snapshot.parserId, snapshot.parsed)
    this.touch(documentId, document)
    this.evictOverLimit()
    return document
  }

  /**
   * Read exact archived source bytes for a document viewer or export.
   * @param documentId - exact imported content id.
   * @returns an owned copy of the saved source bytes.
   */
  async source(documentId: ResearchDocumentId): Promise<Uint8Array> {
    if (this.archive === undefined) {
      throw new ResearchDocumentError('no research-document archive is registered', 'RESEARCH_DOCUMENT_ARCHIVE_UNAVAILABLE')
    }
    const snapshot = await this.archive.load(documentId)
    if (snapshot === undefined) {
      throw new ResearchDocumentError(`research document "${documentId}" has no archived source`, 'RESEARCH_DOCUMENT_NOT_FOUND')
    }
    return new Uint8Array(snapshot.bytes)
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
   * @param document - retained id or restored snapshot; snapshots remain readable after cache eviction.
   * @returns deterministic outline entries.
   */
  outline(document: ResearchDocumentId | ResearchDocument): readonly ResearchDocumentOutlineEntry[] {
    return blocksOf(typeof document === 'string' ? this.get(document) : document)
      .filter((block): block is ResearchDocumentBlock & { readonly headingLevel: 1 | 2 | 3 } =>
        block.kind === 'heading' && block.headingLevel !== undefined)
      .map(block => ({ text: block.text, level: block.headingLevel, locator: block.locator }))
  }

  /**
   * Return scientific blocks in reading order, including blocks without OCR text.
   * @param document - retained id or restored snapshot; snapshots survive cache eviction.
   * @param kind - optional table, formula, or figure filter.
   * @returns source-owned blocks with their complete structures and exact locators.
   */
  structures(
    document: ResearchDocumentId | ResearchDocument,
    kind?: ResearchDocumentStructure['kind'],
  ): readonly (ResearchDocumentBlock & { readonly structure: ResearchDocumentStructure })[] {
    return blocksOf(typeof document === 'string' ? this.get(document) : document)
      .filter((block): block is ResearchDocumentBlock & { readonly structure: ResearchDocumentStructure } =>
        block.structure !== undefined && (kind === undefined || block.structure.kind === kind))
  }

  /**
   * Search retained block text using deterministic phrase-and-term scoring.
   * @param document - retained id or restored snapshot; snapshots remain readable after cache eviction.
   * @param query - non-empty phrase or terms.
   * @param maxResults - positive caller-owned result bound.
   * @returns strongest hits, then reading order.
   */
  search(document: ResearchDocumentId | ResearchDocument, query: string, maxResults: number): readonly ResearchDocumentSearchHit[] {
    positiveSafeInteger('maxResults', maxResults)
    const normalized = normalizeSearchText(query)
    if (normalized.length === 0) {
      throw new ResearchDocumentError('paper search query must be non-empty', 'RESEARCH_DOCUMENT_EMPTY_QUERY')
    }
    const terms = [...new Set(normalized.split(' ').filter(Boolean))]
    return blocksOf(typeof document === 'string' ? this.get(document) : document)
      .map(block => ({ block, score: searchScore(normalizeSearchText(block.text), normalized, terms) }))
      .filter(hit => hit.score > 0)
      .sort((left, right) => right.score - left.score || left.block.readingOrder - right.block.readingOrder)
      .slice(0, maxResults)
      .map(({ block, score }) => ({ text: block.text, score, locator: block.locator }))
  }

  /**
   * Return a block window around one exact anchor.
   * @param document - retained id or restored snapshot; snapshots remain readable after cache eviction.
   * @param blockId - focus block.
   * @param before - number of preceding blocks.
   * @param after - number of following blocks.
   * @returns ordered window including the focus block.
   */
  read(
    document: ResearchDocumentId | ResearchDocument,
    blockId: ResearchDocumentBlockId,
    before: number,
    after: number,
  ): ResearchDocumentReadResult {
    nonNegativeSafeInteger('before', before)
    nonNegativeSafeInteger('after', after)
    const snapshot = typeof document === 'string' ? this.get(document) : document
    const blocks = blocksOf(snapshot)
    const focus = blocks.findIndex(block => block.id === blockId)
    if (focus === -1) {
      throw new ResearchDocumentError(
        `block "${blockId}" does not belong to research document "${snapshot.id}"`,
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
        ...(block.structure === undefined ? {} : { structure: block.structure }),
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
