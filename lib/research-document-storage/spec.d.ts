/** Durable source and parser-snapshot schema for the research archive. */
import { z } from 'zod';
/** Validated source bytes and all retained extraction revisions for one content id. */
export declare const researchDocumentArchiveRecord: z.ZodObject<{
    documentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../research-document/types.ts").ResearchDocumentId, string>>;
    mediaType: z.ZodString;
    sourceBase64: z.ZodString;
    currentRevision: z.ZodNumber;
    revisions: z.ZodArray<z.ZodObject<{
        parserId: z.ZodString;
        parsed: z.ZodType<import("../research-document/types.ts").ResearchDocumentParseResult, unknown, z.core.$ZodTypeInternals<import("../research-document/types.ts").ResearchDocumentParseResult, unknown>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
/** Durable archive row after schema validation. */
export type ResearchDocumentArchiveRecord = z.infer<typeof researchDocumentArchiveRecord>;
/** Independent version-two domain; changing parser output requires a schema decision. */
export declare const researchDocumentArchiveDomainSpec: {
    name: string;
    version: number;
    tables: {
        documents: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<import("../research-document/types.ts").ResearchDocumentId, {
            documentId: import("../research-document/types.ts").ResearchDocumentId;
            mediaType: string;
            sourceBase64: string;
            currentRevision: number;
            revisions: {
                parserId: string;
                parsed: import("../research-document/types.ts").ResearchDocumentParseResult;
            }[];
        }>;
    };
};
//# sourceMappingURL=spec.d.ts.map