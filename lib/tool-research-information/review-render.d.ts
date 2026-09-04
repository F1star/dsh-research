/**
 * Deterministic Markdown projection for one retained research synthesis.
 * @module @f1star/dsh-research/tool-research-information/review-render
 */
import type { ResearchEvidence, ResearchQuestionRecord, ResearchSynthesisId } from '../research-information/index.ts';
import type { ResearchPaperId, ResearchPaperRecord } from '../research-library/index.ts';
/** Current ability to verify durable evidence against an imported document. */
export type ResearchReviewEvidenceCoverage = 'readable' | 'needs-ocr' | 'reimport-required' | 'parser-mismatch' | 'locator-mismatch';
/** Stable warning codes emitted by the review renderer. */
export declare const RESEARCH_REVIEW_WARNING_CODES: readonly ["question-not-found", "synthesis-not-found", "synthesis-inactive", "stale-claim-reference", "claim-not-found", "evidence-not-found", "source-summary-without-supporting-evidence", "uncited-inference-finding", "paper-not-found", "bibliography-incomplete", "evidence-not-currently-readable", "review-too-large"];
/** One actionable limitation of a rendered review. */
export interface ResearchReviewWarning {
    readonly code: typeof RESEARCH_REVIEW_WARNING_CODES[number];
    readonly message: string;
    readonly findingId?: string;
    readonly claimId?: string;
    readonly evidenceId?: string;
    readonly paperId?: string;
}
/** Read-only dependencies owned by the mounted research services. */
export interface ResearchReviewRenderDependencies {
    /**
     * Return current bibliographic metadata for one durable paper identity.
     * @param paperId - durable paper identity referenced by evidence.
     * @returns current paper metadata, or `undefined` if the record is absent.
     */
    paper(paperId: ResearchPaperId): ResearchPaperRecord | undefined;
    /**
     * Inspect whether one durable evidence anchor is currently reproducible.
     * @param evidence - durable evidence whose locator should be checked.
     * @returns current reproducibility status.
     */
    evidenceCoverage(evidence: ResearchEvidence): ResearchReviewEvidenceCoverage;
}
/** Safety and disclosure policy for one deterministic review projection. */
export interface ResearchReviewRenderOptions {
    readonly includeSelectedQuotes: boolean;
    readonly maxCharacters: number;
    readonly maxWarnings: number;
}
/** Complete deterministic projection before model-output paging. */
export interface ResearchReviewRenderResult {
    readonly status: 'ready' | 'ready-with-warnings' | 'not-ready';
    readonly questionId: string;
    readonly synthesisId: string;
    readonly warnings: readonly ResearchReviewWarning[];
    readonly markdown?: string;
}
/**
 * Render one explicit active synthesis without generating new prose or changing durable state.
 * @param question - durable question aggregate, or `undefined` when the id is absent.
 * @param synthesisId - explicit synthesis selected by the caller.
 * @param dependencies - current library metadata and evidence reproducibility checks.
 * @param options - output disclosure and complete-render safety limits.
 * @returns readiness, warnings, and deterministic Markdown when the synthesis is active.
 */
export declare function renderResearchReview(question: ResearchQuestionRecord | undefined, synthesisId: ResearchSynthesisId, dependencies: ResearchReviewRenderDependencies, options: ResearchReviewRenderOptions): ResearchReviewRenderResult;
//# sourceMappingURL=review-render.d.ts.map