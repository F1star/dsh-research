/** Parser transport and teardown using real local workers with recorded inference output. */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ResearchDocumentRuntime from '../../src/research-document/index.ts'
import LocalSubprocessRuntime from '@deepseek-ai/dsh-subprocess-local'
import type { SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import * as provider from '../../src/research-document-docling/index.ts'

const fixture = fileURLToPath(new URL(
  '../fixtures/research-document/docling/extraction.json', import.meta.url,
))
const request = { bytes: Uint8Array.of(1, 2, 3), mediaType: 'application/pdf' }

class RecordedProcess extends LocalSubprocessRuntime {
  mode: 'success' | 'invalid' | 'overflow' | 'failure' | 'waiting' = 'success'
  requests: SubprocessSpawnSpec[] = []

  override async resolveExecutable(): Promise<string> { return process.execPath }

  override spawn(spec: SubprocessSpawnSpec) {
    this.requests.push(spec)
    const output = JSON.stringify(spec.argv[3] === '--check'
      ? { protocol: 1, ready: true }
      : { protocol: 1, parsed: JSON.parse(readFileSync(fixture, 'utf8')) as unknown })
    const script = {
      success: 'process.stdout.write(process.argv[1])',
      invalid: 'process.stdout.write(JSON.stringify({protocol:99,parsed:{}}))',
      overflow: 'process.stdout.write("x".repeat(10000))',
      failure: 'process.stderr.write("parser failed");process.exitCode=1',
      waiting: 'setInterval(()=>{},1000)',
    }[this.mode]
    return super.spawn({
      ...spec,
      argv: [process.execPath, '-e', spec.argv[3] === '--check' ? script : `process.stdin.resume();process.stdin.on('end',()=>{${script}})`, output],
    })
  }
}

async function mount(config: Partial<provider.Config> = {}) {
  const ctx = new Context()
  await ctx.plugin(ResearchDocumentRuntime)
  const processes = new RecordedProcess(ctx)
  const fiber = await ctx.plugin(provider, { pythonExecutable: 'recorded-python', ...config })
  return { ctx, processes, fiber }
}

describe('Docling research parser', () => {
  it('publishes validated OCR structures through the managed worker protocol', async () => {
    const { ctx, processes } = await mount()
    try {
      const document = await ctx.researchDocuments.import(request)
      expect(document.extraction.text).toBe('ocr-assisted')
      expect(document.pages[0]?.blocks.some(block => block.structure?.kind === 'table')).toBe(true)
      expect(processes.requests[0]?.argv[1]).toBe('-I')
      expect(processes.requests[0]?.stdio.stdout).toEqual({ maxBytes: 33554432 })
    } finally { await ctx.fiber.dispose() }
  })

  it.each([
    ['invalid', 'RESEARCH_DOCLING_PROTOCOL'],
    ['overflow', 'RESEARCH_DOCLING_CAPACITY'],
    ['failure', 'RESEARCH_DOCLING_PROCESS'],
  ] as const)('rejects %s worker output without retaining a document', async (mode, code) => {
    const { ctx, processes } = await mount({ maxOutputBytes: 1024 })
    processes.mode = mode
    try {
      await expect(ctx.researchDocuments.import(request)).rejects.toMatchObject({ code })
    } finally { await ctx.fiber.dispose() }
  })

  it('enforces source capacity before creating a process', async () => {
    const { ctx, processes } = await mount({ maxSourceBytes: 2 })
    try {
      await expect(ctx.researchDocuments.import(request)).rejects.toMatchObject({ code: 'RESEARCH_DOCLING_CAPACITY' })
      expect(processes.requests).toHaveLength(1)
      expect(processes.requests[0]?.argv[3]).toBe('--check')
    } finally { await ctx.fiber.dispose() }
  })

  it('cancels active workers, refuses excess concurrency, and unregisters on disposal', async () => {
    const { ctx, processes, fiber } = await mount()
    processes.mode = 'waiting'
    const result = ctx.researchDocuments.import(request)
    const rejected = expect(result).rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_ABORTED' })
    await expect(ctx.researchDocuments.import(request)).rejects.toMatchObject({ code: 'RESEARCH_DOCLING_CAPACITY' })
    await fiber.dispose()
    await rejected
    await expect(ctx.researchDocuments.import(request)).rejects.toMatchObject({ code: 'RESEARCH_DOCUMENT_PROVIDER_UNAVAILABLE' })
    await ctx.fiber.dispose()
  })

  it('reports an expired deadline even when termination returns a process outcome', async () => {
    const { ctx, processes } = await mount({ timeoutMs: 1000 })
    processes.mode = 'waiting'
    try {
      await expect(ctx.researchDocuments.import(request)).rejects.toMatchObject({ code: 'RESEARCH_DOCLING_TIMEOUT' })
    } finally { await ctx.fiber.dispose() }
  })
})
