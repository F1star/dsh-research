import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { Context } from '@deepseek-ai/cordis'
import Invariants from '@deepseek-ai/dsh-invariants'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'

interface Manifest {
  readonly dsh?: { readonly bundle?: { readonly patch?: string } }
  readonly peerDependencies?: Readonly<Record<string, string>>
  readonly scripts?: Readonly<Record<string, string>>
}

interface PatchRow {
  readonly insert?: readonly {
    readonly id?: string
    readonly name?: string
    readonly config?: Readonly<Record<string, unknown>>
  }[]
}

const root = resolve(import.meta.dirname, '..')

describe('standalone research bundle', () => {
  it('registers a standalone browser factory and ships the optional OCR worker', () => {
    const registrations: { id: string; factory: unknown }[] = []
    runInNewContext(readFileSync(resolve(root, 'lib/client.js'), 'utf8'), {
      window: { __ModuleLoader__: { load: (value: { id: string; factory: unknown }) => registrations.push(value) } },
    })
    expect(registrations.map(value => value.id)).toEqual(['@f1star/dsh-research'])
    expect(typeof registrations[0]?.factory).toBe('function')
    expect(readFileSync(resolve(root, 'resources/docling/py/parse.py'), 'utf8')).toContain('docling')
  })

  it('keeps invariant registrations unique across every packaged service and consumer', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(Invariants)
      const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { exports: Record<string, unknown> }
      for (const entry of Object.keys(manifest.exports).filter(name => name.endsWith('/invariant'))) {
        const module = await import(/* @vite-ignore */ new URL(`../lib/${entry.slice(2)}.js`, import.meta.url).href)
        await ctx.plugin(module)
        const owner = `@f1star/dsh-research/${entry.slice(2, -'/invariant'.length)}`
        expect(() => ctx.invariants.register(owner, () => {})).toThrow('already registered')
      }
    } finally { await ctx.fiber.dispose() }
  })

  it('declares an installable DSH patch without install-time scripts', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as Manifest

    expect(manifest.dsh?.bundle?.patch).toBe('./cordis.patch.yml')
    expect(manifest.scripts).not.toHaveProperty('prepare')
    expect(manifest.scripts).not.toHaveProperty('preinstall')
    expect(manifest.scripts).not.toHaveProperty('postinstall')
  })

  it('keeps official DSH packages on the shared peer surface', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as Manifest

    expect(Object.keys(manifest.peerDependencies ?? {}).sort()).toEqual([
      '@deepseek-ai/cordis',
      '@deepseek-ai/dsh-agent',
      '@deepseek-ai/dsh-agent-default-model',
      '@deepseek-ai/dsh-agent-presets',
      '@deepseek-ai/dsh-api-remotes',
      '@deepseek-ai/dsh-brand',
      '@deepseek-ai/dsh-client-runtime',
      '@deepseek-ai/dsh-client-ui-sidebar',
      '@deepseek-ai/dsh-fs',
      '@deepseek-ai/dsh-invariants',
      '@deepseek-ai/dsh-llm',
      '@deepseek-ai/dsh-session',
      '@deepseek-ai/dsh-session-persistence',
      '@deepseek-ai/dsh-storage-domain',
      '@deepseek-ai/dsh-subprocess',
      '@deepseek-ai/dsh-system-prompt',
      '@deepseek-ai/dsh-tools',
      '@deepseek-ai/dsh-typert-protocol',
      '@deepseek-ai/schemastery',
    ])
  })

  it('mounts the workbench services before the four model-facing consumers', () => {
    const patch = load(readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')) as PatchRow[]
    const rows = patch.flatMap(row => row.insert ?? [])

    expect(rows.map(row => row.id)).toEqual([
      'f1star-research',
      'f1star-research-document',
      'f1star-research-document-pdfjs',
      'f1star-research-document-storage',
      'f1star-research-library',
      'f1star-research-information',
      'f1star-research-report',
      'f1star-research-task',
      'f1star-research-workspace',
      'f1star-research-task-runner',
      'f1star-tool-research-document',
      'f1star-tool-research-library',
      'f1star-tool-research-information',
      'f1star-tool-research-task',
    ])
    expect(rows.map(row => row.name)).toEqual([
      '@f1star/dsh-research',
      '@f1star/dsh-research/research-document',
      '@f1star/dsh-research/research-document-pdfjs',
      '@f1star/dsh-research/research-document-storage',
      '@f1star/dsh-research/research-library',
      '@f1star/dsh-research/research-information',
      '@f1star/dsh-research/research-report',
      '@f1star/dsh-research/research-task',
      '@f1star/dsh-research/research-workspace',
      '@f1star/dsh-research/research-task-runner',
      '@f1star/dsh-research/tool-research-document',
      '@f1star/dsh-research/tool-research-library',
      '@f1star/dsh-research/tool-research-information',
      '@f1star/dsh-research/tool-research-task',
    ])
    expect(rows[1]?.config).toEqual({ parserProvider: 'pdfjs' })
  })

  it('ships the v0.3 tools through the committed built entry points', () => {
    const documentTools = readFileSync(
      resolve(root, 'lib/tool-research-document/index.js'),
      'utf8',
    )
    const informationTools = readFileSync(
      resolve(root, 'lib/tool-research-information/index.js'),
      'utf8',
    )
    const reviewRenderer = readFileSync(
      resolve(root, 'lib/tool-research-information/review-render.js'),
      'utf8',
    )

    expect(documentTools).toContain("name: 'paper_reading_pack'")
    expect(informationTools).toContain("name: 'research_review_render'")
    expect(informationTools).toContain('render_digest')
    expect(informationTools).toContain('comparison_protocol_ids')
    expect(informationTools).toContain('stale_synthesis_comparison_references')
    expect(reviewRenderer).toContain('Comparison basis:')
  })
})
