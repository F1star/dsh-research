/** Durable execution-attempt decoding and queued request validation. */
import { z } from 'zod';
import type { ResearchTaskRunId, ResearchTaskRunRecord, StartResearchTaskRunRequest, StopResearchTaskRunRequest } from './types.ts';
/** The complete attempt remains readable without a live agent or an available model provider. */
export declare const researchTaskRunSchema: z.ZodType<ResearchTaskRunRecord>;
/** Start requests are detached and validated before joining the serialized queue. */
export declare const startResearchTaskRunSchema: z.ZodType<StartResearchTaskRunRequest>;
/** A stop always names an exact attempt, including the local researcher who requested it. */
export declare const stopResearchTaskRunSchema: z.ZodType<StopResearchTaskRunRequest>;
/** Attempts retain their session identities and terminal assessments independently of scientific checkpoints. */
export declare const researchTaskRunDomainSpec: {
    name: string;
    version: number;
    tables: {
        runs: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<ResearchTaskRunId, ResearchTaskRunRecord>;
    };
};
//# sourceMappingURL=spec.d.ts.map