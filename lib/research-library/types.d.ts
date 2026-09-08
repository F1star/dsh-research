/**
 * Public data vocabulary for the durable research-paper library. Runtime id
 * factories and the service implementation live in the package root.
 * @module @deepseek-ai/dsh-research-library/types
 */
import type { Branded } from '@deepseek-ai/dsh-brand';
import type { ResearchDocumentExtraction, ResearchDocumentId } from '../research-document/types.ts';
/** Stable identity of one research work inside a profile-local library. */
export type ResearchPaperId = Branded<'ResearchPaperId'>;
/** Stable identity of one exact document source attached to a paper. */
export type ResearchSourceVersionId = Branded<'ResearchSourceVersionId'>;
/** Provenance of a normalized bibliographic value. */
export type ResearchMetadataOrigin = 'declared' | 'parser' | 'source-derived';
/** One normalized bibliographic field together with its provenance class. */
export interface ResearchMetadataField<T> {
    readonly value: T;
    readonly origin: ResearchMetadataOrigin;
}
/** Canonical bibliographic metadata retained for one paper identity. */
export interface ResearchBibliographicMetadata {
    readonly title: ResearchMetadataField<string>;
    readonly authors?: ResearchMetadataField<readonly string[]> | undefined;
    readonly year?: ResearchMetadataField<number> | undefined;
    readonly venue?: ResearchMetadataField<string> | undefined;
}
/** Exact external identifier alias owned by one paper identity. */
export interface ResearchExternalId {
    readonly kind: 'doi' | 'arxiv';
    readonly value: string;
    readonly origin: ResearchMetadataOrigin;
    readonly addedAt: string;
}
/** Explicit display alias attached to one exact source version. */
export interface ResearchSourceAlias {
    readonly value: string;
    readonly origin: ResearchMetadataOrigin;
    readonly addedAt: string;
}
/** Historical parser interpretation of one exact imported document. */
export interface ResearchDocumentObservation {
    readonly parserId: string;
    readonly parserVersion: string;
    readonly mediaType: string;
    readonly extraction: ResearchDocumentExtraction;
    readonly documentTitle?: string | undefined;
    readonly pageCount: number;
    readonly blockCount: number;
    readonly observedAt: string;
}
/** One exact imported document and every retained parser interpretation. */
export interface ResearchSourceVersion {
    readonly id: ResearchSourceVersionId;
    readonly documentId: ResearchDocumentId;
    readonly state: 'imported';
    readonly aliases: readonly ResearchSourceAlias[];
    readonly observations: readonly ResearchDocumentObservation[];
    readonly createdAt: string;
    readonly updatedAt: string;
}
/** Durable aggregate for one research work. */
export interface ResearchPaperRecord {
    readonly id: ResearchPaperId;
    readonly metadata: ResearchBibliographicMetadata;
    readonly externalIds: readonly ResearchExternalId[];
    readonly acquisitionState: 'metadata-only' | 'imported';
    readonly sourceVersions: readonly ResearchSourceVersion[];
    readonly createdAt: string;
    readonly updatedAt: string;
}
/** Bibliographic values supplied by one trusted same-process consumer. */
export interface ResearchBibliographicInput {
    readonly title?: string;
    readonly authors?: readonly string[];
    readonly year?: number;
    readonly venue?: string;
    readonly origin: ResearchMetadataOrigin;
}
/** Exact imported-document observation supplied by a document-runtime consumer. */
export interface ResearchImportedDocumentInput {
    readonly documentId: ResearchDocumentId;
    readonly mediaType: string;
    readonly parserId: string;
    readonly parserVersion: string;
    readonly extraction: ResearchDocumentExtraction;
    readonly documentTitle?: string;
    readonly pageCount: number;
    readonly blockCount: number;
    readonly sourceAlias?: string;
}
/** Register or enrich one paper without silently merging approximate matches. */
export interface RegisterResearchPaperRequest {
    readonly paperId?: ResearchPaperId;
    readonly metadata?: ResearchBibliographicInput;
    readonly externalIds?: readonly {
        readonly kind: 'doi' | 'arxiv';
        readonly value: string;
        readonly origin: ResearchMetadataOrigin;
    }[];
    readonly document?: ResearchImportedDocumentInput;
}
/** Capacity category reported by a rejected business mutation. */
export type ResearchLibraryCapacity = 'papers' | 'source-versions' | 'observations' | 'external-ids' | 'source-aliases';
/** Successful or non-writing business result of paper registration. */
export type RegisterResearchPaperResult = {
    readonly status: 'created' | 'updated' | 'unchanged';
    readonly paper: ResearchPaperRecord;
    readonly sourceVersionId?: ResearchSourceVersionId;
    readonly possibleDuplicateIds: readonly ResearchPaperId[];
} | {
    readonly status: 'paper-not-found';
    readonly paperId: ResearchPaperId;
} | {
    readonly status: 'identifier-conflict';
    readonly paperIds: readonly ResearchPaperId[];
    readonly identifiers: readonly string[];
} | {
    readonly status: 'document-conflict';
    readonly documentId: ResearchDocumentId;
    readonly paperId: ResearchPaperId;
} | {
    readonly status: 'metadata-conflict';
    readonly paperId: ResearchPaperId;
    readonly fields: readonly string[];
} | {
    readonly status: 'capacity';
    readonly resource: ResearchLibraryCapacity;
};
/** Reversible identity or source-alias mutation. */
export type UpdateResearchAliasRequest = {
    readonly action: 'add' | 'remove';
    readonly paperId: ResearchPaperId;
    readonly kind: 'doi' | 'arxiv';
    readonly value: string;
    readonly origin: ResearchMetadataOrigin;
} | {
    readonly action: 'add' | 'remove';
    readonly paperId: ResearchPaperId;
    readonly kind: 'source';
    readonly sourceVersionId: ResearchSourceVersionId;
    readonly value: string;
    readonly origin: ResearchMetadataOrigin;
};
/** Successful or non-writing business result of an alias mutation. */
export type UpdateResearchAliasResult = {
    readonly status: 'updated' | 'unchanged';
    readonly paper: ResearchPaperRecord;
} | {
    readonly status: 'paper-not-found';
    readonly paperId: ResearchPaperId;
} | {
    readonly status: 'source-not-found';
    readonly paperId: ResearchPaperId;
    readonly sourceVersionId: ResearchSourceVersionId;
} | {
    readonly status: 'identifier-conflict';
    readonly paperIds: readonly ResearchPaperId[];
    readonly identifiers: readonly string[];
} | {
    readonly status: 'capacity';
    readonly resource: 'external-ids' | 'source-aliases';
};
//# sourceMappingURL=types.d.ts.map