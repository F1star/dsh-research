/**
 * Durable schema and storage-domain declaration for research information.
 * @module @deepseek-ai/dsh-research-information/src/spec
 */
import { z } from 'zod';
import type { ResearchQuestionId, ResearchQuestionRecord } from './types.ts';
/** Durable schema for one research-question aggregate. */
export declare const researchQuestionRecord: z.ZodType<ResearchQuestionRecord>;
/** Version-seven store retaining researcher decisions and synthesis comparison provenance. */
export declare const researchInformationDomainSpec: {
    name: string;
    version: number;
    tables: {
        questions: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<ResearchQuestionId, ResearchQuestionRecord>;
    };
};
//# sourceMappingURL=spec.d.ts.map