import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
      '@deepseek-ai/dsh-brand',
      '@deepseek-ai/dsh-fs',
      '@deepseek-ai/dsh-invariants',
      '@deepseek-ai/dsh-llm',
      '@deepseek-ai/dsh-storage-domain',
      '@deepseek-ai/dsh-system-prompt',
      '@deepseek-ai/dsh-tools',
      '@deepseek-ai/schemastery',
    ])
  })

  it('mounts the four services before the three model-facing consumers', () => {
    const patch = load(readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8')) as PatchRow[]
    const rows = patch.flatMap(row => row.insert ?? [])

    expect(rows.map(row => row.id)).toEqual([
      'f1star-research-document',
      'f1star-research-document-pdfjs',
      'f1star-research-library',
      'f1star-research-information',
      'f1star-tool-research-document',
      'f1star-tool-research-library',
      'f1star-tool-research-information',
    ])
    expect(rows.map(row => row.name)).toEqual([
      '@f1star/dsh-research/research-document',
      '@f1star/dsh-research/research-document-pdfjs',
      '@f1star/dsh-research/research-library',
      '@f1star/dsh-research/research-information',
      '@f1star/dsh-research/tool-research-document',
      '@f1star/dsh-research/tool-research-library',
      '@f1star/dsh-research/tool-research-information',
    ])
    expect(rows[0]?.config).toEqual({ parserProvider: 'pdfjs' })
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
