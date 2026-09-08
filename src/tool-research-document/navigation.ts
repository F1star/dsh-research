/** Source anchors, extraction states, and argument validation for paper navigation tools. */

import { ResearchDocumentId, ResearchDocumentBlockId, type ResearchDocumentBlockLocator } from '../research-document/index.ts'

/** Snake-case source anchor shared by paper navigation results. */
export interface ProjectedLocator {
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

/** Extraction states retained in model-visible navigation results. */
export const EXTRACTION_SCHEMA = {
  oneOf: [
    {
      type: 'object',
      additionalProperties: false,
      properties: {
        text: { type: 'string', required: true, enum: ['native', 'ocr-assisted'] },
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

/** Complete source anchor fields exposed by paper tools. */
export const LOCATOR_SCHEMA = {
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

/**
 * Validate a model-supplied document identity.
 * @param value - exact content id.
 * @returns branded document id.
 */
export function parseDocumentId(value: string): ReturnType<typeof ResearchDocumentId> {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) throw new Error('document_id must be a paper_import sha256 id')
  return ResearchDocumentId(value)
}

/**
 * Validate a model-supplied block identity.
 * @param value - exact block id.
 * @returns branded block id.
 */
export function parseBlockId(value: string): ReturnType<typeof ResearchDocumentBlockId> {
  if (!/^block:[0-9a-f]{64}$/u.test(value)) throw new Error('block_id must be a paper block id')
  return ResearchDocumentBlockId(value)
}

/**
 * Resolve a positive bounded item count.
 * @param name - diagnostic field name.
 * @param value - optional requested count.
 * @param maximum - configured ceiling and default.
 * @returns resolved count.
 */
export function boundedOptionalCount(name: string, value: number | undefined, maximum: number): number {
  if (value === undefined) return maximum
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 through ${maximum}`)
  }
  return value
}

/**
 * Resolve a non-negative safe offset.
 * @param name - diagnostic field name.
 * @param value - optional requested offset.
 * @param fallback - default offset.
 * @returns resolved offset.
 */
export function nonNegativeOptionalCount(name: string, value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`)
  return value
}

/**
 * Project a source-owned locator into tool JSON.
 * @param locator - exact block anchor.
 * @returns detached locator fields.
 */
export function projectLocator(locator: ResearchDocumentBlockLocator): ProjectedLocator {
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

/**
 * Tag the complete navigation value for tool presentation.
 * @param kind - presentation tag.
 * @param value - result fields.
 * @returns versioned presentation metadata.
 */
export function taggedMeta<T>(kind: string, value: T): { kind: string; version: number; value: T } {
  return { kind, version: 1, value }
}
