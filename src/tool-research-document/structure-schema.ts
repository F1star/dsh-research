/** Tool-result fields for unreviewed scientific extraction, separate from block quotations. */

import { assertNever } from '@deepseek-ai/dsh-llm'
import type { ResearchDocumentStructure, ResearchDocumentTable } from '../research-document/index.ts'
import type { InferValue } from '@deepseek-ai/dsh-tools'

const cell = {
  type: 'object', additionalProperties: false,
  properties: {
    row: { type: 'integer', required: true }, column: { type: 'integer', required: true },
    rowSpan: { type: 'integer', required: true }, columnSpan: { type: 'integer', required: true },
    text: { type: 'string', required: true }, columnHeader: { type: 'boolean', required: true },
    rowHeader: { type: 'boolean', required: true },
    bbox: {
      type: 'object', additionalProperties: false,
      properties: {
        x: { type: 'number', required: true }, y: { type: 'number', required: true },
        width: { type: 'number', required: true }, height: { type: 'number', required: true },
      },
    },
  },
} as const

const table = {
  type: 'object', additionalProperties: false,
  properties: {
    rows: { type: 'integer', required: true }, columns: { type: 'integer', required: true },
    cells: { type: 'array', required: true, items: cell },
  },
} as const

const strings = { type: 'array', required: true, items: { type: 'string' } } as const
const nullableText = { oneOf: [{ type: 'string' }, { type: 'null' }], required: true } as const
const status = { type: 'string', required: true, enum: ['extracted', 'not-requested', 'unavailable'] } as const

/** Exact structure projection used by paper_read's JSON result. */
export const STRUCTURE_SCHEMA = {
  oneOf: [
    {
      type: 'object', additionalProperties: false,
      properties: {
        kind: { type: 'string', required: true, const: 'table' }, data: { ...table, required: true },
        captions: strings, footnotes: strings,
      },
    },
    {
      type: 'object', additionalProperties: false,
      properties: {
        kind: { type: 'string', required: true, const: 'formula' }, latex: nullableText, status,
      },
    },
    {
      type: 'object', additionalProperties: false,
      properties: {
        kind: { type: 'string', required: true, const: 'figure' }, captions: strings, footnotes: strings,
        classification: nullableText, chartData: { oneOf: [table, { type: 'null' }], required: true },
        description: nullableText, status,
      },
    },
  ],
} as const

/**
 * Copy source-owned readonly extraction into the tool's mutable JSON projection.
 * @param value - scientific object belonging to one anchored document block.
 * @returns detached fields without changing any recognized text or values.
 */
export function projectStructure(value: ResearchDocumentStructure): InferValue<typeof STRUCTURE_SCHEMA> {
  switch (value.kind) {
    case 'table':
      return { ...value, data: projectTable(value.data), captions: [...value.captions], footnotes: [...value.footnotes] }
    case 'formula':
      return { ...value }
    case 'figure':
      return {
        ...value, captions: [...value.captions], footnotes: [...value.footnotes],
        chartData: value.chartData === null ? null : projectTable(value.chartData),
      }
    default:
      return assertNever(value)
  }
}

function projectTable(value: ResearchDocumentTable) {
  return {
    rows: value.rows, columns: value.columns,
    cells: value.cells.map(cell => ({ ...cell, ...(cell.bbox === undefined ? {} : { bbox: { ...cell.bbox } }) })),
  }
}
