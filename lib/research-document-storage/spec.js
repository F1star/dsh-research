/** Durable source and parser-snapshot schema for the research archive. */
import { z } from 'zod';
import { ResearchDocumentId, researchDocumentParseResultSchema } from "../research-document/index.js";
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
/** Validated source bytes and all retained extraction revisions for one content id. */
export const researchDocumentArchiveRecord = z.strictObject({
    documentId: z.string().regex(/^sha256:[0-9a-f]{64}$/).transform(ResearchDocumentId),
    mediaType: z.string().min(1),
    sourceBase64: z.string(),
    currentRevision: z.number().int().nonnegative(),
    revisions: z.array(z.strictObject({ parserId: z.string().min(1), parsed: researchDocumentParseResultSchema })).min(1),
}).refine(value => value.currentRevision < value.revisions.length, {
    message: 'current parser revision must exist',
});
/** Independent version-two domain; changing parser output requires a schema decision. */
export const researchDocumentArchiveDomainSpec = defineDomain({
    name: 'research_document_archive',
    version: 2,
    tables: { documents: domainTable(researchDocumentArchiveRecord) },
});
//# sourceMappingURL=spec.js.map