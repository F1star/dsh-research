/** Version-one durable research task records and queued request validation. */
import { z } from 'zod';
import type { ResearchTaskId, ResearchTaskRecord, CreateResearchTaskRequest, UpdateResearchTaskRequest } from './types.ts';
/** Complete durable task decoder; chronological and cross-record checks belong to the service. */
export declare const researchTaskSchema: z.ZodType<ResearchTaskRecord>;
/** Task requests are decoded before entering the serialized write queue. */
export declare const createResearchTaskSchema: z.ZodType<CreateResearchTaskRequest>;
/** Queued update decoder retains the stage-specific action fields. */
export declare const updateResearchTaskSchema: z.ZodType<UpdateResearchTaskRequest>;
/** Atomic task aggregates; source bytes and scientific records keep their existing storage domains. */
export declare const researchTaskDomainSpec: {
    name: string;
    version: number;
    tables: {
        tasks: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<ResearchTaskId, ResearchTaskRecord>;
    };
};
//# sourceMappingURL=spec.d.ts.map