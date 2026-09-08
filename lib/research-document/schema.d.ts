/** Validated parser output shared by process decoders and durable document archives. */
import { z } from 'zod';
import type { ResearchDocumentParseResult } from './types.ts';
/** Decode complete parser output at process and durable storage boundaries. */
export declare const researchDocumentParseResultSchema: z.ZodType<ResearchDocumentParseResult>;
//# sourceMappingURL=schema.d.ts.map