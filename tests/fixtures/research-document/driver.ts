#!/usr/bin/env node
/** Run the complete native-text paper-reading slice through app boot and Loader. */

import { writeFile } from 'node:fs/promises'
import { boot, resolveConfigPath } from '@deepseek-ai/dsh-app-boot'
import { CallId } from '@deepseek-ai/dsh-llm'
import { researchPdfBytes } from './fixture.ts'

const configPath = process.argv[2]
if (configPath === undefined) throw new Error('research-document driver requires a config path')

await writeFile('./paper.pdf', researchPdfBytes())
const ctx = await boot('research-document-loader-smoke', resolveConfigPath(configPath, undefined))
try {
  let callIndex = 0
  const call = (name: string, args: unknown) => ctx.tools.execute({
    signal: new AbortController().signal,
    callId: CallId(`research-loader-${++callIndex}`),
    name,
    arguments: args,
  })
  const resultText = (result: Awaited<ReturnType<typeof call>>): string =>
    result.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')

  const imported = await call('paper_import', { file_path: 'paper.pdf' })
  if (imported.isError) throw new Error(imported.error.message)
  const documentId = (imported.value as { document_id: string }).document_id
  const outline = await call('paper_outline', { document_id: documentId })
  if (outline.isError) throw new Error(outline.error.message)
  const search = await call('paper_search', { document_id: documentId, query: 'anchor beta' })
  if (search.isError) throw new Error(search.error.message)
  const blockId = (search.value as { hits: Array<{ locator: { block_id: string } }> }).hits[0]?.locator.block_id
  if (blockId === undefined) throw new Error('real Loader composition returned no beta search hit')
  const read = await call('paper_read', { document_id: documentId, block_id: blockId, before: 1, after: 1 })
  if (read.isError) throw new Error(read.error.message)

  const prompt = await ctx.systemPrompt.assemble()
  await writeFile('./research-document-report.json', JSON.stringify({
    tools: ctx.tools.schemas().map(schema => schema.name),
    promptHasEvidenceGuidance: prompt.sections.some(section =>
      section.name === 'tool:research-document' && section.text.includes('exact surrounding evidence')),
    metadataKinds: [imported.meta, outline.meta, search.meta, read.meta].map(meta =>
      typeof meta === 'object' && meta !== null && !Array.isArray(meta) ? meta.kind : undefined),
    importText: resultText(imported).replace(process.cwd(), '<cwd>'),
    outlineText: resultText(outline),
    searchText: resultText(search),
    readText: resultText(read),
  }))
} finally {
  await ctx.fiber.dispose()
}
