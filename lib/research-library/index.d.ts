/**
 * Profile-local durable research-paper library: explicit work identities,
 * exact imported source versions, and historical parser observations.
 * @module @deepseek-ai/dsh-research-library
 */
import { Context, Service } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { ResearchDocumentId } from '../research-document/index.ts';
import type { RegisterResearchPaperRequest, RegisterResearchPaperResult, ResearchPaperId as ResearchPaperIdBrand, ResearchPaperRecord, ResearchSourceVersionId as ResearchSourceVersionIdBrand, UpdateResearchAliasRequest, UpdateResearchAliasResult } from './types.ts';
export type { RegisterResearchPaperRequest, RegisterResearchPaperResult, ResearchBibliographicInput, ResearchBibliographicMetadata, ResearchDocumentObservation, ResearchExternalId, ResearchImportedDocumentInput, ResearchLibraryCapacity, ResearchMetadataField, ResearchMetadataOrigin, ResearchPaperRecord, ResearchSourceAlias, ResearchSourceVersion, UpdateResearchAliasRequest, UpdateResearchAliasResult, } from './types.ts';
export { researchLibraryDomainSpec, researchPaperRecord } from './spec.ts';
/** Identifies one paper identity in the durable library. */
export type ResearchPaperId = ResearchPaperIdBrand;
/**
 * Brand a validated or generated paper id.
 * @param value - Raw paper id string.
 * @returns the same string with its paper-id brand.
 */
export declare function ResearchPaperId(value: string): ResearchPaperId;
/** Identifies one exact source version attached to a paper. */
export type ResearchSourceVersionId = ResearchSourceVersionIdBrand;
/**
 * Brand a validated or generated source-version id.
 * @param value - Raw source-version id string.
 * @returns the same string with its source-version brand.
 */
export declare function ResearchSourceVersionId(value: string): ResearchSourceVersionId;
declare module '@deepseek-ai/cordis' {
    interface Context {
        researchLibrary: ResearchLibrary;
    }
}
/** Default maximum number of papers in one profile-local library. */
export declare const DEFAULT_MAX_PAPERS = 10000;
/** Default maximum exact source versions attached to one paper. */
export declare const DEFAULT_MAX_SOURCE_VERSIONS_PER_PAPER = 64;
/** Default maximum parser observations retained for one exact source. */
export declare const DEFAULT_MAX_OBSERVATIONS_PER_SOURCE = 16;
/** Default maximum DOI and arXiv aliases attached to one paper. */
export declare const DEFAULT_MAX_EXTERNAL_IDS_PER_PAPER = 32;
/** Default maximum display aliases attached to one exact source. */
export declare const DEFAULT_MAX_ALIASES_PER_SOURCE = 32;
/** Default maximum author names retained in one bibliographic record. */
export declare const DEFAULT_MAX_AUTHORS = 128;
/** Default UTF-8 byte limit for each stored text field. */
export declare const DEFAULT_MAX_FIELD_BYTES = 16384;
/** Durable library capacity and text-field policy. */
export interface Config {
    /** Maximum papers retained in this storage domain. Defaults to 10000. */
    readonly maxPapers?: number;
    /** Maximum exact source versions per paper. Defaults to 64. */
    readonly maxSourceVersionsPerPaper?: number;
    /** Maximum parser observations per exact source. Defaults to 16. */
    readonly maxObservationsPerSource?: number;
    /** Maximum DOI/arXiv aliases per paper. Defaults to 32. */
    readonly maxExternalIdsPerPaper?: number;
    /** Maximum display aliases per exact source. Defaults to 32. */
    readonly maxAliasesPerSource?: number;
    /** Maximum authors per paper. Defaults to 128. */
    readonly maxAuthors?: number;
    /** Maximum UTF-8 bytes in each normalized text field. Defaults to 16384. */
    readonly maxFieldBytes?: number;
}
/**
 * Durable paper-library service. One aggregate row owns a paper's metadata,
 * exact source versions, and observations so every accepted mutation commits
 * atomically through the storage-domain table.
 */
export declare class ResearchLibrary extends Service {
    static inject: string[];
    /** Loader schema for the profile-local library policy. */
    static Config: z<Config>;
    private table?;
    private readonly config;
    private operationTail;
    constructor(ctx: Context, config?: Config);
    /** Open the domain and reject any relational or configured-capacity inconsistency. */
    protected [Service.init](): Promise<void>;
    /**
     * Register a metadata-only paper or attach one exact imported document.
     * Exact DOI, arXiv, and document identities may select one existing paper;
     * contradictory identities return a non-writing conflict. Normalized title
     * equality is reported only as a possible duplicate.
     * @param request - Trusted bibliographic values and optional runtime-derived document observation.
     * @returns the committed aggregate or an explicit non-writing business result.
     */
    register(request: RegisterResearchPaperRequest): Promise<RegisterResearchPaperResult>;
    /**
     * Add or remove an external identity alias or exact-source display alias.
     * DOI/arXiv additions remain globally unique; removals are reversible
     * single-record writes and an absent alias is an idempotent no-op.
     * @param request - Alias target, action, value, and declared provenance.
     * @returns the committed paper or an explicit non-writing business result.
     */
    updateAlias(request: UpdateResearchAliasRequest): Promise<UpdateResearchAliasResult>;
    /**
     * Read one paper synchronously from the authoritative domain table.
     * @param paperId - Stable paper id.
     * @returns the durable aggregate, or `undefined` when absent.
     */
    get(paperId: ResearchPaperId): ResearchPaperRecord | undefined;
    /**
     * Return every paper in stable creation/id order. The configured paper cap
     * bounds the complete snapshot; consumers apply their own smaller result limits.
     * @returns a fresh array of durable paper aggregates.
     */
    list(): readonly ResearchPaperRecord[];
    /**
     * Resolve exact document ownership without title or author inference.
     * @param documentId - Exact content-derived document id.
     * @returns the owning paper, or `undefined` when unregistered.
     */
    findByDocumentId(documentId: ResearchDocumentId): ResearchPaperRecord | undefined;
    private registerNow;
    private createPaper;
    private enrichPaper;
    private updateAliasNow;
    private commitAlias;
    private commitSourceAlias;
    private createSource;
    private normalizeRegistration;
    private normalizeMetadata;
    private normalizeDocument;
    private optionalMetadata;
    private possibleDuplicateIds;
    private findIdentifierHolder;
    private findDocumentHolder;
    private normalizeIdentifier;
    private normalizeText;
    private assertFieldBytes;
    private validateStoredState;
    private validateRecord;
    private validateSource;
    private assertCanonicalText;
    private assertUniqueStrings;
    private requireTable;
    private enqueueOperation;
}
export default ResearchLibrary;
//# sourceMappingURL=index.d.ts.map