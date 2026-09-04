/**
 * Model-facing tools for durable research questions, exact evidence, authored
 * reading notes, claims, normalized entities, comparison matrices, provenance audits,
 * and cited synthesis.
 * @module @f1star/dsh-research/tool-research-information
 */

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import {
  ResearchDocumentBlockId,
  ResearchDocumentId,
  type ResearchDocument,
  type ResearchDocumentBlock,
} from '../research-document/index.ts'
import {
  ResearchAuthorId,
  ResearchClaimId,
  ResearchComparisonProtocolId,
  ResearchDecimal,
  ResearchEntityId,
  ResearchEvidenceId,
  ResearchEvidenceTextHash,
  ResearchObservationId,
  ResearchQuestionId,
  ResearchReadingNoteId,
  ResearchSynthesisId,
  type CaptureResearchEvidenceResult,
  type ResearchClaim,
  type ResearchComparisonProtocol,
  type ResearchEntity,
  type ResearchEntityKind,
  type ResearchEvidence,
  type ResearchFacet,
  type ResearchObservation,
  type ResearchObservationCondition,
  type ResearchObservationConditions,
  type ResearchObservationReportedContext,
  type ResearchObservationUncertainty,
  type ResearchObservationUnit,
  type ResearchQuestionRecord,
  type ResearchReadingNote,
  type ResearchSynthesis,
  type WriteResearchClaimResult,
  type WriteResearchComparisonProtocolResult,
  type WriteResearchEntityResult,
  type WriteResearchObservationResult,
  type WriteResearchQuestionResult,
  type WriteResearchReadingNoteResult,
  type WriteResearchSynthesisResult,
} from '../research-information/index.ts'
import {
  ResearchPaperId,
  type ResearchSourceVersion,
} from '../research-library/index.ts'
import type {} from '@deepseek-ai/dsh-system-prompt'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {
  GenericCallView,
  InferValue,
  JsonValue,
  ToolRunContext,
  ValueSchemaSpec,
} from '@deepseek-ai/dsh-tools'
import {
  RESEARCH_REVIEW_WARNING_CODES,
  renderResearchReview,
  type ResearchReviewWarning,
} from './review-render.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-research-information'

/** Services required by the structured research-information tool suite. */
export const inject = [
  'researchDocuments',
  'researchInformation',
  'researchLibrary',
  'systemPrompt',
  'tools',
]

/** Default maximum questions returned by one list call. */
export const DEFAULT_MAX_LIST_RESULTS = 50
/** Default combined evidence, note, claim, entity, observation, protocol, finding, matrix-cell, and audit-item count per result. */
export const DEFAULT_MAX_ITEMS_PER_RESULT = 256
/** Default combined id and relation count projected by one tool result. */
export const DEFAULT_MAX_REFERENCES_PER_RESULT = 512
/** Default combined variable-text character budget for one canonical result and rendering. */
export const DEFAULT_MAX_OUTPUT_TEXT_CHARS = 100_000
/** Default maximum normalized query length accepted by list and named-field retrieval. */
export const DEFAULT_MAX_QUERY_CHARS = 500
/** Default maximum UTF-16 code units in one complete review before paging. */
export const DEFAULT_MAX_REVIEW_TEXT_CHARS = 2_000_000

/** Structured research-information tool projection and query policy. */
export interface Config {
  /** Maximum questions returned by one list call. Defaults to 50. */
  readonly maxListResults?: number
  /** Combined evidence, note, claim, entity, observation, protocol, finding, matrix-cell, and audit-item cap. Defaults to 256. */
  readonly maxItemsPerResult?: number
  /** Combined id, evidence-link, and claim-reference cap. Defaults to 512. */
  readonly maxReferencesPerResult?: number
  /** Variable-text projection and rendered-content character budget. Defaults to 100000. */
  readonly maxOutputTextChars?: number
  /** Maximum normalized list and named-field query characters. Defaults to 500. */
  readonly maxQueryChars?: number
  /** Maximum UTF-16 code units in one complete deterministic review. Defaults to 2000000. */
  readonly maxReviewTextChars?: number
}

/** Loader schema for research-information tool limits. */
export const Config: z<Config> = z.object({
  maxListResults: z.number().step(1).min(1).default(DEFAULT_MAX_LIST_RESULTS),
  maxItemsPerResult: z.number().step(1).min(1).default(DEFAULT_MAX_ITEMS_PER_RESULT),
  maxReferencesPerResult: z.number().step(1).min(1).default(DEFAULT_MAX_REFERENCES_PER_RESULT),
  maxOutputTextChars: z.number().step(1).min(256).default(DEFAULT_MAX_OUTPUT_TEXT_CHARS),
  maxQueryChars: z.number().step(1).min(1).default(DEFAULT_MAX_QUERY_CHARS),
  maxReviewTextChars: z.number().step(1).min(256).default(DEFAULT_MAX_REVIEW_TEXT_CHARS),
})

interface ResolvedConfig {
  readonly maxListResults: number
  readonly maxItemsPerResult: number
  readonly maxReferencesPerResult: number
  readonly maxOutputTextChars: number
  readonly maxQueryChars: number
  readonly maxReviewTextChars: number
}

type RuntimeEvidenceCoverage =
  | 'readable'
  | 'needs-ocr'
  | 'reimport-required'
  | 'parser-mismatch'
  | 'locator-mismatch'

type MutationFailure = Exclude<
  | WriteResearchQuestionResult
  | CaptureResearchEvidenceResult
  | WriteResearchClaimResult
  | WriteResearchComparisonProtocolResult
  | WriteResearchEntityResult
  | WriteResearchObservationResult
  | WriteResearchReadingNoteResult
  | WriteResearchSynthesisResult,
  { readonly status: 'created' | 'updated' | 'unchanged' }
> | {
  readonly status: 'question-text-locked'
  readonly questionId: ReturnType<typeof ResearchQuestionId>
}

const FACETS = [
  'aim',
  'method',
  'dataset',
  'metric',
  'result',
  'limitation',
  'validity-threat',
  'other',
] as const satisfies readonly ResearchFacet[]

const ENTITY_KINDS = ['method', 'dataset', 'metric'] as const satisfies readonly ResearchEntityKind[]

const METHOD_ROLES = ['proposed', 'baseline', 'other'] as const
const COMPARISON_DIRECTIONS = [
  'higher-is-better',
  'lower-is-better',
  'non-directional',
] as const

const OBSERVATION_DECIMAL_FIELDS = [
  'value',
  'uncertainty-magnitude',
  'uncertainty-lower',
  'uncertainty-upper',
  'confidence-level-percent',
] as const

type ObservationDecimalField = typeof OBSERVATION_DECIMAL_FIELDS[number]

const QUESTION_SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    question_id: { type: 'string', required: true },
    revision: { type: 'integer', required: true },
    title: { type: 'string', required: true },
    title_truncated: { type: 'boolean', required: true },
    question: { type: 'string', required: true },
    question_truncated: { type: 'boolean', required: true },
    total_evidence: { type: 'integer', required: true },
    total_notes: { type: 'integer', required: true },
    active_notes: { type: 'integer', required: true },
    total_claims: { type: 'integer', required: true },
    active_claims: { type: 'integer', required: true },
    total_entities: { type: 'integer', required: true },
    active_entities: { type: 'integer', required: true },
    stale_active_entities: { type: 'integer', required: true },
    total_observations: { type: 'integer', required: true },
    active_observations: { type: 'integer', required: true },
    stale_active_observations: { type: 'integer', required: true },
    total_comparison_protocols: { type: 'integer', required: true },
    active_comparison_protocols: { type: 'integer', required: true },
    stale_active_comparison_protocols: { type: 'integer', required: true },
    total_syntheses: { type: 'integer', required: true },
    active_syntheses: { type: 'integer', required: true },
    paper_ids: { type: 'array', required: true, items: { type: 'string' } },
    total_papers: { type: 'integer', required: true },
    paper_ids_truncated: { type: 'boolean', required: true },
    created_at: { type: 'string', required: true },
    updated_at: { type: 'string', required: true },
  },
} as const

const MUTATION_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: {
      type: 'string',
      required: true,
      enum: [
        'created',
        'updated',
        'unchanged',
        'question-not-found',
        'question-text-locked',
        'stale-revision',
        'capacity',
        'paper-not-found',
        'source-not-found',
        'provenance-mismatch',
        'document-not-registered',
        'reimport-required',
        'needs-ocr',
        'block-not-found',
        'parser-observation-missing',
        'quote-not-found',
        'quote-ambiguous',
        'evidence-not-found',
        'passage-question-selection-required',
        'supersedes-reading-note-not-found',
        'supersedes-reading-note-inactive',
        'supersedes-reading-note-kind-mismatch',
        'source-claim-uncited',
        'source-evidence-paper-mismatch',
        'supersedes-claim-not-found',
        'supersedes-claim-inactive',
        'supersedes-claim-kind-mismatch',
        'claim-not-found',
        'claim-inactive',
        'observation-claim-not-found',
        'observation-claim-inactive',
        'observation-claim-kind-mismatch',
        'observation-claim-facet-mismatch',
        'observation-claim-uncited',
        'observation-claim-paper-mismatch',
        'observation-entity-not-found',
        'observation-entity-inactive',
        'observation-entity-stale',
        'observation-entity-kind-mismatch',
        'observation-entity-claim-mismatch',
        'supersedes-observation-not-found',
        'supersedes-observation-inactive',
        'supersedes-observation-paper-mismatch',
        'observation-not-found',
        'observation-inactive',
        'observation-stale',
        'comparison-insufficient-papers',
        'comparison-field-not-recorded',
        'comparison-dimension-mismatch',
        'reference-observation-not-member',
        'supersedes-comparison-protocol-not-found',
        'supersedes-comparison-protocol-inactive',
        'entity-claim-kind-mismatch',
        'entity-claim-uncited',
        'entity-claim-facet-mismatch',
        'supersedes-entity-not-found',
        'supersedes-entity-inactive',
        'supersedes-entity-kind-mismatch',
        'source-summary-uncited',
        'source-summary-claim-kind-mismatch',
        'comparison-protocol-not-found',
        'comparison-protocol-inactive',
        'comparison-protocol-stale',
        'comparison-protocol-finding-kind-mismatch',
        'comparison-protocol-result-claim-missing',
        'supersedes-synthesis-not-found',
        'supersedes-synthesis-inactive',
      ],
    },
    question_id: { type: 'string' },
    revision: { type: 'integer' },
    question: QUESTION_SUMMARY_SCHEMA,
    evidence_id: { type: 'string' },
    note_id: { type: 'string' },
    claim_id: { type: 'string' },
    claim_role: {
      type: 'string',
      enum: [
        'result',
        'method',
        'dataset',
        'metric',
        'dataset-split',
        'evaluation-protocol',
        'condition',
      ],
    },
    entity_id: { type: 'string' },
    entity_kind: { type: 'string', enum: [...ENTITY_KINDS] },
    entity_role: { type: 'string', enum: [...ENTITY_KINDS] },
    observation_id: { type: 'string' },
    comparison_protocol_id: { type: 'string' },
    stale_claim_ids: { type: 'array', items: { type: 'string' } },
    total_stale_claims: { type: 'integer' },
    stale_claim_ids_truncated: { type: 'boolean' },
    dimension: {
      type: 'string',
      enum: [
        'dataset',
        'metric',
        'dataset-split',
        'unit',
        'value-statistic',
        'evaluation-protocol',
        'must-match-conditions',
      ],
    },
    claim_facet: { type: 'string', enum: [...FACETS] },
    synthesis_id: { type: 'string' },
    paper_id: { type: 'string' },
    paper_ids: { type: 'array', items: { type: 'string' } },
    total_papers: { type: 'integer' },
    paper_ids_truncated: { type: 'boolean' },
    source_version_id: { type: 'string' },
    document_id: { type: 'string' },
    block_id: { type: 'string' },
    expected_revision: { type: 'integer' },
    current_revision: { type: 'integer' },
    finding_index: { type: 'integer' },
    resource: { type: 'string' },
    reason: { type: 'string' },
    matches: { type: 'integer' },
    truncated: { type: 'boolean', required: true },
  },
} as const

const LIST_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    query: { type: 'string' },
    query_truncated: { type: 'boolean' },
    questions: { type: 'array', required: true, items: QUESTION_SUMMARY_SCHEMA },
    total_matches: { type: 'integer', required: true },
    truncated: { type: 'boolean', required: true },
  },
} as const

const EVIDENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    evidence_id: { type: 'string', required: true },
    paper_id: { type: 'string', required: true },
    source_version_id: { type: 'string', required: true },
    document_id: { type: 'string', required: true },
    block_id: { type: 'string', required: true },
    page_index: { type: 'integer', required: true },
    page_label: { type: 'string' },
    page_label_truncated: { type: 'boolean' },
    section_path: { type: 'array', required: true, items: { type: 'string' } },
    section_path_truncated: { type: 'boolean', required: true },
    block_text: { type: 'string', required: true },
    block_text_truncated: { type: 'boolean', required: true },
    selected_text: { type: 'string' },
    selected_text_truncated: { type: 'boolean' },
    selected_start_utf8_byte: { type: 'integer' },
    selected_end_utf8_byte: { type: 'integer' },
    created_by: { type: 'string', required: true },
    created_by_truncated: { type: 'boolean', required: true },
    created_at: { type: 'string', required: true },
  },
} as const

const NOTE_ANCHOR_SCHEMA = {
  type: 'object',
  required: true,
  additionalProperties: false,
  properties: {
    paper_id: { type: 'string', required: true },
    source_version_id: { type: 'string', required: true },
    document_id: { type: 'string', required: true },
    block_id: { type: 'string', required: true },
    page_index: { type: 'integer', required: true },
    page_label: { type: 'string' },
    page_label_truncated: { type: 'boolean' },
    section_path: { type: 'array', required: true, items: { type: 'string' } },
    section_path_truncated: { type: 'boolean', required: true },
    selected_text: { type: 'string' },
    selected_text_truncated: { type: 'boolean' },
  },
} as const

const NOTE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    note_id: { type: 'string', required: true },
    kind: { type: 'string', required: true, enum: ['note', 'passage-question'] },
    content_role: { type: 'string', required: true, enum: ['authored-commentary'] },
    text: { type: 'string', required: true },
    text_truncated: { type: 'boolean', required: true },
    evidence_id: { type: 'string', required: true },
    anchor: NOTE_ANCHOR_SCHEMA,
    supersedes_note_id: { type: 'string' },
    references_truncated: { type: 'boolean', required: true },
    active: { type: 'boolean', required: true },
    created_by: { type: 'string', required: true },
    created_by_truncated: { type: 'boolean', required: true },
    created_at: { type: 'string', required: true },
  },
} as const

const CLAIM_LINK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    evidence_id: { type: 'string', required: true },
    relation: {
      type: 'string',
      required: true,
      enum: ['supports', 'contradicts', 'qualifies', 'background'],
    },
  },
} as const

const CLAIM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    claim_id: { type: 'string', required: true },
    kind: { type: 'string', required: true, enum: ['source-statement', 'inference'] },
    facet: { type: 'string', required: true, enum: [...FACETS] },
    other_facet: { type: 'string' },
    other_facet_truncated: { type: 'boolean' },
    text: { type: 'string', required: true },
    text_truncated: { type: 'boolean', required: true },
    evidence_links: { type: 'array', required: true, items: CLAIM_LINK_SCHEMA },
    total_evidence_links: { type: 'integer', required: true },
    evidence_links_truncated: { type: 'boolean', required: true },
    supersedes_claim_id: { type: 'string' },
    active: { type: 'boolean', required: true },
    created_by: { type: 'string', required: true },
    created_by_truncated: { type: 'boolean', required: true },
    created_at: { type: 'string', required: true },
  },
} as const

const ENTITY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    entity_id: { type: 'string', required: true },
    kind: { type: 'string', required: true, enum: [...ENTITY_KINDS] },
    content_role: { type: 'string', required: true, enum: ['authored-normalization'] },
    canonical_name: { type: 'string', required: true },
    canonical_name_truncated: { type: 'boolean', required: true },
    source_claim_ids: { type: 'array', required: true, items: { type: 'string' } },
    total_source_claims: { type: 'integer', required: true },
    source_claim_ids_truncated: { type: 'boolean', required: true },
    linked_paper_ids: { type: 'array', required: true, items: { type: 'string' } },
    total_linked_papers: { type: 'integer', required: true },
    linked_paper_ids_truncated: { type: 'boolean', required: true },
    evidence_ids: { type: 'array', required: true, items: { type: 'string' } },
    total_evidence: { type: 'integer', required: true },
    evidence_ids_truncated: { type: 'boolean', required: true },
    stale_source_claim_ids: { type: 'array', required: true, items: { type: 'string' } },
    total_stale_source_claims: { type: 'integer', required: true },
    stale_source_claim_ids_truncated: { type: 'boolean', required: true },
    supersedes_entity_ids: { type: 'array', required: true, items: { type: 'string' } },
    total_supersedes_entities: { type: 'integer', required: true },
    supersedes_entity_ids_truncated: { type: 'boolean', required: true },
    references_truncated: { type: 'boolean', required: true },
    active: { type: 'boolean', required: true },
    stale: { type: 'boolean', required: true },
    created_by: { type: 'string', required: true },
    created_by_truncated: { type: 'boolean', required: true },
    created_at: { type: 'string', required: true },
  },
} as const

const OBSERVATION_ENTITY_REFERENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    entity_id: { type: 'string', required: true },
    source_claim_id: { type: 'string', required: true },
  },
} as const

const OBSERVATION_REPORTED_CONTEXT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: {
      type: 'string', required: true, enum: ['reported', 'not-recorded', 'not-applicable'],
    },
    value: { type: 'string' },
    value_truncated: { type: 'boolean' },
    source_claim_id: { type: 'string' },
  },
} as const

const OBSERVATION_UNIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: {
      type: 'string', required: true, enum: ['reported', 'not-recorded', 'not-applicable'],
    },
    symbol: { type: 'string' },
    symbol_truncated: { type: 'boolean' },
  },
} as const

const OBSERVATION_UNCERTAINTY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: {
      type: 'string', required: true, enum: ['reported', 'not-recorded', 'not-applicable'],
    },
    kind: {
      type: 'string',
      enum: [
        'standard-deviation',
        'standard-error',
        'unspecified-plus-minus',
        'confidence-interval',
        'range',
      ],
    },
    magnitude: { type: 'string' },
    magnitude_truncated: { type: 'boolean' },
    lower: { type: 'string' },
    lower_truncated: { type: 'boolean' },
    upper: { type: 'string' },
    upper_truncated: { type: 'boolean' },
    confidence_level_percent: { type: 'string' },
    confidence_level_percent_truncated: { type: 'boolean' },
  },
} as const

const OBSERVATION_CONDITION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', required: true },
    name_truncated: { type: 'boolean', required: true },
    value: { type: 'string', required: true },
    value_truncated: { type: 'boolean', required: true },
    source_claim_id: { type: 'string', required: true },
    comparison_role: {
      type: 'string', required: true, enum: ['must-match', 'descriptive'],
    },
  },
} as const

const OBSERVATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    observation_id: { type: 'string', required: true },
    content_role: { type: 'string', required: true, enum: ['authored-normalization'] },
    active: { type: 'boolean', required: true },
    stale: { type: 'boolean', required: true },
    comparison_status: {
      type: 'string', required: true, enum: ['not-established', 'protocol-backed'],
    },
    alignment_status: { type: 'string', required: true, enum: ['candidate', 'blocked'] },
    alignment_blockers: { type: 'array', required: true, items: { type: 'string' } },
    candidate_observation_ids: { type: 'array', required: true, items: { type: 'string' } },
    total_candidate_observations: { type: 'integer', required: true },
    candidate_observation_ids_truncated: { type: 'boolean', required: true },
    comparison_protocol_ids: { type: 'array', required: true, items: { type: 'string' } },
    total_comparison_protocols: { type: 'integer', required: true },
    comparison_protocol_ids_truncated: { type: 'boolean', required: true },
    paper_id: { type: 'string', required: true },
    result_claim_id: { type: 'string', required: true },
    method: {
      type: 'object',
      required: true,
      additionalProperties: false,
      properties: {
        entity_id: { type: 'string', required: true },
        source_claim_id: { type: 'string', required: true },
        role: { type: 'string', required: true, enum: [...METHOD_ROLES] },
        other_role: { type: 'string' },
        other_role_truncated: { type: 'boolean' },
      },
    },
    dataset: {
      type: 'object',
      required: true,
      additionalProperties: false,
      properties: {
        entity_id: { type: 'string', required: true },
        source_claim_id: { type: 'string', required: true },
        split: { ...OBSERVATION_REPORTED_CONTEXT_SCHEMA, required: true },
      },
    },
    metric: { ...OBSERVATION_ENTITY_REFERENCE_SCHEMA, required: true },
    value: { type: 'string', required: true },
    value_truncated: { type: 'boolean', required: true },
    unit: { ...OBSERVATION_UNIT_SCHEMA, required: true },
    value_statistic: { type: 'string', required: true },
    value_statistic_truncated: { type: 'boolean', required: true },
    evaluation_protocol: { ...OBSERVATION_REPORTED_CONTEXT_SCHEMA, required: true },
    uncertainty: { ...OBSERVATION_UNCERTAINTY_SCHEMA, required: true },
    conditions_status: {
      type: 'string', required: true, enum: ['reported', 'not-recorded', 'not-applicable'],
    },
    conditions: { type: 'array', required: true, items: OBSERVATION_CONDITION_SCHEMA },
    total_conditions: { type: 'integer', required: true },
    conditions_truncated: { type: 'boolean', required: true },
    evidence_ids: { type: 'array', required: true, items: { type: 'string' } },
    total_evidence: { type: 'integer', required: true },
    evidence_ids_truncated: { type: 'boolean', required: true },
    supersedes_observation_id: { type: 'string' },
    references_truncated: { type: 'boolean', required: true },
    created_by: { type: 'string', required: true },
    created_by_truncated: { type: 'boolean', required: true },
    created_at: { type: 'string', required: true },
  },
} as const

const COMPARISON_PROTOCOL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    comparison_protocol_id: { type: 'string', required: true },
    content_role: {
      type: 'string', required: true, enum: ['authored-comparison-decision'],
    },
    active: { type: 'boolean', required: true },
    stale: { type: 'boolean', required: true },
    compatibility_status: {
      type: 'string',
      required: true,
      enum: ['established-by-active-protocol', 'not-current'],
    },
    statistical_significance: { type: 'string', required: true, enum: ['not-assessed'] },
    direction: { type: 'string', required: true, enum: [...COMPARISON_DIRECTIONS] },
    compatibility_rationale: { type: 'string', required: true },
    compatibility_rationale_truncated: { type: 'boolean', required: true },
    observation_ids: { type: 'array', required: true, items: { type: 'string' } },
    total_observations: { type: 'integer', required: true },
    observation_ids_truncated: { type: 'boolean', required: true },
    stale_observation_ids: { type: 'array', required: true, items: { type: 'string' } },
    total_stale_observations: { type: 'integer', required: true },
    stale_observation_ids_truncated: { type: 'boolean', required: true },
    reference_observation_id: { type: 'string' },
    supersedes_comparison_protocol_id: { type: 'string' },
    references_truncated: { type: 'boolean', required: true },
    created_by: { type: 'string', required: true },
    created_by_truncated: { type: 'boolean', required: true },
    created_at: { type: 'string', required: true },
  },
} as const

const FINDING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    finding_id: { type: 'string', required: true },
    kind: { type: 'string', required: true, enum: ['source-summary', 'inference'] },
    stance: {
      type: 'string',
      required: true,
      enum: ['agreement', 'conflict', 'qualification', 'open-question'],
    },
    text: { type: 'string', required: true },
    text_truncated: { type: 'boolean', required: true },
    claim_ids: { type: 'array', required: true, items: { type: 'string' } },
    total_claims: { type: 'integer', required: true },
    claim_ids_truncated: { type: 'boolean', required: true },
    comparison_protocol_ids: { type: 'array', required: true, items: { type: 'string' } },
    total_comparison_protocols: { type: 'integer', required: true },
    comparison_protocol_ids_truncated: { type: 'boolean', required: true },
  },
} as const

const SYNTHESIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    synthesis_id: { type: 'string', required: true },
    findings: { type: 'array', required: true, items: FINDING_SCHEMA },
    finding_offset: { type: 'integer', required: true },
    next_finding_offset: { type: 'integer' },
    total_findings: { type: 'integer', required: true },
    findings_truncated: { type: 'boolean', required: true },
    supersedes_synthesis_id: { type: 'string' },
    active: { type: 'boolean', required: true },
    created_by: { type: 'string', required: true },
    created_by_truncated: { type: 'boolean', required: true },
    created_at: { type: 'string', required: true },
  },
} as const

const MATRIX_CELL_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    facet: { type: 'string', required: true, enum: [...FACETS] },
    paper_id: { type: 'string', required: true },
    paper_title: { type: 'string', required: true },
    paper_title_truncated: { type: 'boolean', required: true },
    source_statement_claim_ids: { type: 'array', required: true, items: { type: 'string' } },
    inference_claim_ids: { type: 'array', required: true, items: { type: 'string' } },
    evidence_ids: { type: 'array', required: true, items: { type: 'string' } },
    references_truncated: { type: 'boolean', required: true },
    missing_source_statement: { type: 'boolean', required: true },
  },
} as const

const MATRIX_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    facets: { type: 'array', required: true, items: { type: 'string', enum: [...FACETS] } },
    paper_ids: { type: 'array', required: true, items: { type: 'string' } },
    cells: { type: 'array', required: true, items: MATRIX_CELL_SCHEMA },
    total_cells: { type: 'integer', required: true },
    cells_truncated: { type: 'boolean', required: true },
    uncited_inference_claim_ids: { type: 'array', required: true, items: { type: 'string' } },
    references_truncated: { type: 'boolean', required: true },
  },
} as const

const AUDIT_EVIDENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    evidence_id: { type: 'string', required: true },
    paper_id: { type: 'string', required: true },
    status: {
      type: 'string',
      required: true,
      enum: ['readable', 'needs-ocr', 'reimport-required', 'parser-mismatch', 'locator-mismatch'],
    },
  },
} as const

const STALE_REFERENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    synthesis_id: { type: 'string', required: true },
    finding_id: { type: 'string', required: true },
    claim_id: { type: 'string', required: true },
  },
} as const

const STALE_SYNTHESIS_COMPARISON_REFERENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    synthesis_id: { type: 'string', required: true },
    finding_id: { type: 'string', required: true },
    comparison_protocol_id: { type: 'string', required: true },
    active: { type: 'boolean', required: true },
    stale: { type: 'boolean', required: true },
  },
} as const

const STALE_ENTITY_REFERENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    entity_id: { type: 'string', required: true },
    claim_id: { type: 'string', required: true },
  },
} as const

const STALE_OBSERVATION_REFERENCE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    observation_id: { type: 'string', required: true },
    reference_kind: { type: 'string', required: true },
    claim_id: { type: 'string' },
    entity_id: { type: 'string' },
  },
} as const

const OBSERVATION_ALIGNMENT_BLOCKER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    observation_id: { type: 'string', required: true },
    blockers: { type: 'array', required: true, items: { type: 'string' } },
  },
} as const

const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    evidence: { type: 'array', required: true, items: AUDIT_EVIDENCE_SCHEMA },
    total_evidence: { type: 'integer', required: true },
    evidence_truncated: { type: 'boolean', required: true },
    coverage_counts: {
      type: 'object',
      required: true,
      additionalProperties: false,
      properties: {
        readable: { type: 'integer', required: true },
        needs_ocr: { type: 'integer', required: true },
        reimport_required: { type: 'integer', required: true },
        parser_mismatch: { type: 'integer', required: true },
        locator_mismatch: { type: 'integer', required: true },
      },
    },
    inactive_claim_ids: { type: 'array', required: true, items: { type: 'string' } },
    inactive_entity_ids: { type: 'array', required: true, items: { type: 'string' } },
    inactive_observation_ids: { type: 'array', required: true, items: { type: 'string' } },
    inactive_comparison_protocol_ids: {
      type: 'array', required: true, items: { type: 'string' },
    },
    inactive_synthesis_ids: { type: 'array', required: true, items: { type: 'string' } },
    uncited_inference_claim_ids: { type: 'array', required: true, items: { type: 'string' } },
    stale_synthesis_references: { type: 'array', required: true, items: STALE_REFERENCE_SCHEMA },
    stale_synthesis_comparison_references: {
      type: 'array', required: true, items: STALE_SYNTHESIS_COMPARISON_REFERENCE_SCHEMA,
    },
    stale_entity_references: {
      type: 'array', required: true, items: STALE_ENTITY_REFERENCE_SCHEMA,
    },
    stale_observation_references: {
      type: 'array', required: true, items: STALE_OBSERVATION_REFERENCE_SCHEMA,
    },
    stale_comparison_protocol_ids: {
      type: 'array', required: true, items: { type: 'string' },
    },
    unprotocolled_observation_ids: {
      type: 'array', required: true, items: { type: 'string' },
    },
    unobserved_result_claim_ids: {
      type: 'array', required: true, items: { type: 'string' },
    },
    observation_alignment_blockers: {
      type: 'array', required: true, items: OBSERVATION_ALIGNMENT_BLOCKER_SCHEMA,
    },
    unnormalized_source_claim_ids: {
      type: 'array', required: true, items: { type: 'string' },
    },
    uncited_inference_finding_ids: { type: 'array', required: true, items: { type: 'string' } },
    references_truncated: { type: 'boolean', required: true },
  },
} as const

const GET_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', required: true, enum: ['found', 'question-not-found'] },
    question_id: { type: 'string', required: true },
    view: {
      type: 'string',
      required: true,
      enum: ['overview', 'notes', 'entities', 'observations', 'comparisons', 'matrix', 'audit'],
    },
    question: QUESTION_SUMMARY_SCHEMA,
    evidence: { type: 'array', items: EVIDENCE_SCHEMA },
    total_evidence: { type: 'integer' },
    evidence_truncated: { type: 'boolean' },
    notes: { type: 'array', items: NOTE_SCHEMA },
    total_notes: { type: 'integer' },
    notes_truncated: { type: 'boolean' },
    claims: { type: 'array', items: CLAIM_SCHEMA },
    total_claims: { type: 'integer' },
    claims_truncated: { type: 'boolean' },
    entities: { type: 'array', items: ENTITY_SCHEMA },
    total_entities: { type: 'integer' },
    entities_truncated: { type: 'boolean' },
    entity_kind: { type: 'string', enum: [...ENTITY_KINDS] },
    entity_query: { type: 'string' },
    entity_query_truncated: { type: 'boolean' },
    observations: { type: 'array', items: OBSERVATION_SCHEMA },
    total_observations: { type: 'integer' },
    observations_truncated: { type: 'boolean' },
    observation_id: { type: 'string' },
    paper_id: { type: 'string' },
    method_entity_id: { type: 'string' },
    dataset_entity_id: { type: 'string' },
    metric_entity_id: { type: 'string' },
    comparison_protocols: { type: 'array', items: COMPARISON_PROTOCOL_SCHEMA },
    total_comparison_protocols: { type: 'integer' },
    comparison_protocols_truncated: { type: 'boolean' },
    comparison_protocol_id: { type: 'string' },
    syntheses: { type: 'array', items: SYNTHESIS_SCHEMA },
    total_syntheses: { type: 'integer' },
    syntheses_truncated: { type: 'boolean' },
    matrix: MATRIX_SCHEMA,
    audit: AUDIT_SCHEMA,
    offset: { type: 'integer' },
    returned_items: { type: 'integer' },
    total_items: { type: 'integer' },
    next_offset: { type: 'integer' },
    reference_offset: { type: 'integer' },
    returned_references: { type: 'integer' },
    total_references: { type: 'integer' },
    next_reference_offset: { type: 'integer' },
    text_offset: { type: 'integer' },
    returned_text_chars: { type: 'integer' },
    total_text_chars: { type: 'integer' },
    next_text_offset: { type: 'integer' },
    decimal_field: { type: 'string', enum: [...OBSERVATION_DECIMAL_FIELDS] },
    decimal_text: { type: 'string' },
    decimal_text_offset: { type: 'integer' },
    returned_decimal_chars: { type: 'integer' },
    total_decimal_chars: { type: 'integer' },
    next_decimal_text_offset: { type: 'integer' },
    truncated: { type: 'boolean', required: true },
  },
} as const

const REVIEW_WARNING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    code: { type: 'string', required: true, enum: [...RESEARCH_REVIEW_WARNING_CODES] },
    message: { type: 'string', required: true },
    finding_id: { type: 'string' },
    claim_id: { type: 'string' },
    comparison_protocol_id: { type: 'string' },
    observation_id: { type: 'string' },
    evidence_id: { type: 'string' },
    paper_id: { type: 'string' },
  },
} as const

const REVIEW_RENDER_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    status: { type: 'string', required: true, enum: ['ready', 'ready-with-warnings', 'not-ready'] },
    question_id: { type: 'string', required: true },
    synthesis_id: { type: 'string', required: true },
    warnings: { type: 'array', required: true, items: REVIEW_WARNING_SCHEMA },
    total_warnings: { type: 'integer', required: true },
    warnings_omitted: { type: 'boolean', required: true },
    markdown: { type: 'string', required: true },
    render_digest: { type: 'string', required: true },
    text_offset: { type: 'integer', required: true },
    returned_text_chars: { type: 'integer', required: true },
    total_text_chars: { type: 'integer', required: true },
    next_text_offset: { type: 'integer' },
    truncated: { type: 'boolean', required: true },
  },
} as const

type QuestionSummary = InferValue<typeof QUESTION_SUMMARY_SCHEMA>
type MutationOutput = InferValue<typeof MUTATION_OUTPUT_SCHEMA>
type ListOutput = InferValue<typeof LIST_OUTPUT_SCHEMA>
type GetOutput = InferValue<typeof GET_OUTPUT_SCHEMA>
type ReviewRenderOutput = InferValue<typeof REVIEW_RENDER_OUTPUT_SCHEMA>
type ProjectedEvidence = InferValue<typeof EVIDENCE_SCHEMA>
type ProjectedNote = InferValue<typeof NOTE_SCHEMA>
type ProjectedClaim = InferValue<typeof CLAIM_SCHEMA>
type ProjectedEntity = InferValue<typeof ENTITY_SCHEMA>
type ProjectedObservation = InferValue<typeof OBSERVATION_SCHEMA>
type ProjectedComparisonProtocol = InferValue<typeof COMPARISON_PROTOCOL_SCHEMA>
type ProjectedSynthesis = InferValue<typeof SYNTHESIS_SCHEMA>
type Matrix = InferValue<typeof MATRIX_SCHEMA>
type Audit = InferValue<typeof AUDIT_SCHEMA>

interface ItemPage<T> {
  readonly values: readonly T[]
  readonly offset: number
  readonly total: number
  readonly nextOffset?: number
  readonly truncated: boolean
}

interface TextPage {
  readonly value: string
  readonly offset: number
  readonly returned: number
  readonly total: number
  readonly nextOffset?: number
  readonly truncated: boolean
}

interface ProjectedReadingNote {
  readonly value: ProjectedNote
  readonly textPage: TextPage
}

type OverviewItem =
  | { readonly kind: 'evidence'; readonly value: ResearchEvidence }
  | { readonly kind: 'claim'; readonly value: ResearchClaim }
  | { readonly kind: 'synthesis'; readonly value: ResearchSynthesis }

type ObservationAlignmentBlocker =
  | 'inactive'
  | 'stale-reference'
  | 'unit-not-recorded'
  | 'dataset-split-not-recorded'
  | 'evaluation-protocol-not-recorded'
  | 'conditions-not-recorded'
  | 'no-cross-paper-structural-match'

interface StaleObservationReference {
  readonly observation_id: ReturnType<typeof ResearchObservationId>
  readonly reference_kind: string
  readonly claim_id?: ReturnType<typeof ResearchClaimId>
  readonly entity_id?: ReturnType<typeof ResearchEntityId>
}

interface IndexedReferenceRange {
  readonly start: number
  readonly count: number
}

interface StaleSynthesisReferenceRange extends IndexedReferenceRange {
  readonly synthesisId: ReturnType<typeof ResearchSynthesisId>
  readonly findingId: string
  readonly staleClaimIds: readonly ReturnType<typeof ResearchClaimId>[]
}

interface StaleSynthesisComparisonReferenceRange extends IndexedReferenceRange {
  readonly synthesisId: ReturnType<typeof ResearchSynthesisId>
  readonly findingId: string
  readonly comparisonProtocolIds: readonly ReturnType<typeof ResearchComparisonProtocolId>[]
}

interface StaleEntityReferenceRange extends IndexedReferenceRange {
  readonly entityId: ReturnType<typeof ResearchEntityId>
  readonly staleClaimIds: readonly ReturnType<typeof ResearchClaimId>[]
}

interface StaleObservationReferenceRange extends IndexedReferenceRange {
  readonly observation: ResearchObservation
}

type ObservationStaleReferenceSegment =
  | {
    readonly kind: 'claim'
    readonly referenceKind: string
    readonly claimId: ReturnType<typeof ResearchClaimId>
    readonly entityId?: ReturnType<typeof ResearchEntityId>
  }
  | {
    readonly kind: 'condition-claims'
    readonly conditionIndexes: readonly number[]
  }
  | {
    readonly kind: 'inactive-entity'
    readonly role: 'method' | 'dataset' | 'metric'
    readonly entityId: ReturnType<typeof ResearchEntityId>
  }
  | {
    readonly kind: 'entity-source-claims'
    readonly role: 'method' | 'dataset' | 'metric'
    readonly entityId: ReturnType<typeof ResearchEntityId>
    readonly claimIds: readonly ReturnType<typeof ResearchClaimId>[]
  }

interface ObservationStaleReferenceIndex {
  readonly segments: readonly ObservationStaleReferenceSegment[]
  readonly count: number
}

interface ObservationCandidateBucket {
  readonly observationIds: readonly ReturnType<typeof ResearchObservationId>[]
  readonly positionsByPaper: ReadonlyMap<ResearchPaperId, readonly number[]>
}

interface ObservationProjectionState {
  readonly activeClaims: ReadonlySet<ReturnType<typeof ResearchClaimId>>
  readonly activeEntities: ReadonlySet<ReturnType<typeof ResearchEntityId>>
  readonly activeObservations: ReadonlySet<ReturnType<typeof ResearchObservationId>>
  readonly activeComparisonProtocols: ReadonlySet<ReturnType<typeof ResearchComparisonProtocolId>>
  readonly staleObservationIds: ReadonlySet<ReturnType<typeof ResearchObservationId>>
  readonly staleComparisonProtocolIds: ReadonlySet<ReturnType<typeof ResearchComparisonProtocolId>>
  readonly claimById: ReadonlyMap<ReturnType<typeof ResearchClaimId>, ResearchClaim>
  readonly observationById: ReadonlyMap<ReturnType<typeof ResearchObservationId>, ResearchObservation>
  readonly paperByObservation: ReadonlyMap<ReturnType<typeof ResearchObservationId>, ResearchPaperId>
  readonly entityById: ReadonlyMap<ReturnType<typeof ResearchEntityId>, ResearchEntity>
  readonly staleSourceClaimIdsByEntity: ReadonlyMap<
    ReturnType<typeof ResearchEntityId>,
    readonly ReturnType<typeof ResearchClaimId>[]
  >
  readonly staleReferenceIndexByObservation: ReadonlyMap<
    ReturnType<typeof ResearchObservationId>,
    ObservationStaleReferenceIndex
  >
  readonly candidateBucketByObservation: ReadonlyMap<
    ReturnType<typeof ResearchObservationId>,
    ObservationCandidateBucket
  >
  readonly candidateCountByObservation: ReadonlyMap<
    ReturnType<typeof ResearchObservationId>,
    number
  >
  readonly blockersByObservation: ReadonlyMap<
    ReturnType<typeof ResearchObservationId>,
    readonly ObservationAlignmentBlocker[]
  >
  readonly protocolsByObservation: ReadonlyMap<
    ReturnType<typeof ResearchObservationId>,
    readonly ReturnType<typeof ResearchComparisonProtocolId>[]
  >
}

/** Register stable guidance and eleven structured research-information tools. */
export function apply(ctx: Context, config: Config = {}): void {
  const resolved = resolveConfig(config)
  ctx.systemPrompt.section({
    name: 'tool:research-information',
    order: 114,
    text: 'Create a research question before capturing evidence. Use paper_import, paper_library_register, and paper_read before research_evidence_capture; pass only document_id, block_id, and an optional exact quote because paper identity, parser provenance, page location, and hashes are derived from the retained runtime document. After capture, use research_note_write for authored notes or passage questions anchored to that evidence. A reading note is authored commentary, not a source statement; write a separate research_claim_write claim before using the material in a matrix, normalized entity, observation, comparison protocol, or synthesis. Record source statements separately from agent inferences, and never present an uncited inference as a source claim. Use research_entity_write to normalize active evidence-backed source statements whose facet matches method, dataset, or metric. An entity canonical name is authored normalization, not source text. Grouping claims under one entity records concept coreference only; it does not mean a paper adopts or endorses the entity, and it does not mean the claims agree. Use research_observation_write only for one paper-local result whose result, method, dataset, metric, split, evaluation-protocol, and condition references are explicitly recorded. Observation values, units, statistics, uncertainty, roles, and context are authored normalization, not quotations. A not-recorded unit, split, protocol, condition set, or uncertainty means the harness has not retained that fact; it never means zero, absent, or not reported by the paper. Use not-applicable only as a positive authored assertion: for unit it means dimensionless, and for split, evaluation protocol, conditions, or uncertainty it means the concept genuinely does not apply. The observations view lists raw observations in insertion order and may expose exact structural-alignment candidates, but a candidate is not a compatibility decision. Never convert units or aliases, average, calculate a delta, rank results, or infer statistical significance from raw observations or candidates. Only an active, non-stale research_comparison_protocol_write record explicitly authorizes describing its selected observations as compatible under its authored rationale; even then, statistical significance remains unassessed. Use research_question_get with view=notes to review notes in reading order, view=entities to retrieve normalized cross-paper groups, view=observations for raw normalized measurements, view=comparisons for explicit compatibility decisions, view=matrix to compare facets across papers, and view=audit to expose missing coverage, stale references, reimport requirements, unnormalized source claims, and uncited inference. Source-summary synthesis findings must cite active evidence-backed source-statement claims; a missing matrix cell means no captured source statement, not contrary evidence. Use research_review_render only with an explicit active synthesis id after checking the audit view. It deterministically renders stored findings, claims, evidence relations, exact anchors, and bibliography metadata as Markdown; it never writes state or generates new research prose. Selected quote text is omitted unless include_selected_quotes=true. Treat ready-with-warnings as requiring review before publication. Item and reference paging is deterministic: when a get result omits items or references, continue with the applicable offset, finding_offset, or reference_offset while preserving the same view and filters. Note text, selected observation decimals, and rendered review Markdown have continuation cursors. To follow a note next_text_offset, repeat the same question_id, view=notes, evidence_id filter, and item offset with max_items=1. To recover an exact decimal whose projection is truncated, repeat the exact observation filter, max_items=1, decimal_field, and next_decimal_text_offset. To follow a review next_text_offset, repeat the same question_id, synthesis_id, include_selected_quotes value, and render_digest. Other truncated text, including entity canonical names, observation context, and comparison rationale, has no text cursor.',
  })
  ctx.systemPrompt.section({
    name: 'tool:research-comparison-synthesis',
    order: 115,
    text: 'When a synthesis inference relies on a cross-paper comparison, pass its active, non-stale authored protocol in comparison_protocol_ids and include every member observation result claim in claim_ids. A comparison protocol is the recorded compatibility basis; it does not establish source agreement, calculate a difference, rank results, or assess statistical significance. The deterministic review expands each referenced protocol, its observations, and their evidence provenance.',
  })

  ctx.tools.register(defineTool({
    name: 'research_question_write',
    description: 'Create a durable research question or compare-and-set its title and initially editable question text. Question text locks after evidence, reading notes, claims, normalized entities, or synthesis exists. Authorship is derived from the owning agent session.',
    parameters: {
      action: { type: 'string', required: true, enum: ['create', 'update'], description: 'Create a new aggregate or update an existing framing.' },
      question_id: { type: 'string', description: 'Required for update; stable research-question UUID.' },
      revision: { type: 'integer', description: 'Required for update; exact current revision used for compare-and-set.' },
      title: { type: 'string', description: 'Required for create; optional replacement title for update.' },
      question: { type: 'string', description: 'Required for create; optional replacement on update only before the aggregate has research records.' },
    },
    output: outputDefinition('Research question write', 'dsh/research-question-write', MUTATION_OUTPUT_SCHEMA, resolved),
    async execute(args, exec): Promise<MutationOutput> {
      const author = agentAuthor(exec)
      let result: WriteResearchQuestionResult
      if (args.action === 'create') {
        if (args.question_id !== undefined || args.revision !== undefined) {
          throw new Error('question_id and revision are valid only when action=update')
        }
        if (args.title === undefined || args.question === undefined) {
          throw new Error('title and question are required when action=create')
        }
        result = await ctx.researchInformation.writeQuestion({
          action: 'create',
          title: args.title,
          question: args.question,
          author,
        })
      } else {
        if (args.question_id === undefined || args.revision === undefined) {
          throw new Error('question_id and revision are required when action=update')
        }
        if (args.title === undefined && args.question === undefined) {
          throw new Error('title or question is required when action=update')
        }
        result = await ctx.researchInformation.writeQuestion({
          action: 'update',
          questionId: parseQuestionId(args.question_id),
          expectedRevision: nonNegativeSafeInteger('revision', args.revision),
          ...(args.title === undefined ? {} : { title: args.title }),
          ...(args.question === undefined ? {} : { question: args.question }),
          author,
        })
      }
      return projectQuestionWrite(result, resolved)
    },
    presentCall(args): GenericCallView {
      return args.action === 'create'
        ? { card: 'generic', title: 'Create research question', kind: 'edit', rawInput: args.question }
        : { card: 'generic', title: `Update research question ${shortId(args.question_id ?? '')}`, kind: 'edit' }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'research_question_list',
    description: 'List or locally filter durable research questions with revision and active-record counts.',
    parameters: {
      query: { type: 'string', description: `Optional title or question query of at most ${resolved.maxQueryChars} normalized characters.` },
      max_results: { type: 'integer', description: `Optional result cap from 1 through ${resolved.maxListResults}.` },
    },
    output: outputDefinition('Research question list', 'dsh/research-question-list', LIST_OUTPUT_SCHEMA, resolved),
    isConcurrencySafe: () => true,
    execute(args): Promise<ListOutput> {
      const query = args.query === undefined ? undefined : normalizedQuery(args.query, resolved.maxQueryChars)
      const maximum = boundedOptionalCount('max_results', args.max_results, resolved.maxListResults)
      const all = ctx.researchInformation.list()
      const matches = query === undefined
        ? all
        : all.filter(record => comparableText(`${record.title}\n${record.question}`).includes(query))
      const retained = matches.slice(0, maximum)
      const budget = new ProjectionBudget(resolved)
      const projectedQuery = query === undefined ? undefined : budget.text(query)
      const questions = retained.map(record => projectQuestionSummary(record, budget))
      return Promise.resolve({
        ...(projectedQuery === undefined
          ? {}
          : { query: projectedQuery.value, query_truncated: projectedQuery.truncated }),
        questions,
        total_matches: matches.length,
        truncated: retained.length < matches.length || budget.truncated,
      })
    },
    presentCall(args): GenericCallView {
      return args.query === undefined
        ? { card: 'generic', title: 'List research questions', kind: 'read' }
        : { card: 'generic', title: `Search research questions: ${args.query}`, kind: 'search', rawInput: args.query }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'research_question_get',
    description: 'Read one question as a deterministically paged overview, reading notes, normalized entities, raw observations, explicit comparison protocols, facet-by-paper matrix, or current provenance and citation audit. Raw observations and structural candidates are never ranked or aggregated.',
    parameters: {
      question_id: { type: 'string', required: true, description: 'Stable research-question UUID.' },
      view: { type: 'string', enum: ['overview', 'notes', 'entities', 'observations', 'comparisons', 'matrix', 'audit'], description: 'Projection to return. Defaults to overview.' },
      evidence_id: { type: 'string', description: 'Optional exact evidence filter, valid only when view=notes.' },
      entity_kind: { type: 'string', enum: [...ENTITY_KINDS], description: 'Optional normalized entity kind filter, valid only when view=entities.' },
      entity_query: { type: 'string', description: `Optional canonical-name query of at most ${resolved.maxQueryChars} normalized characters, valid only when view=entities.` },
      observation_id: { type: 'string', description: 'Optional exact observation filter, valid only when view=observations.' },
      paper_id: { type: 'string', description: 'Optional exact paper filter, valid only when view=observations.' },
      method_entity_id: { type: 'string', description: 'Optional exact method-entity filter, valid only when view=observations.' },
      dataset_entity_id: { type: 'string', description: 'Optional exact dataset-entity filter, valid only when view=observations.' },
      metric_entity_id: { type: 'string', description: 'Optional exact metric-entity filter, valid only when view=observations.' },
      comparison_protocol_id: { type: 'string', description: 'Optional exact comparison-protocol filter, valid only when view=comparisons.' },
      decimal_field: { type: 'string', enum: [...OBSERVATION_DECIMAL_FIELDS], description: 'Optional exact decimal to page. Valid only for view=observations with observation_id and max_items=1.' },
      decimal_text_offset: { type: 'integer', description: 'Zero-based Unicode-code-point offset within decimal_field. Valid only when decimal_field is set; defaults to 0.' },
      offset: { type: 'integer', description: 'Zero-based top-level item offset. Defaults to 0.' },
      max_items: { type: 'integer', description: `Top-level item page size from 1 through ${resolved.maxItemsPerResult}. Defaults to ${resolved.maxItemsPerResult}.` },
      finding_offset: { type: 'integer', description: 'Zero-based finding offset within each returned synthesis. Defaults to 0.' },
      reference_offset: { type: 'integer', description: 'Zero-based offset in the deterministic reference stream for this page. Defaults to 0.' },
      text_offset: { type: 'integer', description: 'Zero-based Unicode-code-point offset within the one returned reading note. Valid only for view=notes with max_items=1; defaults to 0.' },
    },
    output: outputDefinition(
      'Research question',
      'dsh/research-question-get',
      GET_OUTPUT_SCHEMA,
      resolved,
      value => formatResearchQuestionGet(value, resolved.maxOutputTextChars),
    ),
    isConcurrencySafe: () => true,
    execute(args): Promise<GetOutput> {
      const questionId = parseQuestionId(args.question_id)
      const view = args.view ?? 'overview'
      if (args.evidence_id !== undefined && view !== 'notes') {
        throw new Error('evidence_id is valid only when view=notes')
      }
      if (args.entity_kind !== undefined && view !== 'entities') {
        throw new Error('entity_kind is valid only when view=entities')
      }
      if (args.entity_query !== undefined && view !== 'entities') {
        throw new Error('entity_query is valid only when view=entities')
      }
      const observationFilterFields = [
        ['observation_id', args.observation_id],
        ['paper_id', args.paper_id],
        ['method_entity_id', args.method_entity_id],
        ['dataset_entity_id', args.dataset_entity_id],
        ['metric_entity_id', args.metric_entity_id],
      ] as const
      for (const [field, value] of observationFilterFields) {
        if (value !== undefined && view !== 'observations') {
          throw new Error(`${field} is valid only when view=observations`)
        }
      }
      if (args.comparison_protocol_id !== undefined && view !== 'comparisons') {
        throw new Error('comparison_protocol_id is valid only when view=comparisons')
      }
      if (args.decimal_field !== undefined && view !== 'observations') {
        throw new Error('decimal_field is valid only when view=observations')
      }
      if (args.decimal_text_offset !== undefined && args.decimal_field === undefined) {
        throw new Error('decimal_text_offset requires decimal_field')
      }
      const noteEvidenceId = args.evidence_id === undefined ? undefined : parseEvidenceId(args.evidence_id)
      const entityQuery = args.entity_query === undefined
        ? undefined
        : normalizedQuery(args.entity_query, resolved.maxQueryChars, 'entity_query')
      const offset = nonNegativeSafeInteger('offset', args.offset ?? 0)
      const maxItems = boundedOptionalCount('max_items', args.max_items, resolved.maxItemsPerResult)
      const findingOffset = nonNegativeSafeInteger('finding_offset', args.finding_offset ?? 0)
      const referenceOffset = nonNegativeSafeInteger('reference_offset', args.reference_offset ?? 0)
      if (args.text_offset !== undefined && view !== 'notes') {
        throw new Error('text_offset is valid only when view=notes')
      }
      if (args.text_offset !== undefined && maxItems !== 1) {
        throw new Error('text_offset requires max_items=1')
      }
      const textOffset = nonNegativeSafeInteger('text_offset', args.text_offset ?? 0)
      if (args.decimal_field !== undefined && args.observation_id === undefined) {
        throw new Error('decimal_field requires observation_id')
      }
      if (args.decimal_field !== undefined && maxItems !== 1) {
        throw new Error('decimal_field requires max_items=1')
      }
      const decimalTextOffset = nonNegativeSafeInteger(
        'decimal_text_offset',
        args.decimal_text_offset ?? 0,
      )
      const observationId = args.observation_id === undefined
        ? undefined
        : parseObservationId(args.observation_id)
      const paperId = args.paper_id === undefined ? undefined : parsePaperId(args.paper_id)
      const methodEntityId = args.method_entity_id === undefined
        ? undefined
        : parseEntityId(args.method_entity_id, 'method_entity_id')
      const datasetEntityId = args.dataset_entity_id === undefined
        ? undefined
        : parseEntityId(args.dataset_entity_id, 'dataset_entity_id')
      const metricEntityId = args.metric_entity_id === undefined
        ? undefined
        : parseEntityId(args.metric_entity_id, 'metric_entity_id')
      const comparisonProtocolId = args.comparison_protocol_id === undefined
        ? undefined
        : parseComparisonProtocolId(args.comparison_protocol_id)
      const question = ctx.researchInformation.get(questionId)
      if (question === undefined) {
        return Promise.resolve({
          status: 'question-not-found',
          question_id: questionId,
          view,
          truncated: false,
        })
      }
      const budget = new ProjectionBudget(resolved, referenceOffset)
      if (view === 'notes') {
        const values = noteEvidenceId === undefined
          ? question.readingNotes
          : question.readingNotes.filter(note => note.evidenceId === noteEvidenceId)
        const page = pageItems(values, offset, maxItems)
        const activeNotes = activeReadingNoteIds(question)
        const projectedNotes = page.values.map(note =>
          projectReadingNote(
            note,
            activeNotes.has(note.id),
            question,
            budget,
            textOffset,
            resolved.maxOutputTextChars,
          ))
        const summary = projectQuestionSummary(question, budget)
        const itemPage = projectItemPage(page)
        const referencePage = budget.referencePage()
        const projectedNote = maxItems === 1 ? projectedNotes[0] : undefined
        const textPage = projectedNote === undefined
          ? {}
          : projectTextPage(projectedNote.textPage)
        return Promise.resolve({
          status: 'found',
          question_id: question.id,
          view,
          ...itemPage,
          ...referencePage,
          ...textPage,
          truncated: page.truncated || budget.truncated,
          question: summary,
          notes: projectedNotes.map(value => value.value),
          total_notes: values.length,
          notes_truncated: page.truncated,
        })
      }
      if (view === 'entities') {
        const activeClaims = activeClaimIds(question)
        const activeEntities = activeEntityIds(question)
        const values = question.entities.filter(entity =>
          (args.entity_kind === undefined || entity.kind === args.entity_kind)
          && (entityQuery === undefined || comparableText(entity.canonicalName).includes(entityQuery)))
        const page = pageItems(values, offset, maxItems)
        const entities = page.values.map(entity => projectEntity(
          entity,
          activeEntities.has(entity.id),
          activeClaims,
          question,
          budget,
        ))
        const projectedQuery = entityQuery === undefined ? undefined : budget.text(entityQuery)
        const summary = projectQuestionSummary(question, budget)
        const itemPage = projectItemPage(page)
        const referencePage = budget.referencePage()
        return Promise.resolve({
          status: 'found',
          question_id: question.id,
          view,
          ...itemPage,
          ...referencePage,
          truncated: page.truncated || budget.truncated,
          question: summary,
          entities,
          total_entities: values.length,
          entities_truncated: page.truncated,
          ...(args.entity_kind === undefined ? {} : { entity_kind: args.entity_kind }),
          ...(projectedQuery === undefined
            ? {}
            : {
              entity_query: projectedQuery.value,
              entity_query_truncated: projectedQuery.truncated,
            }),
        })
      }
      if (view === 'observations') {
        const state = observationProjectionState(question)
        const values = question.observations.filter(observation =>
          (observationId === undefined || observation.id === observationId)
          && (paperId === undefined || state.paperByObservation.get(observation.id) === paperId)
          && (methodEntityId === undefined || observation.method.entityId === methodEntityId)
          && (datasetEntityId === undefined || observation.dataset.entityId === datasetEntityId)
          && (metricEntityId === undefined || observation.metric.entityId === metricEntityId))
        const page = pageItems(values, offset, maxItems)
        const decimalPage = args.decimal_field === undefined || page.values[0] === undefined
          ? undefined
          : budget.pagedText(
            observationDecimalValue(page.values[0], args.decimal_field),
            decimalTextOffset,
            decimalTextRenderCapacity(
              observationDecimalValue(page.values[0], args.decimal_field),
              decimalTextOffset,
              resolved.maxOutputTextChars,
              page.values[0].id,
              args.decimal_field,
            ),
          )
        const observations = page.values.map(observation =>
          projectObservation(observation, state, budget))
        const summary = projectQuestionSummary(question, budget, state)
        const itemPage = projectItemPage(page)
        const referencePage = budget.referencePage()
        return Promise.resolve({
          status: 'found',
          question_id: question.id,
          view,
          ...itemPage,
          ...referencePage,
          truncated: page.truncated || budget.truncated,
          question: summary,
          observations,
          total_observations: values.length,
          observations_truncated: page.truncated,
          ...(observationId === undefined ? {} : { observation_id: observationId }),
          ...(paperId === undefined ? {} : { paper_id: paperId }),
          ...(methodEntityId === undefined ? {} : { method_entity_id: methodEntityId }),
          ...(datasetEntityId === undefined ? {} : { dataset_entity_id: datasetEntityId }),
          ...(metricEntityId === undefined ? {} : { metric_entity_id: metricEntityId }),
          ...(decimalPage === undefined || args.decimal_field === undefined
            ? {}
            : {
              decimal_field: args.decimal_field,
              decimal_text: decimalPage.value,
              decimal_text_offset: decimalPage.offset,
              returned_decimal_chars: decimalPage.returned,
              total_decimal_chars: decimalPage.total,
              ...(decimalPage.nextOffset === undefined
                ? {}
                : { next_decimal_text_offset: decimalPage.nextOffset }),
            }),
        })
      }
      if (view === 'comparisons') {
        const state = observationProjectionState(question)
        const activeProtocols = state.activeComparisonProtocols
        const values = question.comparisonProtocols.filter(protocol =>
          comparisonProtocolId === undefined || protocol.id === comparisonProtocolId)
        const page = pageItems(values, offset, maxItems)
        const comparisonProtocols = page.values.map(protocol => projectComparisonProtocol(
          protocol,
          activeProtocols.has(protocol.id),
          state,
          budget,
        ))
        const summary = projectQuestionSummary(question, budget, state)
        const itemPage = projectItemPage(page)
        const referencePage = budget.referencePage()
        return Promise.resolve({
          status: 'found',
          question_id: question.id,
          view,
          ...itemPage,
          ...referencePage,
          truncated: page.truncated || budget.truncated,
          question: summary,
          comparison_protocols: comparisonProtocols,
          total_comparison_protocols: values.length,
          comparison_protocols_truncated: page.truncated,
          ...(comparisonProtocolId === undefined
            ? {}
            : { comparison_protocol_id: comparisonProtocolId }),
        })
      }
      if (view === 'matrix') {
        const projected = projectMatrix(ctx, question, budget, offset, maxItems)
        const summary = projectQuestionSummary(question, budget)
        const itemPage = projectItemPage(projected.page)
        const referencePage = budget.referencePage()
        return Promise.resolve({
          status: 'found',
          question_id: question.id,
          view,
          ...itemPage,
          ...referencePage,
          truncated: projected.page.truncated || budget.truncated,
          question: summary,
          matrix: projected.value,
        })
      }
      if (view === 'audit') {
        const state = observationProjectionState(question)
        const projected = projectAudit(ctx, question, state, budget, offset, maxItems)
        const summary = projectQuestionSummary(question, budget, state)
        const itemPage = projectItemPage(projected.page)
        const referencePage = budget.referencePage()
        return Promise.resolve({
          status: 'found',
          question_id: question.id,
          view,
          ...itemPage,
          ...referencePage,
          truncated: projected.page.truncated || budget.truncated,
          question: summary,
          audit: projected.value,
        })
      }
      const activeClaims = activeClaimIds(question)
      const activeSyntheses = activeSynthesisIds(question)
      const items: readonly OverviewItem[] = [
        ...question.evidence.map(value => ({ kind: 'evidence' as const, value })),
        ...question.claims.map(value => ({ kind: 'claim' as const, value })),
        ...question.syntheses.map(value => ({ kind: 'synthesis' as const, value })),
      ]
      const page = pageItems(items, offset, maxItems)
      const evidenceValues = page.values.flatMap(item => item.kind === 'evidence' ? [item.value] : [])
      const claimValues = page.values.flatMap(item => item.kind === 'claim' ? [item.value] : [])
      const synthesisValues = page.values.flatMap(item => item.kind === 'synthesis' ? [item.value] : [])
      const evidenceProjection = budget.items(evidenceValues)
      const claimProjection = budget.items(claimValues)
      const evidence = evidenceProjection.values.map(value => projectEvidence(value, budget))
      const claims = claimProjection.values.map(value => projectClaim(value, activeClaims.has(value.id), budget))
      const syntheses = synthesisValues.map(value =>
        projectSynthesis(value, activeSyntheses.has(value.id), budget, findingOffset))
      const summary = projectQuestionSummary(question, budget)
      const itemPage = projectItemPage(page)
      const referencePage = budget.referencePage()
      return Promise.resolve({
        status: 'found',
        question_id: question.id,
        view,
        ...itemPage,
        ...referencePage,
        truncated: page.truncated || budget.truncated,
        question: summary,
        evidence,
        total_evidence: question.evidence.length,
        evidence_truncated: evidence.length < question.evidence.length,
        claims,
        total_claims: question.claims.length,
        claims_truncated: claims.length < question.claims.length,
        syntheses,
        total_syntheses: question.syntheses.length,
        syntheses_truncated: syntheses.length < question.syntheses.length,
      })
    },
    presentCall(args): GenericCallView {
      const view = args.view ?? 'overview'
      return {
        card: 'generic',
        title: `Read research ${view} ${shortId(args.question_id)}`,
        kind: 'read',
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'research_review_render',
    description: 'Deterministically render one explicit active synthesis as digest-bound paged Markdown with claim labels, authored comparison bases, raw observations, evidence relations, exact source anchors, opt-in selected text, bibliography metadata, and readiness warnings. It does not calculate comparisons, generate prose, or write research state.',
    parameters: {
      question_id: { type: 'string', required: true, description: 'Stable research-question UUID.' },
      synthesis_id: { type: 'string', required: true, description: 'Explicit active synthesis UUID to render.' },
      include_selected_quotes: { type: 'boolean', description: 'Disclose exact retained selection text. Defaults to false; anchors and selection hashes remain available either way.' },
      text_offset: { type: 'integer', description: 'Zero-based Unicode-code-point offset in the rendered Markdown. Defaults to 0.' },
      render_digest: { type: 'string', description: 'Required with a nonzero text_offset; exact digest returned by the first page.' },
    },
    output: outputDefinition(
      'Research review render',
      'dsh/research-review-render',
      REVIEW_RENDER_OUTPUT_SCHEMA,
      resolved,
      value => formatReviewRender(value as ReviewRenderOutput),
    ),
    isConcurrencySafe: () => true,
    execute(args): Promise<ReviewRenderOutput> {
      const questionId = parseQuestionId(args.question_id)
      const synthesisId = parseSynthesisId(args.synthesis_id)
      const textOffset = nonNegativeSafeInteger('text_offset', args.text_offset ?? 0)
      const includeSelectedQuotes = args.include_selected_quotes ?? false
      const rendered = renderResearchReview(
        ctx.researchInformation.get(questionId),
        synthesisId,
        {
          paper: paperId => ctx.researchLibrary.get(paperId),
          evidenceCoverage: evidence => evidenceCoverage(ctx, evidence),
        },
        {
          includeSelectedQuotes,
          maxCharacters: resolved.maxReviewTextChars,
          maxWarnings: resolved.maxReferencesPerResult,
        },
      )
      const markdown = rendered.markdown ?? ''
      const renderDigest = `sha256:${hashText(markdown)}`
      const expectedDigest = args.render_digest === undefined
        ? undefined
        : parseRenderDigest(args.render_digest)
      if (textOffset > 0 && expectedDigest === undefined) {
        throw new Error('render_digest is required when text_offset is greater than zero')
      }
      if (expectedDigest !== undefined && expectedDigest !== renderDigest) {
        throw new Error('render changed since the previous page; restart with text_offset=0')
      }
      const capacity = rendered.status === 'not-ready'
        ? resolved.maxOutputTextChars
        : reviewTextRenderCapacity(
          markdown,
          textOffset,
          resolved.maxOutputTextChars,
          rendered.status,
          renderDigest,
        )
      const page = pageText(markdown, textOffset, capacity)
      const projectedWarnings = textOffset === 0
        ? rendered.warnings.map(projectReviewWarning)
        : []
      return Promise.resolve({
        status: rendered.status,
        question_id: questionId,
        synthesis_id: synthesisId,
        warnings: projectedWarnings,
        total_warnings: rendered.warnings.length,
        warnings_omitted: textOffset > 0 && rendered.warnings.length > 0,
        markdown: page.value,
        render_digest: renderDigest,
        ...projectTextPage(page),
        truncated: page.truncated,
      })
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Render research review ${shortId(args.synthesis_id)}`,
        kind: 'read',
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'research_evidence_capture',
    description: 'Capture one exact retained block, or one uniquely occurring exact quote within it. Durable paper, source, parser, locator, page, and hash provenance is derived rather than accepted as model input.',
    parameters: {
      question_id: { type: 'string', required: true, description: 'Target research-question UUID.' },
      revision: { type: 'integer', required: true, description: 'Exact current question revision.' },
      document_id: { type: 'string', required: true, description: 'Currently retained paper_import sha256 id.' },
      block_id: { type: 'string', required: true, description: 'Exact block id returned by paper_read, paper_search, or paper_outline.' },
      quote: { type: 'string', description: 'Optional exact text that must occur exactly once in the complete block.' },
    },
    output: outputDefinition('Research evidence capture', 'dsh/research-evidence-capture', MUTATION_OUTPUT_SCHEMA, resolved),
    async execute(args, exec): Promise<MutationOutput> {
      const author = agentAuthor(exec)
      const questionId = parseQuestionId(args.question_id)
      const expectedRevision = nonNegativeSafeInteger('revision', args.revision)
      const documentId = parseDocumentId(args.document_id)
      const blockId = parseBlockId(args.block_id)
      const question = ctx.researchInformation.get(questionId)
      if (question === undefined) {
        return { status: 'question-not-found', question_id: questionId, truncated: false }
      }
      if (question.revision !== expectedRevision) {
        return {
          status: 'stale-revision',
          question_id: questionId,
          expected_revision: expectedRevision,
          current_revision: question.revision,
          truncated: false,
        }
      }
      const document = ctx.researchDocuments.peek(documentId)
      if (document === undefined) {
        return runtimeCaptureFailure('reimport-required', questionId, documentId, blockId)
      }
      const paper = ctx.researchLibrary.findByDocumentId(documentId)
      if (paper === undefined) {
        return runtimeCaptureFailure('document-not-registered', questionId, documentId, blockId)
      }
      const source = paper.sourceVersions.find(value => value.documentId === documentId)
      if (source === undefined) {
        return runtimeCaptureFailure('document-not-registered', questionId, documentId, blockId)
      }
      const observed = source.observations.some(value =>
        value.parserId === document.parser.id && value.parserVersion === document.parser.version)
      if (!observed) {
        return runtimeCaptureFailure('parser-observation-missing', questionId, documentId, blockId)
      }
      if (document.extraction.text === 'none') {
        return runtimeCaptureFailure('needs-ocr', questionId, documentId, blockId)
      }
      const block = findBlock(document, blockId)
      if (block === undefined) {
        return runtimeCaptureFailure('block-not-found', questionId, documentId, blockId)
      }
      const selection = args.quote === undefined
        ? undefined
        : exactSelection(args.quote, block.text)
      if (selection !== undefined && 'status' in selection) {
        return {
          ...runtimeCaptureFailure(selection.status, questionId, documentId, blockId),
          matches: selection.matches,
        }
      }
      const result = await ctx.researchInformation.captureEvidence({
        questionId,
        expectedRevision,
        paperId: paper.id,
        sourceVersionId: source.id,
        locator: block.locator,
        blockText: block.text,
        sectionPath: block.sectionPath,
        ...(selection === undefined ? {} : { selection }),
        author,
      })
      return projectEvidenceCapture(result, documentId, blockId, resolved)
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Capture evidence for ${shortId(args.question_id)}`,
        kind: 'edit',
        rawInput: args.quote ?? args.block_id,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'research_note_write',
    description: 'Append an immutable evidence-anchored authored note or passage question, optionally superseding one active note of the same kind. Authored commentary is not a source statement.',
    parameters: {
      question_id: { type: 'string', required: true, description: 'Target research-question UUID.' },
      revision: { type: 'integer', required: true, description: 'Exact current question revision.' },
      kind: { type: 'string', required: true, enum: ['note', 'passage-question'], description: 'Authored reading note or a question about an exactly selected passage.' },
      text: { type: 'string', required: true, description: 'Authored commentary; internal line breaks and Markdown are retained.' },
      evidence_id: { type: 'string', required: true, description: 'Exact captured evidence anchor. Passage questions require evidence with selected text.' },
      supersedes_note_id: { type: 'string', description: 'Optional active reading note of the same kind to supersede.' },
    },
    output: outputDefinition('Research note write', 'dsh/research-note-write', MUTATION_OUTPUT_SCHEMA, resolved),
    async execute(args, exec): Promise<MutationOutput> {
      const result = await ctx.researchInformation.writeReadingNote({
        questionId: parseQuestionId(args.question_id),
        expectedRevision: nonNegativeSafeInteger('revision', args.revision),
        kind: args.kind,
        text: args.text,
        evidenceId: parseEvidenceId(args.evidence_id),
        ...(args.supersedes_note_id === undefined
          ? {}
          : { supersedes: parseReadingNoteId(args.supersedes_note_id) }),
        author: agentAuthor(exec),
      })
      return projectReadingNoteWrite(result, resolved)
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Write research ${args.kind} for ${shortId(args.question_id)}`,
        kind: 'edit',
        rawInput: args.text,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'research_claim_write',
    description: 'Append an immutable evidence-linked source statement or explicitly labelled inference, optionally superseding one active claim.',
    parameters: {
      question_id: { type: 'string', required: true, description: 'Target research-question UUID.' },
      revision: { type: 'integer', required: true, description: 'Exact current question revision.' },
      kind: { type: 'string', required: true, enum: ['source-statement', 'inference'], description: 'Whether the text reports a source or is an authored inference.' },
      facet: { type: 'string', required: true, enum: [...FACETS], description: 'Comparison facet.' },
      other_facet: { type: 'string', description: 'Required exactly when facet=other.' },
      text: { type: 'string', required: true, description: 'Atomic claim text.' },
      evidence_links: {
        type: 'array',
        required: true,
        description: 'Exact evidence relations. Source statements require at least one and may cite only one paper.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            evidence_id: { type: 'string', required: true },
            relation: { type: 'string', required: true, enum: ['supports', 'contradicts', 'qualifies', 'background'] },
          },
        },
      },
      supersedes_claim_id: { type: 'string', description: 'Optional active claim of the same kind to supersede.' },
    },
    output: outputDefinition('Research claim write', 'dsh/research-claim-write', MUTATION_OUTPUT_SCHEMA, resolved),
    async execute(args, exec): Promise<MutationOutput> {
      const result = await ctx.researchInformation.writeClaim({
        questionId: parseQuestionId(args.question_id),
        expectedRevision: nonNegativeSafeInteger('revision', args.revision),
        kind: args.kind,
        facet: args.facet,
        ...(args.other_facet === undefined ? {} : { otherFacet: args.other_facet }),
        text: args.text,
        evidenceLinks: args.evidence_links.map(link => ({
          evidenceId: parseEvidenceId(link.evidence_id),
          relation: link.relation,
        })),
        ...(args.supersedes_claim_id === undefined
          ? {}
          : { supersedes: parseClaimId(args.supersedes_claim_id) }),
        author: agentAuthor(exec),
      })
      return projectClaimWrite(result, resolved)
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Write ${args.kind} for ${shortId(args.question_id)}`,
        kind: 'edit',
        rawInput: args.text,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'research_entity_write',
    description: 'Append an immutable authored normalization over active evidence-backed source statements of one method, dataset, or metric facet, optionally superseding one or more active entities of the same kind.',
    parameters: {
      question_id: { type: 'string', required: true, description: 'Target research-question UUID.' },
      revision: { type: 'integer', required: true, description: 'Exact current question revision.' },
      kind: { type: 'string', required: true, enum: [...ENTITY_KINDS], description: 'Normalized comparison entity kind.' },
      canonical_name: { type: 'string', required: true, description: 'Author-supplied normalized name; this is interpretation, not source text.' },
      source_claim_ids: { type: 'array', required: true, items: { type: 'string' }, description: 'One or more active evidence-backed source-statement claims whose facet matches kind.' },
      supersedes_entity_ids: { type: 'array', items: { type: 'string' }, description: 'Optional active entities of the same kind to supersede when merging or correcting normalized groups.' },
    },
    output: outputDefinition('Research entity write', 'dsh/research-entity-write', MUTATION_OUTPUT_SCHEMA, resolved),
    async execute(args, exec): Promise<MutationOutput> {
      const result = await ctx.researchInformation.writeEntity({
        questionId: parseQuestionId(args.question_id),
        expectedRevision: nonNegativeSafeInteger('revision', args.revision),
        kind: args.kind,
        canonicalName: args.canonical_name,
        sourceClaimIds: args.source_claim_ids.map(value => parseClaimId(value)),
        ...(args.supersedes_entity_ids === undefined
          ? {}
          : { supersedes: args.supersedes_entity_ids.map(value => parseEntityId(value)) }),
        author: agentAuthor(exec),
      })
      return projectEntityWrite(result, resolved)
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Normalize research ${args.kind} for ${shortId(args.question_id)}`,
        kind: 'edit',
        rawInput: args.canonical_name,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'research_observation_write',
    description: 'Append one immutable paper-local authored normalization of a reported result. Every method, dataset, metric, split, protocol, and condition association carries the same-paper source claim that supports it; not-recorded fields remain explicit.',
    parameters: {
      question_id: { type: 'string', required: true, description: 'Target research-question UUID.' },
      revision: { type: 'integer', required: true, description: 'Exact current question revision.' },
      result_claim_id: { type: 'string', required: true, description: 'Active evidence-backed result source statement for exactly one paper.' },
      method: {
        type: 'object',
        required: true,
        additionalProperties: false,
        description: 'Normalized method and the same-paper entity-member claim establishing its role in this observation.',
        properties: {
          entity_id: { type: 'string', required: true },
          source_claim_id: { type: 'string', required: true },
          role: { type: 'string', required: true, enum: [...METHOD_ROLES] },
          other_role: { type: 'string', description: 'Required exactly when role=other.' },
        },
      },
      dataset: {
        type: 'object',
        required: true,
        additionalProperties: false,
        description: 'Normalized dataset, its same-paper entity-member claim, and an explicitly represented split.',
        properties: {
          entity_id: { type: 'string', required: true },
          source_claim_id: { type: 'string', required: true },
          split: {
            type: 'object',
            required: true,
            additionalProperties: false,
            properties: {
              status: { type: 'string', required: true, enum: ['reported', 'not-recorded', 'not-applicable'], description: 'Use not-applicable only when a dataset split genuinely does not apply; use not-recorded when the split is unknown or not retained.' },
              value: { type: 'string', description: 'Required exactly when status=reported.' },
              source_claim_id: { type: 'string', description: 'Required exactly when status=reported; same-paper source claim for the split.' },
            },
          },
        },
      },
      metric: {
        type: 'object',
        required: true,
        additionalProperties: false,
        description: 'Normalized metric and the same-paper entity-member claim establishing the metric association.',
        properties: {
          entity_id: { type: 'string', required: true },
          source_claim_id: { type: 'string', required: true },
        },
      },
      value: { type: 'string', required: true, description: 'Finite canonical decimal point estimate. Pass source scale exactly; the tool performs no unit conversion.' },
      unit: {
        type: 'object',
        required: true,
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true, enum: ['reported', 'not-recorded', 'not-applicable'], description: 'Use not-applicable only for a dimensionless metric; use not-recorded when the unit is unknown or not retained.' },
          symbol: { type: 'string', description: 'Case-sensitive normalized symbol, required exactly when status=reported.' },
        },
      },
      value_statistic: { type: 'string', required: true, description: 'Authored normalized statistic such as mean, median, or single-run; exact equality is required for structural alignment.' },
      evaluation_protocol: {
        type: 'object',
        required: true,
        additionalProperties: false,
        properties: {
          status: { type: 'string', required: true, enum: ['reported', 'not-recorded', 'not-applicable'], description: 'Use not-applicable only when an evaluation protocol genuinely does not apply; use not-recorded when it is unknown or not retained.' },
          value: { type: 'string', description: 'Required exactly when status=reported.' },
          source_claim_id: { type: 'string', description: 'Required exactly when status=reported; same-paper source claim for the protocol.' },
        },
      },
      uncertainty: {
        type: 'object',
        required: true,
        additionalProperties: false,
        description: 'Explicit uncertainty. not-recorded means only that the harness has not retained uncertainty and never means zero.',
        properties: {
          status: { type: 'string', required: true, enum: ['reported', 'not-recorded', 'not-applicable'], description: 'Use not-applicable only when uncertainty genuinely does not apply; use not-recorded when it is unknown or not retained.' },
          kind: { type: 'string', enum: ['standard-deviation', 'standard-error', 'unspecified-plus-minus', 'confidence-interval', 'range'] },
          magnitude: { type: 'string' },
          lower: { type: 'string' },
          upper: { type: 'string' },
          confidence_level_percent: { type: 'string' },
        },
      },
      conditions: {
        type: 'object',
        required: true,
        additionalProperties: false,
        description: 'Explicit condition coverage. Every reported condition cites a same-paper source claim.',
        properties: {
          status: { type: 'string', required: true, enum: ['reported', 'not-recorded', 'not-applicable'], description: 'Use not-applicable only when experimental conditions genuinely do not apply; use not-recorded when they are unknown or not retained.' },
          values: {
            type: 'array',
            description: 'Required exactly when status=reported; condition names are unique after normalization.',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                name: { type: 'string', required: true },
                value: { type: 'string', required: true },
                source_claim_id: { type: 'string', required: true },
                comparison_role: { type: 'string', required: true, enum: ['must-match', 'descriptive'] },
              },
            },
          },
        },
      },
      supersedes_observation_id: { type: 'string', description: 'Optional active same-paper observation to supersede.' },
    },
    output: outputDefinition('Research observation write', 'dsh/research-observation-write', MUTATION_OUTPUT_SCHEMA, resolved),
    async execute(args, exec): Promise<MutationOutput> {
      const result = await ctx.researchInformation.writeObservation({
        questionId: parseQuestionId(args.question_id),
        expectedRevision: nonNegativeSafeInteger('revision', args.revision),
        resultClaimId: parseClaimId(args.result_claim_id, 'result_claim_id'),
        method: {
          entityId: parseEntityId(args.method.entity_id, 'method.entity_id'),
          sourceClaimId: parseClaimId(args.method.source_claim_id, 'method.source_claim_id'),
          role: args.method.role,
          ...parseOtherMethodRole(args.method.role, args.method.other_role),
        },
        dataset: {
          entityId: parseEntityId(args.dataset.entity_id, 'dataset.entity_id'),
          sourceClaimId: parseClaimId(args.dataset.source_claim_id, 'dataset.source_claim_id'),
          split: parseReportedContext(args.dataset.split, 'dataset.split'),
        },
        metric: {
          entityId: parseEntityId(args.metric.entity_id, 'metric.entity_id'),
          sourceClaimId: parseClaimId(args.metric.source_claim_id, 'metric.source_claim_id'),
        },
        value: ResearchDecimal(args.value),
        unit: parseObservationUnit(args.unit),
        valueStatistic: args.value_statistic,
        evaluationProtocol: parseReportedContext(args.evaluation_protocol, 'evaluation_protocol'),
        uncertainty: parseObservationUncertainty(args.uncertainty),
        conditions: parseObservationConditions(args.conditions),
        ...(args.supersedes_observation_id === undefined
          ? {}
          : { supersedes: parseObservationId(args.supersedes_observation_id) }),
        author: agentAuthor(exec),
      })
      return projectObservationWrite(result, resolved)
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Normalize reported observation for ${shortId(args.question_id)}`,
        kind: 'edit',
        rawInput: `${args.value} ${args.unit.status === 'reported' ? args.unit.symbol ?? '' : args.unit.status}`.trim(),
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'research_comparison_protocol_write',
    description: 'Record one immutable authored compatibility decision over at least two active non-stale observations from distinct papers. The service requires exact dataset, metric, unit, split, value-statistic, evaluation-protocol, and must-match-condition alignment and performs no conversions or aliasing.',
    parameters: {
      question_id: { type: 'string', required: true, description: 'Target research-question UUID.' },
      revision: { type: 'integer', required: true, description: 'Exact current question revision.' },
      observation_ids: { type: 'array', required: true, items: { type: 'string' }, description: 'Two or more active non-stale observations spanning at least two papers.' },
      direction: { type: 'string', required: true, enum: [...COMPARISON_DIRECTIONS], description: 'Authored interpretation of point-estimate direction; it does not establish significance.' },
      reference_observation_id: { type: 'string', description: 'Optional selected member used only as an explicit reference; no delta is calculated automatically.' },
      compatibility_rationale: { type: 'string', required: true, description: 'Authored rationale for treating the structurally aligned observations as compatible.' },
      supersedes_comparison_protocol_id: { type: 'string', description: 'Optional active comparison protocol to supersede.' },
    },
    output: outputDefinition(
      'Research comparison protocol write',
      'dsh/research-comparison-protocol-write',
      MUTATION_OUTPUT_SCHEMA,
      resolved,
    ),
    async execute(args, exec): Promise<MutationOutput> {
      const result = await ctx.researchInformation.writeComparisonProtocol({
        questionId: parseQuestionId(args.question_id),
        expectedRevision: nonNegativeSafeInteger('revision', args.revision),
        observationIds: args.observation_ids.map(value => parseObservationId(value)),
        direction: args.direction,
        ...(args.reference_observation_id === undefined
          ? {}
          : { referenceObservationId: parseObservationId(args.reference_observation_id) }),
        compatibilityRationale: args.compatibility_rationale,
        ...(args.supersedes_comparison_protocol_id === undefined
          ? {}
          : { supersedes: parseComparisonProtocolId(args.supersedes_comparison_protocol_id) }),
        author: agentAuthor(exec),
      })
      return projectComparisonProtocolWrite(result, resolved)
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Record comparison protocol for ${shortId(args.question_id)}`,
        kind: 'edit',
        rawInput: args.compatibility_rationale,
      }
    },
  }))

  ctx.tools.register(defineTool({
    name: 'research_synthesis_write',
    description: 'Append immutable structured synthesis findings over active claims. Source summaries require evidence-backed source statements. A quantitative cross-paper inference may name active, non-stale authored comparison protocols and must cite every member observation result claim.',
    parameters: {
      question_id: { type: 'string', required: true, description: 'Target research-question UUID.' },
      revision: { type: 'integer', required: true, description: 'Exact current question revision.' },
      findings: {
        type: 'array',
        required: true,
        description: 'One or more independently citeable findings.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            kind: { type: 'string', required: true, enum: ['source-summary', 'inference'] },
            stance: { type: 'string', required: true, enum: ['agreement', 'conflict', 'qualification', 'open-question'] },
            text: { type: 'string', required: true },
            claim_ids: { type: 'array', required: true, items: { type: 'string' } },
            comparison_protocol_ids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional authored comparison bases for an inference. Omit when empty; source summaries cannot reference a protocol.',
            },
          },
        },
      },
      supersedes_synthesis_id: { type: 'string', description: 'Optional active synthesis to supersede.' },
    },
    output: outputDefinition('Research synthesis write', 'dsh/research-synthesis-write', MUTATION_OUTPUT_SCHEMA, resolved),
    async execute(args, exec): Promise<MutationOutput> {
      const result = await ctx.researchInformation.writeSynthesis({
        questionId: parseQuestionId(args.question_id),
        expectedRevision: nonNegativeSafeInteger('revision', args.revision),
        findings: args.findings.map(finding => ({
          kind: finding.kind,
          stance: finding.stance,
          text: finding.text,
          claimIds: finding.claim_ids.map(value => parseClaimId(value)),
          comparisonProtocolIds: (finding.comparison_protocol_ids ?? [])
            .map(value => parseComparisonProtocolId(value)),
        })),
        ...(args.supersedes_synthesis_id === undefined
          ? {}
          : { supersedes: parseSynthesisId(args.supersedes_synthesis_id) }),
        author: agentAuthor(exec),
      })
      return projectSynthesisWrite(result, resolved)
    },
    presentCall(args): GenericCallView {
      return {
        card: 'generic',
        title: `Write synthesis for ${shortId(args.question_id)}`,
        kind: 'edit',
        rawInput: args.findings,
      }
    },
  }))
}

function outputDefinition<const S extends ValueSchemaSpec>(
  label: string,
  kind: string,
  schema: S,
  config: ResolvedConfig,
  render: (value: JsonValue) => string = value => formatJson(label, value, config.maxOutputTextChars),
) {
  return {
    schema,
    render: (_args: unknown, value: JsonValue) => [{
      type: 'text' as const,
      text: render(value),
    }],
    presentationMeta: (_args: unknown, value: JsonValue): JsonValue => taggedMeta(kind, value),
  }
}

function projectQuestionWrite(result: WriteResearchQuestionResult, config: ResolvedConfig): MutationOutput {
  if (result.status === 'created' || result.status === 'updated' || result.status === 'unchanged') {
    const budget = new ProjectionBudget(config)
    const question = projectQuestionSummary(result.question, budget)
    return {
      status: result.status,
      question_id: result.question.id,
      revision: result.question.revision,
      question,
      truncated: budget.truncated,
    }
  }
  return projectMutationFailure(result as MutationFailure, config)
}

function projectEvidenceCapture(
  result: CaptureResearchEvidenceResult,
  documentId: ReturnType<typeof ResearchDocumentId>,
  blockId: ReturnType<typeof ResearchDocumentBlockId>,
  config: ResolvedConfig,
): MutationOutput {
  if (result.status === 'created' || result.status === 'unchanged') {
    const budget = new ProjectionBudget(config)
    const question = projectQuestionSummary(result.question, budget)
    return {
      status: result.status,
      question_id: result.question.id,
      revision: result.question.revision,
      evidence_id: result.evidenceId,
      document_id: documentId,
      block_id: blockId,
      question,
      truncated: budget.truncated,
    }
  }
  return {
    ...projectMutationFailure(result as MutationFailure, config),
    document_id: documentId,
    block_id: blockId,
  }
}

function projectClaimWrite(result: WriteResearchClaimResult, config: ResolvedConfig): MutationOutput {
  if (result.status === 'created') {
    const budget = new ProjectionBudget(config)
    const question = projectQuestionSummary(result.question, budget)
    return {
      status: result.status,
      question_id: result.question.id,
      revision: result.question.revision,
      claim_id: result.claimId,
      question,
      truncated: budget.truncated,
    }
  }
  return projectMutationFailure(result, config)
}

function projectEntityWrite(result: WriteResearchEntityResult, config: ResolvedConfig): MutationOutput {
  if (result.status === 'created') {
    const budget = new ProjectionBudget(config)
    const question = projectQuestionSummary(result.question, budget)
    return {
      status: result.status,
      question_id: result.question.id,
      revision: result.question.revision,
      entity_id: result.entityId,
      question,
      truncated: budget.truncated,
    }
  }
  return projectMutationFailure(result, config)
}

function projectObservationWrite(
  result: WriteResearchObservationResult,
  config: ResolvedConfig,
): MutationOutput {
  if (result.status === 'created') {
    const budget = new ProjectionBudget(config)
    const question = projectQuestionSummary(result.question, budget)
    return {
      status: result.status,
      question_id: result.question.id,
      revision: result.question.revision,
      observation_id: result.observationId,
      question,
      truncated: budget.truncated,
    }
  }
  return projectMutationFailure(result, config)
}

function projectComparisonProtocolWrite(
  result: WriteResearchComparisonProtocolResult,
  config: ResolvedConfig,
): MutationOutput {
  if (result.status === 'created') {
    const budget = new ProjectionBudget(config)
    const question = projectQuestionSummary(result.question, budget)
    return {
      status: result.status,
      question_id: result.question.id,
      revision: result.question.revision,
      comparison_protocol_id: result.comparisonProtocolId,
      question,
      truncated: budget.truncated,
    }
  }
  return projectMutationFailure(result, config)
}

function projectReadingNoteWrite(
  result: WriteResearchReadingNoteResult,
  config: ResolvedConfig,
): MutationOutput {
  if (result.status === 'created') {
    const budget = new ProjectionBudget(config)
    const question = projectQuestionSummary(result.question, budget)
    return {
      status: result.status,
      question_id: result.question.id,
      revision: result.question.revision,
      note_id: result.readingNoteId,
      question,
      truncated: budget.truncated,
    }
  }
  return projectMutationFailure(result, config)
}

function projectSynthesisWrite(result: WriteResearchSynthesisResult, config: ResolvedConfig): MutationOutput {
  if (result.status === 'created') {
    const budget = new ProjectionBudget(config)
    const question = projectQuestionSummary(result.question, budget)
    return {
      status: result.status,
      question_id: result.question.id,
      revision: result.question.revision,
      synthesis_id: result.synthesisId,
      question,
      truncated: budget.truncated,
    }
  }
  return projectMutationFailure(result, config)
}

function projectMutationFailure(
  result: MutationFailure,
  config: ResolvedConfig,
): MutationOutput {
  switch (result.status) {
    case 'question-not-found':
    case 'question-text-locked':
      return { status: result.status, question_id: result.questionId, truncated: false }
    case 'stale-revision':
      return {
        status: result.status,
        question_id: result.questionId,
        expected_revision: result.expectedRevision,
        current_revision: result.currentRevision,
        truncated: false,
      }
    case 'capacity':
      return { status: result.status, resource: result.resource, truncated: false }
    case 'paper-not-found':
      return { status: result.status, paper_id: result.paperId, truncated: false }
    case 'source-not-found':
      return {
        status: result.status,
        paper_id: result.paperId,
        source_version_id: result.sourceVersionId,
        truncated: false,
      }
    case 'provenance-mismatch':
      return { status: result.status, reason: result.reason, truncated: false }
    case 'evidence-not-found':
      return { status: result.status, evidence_id: result.evidenceId, truncated: false }
    case 'passage-question-selection-required':
      return { status: result.status, evidence_id: result.evidenceId, truncated: false }
    case 'supersedes-reading-note-not-found':
    case 'supersedes-reading-note-inactive':
    case 'supersedes-reading-note-kind-mismatch':
      return { status: result.status, note_id: result.readingNoteId, truncated: false }
    case 'source-claim-uncited':
      return { status: result.status, truncated: false }
    case 'source-evidence-paper-mismatch':
    case 'comparison-insufficient-papers': {
      const budget = new ProjectionBudget(config)
      const paperIds = budget.references(result.paperIds)
      return {
        status: result.status,
        paper_ids: paperIds.values.map(String),
        total_papers: result.paperIds.length,
        paper_ids_truncated: paperIds.truncated,
        truncated: budget.truncated,
      }
    }
    case 'supersedes-claim-not-found':
    case 'supersedes-claim-inactive':
    case 'supersedes-claim-kind-mismatch':
    case 'claim-not-found':
    case 'claim-inactive':
      return { status: result.status, claim_id: result.claimId, truncated: false }
    case 'entity-claim-kind-mismatch':
    case 'entity-claim-uncited':
      return { status: result.status, claim_id: result.claimId, truncated: false }
    case 'entity-claim-facet-mismatch':
      return {
        status: result.status,
        claim_id: result.claimId,
        entity_kind: result.entityKind,
        claim_facet: result.claimFacet,
        truncated: false,
      }
    case 'observation-claim-not-found':
    case 'observation-claim-inactive':
    case 'observation-claim-kind-mismatch':
    case 'observation-claim-uncited':
      return {
        status: result.status,
        claim_role: result.claimRole,
        claim_id: result.claimId,
        truncated: false,
      }
    case 'observation-claim-facet-mismatch':
      return {
        status: result.status,
        claim_role: result.claimRole,
        claim_id: result.claimId,
        claim_facet: result.claimFacet,
        truncated: false,
      }
    case 'observation-claim-paper-mismatch':
      return {
        status: result.status,
        claim_role: result.claimRole,
        claim_id: result.claimId,
        paper_id: result.paperId,
        truncated: false,
      }
    case 'observation-entity-not-found':
    case 'observation-entity-inactive':
      return {
        status: result.status,
        entity_role: result.entityRole,
        entity_id: result.entityId,
        truncated: false,
      }
    case 'observation-entity-stale': {
      const budget = new ProjectionBudget(config)
      const staleClaims = budget.references(result.staleClaimIds)
      return {
        status: result.status,
        entity_role: result.entityRole,
        entity_id: result.entityId,
        stale_claim_ids: staleClaims.values.map(String),
        total_stale_claims: result.staleClaimIds.length,
        stale_claim_ids_truncated: staleClaims.truncated,
        truncated: budget.truncated,
      }
    }
    case 'observation-entity-kind-mismatch':
      return {
        status: result.status,
        entity_role: result.entityRole,
        entity_id: result.entityId,
        entity_kind: result.entityKind,
        truncated: false,
      }
    case 'observation-entity-claim-mismatch':
      return {
        status: result.status,
        entity_role: result.entityRole,
        entity_id: result.entityId,
        claim_id: result.claimId,
        truncated: false,
      }
    case 'supersedes-observation-not-found':
    case 'supersedes-observation-inactive':
    case 'supersedes-observation-paper-mismatch':
    case 'observation-not-found':
    case 'observation-inactive':
    case 'observation-stale':
    case 'reference-observation-not-member':
      return { status: result.status, observation_id: result.observationId, truncated: false }
    case 'comparison-field-not-recorded':
    case 'comparison-dimension-mismatch':
      return {
        status: result.status,
        observation_id: result.observationId,
        dimension: result.dimension,
        truncated: false,
      }
    case 'supersedes-comparison-protocol-not-found':
    case 'supersedes-comparison-protocol-inactive':
      return {
        status: result.status,
        comparison_protocol_id: result.comparisonProtocolId,
        truncated: false,
      }
    case 'supersedes-entity-not-found':
    case 'supersedes-entity-inactive':
    case 'supersedes-entity-kind-mismatch':
      return { status: result.status, entity_id: result.entityId, truncated: false }
    case 'source-summary-uncited':
      return { status: result.status, finding_index: result.findingIndex, truncated: false }
    case 'source-summary-claim-kind-mismatch':
      return {
        status: result.status,
        finding_index: result.findingIndex,
        claim_id: result.claimId,
        truncated: false,
      }
    case 'comparison-protocol-not-found':
    case 'comparison-protocol-inactive':
    case 'comparison-protocol-stale':
    case 'comparison-protocol-finding-kind-mismatch':
      return {
        status: result.status,
        finding_index: result.findingIndex,
        comparison_protocol_id: result.comparisonProtocolId,
        truncated: false,
      }
    case 'comparison-protocol-result-claim-missing':
      return {
        status: result.status,
        finding_index: result.findingIndex,
        comparison_protocol_id: result.comparisonProtocolId,
        claim_id: result.claimId,
        truncated: false,
      }
    case 'supersedes-synthesis-not-found':
    case 'supersedes-synthesis-inactive':
      return { status: result.status, synthesis_id: result.synthesisId, truncated: false }
    /* v8 ignore next 2 -- exhaustive over closed research-information result unions. */
    default:
      return assertNever(result)
  }
}

function runtimeCaptureFailure(
  status: 'document-not-registered' | 'reimport-required' | 'needs-ocr' | 'block-not-found'
    | 'parser-observation-missing' | 'quote-not-found' | 'quote-ambiguous',
  questionId: ReturnType<typeof ResearchQuestionId>,
  documentId: ReturnType<typeof ResearchDocumentId>,
  blockId: ReturnType<typeof ResearchDocumentBlockId>,
): MutationOutput {
  return {
    status,
    question_id: questionId,
    document_id: documentId,
    block_id: blockId,
    truncated: false,
  }
}

function projectQuestionSummary(
  record: ResearchQuestionRecord,
  budget: ProjectionBudget,
  observationState = observationProjectionState(record),
): QuestionSummary {
  const title = budget.text(record.title)
  const question = budget.text(record.question)
  const paperIds = uniqueSorted(record.evidence.map(value => value.paperId))
  const papers = budget.references(paperIds)
  const activeClaims = observationState.activeClaims
  const activeEntities = observationState.activeEntities
  const activeObservations = observationState.activeObservations
  const activeComparisonProtocols = observationState.activeComparisonProtocols
  const staleObservationIds = observationState.staleObservationIds
  return {
    question_id: record.id,
    revision: record.revision,
    title: title.value,
    title_truncated: title.truncated,
    question: question.value,
    question_truncated: question.truncated,
    total_evidence: record.evidence.length,
    total_notes: record.readingNotes.length,
    active_notes: activeReadingNoteIds(record).size,
    total_claims: record.claims.length,
    active_claims: activeClaims.size,
    total_entities: record.entities.length,
    active_entities: activeEntities.size,
    stale_active_entities: record.entities.filter(entity =>
      activeEntities.has(entity.id)
      && entity.sourceClaimIds.some(claimId => !activeClaims.has(claimId))).length,
    total_observations: record.observations.length,
    active_observations: activeObservations.size,
    stale_active_observations: record.observations.filter(observation =>
      activeObservations.has(observation.id) && staleObservationIds.has(observation.id)).length,
    total_comparison_protocols: record.comparisonProtocols.length,
    active_comparison_protocols: activeComparisonProtocols.size,
    stale_active_comparison_protocols: record.comparisonProtocols.filter(protocol =>
      activeComparisonProtocols.has(protocol.id)
      && observationState.staleComparisonProtocolIds.has(protocol.id)).length,
    total_syntheses: record.syntheses.length,
    active_syntheses: activeSynthesisIds(record).size,
    paper_ids: papers.values.map(String),
    total_papers: paperIds.length,
    paper_ids_truncated: papers.truncated,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
  }
}

function projectEvidence(evidence: ResearchEvidence, budget: ProjectionBudget): ProjectedEvidence {
  const pageLabel = evidence.locator.pageLabel === undefined
    ? undefined
    : budget.text(evidence.locator.pageLabel)
  const sectionPath = budget.references(evidence.sectionPath)
  const projectedSectionPath = sectionPath.values.map(value => budget.text(value))
  const blockText = budget.text(evidence.blockText)
  const selectedFields = evidence.selection === undefined
    ? {}
    : (() => {
      const selectedText = budget.text(evidence.selection.text)
      return {
        selected_text: selectedText.value,
        selected_text_truncated: selectedText.truncated,
        selected_start_utf8_byte: evidence.selection.startUtf8Byte,
        selected_end_utf8_byte: evidence.selection.endUtf8Byte,
      }
    })()
  const createdBy = projectCreatedBy(evidence.createdBy, budget)
  return {
    evidence_id: evidence.id,
    paper_id: evidence.paperId,
    source_version_id: evidence.sourceVersionId,
    document_id: evidence.locator.documentId,
    block_id: evidence.locator.blockId,
    page_index: evidence.locator.pageIndex,
    ...(pageLabel === undefined
      ? {}
      : { page_label: pageLabel.value, page_label_truncated: pageLabel.truncated }),
    section_path: projectedSectionPath.map(value => value.value),
    section_path_truncated: sectionPath.truncated || projectedSectionPath.some(value => value.truncated),
    block_text: blockText.value,
    block_text_truncated: blockText.truncated,
    ...selectedFields,
    ...createdBy,
    created_at: evidence.createdAt,
  }
}

function projectReadingNote(
  note: ResearchReadingNote,
  active: boolean,
  record: ResearchQuestionRecord,
  budget: ProjectionBudget,
  textOffset: number,
  renderMaximum: number,
): ProjectedReadingNote {
  const evidence = record.evidence.find(value => value.id === note.evidenceId)
  /* v8 ignore next 3 -- the service validates stored note-to-evidence relations before exposing records. */
  if (evidence === undefined) {
    throw new Error(`research reading note ${note.id} references missing evidence ${note.evidenceId}`)
  }
  const text = budget.pagedText(
    note.text,
    textOffset,
    noteTextRenderCapacity(note.text, textOffset, renderMaximum, note.id, evidence.id),
  )
  const pageLabel = evidence.locator.pageLabel === undefined
    ? undefined
    : budget.text(evidence.locator.pageLabel)
  const sectionPath = budget.references(evidence.sectionPath)
  const projectedSectionPath = sectionPath.values.map(value => budget.text(value))
  const selectedText = evidence.selection === undefined
    ? undefined
    : budget.text(evidence.selection.text)
  const supersedes = note.supersedes === undefined ? undefined : budget.references([note.supersedes])
  const createdBy = projectCreatedBy(note.createdBy, budget)
  return {
    textPage: text,
    value: {
      note_id: note.id,
      kind: note.kind,
      content_role: 'authored-commentary',
      text: text.value,
      text_truncated: text.truncated,
      evidence_id: evidence.id,
      anchor: {
        paper_id: evidence.paperId,
        source_version_id: evidence.sourceVersionId,
        document_id: evidence.locator.documentId,
        block_id: evidence.locator.blockId,
        page_index: evidence.locator.pageIndex,
        ...(pageLabel === undefined
          ? {}
          : { page_label: pageLabel.value, page_label_truncated: pageLabel.truncated }),
        section_path: projectedSectionPath.map(value => value.value),
        section_path_truncated: sectionPath.truncated
          || projectedSectionPath.some(value => value.truncated),
        ...(selectedText === undefined
          ? {}
          : { selected_text: selectedText.value, selected_text_truncated: selectedText.truncated }),
      },
      ...(supersedes === undefined || supersedes.values.length === 0
        ? {}
        : { supersedes_note_id: supersedes.values[0] }),
      references_truncated: sectionPath.truncated || (supersedes?.truncated ?? false),
      active,
      ...createdBy,
      created_at: note.createdAt,
    },
  }
}

function projectClaim(claim: ResearchClaim, active: boolean, budget: ProjectionBudget): ProjectedClaim {
  const text = budget.text(claim.text)
  const otherFacet = claim.otherFacet === undefined ? undefined : budget.text(claim.otherFacet)
  const evidenceLinks = budget.references(claim.evidenceLinks)
  const createdBy = projectCreatedBy(claim.createdBy, budget)
  return {
    claim_id: claim.id,
    kind: claim.kind,
    facet: claim.facet,
    ...(otherFacet === undefined
      ? {}
      : { other_facet: otherFacet.value, other_facet_truncated: otherFacet.truncated }),
    text: text.value,
    text_truncated: text.truncated,
    evidence_links: evidenceLinks.values.map(link => ({
      evidence_id: link.evidenceId,
      relation: link.relation,
    })),
    total_evidence_links: claim.evidenceLinks.length,
    evidence_links_truncated: evidenceLinks.truncated,
    ...(claim.supersedes === undefined ? {} : { supersedes_claim_id: claim.supersedes }),
    active,
    ...createdBy,
    created_at: claim.createdAt,
  }
}

function projectEntity(
  entity: ResearchEntity,
  active: boolean,
  activeClaims: ReadonlySet<ReturnType<typeof ResearchClaimId>>,
  record: ResearchQuestionRecord,
  budget: ProjectionBudget,
): ProjectedEntity {
  const canonicalName = budget.text(entity.canonicalName)
  const sourceClaims = entity.sourceClaimIds.map((claimId) => {
    const claim = record.claims.find(value => value.id === claimId)
    /* v8 ignore next 3 -- the service validates stored entity-to-claim relations before exposing records. */
    if (claim === undefined) {
      throw new Error(`research entity ${entity.id} references missing source claim ${claimId}`)
    }
    return claim
  })
  const evidenceIds = uniqueSorted(sourceClaims.flatMap(claim =>
    claim.evidenceLinks.map(link => link.evidenceId)))
  const evidenceIdSet = new Set(evidenceIds)
  const paperIds = uniqueSorted(record.evidence
    .filter(evidence => evidenceIdSet.has(evidence.id))
    .map(evidence => evidence.paperId))
  const staleSourceClaimIds = entity.sourceClaimIds.filter(claimId => !activeClaims.has(claimId))
  const sourceClaimReferences = budget.references(entity.sourceClaimIds)
  const paperReferences = budget.references(paperIds)
  const evidenceReferences = budget.references(evidenceIds)
  const staleReferences = budget.references(staleSourceClaimIds)
  const supersedesReferences = budget.references(entity.supersedes)
  const createdBy = projectCreatedBy(entity.createdBy, budget)
  return {
    entity_id: entity.id,
    kind: entity.kind,
    content_role: 'authored-normalization',
    active,
    stale: staleSourceClaimIds.length > 0,
    canonical_name: canonicalName.value,
    canonical_name_truncated: canonicalName.truncated,
    source_claim_ids: sourceClaimReferences.values.map(String),
    total_source_claims: entity.sourceClaimIds.length,
    source_claim_ids_truncated: sourceClaimReferences.truncated,
    linked_paper_ids: paperReferences.values.map(String),
    total_linked_papers: paperIds.length,
    linked_paper_ids_truncated: paperReferences.truncated,
    evidence_ids: evidenceReferences.values.map(String),
    total_evidence: evidenceIds.length,
    evidence_ids_truncated: evidenceReferences.truncated,
    stale_source_claim_ids: staleReferences.values.map(String),
    total_stale_source_claims: staleSourceClaimIds.length,
    stale_source_claim_ids_truncated: staleReferences.truncated,
    supersedes_entity_ids: supersedesReferences.values.map(String),
    total_supersedes_entities: entity.supersedes.length,
    supersedes_entity_ids_truncated: supersedesReferences.truncated,
    references_truncated: sourceClaimReferences.truncated
      || paperReferences.truncated
      || evidenceReferences.truncated
      || staleReferences.truncated
      || supersedesReferences.truncated,
    ...createdBy,
    created_at: entity.createdAt,
  }
}

function observationProjectionState(record: ResearchQuestionRecord): ObservationProjectionState {
  const activeClaims = activeClaimIds(record)
  const activeEntities = activeEntityIds(record)
  const activeObservations = activeObservationIds(record)
  const activeComparisonProtocols = activeComparisonProtocolIds(record)
  const claimById = new Map(record.claims.map(claim => [claim.id, claim] as const))
  const evidenceById = new Map(record.evidence.map(evidence => [evidence.id, evidence] as const))
  const entityById = new Map(record.entities.map(entity => [entity.id, entity] as const))
  const staleSourceClaimIdsByEntity = new Map(record.entities.map(entity => [
    entity.id,
    entity.sourceClaimIds.filter(claimId => !activeClaims.has(claimId)),
  ] as const))
  const observationById = new Map(record.observations.map(observation =>
    [observation.id, observation] as const))
  const paperByObservation = new Map<ReturnType<typeof ResearchObservationId>, ResearchPaperId>()
  const staleReferenceIndexByObservation = new Map<
    ReturnType<typeof ResearchObservationId>,
    ObservationStaleReferenceIndex
  >()
  const staleObservationIds = new Set<ReturnType<typeof ResearchObservationId>>()
  for (const observation of record.observations) {
    paperByObservation.set(observation.id, observationPaperId(
      observation,
      claimById,
      evidenceById,
    ))
    const referenceIndex = observationStaleReferenceIndex(
      observation,
      activeClaims,
      activeEntities,
      entityById,
      staleSourceClaimIdsByEntity,
    )
    staleReferenceIndexByObservation.set(observation.id, referenceIndex)
    if (referenceIndex.count > 0) staleObservationIds.add(observation.id)
  }

  const candidateBuckets = new Map<string, {
    readonly observationIds: ReturnType<typeof ResearchObservationId>[]
    readonly positionsByPaper: Map<ResearchPaperId, number[]>
  }>()
  for (const observation of record.observations) {
    if (!activeObservations.has(observation.id) || staleObservationIds.has(observation.id)) continue
    if (observationIntrinsicBlockers(observation).length > 0) continue
    const signature = observationAlignmentSignature(observation)
    let bucket = candidateBuckets.get(signature)
    if (bucket === undefined) {
      bucket = { observationIds: [], positionsByPaper: new Map() }
      candidateBuckets.set(signature, bucket)
    }
    const position = bucket.observationIds.length
    bucket.observationIds.push(observation.id)
    const paperId = projectionIndexValue(
      paperByObservation,
      observation.id,
      'observation paper',
    )
    const positions = bucket.positionsByPaper.get(paperId)
    if (positions === undefined) bucket.positionsByPaper.set(paperId, [position])
    else positions.push(position)
  }
  const candidateBucketByObservation = new Map<
    ReturnType<typeof ResearchObservationId>,
    ObservationCandidateBucket
  >()
  const candidateCountByObservation = new Map<
    ReturnType<typeof ResearchObservationId>,
    number
  >()
  const blockersByObservation = new Map<
    ReturnType<typeof ResearchObservationId>,
    readonly ObservationAlignmentBlocker[]
  >()
  for (const observation of record.observations) {
    const blockers: ObservationAlignmentBlocker[] = []
    if (!activeObservations.has(observation.id)) blockers.push('inactive')
    if (staleObservationIds.has(observation.id)) blockers.push('stale-reference')
    blockers.push(...observationIntrinsicBlockers(observation))
    const bucket = blockers.length === 0
      ? projectionIndexValue(
        candidateBuckets,
        observationAlignmentSignature(observation),
        'observation candidate bucket',
      )
      : undefined
    const candidateCount = bucket === undefined
      ? 0
      : bucket.observationIds.length - projectionIndexValue(
        bucket.positionsByPaper,
        projectionIndexValue(paperByObservation, observation.id, 'observation paper'),
        'candidate paper positions',
      ).length
    if (blockers.length === 0 && candidateCount === 0) {
      blockers.push('no-cross-paper-structural-match')
    }
    if (bucket !== undefined) candidateBucketByObservation.set(observation.id, bucket)
    candidateCountByObservation.set(observation.id, candidateCount)
    blockersByObservation.set(observation.id, blockers)
  }

  const staleComparisonProtocolIds = new Set<ReturnType<typeof ResearchComparisonProtocolId>>()
  const protocolsByObservation = new Map<
    ReturnType<typeof ResearchObservationId>,
    ReturnType<typeof ResearchComparisonProtocolId>[]
  >()
  for (const observation of record.observations) protocolsByObservation.set(observation.id, [])
  for (const protocol of record.comparisonProtocols) {
    const stale = protocol.observationIds.some(observationId =>
      !activeObservations.has(observationId) || staleObservationIds.has(observationId))
    if (stale) staleComparisonProtocolIds.add(protocol.id)
    if (!activeComparisonProtocols.has(protocol.id) || stale) continue
    for (const observationId of protocol.observationIds) {
      projectionIndexValue(protocolsByObservation, observationId, 'observation protocols')
        .push(protocol.id)
    }
  }
  return {
    activeClaims,
    activeEntities,
    activeObservations,
    activeComparisonProtocols,
    staleObservationIds,
    staleComparisonProtocolIds,
    claimById,
    observationById,
    paperByObservation,
    entityById,
    staleSourceClaimIdsByEntity,
    staleReferenceIndexByObservation,
    candidateBucketByObservation,
    candidateCountByObservation,
    blockersByObservation,
    protocolsByObservation,
  }
}

function projectObservation(
  observation: ResearchObservation,
  state: ObservationProjectionState,
  budget: ProjectionBudget,
): ProjectedObservation {
  const paperId = state.paperByObservation.get(observation.id)
  /* v8 ignore next 3 -- the service validates result-claim paper provenance before storing an observation. */
  if (paperId === undefined) {
    throw new Error(`research observation ${observation.id} lacks paper provenance`)
  }
  const candidateCount = projectionIndexValue(
    state.candidateCountByObservation,
    observation.id,
    'observation candidate count',
  )
  const protocolIds = projectionIndexValue(
    state.protocolsByObservation,
    observation.id,
    'observation protocols',
  )
  const blockers = projectionIndexValue(
    state.blockersByObservation,
    observation.id,
    'observation blockers',
  )
  const candidates = budget.indexedReferences(candidateCount, index =>
    crossPaperCandidateAt(
      projectionIndexValue(
        state.candidateBucketByObservation,
        observation.id,
        'observation candidate bucket',
      ),
      paperId,
      index,
    ))
  const protocols = budget.references(protocolIds)
  const rawConditions = observation.conditions.status === 'reported'
    ? observation.conditions.values
    : []
  const conditionReferences = budget.references(rawConditions)
  const conditions = conditionReferences.values.map(value => projectObservationCondition(value, budget))
  const evidenceIds = observationEvidenceIds(observation, state.claimById)
  const evidence = budget.references(evidenceIds)
  const supersedes = observation.supersedes === undefined
    ? undefined
    : budget.references([observation.supersedes])
  const otherRole = observation.method.otherRole === undefined
    ? undefined
    : budget.text(observation.method.otherRole)
  const valueStatistic = budget.text(observation.valueStatistic)
  const value = budget.text(String(observation.value))
  const createdBy = projectCreatedBy(observation.createdBy, budget)
  const referencesTruncated = candidates.truncated
    || protocols.truncated
    || conditionReferences.truncated
    || evidence.truncated
    || (supersedes?.truncated ?? false)
  return {
    observation_id: observation.id,
    content_role: 'authored-normalization',
    active: state.activeObservations.has(observation.id),
    stale: state.staleObservationIds.has(observation.id),
    comparison_status: protocolIds.length > 0 ? 'protocol-backed' : 'not-established',
    alignment_status: candidateCount > 0 ? 'candidate' : 'blocked',
    alignment_blockers: [...blockers],
    candidate_observation_ids: candidates.values.map(String),
    total_candidate_observations: candidateCount,
    candidate_observation_ids_truncated: candidates.truncated,
    comparison_protocol_ids: protocols.values.map(String),
    total_comparison_protocols: protocolIds.length,
    comparison_protocol_ids_truncated: protocols.truncated,
    paper_id: paperId,
    result_claim_id: observation.resultClaimId,
    method: {
      entity_id: observation.method.entityId,
      source_claim_id: observation.method.sourceClaimId,
      role: observation.method.role,
      ...(otherRole === undefined
        ? {}
        : { other_role: otherRole.value, other_role_truncated: otherRole.truncated }),
    },
    dataset: {
      entity_id: observation.dataset.entityId,
      source_claim_id: observation.dataset.sourceClaimId,
      split: projectReportedContext(observation.dataset.split, budget),
    },
    metric: {
      entity_id: observation.metric.entityId,
      source_claim_id: observation.metric.sourceClaimId,
    },
    value: value.value,
    value_truncated: value.truncated,
    unit: projectObservationUnit(observation.unit, budget),
    value_statistic: valueStatistic.value,
    value_statistic_truncated: valueStatistic.truncated,
    evaluation_protocol: projectReportedContext(observation.evaluationProtocol, budget),
    uncertainty: projectObservationUncertainty(observation.uncertainty, budget),
    conditions_status: observation.conditions.status,
    conditions,
    total_conditions: rawConditions.length,
    conditions_truncated: conditionReferences.truncated,
    evidence_ids: evidence.values.map(String),
    total_evidence: evidenceIds.length,
    evidence_ids_truncated: evidence.truncated,
    ...(supersedes === undefined || supersedes.values.length === 0
      ? {}
      : { supersedes_observation_id: supersedes.values[0] }),
    references_truncated: referencesTruncated,
    ...createdBy,
    created_at: observation.createdAt,
  }
}

function projectReportedContext(
  context: ResearchObservationReportedContext,
  budget: ProjectionBudget,
): InferValue<typeof OBSERVATION_REPORTED_CONTEXT_SCHEMA> {
  if (context.status !== 'reported') return { status: context.status }
  const value = budget.text(context.value)
  return {
    status: context.status,
    value: value.value,
    value_truncated: value.truncated,
    source_claim_id: context.sourceClaimId,
  }
}

function projectObservationUnit(
  unit: ResearchObservationUnit,
  budget: ProjectionBudget,
): InferValue<typeof OBSERVATION_UNIT_SCHEMA> {
  if (unit.status !== 'reported') return { status: unit.status }
  const symbol = budget.text(unit.symbol)
  return { status: unit.status, symbol: symbol.value, symbol_truncated: symbol.truncated }
}

function projectObservationUncertainty(
  uncertainty: ResearchObservationUncertainty,
  budget: ProjectionBudget,
): InferValue<typeof OBSERVATION_UNCERTAINTY_SCHEMA> {
  if (uncertainty.status !== 'reported') return { status: uncertainty.status }
  const value = uncertainty.value
  switch (value.kind) {
    case 'standard-deviation':
    case 'standard-error':
    case 'unspecified-plus-minus': {
      const magnitude = budget.text(String(value.magnitude))
      return {
        status: uncertainty.status,
        kind: value.kind,
        magnitude: magnitude.value,
        magnitude_truncated: magnitude.truncated,
      }
    }
    case 'confidence-interval': {
      const lower = budget.text(String(value.lower))
      const upper = budget.text(String(value.upper))
      const confidence = budget.text(String(value.confidenceLevelPercent))
      return {
        status: uncertainty.status,
        kind: value.kind,
        lower: lower.value,
        lower_truncated: lower.truncated,
        upper: upper.value,
        upper_truncated: upper.truncated,
        confidence_level_percent: confidence.value,
        confidence_level_percent_truncated: confidence.truncated,
      }
    }
    case 'range': {
      const lower = budget.text(String(value.lower))
      const upper = budget.text(String(value.upper))
      return {
        status: uncertainty.status,
        kind: value.kind,
        lower: lower.value,
        lower_truncated: lower.truncated,
        upper: upper.value,
        upper_truncated: upper.truncated,
      }
    }
  }
}

function projectObservationCondition(
  condition: ResearchObservationCondition,
  budget: ProjectionBudget,
): InferValue<typeof OBSERVATION_CONDITION_SCHEMA> {
  const name = budget.text(condition.name)
  const value = budget.text(condition.value)
  return {
    name: name.value,
    name_truncated: name.truncated,
    value: value.value,
    value_truncated: value.truncated,
    source_claim_id: condition.sourceClaimId,
    comparison_role: condition.comparisonRole,
  }
}

function projectComparisonProtocol(
  protocol: ResearchComparisonProtocol,
  active: boolean,
  state: ObservationProjectionState,
  budget: ProjectionBudget,
): ProjectedComparisonProtocol {
  const rationale = budget.text(protocol.compatibilityRationale)
  const observationReferences = budget.references(protocol.observationIds)
  const staleObservationIds = protocol.observationIds.filter(observationId =>
    !state.activeObservations.has(observationId) || state.staleObservationIds.has(observationId))
  const staleObservationReferences = budget.references(staleObservationIds)
  const referenceObservation = protocol.referenceObservationId === undefined
    ? undefined
    : budget.references([protocol.referenceObservationId])
  const supersedes = protocol.supersedes === undefined
    ? undefined
    : budget.references([protocol.supersedes])
  const createdBy = projectCreatedBy(protocol.createdBy, budget)
  const stale = state.staleComparisonProtocolIds.has(protocol.id)
  /* v8 ignore next 3 -- retained for defensive parity with durable aggregate validation. */
  if (protocol.observationIds.some(id => !state.observationById.has(id))) {
    throw new Error(`research comparison protocol ${protocol.id} references a missing observation`)
  }
  return {
    comparison_protocol_id: protocol.id,
    content_role: 'authored-comparison-decision',
    active,
    stale,
    compatibility_status: active && !stale
      ? 'established-by-active-protocol'
      : 'not-current',
    statistical_significance: 'not-assessed',
    direction: protocol.direction,
    compatibility_rationale: rationale.value,
    compatibility_rationale_truncated: rationale.truncated,
    observation_ids: observationReferences.values.map(String),
    total_observations: protocol.observationIds.length,
    observation_ids_truncated: observationReferences.truncated,
    stale_observation_ids: staleObservationReferences.values.map(String),
    total_stale_observations: staleObservationIds.length,
    stale_observation_ids_truncated: staleObservationReferences.truncated,
    ...(referenceObservation === undefined || referenceObservation.values.length === 0
      ? {}
      : { reference_observation_id: referenceObservation.values[0] }),
    ...(supersedes === undefined || supersedes.values.length === 0
      ? {}
      : { supersedes_comparison_protocol_id: supersedes.values[0] }),
    references_truncated: observationReferences.truncated
      || staleObservationReferences.truncated
      || (referenceObservation?.truncated ?? false)
      || (supersedes?.truncated ?? false),
    ...createdBy,
    created_at: protocol.createdAt,
  }
}

function observationIntrinsicBlockers(
  observation: ResearchObservation,
): readonly ObservationAlignmentBlocker[] {
  const blockers: ObservationAlignmentBlocker[] = []
  if (observation.unit.status === 'not-recorded') blockers.push('unit-not-recorded')
  if (observation.dataset.split.status === 'not-recorded') {
    blockers.push('dataset-split-not-recorded')
  }
  if (observation.evaluationProtocol.status === 'not-recorded') {
    blockers.push('evaluation-protocol-not-recorded')
  }
  if (observation.conditions.status === 'not-recorded') blockers.push('conditions-not-recorded')
  return blockers
}

function observationAlignmentSignature(observation: ResearchObservation): string {
  return JSON.stringify([
    observation.dataset.entityId,
    observation.metric.entityId,
    contextSignature(observation.dataset.split),
    unitSignature(observation.unit),
    observation.valueStatistic,
    contextSignature(observation.evaluationProtocol),
    conditionSignature(observation.conditions),
  ])
}

function crossPaperCandidateAt(
  bucket: ObservationCandidateBucket,
  paperId: ResearchPaperId,
  candidateIndex: number,
): ReturnType<typeof ResearchObservationId> {
  const excludedPositions = projectionIndexValue(
    bucket.positionsByPaper,
    paperId,
    'candidate paper positions',
  )
  let lower = 0
  let upper = bucket.observationIds.length - 1
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2)
    const includedThroughMiddle = middle + 1 - sortedUpperBound(excludedPositions, middle)
    if (includedThroughMiddle > candidateIndex) upper = middle
    else lower = middle + 1
  }
  return bucket.observationIds[lower] as ReturnType<typeof ResearchObservationId>
}

function sortedUpperBound(values: readonly number[], maximum: number): number {
  let lower = 0
  let upper = values.length
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2)
    if ((values[middle] as number) <= maximum) lower = middle + 1
    else upper = middle
  }
  return lower
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

function observationEvidenceIds(
  observation: ResearchObservation,
  claimById: ReadonlyMap<ReturnType<typeof ResearchClaimId>, ResearchClaim>,
): readonly ReturnType<typeof ResearchEvidenceId>[] {
  const claimIds = observationClaimReferences(observation).map(value => value.claimId)
  const claims = claimIds.map(claimId => projectionIndexValue(
    claimById,
    claimId,
    'observation source claim',
  ))
  return uniqueSorted(claims.flatMap(claim => claim.evidenceLinks.map(link => link.evidenceId)))
}

function observationDecimalValue(
  observation: ResearchObservation,
  field: ObservationDecimalField,
): string {
  if (field === 'value') return String(observation.value)
  const uncertainty = observation.uncertainty
  if (uncertainty.status !== 'reported') {
    throw new Error(`decimal_field=${field} requires reported uncertainty`)
  }
  const value = uncertainty.value
  if (field === 'uncertainty-magnitude') {
    if (!('magnitude' in value)) {
      throw new Error(`decimal_field=${field} requires magnitude uncertainty`)
    }
    return String(value.magnitude)
  }
  if ('magnitude' in value) {
    throw new Error(`decimal_field=${field} requires bounded uncertainty`)
  }
  if (field === 'uncertainty-lower') return String(value.lower)
  if (field === 'uncertainty-upper') return String(value.upper)
  if (!('confidenceLevelPercent' in value)) {
    throw new Error(`decimal_field=${field} requires confidence-interval uncertainty`)
  }
  return String(value.confidenceLevelPercent)
}

function observationPaperId(
  observation: ResearchObservation,
  claimById: ReadonlyMap<ReturnType<typeof ResearchClaimId>, ResearchClaim>,
  evidenceById: ReadonlyMap<ReturnType<typeof ResearchEvidenceId>, ResearchEvidence>,
): ResearchPaperId {
  const resultClaim = projectionIndexValue(
    claimById,
    observation.resultClaimId,
    'observation result claim',
  )
  const evidenceId = resultClaim.evidenceLinks[0]?.evidenceId
  /* v8 ignore next 3 -- the service validates result-claim paper provenance before storing an observation. */
  if (evidenceId === undefined) {
    throw new Error(`research observation ${observation.id} lacks result-claim paper provenance`)
  }
  return projectionIndexValue(evidenceById, evidenceId, 'observation result evidence').paperId
}

function observationClaimReferences(
  observation: ResearchObservation,
): readonly {
  readonly referenceKind: string
  readonly claimId: ReturnType<typeof ResearchClaimId>
  readonly entityId?: ReturnType<typeof ResearchEntityId>
}[] {
  return [
    { referenceKind: 'result-claim', claimId: observation.resultClaimId },
    {
      referenceKind: 'method-source-claim',
      claimId: observation.method.sourceClaimId,
      entityId: observation.method.entityId,
    },
    {
      referenceKind: 'dataset-source-claim',
      claimId: observation.dataset.sourceClaimId,
      entityId: observation.dataset.entityId,
    },
    {
      referenceKind: 'metric-source-claim',
      claimId: observation.metric.sourceClaimId,
      entityId: observation.metric.entityId,
    },
    ...(observation.dataset.split.status === 'reported'
      ? [{
        referenceKind: 'dataset-split-source-claim',
        claimId: observation.dataset.split.sourceClaimId,
      }]
      : []),
    ...(observation.evaluationProtocol.status === 'reported'
      ? [{
        referenceKind: 'evaluation-protocol-source-claim',
        claimId: observation.evaluationProtocol.sourceClaimId,
      }]
      : []),
    ...(observation.conditions.status === 'reported'
      ? observation.conditions.values.map(condition => ({
        referenceKind: 'condition-source-claim',
        claimId: condition.sourceClaimId,
      }))
      : []),
  ]
}

function observationStaleReferenceIndex(
  observation: ResearchObservation,
  activeClaims: ReadonlySet<ReturnType<typeof ResearchClaimId>>,
  activeEntities: ReadonlySet<ReturnType<typeof ResearchEntityId>>,
  entityById: ReadonlyMap<ReturnType<typeof ResearchEntityId>, ResearchEntity>,
  staleSourceClaimIdsByEntity: ReadonlyMap<
    ReturnType<typeof ResearchEntityId>,
    readonly ReturnType<typeof ResearchClaimId>[]
  >,
): ObservationStaleReferenceIndex {
  const segments: ObservationStaleReferenceSegment[] = []
  let count = 0
  const appendClaim = (
    referenceKind: string,
    claimId: ReturnType<typeof ResearchClaimId>,
    entityId?: ReturnType<typeof ResearchEntityId>,
  ) => {
    if (activeClaims.has(claimId)) return
    segments.push({
      kind: 'claim',
      referenceKind,
      claimId,
      ...(entityId === undefined ? {} : { entityId }),
    })
    count++
  }
  appendClaim('result-claim', observation.resultClaimId)
  appendClaim(
    'method-source-claim',
    observation.method.sourceClaimId,
    observation.method.entityId,
  )
  appendClaim(
    'dataset-source-claim',
    observation.dataset.sourceClaimId,
    observation.dataset.entityId,
  )
  appendClaim(
    'metric-source-claim',
    observation.metric.sourceClaimId,
    observation.metric.entityId,
  )
  if (observation.dataset.split.status === 'reported') {
    appendClaim('dataset-split-source-claim', observation.dataset.split.sourceClaimId)
  }
  if (observation.evaluationProtocol.status === 'reported') {
    appendClaim(
      'evaluation-protocol-source-claim',
      observation.evaluationProtocol.sourceClaimId,
    )
  }
  if (observation.conditions.status === 'reported') {
    const conditionIndexes: number[] = []
    for (const [index, condition] of observation.conditions.values.entries()) {
      if (!activeClaims.has(condition.sourceClaimId)) conditionIndexes.push(index)
    }
    if (conditionIndexes.length > 0) {
      segments.push({ kind: 'condition-claims', conditionIndexes })
      count += conditionIndexes.length
    }
  }
  const entityReferences = [
    ['method', observation.method.entityId],
    ['dataset', observation.dataset.entityId],
    ['metric', observation.metric.entityId],
  ] as const
  for (const [role, entityId] of entityReferences) {
    const entity = entityById.get(entityId)
    if (entity === undefined || !activeEntities.has(entityId)) {
      segments.push({ kind: 'inactive-entity', role, entityId })
      count++
      continue
    }
    const claimIds = projectionIndexValue(
      staleSourceClaimIdsByEntity,
      entity.id,
      'entity stale source claims',
    )
    if (claimIds.length === 0) continue
    segments.push({ kind: 'entity-source-claims', role, entityId, claimIds })
    count += claimIds.length
  }
  return { segments, count }
}

function observationStaleReferenceAt(
  observation: ResearchObservation,
  targetIndex: number,
  referenceIndex: ObservationStaleReferenceIndex,
): StaleObservationReference {
  let index = targetIndex
  for (const segment of referenceIndex.segments) {
    switch (segment.kind) {
      case 'claim':
        if (index-- === 0) {
          return {
            observation_id: observation.id,
            reference_kind: segment.referenceKind,
            claim_id: segment.claimId,
            ...(segment.entityId === undefined ? {} : { entity_id: segment.entityId }),
          }
        }
        break
      case 'condition-claims': {
        if (index >= segment.conditionIndexes.length) {
          index -= segment.conditionIndexes.length
          break
        }
        /* v8 ignore next 3 -- the index is built only for reported condition lists. */
        if (observation.conditions.status !== 'reported') {
          throw new Error(`research observation ${observation.id} lost its reported conditions`)
        }
        const conditionIndex = segment.conditionIndexes[index] as number
        const condition = observation.conditions.values[conditionIndex]
        /* v8 ignore next 3 -- the index stores positions from the same immutable condition list. */
        if (condition === undefined) {
          throw new Error(`research observation ${observation.id} lost condition ${conditionIndex}`)
        }
        return {
          observation_id: observation.id,
          reference_kind: 'condition-source-claim',
          claim_id: condition.sourceClaimId,
        }
      }
      case 'inactive-entity':
        if (index-- === 0) {
          return {
            observation_id: observation.id,
            reference_kind: `${segment.role}-entity`,
            entity_id: segment.entityId,
          }
        }
        break
      case 'entity-source-claims': {
        if (index >= segment.claimIds.length) {
          index -= segment.claimIds.length
          break
        }
        return {
          observation_id: observation.id,
          reference_kind: `${segment.role}-entity-source-claim`,
          claim_id: segment.claimIds[index] as ReturnType<typeof ResearchClaimId>,
          entity_id: segment.entityId,
        }
      }
      /* v8 ignore next 2 -- the closed segment union is exhaustive. */
      default:
        assertNever(segment)
    }
  }
  /* v8 ignore next 2 -- callers use the precomputed reference count for bounds. */
  throw new Error(`research observation ${observation.id} lacks stale reference ${targetIndex}`)
}

function staleObservationReferenceAt(
  ranges: readonly StaleObservationReferenceRange[],
  targetIndex: number,
  state: ObservationProjectionState,
): StaleObservationReference {
  const { range, index } = indexedReferenceRange(
    ranges,
    targetIndex,
    'stale observation reference',
  )
  const referenceIndex = projectionIndexValue(
    state.staleReferenceIndexByObservation,
    range.observation.id,
    'observation stale reference index',
  )
  return observationStaleReferenceAt(
    range.observation,
    index,
    referenceIndex,
  )
}

function indexedReferenceRange<T extends IndexedReferenceRange>(
  ranges: readonly T[],
  targetIndex: number,
  label: string,
): { readonly range: T; readonly index: number } {
  let lower = 0
  let upper = ranges.length - 1
  while (lower < upper) {
    const middle = Math.floor((lower + upper + 1) / 2)
    const range = ranges[middle] as T
    if (range.start <= targetIndex) lower = middle
    else upper = middle - 1
  }
  const range = ranges[lower]
  /* v8 ignore next 3 -- callers page within the summed range counts. */
  if (range === undefined || targetIndex >= range.start + range.count) {
    throw new Error(`research-information audit lacks ${label} ${targetIndex}`)
  }
  return { range, index: targetIndex - range.start }
}

function staleSynthesisReferenceAt(
  ranges: readonly StaleSynthesisReferenceRange[],
  targetIndex: number,
): InferValue<typeof STALE_REFERENCE_SCHEMA> {
  const { range, index } = indexedReferenceRange(
    ranges,
    targetIndex,
    'stale synthesis reference',
  )
  return {
    synthesis_id: range.synthesisId,
    finding_id: range.findingId,
    claim_id: range.staleClaimIds[index] as ReturnType<typeof ResearchClaimId>,
  }
}

function staleSynthesisComparisonReferenceAt(
  ranges: readonly StaleSynthesisComparisonReferenceRange[],
  targetIndex: number,
  state: ObservationProjectionState,
): InferValue<typeof STALE_SYNTHESIS_COMPARISON_REFERENCE_SCHEMA> {
  const { range, index } = indexedReferenceRange(
    ranges,
    targetIndex,
    'stale synthesis comparison reference',
  )
  const comparisonProtocolId = range.comparisonProtocolIds[index]
  /* v8 ignore next 3 -- the indexed range count is derived from this immutable id list. */
  if (comparisonProtocolId === undefined) {
    throw new Error(`research-information audit lacks comparison protocol ${targetIndex}`)
  }
  return {
    synthesis_id: range.synthesisId,
    finding_id: range.findingId,
    comparison_protocol_id: comparisonProtocolId,
    active: state.activeComparisonProtocols.has(comparisonProtocolId),
    stale: state.staleComparisonProtocolIds.has(comparisonProtocolId),
  }
}

function staleEntityReferenceAt(
  ranges: readonly StaleEntityReferenceRange[],
  targetIndex: number,
): InferValue<typeof STALE_ENTITY_REFERENCE_SCHEMA> {
  const { range, index } = indexedReferenceRange(
    ranges,
    targetIndex,
    'stale entity reference',
  )
  return {
    entity_id: range.entityId,
    claim_id: range.staleClaimIds[index] as ReturnType<typeof ResearchClaimId>,
  }
}

function projectSynthesis(
  synthesis: ResearchSynthesis,
  active: boolean,
  budget: ProjectionBudget,
  findingOffset: number,
): ProjectedSynthesis {
  const findingStart = Math.min(findingOffset, synthesis.findings.length)
  const findings = budget.items(synthesis.findings.slice(findingStart))
  const nextFindingOffset = findingStart + findings.values.length
  const projectedFindings = findings.values.map((finding) => {
    const text = budget.text(finding.text)
    const claimIds = budget.references(finding.claimIds)
    const comparisonProtocolIds = budget.references(finding.comparisonProtocolIds)
    return {
      finding_id: finding.id,
      kind: finding.kind,
      stance: finding.stance,
      text: text.value,
      text_truncated: text.truncated,
      claim_ids: claimIds.values.map(String),
      total_claims: finding.claimIds.length,
      claim_ids_truncated: claimIds.truncated,
      comparison_protocol_ids: comparisonProtocolIds.values.map(String),
      total_comparison_protocols: finding.comparisonProtocolIds.length,
      comparison_protocol_ids_truncated: comparisonProtocolIds.truncated,
    }
  })
  const createdBy = projectCreatedBy(synthesis.createdBy, budget)
  return {
    synthesis_id: synthesis.id,
    findings: projectedFindings,
    finding_offset: findingOffset,
    ...(nextFindingOffset < synthesis.findings.length
      ? { next_finding_offset: nextFindingOffset }
      : {}),
    total_findings: synthesis.findings.length,
    findings_truncated: findingStart > 0 || findings.truncated,
    ...(synthesis.supersedes === undefined ? {} : { supersedes_synthesis_id: synthesis.supersedes }),
    active,
    ...createdBy,
    created_at: synthesis.createdAt,
  }
}

function projectCreatedBy(
  author: ResearchEvidence['createdBy'],
  budget: ProjectionBudget,
): { readonly created_by: string; readonly created_by_truncated: boolean } {
  const value = budget.text(`${author.kind}:${author.id}`)
  return { created_by: value.value, created_by_truncated: value.truncated }
}

function projectMatrix(
  ctx: Context,
  record: ResearchQuestionRecord,
  budget: ProjectionBudget,
  offset: number,
  maximum: number,
): { readonly value: Matrix; readonly page: ItemPage<{ readonly facet: ResearchFacet; readonly paperId: ResearchPaperId }> } {
  const activeIds = activeClaimIds(record)
  const activeClaims = record.claims.filter(value => activeIds.has(value.id))
  const paperIds = uniqueSorted(record.evidence.map(value => value.paperId))
  const requestedCells = FACETS.flatMap(facet => paperIds.map(paperId => ({ facet, paperId })))
  const page = pageItems(requestedCells, offset, maximum)
  const cells = budget.items(page.values)
  const projectedCells = cells.values.map(({ facet, paperId }) => {
    const matching = activeClaims.filter((claim) => {
      if (claim.facet !== facet) return false
      const linkedPapers = new Set(record.evidence
        .filter(evidence => claim.evidenceLinks.some(link => link.evidenceId === evidence.id))
        .map(evidence => evidence.paperId))
      return linkedPapers.has(paperId)
    })
    const sourceIds = matching.filter(value => value.kind === 'source-statement').map(value => value.id)
    const inferenceIds = matching.filter(value => value.kind === 'inference').map(value => value.id)
    const evidenceIds = uniqueSorted(matching.flatMap(claim => claim.evidenceLinks
      .filter(link => record.evidence.some(evidence =>
        evidence.id === link.evidenceId && evidence.paperId === paperId))
      .map(link => link.evidenceId)))
    const sourceReferences = budget.references(sourceIds)
    const inferenceReferences = budget.references(inferenceIds)
    const evidenceReferences = budget.references(evidenceIds)
    const paperTitle = budget.text(paperTitleOf(ctx, paperId))
    return {
      facet,
      paper_id: paperId,
      paper_title: paperTitle.value,
      paper_title_truncated: paperTitle.truncated,
      source_statement_claim_ids: sourceReferences.values.map(String),
      inference_claim_ids: inferenceReferences.values.map(String),
      evidence_ids: evidenceReferences.values.map(String),
      references_truncated: sourceReferences.truncated
        || inferenceReferences.truncated
        || evidenceReferences.truncated,
      missing_source_statement: sourceIds.length === 0,
    }
  })
  const uncitedInferenceIds = activeClaims
    .filter(value => value.kind === 'inference' && value.evidenceLinks.length === 0)
    .map(value => value.id)
  const uncited = budget.references(uncitedInferenceIds)
  const paperReferences = budget.references(paperIds)
  return {
    page,
    value: {
      facets: [...FACETS],
      paper_ids: paperReferences.values.map(String),
      cells: projectedCells,
      total_cells: requestedCells.length,
      cells_truncated: page.truncated || cells.truncated,
      uncited_inference_claim_ids: uncited.values.map(String),
      references_truncated: paperReferences.truncated
        || uncited.truncated
        || projectedCells.some(value => value.references_truncated),
    },
  }
}

function projectAudit(
  ctx: Context,
  record: ResearchQuestionRecord,
  observationState: ObservationProjectionState,
  budget: ProjectionBudget,
  offset: number,
  maximum: number,
): { readonly value: Audit; readonly page: ItemPage<ResearchEvidence> } {
  const { activeClaims, activeEntities } = observationState
  const activeSyntheses = activeSynthesisIds(record)
  const page = pageItems(record.evidence, offset, maximum)
  const evidence = budget.items(page.values)
  const projectedEvidence = evidence.values.map(value => ({
    evidence_id: value.id,
    paper_id: value.paperId,
    status: evidenceCoverage(ctx, value),
  }))
  const counts: Record<RuntimeEvidenceCoverage, number> = {
    readable: 0,
    'needs-ocr': 0,
    'reimport-required': 0,
    'parser-mismatch': 0,
    'locator-mismatch': 0,
  }
  for (const value of record.evidence) counts[evidenceCoverage(ctx, value)]++
  const inactiveClaimIds = record.claims.filter(value => !activeClaims.has(value.id)).map(value => value.id)
  const inactiveEntityIds = record.entities
    .filter(value => !activeEntities.has(value.id))
    .map(value => value.id)
  const inactiveObservationIds = record.observations
    .filter(value => !observationState.activeObservations.has(value.id))
    .map(value => value.id)
  const inactiveComparisonProtocolIds = record.comparisonProtocols
    .filter(value => !observationState.activeComparisonProtocols.has(value.id))
    .map(value => value.id)
  const inactiveSynthesisIds = record.syntheses
    .filter(value => !activeSyntheses.has(value.id))
    .map(value => value.id)
  const uncitedInferenceClaimIds = record.claims
    .filter(value => activeClaims.has(value.id) && value.kind === 'inference' && value.evidenceLinks.length === 0)
    .map(value => value.id)
  const staleSynthesisReferenceRanges: StaleSynthesisReferenceRange[] = []
  let staleSynthesisReferenceTotal = 0
  for (const synthesis of record.syntheses) {
    for (const finding of synthesis.findings) {
      const staleClaimIds = finding.claimIds.filter(claimId => !activeClaims.has(claimId))
      if (staleClaimIds.length === 0) continue
      staleSynthesisReferenceRanges.push({
        synthesisId: synthesis.id,
        findingId: finding.id,
        staleClaimIds,
        start: staleSynthesisReferenceTotal,
        count: staleClaimIds.length,
      })
      staleSynthesisReferenceTotal += staleClaimIds.length
    }
  }
  const staleSynthesisComparisonReferenceRanges: StaleSynthesisComparisonReferenceRange[] = []
  let staleSynthesisComparisonReferenceTotal = 0
  for (const synthesis of record.syntheses) {
    for (const finding of synthesis.findings) {
      const comparisonProtocolIds = finding.comparisonProtocolIds.filter(protocolId =>
        !observationState.activeComparisonProtocols.has(protocolId)
        || observationState.staleComparisonProtocolIds.has(protocolId))
      if (comparisonProtocolIds.length === 0) continue
      staleSynthesisComparisonReferenceRanges.push({
        synthesisId: synthesis.id,
        findingId: finding.id,
        comparisonProtocolIds,
        start: staleSynthesisComparisonReferenceTotal,
        count: comparisonProtocolIds.length,
      })
      staleSynthesisComparisonReferenceTotal += comparisonProtocolIds.length
    }
  }
  const staleEntityReferenceRanges: StaleEntityReferenceRange[] = []
  let staleEntityReferenceTotal = 0
  for (const entity of record.entities) {
    if (!activeEntities.has(entity.id)) continue
    const staleClaimIds = entity.sourceClaimIds.filter(claimId => !activeClaims.has(claimId))
    if (staleClaimIds.length === 0) continue
    staleEntityReferenceRanges.push({
      entityId: entity.id,
      staleClaimIds,
      start: staleEntityReferenceTotal,
      count: staleClaimIds.length,
    })
    staleEntityReferenceTotal += staleClaimIds.length
  }
  const staleObservationReferenceRanges: StaleObservationReferenceRange[] = []
  let staleObservationReferenceTotal = 0
  for (const observation of record.observations) {
    if (!observationState.activeObservations.has(observation.id)) continue
    const referenceIndex = projectionIndexValue(
      observationState.staleReferenceIndexByObservation,
      observation.id,
      'observation stale reference index',
    )
    if (referenceIndex.count === 0) continue
    staleObservationReferenceRanges.push({
      observation,
      start: staleObservationReferenceTotal,
      count: referenceIndex.count,
    })
    staleObservationReferenceTotal += referenceIndex.count
  }
  const staleComparisonProtocolIds = record.comparisonProtocols
    .filter(protocol => observationState.activeComparisonProtocols.has(protocol.id)
      && observationState.staleComparisonProtocolIds.has(protocol.id))
    .map(protocol => protocol.id)
  const unprotocolledObservationIds = record.observations
    .filter(observation => observationState.activeObservations.has(observation.id)
      && !observationState.staleObservationIds.has(observation.id)
      && projectionIndexValue(
        observationState.protocolsByObservation,
        observation.id,
        'observation protocols',
      ).length === 0)
    .map(observation => observation.id)
  const observedResultClaimIds = new Set(record.observations
    .filter(observation => observationState.activeObservations.has(observation.id)
      && !observationState.staleObservationIds.has(observation.id))
    .map(observation => observation.resultClaimId))
  const unobservedResultClaimIds = record.claims
    .filter(claim => activeClaims.has(claim.id)
      && claim.kind === 'source-statement'
      && claim.facet === 'result'
      && claim.evidenceLinks.length > 0
      && !observedResultClaimIds.has(claim.id))
    .map(claim => claim.id)
  const observationAlignmentBlockers = record.observations
    .filter(observation => observationState.activeObservations.has(observation.id))
    .map(observation => ({
      observation_id: observation.id,
      blockers: projectionIndexValue(
        observationState.blockersByObservation,
        observation.id,
        'observation blockers',
      ),
    }))
    .filter(value => value.blockers.length > 0)
  const normalizedSourceClaimIds = new Set(record.entities
    .filter(entity => activeEntities.has(entity.id))
    .flatMap(entity => entity.sourceClaimIds))
  const unnormalizedSourceClaimIds = record.claims
    .filter(claim => activeClaims.has(claim.id)
      && claim.kind === 'source-statement'
      && isEntityKind(claim.facet)
      && !normalizedSourceClaimIds.has(claim.id))
    .map(claim => claim.id)
  const uncitedInferenceFindingIds = record.syntheses.flatMap(synthesis => synthesis.findings
    .filter(finding => finding.kind === 'inference'
      && finding.claimIds.length === 0
      && finding.comparisonProtocolIds.length === 0)
    .map(finding => finding.id))
  const inactiveClaims = budget.references(inactiveClaimIds)
  const inactiveEntities = budget.references(inactiveEntityIds)
  const inactiveObservations = budget.references(inactiveObservationIds)
  const inactiveComparisonProtocols = budget.references(inactiveComparisonProtocolIds)
  const inactiveSyntheses = budget.references(inactiveSynthesisIds)
  const uncitedClaims = budget.references(uncitedInferenceClaimIds)
  const stale = budget.indexedReferences(staleSynthesisReferenceTotal, index =>
    staleSynthesisReferenceAt(staleSynthesisReferenceRanges, index))
  const staleSynthesisComparisons = budget.indexedReferences(
    staleSynthesisComparisonReferenceTotal,
    index => staleSynthesisComparisonReferenceAt(
      staleSynthesisComparisonReferenceRanges,
      index,
      observationState,
    ),
  )
  const staleEntities = budget.indexedReferences(staleEntityReferenceTotal, index =>
    staleEntityReferenceAt(staleEntityReferenceRanges, index))
  const staleObservations = budget.indexedReferences(staleObservationReferenceTotal, index =>
    staleObservationReferenceAt(staleObservationReferenceRanges, index, observationState))
  const staleComparisonProtocols = budget.references(staleComparisonProtocolIds)
  const unprotocolledObservations = budget.references(unprotocolledObservationIds)
  const unobservedResults = budget.references(unobservedResultClaimIds)
  const alignmentBlockers = budget.references(observationAlignmentBlockers)
  const unnormalizedClaims = budget.references(unnormalizedSourceClaimIds)
  const uncitedFindings = budget.references(uncitedInferenceFindingIds)
  return {
    page,
    value: {
      evidence: projectedEvidence,
      total_evidence: record.evidence.length,
      evidence_truncated: page.truncated || evidence.truncated,
      coverage_counts: {
        readable: counts.readable,
        needs_ocr: counts['needs-ocr'],
        reimport_required: counts['reimport-required'],
        parser_mismatch: counts['parser-mismatch'],
        locator_mismatch: counts['locator-mismatch'],
      },
      inactive_claim_ids: inactiveClaims.values.map(String),
      inactive_entity_ids: inactiveEntities.values.map(String),
      inactive_observation_ids: inactiveObservations.values.map(String),
      inactive_comparison_protocol_ids: inactiveComparisonProtocols.values.map(String),
      inactive_synthesis_ids: inactiveSyntheses.values.map(String),
      uncited_inference_claim_ids: uncitedClaims.values.map(String),
      stale_synthesis_references: [...stale.values],
      stale_synthesis_comparison_references: [...staleSynthesisComparisons.values],
      stale_entity_references: [...staleEntities.values],
      stale_observation_references: [...staleObservations.values],
      stale_comparison_protocol_ids: staleComparisonProtocols.values.map(String),
      unprotocolled_observation_ids: unprotocolledObservations.values.map(String),
      unobserved_result_claim_ids: unobservedResults.values.map(String),
      observation_alignment_blockers: alignmentBlockers.values.map(value => ({
        observation_id: value.observation_id,
        blockers: [...value.blockers],
      })),
      unnormalized_source_claim_ids: unnormalizedClaims.values.map(String),
      uncited_inference_finding_ids: uncitedFindings.values.map(String),
      references_truncated: inactiveClaims.truncated
        || inactiveEntities.truncated
        || inactiveObservations.truncated
        || inactiveComparisonProtocols.truncated
        || inactiveSyntheses.truncated
        || uncitedClaims.truncated
        || stale.truncated
        || staleSynthesisComparisons.truncated
        || staleEntities.truncated
        || staleObservations.truncated
        || staleComparisonProtocols.truncated
        || unprotocolledObservations.truncated
        || unobservedResults.truncated
        || alignmentBlockers.truncated
        || unnormalizedClaims.truncated
        || uncitedFindings.truncated,
    },
  }
}

function evidenceCoverage(ctx: Context, evidence: ResearchEvidence): RuntimeEvidenceCoverage {
  const document = ctx.researchDocuments.peek(evidence.locator.documentId)
  if (document === undefined) return 'reimport-required'
  if (document.extraction.text === 'none') return 'needs-ocr'
  const paper = ctx.researchLibrary.get(evidence.paperId)
  const source = paper?.sourceVersions.find(value => value.id === evidence.sourceVersionId)
  if (source === undefined || !observes(source, document)) return 'parser-mismatch'
  const block = findBlock(document, evidence.locator.blockId)
  if (block === undefined || !sameLocatorAndText(block, evidence)) return 'locator-mismatch'
  return 'readable'
}

function observes(source: ResearchSourceVersion, document: ResearchDocument): boolean {
  return source.observations.some(value =>
    value.parserId === document.parser.id && value.parserVersion === document.parser.version)
}

function sameLocatorAndText(block: ResearchDocumentBlock, evidence: ResearchEvidence): boolean {
  const left = block.locator
  const right = evidence.locator
  return block.text === evidence.blockText
    && left.documentId === right.documentId
    && left.blockId === right.blockId
    && left.parserId === right.parserId
    && left.parserVersion === right.parserVersion
    && left.pageIndex === right.pageIndex
    && left.pageLabel === right.pageLabel
    && left.quoteHash === right.quoteHash
    && left.bbox.x === right.bbox.x
    && left.bbox.y === right.bbox.y
    && left.bbox.width === right.bbox.width
    && left.bbox.height === right.bbox.height
}

function findBlock(
  document: ResearchDocument,
  blockId: ReturnType<typeof ResearchDocumentBlockId>,
): ResearchDocumentBlock | undefined {
  for (const page of document.pages) {
    const block = page.blocks.find(value => value.id === blockId)
    if (block !== undefined) return block
  }
  return undefined
}

function exactSelection(
  quote: string,
  blockText: string,
): {
  readonly text: string
  readonly startUtf8Byte: number
  readonly endUtf8Byte: number
  readonly textHash: ReturnType<typeof ResearchEvidenceTextHash>
} | { readonly status: 'quote-not-found' | 'quote-ambiguous'; readonly matches: number } {
  if (quote.length === 0) throw new Error('quote must not be empty')
  const first = blockText.indexOf(quote)
  if (first === -1) return { status: 'quote-not-found', matches: 0 }
  let matches = 0
  let cursor = 0
  while (cursor <= blockText.length) {
    const match = blockText.indexOf(quote, cursor)
    if (match === -1) break
    matches++
    cursor = match + 1
  }
  if (matches !== 1 || first !== blockText.lastIndexOf(quote)) {
    return { status: 'quote-ambiguous', matches }
  }
  const startUtf8Byte = Buffer.byteLength(blockText.slice(0, first), 'utf8')
  return {
    text: quote,
    startUtf8Byte,
    endUtf8Byte: startUtf8Byte + Buffer.byteLength(quote, 'utf8'),
    textHash: ResearchEvidenceTextHash(`sha256:${hashText(quote)}`),
  }
}

function activeClaimIds(record: ResearchQuestionRecord): Set<ReturnType<typeof ResearchClaimId>> {
  const superseded = new Set(record.claims.flatMap(value => value.supersedes === undefined ? [] : [value.supersedes]))
  return new Set(record.claims.filter(value => !superseded.has(value.id)).map(value => value.id))
}

function activeEntityIds(record: ResearchQuestionRecord): Set<ReturnType<typeof ResearchEntityId>> {
  const superseded = new Set(record.entities.flatMap(value => value.supersedes))
  return new Set(record.entities.filter(value => !superseded.has(value.id)).map(value => value.id))
}

function activeObservationIds(
  record: ResearchQuestionRecord,
): Set<ReturnType<typeof ResearchObservationId>> {
  const superseded = new Set(record.observations.flatMap(value =>
    value.supersedes === undefined ? [] : [value.supersedes]))
  return new Set(record.observations
    .filter(value => !superseded.has(value.id))
    .map(value => value.id))
}

function activeComparisonProtocolIds(
  record: ResearchQuestionRecord,
): Set<ReturnType<typeof ResearchComparisonProtocolId>> {
  const superseded = new Set(record.comparisonProtocols.flatMap(value =>
    value.supersedes === undefined ? [] : [value.supersedes]))
  return new Set(record.comparisonProtocols
    .filter(value => !superseded.has(value.id))
    .map(value => value.id))
}

function isEntityKind(value: ResearchFacet): value is ResearchEntityKind {
  return value === 'method' || value === 'dataset' || value === 'metric'
}

function activeReadingNoteIds(
  record: ResearchQuestionRecord,
): Set<ReturnType<typeof ResearchReadingNoteId>> {
  const superseded = new Set(record.readingNotes.flatMap(value =>
    value.supersedes === undefined ? [] : [value.supersedes]))
  return new Set(record.readingNotes.filter(value => !superseded.has(value.id)).map(value => value.id))
}

function activeSynthesisIds(record: ResearchQuestionRecord): Set<ReturnType<typeof ResearchSynthesisId>> {
  const superseded = new Set(record.syntheses.flatMap(value =>
    value.supersedes === undefined ? [] : [value.supersedes]))
  return new Set(record.syntheses.filter(value => !superseded.has(value.id)).map(value => value.id))
}

function paperTitleOf(ctx: Context, paperId: ResearchPaperId): string {
  return ctx.researchLibrary.get(paperId)?.metadata.title.value ?? `[missing paper ${paperId}]`
}

function agentAuthor(exec: ToolRunContext) {
  if (exec.agent === undefined) throw new Error('research-information writes require an owning agent session')
  return { kind: 'agent' as const, id: ResearchAuthorId(String(exec.agent.id)) }
}

function pageItems<T>(values: readonly T[], offset: number, maximum: number): ItemPage<T> {
  const start = Math.min(offset, values.length)
  const retained = values.slice(start, start + maximum)
  const end = start + retained.length
  return {
    values: retained,
    offset,
    total: values.length,
    ...(end < values.length ? { nextOffset: end } : {}),
    truncated: start > 0 || end < values.length,
  }
}

function pageText(value: string, offset: number, maximumCodeUnits: number): TextPage {
  let codePointIndex = 0
  let startCodeUnit = value.length
  let endCodeUnit = value.length
  let returned = 0
  let retainedCodeUnits = 0
  let accepting = true
  for (let codeUnitIndex = 0; codeUnitIndex < value.length;) {
    const codePoint = value.codePointAt(codeUnitIndex)
    /* v8 ignore next 3 -- the loop index is always inside the string. */
    if (codePoint === undefined) throw new Error('tool-research-information: invalid text paging index')
    const width = codePoint > 0xFFFF ? 2 : 1
    if (codePointIndex === offset) {
      startCodeUnit = codeUnitIndex
      endCodeUnit = codeUnitIndex
    }
    if (codePointIndex >= offset && accepting) {
      if (retainedCodeUnits + width <= maximumCodeUnits) {
        retainedCodeUnits += width
        returned++
        endCodeUnit = codeUnitIndex + width
      } else {
        accepting = false
      }
    }
    codePointIndex++
    codeUnitIndex += width
  }
  const start = Math.min(offset, codePointIndex)
  const end = start + returned
  return {
    value: value.slice(startCodeUnit, endCodeUnit),
    offset,
    returned,
    total: codePointIndex,
    ...(end < codePointIndex ? { nextOffset: end } : {}),
    truncated: start > 0 || end < codePointIndex,
  }
}

function noteTextRenderCapacity(
  value: string,
  offset: number,
  maximum: number,
  noteId: string,
  evidenceId: string,
): number {
  let capacity = maximum
  for (;;) {
    const page = pageText(value, offset, capacity)
    if (page.nextOffset === offset) {
      throw new Error('tool-research-information: reading-note text cannot advance within maxOutputTextChars')
    }
    const overflow = formatNoteTextPage(page, noteId, evidenceId).length - maximum
    if (overflow <= 0) return capacity
    /* v8 ignore next 3 -- only a malformed provider record can exhaust the fixed metadata budget. */
    if (capacity === 0) {
      throw new Error('tool-research-information: reading-note paging metadata exceeds maxOutputTextChars')
    }
    capacity = Math.max(0, capacity - overflow)
  }
}

function decimalTextRenderCapacity(
  value: string,
  offset: number,
  maximum: number,
  observationId: string,
  field: ObservationDecimalField,
): number {
  let capacity = maximum
  for (;;) {
    const page = pageText(value, offset, capacity)
    /* v8 ignore next 3 -- validated UUIDs and the minimum rendering limit leave room for one decimal code point. */
    if (page.nextOffset === offset) {
      throw new Error('tool-research-information: decimal text cannot advance within maxOutputTextChars')
    }
    const overflow = formatDecimalTextPage(page, observationId, field).length - maximum
    if (overflow <= 0) return capacity
    /* v8 ignore next 3 -- only malformed provider ids can exhaust the fixed metadata budget. */
    if (capacity === 0) {
      throw new Error('tool-research-information: decimal paging metadata exceeds maxOutputTextChars')
    }
    capacity = Math.max(0, capacity - overflow)
  }
}

function projectItemPage<T>(page: ItemPage<T>): {
  readonly offset: number
  readonly returned_items: number
  readonly total_items: number
  readonly next_offset?: number
} {
  return {
    offset: page.offset,
    returned_items: page.values.length,
    total_items: page.total,
    ...(page.nextOffset === undefined ? {} : { next_offset: page.nextOffset }),
  }
}

function projectTextPage(page: TextPage): {
  readonly text_offset: number
  readonly returned_text_chars: number
  readonly total_text_chars: number
  readonly next_text_offset?: number
} {
  return {
    text_offset: page.offset,
    returned_text_chars: page.returned,
    total_text_chars: page.total,
    ...(page.nextOffset === undefined ? {} : { next_text_offset: page.nextOffset }),
  }
}

function projectReviewWarning(value: ResearchReviewWarning): {
  readonly code: ResearchReviewWarning['code']
  readonly message: string
  readonly finding_id?: string
  readonly claim_id?: string
  readonly comparison_protocol_id?: string
  readonly observation_id?: string
  readonly evidence_id?: string
  readonly paper_id?: string
} {
  return {
    code: value.code,
    message: value.message,
    ...(value.findingId === undefined ? {} : { finding_id: value.findingId }),
    ...(value.claimId === undefined ? {} : { claim_id: value.claimId }),
    ...(value.comparisonProtocolId === undefined
      ? {}
      : { comparison_protocol_id: value.comparisonProtocolId }),
    ...(value.observationId === undefined ? {} : { observation_id: value.observationId }),
    ...(value.evidenceId === undefined ? {} : { evidence_id: value.evidenceId }),
    ...(value.paperId === undefined ? {} : { paper_id: value.paperId }),
  }
}

function reviewTextRenderCapacity(
  markdown: string,
  offset: number,
  maximum: number,
  status: 'ready' | 'ready-with-warnings',
  renderDigest: string,
): number {
  let capacity = maximum
  for (;;) {
    const page = pageText(markdown, offset, capacity)
    if (page.nextOffset === offset) {
      throw new Error('tool-research-information: review Markdown cannot advance within maxOutputTextChars')
    }
    const overflow = formatReviewPage(page, status, renderDigest).length - maximum
    if (overflow <= 0) return capacity
    /* v8 ignore next 3 -- the configured minimum leaves room for paging metadata. */
    if (capacity === 0) {
      throw new Error('tool-research-information: review paging metadata exceeds maxOutputTextChars')
    }
    capacity = Math.max(0, capacity - overflow)
  }
}

function formatReviewRender(value: ReviewRenderOutput): string {
  if (value.status === 'not-ready') {
    const lines = ['Research review is not ready.']
    for (const warning of value.warnings) lines.push(`- ${warning.code}: ${warning.message}`)
    return lines.join('\n')
  }
  return formatReviewPage({
    value: value.markdown,
    offset: value.text_offset,
    returned: value.returned_text_chars,
    total: value.total_text_chars,
    ...(value.next_text_offset === undefined ? {} : { nextOffset: value.next_text_offset }),
    truncated: value.truncated,
  }, value.status, value.render_digest)
}

function formatReviewPage(
  page: TextPage,
  status: 'ready' | 'ready-with-warnings',
  renderDigest: string,
): string {
  const end = page.offset + page.returned
  const continuation = page.nextOffset === undefined
    ? 'next_text_offset=none'
    : `next_text_offset=${page.nextOffset}`
  return `${page.value}\n---\nstatus=${status} chars=${page.offset}-${end}/${page.total} ${continuation} render_digest=${renderDigest}`
}

class ProjectionBudget {
  private textRemaining: number
  private itemsRemaining: number
  private referencesRemaining: number
  private referencesToSkip: number
  private referencesReturned = 0
  private referencesTotal = 0
  truncated = false

  constructor(config: ResolvedConfig, readonly referenceOffset = 0) {
    this.textRemaining = config.maxOutputTextChars
    this.itemsRemaining = config.maxItemsPerResult
    this.referencesRemaining = config.maxReferencesPerResult
    this.referencesToSkip = referenceOffset
  }

  text(value: string): { readonly value: string; readonly truncated: boolean } {
    if (value.length <= this.textRemaining) {
      this.textRemaining -= value.length
      return { value, truncated: false }
    }
    this.truncated = true
    if (this.textRemaining === 0) return { value: '', truncated: true }
    const retained = this.textRemaining === 1
      ? '…'
      : `${codePointSafePrefix(value, this.textRemaining - 1)}…`
    this.textRemaining = 0
    return { value: retained, truncated: true }
  }

  pagedText(value: string, offset: number, maximum: number): TextPage {
    const page = pageText(value, offset, Math.min(maximum, this.textRemaining))
    this.textRemaining -= page.value.length
    if (page.truncated) this.truncated = true
    return page
  }

  items<T>(values: readonly T[]): { readonly values: readonly T[]; readonly truncated: boolean } {
    const count = Math.min(values.length, this.itemsRemaining)
    this.itemsRemaining -= count
    const truncated = count < values.length
    if (truncated) this.truncated = true
    return { values: values.slice(0, count), truncated }
  }

  references<T>(values: readonly T[]): { readonly values: readonly T[]; readonly truncated: boolean } {
    return this.indexedReferences(values.length, index => values[index] as T)
  }

  indexedReferences<T>(
    total: number,
    valueAt: (index: number) => T,
  ): { readonly values: readonly T[]; readonly truncated: boolean } {
    this.referencesTotal += total
    const skipped = Math.min(total, this.referencesToSkip)
    this.referencesToSkip -= skipped
    const count = Math.min(total - skipped, this.referencesRemaining)
    this.referencesRemaining -= count
    this.referencesReturned += count
    const truncated = skipped > 0 || count < total - skipped
    if (truncated) this.truncated = true
    return {
      values: Array.from({ length: count }, (_, index) => valueAt(skipped + index)),
      truncated,
    }
  }

  referencePage(): {
    readonly reference_offset: number
    readonly returned_references: number
    readonly total_references: number
    readonly next_reference_offset?: number
  } {
    const effectiveOffset = Math.min(this.referenceOffset, this.referencesTotal)
    const nextOffset = effectiveOffset + this.referencesReturned
    return {
      reference_offset: this.referenceOffset,
      returned_references: this.referencesReturned,
      total_references: this.referencesTotal,
      ...(nextOffset < this.referencesTotal ? { next_reference_offset: nextOffset } : {}),
    }
  }
}

function codePointSafePrefix(value: string, maximumCodeUnits: number): string {
  let end = Math.min(value.length, maximumCodeUnits)
  if ((value.charCodeAt(end - 1) & 0xFC00) === 0xD800) end--
  return value.slice(0, end)
}

function parseQuestionId(value: string): ReturnType<typeof ResearchQuestionId> {
  return ResearchQuestionId(uuid('question_id', value))
}

function parseEvidenceId(value: string): ReturnType<typeof ResearchEvidenceId> {
  return ResearchEvidenceId(uuid('evidence_id', value))
}

function parseReadingNoteId(value: string): ReturnType<typeof ResearchReadingNoteId> {
  return ResearchReadingNoteId(uuid('supersedes_note_id', value))
}

function parseClaimId(value: string, field = 'claim_id'): ReturnType<typeof ResearchClaimId> {
  return ResearchClaimId(uuid(field, value))
}

function parseEntityId(value: string, field = 'entity_id'): ReturnType<typeof ResearchEntityId> {
  return ResearchEntityId(uuid(field, value))
}

function parseObservationId(value: string): ReturnType<typeof ResearchObservationId> {
  return ResearchObservationId(uuid('observation_id', value))
}

function parseComparisonProtocolId(value: string): ReturnType<typeof ResearchComparisonProtocolId> {
  return ResearchComparisonProtocolId(uuid('comparison_protocol_id', value))
}

function parsePaperId(value: string): ResearchPaperId {
  return ResearchPaperId(uuid('paper_id', value))
}

function parseSynthesisId(value: string): ReturnType<typeof ResearchSynthesisId> {
  return ResearchSynthesisId(uuid('synthesis_id', value))
}

function parseOtherMethodRole(
  role: typeof METHOD_ROLES[number],
  otherRole: string | undefined,
): { readonly otherRole?: string } {
  if (role === 'other') {
    if (otherRole === undefined) throw new Error('method.other_role is required when method.role=other')
    return { otherRole }
  }
  if (otherRole !== undefined) {
    throw new Error('method.other_role is valid only when method.role=other')
  }
  return {}
}

function parseReportedContext(
  context: {
    readonly status: ResearchObservationReportedContext['status']
    readonly value?: string
    readonly source_claim_id?: string
  },
  field: string,
): ResearchObservationReportedContext {
  if (context.status === 'reported') {
    if (context.value === undefined || context.source_claim_id === undefined) {
      throw new Error(`${field}.value and ${field}.source_claim_id are required when status=reported`)
    }
    return {
      status: context.status,
      value: context.value,
      sourceClaimId: parseClaimId(context.source_claim_id, `${field}.source_claim_id`),
    }
  }
  if (context.value !== undefined || context.source_claim_id !== undefined) {
    throw new Error(`${field}.value and ${field}.source_claim_id are valid only when status=reported`)
  }
  return { status: context.status }
}

function parseObservationUnit(unit: {
  readonly status: ResearchObservationUnit['status']
  readonly symbol?: string
}): ResearchObservationUnit {
  if (unit.status === 'reported') {
    if (unit.symbol === undefined) throw new Error('unit.symbol is required when unit.status=reported')
    return { status: unit.status, symbol: unit.symbol }
  }
  if (unit.symbol !== undefined) throw new Error('unit.symbol is valid only when unit.status=reported')
  return { status: unit.status }
}

function parseObservationUncertainty(uncertainty: {
  readonly status: ResearchObservationUncertainty['status']
  readonly kind?: 'standard-deviation' | 'standard-error' | 'unspecified-plus-minus'
    | 'confidence-interval' | 'range'
  readonly magnitude?: string
  readonly lower?: string
  readonly upper?: string
  readonly confidence_level_percent?: string
}): ResearchObservationUncertainty {
  const hasReportedFields = uncertainty.kind !== undefined
    || uncertainty.magnitude !== undefined
    || uncertainty.lower !== undefined
    || uncertainty.upper !== undefined
    || uncertainty.confidence_level_percent !== undefined
  if (uncertainty.status !== 'reported') {
    if (hasReportedFields) {
      throw new Error('uncertainty detail fields are valid only when uncertainty.status=reported')
    }
    return { status: uncertainty.status }
  }
  const kind = uncertainty.kind
  if (kind === undefined) throw new Error('uncertainty.kind is required when uncertainty.status=reported')
  if (kind === 'standard-deviation'
    || kind === 'standard-error'
    || kind === 'unspecified-plus-minus') {
    if (uncertainty.magnitude === undefined) {
      throw new Error(`uncertainty.magnitude is required when uncertainty.kind=${kind}`)
    }
    if (uncertainty.lower !== undefined
      || uncertainty.upper !== undefined
      || uncertainty.confidence_level_percent !== undefined) {
      throw new Error(`uncertainty bounds are invalid when uncertainty.kind=${kind}`)
    }
    return {
      status: uncertainty.status,
      value: { kind, magnitude: ResearchDecimal(uncertainty.magnitude) },
    }
  }
  if (uncertainty.lower === undefined || uncertainty.upper === undefined) {
    throw new Error(`uncertainty.lower and uncertainty.upper are required when uncertainty.kind=${kind}`)
  }
  if (uncertainty.magnitude !== undefined) {
    throw new Error(`uncertainty.magnitude is invalid when uncertainty.kind=${kind}`)
  }
  if (kind === 'range') {
    if (uncertainty.confidence_level_percent !== undefined) {
      throw new Error('uncertainty.confidence_level_percent is valid only for a confidence interval')
    }
    return {
      status: uncertainty.status,
      value: {
        kind,
        lower: ResearchDecimal(uncertainty.lower),
        upper: ResearchDecimal(uncertainty.upper),
      },
    }
  }
  if (uncertainty.confidence_level_percent === undefined) {
    throw new Error('uncertainty.confidence_level_percent is required for a confidence interval')
  }
  return {
    status: uncertainty.status,
    value: {
      kind,
      lower: ResearchDecimal(uncertainty.lower),
      upper: ResearchDecimal(uncertainty.upper),
      confidenceLevelPercent: ResearchDecimal(uncertainty.confidence_level_percent),
    },
  }
}

function parseObservationConditions(conditions: {
  readonly status: ResearchObservationConditions['status']
  readonly values?: readonly {
    readonly name: string
    readonly value: string
    readonly source_claim_id: string
    readonly comparison_role: ResearchObservationCondition['comparisonRole']
  }[]
}): ResearchObservationConditions {
  if (conditions.status === 'reported') {
    if (conditions.values === undefined) {
      throw new Error('conditions.values is required when conditions.status=reported')
    }
    return {
      status: conditions.status,
      values: conditions.values.map(value => ({
        name: value.name,
        value: value.value,
        sourceClaimId: parseClaimId(value.source_claim_id, 'conditions.values.source_claim_id'),
        comparisonRole: value.comparison_role,
      })),
    }
  }
  if (conditions.values !== undefined) {
    throw new Error('conditions.values is valid only when conditions.status=reported')
  }
  return { status: conditions.status }
}

function uuid(field: string, value: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
    throw new Error(`${field} must be a research-information UUID`)
  }
  return value
}

function parseDocumentId(value: string): ReturnType<typeof ResearchDocumentId> {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) throw new Error('document_id must be a paper_import sha256 id')
  return ResearchDocumentId(value)
}

function parseBlockId(value: string): ReturnType<typeof ResearchDocumentBlockId> {
  if (!/^block:[0-9a-f]{64}$/u.test(value)) throw new Error('block_id must be a paper block id')
  return ResearchDocumentBlockId(value)
}

function nonNegativeSafeInteger(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`tool-research-information: ${name} must be a non-negative safe integer`)
  }
  return value
}

function boundedOptionalCount(name: string, value: number | undefined, maximum: number): number {
  if (value === undefined) return maximum
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} must be an integer from 1 through ${maximum}`)
  }
  return value
}

function normalizedQuery(value: string, maximum: number, name = 'query'): string {
  const query = comparableText(value).replaceAll(/\s+/gu, ' ')
  if (query.length === 0) throw new Error(`${name} must be a non-empty string`)
  if (query.length > maximum) {
    throw new Error(`${name} must be at most ${maximum} normalized characters`)
  }
  return query
}

function comparableText(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase()
}

function uniqueSorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

function projectionIndexValue<K, V>(
  values: ReadonlyMap<K, V>,
  key: K,
  description: string,
): V {
  const value = values.get(key)
  /* v8 ignore next 3 -- each projection index is built from every record in the same aggregate. */
  if (value === undefined) {
    throw new Error(`research-information projection index lacks ${description}`)
  }
  return value
}

function resolveConfig(config: Config = {}): ResolvedConfig {
  const resolved = {
    maxListResults: positiveSafeInteger('maxListResults', config.maxListResults ?? DEFAULT_MAX_LIST_RESULTS),
    maxItemsPerResult: positiveSafeInteger(
      'maxItemsPerResult', config.maxItemsPerResult ?? DEFAULT_MAX_ITEMS_PER_RESULT,
    ),
    maxReferencesPerResult: positiveSafeInteger(
      'maxReferencesPerResult', config.maxReferencesPerResult ?? DEFAULT_MAX_REFERENCES_PER_RESULT,
    ),
    maxOutputTextChars: positiveSafeInteger(
      'maxOutputTextChars', config.maxOutputTextChars ?? DEFAULT_MAX_OUTPUT_TEXT_CHARS,
    ),
    maxQueryChars: positiveSafeInteger('maxQueryChars', config.maxQueryChars ?? DEFAULT_MAX_QUERY_CHARS),
    maxReviewTextChars: positiveSafeInteger(
      'maxReviewTextChars', config.maxReviewTextChars ?? DEFAULT_MAX_REVIEW_TEXT_CHARS,
    ),
  }
  if (resolved.maxOutputTextChars < 256) {
    throw new TypeError('tool-research-information: maxOutputTextChars must be at least 256')
  }
  if (resolved.maxReviewTextChars < 256) {
    throw new TypeError('tool-research-information: maxReviewTextChars must be at least 256')
  }
  return resolved
}

function positiveSafeInteger(field: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`tool-research-information: ${field} must be a positive safe integer`)
  }
  return value
}

function taggedMeta(kind: string, value: JsonValue): JsonValue {
  return { kind, version: 1, value }
}

function formatJson(label: string, value: JsonValue, maximum: number): string {
  const text = `${label}\n${JSON.stringify(value, null, 2)}`
  if (text.length <= maximum) return text
  const marker = '\n… output truncated; use a narrower list query or continue research_question_get with its paging offsets.'
  return `${codePointSafePrefix(text, maximum - marker.length)}${marker}`
}

function formatResearchQuestionGet(value: JsonValue, maximum: number): string {
  const regular = `Research question\n${JSON.stringify(value, null, 2)}`
  if (regular.length <= maximum) return regular
  const output = value as GetOutput
  const note = output.notes?.length === 1 ? output.notes[0] : undefined
  if (output.status === 'found'
    && output.view === 'notes'
    && note !== undefined
    && output.text_offset !== undefined
    && output.returned_text_chars !== undefined
    && output.total_text_chars !== undefined) {
    return formatNoteTextPage({
      value: note.text,
      offset: output.text_offset,
      returned: output.returned_text_chars,
      total: output.total_text_chars,
      ...(output.next_text_offset === undefined ? {} : { nextOffset: output.next_text_offset }),
      truncated: note.text_truncated,
    }, note.note_id, note.evidence_id)
  }
  if (output.status === 'found'
    && output.view === 'observations'
    && output.observation_id !== undefined
    && output.decimal_field !== undefined
    && output.decimal_text !== undefined
    && output.decimal_text_offset !== undefined
    && output.returned_decimal_chars !== undefined
    && output.total_decimal_chars !== undefined) {
    return formatDecimalTextPage({
      value: output.decimal_text,
      offset: output.decimal_text_offset,
      returned: output.returned_decimal_chars,
      total: output.total_decimal_chars,
      ...(output.next_decimal_text_offset === undefined
        ? {}
        : { nextOffset: output.next_decimal_text_offset }),
      truncated: output.truncated,
    }, output.observation_id, output.decimal_field)
  }
  return formatJson('Research question', value, maximum)
}

function formatNoteTextPage(page: TextPage, noteId: string, evidenceId: string): string {
  const continuation = page.nextOffset === undefined
    ? '\nnext_text_offset=none'
    : `\ncontinue same notes query/offset; max_items=1 text_offset=${page.nextOffset}`
  return `content_role=authored-commentary; not a source statement\nnote_id=${noteId}\nevidence_id=${evidenceId}\n${page.value}${continuation}`
}

function formatDecimalTextPage(
  page: TextPage,
  observationId: string,
  field: ObservationDecimalField,
): string {
  const continuation = page.nextOffset === undefined
    ? '\nnext_decimal_text_offset=none'
    : `\nnext_decimal_text_offset=${page.nextOffset}`
  return `content_role=authored-normalization; exact canonical decimal page\nobservation_id=${observationId}\ndecimal_field=${field}\n${page.value}${continuation}`
}

function shortId(value: string): string {
  return value.length <= 20 ? value : `${value.slice(0, 12)}…${value.slice(-6)}`
}

function hashText(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function parseRenderDigest(value: string): string {
  if (!/^sha256:[0-9a-f]{64}$/u.test(value)) {
    throw new Error('render_digest must be a sha256 digest returned by research_review_render')
  }
  return value
}

/* v8 ignore next 3 -- only exhaustive closed-union defaults call this defensive assertion. */
function assertNever(value: never): never {
  throw new Error(`unsupported research-information result: ${JSON.stringify(value)}`)
}
