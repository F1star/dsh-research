/**
 * Durable questions, evidence, reading notes, claims, normalized entities, observations,
 * comparison protocols, and cited synthesis.
 * @module @deepseek-ai/dsh-research-information
 */
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { CaptureResearchEvidenceRequest, CaptureResearchEvidenceResult, ResearchAuthorId as ResearchAuthorIdBrand, ResearchObservationState, ReviewResearchObservationRequest, ReviewResearchObservationResult, ReviewResearchClaimRequest, ReviewResearchClaimResult, ResearchClaimId as ResearchClaimIdBrand, ResearchComparisonProtocolId as ResearchComparisonProtocolIdBrand, ResearchDecimal as ResearchDecimalBrand, ResearchEvidenceId as ResearchEvidenceIdBrand, ResearchEvidenceTextHash as ResearchEvidenceTextHashBrand, ResearchEntityId as ResearchEntityIdBrand, ResearchFindingId as ResearchFindingIdBrand, ResearchObservation, ResearchObservationId as ResearchObservationIdBrand, ResearchReadingNoteId as ResearchReadingNoteIdBrand, ResearchQuestionId as ResearchQuestionIdBrand, ResearchQuestionRecord, ResearchSynthesisId as ResearchSynthesisIdBrand, WriteResearchClaimRequest, WriteResearchClaimResult, WriteResearchComparisonProtocolRequest, WriteResearchComparisonProtocolResult, WriteResearchEntityRequest, WriteResearchEntityResult, WriteResearchObservationRequest, WriteResearchObservationResult, WriteResearchQuestionRequest, WriteResearchQuestionResult, WriteResearchReadingNoteRequest, WriteResearchReadingNoteResult, WriteResearchSynthesisRequest, WriteResearchSynthesisResult } from './types.ts';
export type { CaptureResearchEvidenceRequest, CaptureResearchEvidenceResult, ResearchAuthorship, ResearchClaim, ResearchClaimReview, ResearchClaimReviewDecision, ResearchClaimReviewId, ResearchReviewAssessment, ResearchObservationReview, ResearchObservationReviewDecision, ResearchObservationReviewId, ResearchObservationState, ReviewResearchObservationRequest, ReviewResearchObservationResult, ReviewResearchClaimRequest, ReviewResearchClaimResult, ResearchClaimEvidenceLink, ResearchClaimReferenceFailure, ResearchEvidence, ResearchEvidenceProvenanceMismatch, ResearchEvidenceRelation, ResearchEvidenceSelection, ResearchEntity, ResearchEntityKind, ResearchEntityReferenceFailure, ResearchFacet, ResearchFinding, ResearchFindingInput, ResearchFindingKind, ResearchFindingStance, ResearchInformationCapacity, ResearchComparisonDimension, ResearchComparisonDirection, ResearchComparisonProtocol, ResearchComparisonProtocolReferenceFailure, ResearchMethodRole, ResearchObservation, ResearchObservationClaimRole, ResearchObservationCondition, ResearchObservationConditionRole, ResearchObservationConditions, ResearchObservationDataset, ResearchObservationEntityReference, ResearchObservationEntityRole, ResearchObservationMethod, ResearchObservationReferenceFailure, ResearchObservationReportedContext, ResearchObservationUncertainty, ResearchObservationUnit, ResearchReportedUncertainty, ResearchReadingNote, ResearchReadingNoteReferenceFailure, ResearchQuestionMutationFailure, ResearchQuestionRecord, ResearchSynthesis, ResearchSynthesisReferenceFailure, WriteResearchClaimRequest, WriteResearchClaimResult, WriteResearchComparisonProtocolRequest, WriteResearchComparisonProtocolResult, WriteResearchEntityRequest, WriteResearchEntityResult, WriteResearchObservationRequest, WriteResearchObservationResult, WriteResearchQuestionRequest, WriteResearchQuestionResult, WriteResearchReadingNoteRequest, WriteResearchReadingNoteResult, WriteResearchSynthesisRequest, WriteResearchSynthesisResult, } from './types.ts';
export { researchInformationDomainSpec, researchQuestionRecord } from './spec.ts';
/** Stable identity of one durable research-question aggregate. */
export type ResearchQuestionId = ResearchQuestionIdBrand;
/**
 * Brand a validated or generated research-question id.
 * @param value - Raw research-question id string.
 * @returns the same string with its research-question-id brand.
 */
export declare function ResearchQuestionId(value: string): ResearchQuestionId;
/** Stable identity of one immutable evidence record. */
export type ResearchEvidenceId = ResearchEvidenceIdBrand;
/**
 * Brand a validated or generated evidence id.
 * @param value - Raw evidence id string.
 * @returns the same string with its evidence-id brand.
 */
export declare function ResearchEvidenceId(value: string): ResearchEvidenceId;
/** Stable identity of one immutable claim. */
export type ResearchClaimId = ResearchClaimIdBrand;
/**
 * Brand a validated or generated claim id.
 * @param value - Raw claim id string.
 * @returns the same string with its claim-id brand.
 */
export declare function ResearchClaimId(value: string): ResearchClaimId;
/** Stable identity of one immutable synthesis. */
export type ResearchSynthesisId = ResearchSynthesisIdBrand;
/**
 * Brand a validated or generated synthesis id.
 * @param value - Raw synthesis id string.
 * @returns the same string with its synthesis-id brand.
 */
export declare function ResearchSynthesisId(value: string): ResearchSynthesisId;
/** Stable identity of one synthesis finding. */
export type ResearchFindingId = ResearchFindingIdBrand;
/**
 * Brand a validated or generated finding id.
 * @param value - Raw finding id string.
 * @returns the same string with its finding-id brand.
 */
export declare function ResearchFindingId(value: string): ResearchFindingId;
/** Stable identity of one immutable reading note. */
export type ResearchReadingNoteId = ResearchReadingNoteIdBrand;
/**
 * Brand a validated or generated reading-note id.
 * @param value - Raw reading-note id string.
 * @returns the same string with its reading-note-id brand.
 */
export declare function ResearchReadingNoteId(value: string): ResearchReadingNoteId;
/** Stable identity of one immutable normalized research entity. */
export type ResearchEntityId = ResearchEntityIdBrand;
/**
 * Brand a validated or generated research-entity id.
 * @param value - Raw research-entity id string.
 * @returns the same string with its research-entity-id brand.
 */
export declare function ResearchEntityId(value: string): ResearchEntityId;
/** Stable identity of one immutable normalized metric observation. */
export type ResearchObservationId = ResearchObservationIdBrand;
/**
 * Brand a validated or generated observation id.
 * @param value - Raw observation id string.
 * @returns the same string with its observation-id brand.
 */
export declare function ResearchObservationId(value: string): ResearchObservationId;
/** Stable identity of one immutable authored comparison protocol. */
export type ResearchComparisonProtocolId = ResearchComparisonProtocolIdBrand;
/**
 * Brand a validated or generated comparison-protocol id.
 * @param value - Raw comparison-protocol id string.
 * @returns the same string with its comparison-protocol-id brand.
 */
export declare function ResearchComparisonProtocolId(value: string): ResearchComparisonProtocolId;
/** Opaque identity of an author supplied by a trusted Consumer. */
export type ResearchAuthorId = ResearchAuthorIdBrand;
/**
 * Brand a validated author id.
 * @param value - Raw trusted author id string.
 * @returns the same string with its research-author-id brand.
 */
export declare function ResearchAuthorId(value: string): ResearchAuthorId;
/** SHA-256 identity of exact selected evidence text. */
export type ResearchEvidenceTextHash = ResearchEvidenceTextHashBrand;
/**
 * Brand a validated selected-text hash.
 * @param value - Raw selected-text hash string.
 * @returns the same string with its selected-text-hash brand.
 */
export declare function ResearchEvidenceTextHash(value: string): ResearchEvidenceTextHash;
/** Canonical finite base-ten value retained without binary floating-point loss. */
export type ResearchDecimal = ResearchDecimalBrand;
/**
 * Brand a value already canonicalized by the research-information service.
 * @param value - Canonical finite base-ten value.
 * @returns the same string with its research-decimal brand.
 */
export declare function ResearchDecimal(value: string): ResearchDecimal;
declare module '@deepseek-ai/cordis' {
    interface Context {
        researchInformation: ResearchInformation;
    }
}
/** Default maximum durable research questions in one profile. */
export declare const DEFAULT_MAX_QUESTIONS = 1000;
/** Default maximum captured evidence records per question. */
export declare const DEFAULT_MAX_EVIDENCE_PER_QUESTION = 10000;
/** Default maximum claims per question. */
export declare const DEFAULT_MAX_CLAIMS_PER_QUESTION = 10000;
/** Default maximum researcher decisions per question. */
export declare const DEFAULT_MAX_CLAIM_REVIEWS_PER_QUESTION = 10000;
/** Default maximum synthesis records per question. */
export declare const DEFAULT_MAX_SYNTHESES_PER_QUESTION = 1000;
/** Default maximum findings in one synthesis. */
export declare const DEFAULT_MAX_FINDINGS_PER_SYNTHESIS = 256;
/** Default maximum evidence links on one claim. */
export declare const DEFAULT_MAX_EVIDENCE_LINKS_PER_CLAIM = 64;
/** Default maximum claim references on one finding. */
export declare const DEFAULT_MAX_CLAIM_REFERENCES_PER_FINDING = 256;
/** Default maximum comparison-protocol references on one finding. */
export declare const DEFAULT_MAX_COMPARISON_PROTOCOL_REFERENCES_PER_FINDING = 64;
/** Default maximum reading notes per question. */
export declare const DEFAULT_MAX_READING_NOTES_PER_QUESTION = 10000;
/** Default maximum normalized entities per question. */
export declare const DEFAULT_MAX_ENTITIES_PER_QUESTION = 10000;
/** Default maximum source-claim references on one normalized entity. */
export declare const DEFAULT_MAX_CLAIM_REFERENCES_PER_ENTITY = 256;
/** Default maximum predecessor entities retired by one normalized entity. */
export declare const DEFAULT_MAX_SUPERSEDED_ENTITIES_PER_ENTITY = 64;
/** Default maximum normalized observations per question. */
export declare const DEFAULT_MAX_OBSERVATIONS_PER_QUESTION = 10000;
/** Default maximum immutable observation assessments per question. */
export declare const DEFAULT_MAX_OBSERVATION_REVIEWS_PER_QUESTION = 10000;
/** Default maximum counterevidence references on one observation assessment. */
export declare const DEFAULT_MAX_COUNTER_EVIDENCE_PER_OBSERVATION_REVIEW = 64;
/** Default maximum reported conditions on one observation. */
export declare const DEFAULT_MAX_CONDITIONS_PER_OBSERVATION = 64;
/** Default maximum authored comparison protocols per question. */
export declare const DEFAULT_MAX_COMPARISON_PROTOCOLS_PER_QUESTION = 1000;
/** Default maximum observation references on one comparison protocol. */
export declare const DEFAULT_MAX_OBSERVATION_REFERENCES_PER_PROTOCOL = 256;
/** Default UTF-8 limit for one size-limited text or decimal field. */
export declare const DEFAULT_MAX_FIELD_BYTES = 16384;
/** Default UTF-8 limit for one complete captured block. */
export declare const DEFAULT_MAX_BLOCK_BYTES = 65536;
/** Default encoded JSON limit for one complete question aggregate. */
export declare const DEFAULT_MAX_AGGREGATE_BYTES = 33554432;
/** Durable structured-research capacity and text policy. */
export interface Config {
    /** Maximum durable questions in one profile. Defaults to 1000. */
    readonly maxQuestions?: number;
    /** Maximum captured evidence items per question. Defaults to 10000. */
    readonly maxEvidencePerQuestion?: number;
    /** Maximum immutable claims per question. Defaults to 10000. */
    readonly maxClaimsPerQuestion?: number;
    /** Maximum immutable researcher decisions per question. Defaults to 10000. */
    readonly maxClaimReviewsPerQuestion?: number;
    /** Maximum immutable syntheses per question. Defaults to 1000. */
    readonly maxSynthesesPerQuestion?: number;
    /** Maximum findings in one synthesis. Defaults to 256. */
    readonly maxFindingsPerSynthesis?: number;
    /** Maximum evidence relations on one claim. Defaults to 64. */
    readonly maxEvidenceLinksPerClaim?: number;
    /** Maximum claim references on one finding. Defaults to 256. */
    readonly maxClaimReferencesPerFinding?: number;
    /** Maximum comparison-protocol references on one finding. Defaults to 64. */
    readonly maxComparisonProtocolReferencesPerFinding?: number;
    /** Maximum immutable reading notes per question. Defaults to 10000. */
    readonly maxReadingNotesPerQuestion?: number;
    /** Maximum immutable normalized entities per question. Defaults to 10000. */
    readonly maxEntitiesPerQuestion?: number;
    /** Maximum source-claim references on one entity. Defaults to 256. */
    readonly maxClaimReferencesPerEntity?: number;
    /** Maximum predecessor entities retired by one entity. Defaults to 64. */
    readonly maxSupersededEntitiesPerEntity?: number;
    /** Maximum immutable normalized observations per question. Defaults to 10000. */
    readonly maxObservationsPerQuestion?: number;
    /** Maximum immutable researcher observation assessments per question. Defaults to 10000. */
    readonly maxObservationReviewsPerQuestion?: number;
    /** Maximum counterevidence references per observation assessment. Defaults to 64. */
    readonly maxCounterEvidencePerObservationReview?: number;
    /** Maximum reported conditions on one observation. Defaults to 64. */
    readonly maxConditionsPerObservation?: number;
    /** Maximum immutable comparison protocols per question. Defaults to 1000. */
    readonly maxComparisonProtocolsPerQuestion?: number;
    /** Maximum observation references on one comparison protocol. Defaults to 256. */
    readonly maxObservationReferencesPerProtocol?: number;
    /** Maximum UTF-8 bytes in each size-limited text or decimal field. Defaults to 16384. */
    readonly maxFieldBytes?: number;
    /** Maximum UTF-8 bytes in one exact captured block. Defaults to 65536. */
    readonly maxBlockBytes?: number;
    /** Maximum UTF-8 bytes in one encoded question aggregate. Defaults to 33554432. */
    readonly maxAggregateBytes?: number;
}
/**
 * Profile-local durable research-information service. Every question owns its
 * evidence, reading notes, claims, normalized entities, observations, comparison protocols,
 * and synthesis references in one atomically written row.
 */
export declare class ResearchInformation extends Service {
    static inject: string[];
    /** Loader schema for durable research-information limits. */
    static Config: z<Config>;
    private table?;
    private readonly config;
    private operationTail;
    constructor(ctx: Context, config?: Config);
    /** Open the storage domain and reject malformed cross-record relations. */
    protected [Service.init](): Promise<void>;
    /**
     * Create a research question or compare-and-set its framing. Question text
     * becomes immutable after the aggregate receives research content.
     * @param request - Creation fields or an exact revision update.
     * @returns the committed aggregate or an explicit non-writing result.
     * @throws Synchronously when text is empty or update fields or revision are invalid.
     */
    writeQuestion(request: WriteResearchQuestionRequest): Promise<WriteResearchQuestionResult>;
    /**
     * Capture immutable exact evidence after checking its durable paper, source,
     * parser-observation, and text-hash relations.
     * @param request - Runtime-derived block evidence and aggregate revision.
     * @returns the committed aggregate, an idempotent match, or a non-writing failure.
     * @throws Synchronously when exact text is empty or the revision or offsets are invalid.
     */
    captureEvidence(request: CaptureResearchEvidenceRequest): Promise<CaptureResearchEvidenceResult>;
    /**
     * Append an immutable note or passage question anchored to captured evidence.
     * @param request - Note text, evidence reference, authorship, and aggregate revision.
     * @returns the committed aggregate or an explicit non-writing failure.
     * @throws Synchronously when text is empty or the revision is invalid.
     */
    writeReadingNote(request: WriteResearchReadingNoteRequest): Promise<WriteResearchReadingNoteResult>;
    /**
     * Append an immutable source statement or inference to one question.
     * @param request - Claim text, evidence relations, authorship, and revision.
     * @returns the committed aggregate or an explicit non-writing failure.
     * @throws Synchronously when text is empty, facet fields conflict, or the revision is invalid.
     */
    writeClaim(request: WriteResearchClaimRequest): Promise<WriteResearchClaimResult>;
    /**
     * Record a researcher assessment, atomically appending a replacement for a revision.
     * @param request - trusted authorship, current revision, assessment, and optional replacement.
     * @returns the committed review or an explicit refusal without writing; agent authors are refused.
     */
    reviewClaim(request: ReviewResearchClaimRequest): Promise<ReviewResearchClaimResult>;
    /**
     * Append an immutable authored normalization and optionally merge active same-kind entity lineages.
     * @param request - Entity name, kind, source-claim references, authorship, and revision.
     * @returns the committed aggregate or an explicit non-writing failure.
     * @throws Synchronously when the name or references are empty or the revision is invalid.
     */
    writeEntity(request: WriteResearchEntityRequest): Promise<WriteResearchEntityResult>;
    /**
     * Append one immutable paper-local normalized metric observation.
     * @param request - Source and entity references, normalized value fields, authorship, and revision.
     * @returns the committed aggregate or an explicit non-writing failure.
     * @throws Synchronously when a normalized field combination or decimal value is invalid.
     */
    writeObservation(request: WriteResearchObservationRequest): Promise<WriteResearchObservationResult>;
    /**
     * Assess one active normalized result; a revised result and its approval share one atomic write.
     * @param request - researcher identity, current question revision, assessment, and optional complete replacement.
     * @returns committed history or a refusal without changing either the observation or its reviews.
     */
    reviewObservation(request: ReviewResearchObservationRequest): Promise<ReviewResearchObservationResult>;
    /**
     * Append an authored compatibility decision over cross-paper observations.
     * @param request - Observation members, comparison direction, rationale, authorship, and revision.
     * @returns the committed aggregate or an explicit non-writing failure.
     * @throws Synchronously when fewer than two distinct observations or empty rationale are supplied.
     */
    writeComparisonProtocol(request: WriteResearchComparisonProtocolRequest): Promise<WriteResearchComparisonProtocolResult>;
    /**
     * Append an immutable synthesis whose findings cite active claims and explicit comparison bases.
     * @param request - Structured findings, optional comparison protocols, authorship, and revision.
     * @returns the committed aggregate or an explicit non-writing failure.
     * @throws Synchronously when findings or their text are empty or the revision is invalid.
     */
    writeSynthesis(request: WriteResearchSynthesisRequest): Promise<WriteResearchSynthesisResult>;
    /**
     * Read one research question from the authoritative domain table.
     * @param questionId - Stable research-question id.
     * @returns the durable aggregate, or `undefined` when absent.
     */
    get(questionId: ResearchQuestionId): ResearchQuestionRecord | undefined;
    /**
     * Return every question in stable creation/id order.
     * @returns all durable research-question aggregates.
     */
    list(): readonly ResearchQuestionRecord[];
    private writeQuestionNow;
    private captureEvidenceNow;
    private writeReadingNoteNow;
    private writeClaimNow;
    private prepareClaim;
    private reviewClaimNow;
    private reviewObservationNow;
    private writeEntityNow;
    private writeObservationNow;
    private prepareObservation;
    private writeComparisonProtocolNow;
    private writeSynthesisNow;
    private normalizeQuestionWrite;
    private normalizeEvidenceRequest;
    private normalizeClaimRequest;
    private normalizeReviewAssessment;
    private normalizeReviewRequest;
    private normalizeReadingNoteRequest;
    private normalizeEntityRequest;
    private normalizeObservationRequest;
    private normalizeComparisonProtocolRequest;
    private normalizeObservationContext;
    private normalizeObservationConditions;
    private normalizeObservationUncertainty;
    private normalizeDecimal;
    private normalizeSynthesisRequest;
    private normalizeFinding;
    private normalizeSelection;
    private normalizeAuthor;
    private validateEvidenceProvenance;
    private validateObservationClaim;
    private validateObservationEntityReference;
    private aggregateCapacity;
    private aggregateBytes;
    private normalizeText;
    private normalizeAuthoredText;
    private exactText;
    private fieldCapacity;
    private validateReviewHistory;
    private validateStoredReviews;
    private validateStoredObservationReviews;
    private validateStoredState;
    private validateStoredRecord;
    private assertCanonicalStoredObservation;
    private assertObservationClaimAtCreation;
    private assertEntityActiveAtCreation;
    private assertObservationActiveAtCreation;
    private assertObservationFreshAtCreation;
    private assertOtherFacet;
    private childTimestamp;
    private assertClaimActiveAtCreation;
    private assertCanonicalAuthor;
    private assertCanonicalAuthoredText;
    private assertCanonicalText;
    private exactStored;
    private assertUnique;
    private assertInputUnique;
    private requireTable;
    private enqueueOperation;
}
/**
 * Project current source validity and the latest researcher assessment of one observation.
 * @param record - complete question containing the observation and its immutable review history.
 * @param observation - one observation from that question.
 * @returns structural currency, latest decision, and rejected supporting claims; none implies scientific truth.
 */
export declare function researchObservationState(record: ResearchQuestionRecord, observation: ResearchObservation): ResearchObservationState;
export default ResearchInformation;
//# sourceMappingURL=index.d.ts.map