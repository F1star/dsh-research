/** Durable, revision-checked research task checkpoints over source and review records. */
import { Service, type Context } from '@deepseek-ai/cordis';
import s from '@deepseek-ai/schemastery';
import type { ResearchTaskId, ResearchTaskRecord, ResearchTaskView, ResearchTaskMutationResult, CreateResearchTaskRequest, UpdateResearchTaskRequest } from './types.ts';
export type * from './types.ts';
export { researchTaskDomainSpec } from './spec.ts';
/** Storage and authored-checkpoint capacity, validated before opening the task domain. */
export interface Config {
    /** Maximum retained tasks. Defaults to 1000. */
    readonly maxTasks?: number;
    /** Maximum historical checkpoints per task. Defaults to 1000. */
    readonly maxCheckpointsPerTask?: number;
    /** Maximum selected exact sources per task. Defaults to 1000. */
    readonly maxSourcesPerTask?: number;
    /** Maximum Unicode code points in a summary, reason, or author id. Defaults to 10000. */
    readonly maxTextChars?: number;
    /** Maximum UTF-8 JSON bytes of one complete task record. Defaults to 2097152. */
    readonly maxTaskBytes?: number;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        researchTasks: ResearchTasks;
    }
}
/** Owns saved research progress; task phases do not schedule or authenticate agents. */
export declare class ResearchTasks extends Service {
    static inject: string[];
    /** Task storage and checkpoint bounds. */
    static Config: s<Config>;
    private readonly limits;
    private tasks?;
    private tail;
    private closed;
    private readonly activated;
    /**
     * @param ctx - scientific record owners, report renderer, and domain storage.
     * @param config - complete task and history limits.
     */
    constructor(ctx: Context, config?: Config);
    protected [Service.init](): Promise<void>;
    /**
     * List saved progress in insertion order; a saved complete phase may have stale scientific inputs.
     * @returns detached records; use get to assess current completion and the next stage.
     */
    list(): readonly ResearchTaskRecord[];
    /**
     * Inspect live progress, stopping at the first changed or incomplete checkpoint.
     * @param id - saved task identity.
     * @returns a detached view, or undefined when the task does not exist; reads never resume work.
     */
    get(id: ResearchTaskId): ResearchTaskView | undefined;
    /**
     * Create a workflow for an existing question without changing scientific records.
     * @param request - workflow, question, and producer-derived author.
     * @returns committed progress or a missing-question refusal; storage and capacity failures reject.
     */
    create(request: CreateResearchTaskRequest): Promise<ResearchTaskMutationResult>;
    /**
     * Save a stage, pause, block, explicitly resume, or rewind while retaining checkpoint history.
     * @param request - inspected revisions, action fields, and producer-derived author.
     * @returns committed progress or a non-writing refusal; concurrent scientific changes remain visible as stale inputs.
     */
    update(request: UpdateResearchTaskRequest): Promise<ResearchTaskMutationResult>;
    private view;
    private question;
    private validate;
    private table;
    private assertOpen;
    private commit;
    private enqueue;
}
export default ResearchTasks;
//# sourceMappingURL=index.d.ts.map