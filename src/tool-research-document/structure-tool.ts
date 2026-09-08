/** Paged scientific-object navigation over exact, restorable parser revisions. */

import type { Context } from '@deepseek-ai/cordis'
import { assertNever } from '@deepseek-ai/dsh-llm'
import type { ResearchDocumentBlock, ResearchDocumentStructure } from '../research-document/index.ts'
import { defineTool, type InferValue } from '@deepseek-ai/dsh-tools'
import {
  EXTRACTION_SCHEMA, LOCATOR_SCHEMA, boundedOptionalCount, nonNegativeOptionalCount,
  parseBlockId, parseDocumentId, projectLocator, taggedMeta,
} from './navigation.ts'

/** Configured bounds for complete scientific results and their individual fields. */
export interface StructureToolConfig {
  readonly maxStructureItems: number
  readonly maxStructureTextChars: number
  readonly maxStructureOutputBytes: number
}

const kind = { type: 'string', required: true, enum: ['table', 'formula', 'figure'] } as const
const field = { type: 'string', enum: ['text', 'latex', 'description', 'classification', 'caption', 'footnote', 'cell'] } as const
const common = {
  document_id: { type: 'string', required: true },
  parser_id: { type: 'string', required: true },
  parser_version: { type: 'string', required: true },
  extraction: { ...EXTRACTION_SCHEMA, required: true },
  review_status: { type: 'string', required: true, const: 'unreviewed' },
} as const
const paging = {
  offset: { type: 'integer', required: true },
  total_items: { type: 'integer', required: true },
  next_offset: { type: 'integer' },
} as const
const outputSchema = {
  oneOf: [
    {
      type: 'object', additionalProperties: false,
      properties: {
        ...common, ...paging,
        view: { type: 'string', required: true, const: 'list' },
        items: {
          type: 'array', required: true,
          items: { type: 'object', additionalProperties: false, properties: { kind, locator: { ...LOCATOR_SCHEMA, required: true } } },
        },
      },
    },
    {
      type: 'object', additionalProperties: false,
      properties: {
        ...common, ...paging, kind,
        view: { type: 'string', required: true, const: 'read' },
        locator: { ...LOCATOR_SCHEMA, required: true },
        status: { type: 'string', required: true, enum: ['extracted', 'unavailable', 'not-requested'] },
        caption_count: { type: 'integer', required: true }, footnote_count: { type: 'integer', required: true },
        rows: { type: 'integer' }, columns: { type: 'integer' },
        cells: {
          type: 'array', required: true,
          items: {
            type: 'object', additionalProperties: false,
            properties: {
              index: { type: 'integer', required: true },
              row: { type: 'integer', required: true }, column: { type: 'integer', required: true },
              row_span: { type: 'integer', required: true }, column_span: { type: 'integer', required: true },
              column_header: { type: 'boolean', required: true }, row_header: { type: 'boolean', required: true },
              bbox: { type: 'object', additionalProperties: false, properties: LOCATOR_SCHEMA.properties.bbox.properties },
              text: { type: 'string', required: true },
              total_text_chars: { type: 'integer', required: true }, next_text_offset: { type: 'integer' },
            },
          },
        },
      },
    },
    {
      type: 'object', additionalProperties: false,
      properties: {
        ...common, kind,
        view: { type: 'string', required: true, const: 'text' },
        locator: { ...LOCATOR_SCHEMA, required: true }, field: { ...field, required: true },
        field_index: { type: 'integer' },
        text: { oneOf: [{ type: 'string' }, { type: 'null' }], required: true },
        text_offset: { type: 'integer', required: true }, total_text_chars: { type: 'integer', required: true },
        next_text_offset: { type: 'integer' },
      },
    },
  ],
} as const

type Value = InferValue<typeof outputSchema>
type Field = InferValue<typeof field>
type ScientificBlock = ResearchDocumentBlock & { readonly structure: ResearchDocumentStructure }

/**
 * Register structure discovery, cell paging, and lossless text continuation.
 * @param ctx - owning plugin context with research documents and tools.
 * @param config - resolved, validated output limits.
 */
export function registerStructureTool(ctx: Context, config: StructureToolConfig): void {
  ctx.tools.register(defineTool({
    name: 'paper_structure',
    description: 'List tables, formulas, and figures including objects without OCR text. Supply block_id to page cells and inspect extraction state; supply field to read complete text, notation, captions, notes, or cell text. All extraction remains unreviewed.',
    parameters: {
      document_id: { type: 'string', required: true, description: 'Exact imported or archived document id.' },
      block_id: { type: 'string', description: 'Scientific block from the list. Omit to list objects in reading order.' },
      kind: { type: 'string', enum: kind.enum, description: 'Optional list filter; invalid with block_id.' },
      parser_id: { type: 'string', description: 'Exact parser id; supply together with parser_version. Required for continuation.' },
      parser_version: { type: 'string', description: 'Exact returned extraction revision; repeat it throughout pagination.' },
      offset: { type: 'integer', description: 'Zero-based object offset for listing or cell offset for reading. Defaults to 0.' },
      max_items: { type: 'integer', description: `Maximum objects or cells, from 1 through ${config.maxStructureItems}.` },
      field: { ...field, description: 'Read a text field of block_id; text means original extracted block text. Null means unavailable.' },
      field_index: { type: 'integer', description: 'Required zero-based caption, footnote, or cell index; invalid for scalar fields.' },
      text_offset: { type: 'integer', description: 'Unicode code-point offset within the selected field. Defaults to 0.' },
    },
    output: {
      schema: outputSchema,
      render: (_args, value) => render(value),
      presentationMeta: (_args, value) => taggedMeta('dsh/paper-structure', value),
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const documentId = parseDocumentId(args.document_id)
      const offset = nonNegativeOptionalCount('offset', args.offset, 0)
      const textOffset = nonNegativeOptionalCount('text_offset', args.text_offset, 0)
      const maxItems = boundedOptionalCount('max_items', args.max_items, config.maxStructureItems)
      if ((args.parser_id === undefined) !== (args.parser_version === undefined)
        || args.parser_id?.trim() === '' || args.parser_version?.trim() === '') {
        throw new Error('Supply non-empty parser_id and parser_version together.')
      }
      if ((offset > 0 || textOffset > 0) && args.parser_id === undefined) {
        throw new Error('Continuation requires the returned parser_id and parser_version.')
      }
      if (args.block_id === undefined && (args.field !== undefined || args.field_index !== undefined || args.text_offset !== undefined)) {
        throw new Error('Text field reading requires block_id.')
      }
      if (args.block_id !== undefined && args.kind !== undefined) throw new Error('kind filters the object list only.')
      if (args.field === undefined && (args.field_index !== undefined || args.text_offset !== undefined)) {
        throw new Error('field_index and text_offset require field.')
      }
      if (args.field !== undefined && (args.offset !== undefined || args.max_items !== undefined)) {
        throw new Error('Text field reading uses text_offset, not offset or max_items.')
      }
      const parser = args.parser_id === undefined || args.parser_version === undefined
        ? undefined : { id: args.parser_id, version: args.parser_version }
      const document = await ctx.researchDocuments.restore(documentId, parser)
      const base = {
        document_id: documentId, parser_id: document.parser.id, parser_version: document.parser.version,
        extraction: document.extraction, review_status: 'unreviewed' as const,
      }
      if (args.block_id === undefined) {
        const blocks = ctx.researchDocuments.structures(document, args.kind)
        checkOffset(offset, blocks.length)
        return fitItems(Math.min(maxItems, blocks.length - offset), count => ({
          ...base, view: 'list', ...page(offset, count, blocks.length),
          items: blocks.slice(offset, offset + count)
            .map(block => ({ kind: block.structure.kind, locator: projectLocator(block.locator) })),
        }), config)
      }
      const blockId = parseBlockId(args.block_id)
      const block = ctx.researchDocuments.structures(document).find(block => block.id === blockId)
      if (block === undefined) throw new Error('block_id does not identify a scientific object in this parser revision.')
      const located = { ...base, kind: block.structure.kind, locator: projectLocator(block.locator) }
      const selectedField = args.field
      if (selectedField !== undefined) {
        const selected = selectText(block, selectedField, args.field_index)
        const chars = selected === null ? [] : Array.from(selected)
        checkOffset(textOffset, chars.length)
        return fitItems(Math.min(config.maxStructureTextChars, chars.length - textOffset), count => ({
          ...located, view: 'text', field: selectedField,
          ...(args.field_index === undefined ? {} : { field_index: args.field_index }),
          text: selected === null ? null : chars.slice(textOffset, textOffset + count).join(''),
          text_offset: textOffset, total_text_chars: chars.length,
          ...(textOffset + count < chars.length ? { next_text_offset: textOffset + count } : {}),
        }), config)
      }
      const structure = block.structure
      const table = tableOf(structure)
      const cells = table?.cells ?? []
      checkOffset(offset, cells.length)
      return fitItems(Math.min(maxItems, cells.length - offset), (count, textLimit) => ({
        ...located, view: 'read', ...page(offset, count, cells.length),
        status: structure.kind === 'table' ? 'extracted' : structure.status,
        caption_count: structure.kind === 'formula' ? 0 : structure.captions.length,
        footnote_count: structure.kind === 'formula' ? 0 : structure.footnotes.length,
        ...(table === null ? {} : { rows: table.rows, columns: table.columns }),
        cells: cells.slice(offset, offset + count).map((cell, index) => {
          const chars = Array.from(cell.text)
          return {
            index: offset + index, row: cell.row, column: cell.column,
            row_span: cell.rowSpan, column_span: cell.columnSpan,
            column_header: cell.columnHeader, row_header: cell.rowHeader,
            ...(cell.bbox === undefined ? {} : { bbox: { ...cell.bbox } }),
            text: chars.slice(0, textLimit).join(''), total_text_chars: chars.length,
            ...(chars.length > textLimit ? { next_text_offset: textLimit } : {}),
          }
        }),
      }), config, true)
    },
    presentCall(args) {
      return { card: 'generic', title: args.block_id === undefined ? 'List scientific objects' : 'Read scientific object', kind: 'read' }
    },
  }))
}

function tableOf(structure: ResearchDocumentStructure) {
  switch (structure.kind) {
    case 'table': return structure.data
    case 'figure': return structure.chartData
    case 'formula': return null
    default: return assertNever(structure)
  }
}

function selectText(block: ScientificBlock, field: Field, index: number | undefined): string | null {
  const indexed = field === 'caption' || field === 'footnote' || field === 'cell'
  if (indexed ? index === undefined : index !== undefined) {
    throw new Error('field_index is required only for caption, footnote, and cell fields.')
  }
  const position = nonNegativeOptionalCount('field_index', index, 0)
  const structure = block.structure
  let result: string | null | undefined
  switch (field) {
    case 'text': return block.text
    case 'latex': result = structure.kind === 'formula' ? structure.latex : undefined; break
    case 'description': result = structure.kind === 'figure' ? structure.description : undefined; break
    case 'classification': result = structure.kind === 'figure' ? structure.classification : undefined; break
    case 'caption': result = structure.kind === 'formula' ? undefined : structure.captions[position]; break
    case 'footnote': result = structure.kind === 'formula' ? undefined : structure.footnotes[position]; break
    case 'cell': result = tableOf(structure)?.cells[position]?.text; break
    default: return assertNever(field)
  }
  if (result === undefined) throw new Error('The selected field or field_index does not exist on this scientific object.')
  return result
}

function page(offset: number, count: number, total: number) {
  return { offset, total_items: total, ...(offset + count < total ? { next_offset: offset + count } : {}) }
}

function checkOffset(offset: number, total: number): void {
  if (offset > total) throw new Error(`Offset exceeds the available item or character count (${total}).`)
}

function render(value: Value) {
  return [{ type: 'text' as const, text: `Unreviewed scientific extraction. Formula notation and chart data are machine interpretations, not block quotations.\n${JSON.stringify(value)}` }]
}

function fitItems(
  count: number,
  make: (count: number, textLimit: number) => Value,
  config: StructureToolConfig,
  reduceCellText = false,
): Value {
  let textLimit = config.maxStructureTextChars
  for (;;) {
    const fits = (value: Value) => Buffer.byteLength(JSON.stringify({
      value, content: render(value), meta: taggedMeta('dsh/paper-structure', value),
    })) <= config.maxStructureOutputBytes
    const completePage = make(count, textLimit)
    if (fits(completePage)) return completePage
    let low = 1
    let high = count - 1
    let best: Value | undefined
    while (low <= high) {
      const length = Math.floor((low + high) / 2)
      const value = make(length, textLimit)
      if (fits(value)) {
        best = value
        low = length + 1
      } else high = length - 1
    }
    if (best !== undefined) return best
    if (!reduceCellText || textLimit === 0) {
      throw new Error('Scientific page exceeds maxStructureOutputBytes even at its minimum size; increase the configured byte limit.')
    }
    textLimit = Math.floor(textLimit / 2)
  }
}
