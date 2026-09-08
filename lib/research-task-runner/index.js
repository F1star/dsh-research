/** Owned, logged execution attempts over researcher-selected task checkpoints. */
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { Service } from '@deepseek-ai/cordis';
import s from '@deepseek-ai/schemastery';
import { installModelSelection } from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { researchTaskRunDomainSpec, startResearchTaskRunSchema, stopResearchTaskRunSchema } from "./spec.js";
import { taskRunPrompt, taskToolDenial } from "./policy.js";
/** Owns fresh agent sessions; reading retained attempts never resumes model execution. */
export class ResearchTaskRuns extends Service {
    static inject = ['storageDomain', 'researchTasks', 'researchLibrary', 'agents', 'agentPresets',
        'agentDefaultModel', 'sessions', 'sessionPersistence', 'tools'];
    /** All limits and the execution preset are required at composition time. */
    static Config = s.object({
        agentPreset: s.string().required(), maxSteps: s.number().required(), maxDurationMs: s.number().required(),
        maxUnchangedTurns: s.number().required(), maxConcurrentRuns: s.number().required(), maxRuns: s.number().required(),
        maxTextChars: s.number().required(), maxRunBytes: s.number().required(),
    });
    limits;
    runs;
    operations = new Map();
    tail = Promise.resolve();
    closed = false;
    /**
     * @param ctx - task, model, preset, session, tool policy, and persistence owners.
     * @param config - explicit execution and retention policy.
     */
    constructor(ctx, config) {
        super(ctx, 'researchTaskRuns');
        this.limits = { ...config };
        if (config.agentPreset.trim().length === 0)
            throw new TypeError('agentPreset must name a preset');
        for (const [key, value] of Object.entries(config)) {
            if (key !== 'agentPreset' && (!Number.isSafeInteger(value) || Number(value) < 1)) {
                throw new TypeError(`${key} must be a positive safe integer`);
            }
        }
        if (config.maxDurationMs > 2147483647)
            throw new TypeError('maxDurationMs exceeds the Node timer range');
    }
    async [Service.init]() {
        await this.ctx.agentPresets.resolve(this.limits.agentPreset);
        const domain = await this.ctx.storageDomain.open(researchTaskRunDomainSpec);
        this.ctx.effect(() => async () => {
            this.closed = true;
            await this.tail;
            const pending = [...this.operations.values()];
            for (const op of pending)
                op.controller.abort({ phase: 'stopped', reason: 'Execution owner unloaded.' });
            await Promise.allSettled(pending.map(op => op.done));
            await this.tail;
            await domain.close();
        }, 'research-task-runner.domain');
        this.runs = domain.table('runs');
        if (this.runs.size > this.limits.maxRuns)
            throw new Error('Stored attempts exceed maxRuns');
        const sessions = new Set();
        for (const [id, record] of this.runs.entries()) {
            if (id !== record.id || sessions.has(record.sessionId))
                throw new Error('Execution identities are inconsistent');
            sessions.add(record.sessionId);
            this.validate(record);
        }
    }
    /**
     * Inspect retained attempts without resuming model work.
     * @param taskId - task whose retained execution history is requested.
     * @returns detached attempts in insertion order, bounded by maxRuns; no execution is started.
     */
    list(taskId) {
        this.assertOpen();
        return [...this.table().entries()].filter(([, record]) => record.taskId === taskId).map(([, record]) => this.view(record));
    }
    /**
     * Read one retained attempt and its process-local interruption status.
     * @param id - exact retained execution identity.
     * @returns a detached attempt, including missing terminal evidence, or undefined.
     */
    get(id) {
        this.assertOpen();
        const record = this.table().get(id);
        return record === undefined ? undefined : this.view(record);
    }
    /**
     * Persist an accepted attempt before starting its owned agent session.
     * @param request - inspected task revision and trusted researcher authorship.
     * @returns a durable start receipt or refusal; accepted model work continues asynchronously.
     */
    start(request) {
        const input = startResearchTaskRunSchema.parse(request);
        this.assertOpen();
        return this.enqueue(async () => {
            if (input.author.kind !== 'researcher')
                return { status: 'researcher-required' };
            const view = this.ctx.researchTasks.get(input.taskId);
            if (view === undefined)
                return { status: 'task-not-found' };
            if (view.task.revision !== input.expectedRevision)
                return { status: 'stale-revision', currentRevision: view.task.revision };
            if ([...this.operations.values()].some(op => op.record.taskId === input.taskId))
                return { status: 'already-running' };
            if (this.operations.size >= this.limits.maxConcurrentRuns || this.table().size >= this.limits.maxRuns)
                return { status: 'capacity' };
            const stopped = this.assess(view);
            if (stopped !== undefined)
                return { status: 'cannot-start', reason: stopped.reason };
            const model = this.ctx.agentDefaultModel.currentSelection();
            const record = { id: randomUUID(), taskId: input.taskId,
                taskRevision: input.expectedRevision, sessionId: randomUUID(),
                agentPreset: this.limits.agentPreset, model, requestedBy: input.author, stoppedBy: null,
                phase: 'starting', reason: '', steps: null, createdAt: new Date().toISOString(), finishedAt: null };
            this.validate(record);
            await this.table().put(record.id, record);
            const op = { record, controller: new AbortController(),
                sources: JSON.stringify(view.task.sources), done: Promise.resolve() };
            this.operations.set(record.id, op);
            op.done = this.drive(op).finally(() => { this.operations.delete(record.id); });
            void op.done.catch((error) => { this.ctx.logger.error('Research execution could not retain its terminal assessment', error); });
            return { status: 'saved', run: this.view(record) };
        });
    }
    /**
     * Save a researcher stop and wait for the exact owned attempt to settle.
     * @param request - exact attempt and trusted researcher authorship.
     * @returns the quiescent attempt after saving stop authorship; storage or teardown failures reject.
     */
    async stop(request) {
        const input = stopResearchTaskRunSchema.parse(request);
        this.assertOpen();
        const accepted = await this.enqueue(async () => {
            if (input.author.kind !== 'researcher')
                return { status: 'researcher-required' };
            const record = this.table().get(input.runId);
            if (record === undefined)
                return { status: 'run-not-found' };
            const op = this.operations.get(input.runId);
            if (op === undefined)
                return { status: 'saved', run: this.view(record) };
            await this.save(op, { stoppedBy: input.author });
            op.controller.abort({ phase: 'stopped', reason: 'Stopped by a researcher.' });
            return op;
        });
        if ('status' in accepted)
            return accepted;
        await accepted.done;
        return { status: 'saved', run: this.view(accepted.record) };
    }
    async drive(op) {
        const timer = setTimeout(() => {
            op.controller.abort({ phase: 'needs-attention', reason: 'Execution deadline reached.' });
        }, this.limits.maxDurationMs);
        let handle;
        let assessment = { phase: 'failed', reason: 'Execution did not finish.' };
        let detachAbort = () => { };
        try {
            const model = op.record.model;
            handle = await this.ctx.agents.create({ sessionId: op.record.sessionId, meta: { agentPreset: op.record.agentPreset },
                agentOptions: { provider: model.provider, model: model.model }, signal: op.controller.signal,
                setup: async (agentCtx) => {
                    await this.ctx.agentPresets.mount(agentCtx, op.record.agentPreset);
                    installModelSelection(agentCtx, { current: { provider: model.provider, model: model.model,
                            ...model.reasoningEffort === undefined ? {} : { reasoningEffort: model.reasoningEffort } }, assembled: undefined });
                    agentCtx.on('agent/pre-step', async ({ agent, messages }, next) => {
                        if (messages.some(message => message.source.kind === 'user')) {
                            op.controller.abort({ phase: 'needs-attention',
                                reason: 'Execution received additional user input; inspect the task before starting another attempt.' });
                        }
                        return this.halt(op, agent) === undefined ? next() : { kind: 'reject' };
                    });
                    agentCtx.on('tools/pre-execute', async (exec, next) => {
                        const view = this.ctx.researchTasks.get(op.record.taskId);
                        const halt = this.taskHalt(op, view);
                        if (halt !== undefined)
                            return { kind: 'deny', reason: halt.reason };
                        assert(view !== undefined);
                        const documents = view.task.sources.map((source) => {
                            const paper = this.ctx.researchLibrary.get(source.paperId);
                            const version = paper?.sourceVersions.find(value => value.id === source.sourceVersionId);
                            assert(version !== undefined);
                            return version.documentId;
                        });
                        const denial = taskToolDenial(exec, view, documents);
                        return denial === undefined ? next() : { kind: 'deny', reason: denial };
                    });
                } });
            const agent = handle.agent;
            const cancel = () => { agent.cancel({ kind: 'hook', reason: 'Research execution stopped.' }); };
            op.controller.signal.addEventListener('abort', cancel, { once: true });
            detachAbort = () => { op.controller.signal.removeEventListener('abort', cancel); };
            if (op.controller.signal.aborted)
                cancel();
            await this.enqueue(() => this.save(op, { phase: 'running' }));
            let unchanged = 0;
            for (;;) {
                const halted = this.halt(op, agent);
                if (halted !== undefined) {
                    assessment = halted;
                    break;
                }
                const view = this.ctx.researchTasks.get(op.record.taskId);
                assert(view !== undefined);
                agent.followup(createUserMessage({ source: { kind: 'plugin', plugin: '@f1star/dsh-research/research-task-runner', form: 'instructions' },
                    content: [{ type: 'text', text: taskRunPrompt(view) }] }));
                // This fresh session is exclusively driven here; idle covers its entire admitted interval.
                await agent.whenIdle();
                const haltedAfter = this.halt(op, agent);
                if (haltedAfter !== undefined) {
                    assessment = haltedAfter;
                    break;
                }
                const end = agent.session.events.findLast(event => event.type === 'turn/end');
                if (end?.type !== 'turn/end' || end.data.reason.kind !== 'completed') {
                    assessment = { phase: 'failed', reason: 'The agent turn ended without completing its work.' };
                    break;
                }
                const after = this.ctx.researchTasks.get(op.record.taskId);
                assert(after !== undefined);
                unchanged = after.task.revision === view.task.revision && after.questionRevision === view.questionRevision ? unchanged + 1 : 0;
                if (unchanged >= this.limits.maxUnchangedTurns) {
                    assessment = { phase: 'needs-attention', reason: 'No research progress was saved within the configured turn limit.' };
                    break;
                }
            }
        }
        catch (error) {
            this.ctx.logger.error('Research execution failed', error);
            assessment = op.controller.signal.aborted ? op.controller.signal.reason
                : { phase: 'failed', reason: 'Agent creation or execution failed; inspect the execution session and host diagnostics.' };
        }
        finally {
            clearTimeout(timer);
            op.controller.abort(assessment);
            detachAbort();
            let steps = null;
            if (handle !== undefined) {
                handle.agent.cancel({ kind: 'hook', reason: 'Research execution interval ended.' });
                await handle.agent.whenIdle();
                steps = this.steps(handle.agent);
                try {
                    if (!await this.ctx.sessions.flush(handle.agent.session))
                        throw new Error('No session persistence listener acknowledged execution');
                }
                catch (error) {
                    this.ctx.logger.error('Research transcript flush failed', error);
                    assessment = { phase: 'failed', reason: 'Execution transcript persistence failed.' };
                }
                try {
                    await handle.dispose();
                }
                catch (error) {
                    this.ctx.logger.error('Research execution disposal failed', error);
                    assessment = { phase: 'failed', reason: 'Execution cleanup failed.' };
                }
            }
            await this.enqueue(() => this.save(op, { ...assessment, steps,
                finishedAt: new Date(Math.max(Date.now(), Date.parse(op.record.createdAt))).toISOString() }));
        }
    }
    halt(op, agent) {
        const assessment = this.taskHalt(op, this.ctx.researchTasks.get(op.record.taskId));
        if (assessment !== undefined)
            return assessment;
        if (this.steps(agent) >= this.limits.maxSteps)
            return { phase: 'needs-attention', reason: 'Model step limit reached.' };
        return undefined;
    }
    taskHalt(op, view) {
        if (op.controller.signal.aborted)
            return op.controller.signal.reason;
        if (view !== undefined && JSON.stringify(view.task.sources) !== op.sources) {
            return { phase: 'needs-attention', reason: 'The selected sources changed; start a new execution after inspection.' };
        }
        return this.assess(view);
    }
    assess(view) {
        if (view === undefined)
            return { phase: 'needs-attention', reason: 'The research task is unavailable.' };
        if (view.stale || view.requiresResume)
            return { phase: 'needs-attention', reason: 'Inspect changed inputs and explicitly resume the task.' };
        if (view.nextStage === null)
            return { phase: 'completed', reason: 'All task checkpoints match their scientific inputs.' };
        if (view.task.phase !== 'active')
            return { phase: 'needs-attention', reason: 'The research task is paused or blocked.' };
        if (view.nextStage === 'acquisition')
            return { phase: 'needs-attention', reason: 'Select exact sources and confirm acquisition before execution.' };
        if (view.nextStage === 'review' && view.issues.length > 0)
            return { phase: 'waiting-review', reason: 'Researcher review is required before continuing.' };
        return undefined;
    }
    steps(agent) { return agent.session.events.filter(event => event.type === 'step/start').length; }
    validate(record) {
        const task = this.ctx.researchTasks.get(record.taskId);
        if (task === undefined || record.taskRevision > task.task.revision)
            throw new Error('Execution references an unavailable task revision');
        if (record.requestedBy.kind !== 'researcher' || (record.stoppedBy !== null && record.stoppedBy.kind !== 'researcher')) {
            throw new Error('Execution authorship requires a researcher');
        }
        const live = record.phase === 'starting' || record.phase === 'running';
        if (live !== (record.finishedAt === null) || (live && record.steps !== null)
            || ((record.phase === 'completed' || record.phase === 'waiting-review') && record.steps === null)
            || (record.finishedAt !== null && Date.parse(record.finishedAt) < Date.parse(record.createdAt))) {
            throw new Error('Execution phase and timestamps disagree');
        }
        const texts = [record.id, record.taskId, record.sessionId, record.agentPreset, record.model.provider, record.model.model,
            record.model.reasoningEffort ?? '', record.requestedBy.id, record.stoppedBy?.id ?? '', record.reason];
        if (texts.some(value => Array.from(value).length > this.limits.maxTextChars))
            throw new Error('Execution text exceeds maxTextChars');
        if (Buffer.byteLength(JSON.stringify(record)) > this.limits.maxRunBytes)
            throw new Error('Execution record exceeds maxRunBytes');
    }
    async save(op, patch) {
        const record = { ...op.record, ...patch };
        this.validate(record);
        await this.table().put(record.id, record);
        op.record = record;
    }
    view(record) {
        return { record: structuredClone(record), interrupted: (record.phase === 'starting' || record.phase === 'running') && !this.operations.has(record.id) };
    }
    enqueue(operation) {
        const result = this.tail.then(operation);
        this.tail = result.then(() => { }, () => { });
        return result;
    }
    assertOpen() { if (this.closed)
        throw new Error('Research execution owner is closed'); }
    table() { assert(this.runs !== undefined); return this.runs; }
}
export default ResearchTaskRuns;
//# sourceMappingURL=index.js.map