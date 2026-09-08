import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import type { StorageBackend } from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import { ResearchDocumentId } from '../../src/research-document/index.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../helpers/memory-backend.ts'
import ResearchLibrary, {
  researchLibraryDomainSpec,
  ResearchPaperId,
  ResearchSourceVersionId,
  type Config,
  type RegisterResearchPaperRequest,
  type ResearchImportedDocumentInput,
  type ResearchPaperRecord,
} from '../../src/research-library/index.ts'

const documentId = (character: string) => ResearchDocumentId(`sha256:${character.repeat(64)}`)

function imported(
  character: string,
  parserVersion = 'parser-v1',
  title: string | false = 'Parsed Paper',
  sourceAlias: string | false = `version ${character}`,
): ResearchImportedDocumentInput {
  return {
    documentId: documentId(character),
    mediaType: 'application/pdf',
    parserId: 'fixture-parser',
    parserVersion,
    extraction: { text: 'native', layout: 'approximate' },
    ...(title === false ? {} : { documentTitle: title }),
    pageCount: 3,
    blockCount: 12,
    ...(sourceAlias === false ? {} : { sourceAlias }),
  }
}

async function mount(options: {
  pool?: MemoryMediaPool
  backend?: StorageBackend
  config?: Config
} = {}) {
  const pool = options.pool ?? new MemoryMediaPool()
  const ctx = new Context()
  await ctx.plugin(Storage)
  ctx.storage.backend.register('memory', options.backend ?? new MemoryStorageBackend(pool))
  const facility = new DomainFacility(ctx, { backend: 'memory', routes: {} })
  ctx.storage.mount('domain', facility)
  ctx.provide('storageDomain', facility)
  const fiber = await ctx.plugin(ResearchLibrary, options.config ?? {})
  return { ctx, fiber, pool, library: ctx.researchLibrary }
}

function successful(result: Awaited<ReturnType<ResearchLibrary['register']>>): ResearchPaperRecord {
  expect(['created', 'updated', 'unchanged']).toContain(result.status)
  if (result.status !== 'created' && result.status !== 'updated' && result.status !== 'unchanged') {
    throw new Error(`expected successful registration, got ${result.status}`)
  }
  return result.paper
}

const storedAt = '2026-08-31T00:00:00.000Z'

function storedRecord(character: string, withSource = true): ResearchPaperRecord {
  return {
    id: ResearchPaperId(`paper-${character}`),
    metadata: {
      title: { value: `Paper ${character}`, origin: 'declared' },
      authors: { value: [`Author ${character}`], origin: 'declared' },
      year: { value: 2026, origin: 'declared' },
      venue: { value: `Venue ${character}`, origin: 'declared' },
    },
    externalIds: [{
      kind: 'doi', value: `10.1/${character}`, origin: 'declared', addedAt: storedAt,
    }],
    acquisitionState: withSource ? 'imported' : 'metadata-only',
    sourceVersions: withSource ? [{
      id: ResearchSourceVersionId(`source-${character}`),
      documentId: documentId(character),
      state: 'imported',
      aliases: [{ value: `version ${character}`, origin: 'declared', addedAt: storedAt }],
      observations: [{
        parserId: 'fixture-parser',
        parserVersion: 'parser-v1',
        mediaType: 'application/pdf',
        extraction: { text: 'native', layout: 'approximate' },
        documentTitle: `Paper ${character}`,
        pageCount: 3,
        blockCount: 12,
        observedAt: storedAt,
      }],
      createdAt: storedAt,
      updatedAt: storedAt,
    }] : [],
    createdAt: storedAt,
    updatedAt: storedAt,
  }
}

function poolWith(records: readonly [string, ResearchPaperRecord][]): MemoryMediaPool {
  const pool = new MemoryMediaPool()
  pool.versions.set('research_library', researchLibraryDomainSpec.version)
  pool.media.set('research_library', {
    global: null,
    tables: new Map([['papers', new Map(records)]]),
  })
  return pool
}

describe('ResearchLibrary registration', () => {
  it('keeps work identity, exact source versions, and parser observations separate', async () => {
    const { library } = await mount()
    const created = await library.register({
      metadata: {
        title: '  A\u00a0Research   Paper  ',
        authors: ['Ada  Lovelace', 'Ada Lovelace', 'Grace Hopper'],
        year: 2026,
        venue: '  Test   Conference ',
        origin: 'declared',
      },
      externalIds: [
        { kind: 'doi', value: 'https://doi.org/10.1000/ABC', origin: 'source-derived' },
        { kind: 'doi', value: 'doi:10.1000/abc', origin: 'declared' },
        { kind: 'arxiv', value: 'arXiv:2608.00001v1', origin: 'declared' },
      ],
      document: imported('a'),
    })
    expect(created.status).toBe('created')
    const first = successful(created)
    expect(first.metadata).toEqual({
      title: { value: 'A Research Paper', origin: 'declared' },
      authors: { value: ['Ada Lovelace', 'Grace Hopper'], origin: 'declared' },
      year: { value: 2026, origin: 'declared' },
      venue: { value: 'Test Conference', origin: 'declared' },
    })
    expect(first.externalIds.map(value => `${value.kind}:${value.value}`)).toEqual([
      'doi:10.1000/abc',
      'arxiv:2608.00001v1',
    ])
    expect(first.acquisitionState).toBe('imported')
    expect(first.sourceVersions).toHaveLength(1)
    expect(first.sourceVersions[0]?.observations).toHaveLength(1)
    expect(library.findByDocumentId(documentId('a'))?.id).toBe(first.id)

    const repeated = await library.register({
      paperId: first.id,
      metadata: {
        title: 'A Research Paper',
        authors: ['Ada Lovelace', 'Grace Hopper'],
        year: 2026,
        venue: 'Test Conference',
        origin: 'declared',
      },
      externalIds: [{ kind: 'doi', value: '10.1000/ABC', origin: 'declared' }],
      document: imported('a'),
    })
    expect(repeated.status).toBe('unchanged')
    expect(successful(repeated).updatedAt).toBe(first.updatedAt)

    const parserUpgrade = await library.register({ paperId: first.id, document: imported('a', 'parser-v2') })
    expect(parserUpgrade.status).toBe('updated')
    expect(successful(parserUpgrade).sourceVersions[0]?.observations.map(value => value.parserVersion))
      .toEqual(['parser-v1', 'parser-v2'])

    const newExactSource = await library.register({ paperId: first.id, document: imported('b') })
    expect(newExactSource.status).toBe('updated')
    expect(successful(newExactSource).sourceVersions.map(source => source.documentId))
      .toEqual([documentId('a'), documentId('b')])
    if (newExactSource.status !== 'updated') throw new Error('expected updated source')
    expect(typeof newExactSource.sourceVersionId).toBe('string')
  })

  it('creates metadata-only records and treats normalized title equality only as a candidate', async () => {
    const { library } = await mount()
    const first = await library.register({
      metadata: { title: 'Same Title', origin: 'declared' },
    })
    const second = await library.register({
      metadata: { title: 'same title', origin: 'declared' },
    })
    expect(first.status).toBe('created')
    expect(second.status).toBe('created')
    if (first.status !== 'created' || second.status !== 'created') throw new Error('expected creates')
    expect(first.paper.acquisitionState).toBe('metadata-only')
    expect(second.paper.id).not.toBe(first.paper.id)
    expect(second.possibleDuplicateIds).toEqual([first.paper.id])
    expect(library.list().map(record => record.id)).toEqual(
      [first.paper, second.paper].sort((left, right) => left.createdAt.localeCompare(right.createdAt)
        || String(left.id).localeCompare(String(right.id))).map(record => record.id),
    )
    expect(library.get(ResearchPaperId('missing'))).toBeUndefined()
  })

  it('selects one exact identity and returns non-writing conflicts for contradictions', async () => {
    const { library } = await mount()
    const alpha = successful(await library.register({
      metadata: { title: 'Alpha', origin: 'declared' },
      externalIds: [{ kind: 'doi', value: '10.1/alpha', origin: 'declared' }],
      document: imported('a', 'parser-v1', 'Alpha'),
    }))
    const beta = successful(await library.register({
      metadata: { title: 'Beta', origin: 'declared' },
      externalIds: [{ kind: 'arxiv', value: '2608.00002', origin: 'declared' }],
    }))

    const exactReuse = await library.register({
      externalIds: [{ kind: 'doi', value: 'DOI:10.1/ALPHA', origin: 'declared' }],
    })
    expect(exactReuse.status).toBe('unchanged')
    expect(successful(exactReuse).id).toBe(alpha.id)

    const identifierConflict = await library.register({
      externalIds: [
        { kind: 'doi', value: '10.1/alpha', origin: 'declared' },
        { kind: 'arxiv', value: '2608.00002', origin: 'declared' },
      ],
    })
    expect(identifierConflict.status).toBe('identifier-conflict')
    if (identifierConflict.status !== 'identifier-conflict') throw new Error('expected identifier conflict')
    expect([...identifierConflict.paperIds].sort()).toEqual([alpha.id, beta.id].sort())
    expect(library.list()).toHaveLength(2)

    await expect(library.register({ paperId: ResearchPaperId('missing'), document: imported('c') }))
      .resolves.toEqual({ status: 'paper-not-found', paperId: 'missing' })
    await expect(library.register({ paperId: beta.id, document: imported('a') }))
      .resolves.toMatchObject({ status: 'document-conflict', documentId: documentId('a'), paperId: alpha.id })
    await expect(library.register({
      paperId: beta.id,
      externalIds: [{ kind: 'doi', value: '10.1/alpha', origin: 'declared' }],
    })).resolves.toMatchObject({ status: 'identifier-conflict', paperIds: [alpha.id] })
    await expect(library.register({
      paperId: alpha.id,
      metadata: { title: 'Changed Title', year: 2025, origin: 'declared' },
    })).resolves.toEqual({ status: 'metadata-conflict', paperId: alpha.id, fields: ['title'] })

    const parserConflict = { ...imported('a'), blockCount: 99 }
    await expect(library.register({ paperId: alpha.id, document: parserConflict }))
      .resolves.toMatchObject({ status: 'metadata-conflict', fields: ['observation:fixture-parser@parser-v1'] })

    const gamma = successful(await library.register({
      metadata: { title: 'Gamma', origin: 'declared' },
      document: imported('g', 'parser-v1', 'Gamma'),
    }))
    const exactConflict = await library.register({
      externalIds: [{ kind: 'doi', value: '10.1/alpha', origin: 'declared' }],
      document: imported('g', 'parser-v1', 'Gamma'),
    })
    expect(exactConflict.status).toBe('identifier-conflict')
    if (exactConflict.status !== 'identifier-conflict') throw new Error('expected exact identity conflict')
    expect([...exactConflict.paperIds].sort()).toEqual([alpha.id, gamma.id].sort())
    expect(exactConflict.identifiers).toContain(`document:${documentId('g')}`)
  })

  it('fills missing bibliography and aliases on an already known exact source', async () => {
    const { library } = await mount()
    const first = successful(await library.register({
      metadata: { title: 'Progressive', origin: 'declared' },
      document: imported('p', 'parser-v1', 'Parsed Paper', false),
    }))
    const updated = await library.register({
      paperId: first.id,
      metadata: {
        title: 'Progressive', authors: ['Ada'], year: 2026, venue: 'Venue', origin: 'source-derived',
      },
      externalIds: [{ kind: 'doi', value: '10.1/progressive', origin: 'source-derived' }],
      document: { ...imported('p'), sourceAlias: 'accepted manuscript' },
    })
    expect(updated.status).toBe('updated')
    expect(successful(updated)).toMatchObject({
      metadata: {
        authors: { value: ['Ada'], origin: 'source-derived' },
        year: { value: 2026, origin: 'source-derived' },
        venue: { value: 'Venue', origin: 'source-derived' },
      },
      externalIds: [{ kind: 'doi', value: '10.1/progressive' }],
      sourceVersions: [{ aliases: [{ value: 'accepted manuscript', origin: 'source-derived' }] }],
    })

    await expect(library.register({
      paperId: first.id,
      metadata: {
        title: 'Progressive', authors: ['Grace'], year: 2025, venue: 'Other', origin: 'declared',
      },
    })).resolves.toMatchObject({ status: 'metadata-conflict', fields: ['authors', 'year', 'venue'] })

    const metadataOnly = successful(await library.register({
      metadata: { title: 'Metadata only', origin: 'declared' },
    }))
    const enrichedMetadataOnly = successful(await library.register({
      paperId: metadataOnly.id,
      metadata: { title: 'Metadata only', authors: ['Ada'], origin: 'declared' },
    }))
    expect(enrichedMetadataOnly.acquisitionState).toBe('metadata-only')

    const parserTitle = successful(await library.register({ document: imported('q') }))
    expect(parserTitle.metadata.title.origin).toBe('parser')
    const untitledDocument = successful(await library.register({
      metadata: { title: 'Declared for untitled source', origin: 'declared' },
      document: imported('u', 'parser-v1', false, false),
    }))
    expect(untitledDocument.sourceVersions[0]?.observations[0]?.documentTitle).toBeUndefined()

    const declaredAlias = successful(await library.register({
      metadata: { title: 'Alias later', origin: 'declared' },
      document: imported('l', 'parser-v1', 'Parsed Paper', false),
    }))
    const aliasAdded = successful(await library.register({
      paperId: declaredAlias.id,
      document: { ...imported('l'), sourceAlias: 'later alias' },
    }))
    expect(aliasAdded.sourceVersions[0]?.aliases[0]?.origin).toBe('declared')
  })

  it('fails invalid input early and reports every configured capacity without partial writes', async () => {
    const { library } = await mount({
      config: {
        maxPapers: 1,
        maxSourceVersionsPerPaper: 1,
        maxObservationsPerSource: 1,
        maxExternalIdsPerPaper: 1,
        maxAliasesPerSource: 1,
        maxAuthors: 1,
        maxFieldBytes: 30,
      },
    })
    await expect(library.register({})).rejects.toThrow(/requires metadata/)
    await expect(library.register({ metadata: { title: ' ', origin: 'declared' } })).rejects.toThrow(/non-empty/)
    await expect(library.register({ metadata: { title: 'x'.repeat(31), origin: 'declared' } }))
      .rejects.toThrow(/UTF-8 limit/)
    await expect(library.register({ metadata: { title: 'X', authors: ['A', 'B'], origin: 'declared' } }))
      .rejects.toThrow(/authors exceed/)
    await expect(library.register({
      metadata: { title: 'X', origin: 'declared' },
      externalIds: [{ kind: 'doi', value: 'bad id', origin: 'declared' }],
    })).rejects.toThrow(/contain no whitespace/)

    const first = successful(await library.register({
      metadata: { title: 'First', origin: 'declared' },
      externalIds: [{ kind: 'doi', value: '10.1/first', origin: 'declared' }],
      document: imported('a'),
    }))
    await expect(library.register({ metadata: { title: 'Second', origin: 'declared' } }))
      .resolves.toEqual({ status: 'capacity', resource: 'papers' })
    await expect(library.register({
      paperId: first.id,
      externalIds: [{ kind: 'arxiv', value: '2608.3', origin: 'declared' }],
    })).resolves.toEqual({ status: 'capacity', resource: 'external-ids' })
    await expect(library.register({ paperId: first.id, document: imported('b') }))
      .resolves.toEqual({ status: 'capacity', resource: 'source-versions' })
    await expect(library.register({ paperId: first.id, document: imported('a', 'parser-v2') }))
      .resolves.toEqual({ status: 'capacity', resource: 'observations' })

    const source = first.sourceVersions[0]!
    await expect(library.register({
      paperId: first.id,
      document: { ...imported('a'), sourceAlias: 'another alias' },
    })).resolves.toEqual({ status: 'capacity', resource: 'source-aliases' })
    expect(library.get(first.id)?.sourceVersions[0]?.id).toBe(source.id)
  })

  it('rejects over-capacity initial identifiers and registrations without a usable title', async () => {
    const { library } = await mount({ config: { maxExternalIdsPerPaper: 1 } })
    await expect(library.register({
      metadata: { title: 'Too many ids', origin: 'declared' },
      externalIds: [
        { kind: 'doi', value: '10.1/a', origin: 'declared' },
        { kind: 'arxiv', value: '2608.a', origin: 'declared' },
      ],
    })).resolves.toEqual({ status: 'capacity', resource: 'external-ids' })
    await expect(library.register({
      externalIds: [{ kind: 'doi', value: '10.1/no-title', origin: 'declared' }],
    })).rejects.toThrow(/requires metadata.title or a parsed document title/)
    await expect(library.register({
      metadata: { authors: ['Ada'], origin: 'declared' },
    })).rejects.toThrow(/requires metadata.title or a parsed document title/)
    await expect(library.register({
      metadata: { title: 'Bad year', year: 1.5, origin: 'declared' },
    })).rejects.toThrow(/year must be a safe integer/)
    await expect(library.register({
      metadata: { title: 'Bad parser counts', origin: 'declared' },
      document: { ...imported('z'), pageCount: -1 },
    })).rejects.toThrow(/pageCount must be a non-negative safe integer/)
  })
})

describe('ResearchLibrary alias reconciliation', () => {
  it('adds and removes external and source aliases without destructive merging', async () => {
    const { library } = await mount()
    const first = successful(await library.register({
      metadata: { title: 'First', origin: 'declared' },
      document: imported('a'),
    }))
    const second = successful(await library.register({
      metadata: { title: 'Second', origin: 'declared' },
      externalIds: [{ kind: 'doi', value: '10.1/taken', origin: 'declared' }],
    }))
    const sourceId = first.sourceVersions[0]!.id

    const added = await library.updateAlias({
      action: 'add', paperId: first.id, kind: 'doi', value: 'DOI:10.1/NEW', origin: 'declared',
    })
    expect(added.status).toBe('updated')
    await expect(library.updateAlias({
      action: 'add', paperId: first.id, kind: 'doi', value: '10.1/new', origin: 'source-derived',
    })).resolves.toMatchObject({ status: 'unchanged' })
    await expect(library.updateAlias({
      action: 'add', paperId: first.id, kind: 'doi', value: '10.1/taken', origin: 'declared',
    })).resolves.toEqual({
      status: 'identifier-conflict', paperIds: [second.id], identifiers: ['doi:10.1/taken'],
    })
    await expect(library.updateAlias({
      action: 'remove', paperId: first.id, kind: 'doi', value: '10.1/new', origin: 'declared',
    })).resolves.toMatchObject({ status: 'updated' })
    await expect(library.updateAlias({
      action: 'remove', paperId: first.id, kind: 'doi', value: '10.1/new', origin: 'declared',
    })).resolves.toMatchObject({ status: 'unchanged' })

    await expect(library.updateAlias({
      action: 'add', paperId: first.id, kind: 'source', sourceVersionId: sourceId,
      value: 'accepted manuscript', origin: 'declared',
    })).resolves.toMatchObject({ status: 'updated' })
    await expect(library.updateAlias({
      action: 'remove', paperId: first.id, kind: 'source', sourceVersionId: sourceId,
      value: 'accepted manuscript', origin: 'declared',
    })).resolves.toMatchObject({ status: 'updated' })
    await expect(library.updateAlias({
      action: 'add', paperId: first.id, kind: 'source', sourceVersionId: ResearchSourceVersionId('missing'),
      value: 'x', origin: 'declared',
    })).resolves.toEqual({ status: 'source-not-found', paperId: first.id, sourceVersionId: 'missing' })
    await expect(library.updateAlias({
      action: 'add', paperId: ResearchPaperId('missing'), kind: 'doi', value: '10.1/x', origin: 'declared',
    })).resolves.toEqual({ status: 'paper-not-found', paperId: 'missing' })
  })

  it('reports alias capacities and idempotent exact-source operations', async () => {
    const { library } = await mount({
      config: { maxExternalIdsPerPaper: 1, maxAliasesPerSource: 1 },
    })
    const paper = successful(await library.register({
      metadata: { title: 'Alias capacity', origin: 'declared' },
      externalIds: [{ kind: 'doi', value: '10.1/only', origin: 'declared' }],
      document: imported('a'),
    }))
    const sourceVersionId = paper.sourceVersions[0]!.id
    await expect(library.updateAlias({
      action: 'add', paperId: paper.id, kind: 'arxiv', value: '2608.extra', origin: 'declared',
    })).resolves.toEqual({ status: 'capacity', resource: 'external-ids' })
    await expect(library.updateAlias({
      action: 'add', paperId: paper.id, kind: 'source', sourceVersionId,
      value: 'version a', origin: 'declared',
    })).resolves.toMatchObject({ status: 'unchanged' })
    await expect(library.updateAlias({
      action: 'add', paperId: paper.id, kind: 'source', sourceVersionId,
      value: 'another', origin: 'declared',
    })).resolves.toEqual({ status: 'capacity', resource: 'source-aliases' })
    await expect(library.updateAlias({
      action: 'remove', paperId: paper.id, kind: 'source', sourceVersionId,
      value: 'absent', origin: 'declared',
    })).resolves.toMatchObject({ status: 'unchanged' })
  })
})

describe('ResearchLibrary durability and validation', () => {
  it('reopens the same aggregate after a complete service remount', async () => {
    const pool = new MemoryMediaPool()
    const first = await mount({ pool })
    const record = successful(await first.library.register({
      metadata: { title: 'Persistent Paper', origin: 'declared' },
      document: imported('a'),
    }))
    await first.fiber.dispose()

    const second = await mount({ pool })
    expect(second.library.get(record.id)).toEqual(record)
    expect(second.library.findByDocumentId(documentId('a'))?.id).toBe(record.id)
    await second.fiber.dispose()
  })

  it('accepts a valid persisted metadata-only aggregate', async () => {
    const record = storedRecord('m', false)
    const mounted = await mount({ pool: poolWith([[String(record.id), record]]) })
    expect(mounted.library.get(record.id)).toEqual(record)
    await mounted.fiber.dispose()

    const importedRecord = storedRecord('n')
    const importedSource = importedRecord.sourceVersions[0]!
    const withoutDocumentTitle: ResearchPaperRecord = {
      ...importedRecord,
      sourceVersions: [{
        ...importedSource,
        observations: [{ ...importedSource.observations[0]!, documentTitle: undefined }],
      }],
    }
    const importedMount = await mount({
      pool: poolWith([[String(withoutDocumentTitle.id), withoutDocumentTitle]]),
    })
    expect(importedMount.library.get(withoutDocumentTitle.id)?.sourceVersions[0]?.observations[0]?.documentTitle)
      .toBeUndefined()
    await importedMount.fiber.dispose()
  })

  it('does not publish a failed durable write and serializes concurrent exact registration', async () => {
    const pool = new MemoryMediaPool()
    const mounted = await mount({ pool })
    pool.failNextWrites = 1
    await expect(mounted.library.register({
      metadata: { title: 'Rejected', origin: 'declared' },
    })).rejects.toThrow(/injected write failure/)
    expect(mounted.library.list()).toEqual([])

    const request: RegisterResearchPaperRequest = {
      metadata: { title: 'Concurrent', origin: 'declared' },
      externalIds: [{ kind: 'doi', value: '10.1/concurrent', origin: 'declared' }],
      document: imported('c'),
    }
    const [left, right] = await Promise.all([
      mounted.library.register(request),
      mounted.library.register(request),
    ])
    expect([left.status, right.status].sort()).toEqual(['created', 'unchanged'])
    expect(mounted.library.list()).toHaveLength(1)
  })

  it('fails loud on malformed relationships and a mismatching domain version', async () => {
    const pool = new MemoryMediaPool()
    pool.versions.set('research_library', researchLibraryDomainSpec.version)
    pool.media.set('research_library', {
      global: null,
      tables: new Map([['papers', new Map([['wrong-key', {
        id: 'record-id',
        metadata: { title: { value: 'Stored', origin: 'declared' } },
        externalIds: [],
        acquisitionState: 'metadata-only',
        sourceVersions: [],
        createdAt: '2026-08-31T00:00:00.000Z',
        updatedAt: '2026-08-31T00:00:00.000Z',
      }]])]]),
    })
    await expect(mount({ pool })).rejects.toThrow(/table key 'wrong-key' differs/)

    const mismatch = new MemoryMediaPool()
    mismatch.versions.set('research_library', 99)
    await expect(mount({ pool: mismatch })).rejects.toMatchObject({ code: 'version-mismatch' })
  })

  it('rejects every persisted aggregate and cross-paper relationship inconsistency', async () => {
    const base = storedRecord('a')
    const source = base.sourceVersions[0]!
    const observation = source.observations[0]!
    const extraObservation = { ...observation, parserVersion: 'parser-v2' }
    const cases: Array<{
      name: string
      record: ResearchPaperRecord
      config?: Config
      pattern: RegExp
    }> = [
      {
        name: 'non-normalized title',
        record: { ...base, metadata: { ...base.metadata, title: { ...base.metadata.title, value: ' Paper a ' } } },
        pattern: /title is not normalized/,
      },
      {
        name: 'empty title',
        record: { ...base, metadata: { ...base.metadata, title: { ...base.metadata.title, value: '' } } },
        pattern: /title must be non-empty/,
      },
      {
        name: 'too many authors',
        record: {
          ...base,
          metadata: { ...base.metadata, authors: { value: ['A', 'B'], origin: 'declared' } },
        },
        config: { maxAuthors: 1 },
        pattern: /authors exceed configured maximum/,
      },
      {
        name: 'duplicate authors',
        record: {
          ...base,
          metadata: { ...base.metadata, authors: { value: ['Ada', 'Ada'], origin: 'declared' } },
        },
        pattern: /authors.*contain duplicates/,
      },
      {
        name: 'non-normalized author',
        record: {
          ...base,
          metadata: { ...base.metadata, authors: { value: [' Ada '], origin: 'declared' } },
        },
        pattern: /author is not normalized/,
      },
      {
        name: 'non-normalized venue',
        record: {
          ...base,
          metadata: { ...base.metadata, venue: { value: ' Venue ', origin: 'declared' } },
        },
        pattern: /venue is not normalized/,
      },
      {
        name: 'too many external ids',
        record: {
          ...base,
          externalIds: [...base.externalIds, {
            kind: 'arxiv', value: '2608.1', origin: 'declared', addedAt: storedAt,
          }],
        },
        config: { maxExternalIdsPerPaper: 1 },
        pattern: /external ids exceed configured maximum/,
      },
      {
        name: 'duplicate external ids',
        record: { ...base, externalIds: [...base.externalIds, { ...base.externalIds[0]! }] },
        pattern: /external ids.*contain duplicates/,
      },
      {
        name: 'non-canonical external id',
        record: { ...base, externalIds: [{ ...base.externalIds[0]!, value: 'DOI:10.1/A' }] },
        pattern: /stores non-canonical doi/,
      },
      {
        name: 'too many source versions',
        record: {
          ...base,
          sourceVersions: [...base.sourceVersions, {
            ...source,
            id: ResearchSourceVersionId('source-b'),
            documentId: documentId('b'),
          }],
        },
        config: { maxSourceVersionsPerPaper: 1 },
        pattern: /source versions exceed configured maximum/,
      },
      {
        name: 'wrong acquisition state',
        record: { ...base, acquisitionState: 'metadata-only' },
        pattern: /acquisition state does not match/,
      },
      {
        name: 'paper time reversal',
        record: { ...base, createdAt: '2026-09-01T00:00:00.000Z' },
        pattern: /updatedAt precedes createdAt/,
      },
      {
        name: 'too many aliases',
        record: {
          ...base,
          sourceVersions: [{
            ...source,
            aliases: [...source.aliases, { value: 'extra', origin: 'declared', addedAt: storedAt }],
          }],
        },
        config: { maxAliasesPerSource: 1 },
        pattern: /aliases exceed configured maximum/,
      },
      {
        name: 'duplicate aliases',
        record: {
          ...base,
          sourceVersions: [{ ...source, aliases: [...source.aliases, { ...source.aliases[0]! }] }],
        },
        pattern: /aliases.*contain duplicates/,
      },
      {
        name: 'non-normalized alias',
        record: {
          ...base,
          sourceVersions: [{
            ...source,
            aliases: [{ ...source.aliases[0]!, value: ' version a ' }],
          }],
        },
        pattern: /source alias is not normalized/,
      },
      {
        name: 'missing observations',
        record: { ...base, sourceVersions: [{ ...source, observations: [] }] },
        pattern: /has no parser observation/,
      },
      {
        name: 'too many observations',
        record: { ...base, sourceVersions: [{ ...source, observations: [observation, extraObservation] }] },
        config: { maxObservationsPerSource: 1 },
        pattern: /observations exceed configured maximum/,
      },
      {
        name: 'duplicate parser revisions',
        record: { ...base, sourceVersions: [{ ...source, observations: [observation, { ...observation }] }] },
        pattern: /parser revisions.*contain duplicates/,
      },
      {
        name: 'non-normalized parser id',
        record: {
          ...base,
          sourceVersions: [{ ...source, observations: [{ ...observation, parserId: ' parser ' }] }],
        },
        pattern: /parser id is not normalized/,
      },
      {
        name: 'non-normalized parser version',
        record: {
          ...base,
          sourceVersions: [{ ...source, observations: [{ ...observation, parserVersion: ' v1 ' }] }],
        },
        pattern: /parser version is not normalized/,
      },
      {
        name: 'non-normalized media type',
        record: {
          ...base,
          sourceVersions: [{ ...source, observations: [{ ...observation, mediaType: 'application/  pdf' }] }],
        },
        pattern: /media type is not normalized/,
      },
      {
        name: 'uppercase media type',
        record: {
          ...base,
          sourceVersions: [{ ...source, observations: [{ ...observation, mediaType: 'APPLICATION/PDF' }] }],
        },
        pattern: /non-canonical media type/,
      },
      {
        name: 'non-normalized document title',
        record: {
          ...base,
          sourceVersions: [{ ...source, observations: [{ ...observation, documentTitle: ' Paper a ' }] }],
        },
        pattern: /document title is not normalized/,
      },
      {
        name: 'source time reversal',
        record: {
          ...base,
          sourceVersions: [{ ...source, createdAt: '2026-09-01T00:00:00.000Z' }],
        },
        pattern: /source.*updatedAt precedes createdAt/,
      },
    ]
    for (const scenario of cases) {
      let message: string | undefined
      try {
        await mount({
          pool: poolWith([[String(scenario.record.id), scenario.record]]),
          ...(scenario.config === undefined ? {} : { config: scenario.config }),
        })
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      if (message === undefined) throw new Error(`${scenario.name} unexpectedly mounted`)
      expect(message, scenario.name).toMatch(scenario.pattern)
    }

    const second = storedRecord('b')
    const crossPaperCases: Array<[string, ResearchPaperRecord, RegExp]> = [
      ['identifier', { ...second, externalIds: [{ ...base.externalIds[0]! }] }, /identifier.*belongs to papers/],
      ['document', {
        ...second,
        sourceVersions: [{ ...second.sourceVersions[0]!, documentId: base.sourceVersions[0]!.documentId }],
      }, /document.*belongs to papers/],
      ['source id', {
        ...second,
        sourceVersions: [{ ...second.sourceVersions[0]!, id: base.sourceVersions[0]!.id }],
      }, /source version.*belongs to papers/],
    ]
    for (const [name, conflicting, pattern] of crossPaperCases) {
      let message: string | undefined
      try {
        await mount({ pool: poolWith([
          [String(base.id), base], [String(conflicting.id), conflicting],
        ]) })
      } catch (error) {
        message = error instanceof Error ? error.message : String(error)
      }
      if (message === undefined) throw new Error(`${name} conflict unexpectedly mounted`)
      expect(message, name).toMatch(pattern)
    }
    await expect(mount({
      pool: poolWith([[String(base.id), base], [String(second.id), second]]),
      config: { maxPapers: 1 },
    })).rejects.toThrow(/paper count 2 exceeds configured maximum 1/)
  })

  it('rejects invalid direct configuration', async () => {
    await expect(mount({ config: { maxPapers: 0 } })).rejects.toThrow(/expected number >= 1/)
    await expect(mount({ config: { maxFieldBytes: Number.MAX_SAFE_INTEGER + 1 } }))
      .rejects.toThrow(/positive safe integer/)

    const ctx = new Context()
    const notStarted = new ResearchLibrary(ctx, {})
    expect(() => notStarted.list()).toThrow(/not started yet/)
  })
})
