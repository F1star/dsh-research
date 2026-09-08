/** Model-facing research task planning, checkpointing, and explicit recovery. */
import s from '@deepseek-ai/schemastery';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { ResearchAuthorId, ResearchQuestionId } from "../research-information/index.js";
import { ResearchPaperId, ResearchSourceVersionId } from "../research-library/index.js";
/** Cordis plugin name. */
export const name = 'tool-research-task';
/** Task storage and ordinary logged tool execution. */
export const inject = ['researchTasks', 'systemPrompt', 'tools'];
/** Validated task tool response limits. */
export const Config = s.object({
    maxItems: s.number().step(1).min(1).default(50), maxOutputBytes: s.number().step(1).min(1).default(262144),
});
const STAGES = ['acquisition', 'extraction', 'review', 'comparison', 'synthesis', 'export'];
const ARTIFACTS = ['evidenceIds', 'claimIds', 'claimReviewIds', 'observationIds', 'observationReviewIds', 'comparisonProtocolIds', 'synthesisIds'];
const TASK = { type: 'object', additionalProperties: false, properties: {
        task_id: { type: 'string', required: true }, question_id: { type: 'string', required: true },
        kind: { type: 'string', required: true }, revision: { type: 'integer', required: true },
        saved_phase: { type: 'string', required: true }, reason: { type: 'string', required: true },
    } };
const SOURCE = { type: 'object', additionalProperties: false, properties: {
        paper_id: { type: 'string', required: true }, source_version_id: { type: 'string', required: true },
    } };
const CHECKPOINT = { type: 'object', additionalProperties: false, properties: {
        task_revision: { type: 'integer', required: true }, stage: { type: 'string', required: true },
        question_revision: { type: 'integer', required: true }, summary: { type: 'string', required: true },
        author_kind: { type: 'string', required: true }, author_id: { type: 'string', required: true },
        created_at: { type: 'string', required: true }, effective: { type: 'boolean', required: true },
        comparison_outcome: { type: 'string' }, report_digest: { type: 'string' },
    } };
const OUTPUT = { type: 'object', additionalProperties: false, properties: {
        status: { type: 'string', required: true }, task_id: { type: 'string' }, revision: { type: 'integer' },
        current_revision: { type: 'integer' }, question_revision: { type: 'integer' },
        task: TASK, tasks: { type: 'array', items: TASK },
        next_stage: { oneOf: [{ type: 'string' }, { type: 'null' }] }, stale: { type: 'boolean' },
        requires_resume: { type: 'boolean' },
        completed_stages: { type: 'array', items: { type: 'string' } }, issues: { type: 'array', items: { type: 'string' } },
        history: { type: 'array', items: CHECKPOINT }, sources: { type: 'array', items: SOURCE },
        artifact_ids: { type: 'array', items: { type: 'string' } },
        total: { type: 'integer' }, next_offset: { oneOf: [{ type: 'integer' }, { type: 'null' }] },
    } };
/**
 * Register bounded research task tools and stable workflow guidance.
 * @param ctx - task service and tool/prompt registries.
 * @param config - complete response limits.
 */
export function apply(ctx, config = {}) {
    const maxItems = config.maxItems ?? 50;
    const maxOutputBytes = config.maxOutputBytes ?? 262144;
    for (const [key, value] of Object.entries({ maxItems, maxOutputBytes })) {
        if (!Number.isSafeInteger(value) || value < 1)
            throw new TypeError(`${key} must be a positive safe integer`);
    }
    const render = (value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }];
    const meta = (value) => ({ kind: 'dsh/research-task', version: 1, value });
    const fits = (value) => Buffer.byteLength(JSON.stringify({ value, content: render(value), presentationMeta: meta(value) })) <= maxOutputBytes;
    const bounded = (value) => {
        if (!fits(value))
            throw new Error('Complete task output exceeds maxOutputBytes; reduce the page size or increase the configured limit.');
        return value;
    };
    const page = (values, offset, project) => {
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > values.length)
            throw new Error('Task offset is outside the selected collection.');
        let count = Math.min(maxItems, values.length - offset);
        for (;;) {
            const result = { ...project(values.slice(offset, offset + count)), total: values.length,
                next_offset: offset + count < values.length ? offset + count : null };
            if (fits(result))
                return result;
            if (count <= 1)
                return bounded(result);
            count--;
        }
    };
    const output = { schema: OUTPUT, render: (_args, value) => render(bounded(value)),
        presentationMeta: (_args, value) => meta(bounded(value)) };
    ctx.systemPrompt.section({ name: 'tool:research-task', order: 115,
        text: 'For single-paper reading, topic review, or method comparison, create a research question and then a research task. Read task progress before continuing. Perform the indicated stage with the paper, library, evidence, and synthesis tools before recording a checkpoint. Acquisition selects exact registered paper sources. Extraction requires captured evidence and source statements for each source. Review requires researcher decisions through the research workspace; pause or block for human review rather than inventing approval. Method comparison requires accepted observations and a current comparison protocol, or an explicit not-comparable outcome with its reasons. Synthesis retains qualifications and open questions. Export completion records the current complete report digest; it does not imply that the researcher downloaded or approved the report. A saved complete phase is historical: inspect stale and next_stage before claiming current completion. Changed dependencies reopen the earliest affected stage while retaining old checkpoints. Pause and restart preserve progress without scheduling work; explicitly resume when asked to continue. Rewind to acquisition before changing source selection. History, source selections, and artifact references have independent continuation offsets; use checkpoint_revision to inspect historical inputs. Never retry an uncertain create blindly: list tasks first.',
    });
    ctx.tools.register(defineTool({
        name: 'research_task_list', description: 'List saved research workflows. Saved phases do not establish current completion; inspect a task before continuing.',
        parameters: { question_id: { type: 'string', description: 'Optional exact research question filter.' }, offset: { type: 'integer' } }, output,
        execute(args) {
            const tasks = ctx.researchTasks.list().filter(task => args.question_id === undefined || task.questionId === args.question_id);
            return Promise.resolve(page(tasks, args.offset ?? 0, rows => ({ status: 'ready', tasks: rows.map(summary) })));
        },
    }));
    ctx.tools.register(defineTool({
        name: 'research_task_get', description: 'Inspect current workflow requirements, retained checkpoints, exact sources, or scientific artifact references.',
        parameters: {
            task_id: { type: 'string', required: true }, view: { type: 'string', enum: ['progress', 'history', 'sources', 'artifacts'] },
            offset: { type: 'integer' }, checkpoint_revision: { type: 'integer', description: 'Historical checkpoint task revision; required for artifacts, optional for sources.' },
            artifact_kind: { type: 'string', enum: ARTIFACTS, description: 'Required for artifacts; each reference collection has its own offset.' },
        }, output,
        execute(args) {
            return Promise.resolve().then(() => {
                const view = ctx.researchTasks.get(args.task_id);
                if (view === undefined)
                    return bounded({ status: 'task-not-found' });
                const task = view.task;
                const base = { status: 'ready', task: summary(task) };
                const offset = args.offset ?? 0;
                const selectedView = args.view ?? 'progress';
                if (selectedView === 'progress')
                    return page(view.issues, offset, rows => ({ ...base, issues: [...rows],
                        question_revision: view.questionRevision, completed_stages: [...view.completedStages], next_stage: view.nextStage,
                        stale: view.stale, requires_resume: view.requiresResume }));
                if (selectedView === 'history')
                    return page(task.checkpoints, offset, rows => ({ ...base, history: rows.map(checkpoint => ({
                            task_revision: checkpoint.taskRevision, stage: checkpoint.stage, question_revision: checkpoint.questionRevision,
                            summary: checkpoint.summary, author_kind: checkpoint.createdBy.kind, author_id: checkpoint.createdBy.id,
                            created_at: checkpoint.createdAt,
                            effective: task.checkpointRevisions.includes(checkpoint.taskRevision),
                            ...(checkpoint.comparisonOutcome === undefined ? {} : { comparison_outcome: checkpoint.comparisonOutcome }),
                            ...(checkpoint.artifacts.reportDigest === undefined ? {} : { report_digest: checkpoint.artifacts.reportDigest }),
                        })) }));
                const checkpoint = args.checkpoint_revision === undefined ? undefined
                    : task.checkpoints.find(value => value.taskRevision === args.checkpoint_revision);
                if (args.checkpoint_revision !== undefined && checkpoint === undefined)
                    throw new Error('Task checkpoint revision was not found.');
                if (selectedView === 'sources')
                    return page(checkpoint?.sources ?? task.sources, offset, rows => ({ ...base,
                        sources: rows.map(source => ({ paper_id: source.paperId, source_version_id: source.sourceVersionId })) }));
                if (checkpoint === undefined || args.artifact_kind === undefined)
                    throw new Error('Artifacts require checkpoint_revision and artifact_kind.');
                return page(checkpoint.artifacts[args.artifact_kind], offset, rows => ({ ...base, artifact_ids: [...rows] }));
            });
        },
    }));
    ctx.tools.register(defineTool({
        name: 'research_task_write', description: 'Create, checkpoint, pause, block, resume, or rewind a research workflow. Checkpoints require real recorded work; authorship comes from the agent session.',
        parameters: {
            action: { type: 'string', required: true, enum: ['create', 'checkpoint', 'pause', 'block', 'resume', 'rewind'] },
            task_id: { type: 'string' }, revision: { type: 'integer' }, question_id: { type: 'string' },
            kind: { type: 'string', enum: ['single-paper', 'topic-review', 'method-comparison'] },
            question_revision: { type: 'integer' }, stage: { type: 'string', enum: STAGES },
            summary: { type: 'string' }, reason: { type: 'string' },
            sources: { type: 'array', items: SOURCE }, comparison_outcome: { type: 'string', enum: ['protocol', 'not-comparable'] },
        }, output,
        async execute(args, exec) {
            const author = agentAuthor(exec);
            // Every successful write returns only these bounded fields; fail capacity before the commit.
            bounded({ status: 'saved', task_id: '0'.repeat(36), revision: Number.MAX_SAFE_INTEGER });
            let result;
            if (args.action === 'create') {
                if (args.question_id === undefined || args.kind === undefined)
                    throw new Error('Task creation requires question_id and kind.');
                result = await ctx.researchTasks.create({ questionId: ResearchQuestionId(args.question_id), kind: args.kind, author });
            }
            else {
                if (args.task_id === undefined || args.revision === undefined)
                    throw new Error('Task updates require task_id and revision.');
                const common = { taskId: args.task_id, expectedRevision: args.revision, author };
                let request;
                if (args.action === 'checkpoint') {
                    if (args.stage === undefined || args.question_revision === undefined || args.summary === undefined) {
                        throw new Error('Checkpoint requires stage, question_revision, and summary.');
                    }
                    request = { ...common, action: 'checkpoint', stage: args.stage, expectedQuestionRevision: args.question_revision, summary: args.summary,
                        ...(args.sources === undefined ? {} : { sources: args.sources.map(source => ({
                                paperId: ResearchPaperId(source.paper_id), sourceVersionId: ResearchSourceVersionId(source.source_version_id),
                            })) }), ...(args.comparison_outcome === undefined ? {} : { comparisonOutcome: args.comparison_outcome }) };
                }
                else if (args.action === 'rewind') {
                    if (args.stage === undefined || args.reason === undefined)
                        throw new Error('Rewind requires stage and reason.');
                    request = { ...common, action: 'rewind', stage: args.stage, reason: args.reason };
                }
                else {
                    if (args.reason === undefined)
                        throw new Error('Task phase changes require a reason.');
                    request = { ...common, action: args.action, reason: args.reason };
                }
                result = await ctx.researchTasks.update(request);
            }
            if (result.status === 'saved')
                return bounded({ status: 'saved', task_id: result.view.task.id, revision: result.view.task.revision });
            if (result.status === 'stale-revision' || result.status === 'stale-question')
                return bounded({ status: result.status, current_revision: result.currentRevision });
            if (result.status === 'cannot-advance')
                return bounded({ status: result.status, issues: [...result.issues] });
            return bounded({ status: result.status });
        },
    }));
}
function summary(task) {
    return { task_id: task.id, question_id: task.questionId, kind: task.kind, revision: task.revision,
        saved_phase: task.phase, reason: task.reason };
}
function agentAuthor(exec) {
    if (exec.agent === undefined)
        throw new Error('Research task writes require an owning agent session.');
    return { kind: 'agent', id: ResearchAuthorId(String(exec.agent.id)) };
}
//# sourceMappingURL=index.js.map