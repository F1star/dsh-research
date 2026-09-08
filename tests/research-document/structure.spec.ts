/** Recorded real-provider scientific extraction and invalid durable-output checks. */

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ResearchDocumentRuntime, { researchDocumentParseResultSchema } from '../../src/research-document/index.ts'

const fixture = () => JSON.parse(readFileSync(new URL(
  '../fixtures/research-document/docling/extraction.json', import.meta.url,
), 'utf8')) as unknown

describe('scientific document structures', () => {
  it('retains scanned table cells and generated chart values separately from quoted captions', async () => {
    const parsed = researchDocumentParseResultSchema.parse(fixture())
    const ctx = new Context()
    await ctx.plugin(ResearchDocumentRuntime)
    ctx.researchDocuments.registerParser({
      id: 'docling', available: () => true, supports: () => true, parse: async () => parsed,
    })
    try {
      const document = await ctx.researchDocuments.import({ bytes: Uint8Array.of(1), mediaType: 'application/pdf' })
      const blocks = document.pages.flatMap(page => page.blocks)
      const table = blocks.find(block => block.structure?.kind === 'table')!
      expect(table.structure).toMatchObject({ kind: 'table', data: { rows: 3, columns: 4 } })
      expect(table.text).toContain('Baseline A\tTest\t80.0\t1.2')
      const chart = blocks.find(block => block.structure?.kind === 'figure')!
      expect(chart.text).toBe('Figure 1. Test accuracy at three training epochs. Points are means.')
      expect(chart.structure).toMatchObject({ classification: 'line_chart', status: 'extracted' })
      expect(chart.text).not.toContain('85.5')
      expect(ctx.researchDocuments.read(document, table.id, 0, 0).blocks[0]?.structure).toEqual(table.structure)
      expect(ctx.researchDocuments.structures(document.id).map(block => block.structure.kind)).toEqual(['table', 'figure', 'formula'])
      expect(ctx.researchDocuments.structures(document, 'table')).toEqual([table])
      for (let index = 2; index <= 18; index++) {
        await ctx.researchDocuments.import({ bytes: Uint8Array.of(index), mediaType: 'application/pdf' })
      }
      expect(ctx.researchDocuments.peek(document.id)).toBeUndefined()
      expect(ctx.researchDocuments.structures(document, 'figure')).toEqual([chart])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects grid overflow instead of changing cell spans', () => {
    const value = researchDocumentParseResultSchema.parse(fixture())
    const invalid = {
      ...value,
      pages: value.pages.map(page => ({
        ...page,
        blocks: page.blocks.map(block => block.structure?.kind !== 'table' ? block : ({
          ...block,
          structure: {
            ...block.structure,
            data: { ...block.structure.data, cells: block.structure.data.cells.map(cell => ({ ...cell, rowSpan: 100 })) },
          },
        })),
      })),
    }
    expect(researchDocumentParseResultSchema.safeParse(invalid).success).toBe(false)
  })

  it('rejects claimed formula extraction without notation and undocumented extraction modes', () => {
    const value = researchDocumentParseResultSchema.parse(fixture())
    const page = value.pages[0]!
    const block = page.blocks.find(candidate => candidate.structure?.kind === 'formula')!
    expect(researchDocumentParseResultSchema.safeParse({
      ...value, pages: [{ ...page, blocks: [{ ...block, structure: { kind: 'formula', status: 'extracted', latex: null } }] }],
    }).success).toBe(false)
    expect(researchDocumentParseResultSchema.safeParse({
      ...value, extraction: { text: 'perfect', layout: 'exact' },
    }).success).toBe(false)
  })
})
