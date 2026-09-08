/** Durable execution-attempt decoding and queued request validation. */

import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { ResearchTaskRunId, ResearchTaskRunRecord, StartResearchTaskRunRequest, StopResearchTaskRunRequest } from './types.ts'

const text = z.string().min(1).refine(value => value.trim().length > 0)
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const author = z.strictObject({ kind: z.enum(['researcher', 'agent']),
  id: text.transform(value => value as ResearchTaskRunRecord['requestedBy']['id']) })
const runId = z.uuid().transform(value => value as ResearchTaskRunId)
const taskId = z.uuid().transform(value => value as ResearchTaskRunRecord['taskId'])
const instant = z.iso.datetime({ offset: true })

/** The complete attempt remains readable without a live agent or an available model provider. */
export const researchTaskRunSchema: z.ZodType<ResearchTaskRunRecord> = z.strictObject({
  id: runId, taskId, taskRevision: integer,
  sessionId: text.transform(value => value as ResearchTaskRunRecord['sessionId']), agentPreset: text,
  model: z.strictObject({ provider: text, model: text,
    reasoningEffort: text.transform(value => value as NonNullable<ResearchTaskRunRecord['model']['reasoningEffort']>).optional() }),
  requestedBy: author, stoppedBy: author.nullable(),
  phase: z.enum(['starting', 'running', 'completed', 'waiting-review', 'needs-attention', 'stopped', 'failed']),
  reason: z.string(), steps: integer.nullable(), createdAt: instant, finishedAt: instant.nullable(),
})

/** Start requests are detached and validated before joining the serialized queue. */
export const startResearchTaskRunSchema: z.ZodType<StartResearchTaskRunRequest> = z.strictObject({
  taskId, expectedRevision: integer, author,
})
/** A stop always names an exact attempt, including the local researcher who requested it. */
export const stopResearchTaskRunSchema: z.ZodType<StopResearchTaskRunRequest> = z.strictObject({ runId, author })
/** Attempts retain their session identities and terminal assessments independently of scientific checkpoints. */
export const researchTaskRunDomainSpec = defineDomain({ name: 'research_task_run', version: 1,
  tables: { runs: domainTable<ResearchTaskRunId, ResearchTaskRunRecord>(researchTaskRunSchema) } })
