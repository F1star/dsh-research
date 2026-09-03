/**
 * Durable schema and storage-domain declaration for research information.
 * @module @f1star/dsh-research/research-information/src/spec
 */

import { z } from 'zod'
import {
  ResearchDocumentBlockId,
  ResearchDocumentId,
  ResearchDocumentQuoteHash,
  type ResearchDocumentBlockLocator,
} from '../research-document/index.ts'
import {
  ResearchPaperId,
  ResearchSourceVersionId,
} from '../research-library/index.ts'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type {
  ResearchAuthorId,
  ResearchAuthorship,
  ResearchClaim,
  ResearchClaimEvidenceLink,
  ResearchClaimId,
  ResearchComparisonProtocol,
  ResearchComparisonProtocolId,
  ResearchDecimal,
  ResearchEvidence,
  ResearchEvidenceId,
  ResearchEvidenceSelection,
  ResearchEvidenceTextHash,
  ResearchEntity,
  ResearchEntityId,
  ResearchFinding,
  ResearchFindingId,
  ResearchObservation,
  ResearchObservationCondition,
  ResearchObservationConditions,
  ResearchObservationDataset,
  ResearchObservationEntityReference,
  ResearchObservationId,
  ResearchObservationMethod,
  ResearchObservationReportedContext,
  ResearchObservationUncertainty,
  ResearchObservationUnit,
  ResearchReportedUncertainty,
  ResearchQuestionId,
  ResearchQuestionRecord,
  ResearchReadingNote,
  ResearchReadingNoteId,
  ResearchSynthesis,
  ResearchSynthesisId,
} from './types.ts'

const instant = z.iso.datetime({ offset: true })
const authorId = z.string().transform(value => value as ResearchAuthorId)
const questionId = z.string().transform(value => value as ResearchQuestionId)
const evidenceId = z.string().transform(value => value as ResearchEvidenceId)
const claimId = z.string().transform(value => value as ResearchClaimId)
const synthesisId = z.string().transform(value => value as ResearchSynthesisId)
const findingId = z.string().transform(value => value as ResearchFindingId)
const readingNoteId = z.string().transform(value => value as ResearchReadingNoteId)
const entityId = z.string().transform(value => value as ResearchEntityId)
const observationId = z.string().transform(value => value as ResearchObservationId)
const comparisonProtocolId = z.string().transform(value => value as ResearchComparisonProtocolId)
const decimal = z.string().transform(value => value as ResearchDecimal)
const evidenceTextHash = z.string().transform(value => value as ResearchEvidenceTextHash)

const authorship: z.ZodType<ResearchAuthorship> = z.object({
  kind: z.enum(['researcher', 'agent']),
  id: authorId,
})

const rect = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
})

const locator = z.object({
  kind: z.literal('block'),
  documentId: z.string().transform(ResearchDocumentId),
  blockId: z.string().transform(ResearchDocumentBlockId),
  parserId: z.string(),
  parserVersion: z.string(),
  pageIndex: z.number().int().nonnegative(),
  pageLabel: z.string().optional(),
  bbox: rect,
  quoteHash: z.string().transform(ResearchDocumentQuoteHash),
}).transform((value): ResearchDocumentBlockLocator => ({
  kind: value.kind,
  documentId: value.documentId,
  blockId: value.blockId,
  parserId: value.parserId,
  parserVersion: value.parserVersion,
  pageIndex: value.pageIndex,
  ...(value.pageLabel === undefined ? {} : { pageLabel: value.pageLabel }),
  bbox: value.bbox,
  quoteHash: value.quoteHash,
}))

const selection: z.ZodType<ResearchEvidenceSelection> = z.object({
  text: z.string(),
  startUtf8Byte: z.number().int().nonnegative(),
  endUtf8Byte: z.number().int().nonnegative(),
  textHash: evidenceTextHash,
})

const evidence: z.ZodType<ResearchEvidence> = z.object({
  id: evidenceId,
  paperId: z.string().transform(ResearchPaperId),
  sourceVersionId: z.string().transform(ResearchSourceVersionId),
  locator,
  blockText: z.string(),
  sectionPath: z.array(z.string()),
  selection: selection.optional(),
  createdBy: authorship,
  createdAt: instant,
})

const claimLink: z.ZodType<ResearchClaimEvidenceLink> = z.object({
  evidenceId,
  relation: z.enum(['supports', 'contradicts', 'qualifies', 'background']),
})

const claim: z.ZodType<ResearchClaim> = z.object({
  id: claimId,
  kind: z.enum(['source-statement', 'inference']),
  facet: z.enum(['aim', 'method', 'dataset', 'metric', 'result', 'limitation', 'validity-threat', 'other']),
  otherFacet: z.string().optional(),
  text: z.string(),
  evidenceLinks: z.array(claimLink),
  supersedes: claimId.optional(),
  createdBy: authorship,
  createdAt: instant,
})

const finding: z.ZodType<ResearchFinding> = z.object({
  id: findingId,
  kind: z.enum(['source-summary', 'inference']),
  stance: z.enum(['agreement', 'conflict', 'qualification', 'open-question']),
  text: z.string(),
  claimIds: z.array(claimId),
})

const synthesis: z.ZodType<ResearchSynthesis> = z.object({
  id: synthesisId,
  findings: z.array(finding),
  supersedes: synthesisId.optional(),
  createdBy: authorship,
  createdAt: instant,
})

const readingNote: z.ZodType<ResearchReadingNote> = z.object({
  id: readingNoteId,
  kind: z.enum(['note', 'passage-question']),
  text: z.string(),
  evidenceId,
  supersedes: readingNoteId.optional(),
  createdBy: authorship,
  createdAt: instant,
})

const entity: z.ZodType<ResearchEntity> = z.object({
  id: entityId,
  kind: z.enum(['method', 'dataset', 'metric']),
  canonicalName: z.string(),
  sourceClaimIds: z.array(claimId),
  supersedes: z.array(entityId),
  createdBy: authorship,
  createdAt: instant,
})

const observationEntityReference: z.ZodType<ResearchObservationEntityReference> = z.object({
  entityId,
  sourceClaimId: claimId,
})

const observationContext: z.ZodType<ResearchObservationReportedContext> = z.discriminatedUnion('status', [
  z.object({ status: z.literal('reported'), value: z.string(), sourceClaimId: claimId }),
  z.object({ status: z.literal('not-applicable') }),
  z.object({ status: z.literal('not-recorded') }),
])

const observationUnit: z.ZodType<ResearchObservationUnit> = z.discriminatedUnion('status', [
  z.object({ status: z.literal('reported'), symbol: z.string() }),
  z.object({ status: z.literal('not-applicable') }),
  z.object({ status: z.literal('not-recorded') }),
])

const observationCondition: z.ZodType<ResearchObservationCondition> = z.object({
  name: z.string(),
  value: z.string(),
  sourceClaimId: claimId,
  comparisonRole: z.enum(['must-match', 'descriptive']),
})

const observationConditions: z.ZodType<ResearchObservationConditions> = z.discriminatedUnion('status', [
  z.object({ status: z.literal('reported'), values: z.array(observationCondition) }),
  z.object({ status: z.literal('not-applicable') }),
  z.object({ status: z.literal('not-recorded') }),
])

const reportedUncertainty: z.ZodType<ResearchReportedUncertainty> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.enum(['standard-deviation', 'standard-error', 'unspecified-plus-minus']),
    magnitude: decimal,
  }),
  z.object({
    kind: z.literal('confidence-interval'),
    lower: decimal,
    upper: decimal,
    confidenceLevelPercent: decimal,
  }),
  z.object({ kind: z.literal('range'), lower: decimal, upper: decimal }),
])

const observationUncertainty: z.ZodType<ResearchObservationUncertainty> = z.discriminatedUnion('status', [
  z.object({ status: z.literal('reported'), value: reportedUncertainty }),
  z.object({ status: z.literal('not-applicable') }),
  z.object({ status: z.literal('not-recorded') }),
])

const observationMethod: z.ZodType<ResearchObservationMethod> = z.object({
  entityId,
  sourceClaimId: claimId,
  role: z.enum(['proposed', 'baseline', 'other']),
  otherRole: z.string().optional(),
})

const observationDataset: z.ZodType<ResearchObservationDataset> = z.object({
  entityId,
  sourceClaimId: claimId,
  split: observationContext,
})

const observation: z.ZodType<ResearchObservation> = z.object({
  id: observationId,
  resultClaimId: claimId,
  method: observationMethod,
  dataset: observationDataset,
  metric: observationEntityReference,
  value: decimal,
  unit: observationUnit,
  valueStatistic: z.string(),
  evaluationProtocol: observationContext,
  uncertainty: observationUncertainty,
  conditions: observationConditions,
  supersedes: observationId.optional(),
  createdBy: authorship,
  createdAt: instant,
})

const comparisonProtocol: z.ZodType<ResearchComparisonProtocol> = z.object({
  id: comparisonProtocolId,
  observationIds: z.array(observationId),
  direction: z.enum(['higher-is-better', 'lower-is-better', 'non-directional']),
  referenceObservationId: observationId.optional(),
  compatibilityRationale: z.string(),
  supersedes: comparisonProtocolId.optional(),
  createdBy: authorship,
  createdAt: instant,
})

/** Durable schema for one research-question aggregate. */
export const researchQuestionRecord: z.ZodType<ResearchQuestionRecord> = z.object({
  id: questionId,
  revision: z.number().int().nonnegative(),
  title: z.string(),
  question: z.string(),
  createdBy: authorship,
  updatedBy: authorship,
  evidence: z.array(evidence),
  claims: z.array(claim),
  syntheses: z.array(synthesis),
  readingNotes: z.array(readingNote),
  entities: z.array(entity),
  observations: z.array(observation),
  comparisonProtocols: z.array(comparisonProtocol),
  createdAt: instant,
  updatedAt: instant,
})

/** Version-four aggregate store for normalized observations and explicit comparison protocols. */
export const researchInformationDomainSpec = defineDomain({
  name: 'research_information',
  version: 4,
  tables: {
    questions: domainTable<ResearchQuestionId, ResearchQuestionRecord>(researchQuestionRecord),
  },
})
