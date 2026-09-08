/** Durable source, parser-history, atomicity, and lifecycle behavior. */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import ResearchDocumentRuntime, { researchDocumentParseResultSchema, type ResearchDocumentParseResult } from '../../src/research-document/index.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../helpers/memory-backend.ts'
import * as archivePlugin from '../../src/research-document-storage/index.ts'

const request = (value: number) => ({ bytes: Uint8Array.of(value, 2, 3), mediaType: 'application/pdf' })

function parsed(version = 'fixture-v1', text = '原文 evidence'): ResearchDocumentParseResult {
  return {
    parserVersion: version,
    extraction: { text: 'native', layout: 'approximate' },
    pages: [{
      pageIndex: 0, width: 612, height: 792,
      blocks: [{ kind: 'paragraph', text, bbox: { x: 0, y: 0, width: 1, height: 0.1 } }],
    }],
  }
}

async function mount(pool = new MemoryMediaPool(), config: archivePlugin.Config = {}) {
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory' })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  await ctx.plugin(ResearchDocumentRuntime, { maxDocuments: 1 })
  try {
    const fiber = await ctx.plugin(archivePlugin, config)
    return { ctx, fiber, runtime: ctx.researchDocuments, pool }
  } catch (error) {
    await ctx.fiber.dispose()
    throw error
  }
}

function register(runtime: ResearchDocumentRuntime, result = parsed()) {
  return runtime.registerParser({
    id: 'fixture', available: () => true, supports: () => true,
    parse: () => Promise.resolve(result),
  })
}

describe('durable research-document archive', () => {
  it('restores OCR tables, formula notation, and generated chart data without re-extraction', async () => {
    const output = researchDocumentParseResultSchema.parse(JSON.parse(readFileSync(new URL(
      '../fixtures/research-document/docling/extraction.json', import.meta.url,
    ), 'utf8')) as unknown)
    const first = await mount()
    register(first.runtime, output)
    const document = await first.runtime.import(request(1))
    await first.ctx.fiber.dispose()
    const second = await mount(first.pool)
    try {
      expect(await second.runtime.restore(document.id)).toEqual(document)
      expect(document.pages.flatMap(page => page.blocks).filter(block => block.structure !== undefined)).toHaveLength(3)
    } finally { await second.ctx.fiber.dispose() }
  })

  it('restores exact bytes and anchors after a complete remount without a parser', async () => {
    const first = await mount()
    register(first.runtime)
    const original = await first.runtime.import(request(1))
    await first.runtime.import(request(2))
    expect(first.runtime.peek(original.id)).toBeUndefined()
    expect(await first.runtime.restore(original.id)).toEqual(original)
    await first.ctx.fiber.dispose()

    const second = await mount(first.pool)
    const restored = await second.runtime.restore(original.id)
    expect(restored).toEqual(original)
    const bytes = await second.runtime.source(original.id)
    expect(bytes).toEqual(request(1).bytes)
    bytes.fill(0)
    expect(await second.runtime.source(original.id)).toEqual(request(1).bytes)
    const block = restored.pages[0]!.blocks[0]!
    expect(second.runtime.read(restored, block.id, 0, 0).blocks).toEqual([block])
    expect(second.runtime.search(restored, '原文', 1)[0]?.locator).toEqual(block.locator)
    await second.ctx.fiber.dispose()
  })

  it('keeps restored snapshots readable when concurrent restoration evicts their cache entry', async () => {
    const { ctx, runtime } = await mount()
    register(runtime)
    const one = await runtime.import(request(1))
    const two = await runtime.import(request(2))
    const [restoredOne, restoredTwo] = await Promise.all([runtime.restore(one.id), runtime.restore(two.id)])
    expect(runtime.search(restoredOne, 'evidence', 1)).toHaveLength(1)
    expect(runtime.search(restoredTwo, 'evidence', 1)).toHaveLength(1)
    expect(runtime.outline(restoredOne)).toEqual([])
    await ctx.fiber.dispose()
  })

  it('retains historical parser revisions and rejects changed output under the same revision', async () => {
    const first = await mount()
    register(first.runtime)
    const original = await first.runtime.import(request(1))
    await first.ctx.fiber.dispose()

    const second = await mount(first.pool)
    register(second.runtime, parsed('fixture-v2', 'Revised text'))
    const revised = await second.runtime.import(request(1))
    expect(revised.id).toBe(original.id)
    expect(revised.pages[0]!.blocks[0]!.id).not.toBe(original.pages[0]!.blocks[0]!.id)
    expect(await second.runtime.restore(original.id, { id: 'fixture', version: 'fixture-v1' })).toEqual(original)
    await expect(second.runtime.restore(original.id, { id: 'fixture', version: 'missing' }))
      .rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_NOT_FOUND' })
    await second.ctx.fiber.dispose()

    const third = await mount(first.pool)
    register(third.runtime, parsed('fixture-v2', 'Unversioned replacement'))
    await expect(third.runtime.import(request(1)))
      .rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_ARCHIVE_REVISION_CONFLICT' })
    expect(third.runtime.peek(original.id)).toBeUndefined()
    expect(await third.runtime.restore(original.id)).toEqual(revised)
    await third.ctx.fiber.dispose()
  })

  it('does not publish imports whose durable write fails, and allows retry', async () => {
    const { ctx, runtime, pool } = await mount()
    register(runtime)
    pool.failNextWrites = 1
    await expect(runtime.import(request(1))).rejects.toThrow('injected write failure')
    expect(pool.media.get('research_document_archive')?.tables.get('documents')?.size ?? 0).toBe(0)
    const document = await runtime.import(request(1))
    expect(await runtime.source(document.id)).toEqual(request(1).bytes)
    await ctx.fiber.dispose()
  })

  it('serializes capacity decisions across simultaneous imports without evicting saved sources', async () => {
    const { ctx, runtime } = await mount(undefined, { maxDocuments: 1 })
    register(runtime)
    const results = await Promise.allSettled([runtime.import(request(1)), runtime.import(request(2))])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(rejected).toMatchObject({ reason: { code: 'RESEARCH_DOCUMENT_ARCHIVE_CAPACITY' } })
    await ctx.fiber.dispose()
  })

  it.each(['maxSourceBytes', 'maxRecordBytes', 'maxTotalBytes'] as const)('bounds %s before committing a document', async (field) => {
    const { ctx, runtime, pool } = await mount(undefined, { [field]: 1 })
    register(runtime)
    await expect(runtime.import(request(1))).rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_ARCHIVE_CAPACITY' })
    expect(pool.media.get('research_document_archive')?.tables.get('documents')?.size ?? 0).toBe(0)
    await ctx.fiber.dispose()
  })

  it('rejects a new parser revision over capacity while retaining the original', async () => {
    const first = await mount()
    register(first.runtime)
    const original = await first.runtime.import(request(1))
    await first.ctx.fiber.dispose()
    const second = await mount(first.pool, { maxParserRevisions: 1 })
    register(second.runtime, parsed('fixture-v2'))
    await expect(second.runtime.import(request(1))).rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_ARCHIVE_CAPACITY' })
    expect(await second.runtime.restore(original.id)).toEqual(original)
    await second.ctx.fiber.dispose()
  })

  it.each(['sourceBase64', 'currentRevision', 'pageIndex', 'parserVersion', 'duplicateRevision'])('rejects corrupted durable %s', async (field) => {
    const first = await mount()
    register(first.runtime)
    const document = await first.runtime.import(request(1))
    await first.ctx.fiber.dispose()
    const table = first.pool.media.get('research_document_archive')!.tables.get('documents')!
    const record = structuredClone(table.get(document.id)) as {
      sourceBase64: string
      currentRevision: number
      revisions: Array<{ parserId: string; parsed: { parserVersion: string; pages: Array<{ pageIndex: number }> } }>
    }
    if (field === 'sourceBase64') record.sourceBase64 = 'AAAA'
    if (field === 'currentRevision') record.currentRevision = 12
    if (field === 'pageIndex') record.revisions[0]!.parsed.pages[0]!.pageIndex = 5
    if (field === 'parserVersion') record.revisions[0]!.parsed.parserVersion = ''
    if (field === 'duplicateRevision') record.revisions.push(record.revisions[0]!)
    table.set(document.id, record)
    await expect(mount(first.pool)).rejects.toThrow()
  })

  it('refuses unsupported archive formats and startup capacities', async () => {
    const first = await mount()
    register(first.runtime)
    await first.runtime.import(request(1))
    await first.ctx.fiber.dispose()
    await expect(mount(first.pool, { maxSourceBytes: 1 })).rejects.toThrow('maxSourceBytes')
    first.pool.versions.set('research_document_archive', 999)
    await expect(mount(first.pool)).rejects.toMatchObject({ code: 'version-mismatch' })
  })

  it('unregisters the archive on disposal and can mount it again', async () => {
    const { ctx, fiber, runtime } = await mount()
    register(runtime)
    const original = await runtime.import(request(1))
    await fiber.dispose()
    await expect(runtime.source(original.id)).rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_ARCHIVE_UNAVAILABLE' })
    await ctx.plugin(archivePlugin)
    expect(await runtime.source(original.id)).toEqual(request(1).bytes)
    await ctx.fiber.dispose()
  })
})
