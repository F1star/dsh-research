/** Validated parser output shared by process decoders and durable document archives. */

import { z } from 'zod'
import type { ResearchDocumentParseResult, ResearchDocumentStructure, ResearchDocumentTable } from './types.ts'

const rect = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1),
  height: z.number().min(0).max(1),
})

const table: z.ZodType<ResearchDocumentTable> = z.strictObject({
  rows: z.number().int().nonnegative(),
  columns: z.number().int().nonnegative(),
  cells: z.array(z.strictObject({
    row: z.number().int().nonnegative(),
    column: z.number().int().nonnegative(),
    rowSpan: z.number().int().positive(),
    columnSpan: z.number().int().positive(),
    text: z.string(),
    columnHeader: z.boolean(),
    rowHeader: z.boolean(),
    bbox: rect.optional(),
  }).transform(({ bbox, ...cell }) => ({ ...cell, ...(bbox === undefined ? {} : { bbox }) }))),
}).refine(value => value.cells.every(cell => cell.row + cell.rowSpan <= value.rows
  && cell.column + cell.columnSpan <= value.columns), { message: 'table cells must fit their declared grid' })

const structure: z.ZodType<ResearchDocumentStructure> = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('table'), data: table, captions: z.array(z.string()), footnotes: z.array(z.string()),
  }),
  z.strictObject({
    kind: z.literal('formula'), latex: z.string().min(1).nullable(),
    status: z.enum(['extracted', 'not-requested', 'unavailable']),
  }).refine(value => (value.status === 'extracted') === (value.latex !== null), {
    message: 'extracted formulas require notation; unavailable formulas cannot supply notation',
  }),
  z.strictObject({
    kind: z.literal('figure'), captions: z.array(z.string()), footnotes: z.array(z.string()),
    classification: z.string().min(1).nullable(), chartData: table.nullable(),
    description: z.string().min(1).nullable(), status: z.enum(['extracted', 'not-requested', 'unavailable']),
  }).refine(value => (value.status === 'extracted') === (value.chartData !== null || value.description !== null), {
    message: 'extracted figures require generated data or description',
  }),
])

/** Decode complete parser output at process and durable storage boundaries. */
export const researchDocumentParseResultSchema: z.ZodType<ResearchDocumentParseResult> = z.strictObject({
  parserVersion: z.string().min(1),
  title: z.string().optional(),
  extraction: z.discriminatedUnion('text', [
    z.strictObject({ text: z.literal('native'), layout: z.literal('approximate') }),
    z.strictObject({ text: z.literal('ocr-assisted'), layout: z.literal('approximate') }),
    z.strictObject({ text: z.literal('none'), layout: z.literal('page-only') }),
  ]),
  pages: z.array(z.strictObject({
    pageIndex: z.number().int().nonnegative(),
    pageLabel: z.string().optional(),
    width: z.number().positive(),
    height: z.number().positive(),
    blocks: z.array(z.strictObject({
      kind: z.enum(['heading', 'paragraph']),
      text: z.string(),
      structure: structure.optional(),
      bbox: rect,
      headingLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    }).transform(({ headingLevel, structure, ...block }) => ({
      ...block, ...(headingLevel === undefined ? {} : { headingLevel }),
      ...(structure === undefined ? {} : { structure }),
    }))),
  }).transform(({ pageLabel, ...page }) => ({
    ...page, ...(pageLabel === undefined ? {} : { pageLabel }),
  }))),
}).transform(({ title, ...document }) => ({
  ...document, ...(title === undefined ? {} : { title }),
})).refine(value => value.pages.every((page, index) => page.pageIndex === index), {
  message: 'archived pages must use consecutive zero-based indexes',
})
