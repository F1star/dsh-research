/** Auditable execution attempts over durable research task checkpoints. */
import type { Branded } from '@deepseek-ai/dsh-brand';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import type { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import type { ResearchAuthorship } from '../research-information/types.ts';
import type { ResearchTaskId } from '../research-task/types.ts';
/** Identity of one execution attempt, retained independently of task progress. */
export type ResearchTaskRunId = Branded<'ResearchTaskRunId'>;
/** Running describes a live attempt only when its view is not interrupted. */
export type ResearchTaskRunPhase = 'starting' | 'running' | 'completed' | 'waiting-review' | 'needs-attention' | 'stopped' | 'failed';
/** One execution's fixed model route, session identity, observed work, and terminal assessment. */
export interface ResearchTaskRunRecord {
    readonly id: ResearchTaskRunId;
    readonly taskId: ResearchTaskId;
    readonly taskRevision: number;
    readonly sessionId: SessionId;
    readonly agentPreset: string;
    readonly model: {
        readonly provider: string;
        readonly model: string;
        readonly reasoningEffort?: ReasoningEffortId | undefined;
    };
    readonly requestedBy: ResearchAuthorship;
    readonly stoppedBy: ResearchAuthorship | null;
    readonly phase: ResearchTaskRunPhase;
    readonly reason: string;
    /** Entered steps after owned session quiescence; null when no session measurement was retained. */
    readonly steps: number | null;
    readonly createdAt: string;
    readonly finishedAt: string | null;
}
/** A historical attempt can lack terminal evidence after a process crash; reading never restarts it. */
export interface ResearchTaskRunView {
    readonly record: ResearchTaskRunRecord;
    readonly interrupted: boolean;
}
/** A researcher starts from the inspected task revision after selecting exact sources. */
export interface StartResearchTaskRunRequest {
    readonly taskId: ResearchTaskId;
    readonly expectedRevision: number;
    readonly author: ResearchAuthorship;
}
/** Explicit stop targets an exact execution so an older browser cannot cancel a later attempt. */
export interface StopResearchTaskRunRequest {
    readonly runId: ResearchTaskRunId;
    readonly author: ResearchAuthorship;
}
/** Start and stop refusals preserve task progress and existing execution history. */
export type ResearchTaskRunResult = {
    readonly status: 'saved';
    readonly run: ResearchTaskRunView;
} | {
    readonly status: 'researcher-required' | 'task-not-found' | 'run-not-found' | 'already-running' | 'capacity';
} | {
    readonly status: 'stale-revision';
    readonly currentRevision: number;
} | {
    readonly status: 'cannot-start';
    readonly reason: string;
};
//# sourceMappingURL=types.d.ts.map