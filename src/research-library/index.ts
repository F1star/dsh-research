/**
 * Profile-local durable research-paper library: explicit work identities,
 * exact imported source versions, and historical parser observations.
 * @module @deepseek-ai/dsh-research-library
 */

import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type { ResearchDocumentId } from '../research-document/index.ts'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { researchLibraryDomainSpec } from './spec.ts'
import type {
  RegisterResearchPaperRequest,
  RegisterResearchPaperResult,
  ResearchBibliographicInput,
  ResearchBibliographicMetadata,
  ResearchDocumentObservation,
  ResearchExternalId,
  ResearchImportedDocumentInput,
  ResearchLibraryCapacity,
  ResearchPaperId as ResearchPaperIdBrand,
  ResearchPaperRecord,
  ResearchSourceVersion,
  ResearchSourceVersionId as ResearchSourceVersionIdBrand,
  UpdateResearchAliasRequest,
  UpdateResearchAliasResult,
} from './types.ts'

export type {
  RegisterResearchPaperRequest,
  RegisterResearchPaperResult,
  ResearchBibliographicInput,
  ResearchBibliographicMetadata,
  ResearchDocumentObservation,
  ResearchExternalId,
  ResearchImportedDocumentInput,
  ResearchLibraryCapacity,
  ResearchMetadataField,
  ResearchMetadataOrigin,
  ResearchPaperRecord,
  ResearchSourceAlias,
  ResearchSourceVersion,
  UpdateResearchAliasRequest,
  UpdateResearchAliasResult,
} from './types.ts'
export { researchLibraryDomainSpec, researchPaperRecord } from './spec.ts'

/** Identifies one paper identity in the durable library. */
export type ResearchPaperId = ResearchPaperIdBrand

/**
 * Brand a validated or generated paper id.
 * @param value - Raw paper id string.
 * @returns the same string with its paper-id brand.
 */
export function ResearchPaperId(value: string): ResearchPaperId {
  return value as ResearchPaperId
}

/** Identifies one exact source version attached to a paper. */
export type ResearchSourceVersionId = ResearchSourceVersionIdBrand

/**
 * Brand a validated or generated source-version id.
 * @param value - Raw source-version id string.
 * @returns the same string with its source-version brand.
 */
export function ResearchSourceVersionId(value: string): ResearchSourceVersionId {
  return value as ResearchSourceVersionId
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    researchLibrary: ResearchLibrary
  }
}

/** Default maximum number of papers in one profile-local library. */
export const DEFAULT_MAX_PAPERS = 10_000
/** Default maximum exact source versions attached to one paper. */
export const DEFAULT_MAX_SOURCE_VERSIONS_PER_PAPER = 64
/** Default maximum parser observations retained for one exact source. */
export const DEFAULT_MAX_OBSERVATIONS_PER_SOURCE = 16
/** Default maximum DOI and arXiv aliases attached to one paper. */
export const DEFAULT_MAX_EXTERNAL_IDS_PER_PAPER = 32
/** Default maximum display aliases attached to one exact source. */
export const DEFAULT_MAX_ALIASES_PER_SOURCE = 32
/** Default maximum author names retained in one bibliographic record. */
export const DEFAULT_MAX_AUTHORS = 128
/** Default UTF-8 byte limit for each stored text field. */
export const DEFAULT_MAX_FIELD_BYTES = 16_384

/** Durable library capacity and text-field policy. */
export interface Config {
  /** Maximum papers retained in this storage domain. Defaults to 10000. */
  readonly maxPapers?: number
  /** Maximum exact source versions per paper. Defaults to 64. */
  readonly maxSourceVersionsPerPaper?: number
  /** Maximum parser observations per exact source. Defaults to 16. */
  readonly maxObservationsPerSource?: number
  /** Maximum DOI/arXiv aliases per paper. Defaults to 32. */
  readonly maxExternalIdsPerPaper?: number
  /** Maximum display aliases per exact source. Defaults to 32. */
  readonly maxAliasesPerSource?: number
  /** Maximum authors per paper. Defaults to 128. */
  readonly maxAuthors?: number
  /** Maximum UTF-8 bytes in each normalized text field. Defaults to 16384. */
  readonly maxFieldBytes?: number
}

interface ResolvedConfig {
  readonly maxPapers: number
  readonly maxSourceVersionsPerPaper: number
  readonly maxObservationsPerSource: number
  readonly maxExternalIdsPerPaper: number
  readonly maxAliasesPerSource: number
  readonly maxAuthors: number
  readonly maxFieldBytes: number
}

interface NormalizedRegistration {
  readonly paperId?: ResearchPaperId
  readonly metadata?: ResearchBibliographicInput
  readonly externalIds: readonly Omit<ResearchExternalId, 'addedAt'>[]
  readonly document?: ResearchImportedDocumentInput
}

/**
 * Durable paper-library service. One aggregate row owns a paper's metadata,
 * exact source versions, and observations so every accepted mutation commits
 * atomically through the storage-domain table.
 */
export class ResearchLibrary extends Service {
  static inject = ['storageDomain']

  /** Loader schema for the profile-local library policy. */
  static Config: z<Config> = z.object({
    maxPapers: z.number().step(1).min(1).default(DEFAULT_MAX_PAPERS),
    maxSourceVersionsPerPaper: z.number().step(1).min(1).default(DEFAULT_MAX_SOURCE_VERSIONS_PER_PAPER),
    maxObservationsPerSource: z.number().step(1).min(1).default(DEFAULT_MAX_OBSERVATIONS_PER_SOURCE),
    maxExternalIdsPerPaper: z.number().step(1).min(1).default(DEFAULT_MAX_EXTERNAL_IDS_PER_PAPER),
    maxAliasesPerSource: z.number().step(1).min(1).default(DEFAULT_MAX_ALIASES_PER_SOURCE),
    maxAuthors: z.number().step(1).min(1).default(DEFAULT_MAX_AUTHORS),
    maxFieldBytes: z.number().step(1).min(1).default(DEFAULT_MAX_FIELD_BYTES),
  })

  private table?: KvTable<ResearchPaperId, ResearchPaperRecord>
  private readonly config: ResolvedConfig
  private operationTail: Promise<void> = Promise.resolve()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'researchLibrary')
    this.config = {
      maxPapers: positiveSafeInteger('maxPapers', config.maxPapers ?? DEFAULT_MAX_PAPERS),
      maxSourceVersionsPerPaper: positiveSafeInteger(
        'maxSourceVersionsPerPaper',
        config.maxSourceVersionsPerPaper ?? DEFAULT_MAX_SOURCE_VERSIONS_PER_PAPER,
      ),
      maxObservationsPerSource: positiveSafeInteger(
        'maxObservationsPerSource',
        config.maxObservationsPerSource ?? DEFAULT_MAX_OBSERVATIONS_PER_SOURCE,
      ),
      maxExternalIdsPerPaper: positiveSafeInteger(
        'maxExternalIdsPerPaper',
        config.maxExternalIdsPerPaper ?? DEFAULT_MAX_EXTERNAL_IDS_PER_PAPER,
      ),
      maxAliasesPerSource: positiveSafeInteger(
        'maxAliasesPerSource',
        config.maxAliasesPerSource ?? DEFAULT_MAX_ALIASES_PER_SOURCE,
      ),
      maxAuthors: positiveSafeInteger('maxAuthors', config.maxAuthors ?? DEFAULT_MAX_AUTHORS),
      maxFieldBytes: positiveSafeInteger('maxFieldBytes', config.maxFieldBytes ?? DEFAULT_MAX_FIELD_BYTES),
    }
  }

  /** Open the domain and reject any relational or configured-capacity inconsistency. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(researchLibraryDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'researchLibrary.domainClose')
    this.table = domain.table('papers')
    this.validateStoredState()
  }

  /**
   * Register a metadata-only paper or attach one exact imported document.
   * Exact DOI, arXiv, and document identities may select one existing paper;
   * contradictory identities return a non-writing conflict. Normalized title
   * equality is reported only as a possible duplicate.
   * @param request - Trusted bibliographic values and optional runtime-derived document observation.
   * @returns the committed aggregate or an explicit non-writing business result.
   */
  register(request: RegisterResearchPaperRequest): Promise<RegisterResearchPaperResult> {
    return this.enqueueOperation(() => this.registerNow(this.normalizeRegistration(request)))
  }

  /**
   * Add or remove an external identity alias or exact-source display alias.
   * DOI/arXiv additions remain globally unique; removals are reversible
   * single-record writes and an absent alias is an idempotent no-op.
   * @param request - Alias target, action, value, and declared provenance.
   * @returns the committed paper or an explicit non-writing business result.
   */
  updateAlias(request: UpdateResearchAliasRequest): Promise<UpdateResearchAliasResult> {
    return this.enqueueOperation(() => {
      const normalized = request.kind === 'source'
        ? { ...request, value: this.normalizeText('source alias', request.value) }
        : { ...request, value: this.normalizeIdentifier(request.kind, request.value) }
      return this.updateAliasNow(normalized)
    })
  }

  /**
   * Read one paper synchronously from the authoritative domain table.
   * @param paperId - Stable paper id.
   * @returns the durable aggregate, or `undefined` when absent.
   */
  get(paperId: ResearchPaperId): ResearchPaperRecord | undefined {
    return this.requireTable().get(paperId)
  }

  /**
   * Return every paper in stable creation/id order. The configured paper cap
   * bounds the complete snapshot; consumers apply their own smaller result limits.
   * @returns a fresh array of durable paper aggregates.
   */
  list(): readonly ResearchPaperRecord[] {
    return [...this.requireTable().entries()]
      .sort(([leftId, left], [rightId, right]) =>
        left.createdAt.localeCompare(right.createdAt) || String(leftId).localeCompare(String(rightId)))
      .map(([, record]) => record)
  }

  /**
   * Resolve exact document ownership without title or author inference.
   * @param documentId - Exact content-derived document id.
   * @returns the owning paper, or `undefined` when unregistered.
   */
  findByDocumentId(documentId: ResearchDocumentId): ResearchPaperRecord | undefined {
    return this.findDocumentHolder(documentId)
  }

  private async registerNow(request: NormalizedRegistration): Promise<RegisterResearchPaperResult> {
    const table = this.requireTable()
    const externalHolders = new Map<ResearchPaperId, string[]>()
    for (const identifier of request.externalIds) {
      const holder = this.findIdentifierHolder(identifier.kind, identifier.value)
      if (holder !== undefined) {
        const values = externalHolders.get(holder.id) ?? []
        values.push(`${identifier.kind}:${identifier.value}`)
        externalHolders.set(holder.id, values)
      }
    }
    const document = request.document
    const documentHolder = document === undefined
      ? undefined
      : this.findDocumentHolder(document.documentId)

    let target: ResearchPaperRecord | undefined
    if (request.paperId !== undefined) {
      const selectedTarget = table.get(request.paperId)
      if (selectedTarget === undefined) return { status: 'paper-not-found', paperId: request.paperId }
      target = selectedTarget
      if (document !== undefined && documentHolder !== undefined && documentHolder.id !== selectedTarget.id) {
        return {
          status: 'document-conflict',
          documentId: document.documentId,
          paperId: documentHolder.id,
        }
      }
      const otherIdentifiers = [...externalHolders.entries()].filter(([id]) => id !== selectedTarget.id)
      if (otherIdentifiers.length > 0) {
        return {
          status: 'identifier-conflict',
          paperIds: sortedIds(otherIdentifiers.map(([id]) => id)),
          identifiers: sortedStrings(otherIdentifiers.flatMap(([, identifiers]) => identifiers)),
        }
      }
    } else {
      const exactHolders = new Set<ResearchPaperId>(externalHolders.keys())
      if (documentHolder !== undefined) exactHolders.add(documentHolder.id)
      if (exactHolders.size > 1) {
        const identifiers = [...externalHolders.values()].flat()
        if (request.document !== undefined) identifiers.push(`document:${request.document.documentId}`)
        return {
          status: 'identifier-conflict',
          paperIds: sortedIds([...exactHolders]),
          identifiers: sortedStrings(identifiers),
        }
      }
      const [selected] = exactHolders
      if (selected !== undefined) target = table.get(selected)
    }

    if (target === undefined) return await this.createPaper(request)
    return await this.enrichPaper(target, request)
  }

  private async createPaper(request: NormalizedRegistration): Promise<RegisterResearchPaperResult> {
    const table = this.requireTable()
    if (table.size >= this.config.maxPapers) return capacity('papers')
    if (request.externalIds.length > this.config.maxExternalIdsPerPaper) return capacity('external-ids')

    const titleInput = request.metadata?.title ?? request.document?.documentTitle
    if (titleInput === undefined) {
      throw new Error('registering a new research paper requires metadata.title or a parsed document title')
    }
    const now = instant()
    const id = ResearchPaperId(randomUUID())
    const metadata: ResearchBibliographicMetadata = {
      title: {
        value: this.normalizeText('title', titleInput),
        origin: request.metadata?.title === undefined ? 'parser' : request.metadata.origin,
      },
      ...this.optionalMetadata(request.metadata),
    }
    const source = request.document === undefined ? undefined : this.createSource(request.document, now)
    const record: ResearchPaperRecord = {
      id,
      metadata,
      externalIds: request.externalIds.map(identifier => ({ ...identifier, addedAt: now })),
      acquisitionState: source === undefined ? 'metadata-only' : 'imported',
      sourceVersions: source === undefined ? [] : [source],
      createdAt: now,
      updatedAt: now,
    }
    await table.put(id, record)
    return {
      status: 'created',
      paper: record,
      ...(source === undefined ? {} : { sourceVersionId: source.id }),
      possibleDuplicateIds: this.possibleDuplicateIds(record),
    }
  }

  private async enrichPaper(
    current: ResearchPaperRecord,
    request: NormalizedRegistration,
  ): Promise<RegisterResearchPaperResult> {
    const conflicts = metadataConflicts(current.metadata, request.metadata)
    if (conflicts.length > 0) {
      return { status: 'metadata-conflict', paperId: current.id, fields: conflicts }
    }

    const now = instant()
    let changed = false
    const metadata = fillMetadata(current.metadata, request.metadata, () => { changed = true })
    const externalIds = [...current.externalIds]
    for (const identifier of request.externalIds) {
      if (externalIds.some(value => sameIdentifier(value, identifier))) continue
      if (externalIds.length >= this.config.maxExternalIdsPerPaper) return capacity('external-ids')
      externalIds.push({ ...identifier, addedAt: now })
      changed = true
    }

    const sourceVersions = [...current.sourceVersions]
    let sourceVersionId: ResearchSourceVersionId | undefined
    const document = request.document
    if (document !== undefined) {
      const sourceIndex = sourceVersions.findIndex(source => source.documentId === document.documentId)
      if (sourceIndex === -1) {
        if (sourceVersions.length >= this.config.maxSourceVersionsPerPaper) return capacity('source-versions')
        const source = this.createSource(document, now)
        sourceVersions.push(source)
        sourceVersionId = source.id
        changed = true
      } else {
        const source = sourceVersions[sourceIndex] as ResearchSourceVersion
        sourceVersionId = source.id
        const observationIndex = source.observations.findIndex(observation =>
          observation.parserId === document.parserId
          && observation.parserVersion === document.parserVersion)
        let observations = source.observations
        if (observationIndex === -1) {
          if (observations.length >= this.config.maxObservationsPerSource) return capacity('observations')
          observations = [...observations, observationFrom(document, now)]
          changed = true
        } else if (!sameObservation(observations[observationIndex] as ResearchDocumentObservation, document)) {
          return {
            status: 'metadata-conflict',
            paperId: current.id,
            fields: [`observation:${document.parserId}@${document.parserVersion}`],
          }
        }

        let aliases = source.aliases
        if (document.sourceAlias !== undefined
          && !aliases.some(alias => alias.value === document.sourceAlias)) {
          if (aliases.length >= this.config.maxAliasesPerSource) return capacity('source-aliases')
          aliases = [...aliases, {
            value: document.sourceAlias,
            origin: request.metadata?.origin ?? 'declared',
            addedAt: now,
          }]
          changed = true
        }
        if (observations !== source.observations || aliases !== source.aliases) {
          sourceVersions[sourceIndex] = { ...source, observations, aliases, updatedAt: now }
        }
      }
    }

    if (!changed) {
      return {
        status: 'unchanged',
        paper: current,
        ...(sourceVersionId === undefined ? {} : { sourceVersionId }),
        possibleDuplicateIds: this.possibleDuplicateIds(current),
      }
    }
    const next: ResearchPaperRecord = {
      ...current,
      metadata,
      externalIds,
      acquisitionState: sourceVersions.length === 0 ? 'metadata-only' : 'imported',
      sourceVersions,
      updatedAt: now,
    }
    await this.requireTable().put(current.id, next)
    return {
      status: 'updated',
      paper: next,
      ...(sourceVersionId === undefined ? {} : { sourceVersionId }),
      possibleDuplicateIds: this.possibleDuplicateIds(next),
    }
  }

  private async updateAliasNow(request: UpdateResearchAliasRequest): Promise<UpdateResearchAliasResult> {
    const current = this.requireTable().get(request.paperId)
    if (current === undefined) return { status: 'paper-not-found', paperId: request.paperId }
    const now = instant()

    if (request.kind !== 'source') {
      const index = current.externalIds.findIndex(identifier => sameIdentifier(identifier, request))
      if (request.action === 'remove') {
        if (index === -1) return { status: 'unchanged', paper: current }
        const externalIds = current.externalIds.filter((_, at) => at !== index)
        return await this.commitAlias(current, { ...current, externalIds, updatedAt: now })
      }
      if (index !== -1) return { status: 'unchanged', paper: current }
      const holder = this.findIdentifierHolder(request.kind, request.value)
      if (holder !== undefined && holder.id !== current.id) {
        return {
          status: 'identifier-conflict',
          paperIds: [holder.id],
          identifiers: [`${request.kind}:${request.value}`],
        }
      }
      if (current.externalIds.length >= this.config.maxExternalIdsPerPaper) return capacity('external-ids')
      const externalIds = [...current.externalIds, {
        kind: request.kind,
        value: request.value,
        origin: request.origin,
        addedAt: now,
      }]
      return await this.commitAlias(current, { ...current, externalIds, updatedAt: now })
    }

    const sourceIndex = current.sourceVersions.findIndex(source => source.id === request.sourceVersionId)
    if (sourceIndex === -1) {
      return { status: 'source-not-found', paperId: current.id, sourceVersionId: request.sourceVersionId }
    }
    const source = current.sourceVersions[sourceIndex] as ResearchSourceVersion
    const aliasIndex = source.aliases.findIndex(alias => alias.value === request.value)
    if (request.action === 'remove') {
      if (aliasIndex === -1) return { status: 'unchanged', paper: current }
      const aliases = source.aliases.filter((_, at) => at !== aliasIndex)
      return await this.commitSourceAlias(current, sourceIndex, { ...source, aliases, updatedAt: now }, now)
    }
    if (aliasIndex !== -1) return { status: 'unchanged', paper: current }
    if (source.aliases.length >= this.config.maxAliasesPerSource) return capacity('source-aliases')
    const aliases = [...source.aliases, { value: request.value, origin: request.origin, addedAt: now }]
    return await this.commitSourceAlias(current, sourceIndex, { ...source, aliases, updatedAt: now }, now)
  }

  private async commitAlias(
    current: ResearchPaperRecord,
    next: ResearchPaperRecord,
  ): Promise<UpdateResearchAliasResult> {
    await this.requireTable().put(current.id, next)
    return { status: 'updated', paper: next }
  }

  private async commitSourceAlias(
    current: ResearchPaperRecord,
    sourceIndex: number,
    source: ResearchSourceVersion,
    now: string,
  ): Promise<UpdateResearchAliasResult> {
    const sourceVersions = [...current.sourceVersions]
    sourceVersions[sourceIndex] = source
    return await this.commitAlias(current, { ...current, sourceVersions, updatedAt: now })
  }

  private createSource(document: ResearchImportedDocumentInput, now: string): ResearchSourceVersion {
    return {
      id: ResearchSourceVersionId(randomUUID()),
      documentId: document.documentId,
      state: 'imported',
      aliases: document.sourceAlias === undefined ? [] : [{
        value: document.sourceAlias,
        origin: 'declared',
        addedAt: now,
      }],
      observations: [observationFrom(document, now)],
      createdAt: now,
      updatedAt: now,
    }
  }

  private normalizeRegistration(request: RegisterResearchPaperRequest): NormalizedRegistration {
    if (request.metadata === undefined && request.externalIds === undefined && request.document === undefined) {
      throw new Error('research-library registration requires metadata, an external id, or a document')
    }
    const metadata = request.metadata === undefined ? undefined : this.normalizeMetadata(request.metadata)
    const externalIds = deduplicateIdentifiers((request.externalIds ?? []).map(identifier => ({
      kind: identifier.kind,
      value: this.normalizeIdentifier(identifier.kind, identifier.value),
      origin: identifier.origin,
    })))
    const document = request.document === undefined ? undefined : this.normalizeDocument(request.document)
    return {
      ...(request.paperId === undefined ? {} : { paperId: request.paperId }),
      ...(metadata === undefined ? {} : { metadata }),
      externalIds,
      ...(document === undefined ? {} : { document }),
    }
  }

  private normalizeMetadata(metadata: ResearchBibliographicInput): ResearchBibliographicInput {
    const authors = metadata.authors?.map(author => this.normalizeText('author', author))
    if (authors !== undefined && authors.length > this.config.maxAuthors) {
      throw new Error(`research-library authors exceed configured maximum ${this.config.maxAuthors}`)
    }
    return {
      origin: metadata.origin,
      ...(metadata.title === undefined ? {} : { title: this.normalizeText('title', metadata.title) }),
      ...(authors === undefined ? {} : { authors: deduplicateStrings(authors) }),
      ...(metadata.year === undefined ? {} : { year: safeInteger('year', metadata.year) }),
      ...(metadata.venue === undefined ? {} : { venue: this.normalizeText('venue', metadata.venue) }),
    }
  }

  private normalizeDocument(document: ResearchImportedDocumentInput): ResearchImportedDocumentInput {
    return {
      documentId: document.documentId,
      mediaType: this.normalizeText('media type', document.mediaType).toLowerCase(),
      parserId: this.normalizeText('parser id', document.parserId),
      parserVersion: this.normalizeText('parser version', document.parserVersion),
      extraction: document.extraction,
      ...(document.documentTitle === undefined
        ? {}
        : { documentTitle: this.normalizeText('document title', document.documentTitle) }),
      pageCount: nonNegativeSafeInteger('pageCount', document.pageCount),
      blockCount: nonNegativeSafeInteger('blockCount', document.blockCount),
      ...(document.sourceAlias === undefined
        ? {}
        : { sourceAlias: this.normalizeText('source alias', document.sourceAlias) }),
    }
  }

  private optionalMetadata(metadata: ResearchBibliographicInput | undefined): Omit<ResearchBibliographicMetadata, 'title'> {
    if (metadata === undefined) return {}
    return {
      ...(metadata.authors === undefined ? {} : { authors: { value: metadata.authors, origin: metadata.origin } }),
      ...(metadata.year === undefined ? {} : { year: { value: metadata.year, origin: metadata.origin } }),
      ...(metadata.venue === undefined ? {} : { venue: { value: metadata.venue, origin: metadata.origin } }),
    }
  }

  private possibleDuplicateIds(record: ResearchPaperRecord): readonly ResearchPaperId[] {
    const title = comparableTitle(record.metadata.title.value)
    return sortedIds([...this.requireTable().entries()]
      .filter(([id, candidate]) => id !== record.id && comparableTitle(candidate.metadata.title.value) === title)
      .map(([id]) => id))
  }

  private findIdentifierHolder(kind: 'doi' | 'arxiv', value: string): ResearchPaperRecord | undefined {
    return [...this.requireTable().entries()]
      .find(([, record]) => record.externalIds.some(identifier => identifier.kind === kind && identifier.value === value))?.[1]
  }

  private findDocumentHolder(documentId: ResearchDocumentId): ResearchPaperRecord | undefined {
    return [...this.requireTable().entries()]
      .find(([, record]) => record.sourceVersions.some(source => source.documentId === documentId))?.[1]
  }

  private normalizeIdentifier(kind: 'doi' | 'arxiv', raw: string): string {
    let value = raw.normalize('NFKC').trim()
    if (kind === 'doi') {
      value = value.replace(/^doi\s*:\s*/iu, '').replace(/^https?:\/\/(?:dx\.)?doi\.org\//iu, '')
    } else {
      value = value.replace(/^arxiv\s*:\s*/iu, '').replace(/^https?:\/\/arxiv\.org\/abs\//iu, '')
    }
    value = asciiLower(value)
    if (value.length === 0 || /\s/u.test(value)) {
      throw new Error(`research-library ${kind} identifier must be non-empty and contain no whitespace`)
    }
    this.assertFieldBytes(`${kind} identifier`, value)
    return value
  }

  private normalizeText(field: string, raw: string): string {
    const value = raw.normalize('NFKC').trim().replace(/\s+/gu, ' ')
    if (value.length === 0) throw new Error(`research-library ${field} must be non-empty`)
    this.assertFieldBytes(field, value)
    return value
  }

  private assertFieldBytes(field: string, value: string): void {
    if (Buffer.byteLength(value, 'utf8') > this.config.maxFieldBytes) {
      throw new Error(
        `research-library ${field} exceeds configured UTF-8 limit ${this.config.maxFieldBytes}`,
      )
    }
  }

  private validateStoredState(): void {
    const table = this.requireTable()
    if (table.size > this.config.maxPapers) {
      throw inconsistent(`paper count ${table.size} exceeds configured maximum ${this.config.maxPapers}`)
    }
    const identifiers = new Map<string, ResearchPaperId>()
    const documents = new Map<ResearchDocumentId, ResearchPaperId>()
    const sourceIds = new Map<ResearchSourceVersionId, ResearchPaperId>()
    for (const [key, record] of table.entries()) {
      if (key !== record.id) throw inconsistent(`table key '${key}' differs from record id '${record.id}'`)
      this.validateRecord(record)
      for (const identifier of record.externalIds) {
        const compound = `${identifier.kind}:${identifier.value}`
        const holder = identifiers.get(compound)
        if (holder !== undefined) {
          throw inconsistent(`identifier '${compound}' belongs to papers '${holder}' and '${record.id}'`)
        }
        identifiers.set(compound, record.id)
      }
      for (const source of record.sourceVersions) {
        const documentHolder = documents.get(source.documentId)
        if (documentHolder !== undefined) {
          throw inconsistent(`document '${source.documentId}' belongs to papers '${documentHolder}' and '${record.id}'`)
        }
        documents.set(source.documentId, record.id)
        const sourceHolder = sourceIds.get(source.id)
        if (sourceHolder !== undefined) {
          throw inconsistent(`source version '${source.id}' belongs to papers '${sourceHolder}' and '${record.id}'`)
        }
        sourceIds.set(source.id, record.id)
      }
    }
  }

  private validateRecord(record: ResearchPaperRecord): void {
    this.assertCanonicalText('title', record.metadata.title.value)
    if (record.metadata.authors !== undefined) {
      if (record.metadata.authors.value.length > this.config.maxAuthors) {
        throw inconsistent(`paper '${record.id}' authors exceed configured maximum ${this.config.maxAuthors}`)
      }
      this.assertUniqueStrings(`paper '${record.id}' authors`, record.metadata.authors.value)
      for (const author of record.metadata.authors.value) this.assertCanonicalText('author', author)
    }
    if (record.metadata.venue !== undefined) this.assertCanonicalText('venue', record.metadata.venue.value)
    if (record.externalIds.length > this.config.maxExternalIdsPerPaper) {
      throw inconsistent(`paper '${record.id}' external ids exceed configured maximum`)
    }
    this.assertUniqueStrings(
      `paper '${record.id}' external ids`,
      record.externalIds.map(identifier => `${identifier.kind}:${identifier.value}`),
    )
    for (const identifier of record.externalIds) {
      const normalized = this.normalizeIdentifier(identifier.kind, identifier.value)
      if (normalized !== identifier.value) throw inconsistent(`paper '${record.id}' stores non-canonical ${identifier.kind}`)
    }
    if (record.sourceVersions.length > this.config.maxSourceVersionsPerPaper) {
      throw inconsistent(`paper '${record.id}' source versions exceed configured maximum`)
    }
    const expectedState = record.sourceVersions.length === 0 ? 'metadata-only' : 'imported'
    if (record.acquisitionState !== expectedState) {
      throw inconsistent(`paper '${record.id}' acquisition state does not match its source versions`)
    }
    if (record.updatedAt < record.createdAt) throw inconsistent(`paper '${record.id}' updatedAt precedes createdAt`)
    for (const source of record.sourceVersions) this.validateSource(record.id, source)
  }

  private validateSource(paperId: ResearchPaperId, source: ResearchSourceVersion): void {
    if (source.aliases.length > this.config.maxAliasesPerSource) {
      throw inconsistent(`source '${source.id}' aliases exceed configured maximum`)
    }
    this.assertUniqueStrings(`source '${source.id}' aliases`, source.aliases.map(alias => alias.value))
    for (const alias of source.aliases) this.assertCanonicalText('source alias', alias.value)
    if (source.observations.length === 0) {
      throw inconsistent(`source '${source.id}' on paper '${paperId}' has no parser observation`)
    }
    if (source.observations.length > this.config.maxObservationsPerSource) {
      throw inconsistent(`source '${source.id}' observations exceed configured maximum`)
    }
    this.assertUniqueStrings(
      `source '${source.id}' parser revisions`,
      source.observations.map(observation => `${observation.parserId}\u0000${observation.parserVersion}`),
    )
    for (const observation of source.observations) {
      this.assertCanonicalText('parser id', observation.parserId)
      this.assertCanonicalText('parser version', observation.parserVersion)
      this.assertCanonicalText('media type', observation.mediaType)
      if (observation.mediaType !== observation.mediaType.toLowerCase()) {
        throw inconsistent(`source '${source.id}' stores a non-canonical media type`)
      }
      if (observation.documentTitle !== undefined) this.assertCanonicalText('document title', observation.documentTitle)
    }
    if (source.updatedAt < source.createdAt) throw inconsistent(`source '${source.id}' updatedAt precedes createdAt`)
  }

  private assertCanonicalText(field: string, value: string): void {
    let normalized: string
    try {
      normalized = this.normalizeText(field, value)
    } catch (error) {
      throw inconsistent((error as Error).message)
    }
    if (normalized !== value) throw inconsistent(`${field} is not normalized`)
  }

  private assertUniqueStrings(subject: string, values: readonly string[]): void {
    if (new Set(values).size !== values.length) throw inconsistent(`${subject} contain duplicates`)
  }

  private requireTable(): KvTable<ResearchPaperId, ResearchPaperRecord> {
    if (this.table === undefined) throw new Error('research library is not started yet')
    return this.table
  }

  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation)
    this.operationTail = result.then(() => {}, () => {})
    return result
  }
}

function observationFrom(document: ResearchImportedDocumentInput, now: string): ResearchDocumentObservation {
  return {
    parserId: document.parserId,
    parserVersion: document.parserVersion,
    mediaType: document.mediaType,
    extraction: document.extraction,
    ...(document.documentTitle === undefined ? {} : { documentTitle: document.documentTitle }),
    pageCount: document.pageCount,
    blockCount: document.blockCount,
    observedAt: now,
  }
}

function sameObservation(
  observation: ResearchDocumentObservation,
  document: ResearchImportedDocumentInput,
): boolean {
  return observation.parserId === document.parserId
    && observation.parserVersion === document.parserVersion
    && observation.mediaType === document.mediaType
    && observation.extraction.text === document.extraction.text
    && observation.extraction.layout === document.extraction.layout
    && observation.documentTitle === document.documentTitle
    && observation.pageCount === document.pageCount
    && observation.blockCount === document.blockCount
}

function metadataConflicts(
  current: ResearchBibliographicMetadata,
  supplied: ResearchBibliographicInput | undefined,
): readonly string[] {
  if (supplied === undefined) return []
  const conflicts: string[] = []
  if (supplied.title !== undefined && supplied.title !== current.title.value) conflicts.push('title')
  if (supplied.authors !== undefined && current.authors !== undefined
    && !sameStrings(supplied.authors, current.authors.value)) conflicts.push('authors')
  if (supplied.year !== undefined && current.year !== undefined && supplied.year !== current.year.value) {
    conflicts.push('year')
  }
  if (supplied.venue !== undefined && current.venue !== undefined && supplied.venue !== current.venue.value) {
    conflicts.push('venue')
  }
  return conflicts
}

function fillMetadata(
  current: ResearchBibliographicMetadata,
  supplied: ResearchBibliographicInput | undefined,
  changed: () => void,
): ResearchBibliographicMetadata {
  if (supplied === undefined) return current
  const authors = current.authors ?? (supplied.authors === undefined
    ? undefined
    : changeValue({ value: supplied.authors, origin: supplied.origin }, changed))
  const year = current.year ?? (supplied.year === undefined
    ? undefined
    : changeValue({ value: supplied.year, origin: supplied.origin }, changed))
  const venue = current.venue ?? (supplied.venue === undefined
    ? undefined
    : changeValue({ value: supplied.venue, origin: supplied.origin }, changed))
  return {
    title: current.title,
    ...(authors === undefined ? {} : { authors }),
    ...(year === undefined ? {} : { year }),
    ...(venue === undefined ? {} : { venue }),
  }
}

function changeValue<T>(value: T, changed: () => void): T {
  changed()
  return value
}

function sameIdentifier(
  left: Pick<ResearchExternalId, 'kind' | 'value'>,
  right: Pick<ResearchExternalId, 'kind' | 'value'>,
): boolean {
  return left.kind === right.kind && left.value === right.value
}

function deduplicateIdentifiers(
  values: readonly Omit<ResearchExternalId, 'addedAt'>[],
): readonly Omit<ResearchExternalId, 'addedAt'>[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = `${value.kind}:${value.value}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function deduplicateStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)]
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function comparableTitle(value: string): string {
  return value.toLowerCase()
}

function asciiLower(value: string): string {
  return value.replace(/[A-Z]/gu, character => character.toLowerCase())
}

function sortedIds(values: readonly ResearchPaperId[]): readonly ResearchPaperId[] {
  return [...new Set(values)].sort((left, right) => String(left).localeCompare(String(right)))
}

function sortedStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function capacity(resource: ResearchLibraryCapacity): RegisterResearchPaperResult & UpdateResearchAliasResult {
  return { status: 'capacity', resource } as RegisterResearchPaperResult & UpdateResearchAliasResult
}

function instant(): string {
  return new Date().toISOString()
}

function positiveSafeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive safe integer`)
  return value
}

function nonNegativeSafeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name} must be a non-negative safe integer`)
  return value
}

function safeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be a safe integer`)
  return value
}

function inconsistent(message: string): Error {
  return new Error(`research-library domain is inconsistent: ${message}`)
}

export default ResearchLibrary
