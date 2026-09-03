/**
 * Durable questions, evidence, reading notes, claims, normalized entities, observations,
 * comparison protocols, and cited synthesis.
 * @module @f1star/dsh-research/research-information
 */

import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import Decimal from 'decimal.js'
import type {
  ResearchPaperId,
  ResearchPaperRecord,
  ResearchSourceVersion,
} from '../research-library/index.ts'
import type { KvTable } from '@deepseek-ai/dsh-storage-domain'
import { researchInformationDomainSpec } from './spec.ts'
import type {
  CaptureResearchEvidenceRequest,
  CaptureResearchEvidenceResult,
  ResearchAuthorId as ResearchAuthorIdBrand,
  ResearchAuthorship,
  ResearchClaim,
  ResearchClaimId as ResearchClaimIdBrand,
  ResearchComparisonDimension,
  ResearchComparisonProtocol,
  ResearchComparisonProtocolId as ResearchComparisonProtocolIdBrand,
  ResearchDecimal as ResearchDecimalBrand,
  ResearchEvidence,
  ResearchEvidenceId as ResearchEvidenceIdBrand,
  ResearchEvidenceSelection,
  ResearchEvidenceTextHash as ResearchEvidenceTextHashBrand,
  ResearchEntity,
  ResearchEntityId as ResearchEntityIdBrand,
  ResearchFindingId as ResearchFindingIdBrand,
  ResearchFindingInput,
  ResearchInformationCapacity,
  ResearchObservation,
  ResearchObservationClaimRole,
  ResearchObservationConditions,
  ResearchObservationEntityReference,
  ResearchObservationEntityRole,
  ResearchObservationId as ResearchObservationIdBrand,
  ResearchObservationReferenceFailure,
  ResearchObservationReportedContext,
  ResearchObservationUncertainty,
  ResearchObservationUnit,
  ResearchReadingNote,
  ResearchReadingNoteId as ResearchReadingNoteIdBrand,
  ResearchQuestionId as ResearchQuestionIdBrand,
  ResearchQuestionRecord,
  ResearchSynthesis,
  ResearchSynthesisId as ResearchSynthesisIdBrand,
  WriteResearchClaimRequest,
  WriteResearchClaimResult,
  WriteResearchComparisonProtocolRequest,
  WriteResearchComparisonProtocolResult,
  WriteResearchEntityRequest,
  WriteResearchEntityResult,
  WriteResearchObservationRequest,
  WriteResearchObservationResult,
  WriteResearchQuestionRequest,
  WriteResearchQuestionResult,
  WriteResearchReadingNoteRequest,
  WriteResearchReadingNoteResult,
  WriteResearchSynthesisRequest,
  WriteResearchSynthesisResult,
} from './types.ts'

export type {
  CaptureResearchEvidenceRequest,
  CaptureResearchEvidenceResult,
  ResearchAuthorship,
  ResearchClaim,
  ResearchClaimEvidenceLink,
  ResearchClaimReferenceFailure,
  ResearchEvidence,
  ResearchEvidenceProvenanceMismatch,
  ResearchEvidenceRelation,
  ResearchEvidenceSelection,
  ResearchEntity,
  ResearchEntityKind,
  ResearchEntityReferenceFailure,
  ResearchFacet,
  ResearchFinding,
  ResearchFindingInput,
  ResearchFindingKind,
  ResearchFindingStance,
  ResearchInformationCapacity,
  ResearchComparisonDimension,
  ResearchComparisonDirection,
  ResearchComparisonProtocol,
  ResearchComparisonProtocolReferenceFailure,
  ResearchMethodRole,
  ResearchObservation,
  ResearchObservationClaimRole,
  ResearchObservationCondition,
  ResearchObservationConditionRole,
  ResearchObservationConditions,
  ResearchObservationDataset,
  ResearchObservationEntityReference,
  ResearchObservationEntityRole,
  ResearchObservationMethod,
  ResearchObservationReferenceFailure,
  ResearchObservationReportedContext,
  ResearchObservationUncertainty,
  ResearchObservationUnit,
  ResearchReportedUncertainty,
  ResearchReadingNote,
  ResearchReadingNoteReferenceFailure,
  ResearchQuestionMutationFailure,
  ResearchQuestionRecord,
  ResearchSynthesis,
  ResearchSynthesisReferenceFailure,
  WriteResearchClaimRequest,
  WriteResearchClaimResult,
  WriteResearchComparisonProtocolRequest,
  WriteResearchComparisonProtocolResult,
  WriteResearchEntityRequest,
  WriteResearchEntityResult,
  WriteResearchObservationRequest,
  WriteResearchObservationResult,
  WriteResearchQuestionRequest,
  WriteResearchQuestionResult,
  WriteResearchReadingNoteRequest,
  WriteResearchReadingNoteResult,
  WriteResearchSynthesisRequest,
  WriteResearchSynthesisResult,
} from './types.ts'
export { researchInformationDomainSpec, researchQuestionRecord } from './spec.ts'

/** Stable identity of one durable research-question aggregate. */
export type ResearchQuestionId = ResearchQuestionIdBrand
/**
 * Brand a validated or generated research-question id.
 * @param value - Raw research-question id string.
 * @returns the same string with its research-question-id brand.
 */
export function ResearchQuestionId(value: string): ResearchQuestionId {
  return value as ResearchQuestionId
}

/** Stable identity of one immutable evidence record. */
export type ResearchEvidenceId = ResearchEvidenceIdBrand
/**
 * Brand a validated or generated evidence id.
 * @param value - Raw evidence id string.
 * @returns the same string with its evidence-id brand.
 */
export function ResearchEvidenceId(value: string): ResearchEvidenceId {
  return value as ResearchEvidenceId
}

/** Stable identity of one immutable claim. */
export type ResearchClaimId = ResearchClaimIdBrand
/**
 * Brand a validated or generated claim id.
 * @param value - Raw claim id string.
 * @returns the same string with its claim-id brand.
 */
export function ResearchClaimId(value: string): ResearchClaimId {
  return value as ResearchClaimId
}

/** Stable identity of one immutable synthesis. */
export type ResearchSynthesisId = ResearchSynthesisIdBrand
/**
 * Brand a validated or generated synthesis id.
 * @param value - Raw synthesis id string.
 * @returns the same string with its synthesis-id brand.
 */
export function ResearchSynthesisId(value: string): ResearchSynthesisId {
  return value as ResearchSynthesisId
}

/** Stable identity of one synthesis finding. */
export type ResearchFindingId = ResearchFindingIdBrand
/**
 * Brand a validated or generated finding id.
 * @param value - Raw finding id string.
 * @returns the same string with its finding-id brand.
 */
export function ResearchFindingId(value: string): ResearchFindingId {
  return value as ResearchFindingId
}

/** Stable identity of one immutable reading note. */
export type ResearchReadingNoteId = ResearchReadingNoteIdBrand
/**
 * Brand a validated or generated reading-note id.
 * @param value - Raw reading-note id string.
 * @returns the same string with its reading-note-id brand.
 */
export function ResearchReadingNoteId(value: string): ResearchReadingNoteId {
  return value as ResearchReadingNoteId
}

/** Stable identity of one immutable normalized research entity. */
export type ResearchEntityId = ResearchEntityIdBrand
/**
 * Brand a validated or generated research-entity id.
 * @param value - Raw research-entity id string.
 * @returns the same string with its research-entity-id brand.
 */
export function ResearchEntityId(value: string): ResearchEntityId {
  return value as ResearchEntityId
}

/** Stable identity of one immutable normalized metric observation. */
export type ResearchObservationId = ResearchObservationIdBrand
/**
 * Brand a validated or generated observation id.
 * @param value - Raw observation id string.
 * @returns the same string with its observation-id brand.
 */
export function ResearchObservationId(value: string): ResearchObservationId {
  return value as ResearchObservationId
}

/** Stable identity of one immutable authored comparison protocol. */
export type ResearchComparisonProtocolId = ResearchComparisonProtocolIdBrand
/**
 * Brand a validated or generated comparison-protocol id.
 * @param value - Raw comparison-protocol id string.
 * @returns the same string with its comparison-protocol-id brand.
 */
export function ResearchComparisonProtocolId(value: string): ResearchComparisonProtocolId {
  return value as ResearchComparisonProtocolId
}

/** Opaque identity of an author supplied by a trusted Consumer. */
export type ResearchAuthorId = ResearchAuthorIdBrand
/**
 * Brand a validated author id.
 * @param value - Raw trusted author id string.
 * @returns the same string with its research-author-id brand.
 */
export function ResearchAuthorId(value: string): ResearchAuthorId {
  return value as ResearchAuthorId
}

/** SHA-256 identity of exact selected evidence text. */
export type ResearchEvidenceTextHash = ResearchEvidenceTextHashBrand
/**
 * Brand a validated selected-text hash.
 * @param value - Raw selected-text hash string.
 * @returns the same string with its selected-text-hash brand.
 */
export function ResearchEvidenceTextHash(value: string): ResearchEvidenceTextHash {
  return value as ResearchEvidenceTextHash
}

/** Canonical finite base-ten value retained without binary floating-point loss. */
export type ResearchDecimal = ResearchDecimalBrand
/**
 * Brand a value already canonicalized by the research-information service.
 * @param value - Canonical finite base-ten value.
 * @returns the same string with its research-decimal brand.
 */
export function ResearchDecimal(value: string): ResearchDecimal {
  return value as ResearchDecimal
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    researchInformation: ResearchInformation
  }
}

/** Default maximum durable research questions in one profile. */
export const DEFAULT_MAX_QUESTIONS = 1_000
/** Default maximum captured evidence records per question. */
export const DEFAULT_MAX_EVIDENCE_PER_QUESTION = 10_000
/** Default maximum claims per question. */
export const DEFAULT_MAX_CLAIMS_PER_QUESTION = 10_000
/** Default maximum synthesis records per question. */
export const DEFAULT_MAX_SYNTHESES_PER_QUESTION = 1_000
/** Default maximum findings in one synthesis. */
export const DEFAULT_MAX_FINDINGS_PER_SYNTHESIS = 256
/** Default maximum evidence links on one claim. */
export const DEFAULT_MAX_EVIDENCE_LINKS_PER_CLAIM = 64
/** Default maximum claim references on one finding. */
export const DEFAULT_MAX_CLAIM_REFERENCES_PER_FINDING = 64
/** Default maximum reading notes per question. */
export const DEFAULT_MAX_READING_NOTES_PER_QUESTION = 10_000
/** Default maximum normalized entities per question. */
export const DEFAULT_MAX_ENTITIES_PER_QUESTION = 10_000
/** Default maximum source-claim references on one normalized entity. */
export const DEFAULT_MAX_CLAIM_REFERENCES_PER_ENTITY = 256
/** Default maximum predecessor entities retired by one normalized entity. */
export const DEFAULT_MAX_SUPERSEDED_ENTITIES_PER_ENTITY = 64
/** Default maximum normalized observations per question. */
export const DEFAULT_MAX_OBSERVATIONS_PER_QUESTION = 10_000
/** Default maximum reported conditions on one observation. */
export const DEFAULT_MAX_CONDITIONS_PER_OBSERVATION = 64
/** Default maximum authored comparison protocols per question. */
export const DEFAULT_MAX_COMPARISON_PROTOCOLS_PER_QUESTION = 1_000
/** Default maximum observation references on one comparison protocol. */
export const DEFAULT_MAX_OBSERVATION_REFERENCES_PER_PROTOCOL = 256
/** Default UTF-8 limit for one size-limited text or decimal field. */
export const DEFAULT_MAX_FIELD_BYTES = 16_384
/** Default UTF-8 limit for one complete captured block. */
export const DEFAULT_MAX_BLOCK_BYTES = 65_536
/** Default encoded JSON limit for one complete question aggregate. */
export const DEFAULT_MAX_AGGREGATE_BYTES = 33_554_432

/** Durable structured-research capacity and text policy. */
export interface Config {
  /** Maximum durable questions in one profile. Defaults to 1000. */
  readonly maxQuestions?: number
  /** Maximum captured evidence items per question. Defaults to 10000. */
  readonly maxEvidencePerQuestion?: number
  /** Maximum immutable claims per question. Defaults to 10000. */
  readonly maxClaimsPerQuestion?: number
  /** Maximum immutable syntheses per question. Defaults to 1000. */
  readonly maxSynthesesPerQuestion?: number
  /** Maximum findings in one synthesis. Defaults to 256. */
  readonly maxFindingsPerSynthesis?: number
  /** Maximum evidence relations on one claim. Defaults to 64. */
  readonly maxEvidenceLinksPerClaim?: number
  /** Maximum claim references on one finding. Defaults to 64. */
  readonly maxClaimReferencesPerFinding?: number
  /** Maximum immutable reading notes per question. Defaults to 10000. */
  readonly maxReadingNotesPerQuestion?: number
  /** Maximum immutable normalized entities per question. Defaults to 10000. */
  readonly maxEntitiesPerQuestion?: number
  /** Maximum source-claim references on one entity. Defaults to 256. */
  readonly maxClaimReferencesPerEntity?: number
  /** Maximum predecessor entities retired by one entity. Defaults to 64. */
  readonly maxSupersededEntitiesPerEntity?: number
  /** Maximum immutable normalized observations per question. Defaults to 10000. */
  readonly maxObservationsPerQuestion?: number
  /** Maximum reported conditions on one observation. Defaults to 64. */
  readonly maxConditionsPerObservation?: number
  /** Maximum immutable comparison protocols per question. Defaults to 1000. */
  readonly maxComparisonProtocolsPerQuestion?: number
  /** Maximum observation references on one comparison protocol. Defaults to 256. */
  readonly maxObservationReferencesPerProtocol?: number
  /** Maximum UTF-8 bytes in each size-limited text or decimal field. Defaults to 16384. */
  readonly maxFieldBytes?: number
  /** Maximum UTF-8 bytes in one exact captured block. Defaults to 65536. */
  readonly maxBlockBytes?: number
  /** Maximum UTF-8 bytes in one encoded question aggregate. Defaults to 33554432. */
  readonly maxAggregateBytes?: number
}

interface ResolvedConfig {
  readonly maxQuestions: number
  readonly maxEvidencePerQuestion: number
  readonly maxClaimsPerQuestion: number
  readonly maxSynthesesPerQuestion: number
  readonly maxFindingsPerSynthesis: number
  readonly maxEvidenceLinksPerClaim: number
  readonly maxClaimReferencesPerFinding: number
  readonly maxReadingNotesPerQuestion: number
  readonly maxEntitiesPerQuestion: number
  readonly maxClaimReferencesPerEntity: number
  readonly maxSupersededEntitiesPerEntity: number
  readonly maxObservationsPerQuestion: number
  readonly maxConditionsPerObservation: number
  readonly maxComparisonProtocolsPerQuestion: number
  readonly maxObservationReferencesPerProtocol: number
  readonly maxFieldBytes: number
  readonly maxBlockBytes: number
  readonly maxAggregateBytes: number
}

type NormalizedQuestionWrite = WriteResearchQuestionRequest
type NormalizedEntityWrite = Omit<WriteResearchEntityRequest, 'supersedes'> & {
  readonly supersedes: readonly ResearchEntityId[]
}
type NormalizedComparisonProtocolWrite = Omit<WriteResearchComparisonProtocolRequest, 'observationIds'> & {
  readonly observationIds: readonly ResearchObservationId[]
}
type CapacityFailure = {
  readonly status: 'capacity'
  readonly resource: ResearchInformationCapacity
}
type EvidenceValidation =
  | { readonly status: 'ok'; readonly paper: ResearchPaperRecord; readonly source: ResearchSourceVersion }
  | Exclude<CaptureResearchEvidenceResult, { status: 'created' | 'unchanged' }>
type ObservationClaimValidation =
  | { readonly status: 'ok'; readonly claim: ResearchClaim; readonly paperId: ResearchPaperId }
  | Extract<ResearchObservationReferenceFailure, { status:
    | 'observation-claim-not-found'
    | 'observation-claim-inactive'
    | 'observation-claim-kind-mismatch'
    | 'observation-claim-uncited'
    | 'observation-claim-paper-mismatch'
  }>
type ComparisonAlignmentFailure = Extract<WriteResearchComparisonProtocolResult, {
  status: 'comparison-field-not-recorded' | 'comparison-dimension-mismatch'
}>

/**
 * Profile-local durable research-information service. Every question owns its
 * evidence, reading notes, claims, normalized entities, observations, comparison protocols,
 * and synthesis references in one atomically written row.
 */
export class ResearchInformation extends Service {
  static inject = ['storageDomain', 'researchLibrary']

  /** Loader schema for durable research-information limits. */
  static Config: z<Config> = z.object({
    maxQuestions: z.number().step(1).min(1).default(DEFAULT_MAX_QUESTIONS),
    maxEvidencePerQuestion: z.number().step(1).min(1).default(DEFAULT_MAX_EVIDENCE_PER_QUESTION),
    maxClaimsPerQuestion: z.number().step(1).min(1).default(DEFAULT_MAX_CLAIMS_PER_QUESTION),
    maxSynthesesPerQuestion: z.number().step(1).min(1).default(DEFAULT_MAX_SYNTHESES_PER_QUESTION),
    maxFindingsPerSynthesis: z.number().step(1).min(1).default(DEFAULT_MAX_FINDINGS_PER_SYNTHESIS),
    maxEvidenceLinksPerClaim: z.number().step(1).min(1).default(DEFAULT_MAX_EVIDENCE_LINKS_PER_CLAIM),
    maxClaimReferencesPerFinding: z.number().step(1).min(1)
      .default(DEFAULT_MAX_CLAIM_REFERENCES_PER_FINDING),
    maxReadingNotesPerQuestion: z.number().step(1).min(1)
      .default(DEFAULT_MAX_READING_NOTES_PER_QUESTION),
    maxEntitiesPerQuestion: z.number().step(1).min(1)
      .default(DEFAULT_MAX_ENTITIES_PER_QUESTION),
    maxClaimReferencesPerEntity: z.number().step(1).min(1)
      .default(DEFAULT_MAX_CLAIM_REFERENCES_PER_ENTITY),
    maxSupersededEntitiesPerEntity: z.number().step(1).min(1)
      .default(DEFAULT_MAX_SUPERSEDED_ENTITIES_PER_ENTITY),
    maxObservationsPerQuestion: z.number().step(1).min(1)
      .default(DEFAULT_MAX_OBSERVATIONS_PER_QUESTION),
    maxConditionsPerObservation: z.number().step(1).min(1)
      .default(DEFAULT_MAX_CONDITIONS_PER_OBSERVATION),
    maxComparisonProtocolsPerQuestion: z.number().step(1).min(1)
      .default(DEFAULT_MAX_COMPARISON_PROTOCOLS_PER_QUESTION),
    maxObservationReferencesPerProtocol: z.number().step(1).min(2)
      .default(DEFAULT_MAX_OBSERVATION_REFERENCES_PER_PROTOCOL),
    maxFieldBytes: z.number().step(1).min(1).default(DEFAULT_MAX_FIELD_BYTES),
    maxBlockBytes: z.number().step(1).min(1).default(DEFAULT_MAX_BLOCK_BYTES),
    maxAggregateBytes: z.number().step(1).min(1).default(DEFAULT_MAX_AGGREGATE_BYTES),
  })

  private table?: KvTable<ResearchQuestionId, ResearchQuestionRecord>
  private readonly config: ResolvedConfig
  private operationTail: Promise<void> = Promise.resolve()

  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'researchInformation')
    this.config = {
      maxQuestions: positiveSafeInteger('maxQuestions', config.maxQuestions ?? DEFAULT_MAX_QUESTIONS),
      maxEvidencePerQuestion: positiveSafeInteger(
        'maxEvidencePerQuestion',
        config.maxEvidencePerQuestion ?? DEFAULT_MAX_EVIDENCE_PER_QUESTION,
      ),
      maxClaimsPerQuestion: positiveSafeInteger(
        'maxClaimsPerQuestion',
        config.maxClaimsPerQuestion ?? DEFAULT_MAX_CLAIMS_PER_QUESTION,
      ),
      maxSynthesesPerQuestion: positiveSafeInteger(
        'maxSynthesesPerQuestion',
        config.maxSynthesesPerQuestion ?? DEFAULT_MAX_SYNTHESES_PER_QUESTION,
      ),
      maxFindingsPerSynthesis: positiveSafeInteger(
        'maxFindingsPerSynthesis',
        config.maxFindingsPerSynthesis ?? DEFAULT_MAX_FINDINGS_PER_SYNTHESIS,
      ),
      maxEvidenceLinksPerClaim: positiveSafeInteger(
        'maxEvidenceLinksPerClaim',
        config.maxEvidenceLinksPerClaim ?? DEFAULT_MAX_EVIDENCE_LINKS_PER_CLAIM,
      ),
      maxClaimReferencesPerFinding: positiveSafeInteger(
        'maxClaimReferencesPerFinding',
        config.maxClaimReferencesPerFinding ?? DEFAULT_MAX_CLAIM_REFERENCES_PER_FINDING,
      ),
      maxReadingNotesPerQuestion: positiveSafeInteger(
        'maxReadingNotesPerQuestion',
        config.maxReadingNotesPerQuestion ?? DEFAULT_MAX_READING_NOTES_PER_QUESTION,
      ),
      maxEntitiesPerQuestion: positiveSafeInteger(
        'maxEntitiesPerQuestion',
        config.maxEntitiesPerQuestion ?? DEFAULT_MAX_ENTITIES_PER_QUESTION,
      ),
      maxClaimReferencesPerEntity: positiveSafeInteger(
        'maxClaimReferencesPerEntity',
        config.maxClaimReferencesPerEntity ?? DEFAULT_MAX_CLAIM_REFERENCES_PER_ENTITY,
      ),
      maxSupersededEntitiesPerEntity: positiveSafeInteger(
        'maxSupersededEntitiesPerEntity',
        config.maxSupersededEntitiesPerEntity ?? DEFAULT_MAX_SUPERSEDED_ENTITIES_PER_ENTITY,
      ),
      maxObservationsPerQuestion: positiveSafeInteger(
        'maxObservationsPerQuestion',
        config.maxObservationsPerQuestion ?? DEFAULT_MAX_OBSERVATIONS_PER_QUESTION,
      ),
      maxConditionsPerObservation: positiveSafeInteger(
        'maxConditionsPerObservation',
        config.maxConditionsPerObservation ?? DEFAULT_MAX_CONDITIONS_PER_OBSERVATION,
      ),
      maxComparisonProtocolsPerQuestion: positiveSafeInteger(
        'maxComparisonProtocolsPerQuestion',
        config.maxComparisonProtocolsPerQuestion ?? DEFAULT_MAX_COMPARISON_PROTOCOLS_PER_QUESTION,
      ),
      maxObservationReferencesPerProtocol: minimumSafeInteger(
        'maxObservationReferencesPerProtocol',
        config.maxObservationReferencesPerProtocol ?? DEFAULT_MAX_OBSERVATION_REFERENCES_PER_PROTOCOL,
        2,
      ),
      maxFieldBytes: positiveSafeInteger('maxFieldBytes', config.maxFieldBytes ?? DEFAULT_MAX_FIELD_BYTES),
      maxBlockBytes: positiveSafeInteger('maxBlockBytes', config.maxBlockBytes ?? DEFAULT_MAX_BLOCK_BYTES),
      maxAggregateBytes: positiveSafeInteger(
        'maxAggregateBytes',
        config.maxAggregateBytes ?? DEFAULT_MAX_AGGREGATE_BYTES,
      ),
    }
  }

  /** Open the storage domain and reject malformed cross-record relations. */
  protected async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(researchInformationDomainSpec)
    this.ctx.effect(() => () => domain.close(), 'researchInformation.domainClose')
    this.table = domain.table('questions')
    this.validateStoredState()
  }

  /**
   * Create a research question or compare-and-set its framing. Question text
   * becomes immutable after the aggregate receives research content.
   * @param request - Creation fields or an exact revision update.
   * @returns the committed aggregate or an explicit non-writing result.
   * @throws Synchronously when text is empty or update fields or revision are invalid.
   */
  writeQuestion(request: WriteResearchQuestionRequest): Promise<WriteResearchQuestionResult> {
    const normalized = this.normalizeQuestionWrite(request)
    return this.enqueueOperation(() => this.writeQuestionNow(normalized))
  }

  /**
   * Capture immutable exact evidence after checking its durable paper, source,
   * parser-observation, and text-hash relations.
   * @param request - Runtime-derived block evidence and aggregate revision.
   * @returns the committed aggregate, an idempotent match, or a non-writing failure.
   * @throws Synchronously when exact text is empty or the revision or offsets are invalid.
   */
  captureEvidence(request: CaptureResearchEvidenceRequest): Promise<CaptureResearchEvidenceResult> {
    const normalized = this.normalizeEvidenceRequest(request)
    return this.enqueueOperation(() => this.captureEvidenceNow(normalized))
  }

  /**
   * Append an immutable note or passage question anchored to captured evidence.
   * @param request - Note text, evidence reference, authorship, and aggregate revision.
   * @returns the committed aggregate or an explicit non-writing failure.
   * @throws Synchronously when text is empty or the revision is invalid.
   */
  writeReadingNote(request: WriteResearchReadingNoteRequest): Promise<WriteResearchReadingNoteResult> {
    const normalized = this.normalizeReadingNoteRequest(request)
    return this.enqueueOperation(() => this.writeReadingNoteNow(normalized))
  }

  /**
   * Append an immutable source statement or inference to one question.
   * @param request - Claim text, evidence relations, authorship, and revision.
   * @returns the committed aggregate or an explicit non-writing failure.
   * @throws Synchronously when text is empty, facet fields conflict, or the revision is invalid.
   */
  writeClaim(request: WriteResearchClaimRequest): Promise<WriteResearchClaimResult> {
    const normalized = this.normalizeClaimRequest(request)
    return this.enqueueOperation(() => this.writeClaimNow(normalized))
  }

  /**
   * Append an immutable authored normalization and optionally merge active same-kind entity lineages.
   * @param request - Entity name, kind, source-claim references, authorship, and revision.
   * @returns the committed aggregate or an explicit non-writing failure.
   * @throws Synchronously when the name or references are empty or the revision is invalid.
   */
  writeEntity(request: WriteResearchEntityRequest): Promise<WriteResearchEntityResult> {
    const normalized = this.normalizeEntityRequest(request)
    return this.enqueueOperation(() => this.writeEntityNow(normalized))
  }

  /**
   * Append one immutable paper-local normalized metric observation.
   * @param request - Source and entity references, normalized value fields, authorship, and revision.
   * @returns the committed aggregate or an explicit non-writing failure.
   * @throws Synchronously when a normalized field combination or decimal value is invalid.
   */
  writeObservation(request: WriteResearchObservationRequest): Promise<WriteResearchObservationResult> {
    const normalized = this.normalizeObservationRequest(request)
    return this.enqueueOperation(() => this.writeObservationNow(normalized))
  }

  /**
   * Append an authored compatibility decision over cross-paper observations.
   * @param request - Observation members, comparison direction, rationale, authorship, and revision.
   * @returns the committed aggregate or an explicit non-writing failure.
   * @throws Synchronously when fewer than two distinct observations or empty rationale are supplied.
   */
  writeComparisonProtocol(
    request: WriteResearchComparisonProtocolRequest,
  ): Promise<WriteResearchComparisonProtocolResult> {
    const normalized = this.normalizeComparisonProtocolRequest(request)
    return this.enqueueOperation(() => this.writeComparisonProtocolNow(normalized))
  }

  /**
   * Append an immutable synthesis whose findings cite active claims.
   * @param request - Structured findings, authorship, and aggregate revision.
   * @returns the committed aggregate or an explicit non-writing failure.
   * @throws Synchronously when findings or their text are empty or the revision is invalid.
   */
  writeSynthesis(request: WriteResearchSynthesisRequest): Promise<WriteResearchSynthesisResult> {
    const normalized = this.normalizeSynthesisRequest(request)
    return this.enqueueOperation(() => this.writeSynthesisNow(normalized))
  }

  /**
   * Read one research question from the authoritative domain table.
   * @param questionId - Stable research-question id.
   * @returns the durable aggregate, or `undefined` when absent.
   */
  get(questionId: ResearchQuestionId): ResearchQuestionRecord | undefined {
    return this.requireTable().get(questionId)
  }

  /**
   * Return every question in stable creation/id order.
   * @returns all durable research-question aggregates.
   */
  list(): readonly ResearchQuestionRecord[] {
    return [...this.requireTable().entries()]
      .sort(([leftId, left], [rightId, right]) =>
        left.createdAt.localeCompare(right.createdAt) || String(leftId).localeCompare(String(rightId)))
      .map(([, record]) => record)
  }

  private async writeQuestionNow(request: NormalizedQuestionWrite): Promise<WriteResearchQuestionResult> {
    const table = this.requireTable()
    if (request.action === 'create') {
      const inputCapacity = this.fieldCapacity([request.title, request.question, String(request.author.id)])
      if (inputCapacity !== undefined) return inputCapacity
      if (table.size >= this.config.maxQuestions) return { status: 'capacity', resource: 'questions' }
      const now = new Date().toISOString()
      const question: ResearchQuestionRecord = {
        id: ResearchQuestionId(randomUUID()),
        revision: 0,
        title: request.title,
        question: request.question,
        createdBy: request.author,
        updatedBy: request.author,
        evidence: [],
        claims: [],
        syntheses: [],
        readingNotes: [],
        entities: [],
        observations: [],
        comparisonProtocols: [],
        createdAt: now,
        updatedAt: now,
      }
      if (this.aggregateBytes(question) > this.config.maxAggregateBytes) {
        return { status: 'capacity', resource: 'aggregate-bytes' }
      }
      await table.put(question.id, question)
      return { status: 'created', question }
    }
    const current = table.get(request.questionId)
    if (current === undefined) return { status: 'question-not-found', questionId: request.questionId }
    const stale = staleRevision(current, request.expectedRevision)
    if (stale !== undefined) return stale
    const title = request.title ?? current.title
    const questionText = request.question ?? current.question
    if (questionText !== current.question && hasResearchContent(current)) {
      return { status: 'question-text-locked', questionId: current.id }
    }
    const inputCapacity = this.fieldCapacity([
      title,
      questionText,
      String(request.author.id),
    ])
    if (inputCapacity !== undefined) return inputCapacity
    if (title === current.title && questionText === current.question) {
      return { status: 'unchanged', question: current }
    }
    const next: ResearchQuestionRecord = {
      ...current,
      revision: current.revision + 1,
      title,
      question: questionText,
      updatedBy: request.author,
      updatedAt: mutationTimestamp(current),
    }
    const capacity = this.aggregateCapacity(next)
    if (capacity !== undefined) return capacity
    await table.put(next.id, next)
    return { status: 'updated', question: next }
  }

  private async captureEvidenceNow(
    request: CaptureResearchEvidenceRequest,
  ): Promise<CaptureResearchEvidenceResult> {
    const table = this.requireTable()
    if (Buffer.byteLength(request.blockText, 'utf8') > this.config.maxBlockBytes) {
      return { status: 'capacity', resource: 'block-bytes' }
    }
    const inputCapacity = this.fieldCapacity([
      ...request.sectionPath,
      ...(request.selection === undefined ? [] : [request.selection.text]),
      String(request.author.id),
    ])
    if (inputCapacity !== undefined) return inputCapacity
    const current = table.get(request.questionId)
    if (current === undefined) return { status: 'question-not-found', questionId: request.questionId }
    const stale = staleRevision(current, request.expectedRevision)
    if (stale !== undefined) return stale
    const provenance = this.validateEvidenceProvenance(request)
    if (provenance.status !== 'ok') return provenance
    const duplicate = current.evidence.find(value => sameEvidence(value, request))
    if (duplicate !== undefined) {
      return { status: 'unchanged', question: current, evidenceId: duplicate.id }
    }
    if (current.evidence.length >= this.config.maxEvidencePerQuestion) {
      return { status: 'capacity', resource: 'evidence' }
    }
    const now = mutationTimestamp(current)
    const evidence: ResearchEvidence = {
      id: ResearchEvidenceId(randomUUID()),
      paperId: provenance.paper.id,
      sourceVersionId: provenance.source.id,
      locator: request.locator,
      blockText: request.blockText,
      sectionPath: request.sectionPath,
      ...(request.selection === undefined ? {} : { selection: request.selection }),
      createdBy: request.author,
      createdAt: now,
    }
    const next: ResearchQuestionRecord = {
      ...current,
      revision: current.revision + 1,
      evidence: [...current.evidence, evidence],
      updatedBy: request.author,
      updatedAt: now,
    }
    const capacity = this.aggregateCapacity(next)
    if (capacity !== undefined) return capacity
    await table.put(next.id, next)
    return { status: 'created', question: next, evidenceId: evidence.id }
  }

  private async writeReadingNoteNow(
    request: WriteResearchReadingNoteRequest,
  ): Promise<WriteResearchReadingNoteResult> {
    const inputCapacity = this.fieldCapacity([request.text, String(request.author.id)])
    if (inputCapacity !== undefined) return inputCapacity
    const table = this.requireTable()
    const current = table.get(request.questionId)
    if (current === undefined) return { status: 'question-not-found', questionId: request.questionId }
    const stale = staleRevision(current, request.expectedRevision)
    if (stale !== undefined) return stale
    if (current.readingNotes.length >= this.config.maxReadingNotesPerQuestion) {
      return { status: 'capacity', resource: 'reading-notes' }
    }
    const evidence = current.evidence.find(value => value.id === request.evidenceId)
    if (evidence === undefined) return { status: 'evidence-not-found', evidenceId: request.evidenceId }
    if (request.kind === 'passage-question' && evidence.selection === undefined) {
      return { status: 'passage-question-selection-required', evidenceId: evidence.id }
    }
    if (request.supersedes !== undefined) {
      const previous = current.readingNotes.find(value => value.id === request.supersedes)
      if (previous === undefined) {
        return {
          status: 'supersedes-reading-note-not-found',
          readingNoteId: request.supersedes,
        }
      }
      if (!isActiveReadingNote(current, previous.id)) {
        return { status: 'supersedes-reading-note-inactive', readingNoteId: previous.id }
      }
      if (previous.kind !== request.kind) {
        return { status: 'supersedes-reading-note-kind-mismatch', readingNoteId: previous.id }
      }
    }
    const now = mutationTimestamp(current)
    const readingNote: ResearchReadingNote = {
      id: ResearchReadingNoteId(randomUUID()),
      kind: request.kind,
      text: request.text,
      evidenceId: evidence.id,
      ...(request.supersedes === undefined ? {} : { supersedes: request.supersedes }),
      createdBy: request.author,
      createdAt: now,
    }
    const next: ResearchQuestionRecord = {
      ...current,
      revision: current.revision + 1,
      readingNotes: [...current.readingNotes, readingNote],
      updatedBy: request.author,
      updatedAt: now,
    }
    const capacity = this.aggregateCapacity(next)
    if (capacity !== undefined) return capacity
    await table.put(next.id, next)
    return { status: 'created', question: next, readingNoteId: readingNote.id }
  }

  private async writeClaimNow(request: WriteResearchClaimRequest): Promise<WriteResearchClaimResult> {
    const table = this.requireTable()
    if (request.evidenceLinks.length > this.config.maxEvidenceLinksPerClaim) {
      return { status: 'capacity', resource: 'evidence-links' }
    }
    const inputCapacity = this.fieldCapacity([
      request.text,
      ...(request.otherFacet === undefined ? [] : [request.otherFacet]),
      String(request.author.id),
    ])
    if (inputCapacity !== undefined) return inputCapacity
    const current = table.get(request.questionId)
    if (current === undefined) return { status: 'question-not-found', questionId: request.questionId }
    const stale = staleRevision(current, request.expectedRevision)
    if (stale !== undefined) return stale
    if (current.claims.length >= this.config.maxClaimsPerQuestion) {
      return { status: 'capacity', resource: 'claims' }
    }
    if (request.kind === 'source-statement' && request.evidenceLinks.length === 0) {
      return { status: 'source-claim-uncited' }
    }
    const evidenceById = new Map(current.evidence.map(value => [value.id, value]))
    const paperIds = new Set<ResearchPaperId>()
    for (const link of request.evidenceLinks) {
      const evidence = evidenceById.get(link.evidenceId)
      if (evidence === undefined) return { status: 'evidence-not-found', evidenceId: link.evidenceId }
      paperIds.add(evidence.paperId)
    }
    if (request.kind === 'source-statement' && paperIds.size > 1) {
      return { status: 'source-evidence-paper-mismatch', paperIds: sortedStrings(paperIds) }
    }
    if (request.supersedes !== undefined) {
      const previous = current.claims.find(value => value.id === request.supersedes)
      if (previous === undefined) return { status: 'supersedes-claim-not-found', claimId: request.supersedes }
      if (!isActiveClaim(current, previous.id)) {
        return { status: 'supersedes-claim-inactive', claimId: previous.id }
      }
      if (previous.kind !== request.kind) {
        return { status: 'supersedes-claim-kind-mismatch', claimId: previous.id }
      }
    }
    const now = mutationTimestamp(current)
    const claim: ResearchClaim = {
      id: ResearchClaimId(randomUUID()),
      kind: request.kind,
      facet: request.facet,
      ...(request.otherFacet === undefined ? {} : { otherFacet: request.otherFacet }),
      text: request.text,
      evidenceLinks: request.evidenceLinks,
      ...(request.supersedes === undefined ? {} : { supersedes: request.supersedes }),
      createdBy: request.author,
      createdAt: now,
    }
    const next: ResearchQuestionRecord = {
      ...current,
      revision: current.revision + 1,
      claims: [...current.claims, claim],
      updatedBy: request.author,
      updatedAt: now,
    }
    const capacity = this.aggregateCapacity(next)
    if (capacity !== undefined) return capacity
    await table.put(next.id, next)
    return { status: 'created', question: next, claimId: claim.id }
  }

  private async writeEntityNow(request: NormalizedEntityWrite): Promise<WriteResearchEntityResult> {
    if (request.sourceClaimIds.length > this.config.maxClaimReferencesPerEntity) {
      return { status: 'capacity', resource: 'entity-claim-references' }
    }
    if (request.supersedes.length > this.config.maxSupersededEntitiesPerEntity) {
      return { status: 'capacity', resource: 'entity-supersession-references' }
    }
    const inputCapacity = this.fieldCapacity([request.canonicalName, String(request.author.id)])
    if (inputCapacity !== undefined) return inputCapacity
    const table = this.requireTable()
    const current = table.get(request.questionId)
    if (current === undefined) return { status: 'question-not-found', questionId: request.questionId }
    const stale = staleRevision(current, request.expectedRevision)
    if (stale !== undefined) return stale
    if (current.entities.length >= this.config.maxEntitiesPerQuestion) {
      return { status: 'capacity', resource: 'entities' }
    }
    const claimsById = new Map(current.claims.map(value => [value.id, value]))
    for (const claimId of request.sourceClaimIds) {
      const claim = claimsById.get(claimId)
      if (claim === undefined) return { status: 'claim-not-found', claimId }
      if (!isActiveClaim(current, claimId)) return { status: 'claim-inactive', claimId }
      if (claim.kind !== 'source-statement') {
        return { status: 'entity-claim-kind-mismatch', claimId }
      }
      if (claim.evidenceLinks.length === 0) return { status: 'entity-claim-uncited', claimId }
      if (claim.facet !== request.kind) {
        return {
          status: 'entity-claim-facet-mismatch',
          claimId,
          entityKind: request.kind,
          claimFacet: claim.facet,
        }
      }
    }
    for (const predecessorId of request.supersedes) {
      const previous = current.entities.find(value => value.id === predecessorId)
      if (previous === undefined) {
        return { status: 'supersedes-entity-not-found', entityId: predecessorId }
      }
      if (!isActiveEntity(current, previous.id)) {
        return { status: 'supersedes-entity-inactive', entityId: previous.id }
      }
      if (previous.kind !== request.kind) {
        return { status: 'supersedes-entity-kind-mismatch', entityId: previous.id }
      }
    }
    const now = mutationTimestamp(current)
    const entity: ResearchEntity = {
      id: ResearchEntityId(randomUUID()),
      kind: request.kind,
      canonicalName: request.canonicalName,
      sourceClaimIds: request.sourceClaimIds,
      supersedes: request.supersedes,
      createdBy: request.author,
      createdAt: now,
    }
    const next: ResearchQuestionRecord = {
      ...current,
      revision: current.revision + 1,
      entities: [...current.entities, entity],
      updatedBy: request.author,
      updatedAt: now,
    }
    const capacity = this.aggregateCapacity(next)
    if (capacity !== undefined) return capacity
    await table.put(next.id, next)
    return { status: 'created', question: next, entityId: entity.id }
  }

  private async writeObservationNow(
    request: WriteResearchObservationRequest,
  ): Promise<WriteResearchObservationResult> {
    const conditionValues = request.conditions.status === 'reported' ? request.conditions.values : []
    if (conditionValues.length > this.config.maxConditionsPerObservation) {
      return { status: 'capacity', resource: 'observation-conditions' }
    }
    const inputCapacity = this.fieldCapacity([
      String(request.value),
      request.valueStatistic,
      String(request.author.id),
      ...(request.method.otherRole === undefined ? [] : [request.method.otherRole]),
      ...(request.unit.status === 'reported' ? [request.unit.symbol] : []),
      ...(request.dataset.split.status === 'reported' ? [request.dataset.split.value] : []),
      ...(request.evaluationProtocol.status === 'reported' ? [request.evaluationProtocol.value] : []),
      ...conditionValues.flatMap(value => [value.name, value.value]),
      ...uncertaintyDecimals(request.uncertainty),
    ])
    if (inputCapacity !== undefined) return inputCapacity
    const table = this.requireTable()
    const current = table.get(request.questionId)
    if (current === undefined) return { status: 'question-not-found', questionId: request.questionId }
    const stale = staleRevision(current, request.expectedRevision)
    if (stale !== undefined) return stale
    if (current.observations.length >= this.config.maxObservationsPerQuestion) {
      return { status: 'capacity', resource: 'observations' }
    }
    const resultClaim = this.validateObservationClaim(current, 'result', request.resultClaimId)
    if (resultClaim.status !== 'ok') return resultClaim
    if (resultClaim.claim.facet !== 'result') {
      return {
        status: 'observation-claim-facet-mismatch',
        claimRole: 'result',
        claimId: resultClaim.claim.id,
        claimFacet: resultClaim.claim.facet,
      }
    }
    const entityReferences: readonly [
      ResearchObservationEntityRole,
      ResearchObservationEntityReference,
    ][] = [
      ['method', request.method],
      ['dataset', request.dataset],
      ['metric', request.metric],
    ]
    for (const [role, reference] of entityReferences) {
      const failure = this.validateObservationEntityReference(
        current,
        role,
        reference,
        resultClaim.paperId,
      )
      if (failure !== undefined) return failure
    }
    const contextClaims: readonly (readonly [ResearchObservationClaimRole, ResearchClaimId])[] = [
      ...(request.dataset.split.status === 'reported'
        ? [['dataset-split', request.dataset.split.sourceClaimId] as const]
        : []),
      ...(request.evaluationProtocol.status === 'reported'
        ? [['evaluation-protocol', request.evaluationProtocol.sourceClaimId] as const]
        : []),
      ...conditionValues.map(value => ['condition', value.sourceClaimId] as const),
    ]
    for (const [role, claimId] of contextClaims) {
      const validation = this.validateObservationClaim(current, role, claimId, resultClaim.paperId)
      if (validation.status !== 'ok') return validation
    }
    if (request.supersedes !== undefined) {
      const previous = current.observations.find(value => value.id === request.supersedes)
      if (previous === undefined) {
        return { status: 'supersedes-observation-not-found', observationId: request.supersedes }
      }
      if (!isActiveObservation(current, previous.id)) {
        return { status: 'supersedes-observation-inactive', observationId: previous.id }
      }
      const previousPaperId = observationPaperId(current, previous)
      if (previousPaperId !== resultClaim.paperId) {
        return { status: 'supersedes-observation-paper-mismatch', observationId: previous.id }
      }
    }
    const now = mutationTimestamp(current)
    const observation: ResearchObservation = {
      id: ResearchObservationId(randomUUID()),
      resultClaimId: request.resultClaimId,
      method: request.method,
      dataset: request.dataset,
      metric: request.metric,
      value: request.value,
      unit: request.unit,
      valueStatistic: request.valueStatistic,
      evaluationProtocol: request.evaluationProtocol,
      uncertainty: request.uncertainty,
      conditions: request.conditions,
      ...(request.supersedes === undefined ? {} : { supersedes: request.supersedes }),
      createdBy: request.author,
      createdAt: now,
    }
    const next: ResearchQuestionRecord = {
      ...current,
      revision: current.revision + 1,
      observations: [...current.observations, observation],
      updatedBy: request.author,
      updatedAt: now,
    }
    const capacity = this.aggregateCapacity(next)
    if (capacity !== undefined) return capacity
    await table.put(next.id, next)
    return { status: 'created', question: next, observationId: observation.id }
  }

  private async writeComparisonProtocolNow(
    request: NormalizedComparisonProtocolWrite,
  ): Promise<WriteResearchComparisonProtocolResult> {
    if (request.observationIds.length > this.config.maxObservationReferencesPerProtocol) {
      return { status: 'capacity', resource: 'comparison-observation-references' }
    }
    const inputCapacity = this.fieldCapacity([
      request.compatibilityRationale,
      String(request.author.id),
    ])
    if (inputCapacity !== undefined) return inputCapacity
    const table = this.requireTable()
    const current = table.get(request.questionId)
    if (current === undefined) return { status: 'question-not-found', questionId: request.questionId }
    const stale = staleRevision(current, request.expectedRevision)
    if (stale !== undefined) return stale
    if (current.comparisonProtocols.length >= this.config.maxComparisonProtocolsPerQuestion) {
      return { status: 'capacity', resource: 'comparison-protocols' }
    }
    const observationsById = new Map(current.observations.map(value => [value.id, value]))
    const observations: ResearchObservation[] = []
    const paperIds = new Set<ResearchPaperId>()
    for (const observationId of request.observationIds) {
      const observation = observationsById.get(observationId)
      if (observation === undefined) return { status: 'observation-not-found', observationId }
      if (!isActiveObservation(current, observationId)) {
        return { status: 'observation-inactive', observationId }
      }
      if (isObservationStale(current, observation)) {
        return { status: 'observation-stale', observationId }
      }
      observations.push(observation)
      paperIds.add(observationPaperId(current, observation))
    }
    if (paperIds.size < 2) {
      return { status: 'comparison-insufficient-papers', paperIds: sortedStrings(paperIds) }
    }
    if (request.referenceObservationId !== undefined
      && !request.observationIds.includes(request.referenceObservationId)) {
      return {
        status: 'reference-observation-not-member',
        observationId: request.referenceObservationId,
      }
    }
    const alignmentFailure = comparisonAlignmentFailure(
      observations as [ResearchObservation, ResearchObservation, ...ResearchObservation[]],
    )
    if (alignmentFailure !== undefined) return alignmentFailure
    if (request.supersedes !== undefined) {
      const previous = current.comparisonProtocols.find(value => value.id === request.supersedes)
      if (previous === undefined) {
        return {
          status: 'supersedes-comparison-protocol-not-found',
          comparisonProtocolId: request.supersedes,
        }
      }
      if (!isActiveComparisonProtocol(current, previous.id)) {
        return {
          status: 'supersedes-comparison-protocol-inactive',
          comparisonProtocolId: previous.id,
        }
      }
    }
    const now = mutationTimestamp(current)
    const protocol: ResearchComparisonProtocol = {
      id: ResearchComparisonProtocolId(randomUUID()),
      observationIds: request.observationIds,
      direction: request.direction,
      ...(request.referenceObservationId === undefined
        ? {}
        : { referenceObservationId: request.referenceObservationId }),
      compatibilityRationale: request.compatibilityRationale,
      ...(request.supersedes === undefined ? {} : { supersedes: request.supersedes }),
      createdBy: request.author,
      createdAt: now,
    }
    const next: ResearchQuestionRecord = {
      ...current,
      revision: current.revision + 1,
      comparisonProtocols: [...current.comparisonProtocols, protocol],
      updatedBy: request.author,
      updatedAt: now,
    }
    const capacity = this.aggregateCapacity(next)
    if (capacity !== undefined) return capacity
    await table.put(next.id, next)
    return {
      status: 'created',
      question: next,
      comparisonProtocolId: protocol.id,
    }
  }

  private async writeSynthesisNow(
    request: WriteResearchSynthesisRequest,
  ): Promise<WriteResearchSynthesisResult> {
    const table = this.requireTable()
    if (request.findings.length > this.config.maxFindingsPerSynthesis) {
      return { status: 'capacity', resource: 'findings' }
    }
    if (request.findings.some(
      finding => finding.claimIds.length > this.config.maxClaimReferencesPerFinding,
    )) {
      return { status: 'capacity', resource: 'claim-references' }
    }
    const inputCapacity = this.fieldCapacity([
      ...request.findings.map(finding => finding.text),
      String(request.author.id),
    ])
    if (inputCapacity !== undefined) return inputCapacity
    const current = table.get(request.questionId)
    if (current === undefined) return { status: 'question-not-found', questionId: request.questionId }
    const stale = staleRevision(current, request.expectedRevision)
    if (stale !== undefined) return stale
    if (current.syntheses.length >= this.config.maxSynthesesPerQuestion) {
      return { status: 'capacity', resource: 'syntheses' }
    }
    const claimsById = new Map(current.claims.map(value => [value.id, value]))
    for (const [findingIndex, finding] of request.findings.entries()) {
      for (const claimId of finding.claimIds) {
        const claim = claimsById.get(claimId)
        if (claim === undefined) return { status: 'claim-not-found', claimId }
        if (!isActiveClaim(current, claimId)) return { status: 'claim-inactive', claimId }
        if (finding.kind === 'source-summary' && claim.kind !== 'source-statement') {
          return { status: 'source-summary-claim-kind-mismatch', findingIndex, claimId }
        }
      }
      if (finding.kind === 'source-summary') {
        const cited = finding.claimIds.length > 0 && finding.claimIds.every((claimId) => {
          const claim = claimsById.get(claimId)
          return claim !== undefined && claim.evidenceLinks.length > 0
        })
        if (!cited) return { status: 'source-summary-uncited', findingIndex }
      }
    }
    if (request.supersedes !== undefined) {
      const previous = current.syntheses.find(value => value.id === request.supersedes)
      if (previous === undefined) {
        return { status: 'supersedes-synthesis-not-found', synthesisId: request.supersedes }
      }
      if (!isActiveSynthesis(current, previous.id)) {
        return { status: 'supersedes-synthesis-inactive', synthesisId: previous.id }
      }
    }
    const now = mutationTimestamp(current)
    const synthesis: ResearchSynthesis = {
      id: ResearchSynthesisId(randomUUID()),
      findings: request.findings.map(finding => ({
        ...finding,
        id: ResearchFindingId(randomUUID()),
      })),
      ...(request.supersedes === undefined ? {} : { supersedes: request.supersedes }),
      createdBy: request.author,
      createdAt: now,
    }
    const next: ResearchQuestionRecord = {
      ...current,
      revision: current.revision + 1,
      syntheses: [...current.syntheses, synthesis],
      updatedBy: request.author,
      updatedAt: now,
    }
    const capacity = this.aggregateCapacity(next)
    if (capacity !== undefined) return capacity
    await table.put(next.id, next)
    return { status: 'created', question: next, synthesisId: synthesis.id }
  }

  private normalizeQuestionWrite(request: WriteResearchQuestionRequest): NormalizedQuestionWrite {
    const author = this.normalizeAuthor(request.author)
    if (request.action === 'create') {
      return {
        action: 'create',
        title: this.normalizeText('title', request.title),
        question: this.normalizeText('question', request.question),
        author,
      }
    }
    if (request.title === undefined && request.question === undefined) {
      throw new Error('research-information question update requires title or question')
    }
    return {
      action: 'update',
      questionId: request.questionId,
      expectedRevision: nonNegativeSafeInteger('expectedRevision', request.expectedRevision),
      ...(request.title === undefined ? {} : { title: this.normalizeText('title', request.title) }),
      ...(request.question === undefined
        ? {}
        : { question: this.normalizeText('question', request.question) }),
      author,
    }
  }

  private normalizeEvidenceRequest(request: CaptureResearchEvidenceRequest): CaptureResearchEvidenceRequest {
    const blockText = this.exactText('block text', request.blockText)
    const sectionPath = request.sectionPath.map((value, index) =>
      this.exactText(`section path ${index}`, value))
    return {
      ...request,
      expectedRevision: nonNegativeSafeInteger('expectedRevision', request.expectedRevision),
      blockText,
      sectionPath,
      ...(request.selection === undefined
        ? {}
        : { selection: this.normalizeSelection(request.selection) }),
      author: this.normalizeAuthor(request.author),
    }
  }

  private normalizeClaimRequest(request: WriteResearchClaimRequest): WriteResearchClaimRequest {
    if (request.facet === 'other' && request.otherFacet === undefined) {
      throw new Error('research-information other facet requires otherFacet')
    }
    if (request.facet !== 'other' && request.otherFacet !== undefined) {
      throw new Error('research-information otherFacet is valid only for facet other')
    }
    const links = deduplicateBy(
      request.evidenceLinks,
      value => `${value.evidenceId}\u0000${value.relation}`,
    )
    return {
      ...request,
      expectedRevision: nonNegativeSafeInteger('expectedRevision', request.expectedRevision),
      ...(request.otherFacet === undefined
        ? {}
        : { otherFacet: this.normalizeText('other facet', request.otherFacet) }),
      text: this.normalizeText('claim text', request.text),
      evidenceLinks: links,
      author: this.normalizeAuthor(request.author),
    }
  }

  private normalizeReadingNoteRequest(
    request: WriteResearchReadingNoteRequest,
  ): WriteResearchReadingNoteRequest {
    return {
      ...request,
      expectedRevision: nonNegativeSafeInteger('expectedRevision', request.expectedRevision),
      text: this.normalizeAuthoredText('reading note text', request.text),
      author: this.normalizeAuthor(request.author),
    }
  }

  private normalizeEntityRequest(request: WriteResearchEntityRequest): NormalizedEntityWrite {
    if (request.sourceClaimIds.length === 0) {
      throw new Error('research-information entity requires a claim')
    }
    return {
      ...request,
      expectedRevision: nonNegativeSafeInteger('expectedRevision', request.expectedRevision),
      canonicalName: this.normalizeText('entity canonical name', request.canonicalName),
      sourceClaimIds: [...new Set(request.sourceClaimIds)],
      supersedes: [...new Set(request.supersedes ?? [])],
      author: this.normalizeAuthor(request.author),
    }
  }

  private normalizeObservationRequest(
    request: WriteResearchObservationRequest,
  ): WriteResearchObservationRequest {
    if (request.method.role === 'other' && request.method.otherRole === undefined) {
      throw new Error('research-information other method role requires otherRole')
    }
    if (request.method.role !== 'other' && request.method.otherRole !== undefined) {
      throw new Error('research-information otherRole is valid only for method role other')
    }
    const value = this.normalizeDecimal('observation value', String(request.value))
    return {
      ...request,
      expectedRevision: nonNegativeSafeInteger('expectedRevision', request.expectedRevision),
      method: {
        ...request.method,
        ...(request.method.otherRole === undefined
          ? {}
          : { otherRole: this.normalizeText('other method role', request.method.otherRole) }),
      },
      dataset: {
        ...request.dataset,
        split: this.normalizeObservationContext('dataset split', request.dataset.split),
      },
      value,
      unit: request.unit.status === 'reported'
        ? { status: 'reported', symbol: this.normalizeText('observation unit', request.unit.symbol) }
        : request.unit,
      valueStatistic: this.normalizeText('observation value statistic', request.valueStatistic),
      evaluationProtocol: this.normalizeObservationContext(
        'evaluation protocol',
        request.evaluationProtocol,
      ),
      uncertainty: this.normalizeObservationUncertainty(request.uncertainty, value),
      conditions: this.normalizeObservationConditions(request.conditions),
      author: this.normalizeAuthor(request.author),
    }
  }

  private normalizeComparisonProtocolRequest(
    request: WriteResearchComparisonProtocolRequest,
  ): NormalizedComparisonProtocolWrite {
    const observationIds = [...new Set(request.observationIds)]
    if (observationIds.length < 2) {
      throw new Error('research-information comparison protocol requires two observations')
    }
    return {
      ...request,
      expectedRevision: nonNegativeSafeInteger('expectedRevision', request.expectedRevision),
      observationIds,
      compatibilityRationale: this.normalizeText(
        'comparison compatibility rationale',
        request.compatibilityRationale,
      ),
      author: this.normalizeAuthor(request.author),
    }
  }

  private normalizeObservationContext(
    field: string,
    context: ResearchObservationReportedContext,
  ): ResearchObservationReportedContext {
    return context.status === 'reported'
      ? { ...context, value: this.normalizeText(field, context.value) }
      : context
  }

  private normalizeObservationConditions(
    conditions: ResearchObservationConditions,
  ): ResearchObservationConditions {
    if (conditions.status !== 'reported') return conditions
    if (conditions.values.length === 0) {
      throw new Error('research-information reported observation conditions require a value')
    }
    const values = conditions.values.map(value => ({
      ...value,
      name: this.normalizeText('observation condition name', value.name),
      value: this.normalizeText('observation condition value', value.value),
    }))
    this.assertInputUnique('observation condition names', values.map(value => value.name))
    values.sort((left, right) => compareStrings(left.name, right.name))
    return { status: 'reported', values }
  }

  private normalizeObservationUncertainty(
    uncertainty: ResearchObservationUncertainty,
    point: ResearchDecimal,
  ): ResearchObservationUncertainty {
    if (uncertainty.status !== 'reported') return uncertainty
    const value = uncertainty.value
    if ('magnitude' in value) {
      const magnitude = this.normalizeDecimal('observation uncertainty magnitude', String(value.magnitude))
      if (new Decimal(magnitude).isNegative()) {
        throw new Error('research-information observation uncertainty magnitude must not be negative')
      }
      return { status: 'reported', value: { kind: value.kind, magnitude } }
    }
    const lower = this.normalizeDecimal('observation uncertainty lower bound', String(value.lower))
    const upper = this.normalizeDecimal('observation uncertainty upper bound', String(value.upper))
    const pointValue = new Decimal(point)
    if (new Decimal(lower).greaterThan(upper)) {
      throw new Error('research-information observation uncertainty lower bound must not exceed its upper bound')
    }
    if (new Decimal(lower).greaterThan(pointValue) || new Decimal(upper).lessThan(pointValue)) {
      throw new Error('research-information observation uncertainty bounds must contain the point value')
    }
    if (!('confidenceLevelPercent' in value)) {
      return { status: 'reported', value: { kind: 'range', lower, upper } }
    }
    const confidenceLevelPercent = this.normalizeDecimal(
      'observation confidence level percent',
      String(value.confidenceLevelPercent),
    )
    const confidence = new Decimal(confidenceLevelPercent)
    if (!confidence.greaterThan(0) || confidence.greaterThan(100)) {
      throw new Error('research-information observation confidence level percent must be above zero and at most 100')
    }
    return {
      status: 'reported',
      value: { kind: 'confidence-interval', lower, upper, confidenceLevelPercent },
    }
  }

  private normalizeDecimal(field: string, value: string): ResearchDecimal {
    const normalized = value.normalize('NFKC').trim()
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu.test(normalized)) {
      throw new Error(`research-information ${field} must be a finite base-ten number`)
    }
    const decimal = new Decimal(normalized)
    if (!decimal.isFinite()) {
      throw new Error(`research-information ${field} must be a finite base-ten number`)
    }
    const [coefficient = ''] = normalized.split(/e/iu, 1)
    if (decimal.isZero() && /[1-9]/u.test(coefficient)) {
      throw new Error(`research-information ${field} must not underflow decimal storage`)
    }
    return ResearchDecimal(decimal.isZero() ? '0' : decimal.toString())
  }

  private normalizeSynthesisRequest(
    request: WriteResearchSynthesisRequest,
  ): WriteResearchSynthesisRequest {
    if (request.findings.length === 0) throw new Error('research-information synthesis requires a finding')
    return {
      ...request,
      expectedRevision: nonNegativeSafeInteger('expectedRevision', request.expectedRevision),
      findings: request.findings.map((finding, index) => this.normalizeFinding(finding, index)),
      author: this.normalizeAuthor(request.author),
    }
  }

  private normalizeFinding(finding: ResearchFindingInput, index: number): ResearchFindingInput {
    const claimIds = [...new Set(finding.claimIds)]
    return {
      ...finding,
      text: this.normalizeText(`finding ${index} text`, finding.text),
      claimIds,
    }
  }

  private normalizeSelection(selection: ResearchEvidenceSelection): ResearchEvidenceSelection {
    const text = this.exactText('selected evidence text', selection.text)
    return {
      text,
      startUtf8Byte: nonNegativeSafeInteger('selection.startUtf8Byte', selection.startUtf8Byte),
      endUtf8Byte: nonNegativeSafeInteger('selection.endUtf8Byte', selection.endUtf8Byte),
      textHash: selection.textHash,
    }
  }

  private normalizeAuthor(author: ResearchAuthorship): ResearchAuthorship {
    const id = this.normalizeText('author id', String(author.id))
    return { kind: author.kind, id: ResearchAuthorId(id) }
  }

  private validateEvidenceProvenance(request: CaptureResearchEvidenceRequest): EvidenceValidation {
    const paper = this.ctx.researchLibrary.get(request.paperId)
    if (paper === undefined) return { status: 'paper-not-found', paperId: request.paperId }
    const source = paper.sourceVersions.find(value => value.id === request.sourceVersionId)
    if (source === undefined) {
      return {
        status: 'source-not-found',
        paperId: request.paperId,
        sourceVersionId: request.sourceVersionId,
      }
    }
    if (source.documentId !== request.locator.documentId) {
      return { status: 'provenance-mismatch', reason: 'document' }
    }
    const observed = source.observations.some(value =>
      value.parserId === request.locator.parserId
      && value.parserVersion === request.locator.parserVersion)
    if (!observed) return { status: 'provenance-mismatch', reason: 'parser-observation' }
    if (`sha256:${hashText(request.blockText)}` !== request.locator.quoteHash) {
      return { status: 'provenance-mismatch', reason: 'block-hash' }
    }
    if (request.selection !== undefined) {
      if (`sha256:${hashText(request.selection.text)}` !== request.selection.textHash) {
        return { status: 'provenance-mismatch', reason: 'selection-hash' }
      }
      const charIndex = request.blockText.indexOf(request.selection.text)
      const unique = charIndex >= 0 && charIndex === request.blockText.lastIndexOf(request.selection.text)
      const start = unique
        ? Buffer.byteLength(request.blockText.slice(0, charIndex), 'utf8')
        : -1
      const end = start + Buffer.byteLength(request.selection.text, 'utf8')
      if (!unique || start !== request.selection.startUtf8Byte || end !== request.selection.endUtf8Byte) {
        return { status: 'provenance-mismatch', reason: 'selection-offset' }
      }
    }
    return { status: 'ok', paper, source }
  }

  private validateObservationClaim(
    record: ResearchQuestionRecord,
    claimRole: ResearchObservationClaimRole,
    claimId: ResearchClaimId,
    expectedPaperId?: ResearchPaperId,
  ): ObservationClaimValidation {
    const claim = record.claims.find(value => value.id === claimId)
    if (claim === undefined) return { status: 'observation-claim-not-found', claimRole, claimId }
    if (!isActiveClaim(record, claimId)) {
      return { status: 'observation-claim-inactive', claimRole, claimId }
    }
    if (claim.kind !== 'source-statement') {
      return { status: 'observation-claim-kind-mismatch', claimRole, claimId }
    }
    const evidenceById = new Map(record.evidence.map(value => [value.id, value]))
    const paperIds = new Set<ResearchPaperId>()
    for (const link of claim.evidenceLinks) {
      const evidence = evidenceById.get(link.evidenceId)
      /* v8 ignore next -- aggregate validation rejects missing claim evidence before operations start. */
      if (evidence !== undefined) paperIds.add(evidence.paperId)
    }
    /* v8 ignore next -- stored and newly written source statements always have one-paper evidence. */
    if (claim.evidenceLinks.length === 0 || paperIds.size !== 1) {
      return { status: 'observation-claim-uncited', claimRole, claimId }
    }
    const paperId = [...paperIds][0] as ResearchPaperId
    if (expectedPaperId !== undefined && paperId !== expectedPaperId) {
      return {
        status: 'observation-claim-paper-mismatch',
        claimRole,
        claimId,
        paperId,
      }
    }
    return { status: 'ok', claim, paperId }
  }

  private validateObservationEntityReference(
    record: ResearchQuestionRecord,
    entityRole: ResearchObservationEntityRole,
    reference: ResearchObservationEntityReference,
    paperId: ResearchPaperId,
  ): ResearchObservationReferenceFailure | undefined {
    const entity = record.entities.find(value => value.id === reference.entityId)
    if (entity === undefined) {
      return { status: 'observation-entity-not-found', entityRole, entityId: reference.entityId }
    }
    if (!isActiveEntity(record, entity.id)) {
      return { status: 'observation-entity-inactive', entityRole, entityId: entity.id }
    }
    if (entity.kind !== entityRole) {
      return {
        status: 'observation-entity-kind-mismatch',
        entityRole,
        entityId: entity.id,
        entityKind: entity.kind,
      }
    }
    const claimsById = new Map(record.claims.map(value => [value.id, value]))
    const staleClaimIds = entity.sourceClaimIds.filter((claimId) => {
      const claim = claimsById.get(claimId)
      return claim === undefined || !isActiveClaim(record, claimId)
    })
    if (staleClaimIds.length > 0) {
      return {
        status: 'observation-entity-stale',
        entityRole,
        entityId: entity.id,
        staleClaimIds,
      }
    }
    if (!entity.sourceClaimIds.includes(reference.sourceClaimId)) {
      return {
        status: 'observation-entity-claim-mismatch',
        entityRole,
        entityId: entity.id,
        claimId: reference.sourceClaimId,
      }
    }
    const claimValidation = this.validateObservationClaim(
      record,
      entityRole,
      reference.sourceClaimId,
      paperId,
    )
    if (claimValidation.status !== 'ok') return claimValidation
    /* v8 ignore next -- entity creation and stored-state validation require this claim facet. */
    if (claimValidation.claim.facet !== entityRole) {
      return {
        status: 'observation-entity-claim-mismatch',
        entityRole,
        entityId: entity.id,
        claimId: reference.sourceClaimId,
      }
    }
    return undefined
  }

  private aggregateCapacity(
    record: ResearchQuestionRecord,
  ): { readonly status: 'capacity'; readonly resource: ResearchInformationCapacity } | undefined {
    if (this.aggregateBytes(record) > this.config.maxAggregateBytes) {
      return { status: 'capacity', resource: 'aggregate-bytes' }
    }
    return undefined
  }

  private aggregateBytes(record: ResearchQuestionRecord): number {
    return Buffer.byteLength(JSON.stringify(record), 'utf8')
  }

  private normalizeText(field: string, value: string): string {
    const normalized = value.normalize('NFKC').trim().replaceAll(/\s+/gu, ' ')
    if (normalized.length === 0) throw new Error(`research-information ${field} must not be empty`)
    return normalized
  }

  private normalizeAuthoredText(field: string, value: string): string {
    const normalized = value.normalize('NFKC').replaceAll('\r\n', '\n').trim()
    if (normalized.length === 0) throw new Error(`research-information ${field} must not be empty`)
    return normalized
  }

  private exactText(field: string, value: string): string {
    if (value.length === 0) throw new Error(`research-information ${field} must not be empty`)
    return value
  }

  private fieldCapacity(values: readonly string[]): CapacityFailure | undefined {
    if (values.some(value => Buffer.byteLength(value, 'utf8') > this.config.maxFieldBytes)) {
      return { status: 'capacity', resource: 'field-bytes' }
    }
    return undefined
  }

  private validateStoredState(): void {
    const table = this.requireTable()
    if (table.size > this.config.maxQuestions) {
      throw inconsistent(`question count ${table.size} exceeds configured maximum ${this.config.maxQuestions}`)
    }
    for (const [key, record] of table.entries()) {
      if (key !== record.id) throw inconsistent(`table key '${key}' differs from record id '${record.id}'`)
      this.validateStoredRecord(record)
    }
  }

  private validateStoredRecord(record: ResearchQuestionRecord): void {
    this.assertCanonicalText('title', record.title)
    this.assertCanonicalText('question', record.question)
    this.assertCanonicalAuthor(record.createdBy)
    this.assertCanonicalAuthor(record.updatedBy)
    if (Date.parse(record.updatedAt) < Date.parse(record.createdAt)) {
      throw inconsistent(`question '${record.id}' updatedAt precedes createdAt`)
    }
    if (record.evidence.length > this.config.maxEvidencePerQuestion) {
      throw inconsistent(`question '${record.id}' evidence exceeds configured maximum`)
    }
    if (record.claims.length > this.config.maxClaimsPerQuestion) {
      throw inconsistent(`question '${record.id}' claims exceed configured maximum`)
    }
    if (record.syntheses.length > this.config.maxSynthesesPerQuestion) {
      throw inconsistent(`question '${record.id}' syntheses exceed configured maximum`)
    }
    if (record.readingNotes.length > this.config.maxReadingNotesPerQuestion) {
      throw inconsistent(`question '${record.id}' reading notes exceed configured maximum`)
    }
    if (record.entities.length > this.config.maxEntitiesPerQuestion) {
      throw inconsistent(`question '${record.id}' entities exceed configured maximum`)
    }
    if (record.observations.length > this.config.maxObservationsPerQuestion) {
      throw inconsistent(`question '${record.id}' observations exceed configured maximum`)
    }
    if (record.comparisonProtocols.length > this.config.maxComparisonProtocolsPerQuestion) {
      throw inconsistent(`question '${record.id}' comparison protocols exceed configured maximum`)
    }
    if (this.aggregateBytes(record) > this.config.maxAggregateBytes) {
      throw inconsistent(`question '${record.id}' aggregate exceeds configured maximum`)
    }
    this.assertUnique(`question '${record.id}' evidence ids`, record.evidence.map(value => value.id))
    this.assertUnique(`question '${record.id}' claim ids`, record.claims.map(value => value.id))
    this.assertUnique(`question '${record.id}' synthesis ids`, record.syntheses.map(value => value.id))
    this.assertUnique(`question '${record.id}' reading note ids`, record.readingNotes.map(value => value.id))
    this.assertUnique(`question '${record.id}' entity ids`, record.entities.map(value => value.id))
    this.assertUnique(`question '${record.id}' observation ids`, record.observations.map(value => value.id))
    this.assertUnique(
      `question '${record.id}' comparison protocol ids`,
      record.comparisonProtocols.map(value => value.id),
    )
    const evidenceById = new Map<ResearchEvidenceId, ResearchEvidence>()
    for (const evidence of record.evidence) {
      this.assertCanonicalAuthor(evidence.createdBy)
      this.childTimestamp(record, `evidence '${evidence.id}'`, evidence.createdAt)
      this.exactStored('block text', evidence.blockText, this.config.maxBlockBytes)
      for (const section of evidence.sectionPath) {
        this.exactStored('section path', section, this.config.maxFieldBytes)
      }
      const request: CaptureResearchEvidenceRequest = {
        questionId: record.id,
        expectedRevision: record.revision,
        paperId: evidence.paperId,
        sourceVersionId: evidence.sourceVersionId,
        locator: evidence.locator,
        blockText: evidence.blockText,
        sectionPath: evidence.sectionPath,
        ...(evidence.selection === undefined ? {} : { selection: evidence.selection }),
        author: evidence.createdBy,
      }
      const validation = this.validateEvidenceProvenance(request)
      if (validation.status !== 'ok') {
        throw inconsistent(`evidence '${evidence.id}' has invalid provenance (${validation.status})`)
      }
      evidenceById.set(evidence.id, evidence)
    }
    const seenReadingNotes = new Set<ResearchReadingNoteId>()
    const supersededReadingNotes = new Set<ResearchReadingNoteId>()
    for (const readingNote of record.readingNotes) {
      this.assertCanonicalAuthoredText('reading note text', readingNote.text)
      this.assertCanonicalAuthor(readingNote.createdBy)
      const readingNoteTimestamp = this.childTimestamp(
        record,
        `reading note '${readingNote.id}'`,
        readingNote.createdAt,
      )
      const noteEvidence = evidenceById.get(readingNote.evidenceId)
      if (noteEvidence === undefined
        || Date.parse(noteEvidence.createdAt) > readingNoteTimestamp) {
        throw inconsistent(
          `reading note '${readingNote.id}' references missing or later evidence '${readingNote.evidenceId}'`,
        )
      }
      if (readingNote.kind === 'passage-question' && noteEvidence.selection === undefined) {
        throw inconsistent(`passage question '${readingNote.id}' lacks exact selected evidence`)
      }
      if (readingNote.supersedes !== undefined) {
        const previous = record.readingNotes.find(value => value.id === readingNote.supersedes)
        if (previous === undefined || !seenReadingNotes.has(previous.id)) {
          throw inconsistent(`reading note '${readingNote.id}' supersedes a missing or later reading note`)
        }
        if (supersededReadingNotes.has(previous.id)) {
          throw inconsistent(`reading note '${previous.id}' is superseded more than once`)
        }
        if (previous.kind !== readingNote.kind) {
          throw inconsistent(`reading note '${readingNote.id}' changes reading note kind`)
        }
        if (Date.parse(previous.createdAt) > readingNoteTimestamp) {
          throw inconsistent(`reading note '${readingNote.id}' createdAt precedes superseded reading note '${previous.id}'`)
        }
        supersededReadingNotes.add(previous.id)
      }
      seenReadingNotes.add(readingNote.id)
    }
    const seenClaims = new Set<ResearchClaimId>()
    const supersededClaims = new Set<ResearchClaimId>()
    const supersedingClaimsById = new Map<ResearchClaimId, ResearchClaim>()
    for (const claim of record.claims) {
      this.assertCanonicalText('claim text', claim.text)
      this.assertCanonicalAuthor(claim.createdBy)
      this.assertOtherFacet(claim)
      const claimTimestamp = this.childTimestamp(record, `claim '${claim.id}'`, claim.createdAt)
      if (claim.evidenceLinks.length > this.config.maxEvidenceLinksPerClaim) {
        throw inconsistent(`claim '${claim.id}' evidence links exceed configured maximum`)
      }
      this.assertUnique(
        `claim '${claim.id}' evidence links`,
        claim.evidenceLinks.map(value => `${value.evidenceId}\u0000${value.relation}`),
      )
      const paperIds = new Set<ResearchPaperId>()
      for (const link of claim.evidenceLinks) {
        const evidence = evidenceById.get(link.evidenceId)
        if (evidence === undefined || Date.parse(evidence.createdAt) > claimTimestamp) {
          throw inconsistent(`claim '${claim.id}' references missing or later evidence '${link.evidenceId}'`)
        }
        paperIds.add(evidence.paperId)
      }
      if (claim.kind === 'source-statement' && claim.evidenceLinks.length === 0) {
        throw inconsistent(`source claim '${claim.id}' has no evidence`)
      }
      if (claim.kind === 'source-statement' && paperIds.size > 1) {
        throw inconsistent(`source claim '${claim.id}' spans multiple papers`)
      }
      if (claim.supersedes !== undefined) {
        const previous = record.claims.find(value => value.id === claim.supersedes)
        if (previous === undefined || !seenClaims.has(previous.id)) {
          throw inconsistent(`claim '${claim.id}' supersedes a missing or later claim`)
        }
        if (supersededClaims.has(previous.id)) {
          throw inconsistent(`claim '${previous.id}' is superseded more than once`)
        }
        if (previous.kind !== claim.kind) throw inconsistent(`claim '${claim.id}' changes claim kind`)
        if (Date.parse(previous.createdAt) > claimTimestamp) {
          throw inconsistent(`claim '${claim.id}' createdAt precedes superseded claim '${previous.id}'`)
        }
        supersededClaims.add(previous.id)
        supersedingClaimsById.set(previous.id, claim)
      }
      seenClaims.add(claim.id)
    }
    const seenSyntheses = new Set<ResearchSynthesisId>()
    const supersededSyntheses = new Set<ResearchSynthesisId>()
    const claimsById = new Map(record.claims.map(value => [value.id, value]))
    const seenEntities = new Set<ResearchEntityId>()
    const supersededEntities = new Set<ResearchEntityId>()
    const supersedingEntitiesById = new Map<ResearchEntityId, ResearchEntity>()
    for (const entity of record.entities) {
      this.assertCanonicalText('entity canonical name', entity.canonicalName)
      this.assertCanonicalAuthor(entity.createdBy)
      const entityTimestamp = this.childTimestamp(record, `entity '${entity.id}'`, entity.createdAt)
      if (entity.sourceClaimIds.length === 0) throw inconsistent(`entity '${entity.id}' has no source claims`)
      if (entity.sourceClaimIds.length > this.config.maxClaimReferencesPerEntity) {
        throw inconsistent(`entity '${entity.id}' claim references exceed configured maximum`)
      }
      if (entity.supersedes.length > this.config.maxSupersededEntitiesPerEntity) {
        throw inconsistent(`entity '${entity.id}' supersession references exceed configured maximum`)
      }
      this.assertUnique(`entity '${entity.id}' source claim ids`, entity.sourceClaimIds)
      this.assertUnique(`entity '${entity.id}' superseded entity ids`, entity.supersedes)
      for (const claimId of entity.sourceClaimIds) {
        const claim = claimsById.get(claimId)
        if (claim === undefined || Date.parse(claim.createdAt) > entityTimestamp) {
          throw inconsistent(`entity '${entity.id}' references a missing or later claim '${claimId}'`)
        }
        if (claim.kind !== 'source-statement' || claim.evidenceLinks.length === 0) {
          throw inconsistent(`entity '${entity.id}' claim '${claimId}' lacks source-statement evidence`)
        }
        if (claim.facet !== entity.kind) {
          throw inconsistent(`entity '${entity.id}' claim '${claimId}' has facet '${claim.facet}'`)
        }
        this.assertClaimActiveAtCreation(
          'entity',
          entity.id,
          claimId,
          entityTimestamp,
          supersedingClaimsById.get(claimId),
        )
      }
      for (const predecessorId of entity.supersedes) {
        const previous = record.entities.find(value => value.id === predecessorId)
        if (previous === undefined || !seenEntities.has(previous.id)) {
          throw inconsistent(`entity '${entity.id}' supersedes a missing or later entity`)
        }
        if (supersededEntities.has(previous.id)) {
          throw inconsistent(`entity '${previous.id}' is superseded more than once`)
        }
        if (previous.kind !== entity.kind) throw inconsistent(`entity '${entity.id}' changes entity kind`)
        if (Date.parse(previous.createdAt) > entityTimestamp) {
          throw inconsistent(`entity '${entity.id}' createdAt precedes superseded entity '${previous.id}'`)
        }
        supersededEntities.add(previous.id)
        supersedingEntitiesById.set(previous.id, entity)
      }
      seenEntities.add(entity.id)
    }
    const observationsById = new Map(record.observations.map(value => [value.id, value]))
    const seenObservations = new Set<ResearchObservationId>()
    const supersededObservations = new Set<ResearchObservationId>()
    const supersedingObservationsById = new Map<ResearchObservationId, ResearchObservation>()
    for (const observation of record.observations) {
      this.assertCanonicalStoredObservation(record, observation)
      const observationTimestamp = this.childTimestamp(
        record,
        `observation '${observation.id}'`,
        observation.createdAt,
      )
      const resultPaperId = this.assertObservationClaimAtCreation(
        observation.id,
        'result',
        observation.resultClaimId,
        observationTimestamp,
        claimsById,
        evidenceById,
        supersedingClaimsById,
      )
      const resultClaim = claimsById.get(observation.resultClaimId)
      if (resultClaim?.facet !== 'result') {
        throw inconsistent(`observation '${observation.id}' result claim has facet '${resultClaim?.facet}'`)
      }
      const entityReferences: readonly [
        ResearchObservationEntityRole,
        ResearchObservationEntityReference,
      ][] = [
        ['method', observation.method],
        ['dataset', observation.dataset],
        ['metric', observation.metric],
      ]
      for (const [role, reference] of entityReferences) {
        const entity = record.entities.find(value => value.id === reference.entityId)
        if (entity === undefined || Date.parse(entity.createdAt) > observationTimestamp) {
          throw inconsistent(`observation '${observation.id}' references a missing or later ${role} entity`)
        }
        if (entity.kind !== role) {
          throw inconsistent(`observation '${observation.id}' ${role} reference has kind '${entity.kind}'`)
        }
        if (!entity.sourceClaimIds.includes(reference.sourceClaimId)) {
          throw inconsistent(`observation '${observation.id}' ${role} claim is not an entity member`)
        }
        this.assertEntityActiveAtCreation(
          observation.id,
          entity.id,
          observationTimestamp,
          supersedingEntitiesById.get(entity.id),
        )
        for (const sourceClaimId of entity.sourceClaimIds) {
          this.assertClaimActiveAtCreation(
            'observation',
            observation.id,
            sourceClaimId,
            observationTimestamp,
            supersedingClaimsById.get(sourceClaimId),
          )
        }
        this.assertObservationClaimAtCreation(
          observation.id,
          role,
          reference.sourceClaimId,
          observationTimestamp,
          claimsById,
          evidenceById,
          supersedingClaimsById,
          resultPaperId,
        )
      }
      const contextClaims: readonly (readonly [ResearchObservationClaimRole, ResearchClaimId])[] = [
        ...(observation.dataset.split.status === 'reported'
          ? [['dataset-split', observation.dataset.split.sourceClaimId] as const]
          : []),
        ...(observation.evaluationProtocol.status === 'reported'
          ? [['evaluation-protocol', observation.evaluationProtocol.sourceClaimId] as const]
          : []),
        ...(observation.conditions.status === 'reported'
          ? observation.conditions.values.map(value => ['condition', value.sourceClaimId] as const)
          : []),
      ]
      for (const [role, claimId] of contextClaims) {
        this.assertObservationClaimAtCreation(
          observation.id,
          role,
          claimId,
          observationTimestamp,
          claimsById,
          evidenceById,
          supersedingClaimsById,
          resultPaperId,
        )
      }
      if (observation.supersedes !== undefined) {
        const previous = observationsById.get(observation.supersedes)
        if (previous === undefined || !seenObservations.has(previous.id)) {
          throw inconsistent(`observation '${observation.id}' supersedes a missing or later observation`)
        }
        if (supersededObservations.has(previous.id)) {
          throw inconsistent(`observation '${previous.id}' is superseded more than once`)
        }
        if (Date.parse(previous.createdAt) > observationTimestamp) {
          throw inconsistent(`observation '${observation.id}' createdAt precedes superseded observation '${previous.id}'`)
        }
        if (observationPaperId(record, previous) !== resultPaperId) {
          throw inconsistent(`observation '${observation.id}' changes paper across supersession`)
        }
        supersededObservations.add(previous.id)
        supersedingObservationsById.set(previous.id, observation)
      }
      seenObservations.add(observation.id)
    }
    const seenComparisonProtocols = new Set<ResearchComparisonProtocolId>()
    const supersededComparisonProtocols = new Set<ResearchComparisonProtocolId>()
    for (const protocol of record.comparisonProtocols) {
      this.assertCanonicalText('comparison compatibility rationale', protocol.compatibilityRationale)
      this.assertCanonicalAuthor(protocol.createdBy)
      const protocolTimestamp = this.childTimestamp(
        record,
        `comparison protocol '${protocol.id}'`,
        protocol.createdAt,
      )
      if (protocol.observationIds.length < 2) {
        throw inconsistent(`comparison protocol '${protocol.id}' has fewer than two observations`)
      }
      if (protocol.observationIds.length > this.config.maxObservationReferencesPerProtocol) {
        throw inconsistent(`comparison protocol '${protocol.id}' observation references exceed configured maximum`)
      }
      this.assertUnique(`comparison protocol '${protocol.id}' observation ids`, protocol.observationIds)
      if (protocol.referenceObservationId !== undefined
        && !protocol.observationIds.includes(protocol.referenceObservationId)) {
        throw inconsistent(`comparison protocol '${protocol.id}' reference observation is not a member`)
      }
      const observations: ResearchObservation[] = []
      const paperIds = new Set<ResearchPaperId>()
      for (const observationId of protocol.observationIds) {
        const observation = observationsById.get(observationId)
        if (observation === undefined || Date.parse(observation.createdAt) > protocolTimestamp) {
          throw inconsistent(`comparison protocol '${protocol.id}' references a missing or later observation`)
        }
        this.assertObservationActiveAtCreation(
          protocol.id,
          observation.id,
          protocolTimestamp,
          supersedingObservationsById.get(observation.id),
        )
        this.assertObservationFreshAtCreation(
          record,
          protocol,
          observation,
          protocolTimestamp,
          supersedingClaimsById,
          supersedingEntitiesById,
        )
        observations.push(observation)
        paperIds.add(observationPaperId(record, observation))
      }
      if (paperIds.size < 2) {
        throw inconsistent(`comparison protocol '${protocol.id}' does not span two papers`)
      }
      const alignmentFailure = comparisonAlignmentFailure(
        observations as [ResearchObservation, ResearchObservation, ...ResearchObservation[]],
      )
      if (alignmentFailure !== undefined) {
        throw inconsistent(
          `comparison protocol '${protocol.id}' has incompatible ${alignmentFailure.dimension}`,
        )
      }
      if (protocol.supersedes !== undefined) {
        const previous = record.comparisonProtocols.find(value => value.id === protocol.supersedes)
        if (previous === undefined || !seenComparisonProtocols.has(previous.id)) {
          throw inconsistent(`comparison protocol '${protocol.id}' supersedes a missing or later protocol`)
        }
        if (supersededComparisonProtocols.has(previous.id)) {
          throw inconsistent(`comparison protocol '${previous.id}' is superseded more than once`)
        }
        if (Date.parse(previous.createdAt) > protocolTimestamp) {
          throw inconsistent(
            `comparison protocol '${protocol.id}' createdAt precedes superseded protocol '${previous.id}'`,
          )
        }
        supersededComparisonProtocols.add(previous.id)
      }
      seenComparisonProtocols.add(protocol.id)
    }
    for (const synthesis of record.syntheses) {
      this.assertCanonicalAuthor(synthesis.createdBy)
      const synthesisTimestamp = this.childTimestamp(
        record,
        `synthesis '${synthesis.id}'`,
        synthesis.createdAt,
      )
      if (synthesis.findings.length === 0) throw inconsistent(`synthesis '${synthesis.id}' has no findings`)
      if (synthesis.findings.length > this.config.maxFindingsPerSynthesis) {
        throw inconsistent(`synthesis '${synthesis.id}' findings exceed configured maximum`)
      }
      this.assertUnique(`synthesis '${synthesis.id}' finding ids`, synthesis.findings.map(value => value.id))
      for (const finding of synthesis.findings) {
        this.assertCanonicalText('finding text', finding.text)
        if (finding.claimIds.length > this.config.maxClaimReferencesPerFinding) {
          throw inconsistent(`finding '${finding.id}' claim references exceed configured maximum`)
        }
        this.assertUnique(`finding '${finding.id}' claim ids`, finding.claimIds)
        for (const claimId of finding.claimIds) {
          const claim = claimsById.get(claimId)
          if (claim === undefined || Date.parse(claim.createdAt) > synthesisTimestamp) {
            throw inconsistent(`finding '${finding.id}' references a missing or later claim '${claimId}'`)
          }
          this.assertClaimActiveAtCreation(
            'synthesis',
            synthesis.id,
            claimId,
            synthesisTimestamp,
            supersedingClaimsById.get(claimId),
          )
        }
        if (finding.kind === 'source-summary') {
          const sourceBacked = finding.claimIds.length > 0 && finding.claimIds.every((claimId) => {
            const claim = claimsById.get(claimId)
            return claim?.kind === 'source-statement' && claim.evidenceLinks.length > 0
          })
          if (!sourceBacked) {
            throw inconsistent(`source-summary finding '${finding.id}' lacks source-statement evidence`)
          }
        }
      }
      if (synthesis.supersedes !== undefined) {
        const previous = record.syntheses.find(value => value.id === synthesis.supersedes)
        if (previous === undefined || !seenSyntheses.has(previous.id)) {
          throw inconsistent(`synthesis '${synthesis.id}' supersedes a missing or later synthesis`)
        }
        if (supersededSyntheses.has(previous.id)) {
          throw inconsistent(`synthesis '${previous.id}' is superseded more than once`)
        }
        if (Date.parse(previous.createdAt) > synthesisTimestamp) {
          throw inconsistent(
            `synthesis '${synthesis.id}' createdAt precedes superseded synthesis '${previous.id}'`,
          )
        }
        supersededSyntheses.add(previous.id)
      }
      seenSyntheses.add(synthesis.id)
    }
  }

  private assertCanonicalStoredObservation(
    record: ResearchQuestionRecord,
    observation: ResearchObservation,
  ): void {
    const conditionValues = observation.conditions.status === 'reported'
      ? observation.conditions.values
      : []
    if (conditionValues.length > this.config.maxConditionsPerObservation) {
      throw inconsistent(`observation '${observation.id}' conditions exceed configured maximum`)
    }
    const request: WriteResearchObservationRequest = {
      questionId: record.id,
      expectedRevision: record.revision,
      resultClaimId: observation.resultClaimId,
      method: observation.method,
      dataset: observation.dataset,
      metric: observation.metric,
      value: observation.value,
      unit: observation.unit,
      valueStatistic: observation.valueStatistic,
      evaluationProtocol: observation.evaluationProtocol,
      uncertainty: observation.uncertainty,
      conditions: observation.conditions,
      ...(observation.supersedes === undefined ? {} : { supersedes: observation.supersedes }),
      author: observation.createdBy,
    }
    let normalized: WriteResearchObservationRequest
    try {
      normalized = this.normalizeObservationRequest(request)
    } catch (error) {
      throw inconsistent((error as Error).message)
    }
    if (JSON.stringify(normalized) !== JSON.stringify(request)) {
      throw inconsistent(`observation '${observation.id}' fields are not normalized`)
    }
    const capacity = this.fieldCapacity([
      String(observation.value),
      observation.valueStatistic,
      String(observation.createdBy.id),
      ...(observation.method.otherRole === undefined ? [] : [observation.method.otherRole]),
      ...(observation.unit.status === 'reported' ? [observation.unit.symbol] : []),
      ...(observation.dataset.split.status === 'reported' ? [observation.dataset.split.value] : []),
      ...(observation.evaluationProtocol.status === 'reported'
        ? [observation.evaluationProtocol.value]
        : []),
      ...conditionValues.flatMap(value => [value.name, value.value]),
      ...uncertaintyDecimals(observation.uncertainty),
    ])
    if (capacity !== undefined) {
      throw inconsistent(`observation '${observation.id}' fields exceed configured UTF-8 limit`)
    }
  }

  private assertObservationClaimAtCreation(
    observationId: ResearchObservationId,
    claimRole: ResearchObservationClaimRole,
    claimId: ResearchClaimId,
    observationTimestamp: number,
    claimsById: ReadonlyMap<ResearchClaimId, ResearchClaim>,
    evidenceById: ReadonlyMap<ResearchEvidenceId, ResearchEvidence>,
    supersedingClaimsById: ReadonlyMap<ResearchClaimId, ResearchClaim>,
    expectedPaperId?: ResearchPaperId,
  ): ResearchPaperId {
    const claim = claimsById.get(claimId)
    if (claim === undefined || Date.parse(claim.createdAt) > observationTimestamp) {
      throw inconsistent(`observation '${observationId}' ${claimRole} claim is missing or later`)
    }
    if (claim.kind !== 'source-statement' || claim.evidenceLinks.length === 0) {
      throw inconsistent(`observation '${observationId}' ${claimRole} claim lacks source-statement evidence`)
    }
    const paperIds = new Set<ResearchPaperId>()
    for (const link of claim.evidenceLinks) {
      const evidence = evidenceById.get(link.evidenceId)
      /* v8 ignore next -- the preceding aggregate claim pass validates evidence existence and ordering. */
      if (evidence === undefined || Date.parse(evidence.createdAt) > observationTimestamp) {
        throw inconsistent(`observation '${observationId}' ${claimRole} claim has missing or later evidence`)
      }
      paperIds.add(evidence.paperId)
    }
    /* v8 ignore next -- the preceding aggregate claim pass requires one-paper source statements. */
    if (paperIds.size !== 1) {
      throw inconsistent(`observation '${observationId}' ${claimRole} claim lacks one-paper provenance`)
    }
    const paperId = [...paperIds][0] as ResearchPaperId
    if (expectedPaperId !== undefined && paperId !== expectedPaperId) {
      throw inconsistent(`observation '${observationId}' ${claimRole} claim comes from another paper`)
    }
    this.assertClaimActiveAtCreation(
      'observation',
      observationId,
      claimId,
      observationTimestamp,
      supersedingClaimsById.get(claimId),
    )
    return paperId
  }

  private assertEntityActiveAtCreation(
    observationId: ResearchObservationId,
    entityId: ResearchEntityId,
    observationTimestamp: number,
    successor: ResearchEntity | undefined,
  ): void {
    if (successor !== undefined && Date.parse(successor.createdAt) < observationTimestamp) {
      throw inconsistent(
        `observation '${observationId}' references entity '${entityId}' superseded before observation creation`,
      )
    }
  }

  private assertObservationActiveAtCreation(
    protocolId: ResearchComparisonProtocolId,
    observationId: ResearchObservationId,
    protocolTimestamp: number,
    successor: ResearchObservation | undefined,
  ): void {
    if (successor !== undefined && Date.parse(successor.createdAt) < protocolTimestamp) {
      throw inconsistent(
        `comparison protocol '${protocolId}' references observation '${observationId}' superseded before protocol creation`,
      )
    }
  }

  private assertObservationFreshAtCreation(
    record: ResearchQuestionRecord,
    protocol: ResearchComparisonProtocol,
    observation: ResearchObservation,
    protocolTimestamp: number,
    supersedingClaimsById: ReadonlyMap<ResearchClaimId, ResearchClaim>,
    supersedingEntitiesById: ReadonlyMap<ResearchEntityId, ResearchEntity>,
  ): void {
    const claimIds = observationClaimIds(observation)
    for (const claimId of claimIds) {
      this.assertClaimActiveAtCreation(
        'comparison protocol',
        protocol.id,
        claimId,
        protocolTimestamp,
        supersedingClaimsById.get(claimId),
      )
    }
    for (const entityId of observationEntityIds(observation)) {
      const successor = supersedingEntitiesById.get(entityId)
      if (successor !== undefined && Date.parse(successor.createdAt) < protocolTimestamp) {
        throw inconsistent(
          `comparison protocol '${protocol.id}' references observation '${observation.id}' with a superseded entity`,
        )
      }
      const entity = record.entities.find(value => value.id === entityId)
      /* v8 ignore next -- every observation entity reference is validated earlier in the same aggregate pass. */
      if (entity === undefined) {
        throw inconsistent(`comparison protocol '${protocol.id}' observation lacks entity '${entityId}'`)
      }
      for (const claimId of entity.sourceClaimIds) {
        this.assertClaimActiveAtCreation(
          'comparison protocol',
          protocol.id,
          claimId,
          protocolTimestamp,
          supersedingClaimsById.get(claimId),
        )
      }
    }
  }

  private assertOtherFacet(claim: ResearchClaim): void {
    if (claim.facet === 'other') {
      if (claim.otherFacet === undefined) throw inconsistent(`claim '${claim.id}' lacks otherFacet`)
      this.assertCanonicalText('other facet', claim.otherFacet)
    } else if (claim.otherFacet !== undefined) {
      throw inconsistent(`claim '${claim.id}' stores otherFacet for facet '${claim.facet}'`)
    }
  }

  private childTimestamp(
    record: ResearchQuestionRecord,
    subject: string,
    createdAt: string,
  ): number {
    const timestamp = Date.parse(createdAt)
    if (timestamp < Date.parse(record.createdAt)) {
      throw inconsistent(`${subject} createdAt precedes question createdAt`)
    }
    if (timestamp > Date.parse(record.updatedAt)) {
      throw inconsistent(`${subject} createdAt follows question updatedAt`)
    }
    return timestamp
  }

  private assertClaimActiveAtCreation(
    consumer: 'entity' | 'observation' | 'comparison protocol' | 'synthesis',
    consumerId:
      | ResearchEntityId
      | ResearchObservationId
      | ResearchComparisonProtocolId
      | ResearchSynthesisId,
    claimId: ResearchClaimId,
    consumerTimestamp: number,
    successor: ResearchClaim | undefined,
  ): void {
    // Cross-collection writes can share one millisecond timestamp, so equality cannot prove ordering.
    if (successor !== undefined && Date.parse(successor.createdAt) < consumerTimestamp) {
      throw inconsistent(
        `${consumer} '${consumerId}' references claim '${claimId}' superseded before ${consumer} creation`,
      )
    }
  }

  private assertCanonicalAuthor(author: ResearchAuthorship): void {
    this.assertCanonicalText('author id', String(author.id))
  }

  private assertCanonicalAuthoredText(field: string, value: string): void {
    let normalized: string
    try {
      normalized = this.normalizeAuthoredText(field, value)
    } catch (error) {
      throw inconsistent((error as Error).message)
    }
    if (normalized !== value) throw inconsistent(`${field} is not normalized`)
    if (Buffer.byteLength(value, 'utf8') > this.config.maxFieldBytes) {
      throw inconsistent(`${field} exceeds configured UTF-8 limit ${this.config.maxFieldBytes}`)
    }
  }

  private assertCanonicalText(field: string, value: string): void {
    let normalized: string
    try {
      normalized = this.normalizeText(field, value)
    } catch (error) {
      throw inconsistent((error as Error).message)
    }
    if (normalized !== value) throw inconsistent(`${field} is not normalized`)
    if (Buffer.byteLength(value, 'utf8') > this.config.maxFieldBytes) {
      throw inconsistent(`${field} exceeds configured UTF-8 limit ${this.config.maxFieldBytes}`)
    }
  }

  private exactStored(field: string, value: string, maxBytes: number): void {
    try {
      this.exactText(field, value)
    } catch (error) {
      throw inconsistent((error as Error).message)
    }
    if (Buffer.byteLength(value, 'utf8') > maxBytes) {
      throw inconsistent(`${field} exceeds configured UTF-8 limit ${maxBytes}`)
    }
  }

  private assertUnique(subject: string, values: readonly string[]): void {
    if (new Set(values).size !== values.length) throw inconsistent(`${subject} contain duplicates`)
  }

  private assertInputUnique(subject: string, values: readonly string[]): void {
    if (new Set(values).size !== values.length) {
      throw new Error(`research-information ${subject} must be unique`)
    }
  }

  private requireTable(): KvTable<ResearchQuestionId, ResearchQuestionRecord> {
    if (this.table === undefined) throw new Error('research information is not started yet')
    return this.table
  }

  private enqueueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationTail.then(operation)
    this.operationTail = result.then(() => {}, () => {})
    return result
  }
}

function staleRevision(
  record: ResearchQuestionRecord,
  expectedRevision: number,
): { readonly status: 'stale-revision'; readonly questionId: ResearchQuestionId; readonly expectedRevision: number; readonly currentRevision: number } | undefined {
  return record.revision === expectedRevision
    ? undefined
    : {
      status: 'stale-revision',
      questionId: record.id,
      expectedRevision,
      currentRevision: record.revision,
    }
}

function hasResearchContent(record: ResearchQuestionRecord): boolean {
  return record.evidence.length
    + record.claims.length
    + record.syntheses.length
    + record.readingNotes.length
    + record.entities.length
    + record.observations.length
    + record.comparisonProtocols.length > 0
}

function mutationTimestamp(record: ResearchQuestionRecord): string {
  const wallClock = new Date().toISOString()
  return Date.parse(wallClock) < Date.parse(record.updatedAt) ? record.updatedAt : wallClock
}

function sameEvidence(left: ResearchEvidence, right: CaptureResearchEvidenceRequest): boolean {
  return left.paperId === right.paperId
    && left.sourceVersionId === right.sourceVersionId
    && left.locator.documentId === right.locator.documentId
    && left.locator.blockId === right.locator.blockId
    && left.locator.parserId === right.locator.parserId
    && left.locator.parserVersion === right.locator.parserVersion
    && left.locator.pageIndex === right.locator.pageIndex
    && left.locator.pageLabel === right.locator.pageLabel
    && left.locator.quoteHash === right.locator.quoteHash
    && left.locator.bbox.x === right.locator.bbox.x
    && left.locator.bbox.y === right.locator.bbox.y
    && left.locator.bbox.width === right.locator.bbox.width
    && left.locator.bbox.height === right.locator.bbox.height
    && left.blockText === right.blockText
    && left.sectionPath.length === right.sectionPath.length
    && left.sectionPath.every((value, index) => value === right.sectionPath[index])
    && left.selection?.text === right.selection?.text
    && (left.selection?.startUtf8Byte ?? -1) === (right.selection?.startUtf8Byte ?? -1)
    && (left.selection?.endUtf8Byte ?? -1) === (right.selection?.endUtf8Byte ?? -1)
    && (left.selection?.textHash ?? '') === (right.selection?.textHash ?? '')
}

function isActiveClaim(record: ResearchQuestionRecord, claimId: ResearchClaimId): boolean {
  return !record.claims.some(value => value.supersedes === claimId)
}

function isActiveSynthesis(record: ResearchQuestionRecord, synthesisId: ResearchSynthesisId): boolean {
  return !record.syntheses.some(value => value.supersedes === synthesisId)
}

function isActiveReadingNote(
  record: ResearchQuestionRecord,
  readingNoteId: ResearchReadingNoteId,
): boolean {
  return !record.readingNotes.some(value => value.supersedes === readingNoteId)
}

function isActiveEntity(record: ResearchQuestionRecord, entityId: ResearchEntityId): boolean {
  return !record.entities.some(value => value.supersedes.includes(entityId))
}

function isActiveObservation(record: ResearchQuestionRecord, observationId: ResearchObservationId): boolean {
  return !record.observations.some(value => value.supersedes === observationId)
}

function isActiveComparisonProtocol(
  record: ResearchQuestionRecord,
  comparisonProtocolId: ResearchComparisonProtocolId,
): boolean {
  return !record.comparisonProtocols.some(value => value.supersedes === comparisonProtocolId)
}

function observationPaperId(
  record: ResearchQuestionRecord,
  observation: ResearchObservation,
): ResearchPaperId {
  const claim = record.claims.find(value => value.id === observation.resultClaimId) as ResearchClaim
  const evidenceId = claim.evidenceLinks[0]?.evidenceId as ResearchEvidenceId
  const evidence = record.evidence.find(value => value.id === evidenceId) as ResearchEvidence
  return evidence.paperId
}

function isObservationStale(record: ResearchQuestionRecord, observation: ResearchObservation): boolean {
  const claimIds = observationClaimIds(observation)
  if (claimIds.some(claimId =>
    !record.claims.some(value => value.id === claimId) || !isActiveClaim(record, claimId))) {
    return true
  }
  return observationEntityIds(observation).some((entityId) => {
    const entity = record.entities.find(value => value.id === entityId)
    return entity === undefined
      || !isActiveEntity(record, entityId)
      || entity.sourceClaimIds.some(claimId => !isActiveClaim(record, claimId))
  })
}

function observationClaimIds(observation: ResearchObservation): readonly ResearchClaimId[] {
  return [
    observation.resultClaimId,
    observation.method.sourceClaimId,
    observation.dataset.sourceClaimId,
    observation.metric.sourceClaimId,
    ...(observation.dataset.split.status === 'reported'
      ? [observation.dataset.split.sourceClaimId]
      : []),
    ...(observation.evaluationProtocol.status === 'reported'
      ? [observation.evaluationProtocol.sourceClaimId]
      : []),
    ...(observation.conditions.status === 'reported'
      ? observation.conditions.values.map(value => value.sourceClaimId)
      : []),
  ]
}

function observationEntityIds(observation: ResearchObservation): readonly ResearchEntityId[] {
  return [
    observation.method.entityId,
    observation.dataset.entityId,
    observation.metric.entityId,
  ]
}

function comparisonAlignmentFailure(
  observations: readonly [ResearchObservation, ResearchObservation, ...ResearchObservation[]],
): ComparisonAlignmentFailure | undefined {
  const first = observations[0]
  for (const observation of observations) {
    const missing = missingComparisonDimension(observation)
    if (missing !== undefined) {
      return {
        status: 'comparison-field-not-recorded',
        observationId: observation.id,
        dimension: missing,
      }
    }
  }
  for (const observation of observations.slice(1)) {
    const dimensions: readonly [ResearchComparisonDimension, string, string][] = [
      ['dataset', String(first.dataset.entityId), String(observation.dataset.entityId)],
      ['metric', String(first.metric.entityId), String(observation.metric.entityId)],
      ['dataset-split', contextSignature(first.dataset.split), contextSignature(observation.dataset.split)],
      ['unit', unitSignature(first.unit), unitSignature(observation.unit)],
      ['value-statistic', first.valueStatistic, observation.valueStatistic],
      [
        'evaluation-protocol',
        contextSignature(first.evaluationProtocol),
        contextSignature(observation.evaluationProtocol),
      ],
      [
        'must-match-conditions',
        conditionSignature(first.conditions),
        conditionSignature(observation.conditions),
      ],
    ]
    const mismatch = dimensions.find(([, left, right]) => left !== right)
    if (mismatch !== undefined) {
      return {
        status: 'comparison-dimension-mismatch',
        observationId: observation.id,
        dimension: mismatch[0],
      }
    }
  }
  return undefined
}

function missingComparisonDimension(
  observation: ResearchObservation,
): Exclude<ResearchComparisonDimension, 'dataset' | 'metric' | 'value-statistic'> | undefined {
  if (observation.dataset.split.status === 'not-recorded') return 'dataset-split'
  if (observation.unit.status === 'not-recorded') return 'unit'
  if (observation.evaluationProtocol.status === 'not-recorded') return 'evaluation-protocol'
  if (observation.conditions.status === 'not-recorded') return 'must-match-conditions'
  return undefined
}

function contextSignature(context: ResearchObservationReportedContext): string {
  return context.status === 'reported' ? `reported\u0000${context.value}` : context.status
}

function unitSignature(unit: ResearchObservationUnit): string {
  return unit.status === 'reported' ? `reported\u0000${unit.symbol}` : unit.status
}

function conditionSignature(conditions: ResearchObservationConditions): string {
  if (conditions.status !== 'reported') return conditions.status
  return `reported\u0000${conditions.values
    .filter(value => value.comparisonRole === 'must-match')
    .map(value => `${value.name}\u0000${value.value}`)
    .join('\u0001')}`
}

function uncertaintyDecimals(uncertainty: ResearchObservationUncertainty): readonly string[] {
  if (uncertainty.status !== 'reported') return []
  const value = uncertainty.value
  if ('magnitude' in value) {
    return [String(value.magnitude)]
  }
  return 'confidenceLevelPercent' in value
    ? [String(value.lower), String(value.upper), String(value.confidenceLevelPercent)]
    : [String(value.lower), String(value.upper)]
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : 1
}

function sortedStrings<T extends string>(values: Iterable<T>): readonly T[] {
  return [...values].sort((left, right) => left.localeCompare(right))
}

function deduplicateBy<T>(values: readonly T[], key: (value: T) => string): readonly T[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const identity = key(value)
    if (seen.has(identity)) return false
    seen.add(identity)
    return true
  })
}

function positiveSafeInteger(field: string, value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`research-information ${field} must be a positive safe integer`)
  }
  return value
}

function nonNegativeSafeInteger(field: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`research-information ${field} must be a non-negative safe integer`)
  }
  return value
}

function minimumSafeInteger(field: string, value: number, minimum: number): number {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`research-information ${field} must be a safe integer at least ${minimum}`)
  }
  return value
}

function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function inconsistent(detail: string): Error {
  return new Error(`research-information stored state is inconsistent: ${detail}`)
}

export default ResearchInformation
