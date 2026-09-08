/** Version-one durable research task records and queued request validation. */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { ResearchAuthorship, ResearchQuestionId } from '../research-information/types.ts'
import type { ResearchPaperId, ResearchSourceVersionId } from '../research-library/types.ts'
import type {
  ResearchTaskId, ResearchTaskRecord, ResearchTaskSource, ResearchTaskCheckpoint, ResearchTaskArtifacts,
  CreateResearchTaskRequest, UpdateResearchTaskRequest,
} from './types.ts'

const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const text = z.string().min(1).refine(value => value.trim().length > 0)
const instant = z.iso.datetime({ offset: true })
const author: z.ZodType<ResearchAuthorship> = z.strictObject({ kind: z.enum(['researcher', 'agent']),
  id: text.transform(value => value as ResearchAuthorship['id']) })
const taskId = z.uuid().transform(value => value as ResearchTaskId)
const questionId = text.transform(value => value as ResearchQuestionId)
const kind = z.enum(['single-paper', 'topic-review', 'method-comparison'])
const stage = z.enum(['acquisition', 'extraction', 'review', 'comparison', 'synthesis', 'export'])
const outcome = z.enum(['protocol', 'not-comparable'])
const source: z.ZodType<ResearchTaskSource> = z.strictObject({
  paperId: text.transform(value => value as ResearchPaperId),
  sourceVersionId: text.transform(value => value as ResearchSourceVersionId),
})
const artifacts: z.ZodType<ResearchTaskArtifacts> = z.strictObject({
  evidenceIds: z.array(text.transform(value => value as ResearchTaskArtifacts['evidenceIds'][number])),
  claimIds: z.array(text.transform(value => value as ResearchTaskArtifacts['claimIds'][number])),
  claimReviewIds: z.array(text.transform(value => value as ResearchTaskArtifacts['claimReviewIds'][number])),
  observationIds: z.array(text.transform(value => value as ResearchTaskArtifacts['observationIds'][number])),
  observationReviewIds: z.array(text.transform(value => value as ResearchTaskArtifacts['observationReviewIds'][number])),
  comparisonProtocolIds: z.array(text.transform(value => value as ResearchTaskArtifacts['comparisonProtocolIds'][number])),
  synthesisIds: z.array(text.transform(value => value as ResearchTaskArtifacts['synthesisIds'][number])),
  reportDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/).transform(value => value as NonNullable<ResearchTaskArtifacts['reportDigest']>).optional(),
})
const checkpoint: z.ZodType<ResearchTaskCheckpoint> = z.strictObject({
  taskRevision: integer, stage, questionRevision: integer,
  basisDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/).transform(value => value as ResearchTaskCheckpoint['basisDigest']),
  summary: text, sources: z.array(source), artifacts,
  comparisonOutcome: outcome.optional(), createdBy: author, createdAt: instant,
})

/** Complete durable task decoder; chronological and cross-record checks belong to the service. */
export const researchTaskSchema: z.ZodType<ResearchTaskRecord> = z.strictObject({
  id: taskId, questionId, kind, revision: integer, phase: z.enum(['active', 'paused', 'blocked', 'complete']),
  reason: z.string(), sources: z.array(source), checkpoints: z.array(checkpoint), checkpointRevisions: z.array(integer),
  createdBy: author, updatedBy: author, createdAt: instant, updatedAt: instant,
})

/** Task requests are decoded before entering the serialized write queue. */
export const createResearchTaskSchema: z.ZodType<CreateResearchTaskRequest> = z.strictObject({ questionId, kind, author })

const common = { taskId, expectedRevision: integer, author }
/** Queued update decoder retains the stage-specific action fields. */
export const updateResearchTaskSchema: z.ZodType<UpdateResearchTaskRequest> = z.union([
  z.strictObject({ ...common, action: z.enum(['pause', 'block', 'resume']), reason: text }),
  z.strictObject({ ...common, action: z.literal('rewind'), stage, reason: text }),
  z.strictObject({ ...common, action: z.literal('checkpoint'), expectedQuestionRevision: integer, stage,
    summary: text, sources: z.array(source).optional(), comparisonOutcome: outcome.optional() }),
])

/** Atomic task aggregates; source bytes and scientific records keep their existing storage domains. */
export const researchTaskDomainSpec = defineDomain({ name: 'research_task', version: 1,
  tables: { tasks: domainTable<ResearchTaskId, ResearchTaskRecord>(researchTaskSchema) } })
