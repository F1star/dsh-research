/**
 * Durable schema and domain declaration for the research-paper library.
 * @module @deepseek-ai/dsh-research-library/src/spec
 */
import { z } from 'zod';
import type { ResearchPaperId, ResearchPaperRecord } from './types.ts';
/** Durable schema for one paper aggregate. */
export declare const researchPaperRecord: z.ZodType<ResearchPaperRecord>;
/** Version-two, single-table durable library declaration. */
export declare const researchLibraryDomainSpec: {
    name: string;
    version: number;
    tables: {
        papers: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<ResearchPaperId, ResearchPaperRecord>;
    };
};
//# sourceMappingURL=spec.d.ts.map