/** Owned, logged execution attempts over researcher-selected task checkpoints. */
import { Service, type Context } from '@deepseek-ai/cordis';
import s from '@deepseek-ai/schemastery';
import type { ResearchTaskId } from '../research-task/types.ts';
import type { ResearchTaskRunId, ResearchTaskRunView, ResearchTaskRunResult, StartResearchTaskRunRequest, StopResearchTaskRunRequest } from './types.ts';
export type * from './types.ts';
/** Explicit execution policy; the mounting composition supplies every deployment choice. */
export interface Config {
    /** Preset containing the research tool Consumers. */
    readonly agentPreset: string;
    /** Maximum entered model steps across all turns in one attempt. */
    readonly maxSteps: number;
    /** Deadline from accepted start through model work, in milliseconds. */
    readonly maxDurationMs: number;
    /** Maximum successive idle intervals without a scientific or task revision change. */
    readonly maxUnchangedTurns: number;
    /** Maximum simultaneously owned attempts. */
    readonly maxConcurrentRuns: number;
    /** Maximum retained attempt records; history is never evicted. */
    readonly maxRuns: number;
    /** Maximum Unicode code points in each stored text field. */
    readonly maxTextChars: number;
    /** Maximum UTF-8 JSON bytes of a complete attempt record. */
    readonly maxRunBytes: number;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        researchTaskRuns: ResearchTaskRuns;
    }
}
/** Owns fresh agent sessions; reading retained attempts never resumes model execution. */
export declare class ResearchTaskRuns extends Service {
    static inject: string[];
    /** All limits and the execution preset are required at composition time. */
    static Config: s<Config>;
    private readonly limits;
    private runs?;
    private readonly operations;
    private tail;
    private closed;
    /**
     * @param ctx - task, model, preset, session, tool policy, and persistence owners.
     * @param config - explicit execution and retention policy.
     */
    constructor(ctx: Context, config: Config);
    protected [Service.init](): Promise<void>;
    /**
     * Inspect retained attempts without resuming model work.
     * @param taskId - task whose retained execution history is requested.
     * @returns detached attempts in insertion order, bounded by maxRuns; no execution is started.
     */
    list(taskId: ResearchTaskId): readonly ResearchTaskRunView[];
    /**
     * Read one retained attempt and its process-local interruption status.
     * @param id - exact retained execution identity.
     * @returns a detached attempt, including missing terminal evidence, or undefined.
     */
    get(id: ResearchTaskRunId): ResearchTaskRunView | undefined;
    /**
     * Persist an accepted attempt before starting its owned agent session.
     * @param request - inspected task revision and trusted researcher authorship.
     * @returns a durable start receipt or refusal; accepted model work continues asynchronously.
     */
    start(request: StartResearchTaskRunRequest): Promise<ResearchTaskRunResult>;
    /**
     * Save a researcher stop and wait for the exact owned attempt to settle.
     * @param request - exact attempt and trusted researcher authorship.
     * @returns the quiescent attempt after saving stop authorship; storage or teardown failures reject.
     */
    stop(request: StopResearchTaskRunRequest): Promise<ResearchTaskRunResult>;
    private drive;
    private halt;
    private taskHalt;
    private assess;
    private steps;
    private validate;
    private save;
    private view;
    private enqueue;
    private assertOpen;
    private table;
}
export default ResearchTaskRuns;
//# sourceMappingURL=index.d.ts.map