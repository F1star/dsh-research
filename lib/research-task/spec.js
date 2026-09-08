/** Version-one durable research task records and queued request validation. */
import { z } from 'zod';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const text = z.string().min(1).refine(value => value.trim().length > 0);
const instant = z.iso.datetime({ offset: true });
const author = z.strictObject({ kind: z.enum(['researcher', 'agent']),
    id: text.transform(value => value) });
const taskId = z.uuid().transform(value => value);
const questionId = text.transform(value => value);
const kind = z.enum(['single-paper', 'topic-review', 'method-comparison']);
const stage = z.enum(['acquisition', 'extraction', 'review', 'comparison', 'synthesis', 'export']);
const outcome = z.enum(['protocol', 'not-comparable']);
const source = z.strictObject({
    paperId: text.transform(value => value),
    sourceVersionId: text.transform(value => value),
});
const artifacts = z.strictObject({
    evidenceIds: z.array(text.transform(value => value)),
    claimIds: z.array(text.transform(value => value)),
    claimReviewIds: z.array(text.transform(value => value)),
    observationIds: z.array(text.transform(value => value)),
    observationReviewIds: z.array(text.transform(value => value)),
    comparisonProtocolIds: z.array(text.transform(value => value)),
    synthesisIds: z.array(text.transform(value => value)),
    reportDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/).transform(value => value).optional(),
});
const checkpoint = z.strictObject({
    taskRevision: integer, stage, questionRevision: integer,
    basisDigest: z.string().regex(/^sha256:[0-9a-f]{64}$/).transform(value => value),
    summary: text, sources: z.array(source), artifacts,
    comparisonOutcome: outcome.optional(), createdBy: author, createdAt: instant,
});
/** Complete durable task decoder; chronological and cross-record checks belong to the service. */
export const researchTaskSchema = z.strictObject({
    id: taskId, questionId, kind, revision: integer, phase: z.enum(['active', 'paused', 'blocked', 'complete']),
    reason: z.string(), sources: z.array(source), checkpoints: z.array(checkpoint), checkpointRevisions: z.array(integer),
    createdBy: author, updatedBy: author, createdAt: instant, updatedAt: instant,
});
/** Task requests are decoded before entering the serialized write queue. */
export const createResearchTaskSchema = z.strictObject({ questionId, kind, author });
const common = { taskId, expectedRevision: integer, author };
/** Queued update decoder retains the stage-specific action fields. */
export const updateResearchTaskSchema = z.union([
    z.strictObject({ ...common, action: z.enum(['pause', 'block', 'resume']), reason: text }),
    z.strictObject({ ...common, action: z.literal('rewind'), stage, reason: text }),
    z.strictObject({ ...common, action: z.literal('checkpoint'), expectedQuestionRevision: integer, stage,
        summary: text, sources: z.array(source).optional(), comparisonOutcome: outcome.optional() }),
]);
/** Atomic task aggregates; source bytes and scientific records keep their existing storage domains. */
export const researchTaskDomainSpec = defineDomain({ name: 'research_task', version: 1,
    tables: { tasks: domainTable(researchTaskSchema) } });
//# sourceMappingURL=spec.js.map