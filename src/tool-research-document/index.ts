/**
 * Model-facing tools for importing local PDFs and reading citeable native-text
 * evidence through `ctx.researchDocuments`.
 * @module @f1star/dsh-research/tool-research-document
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  ResearchDocumentBlockId,
  ResearchDocumentId,
  type ResearchDocument,
  type ResearchDocumentBlock,
  type ResearchDocumentBlockLocator,
  type ResearchDocumentExtraction,
  type ResearchDocumentOutlineEntry,
  type ResearchDocumentSearchHit,
} from '../research-document/index.ts'
import { FsError } from '@deepseek-ai/dsh-fs'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, JsonValue } from '@deepseek-ai/dsh-tools'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-research-document'

/** Services required by the paper-reading tool suite. */
export const inject = ['fs', 'researchDocuments', 'systemPrompt', 'tools']

/** Default complete-PDF byte limit for one local import. */
export const DEFAULT_MAX_PDF_BYTES = 50 * 1024 * 1024
/** Default maximum headings returned by one outline call. */
export const DEFAULT_MAX_OUTLINE_ENTRIES = 200
/** Default maximum hits returned by one search call. */
export const DEFAULT_MAX_SEARCH_RESULTS = 20
/** Default maximum blocks returned by one anchored read. */
export const DEFAULT_MAX_READ_BLOCKS = 12
/** Default combined text-character budget for one tool result. */
export const DEFAULT_MAX_OUTPUT_TEXT_CHARS = 100_000
/** Default cooperative timeout declared by `paper_import`. */
export const DEFAULT_IMPORT_TIMEOUT_MS = 120_000
/** Default preceding context for `paper_read`. */
export const DEFAULT_READ_BEFORE = 1
/** Default following context for `paper_read`. */
export const DEFAULT_READ_AFTER = 2

/** Paper tool resource and output policy. */
export interface Config {
  /** Inclusive complete-PDF byte cap. Defaults to 50 MiB. */
  readonly maxPdfBytes?: number
  /** Maximum outline entries. Defaults to 200. */
  readonly maxOutlineEntries?: number
  /** Maximum search hits. Defaults to 20. */
  readonly maxSearchResults?: number
  /** Maximum context blocks in one anchored read. Defaults to 12. */
  readonly maxReadBlocks?: number
  /** Imported-title cap and combined block-text budget per call. Defaults to 100000. */
  readonly maxOutputTextChars?: number
  /** Cooperative `paper_import` timeout in milliseconds. Defaults to 120000. */
  readonly importTimeoutMs?: number
  /** Default number of preceding blocks for `paper_read`. Defaults to 1. */
  readonly defaultReadBefore?: number
  /** Default number of following blocks for `paper_read`. Defaults to 2. */
  readonly defaultReadAfter?: number
}

/** Loader schema for paper tool limits. */
export const Config: z<Config> = z.object({
  maxPdfBytes: z.number().step(1).min(1).default(DEFAULT_MAX_PDF_BYTES),
  maxOutlineEntries: z.number().step(1).min(1).default(DEFAULT_MAX_OUTLINE_ENTRIES),
  maxSearchResults: z.number().step(1).min(1).default(DEFAULT_MAX_SEARCH_RESULTS),
  maxReadBlocks: z.number().step(1).min(1).default(DEFAULT_MAX_READ_BLOCKS),
  maxOutputTextChars: z.number().step(1).min(1).default(DEFAULT_MAX_OUTPUT_TEXT_CHARS),
  importTimeoutMs: z.number().step(1).min(1).default(DEFAULT_IMPORT_TIMEOUT_MS),
  defaultReadBefore: z.number().step(1).min(0).default(DEFAULT_READ_BEFORE),
  defaultReadAfter: z.number().step(1).min(0).default(DEFAULT_READ_AFTER),
})

interface ResolvedConfig {
  readonly maxPdfBytes: number
  readonly maxOutlineEntries: number
  readonly maxSearchResults: number
  readonly maxReadBlocks: number
  readonly maxOutputTextChars: number
  readonly importTimeoutMs: number
  readonly defaultReadBefore: number
  readonly defaultReadAfter: number
}

interface ProjectedLocator {
  readonly kind: 'block'
  readonly document_id: string
  readonly block_id: string
  readonly parser_id: string
  readonly parser_version: string
  readonly page_index: number
  readonly page_label?: string
  readonly bbox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly quote_hash: string
}

interface ProjectedText {
  readonly text: string
  readonly text_truncated: boolean
}

interface ProjectedBlock extends ProjectedText {
  readonly kind: 'heading' | 'paragraph'
  readonly heading_level?: number
  readonly section_path: string[]
  readonly section_path_truncated: boolean
  readonly focus: boolean
  readonly locator: ProjectedLocator
}

const EXTRACTION_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', required: true, const: 'native' },
        layout: { type: 'string', required: true, const: 'approximate' },
      },
    },
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', required: true, const: 'none' },
        layout: { type: 'string', required: true, const: 'page-only' },
      },
    },
  ],
} as const

const RECT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    x: { type: 'number', required: true },
    y: { type: 'number', required: true },
    width: { type: 'number', required: true },
    height: { type: 'number', required: true },
  },
} as const

const LOCATOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', required: true, const: 'block' },
    document_id: { type: 'string', required: true },
    block_id: { type: 'string', required: true },
    parser_id: { type: 'string', required: true },
    parser_version: { type: 'string', required: true },
    page_index: { type: 'integer', required: true },
    page_label: { type: 'string' },
    bbox: { ...RECT_SCHEMA, required: true },
    quote_hash: { type: 'string', required: true },
  },
} as const

const IMPORT_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    document_id: { type: 'string', required: true },
    source_path: { type: 'string', required: true },
    title: { type: 'string' },
    title_truncated: { type: 'boolean' },
    parser_id: { type: 'string', required: true },
    parser_version: { type: 'string', required: true },
    page_count: { type: 'integer', required: true },
    block_count: { type: 'integer', required: true },
    extraction: { ...EXTRACTION_SCHEMA, required: true },
  },
} as const

const OUTLINE_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    document_id: { type: 'string', required: true },
    extraction: { ...EXTRACTION_SCHEMA, required: true },
    entries: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          text_truncated: { type: 'boolean', required: true },
          level: { type: 'integer', required: true },
          locator: { ...LOCATOR_SCHEMA, required: true },
        },
      },
    },
    truncated: { type: 'boolean', required: true },
    total_entries: { type: 'integer', required: true },
  },
} as const

const SEARCH_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    document_id: { type: 'string', required: true },
    query: { type: 'string', required: true },
    extraction: { ...EXTRACTION_SCHEMA, required: true },
    hits: {
      type: 'array',
      required: true,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          text_truncated: { type: 'boolean', required: true },
          score: { type: 'integer', required: true },
          locator: { ...LOCATOR_SCHEMA, required: true },
        },
      },
    },
    truncated: { type: 'boolean', required: true },
  },
} as const

const BLOCK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    kind: { type: 'string', required: true, enum: ['heading', 'paragraph'] },
    text: { type: 'string', required: true },
    text_truncated: { type: 'boolean', required: true },
    heading_level: { type: 'integer' },
    section_path: { type: 'array', required: true, items: { type: 'string' } },
    section_path_truncated: { type: 'boolean', required: true },
    focus: { type: 'boolean', required: true },
    locator: { ...LOCATOR_SCHEMA, required: true },
  },
} as const

const READ_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    document_id: { type: 'string', required: true },
    focus_block_id: { type: 'string', required: true },
    extraction: { ...EXTRACTION_SCHEMA, required: true },
    blocks: { type: 'array', required: true, items: BLOCK_SCHEMA },
  },
} as const

/** Register paper-reading prompt guidance and four tools. */
export function apply(ctx: Context, config: Config): void {
  const resolved = resolveConfig(config)
  ctx.systemPrompt.section({
    name: 'tool:research-document',
    order: 112,
    text: 'Use paper_import for a local PDF, then paper_outline and paper_search to navigate it, and paper_read to recover the exact surrounding evidence before making a claim. Preserve the returned document, page, block, parser-version, and quote-hash anchors in research notes. The first provider extracts only native PDF text: extraction.text=none means OCR is required and no text claim is supported by this import.',
  })

  ctx.tools.register(defineTool({
    name: 'paper_import',
    description: 'Import one local PDF into the paper-reading runtime. Returns an exact content id, parser revision, extraction status, and page/block counts.',
    parameters: {
      file_path: { type: 'string', required: true, description: 'Path to one local PDF, relative to the session workspace or absolute.' },
    },
    output: {
      schema: IMPORT_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatImport(value) }],
      presentationMeta: (_args, value) => taggedMeta('dsh/paper-import', value),
    },
    timeoutMs: resolved.importTimeoutMs,
    async execute(args, exec) {
      const requestedPath = nonBlank('file_path', args.file_path)
      const cwd = exec.agent?.session.header.cwd
      const target = await ctx.fs.resolve(requestedPath, {
        ...(cwd !== undefined ? { cwd } : {}),
        signal: exec.signal,
      })
      const info = await ctx.fs.stat(target, exec.signal)
      if (info === undefined) {
        ctx.emit('fs/observed', target, { kind: 'absent' }, exec)
        throw new FsError(`cannot import "${target.displayPath}": not found`, 'FS_NOT_FOUND')
      }
      if (info.type !== 'file') {
        throw new FsError(`cannot import "${target.displayPath}": not a regular file`, 'FS_NOT_REGULAR_FILE')
      }
      const bytes = await ctx.fs.readBytes(target, exec.signal, resolved.maxPdfBytes)
      const document = await ctx.researchDocuments.import({ bytes, mediaType: 'application/pdf' }, exec.signal)
      ctx.emit('fs/observed', target, { kind: 'present', version: info.version }, exec)
      return projectImport(document, target.displayPath, resolved.maxOutputTextChars)
    },
    presentCall(args): GenericCallView {
      return { card: 'generic', title: `Import paper ${args.file_path}`, kind: 'read', rawInput: args.file_path }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'paper_outline',
    description: 'List parsed PDF headings in reading order with exact page/block anchors.',
    parameters: {
      document_id: { type: 'string', required: true, description: 'Exact document id returned by paper_import.' },
    },
    output: {
      schema: OUTLINE_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatOutline(value) }],
      presentationMeta: (_args, value) => taggedMeta('dsh/paper-outline', value),
    },
    isConcurrencySafe: () => true,
    execute(args) {
      const documentId = parseDocumentId(args.document_id)
      const document = ctx.researchDocuments.get(documentId)
      const outline = ctx.researchDocuments.outline(documentId)
      const entries = outline.slice(0, resolved.maxOutlineEntries)
      const perEntry = perItemBudget(resolved.maxOutputTextChars, entries.length)
      return Promise.resolve({
        document_id: documentId,
        extraction: document.extraction,
        entries: entries.map(entry => projectOutlineEntry(entry, perEntry)),
        truncated: outline.length > entries.length,
        total_entries: outline.length,
      })
    },
    presentCall(args): GenericCallView {
      return { card: 'generic', title: `Outline paper ${shortId(args.document_id)}`, kind: 'read' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'paper_search',
    description: 'Search one imported PDF deterministically and return citeable block hits. Follow with paper_read for surrounding evidence.',
    parameters: {
      document_id: { type: 'string', required: true, description: 'Exact document id returned by paper_import.' },
      query: { type: 'string', required: true, description: 'Non-empty phrase or terms to find inside extracted native text.' },
      max_results: { type: 'integer', description: `Optional result cap from 1 through ${resolved.maxSearchResults}.` },
    },
    output: {
      schema: SEARCH_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatSearch(value) }],
      presentationMeta: (_args, value) => taggedMeta('dsh/paper-search', value),
    },
    isConcurrencySafe: () => true,
    execute(args) {
      const documentId = parseDocumentId(args.document_id)
      const query = nonBlank('query', args.query)
      const maxResults = boundedOptionalCount('max_results', args.max_results, resolved.maxSearchResults)
      const document = ctx.researchDocuments.get(documentId)
      const hits = ctx.researchDocuments.search(documentId, query, maxResults + 1)
      const retained = hits.slice(0, maxResults)
      const perHit = perItemBudget(resolved.maxOutputTextChars, retained.length)
      return Promise.resolve({
        document_id: documentId,
        query,
        extraction: document.extraction,
        hits: retained.map(hit => projectSearchHit(hit, perHit)),
        truncated: hits.length > retained.length,
      })
    },
    presentCall(args): GenericCallView {
      return { card: 'generic', title: `Search paper: ${args.query}`, kind: 'search', rawInput: args.query }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'paper_read',
    description: 'Read an exact imported-paper block with bounded preceding and following blocks, preserving parser and quote-integrity anchors.',
    parameters: {
      document_id: { type: 'string', required: true, description: 'Exact document id returned by paper_import.' },
      block_id: { type: 'string', required: true, description: 'Exact block id returned by paper_outline or paper_search.' },
      before: { type: 'integer', description: `Preceding blocks; defaults to ${resolved.defaultReadBefore}.` },
      after: { type: 'integer', description: `Following blocks; defaults to ${resolved.defaultReadAfter}.` },
    },
    output: {
      schema: READ_OUTPUT_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: formatRead(value) }],
      presentationMeta: (_args, value) => taggedMeta('dsh/paper-read', value),
    },
    isConcurrencySafe: () => true,
    execute(args) {
      const documentId = parseDocumentId(args.document_id)
      const blockId = parseBlockId(args.block_id)
      const before = nonNegativeOptionalCount('before', args.before, resolved.defaultReadBefore)
      const after = nonNegativeOptionalCount('after', args.after, resolved.defaultReadAfter)
      if (before + after + 1 > resolved.maxReadBlocks) {
        throw new Error(`before + after + focus must be at most ${resolved.maxReadBlocks} blocks`)
      }
      const document = ctx.researchDocuments.get(documentId)
      const result = ctx.researchDocuments.read(documentId, blockId, before, after)
      const perBlock = perItemBudget(resolved.maxOutputTextChars, result.blocks.length)
      return Promise.resolve({
        document_id: documentId,
        focus_block_id: blockId,
        extraction: document.extraction,
        blocks: result.blocks.map(block => projectBlock(block, block.id === blockId, perBlock)),
      })
    },
    presentCall(args): GenericCallView {
      return { card: 'generic', title: `Read paper block ${shortId(args.block_id)}`, kind: 'read' }
    },
  }))
}

function resolveConfig(config: Config = {}): ResolvedConfig {
  const resolved: ResolvedConfig = {
    maxPdfBytes: positiveSafeInteger('maxPdfBytes', config.maxPdfBytes ?? DEFAULT_MAX_PDF_BYTES),
    maxOutlineEntries: positiveSafeInteger(
      'maxOutlineEntries', config.maxOutlineEntries ?? DEFAULT_MAX_OUTLINE_ENTRIES,
    ),
    maxSearchResults: positiveSafeInteger(
      'maxSearchResults', config.maxSearchResults ?? DEFAULT_MAX_SEARCH_RESULTS,
    ),
    maxReadBlocks: positiveSafeInteger('maxReadBlocks', config.maxReadBlocks ?? DEFAULT_MAX_READ_BLOCKS),
    maxOutputTextChars: positiveSafeInteger(
      'maxOutputTextChars', config.maxOutputTextChars ?? DEFAULT_MAX_OUTPUT_TEXT_CHARS,
    ),
    importTimeoutMs: positiveSafeInteger('importTimeoutMs', config.importTimeoutMs ?? DEFAULT_IMPORT_TIMEOUT_MS),
    defaultReadBefore: nonNegativeSafeInteger(
      'defaultReadBefore', config.defaultReadBefore ?? DEFAULT_READ_BEFORE,
    ),
    defaultReadAfter: nonNegativeSafeInteger('defaultReadAfter', config.defaultReadAfter ?? DEFAULT_READ_AFTER),
  }
  if (resolved.defaultReadBefore + resolved.defaultReadAfter + 1 > resolved.maxReadBlocks) {
    throw new TypeError('tool-research-document: default read window exceeds maxReadBlocks')
  }
  const maximumReturnedItems = Math.max(
    resolved.maxOutlineEntries,
    resolved.maxSearchResults,
    resolved.maxReadBlocks,
  )
  if (resolved.maxOutputTextChars < maximumReturnedItems) {
    throw new TypeError('tool-research-document: maxOutputTextChars must cover every returned item')
  }
  return resolved
}

function positiveSafeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`tool-research-document: ${name} must be a positive safe integer`)
  }
  return value
}

function nonNegativeSafeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`tool-research-document: ${name} must be a non-negative safe integer`)
  }
  return value
}

function nonBlank(name: string, value: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new Error(`${name} must be a non-empty string`)
  return trimmed
}

function parseDocumentId(value: string): ReturnType<typeof ResearchDocumentId> {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) throw new Error('document_id must be a paper_import sha256 id')
  return ResearchDocumentId(value)
}

function parseBlockId(value: string): ReturnType<typeof ResearchDocumentBlockId> {
  if (!/^block:[0-9a-f]{64}$/u.test(value)) throw new Error('block_id must be a paper block id')
  return ResearchDocumentBlockId(value)
}

function boundedOptionalCount(name: string, value: number | undefined, maximum: number): number {
  if (value === undefined) return maximum
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 through ${maximum}`)
  }
  return value
}

function nonNegativeOptionalCount(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`)
  return value
}

function perItemBudget(total: number, count: number): number {
  return count === 0 ? total : Math.max(1, Math.floor(total / count))
}

function projectText(text: string, limit: number): ProjectedText {
  if (text.length <= limit) return { text, text_truncated: false }
  if (limit === 1) return { text: '…', text_truncated: true }
  return { text: `${text.slice(0, limit - 1)}…`, text_truncated: true }
}

function projectLocator(locator: ResearchDocumentBlockLocator): ProjectedLocator {
  return {
    kind: 'block',
    document_id: locator.documentId,
    block_id: locator.blockId,
    parser_id: locator.parserId,
    parser_version: locator.parserVersion,
    page_index: locator.pageIndex,
    ...(locator.pageLabel !== undefined ? { page_label: locator.pageLabel } : {}),
    bbox: { ...locator.bbox },
    quote_hash: locator.quoteHash,
  }
}

function projectImport(document: ResearchDocument, sourcePath: string, titleLimit: number): {
  document_id: string
  source_path: string
  title?: string
  title_truncated?: boolean
  parser_id: string
  parser_version: string
  page_count: number
  block_count: number
  extraction: ResearchDocumentExtraction
} {
  const title = document.title === undefined ? undefined : projectText(document.title, titleLimit)
  return {
    document_id: document.id,
    source_path: sourcePath,
    ...(title === undefined ? {} : { title: title.text, title_truncated: title.text_truncated }),
    parser_id: document.parser.id,
    parser_version: document.parser.version,
    page_count: document.pageCount,
    block_count: document.blockCount,
    extraction: document.extraction,
  }
}

function projectOutlineEntry(entry: ResearchDocumentOutlineEntry, textLimit: number): ProjectedText & {
  level: 1 | 2 | 3
  locator: ProjectedLocator
} {
  return { ...projectText(entry.text, textLimit), level: entry.level, locator: projectLocator(entry.locator) }
}

function projectSearchHit(hit: ResearchDocumentSearchHit, textLimit: number): ProjectedText & {
  score: number
  locator: ProjectedLocator
} {
  return { ...projectText(hit.text, textLimit), score: hit.score, locator: projectLocator(hit.locator) }
}

function projectBlock(block: ResearchDocumentBlock, focus: boolean, textLimit: number): ProjectedBlock {
  const section = projectSectionPath(block.sectionPath, Math.max(0, textLimit - 1))
  return {
    kind: block.kind,
    ...projectText(block.text, textLimit - section.characters),
    ...(block.headingLevel !== undefined ? { heading_level: block.headingLevel } : {}),
    section_path: section.values,
    section_path_truncated: section.truncated,
    focus,
    locator: projectLocator(block.locator),
  }
}

function projectSectionPath(
  values: readonly string[],
  limit: number,
): { values: string[]; truncated: boolean; characters: number } {
  const projected: string[] = []
  let remaining = limit
  for (const value of values) {
    if (remaining === 0) break
    const item = projectText(value, remaining)
    projected.push(item.text)
    remaining -= item.text.length
    if (item.text_truncated) break
  }
  return {
    values: projected,
    truncated: projected.length < values.length,
    characters: limit - remaining,
  }
}

function taggedMeta(kind: string, value: JsonValue): JsonValue {
  return { kind, version: 1, value }
}

function formatImport(value: {
  document_id: string
  source_path: string
  title?: string
  title_truncated?: boolean
  parser_id: string
  parser_version: string
  page_count: number
  block_count: number
  extraction: ResearchDocumentExtraction
}): string {
  const lines = [
    `Imported paper: ${value.title ?? value.source_path}`,
    `Document: ${value.document_id}`,
    `Parser: ${value.parser_id}@${value.parser_version}`,
    `Pages: ${value.page_count}; blocks: ${value.block_count}`,
    `Extraction: text=${value.extraction.text}; layout=${value.extraction.layout}`,
  ]
  if (value.extraction.text === 'none') {
    lines.push('No native text layer was found. OCR is required before text claims can be supported.')
  } else {
    lines.push('Use paper_outline or paper_search, then paper_read the exact block before citing a claim.')
  }
  return lines.join('\n')
}

function formatOutline(value: {
  document_id: string
  extraction: ResearchDocumentExtraction
  entries: readonly (ProjectedText & { level: number; locator: ProjectedLocator })[]
  truncated: boolean
  total_entries: number
}): string {
  const lines = evidenceHeader('Paper outline', value.document_id, value.extraction)
  if (value.entries.length === 0) lines.push('No parsed headings.')
  for (const entry of value.entries) {
    lines.push(`${'  '.repeat(Math.max(0, entry.level - 1))}- ${anchor(entry.locator)} ${entry.text}`)
  }
  if (value.truncated) lines.push(`Showing ${value.entries.length} of ${value.total_entries} headings.`)
  return lines.join('\n')
}

function formatSearch(value: {
  document_id: string
  query: string
  extraction: ResearchDocumentExtraction
  hits: readonly (ProjectedText & { score: number; locator: ProjectedLocator })[]
  truncated: boolean
}): string {
  const lines = evidenceHeader(`Paper search: ${value.query}`, value.document_id, value.extraction)
  if (value.hits.length === 0) lines.push('No matching extracted blocks.')
  for (const hit of value.hits) lines.push(`- ${anchor(hit.locator)} ${hit.text}`)
  if (value.truncated) lines.push('More matches exist; refine the query or request a larger allowed result count.')
  lines.push('Use paper_read with a returned block id before relying on the surrounding argument.')
  return lines.join('\n')
}

function formatRead(value: {
  document_id: string
  focus_block_id: string
  extraction: ResearchDocumentExtraction
  blocks: readonly ProjectedBlock[]
}): string {
  const lines = evidenceHeader('Paper evidence window', value.document_id, value.extraction)
  for (const block of value.blocks) {
    const section = block.section_path.length > 0
      ? ` [${block.section_path.join(' > ')}${block.section_path_truncated ? ' …' : ''}]`
      : block.section_path_truncated ? ' [section truncated]' : ''
    lines.push(`${block.focus ? 'FOCUS' : 'CONTEXT'} ${anchor(block.locator)}${section}\n${block.text}`)
  }
  lines.push(`The focus block is ${value.focus_block_id}; preserve its document, parser, page, block, and quote anchors in research notes.`)
  return lines.join('\n\n')
}

function evidenceHeader(title: string, documentId: string, extraction: ResearchDocumentExtraction): string[] {
  return [title, `Document: ${documentId}`, `Extraction: text=${extraction.text}; layout=${extraction.layout}`]
}

function anchor(locator: ProjectedLocator): string {
  const page = locator.page_label === undefined
    ? `page ${locator.page_index + 1}`
    : `page ${locator.page_index + 1} (label ${locator.page_label})`
  return `[${page} | block ${locator.block_id} | parser ${locator.parser_id}@${locator.parser_version} | quote ${locator.quote_hash}]`
}

function shortId(value: string): string {
  return value.length <= 20 ? value : `${value.slice(0, 12)}…${value.slice(-6)}`
}
