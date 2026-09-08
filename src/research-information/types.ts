/**
 * Public durable research-information data and operation results.
 * @module @deepseek-ai/dsh-research-information/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type { ResearchDocumentBlockLocator } from '../research-document/types.ts'
import type {
  ResearchPaperId,
  ResearchSourceVersionId,
} from '../research-library/types.ts'

/** Stable identity of one research question aggregate. */
export type ResearchQuestionId = Branded<'ResearchQuestionId'>
/** Stable identity of one immutable captured evidence item. */
export type ResearchEvidenceId = Branded<'ResearchEvidenceId'>
/** Stable identity of one immutable research claim. */
export type ResearchClaimId = Branded<'ResearchClaimId'>
/** Stable identity of one immutable researcher assessment. */
export type ResearchClaimReviewId = Branded<'ResearchClaimReviewId'>
/** Stable identity of one immutable researcher assessment of a numeric observation. */
export type ResearchObservationReviewId = Branded<'ResearchObservationReviewId'>
/** Stable identity of one immutable synthesis. */
export type ResearchSynthesisId = Branded<'ResearchSynthesisId'>
/** Stable identity of one finding inside a synthesis. */
export type ResearchFindingId = Branded<'ResearchFindingId'>
/** Stable identity of one immutable reading note. */
export type ResearchReadingNoteId = Branded<'ResearchReadingNoteId'>
/** Stable identity of one immutable normalized research entity. */
export type ResearchEntityId = Branded<'ResearchEntityId'>
/** Stable identity of one immutable normalized metric observation. */
export type ResearchObservationId = Branded<'ResearchObservationId'>
/** Stable identity of one immutable authored comparison protocol. */
export type ResearchComparisonProtocolId = Branded<'ResearchComparisonProtocolId'>
/** Opaque author identity supplied by a trusted Consumer. */
export type ResearchAuthorId = Branded<'ResearchAuthorId'>
/** SHA-256 identity of exact selected UTF-8 evidence text. */
export type ResearchEvidenceTextHash = Branded<'ResearchEvidenceTextHash'>
/** Canonical finite base-ten value retained without binary floating-point loss. */
export type ResearchDecimal = Branded<'ResearchDecimal'>

/** Researcher or agent responsible for one durable mutation. */
export interface ResearchAuthorship {
  readonly kind: 'researcher' | 'agent'
  readonly id: ResearchAuthorId
}

/** Researcher's assessment of the cited evidence, independent of publication truth. */
export type ResearchEvidenceSupport = 'supports' | 'partial' | 'unsupported' | 'uncertain'

/** Human decision over a claim; a revision assesses and approves the replacement. */
export type ResearchClaimReviewDecision =
  | { readonly decision: 'accepted' | 'rejected' }
  | { readonly decision: 'revised'; readonly replacementClaimId: ResearchClaimId }

/** Evidence-support assessment and authorship shared by researcher decisions. */
export interface ResearchReviewAssessment {
  readonly evidenceSupport: ResearchEvidenceSupport
  readonly rationale: string
  readonly qualifications?: string | undefined
  readonly counterEvidenceIds: readonly ResearchEvidenceId[]
  /** Aggregate revision committed with this review; orders decisions even at equal timestamps. */
  readonly questionRevision: number
  readonly createdBy: ResearchAuthorship
  readonly createdAt: string
}

/** Immutable assessment history; later decisions do not erase earlier authorship or reasons. */
export type ResearchClaimReview = ResearchClaimReviewDecision & ResearchReviewAssessment & {
  readonly id: ResearchClaimReviewId
  readonly claimId: ResearchClaimId
}

/** A revision approves its replacement observation while preserving the original record. */
export type ResearchObservationReviewDecision =
  | { readonly decision: 'accepted' | 'rejected' }
  | { readonly decision: 'revised'; readonly replacementObservationId: ResearchObservationId }

/** Immutable researcher assessment of one paper-local numeric result and its recorded conditions. */
export type ResearchObservationReview = ResearchObservationReviewDecision & ResearchReviewAssessment & {
  readonly id: ResearchObservationReviewId
  readonly observationId: ResearchObservationId
}

/** Current structural and researcher assessment state; approval does not erase later source rejection. */
export interface ResearchObservationState {
  readonly active: boolean
  readonly stale: boolean
  readonly review: ResearchObservationReview | null
  readonly rejectedClaimIds: readonly ResearchClaimId[]
}

/** Review one active observation; a revision supplies all replacement values and source references. */
export type ReviewResearchObservationRequest = Pick<ReviewResearchClaimRequest,
  'questionId' | 'expectedRevision' | 'evidenceSupport' | 'rationale' | 'qualifications' | 'counterEvidenceIds' | 'author'
> & { readonly observationId: ResearchObservationId } & (
  | { readonly decision: 'accepted' | 'rejected' }
  | {
    readonly decision: 'revised'
    readonly replacement: Omit<WriteResearchObservationRequest, 'questionId' | 'expectedRevision' | 'supersedes' | 'author'>
  }
)

/** Observation and review commit atomically; every refusal leaves both histories unchanged. */
export type ReviewResearchObservationResult =
  | { readonly status: 'created'; readonly question: ResearchQuestionRecord; readonly reviewId: ResearchObservationReviewId }
  | ResearchQuestionMutationFailure
  | ResearchObservationReferenceFailure
  | { readonly status: 'researcher-required' }
  | { readonly status: 'evidence-not-found'; readonly evidenceId: ResearchEvidenceId }
  | { readonly status: 'observation-not-found' | 'observation-inactive' | 'observation-stale'; readonly observationId: ResearchObservationId }
  | { readonly status: 'observation-rejected-claim'; readonly claimId: ResearchClaimId }

/** Append a researcher decision; revisions preserve the target's kind and facet. */
export type ReviewResearchClaimRequest = {
  readonly questionId: ResearchQuestionId
  readonly expectedRevision: number
  readonly claimId: ResearchClaimId
  readonly evidenceSupport: ResearchEvidenceSupport
  readonly rationale: string
  readonly qualifications?: string
  readonly counterEvidenceIds: readonly ResearchEvidenceId[]
  /** Trusted Consumers supply authorship; the executor rejects agent authors. */
  readonly author: ResearchAuthorship
} & (
  | { readonly decision: 'accepted' | 'rejected' }
  | {
    readonly decision: 'revised'
    readonly replacement: {
      readonly text: string
      readonly evidenceLinks: readonly ResearchClaimEvidenceLink[]
    }
  }
)

/** A review and any replacement commit together, or leave the aggregate unchanged. */
export type ReviewResearchClaimResult =
  | { readonly status: 'created'; readonly question: ResearchQuestionRecord; readonly reviewId: ResearchClaimReviewId }
  | ResearchQuestionMutationFailure
  | ResearchClaimReferenceFailure
  | { readonly status: 'researcher-required' }
  | { readonly status: 'claim-not-found' | 'claim-inactive'; readonly claimId: ResearchClaimId }

/** Closed comparison facet shared by source statements and inferences. */
export type ResearchFacet =
  | 'aim'
  | 'method'
  | 'dataset'
  | 'metric'
  | 'result'
  | 'limitation'
  | 'validity-threat'
  | 'other'

/** Optional exact subrange of the complete captured block text. */
export interface ResearchEvidenceSelection {
  readonly text: string
  /** Inclusive UTF-8 byte offset inside {@link ResearchEvidence.blockText}. */
  readonly startUtf8Byte: number
  /** Exclusive UTF-8 byte offset inside {@link ResearchEvidence.blockText}. */
  readonly endUtf8Byte: number
  readonly textHash: ResearchEvidenceTextHash
}

/** Immutable whole-block evidence with optional uniquely selected exact text. */
export interface ResearchEvidence {
  readonly id: ResearchEvidenceId
  readonly paperId: ResearchPaperId
  readonly sourceVersionId: ResearchSourceVersionId
  readonly locator: ResearchDocumentBlockLocator
  /** Complete untruncated block text whose hash is carried by `locator`. */
  readonly blockText: string
  readonly sectionPath: readonly string[]
  readonly selection?: ResearchEvidenceSelection | undefined
  readonly createdBy: ResearchAuthorship
  readonly createdAt: string
}

/** How exact evidence bears on a claim. */
export type ResearchEvidenceRelation = 'supports' | 'contradicts' | 'qualifies' | 'background'

/** One claim-to-evidence relation retained without combining its stance. */
export interface ResearchClaimEvidenceLink {
  readonly evidenceId: ResearchEvidenceId
  readonly relation: ResearchEvidenceRelation
}

/** Immutable source statement or agent inference. */
export interface ResearchClaim {
  readonly id: ResearchClaimId
  readonly kind: 'source-statement' | 'inference'
  readonly facet: ResearchFacet
  /** Required exactly when `facet` is `other`. */
  readonly otherFacet?: string | undefined
  readonly text: string
  /** Required on source statements; inferences may remain explicitly uncited. */
  readonly evidenceLinks: readonly ResearchClaimEvidenceLink[]
  /** Replaces one active claim of the same `kind`; the earlier claim remains durable. */
  readonly supersedes?: ResearchClaimId | undefined
  readonly createdBy: ResearchAuthorship
  readonly createdAt: string
}

/** Whether a synthesis finding reports sources or an authored inference. */
export type ResearchFindingKind = 'source-summary' | 'inference'

/** Cross-paper relation preserved by one synthesis finding. */
export type ResearchFindingStance = 'agreement' | 'conflict' | 'qualification' | 'open-question'

/** One independently citeable finding inside an immutable synthesis. */
export interface ResearchFinding {
  readonly id: ResearchFindingId
  readonly kind: ResearchFindingKind
  readonly stance: ResearchFindingStance
  readonly text: string
  /** Active claims used by this finding; source summaries require evidence-backed source statements. */
  readonly claimIds: readonly ResearchClaimId[]
  /** Active, non-stale authored protocols used as the comparison basis for an inference. */
  readonly comparisonProtocolIds: readonly ResearchComparisonProtocolId[]
}

/** Immutable cross-paper synthesis over claims from one research question. */
export interface ResearchSynthesis {
  readonly id: ResearchSynthesisId
  readonly findings: readonly ResearchFinding[]
  /** Replaces one active synthesis; the earlier synthesis remains durable. */
  readonly supersedes?: ResearchSynthesisId | undefined
  readonly createdBy: ResearchAuthorship
  readonly createdAt: string
}

/** Immutable evidence-anchored note or question raised while reading. */
export interface ResearchReadingNote {
  readonly id: ResearchReadingNoteId
  readonly kind: 'note' | 'passage-question'
  readonly text: string
  readonly evidenceId: ResearchEvidenceId
  /** Replaces one active note of the same kind; the earlier note remains durable. */
  readonly supersedes?: ResearchReadingNoteId | undefined
  readonly createdBy: ResearchAuthorship
  readonly createdAt: string
}

/** Closed normalized entity kinds used for cross-paper comparison. */
export type ResearchEntityKind = 'method' | 'dataset' | 'metric'

/**
 * Immutable authored normalization that groups evidence-backed source claims.
 * The canonical name is an interpretation supplied by its author, not source text.
 */
export interface ResearchEntity {
  readonly id: ResearchEntityId
  readonly kind: ResearchEntityKind
  readonly canonicalName: string
  /** Active evidence-backed source statements when written; historical references remain durable. */
  readonly sourceClaimIds: readonly ResearchClaimId[]
  /** Active same-kind entities retired by this entity; empty for a new lineage. */
  readonly supersedes: readonly ResearchEntityId[]
  readonly createdBy: ResearchAuthorship
  readonly createdAt: string
}

/** One paper-local source claim selected from a normalized entity. */
export interface ResearchObservationEntityReference {
  readonly entityId: ResearchEntityId
  readonly sourceClaimId: ResearchClaimId
}

/** Unit state for one normalized point estimate. */
export type ResearchObservationUnit =
  | { readonly status: 'reported'; readonly symbol: string }
  /** The metric is dimensionless, rather than missing a known unit. */
  | { readonly status: 'not-applicable' }
  /** The harness has not retained a unit; this does not assert that the paper omitted it. */
  | { readonly status: 'not-recorded' }

/** Source-backed evaluation context, or an explicit retained-state distinction. */
export type ResearchObservationReportedContext =
  | {
    readonly status: 'reported'
    readonly value: string
    readonly sourceClaimId: ResearchClaimId
  }
  | { readonly status: 'not-applicable' }
  /** The harness has not retained this context; this does not assert source-level absence. */
  | { readonly status: 'not-recorded' }

/** Whether one recorded condition must align before observations enter one protocol. */
export type ResearchObservationConditionRole = 'must-match' | 'descriptive'

/** One source-backed experimental condition retained on an observation. */
export interface ResearchObservationCondition {
  readonly name: string
  readonly value: string
  readonly sourceClaimId: ResearchClaimId
  readonly comparisonRole: ResearchObservationConditionRole
}

/** Retained-state distinction for an observation's experimental conditions. */
export type ResearchObservationConditions =
  | { readonly status: 'reported'; readonly values: readonly ResearchObservationCondition[] }
  | { readonly status: 'not-applicable' }
  /** The harness has not retained the comparison-relevant conditions. */
  | { readonly status: 'not-recorded' }

/** Source-reported uncertainty normalized into the observation's unit. */
export type ResearchReportedUncertainty =
  | {
    readonly kind: 'standard-deviation' | 'standard-error' | 'unspecified-plus-minus'
    readonly magnitude: ResearchDecimal
  }
  | {
    readonly kind: 'confidence-interval'
    readonly lower: ResearchDecimal
    readonly upper: ResearchDecimal
    readonly confidenceLevelPercent: ResearchDecimal
  }
  | {
    readonly kind: 'range'
    readonly lower: ResearchDecimal
    readonly upper: ResearchDecimal
  }

/** Retained-state distinction for uncertainty around one point estimate. */
export type ResearchObservationUncertainty =
  | { readonly status: 'reported'; readonly value: ResearchReportedUncertainty }
  | { readonly status: 'not-applicable' }
  /** The harness has not retained uncertainty; this never means zero uncertainty. */
  | { readonly status: 'not-recorded' }

/** Authored role of the evaluated method in its paper. */
export type ResearchMethodRole = 'proposed' | 'baseline' | 'other'

/** Method reference and its authored paper-local role. */
export interface ResearchObservationMethod extends ResearchObservationEntityReference {
  readonly role: ResearchMethodRole
  /** Required exactly when `role` is `other`. */
  readonly otherRole?: string | undefined
}

/** Dataset reference and the source-backed split used for the result. */
export interface ResearchObservationDataset extends ResearchObservationEntityReference {
  readonly split: ResearchObservationReportedContext
}

/**
 * Immutable authored normalization of one paper-local numeric result.
 * Exact source wording remains on its claims; this record does not establish cross-paper comparability.
 */
export interface ResearchObservation {
  readonly id: ResearchObservationId
  readonly resultClaimId: ResearchClaimId
  readonly method: ResearchObservationMethod
  readonly dataset: ResearchObservationDataset
  readonly metric: ResearchObservationEntityReference
  readonly value: ResearchDecimal
  readonly unit: ResearchObservationUnit
  /** Authored normalized statistic, such as a mean over five runs or one reported score. */
  readonly valueStatistic: string
  readonly evaluationProtocol: ResearchObservationReportedContext
  readonly uncertainty: ResearchObservationUncertainty
  readonly conditions: ResearchObservationConditions
  /** Replaces one active observation from the same paper; the earlier record remains durable. */
  readonly supersedes?: ResearchObservationId | undefined
  readonly createdBy: ResearchAuthorship
  readonly createdAt: string
}

/** Whether an explicit protocol authorizes directional point-estimate ordering. */
export type ResearchComparisonDirection =
  | 'higher-is-better'
  | 'lower-is-better'
  | 'non-directional'

/**
 * Immutable authored compatibility decision over normalized observations.
 * It does not establish statistical significance or source-authored agreement.
 */
export interface ResearchComparisonProtocol {
  readonly id: ResearchComparisonProtocolId
  readonly observationIds: readonly ResearchObservationId[]
  readonly direction: ResearchComparisonDirection
  readonly referenceObservationId?: ResearchObservationId | undefined
  readonly compatibilityRationale: string
  readonly supersedes?: ResearchComparisonProtocolId | undefined
  readonly createdBy: ResearchAuthorship
  readonly createdAt: string
}

/** Durable single-row aggregate for one research question. */
export interface ResearchQuestionRecord {
  readonly id: ResearchQuestionId
  /** Starts at zero and advances once for every material aggregate mutation. */
  readonly revision: number
  readonly title: string
  /** Editable only until the aggregate receives durable research content. */
  readonly question: string
  readonly createdBy: ResearchAuthorship
  readonly updatedBy: ResearchAuthorship
  readonly evidence: readonly ResearchEvidence[]
  readonly claims: readonly ResearchClaim[]
  readonly claimReviews: readonly ResearchClaimReview[]
  readonly observationReviews: readonly ResearchObservationReview[]
  readonly syntheses: readonly ResearchSynthesis[]
  readonly readingNotes: readonly ResearchReadingNote[]
  readonly entities: readonly ResearchEntity[]
  readonly observations: readonly ResearchObservation[]
  readonly comparisonProtocols: readonly ResearchComparisonProtocol[]
  readonly createdAt: string
  /** Never precedes the previous committed `updatedAt`, including after a restart. */
  readonly updatedAt: string
}

/** Create a question or compare-and-set its title and initially editable question text. */
export type WriteResearchQuestionRequest =
  | {
    readonly action: 'create'
    readonly title: string
    readonly question: string
    readonly author: ResearchAuthorship
  }
  | {
    readonly action: 'update'
    readonly questionId: ResearchQuestionId
    readonly expectedRevision: number
    readonly title?: string
    readonly question?: string
    readonly author: ResearchAuthorship
  }

/** Capture one exact block and optional exact selected quote. */
export interface CaptureResearchEvidenceRequest {
  readonly questionId: ResearchQuestionId
  readonly expectedRevision: number
  readonly paperId: ResearchPaperId
  readonly sourceVersionId: ResearchSourceVersionId
  readonly locator: ResearchDocumentBlockLocator
  readonly blockText: string
  readonly sectionPath: readonly string[]
  readonly selection?: ResearchEvidenceSelection
  readonly author: ResearchAuthorship
}

/** Append one immutable claim and optionally supersede an active claim. */
export interface WriteResearchClaimRequest {
  readonly questionId: ResearchQuestionId
  readonly expectedRevision: number
  readonly kind: ResearchClaim['kind']
  readonly facet: ResearchFacet
  readonly otherFacet?: string
  readonly text: string
  readonly evidenceLinks: readonly ResearchClaimEvidenceLink[]
  readonly supersedes?: ResearchClaimId
  readonly author: ResearchAuthorship
}

/** Finding input whose id and timestamps are assigned by the service. */
export interface ResearchFindingInput {
  readonly kind: ResearchFindingKind
  readonly stance: ResearchFindingStance
  readonly text: string
  readonly claimIds: readonly ResearchClaimId[]
  /** Authored comparison bases used by an inference; omitted when the finding makes no comparison. */
  readonly comparisonProtocolIds?: readonly ResearchComparisonProtocolId[]
}

/** Append one immutable synthesis and optionally supersede an active synthesis. */
export interface WriteResearchSynthesisRequest {
  readonly questionId: ResearchQuestionId
  readonly expectedRevision: number
  readonly findings: readonly ResearchFindingInput[]
  readonly supersedes?: ResearchSynthesisId
  readonly author: ResearchAuthorship
}

/** Append one immutable evidence-anchored reading note. */
export interface WriteResearchReadingNoteRequest {
  readonly questionId: ResearchQuestionId
  readonly expectedRevision: number
  readonly kind: ResearchReadingNote['kind']
  readonly text: string
  readonly evidenceId: ResearchEvidenceId
  readonly supersedes?: ResearchReadingNoteId
  readonly author: ResearchAuthorship
}

/** Append one immutable normalized entity and optionally merge active same-kind entity lineages. */
export interface WriteResearchEntityRequest {
  readonly questionId: ResearchQuestionId
  readonly expectedRevision: number
  readonly kind: ResearchEntityKind
  readonly canonicalName: string
  readonly sourceClaimIds: readonly ResearchClaimId[]
  readonly supersedes?: readonly ResearchEntityId[]
  readonly author: ResearchAuthorship
}

/** Append one immutable normalized metric observation. */
export interface WriteResearchObservationRequest {
  readonly questionId: ResearchQuestionId
  readonly expectedRevision: number
  readonly resultClaimId: ResearchClaimId
  readonly method: ResearchObservationMethod
  readonly dataset: ResearchObservationDataset
  readonly metric: ResearchObservationEntityReference
  readonly value: ResearchDecimal
  readonly unit: ResearchObservationUnit
  readonly valueStatistic: string
  readonly evaluationProtocol: ResearchObservationReportedContext
  readonly uncertainty: ResearchObservationUncertainty
  readonly conditions: ResearchObservationConditions
  readonly supersedes?: ResearchObservationId
  readonly author: ResearchAuthorship
}

/** Append one immutable authored comparison protocol. */
export interface WriteResearchComparisonProtocolRequest {
  readonly questionId: ResearchQuestionId
  readonly expectedRevision: number
  readonly observationIds: readonly ResearchObservationId[]
  readonly direction: ResearchComparisonDirection
  readonly referenceObservationId?: ResearchObservationId
  readonly compatibilityRationale: string
  readonly supersedes?: ResearchComparisonProtocolId
  readonly author: ResearchAuthorship
}

/** Configured resource category that rejected an otherwise valid mutation. */
export type ResearchInformationCapacity =
  | 'questions'
  | 'evidence'
  | 'claims'
  | 'claim-reviews'
  | 'observation-reviews'
  | 'observation-review-counterevidence'
  | 'syntheses'
  | 'findings'
  | 'evidence-links'
  | 'claim-references'
  | 'comparison-protocol-references'
  | 'reading-notes'
  | 'entities'
  | 'entity-claim-references'
  | 'entity-supersession-references'
  | 'observations'
  | 'observation-conditions'
  | 'comparison-protocols'
  | 'comparison-observation-references'
  | 'field-bytes'
  | 'block-bytes'
  | 'aggregate-bytes'

/** Exact durable-provenance check that rejected an evidence capture. */
export type ResearchEvidenceProvenanceMismatch =
  | 'document'
  | 'parser-observation'
  | 'block-hash'
  | 'selection-hash'
  | 'selection-offset'

/** Failures shared by every mutation against an existing question. */
export type ResearchQuestionMutationFailure =
  | { readonly status: 'question-not-found'; readonly questionId: ResearchQuestionId }
  | {
    readonly status: 'stale-revision'
    readonly questionId: ResearchQuestionId
    readonly expectedRevision: number
    readonly currentRevision: number
  }
  | { readonly status: 'capacity'; readonly resource: ResearchInformationCapacity }

/** Result of creating, editing, or refusing a locked research question. */
export type WriteResearchQuestionResult =
  | { readonly status: 'created' | 'updated' | 'unchanged'; readonly question: ResearchQuestionRecord }
  | ResearchQuestionMutationFailure
  | { readonly status: 'question-text-locked'; readonly questionId: ResearchQuestionId }

/** Result of exact evidence capture. */
export type CaptureResearchEvidenceResult =
  | {
    readonly status: 'created' | 'unchanged'
    readonly question: ResearchQuestionRecord
    readonly evidenceId: ResearchEvidenceId
  }
  | ResearchQuestionMutationFailure
  | { readonly status: 'paper-not-found'; readonly paperId: ResearchPaperId }
  | {
    readonly status: 'source-not-found'
    readonly paperId: ResearchPaperId
    readonly sourceVersionId: ResearchSourceVersionId
  }
  | {
    readonly status: 'provenance-mismatch'
    readonly reason: ResearchEvidenceProvenanceMismatch
  }

/** Claim-reference failure that leaves the aggregate unchanged. */
export type ResearchClaimReferenceFailure =
  | { readonly status: 'evidence-not-found'; readonly evidenceId: ResearchEvidenceId }
  | { readonly status: 'source-claim-uncited' }
  | { readonly status: 'source-evidence-paper-mismatch'; readonly paperIds: readonly ResearchPaperId[] }
  | { readonly status: 'supersedes-claim-not-found'; readonly claimId: ResearchClaimId }
  | { readonly status: 'supersedes-claim-inactive'; readonly claimId: ResearchClaimId }
  | { readonly status: 'supersedes-claim-kind-mismatch'; readonly claimId: ResearchClaimId }

/** Result of appending one immutable claim. */
export type WriteResearchClaimResult =
  | {
    readonly status: 'created'
    readonly question: ResearchQuestionRecord
    readonly claimId: ResearchClaimId
  }
  | ResearchQuestionMutationFailure
  | ResearchClaimReferenceFailure

/** Synthesis-reference failure that leaves the aggregate unchanged. */
export type ResearchSynthesisReferenceFailure =
  | { readonly status: 'claim-not-found'; readonly claimId: ResearchClaimId }
  | { readonly status: 'claim-inactive'; readonly claimId: ResearchClaimId }
  | { readonly status: 'source-summary-uncited'; readonly findingIndex: number }
  | {
    readonly status: 'source-summary-claim-kind-mismatch'
    readonly findingIndex: number
    readonly claimId: ResearchClaimId
  }
  | {
    readonly status: 'comparison-protocol-not-found'
    readonly findingIndex: number
    readonly comparisonProtocolId: ResearchComparisonProtocolId
  }
  | {
    readonly status: 'comparison-protocol-inactive' | 'comparison-protocol-stale'
    readonly findingIndex: number
    readonly comparisonProtocolId: ResearchComparisonProtocolId
  }
  | {
    readonly status: 'comparison-protocol-finding-kind-mismatch'
    readonly findingIndex: number
    readonly comparisonProtocolId: ResearchComparisonProtocolId
  }
  | {
    readonly status: 'comparison-protocol-result-claim-missing'
    readonly findingIndex: number
    readonly comparisonProtocolId: ResearchComparisonProtocolId
    readonly claimId: ResearchClaimId
  }
  | { readonly status: 'supersedes-synthesis-not-found'; readonly synthesisId: ResearchSynthesisId }
  | { readonly status: 'supersedes-synthesis-inactive'; readonly synthesisId: ResearchSynthesisId }

/** Result of appending one immutable synthesis. */
export type WriteResearchSynthesisResult =
  | {
    readonly status: 'created'
    readonly question: ResearchQuestionRecord
    readonly synthesisId: ResearchSynthesisId
  }
  | ResearchQuestionMutationFailure
  | ResearchSynthesisReferenceFailure

/** Reading-note reference failure that leaves the aggregate unchanged. */
export type ResearchReadingNoteReferenceFailure =
  | { readonly status: 'evidence-not-found'; readonly evidenceId: ResearchEvidenceId }
  | { readonly status: 'passage-question-selection-required'; readonly evidenceId: ResearchEvidenceId }
  | {
    readonly status: 'supersedes-reading-note-not-found'
    readonly readingNoteId: ResearchReadingNoteId
  }
  | {
    readonly status: 'supersedes-reading-note-inactive'
    readonly readingNoteId: ResearchReadingNoteId
  }
  | {
    readonly status: 'supersedes-reading-note-kind-mismatch'
    readonly readingNoteId: ResearchReadingNoteId
  }

/** Result of appending one immutable reading note. */
export type WriteResearchReadingNoteResult =
  | {
    readonly status: 'created'
    readonly question: ResearchQuestionRecord
    readonly readingNoteId: ResearchReadingNoteId
  }
  | ResearchQuestionMutationFailure
  | ResearchReadingNoteReferenceFailure

/** Entity-reference failure that leaves the aggregate unchanged. */
export type ResearchEntityReferenceFailure =
  | { readonly status: 'claim-not-found'; readonly claimId: ResearchClaimId }
  | { readonly status: 'claim-inactive'; readonly claimId: ResearchClaimId }
  | { readonly status: 'entity-claim-kind-mismatch'; readonly claimId: ResearchClaimId }
  | { readonly status: 'entity-claim-uncited'; readonly claimId: ResearchClaimId }
  | {
    readonly status: 'entity-claim-facet-mismatch'
    readonly claimId: ResearchClaimId
    readonly entityKind: ResearchEntityKind
    readonly claimFacet: ResearchFacet
  }
  | { readonly status: 'supersedes-entity-not-found'; readonly entityId: ResearchEntityId }
  | { readonly status: 'supersedes-entity-inactive'; readonly entityId: ResearchEntityId }
  | { readonly status: 'supersedes-entity-kind-mismatch'; readonly entityId: ResearchEntityId }

/** Result of appending one immutable normalized research entity. */
export type WriteResearchEntityResult =
  | {
    readonly status: 'created'
    readonly question: ResearchQuestionRecord
    readonly entityId: ResearchEntityId
  }
  | ResearchQuestionMutationFailure
  | ResearchEntityReferenceFailure

/** Claim purpose reported by an observation-reference failure. */
export type ResearchObservationClaimRole =
  | 'result'
  | 'method'
  | 'dataset'
  | 'metric'
  | 'dataset-split'
  | 'evaluation-protocol'
  | 'condition'

/** Entity purpose reported by an observation-reference failure. */
export type ResearchObservationEntityRole = 'method' | 'dataset' | 'metric'

/** Observation-reference failure that leaves the aggregate unchanged. */
export type ResearchObservationReferenceFailure =
  | {
    readonly status: 'observation-claim-not-found' | 'observation-claim-inactive'
    readonly claimRole: ResearchObservationClaimRole
    readonly claimId: ResearchClaimId
  }
  | {
    readonly status: 'observation-claim-kind-mismatch' | 'observation-claim-uncited'
    readonly claimRole: ResearchObservationClaimRole
    readonly claimId: ResearchClaimId
  }
  | {
    readonly status: 'observation-claim-facet-mismatch'
    readonly claimRole: 'result'
    readonly claimId: ResearchClaimId
    readonly claimFacet: ResearchFacet
  }
  | {
    readonly status: 'observation-claim-paper-mismatch'
    readonly claimRole: ResearchObservationClaimRole
    readonly claimId: ResearchClaimId
    /** Paper that supplies the mismatched source claim. */
    readonly paperId: ResearchPaperId
  }
  | {
    readonly status: 'observation-entity-not-found' | 'observation-entity-inactive'
    readonly entityRole: ResearchObservationEntityRole
    readonly entityId: ResearchEntityId
  }
  | {
    readonly status: 'observation-entity-stale'
    readonly entityRole: ResearchObservationEntityRole
    readonly entityId: ResearchEntityId
    readonly staleClaimIds: readonly ResearchClaimId[]
  }
  | {
    readonly status: 'observation-entity-kind-mismatch'
    readonly entityRole: ResearchObservationEntityRole
    readonly entityId: ResearchEntityId
    readonly entityKind: ResearchEntityKind
  }
  | {
    readonly status: 'observation-entity-claim-mismatch'
    readonly entityRole: ResearchObservationEntityRole
    readonly entityId: ResearchEntityId
    readonly claimId: ResearchClaimId
  }
  | { readonly status: 'supersedes-observation-not-found'; readonly observationId: ResearchObservationId }
  | { readonly status: 'supersedes-observation-inactive'; readonly observationId: ResearchObservationId }
  | {
    readonly status: 'supersedes-observation-paper-mismatch'
    readonly observationId: ResearchObservationId
  }

/** Result of appending one immutable normalized observation. */
export type WriteResearchObservationResult =
  | {
    readonly status: 'created'
    readonly question: ResearchQuestionRecord
    readonly observationId: ResearchObservationId
  }
  | ResearchQuestionMutationFailure
  | ResearchObservationReferenceFailure

/** Dimension whose compatibility prevented a comparison protocol write. */
export type ResearchComparisonDimension =
  | 'dataset'
  | 'metric'
  | 'dataset-split'
  | 'unit'
  | 'value-statistic'
  | 'evaluation-protocol'
  | 'must-match-conditions'

/** Comparison-protocol reference failure that leaves the aggregate unchanged. */
export type ResearchComparisonProtocolReferenceFailure =
  | { readonly status: 'observation-rejected'; readonly observationId: ResearchObservationId }
  | { readonly status: 'observation-rejected-claim'; readonly claimId: ResearchClaimId }
  | { readonly status: 'observation-not-found'; readonly observationId: ResearchObservationId }
  | { readonly status: 'observation-inactive'; readonly observationId: ResearchObservationId }
  | { readonly status: 'observation-stale'; readonly observationId: ResearchObservationId }
  | {
    readonly status: 'comparison-insufficient-papers'
    readonly paperIds: readonly ResearchPaperId[]
  }
  | {
    readonly status: 'comparison-field-not-recorded'
    readonly observationId: ResearchObservationId
    readonly dimension: Exclude<ResearchComparisonDimension, 'dataset' | 'metric' | 'value-statistic'>
  }
  | {
    readonly status: 'comparison-dimension-mismatch'
    readonly observationId: ResearchObservationId
    readonly dimension: ResearchComparisonDimension
  }
  | {
    readonly status: 'reference-observation-not-member'
    readonly observationId: ResearchObservationId
  }
  | {
    readonly status: 'supersedes-comparison-protocol-not-found'
    readonly comparisonProtocolId: ResearchComparisonProtocolId
  }
  | {
    readonly status: 'supersedes-comparison-protocol-inactive'
    readonly comparisonProtocolId: ResearchComparisonProtocolId
  }

/** Result of appending one immutable authored comparison protocol. */
export type WriteResearchComparisonProtocolResult =
  | {
    readonly status: 'created'
    readonly question: ResearchQuestionRecord
    readonly comparisonProtocolId: ResearchComparisonProtocolId
  }
  | ResearchQuestionMutationFailure
  | ResearchComparisonProtocolReferenceFailure
