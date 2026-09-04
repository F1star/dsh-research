/**
 * Durable schema and storage-domain declaration for research information.
 * @module @f1star/dsh-research/research-information/src/spec
 */
import { z } from 'zod';
import type { ResearchQuestionId, ResearchQuestionRecord } from './types.ts';
/** Durable schema for one research-question aggregate. */
export declare const researchQuestionRecord: z.ZodType<ResearchQuestionRecord>;
/** Version-five aggregate store whose synthesis findings explicitly retain comparison protocols. */
export declare const researchInformationDomainSpec: {
    name: string;
    version: number;
    tables: {
        questions: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<ResearchQuestionId, ResearchQuestionRecord>;
    };
};
//# sourceMappingURL=spec.d.ts.map