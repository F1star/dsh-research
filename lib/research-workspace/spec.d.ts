/** Version-two profile-local reading positions and declared reviewer identities. */
import { z } from 'zod';
import type { ResearchAuthorId } from '../research-information/types.ts';
import type { ResearchReadingPosition, ResearchWorkspaceReviewer } from './types.ts';
/** Durable reading-position fields, validated before decoding or writing. */
export declare const researchReadingPositionSchema: z.ZodObject<{
    documentId: z.ZodPipe<z.ZodString, z.ZodTransform<import("../research-document/types.ts").ResearchDocumentId, string>>;
    parserId: z.ZodString;
    parserVersion: z.ZodString;
    pageIndex: z.ZodNumber;
    revision: z.ZodNumber;
}, z.core.$strict>;
/** Stored local identity; scientific decisions remain in research-information. */
export declare const researchWorkspaceReviewerSchema: z.ZodObject<{
    id: z.ZodPipe<z.ZodUUID, z.ZodTransform<ResearchAuthorId, string>>;
    displayName: z.ZodString;
}, z.core.$strict>;
/** Durable reading and local reviewer domain; scientific decisions remain in question aggregates. */
export declare const researchWorkspaceDomainSpec: {
    name: string;
    version: number;
    tables: {
        positions: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<import("../research-document/types.ts").ResearchDocumentId, ResearchReadingPosition>;
        reviewers: import("@deepseek-ai/dsh-storage-domain").DomainTableSpec<ResearchAuthorId, ResearchWorkspaceReviewer>;
    };
};
//# sourceMappingURL=spec.d.ts.map