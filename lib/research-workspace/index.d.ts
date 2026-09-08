/** Trusted-client access to the research library, archived PDFs, and reading positions. */
import { Service, type Context } from '@deepseek-ai/cordis';
import s from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { ResearchDocumentId } from '../research-document/types.ts';
import type { ResearchTaskRunId } from '../research-task-runner/types.ts';
import type { ResearchTaskId } from '../research-task/types.ts';
import type { ResearchReportRequest, ResearchReportResult } from '../research-report/types.ts';
import type { ResearchAuthorId, ResearchQuestionId, ResearchClaimId, ResearchEvidenceId, ResearchEvidence, ResearchObservationId } from '../research-information/types.ts';
import type { ResearchReadingPosition, ResearchSourceChunk, ResearchWorkspaceCatalog, ResearchWorkspaceDocument, ResearchWorkspacePage, SaveResearchReadingPositionResult, ResearchWorkspaceEvidenceChoices, ResearchWorkspaceReviewer, ResearchWorkspaceQuestion, ResearchWorkspaceQuestions, ResearchWorkspaceClaims, ResearchWorkspaceReviews, ResearchWorkspaceReviewRequest, ResearchWorkspaceReviewResult, ResearchWorkspaceNotes, ResearchWorkspaceNoteRequest, ResearchWorkspaceNoteResult, ResearchWorkspaceClaimFilter, ResearchWorkspaceMatrix, ResearchWorkspaceObservations, ResearchWorkspaceObservationReviews, ResearchWorkspaceObservationChoices, ResearchWorkspaceObservationReviewRequest, ResearchWorkspaceObservationReviewResult, ResearchWorkspaceTasks, ResearchWorkspaceTaskProgress, ResearchWorkspaceTaskHistory, ResearchWorkspaceTaskSources, ResearchWorkspaceTaskCreateRequest, ResearchWorkspaceTaskUpdateRequest, ResearchWorkspaceTaskMutationResult, ResearchWorkspaceTaskRuns, ResearchWorkspaceTaskRunResult } from './types.ts';
export type * from './types.ts';
export { researchWorkspaceDomainSpec, researchReadingPositionSchema } from './spec.ts';
/** Workspace response and persistence capacity policy. */
export interface Config {
    /** Maximum catalog entries or extracted blocks per response. Defaults to 100. */
    readonly maxItems?: number;
    /** Maximum Unicode code points per extracted text preview. Defaults to 2000. */
    readonly maxTextChars?: number;
    /** Maximum raw PDF bytes per source response. Defaults to 262144. */
    readonly sourceChunkBytes?: number;
    /** Maximum complete JSON response size. Defaults to 2097152. */
    readonly maxResponseBytes?: number;
    /** Maximum saved document positions. Defaults to 1000. */
    readonly maxPositions?: number;
    /** Maximum local declared reviewer profiles. Defaults to 100. */
    readonly maxReviewers?: number;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        researchWorkspace: ResearchWorkspace;
    }
}
/** Profile-local workspace API; it neither creates Agents nor writes model-visible content. */
export declare class ResearchWorkspace extends TypertRemoteService {
    static inject: string[];
    /** Loader defaults for response and saved-position bounds. */
    static Config: s<Config>;
    private readonly limits;
    private positions?;
    private reviewerTable?;
    private tail;
    private closed;
    /**
     * @param ctx - host context with library, document archive, and domain storage.
     * @param config - workspace response and persistence limits.
     */
    constructor(ctx: Context, config?: Config);
    protected [Service.init](): Promise<void>;
    /**
     * Browse registered papers in library order without changing identities.
     * @param query - case-insensitive title or author substring; empty selects every paper.
     * @param offset - zero-based position after filtering.
     * @returns a bounded catalog page with a continuation offset.
     */
    list(query: string, offset: number): ResearchWorkspaceCatalog;
    /**
     * Read exact archived PDF bytes through the trusted Remote carrier.
     * @param documentId - registered source content id.
     * @param offset - zero-based raw byte offset; repeat nextOffset until null.
     * @returns an encoded chunk whose identity and total refer to the complete source.
     */
    source(documentId: ResearchDocumentId, offset: number): Promise<ResearchSourceChunk>;
    /**
     * Read located text previews for one physical page of a selected parser revision.
     * @param document - exact registered source and parser revision.
     * @param pageIndex - zero-based physical page.
     * @param offset - zero-based block offset within that page.
     * @returns bounded text previews and geometry; clipped text is explicitly marked.
     */
    page(document: ResearchWorkspaceDocument, pageIndex: number, offset: number): Promise<ResearchWorkspacePage>;
    /**
     * Read the profile-local last explicit page selection.
     * @param documentId - registered source content id.
     * @returns saved position or null; callers restore its exact parser revision.
     */
    position(documentId: ResearchDocumentId): ResearchReadingPosition | null;
    /**
     * Save an explicit page selection after validating source, parser, and page ownership.
     * @param document - selected source and registered parser revision.
     * @param pageIndex - zero-based physical page.
     * @param expectedRevision - last observed revision, or zero for a first position.
     * @returns committed position, or the newer position on conflict without a write.
     */
    savePosition(document: ResearchWorkspaceDocument, pageIndex: number, expectedRevision: number): Promise<SaveResearchReadingPositionResult>;
    /**
     * List locally declared identities; selecting one does not authenticate a remote person.
     * @returns registered reviewer names and host-generated ids.
     */
    reviewers(): readonly ResearchWorkspaceReviewer[];
    /**
     * Register a distinct local reviewer through the trusted browser carrier.
     * @param displayName - nonempty local display name; duplicate names remain separate identities.
     * @returns the durable identity after its commit.
     */
    registerReviewer(displayName: string): Promise<ResearchWorkspaceReviewer>;
    /**
     * Browse research questions without exposing complete evidence aggregates.
     * @param offset - zero-based question offset.
     * @returns an exact-text, bounded selection page.
     */
    questions(offset: number): ResearchWorkspaceQuestions;
    /**
     * Create a research question with explicit local researcher authorship.
     * @param reviewerId - registered local identity selected by the user.
     * @param title - question label.
     * @param question - research question text, locked once scientific records are attached.
     * @returns the committed question summary; validation and capacity failures create no question.
     */
    createQuestion(reviewerId: ResearchAuthorId, title: string, question: string): Promise<ResearchWorkspaceQuestion>;
    /**
     * List saved tasks for the selected research question.
     * @param questionId - question owning the tasks.
     * @param offset - zero-based task continuation offset.
     * @returns bounded task summaries; saved complete phases can have stale scientific inputs.
     */
    tasks(questionId: ResearchQuestionId, offset: number): ResearchWorkspaceTasks;
    /**
     * Inspect the earliest unfinished stage against current scientific records.
     * @param taskId - selected task.
     * @param offset - zero-based requirement-message continuation offset.
     * @returns exact requirements and current task/question revisions; reads never activate a task.
     */
    task(taskId: ResearchTaskId, offset: number): ResearchWorkspaceTaskProgress;
    /**
     * Inspect checkpoint history without embedding large source and artifact collections.
     * @param taskId - selected task.
     * @param expectedRevision - task revision inspected by the client.
     * @param offset - zero-based historical checkpoint offset.
     * @returns complete checkpoint summaries at the pinned revision; changed tasks require refresh.
     */
    taskHistory(taskId: ResearchTaskId, expectedRevision: number, offset: number): ResearchWorkspaceTaskHistory;
    /**
     * Read exact current or historical source selections and their registered parser choices.
     * @param taskId - selected task.
     * @param expectedRevision - task revision inspected by the client.
     * @param checkpointRevision - historical checkpoint revision, or null for current selected sources.
     * @param offset - zero-based source continuation offset.
     * @returns complete source entries at the pinned task revision; bibliographic titles are current.
     */
    taskSources(taskId: ResearchTaskId, expectedRevision: number, checkpointRevision: number | null, offset: number): ResearchWorkspaceTaskSources;
    /**
     * Create a task for an existing question under the selected researcher identity.
     * @param reviewerId - explicitly selected registered local identity.
     * @param request - existing question and workflow kind.
     * @returns a compact committed receipt or refusal; response capacity is checked before writing.
     */
    createTask(reviewerId: ResearchAuthorId, request: ResearchWorkspaceTaskCreateRequest): Promise<ResearchWorkspaceTaskMutationResult>;
    /**
     * Save explicit task progress without scheduling model work or fabricating scientific records.
     * @param reviewerId - explicitly selected registered local identity.
     * @param request - inspected task/question revisions and authored action fields.
     * @returns a compact committed receipt or complete refusal; accepted writes drain on unload.
     */
    updateTask(reviewerId: ResearchAuthorId, request: ResearchWorkspaceTaskUpdateRequest): Promise<ResearchWorkspaceTaskMutationResult>;
    /**
     * Read execution history without starting or recovering an agent.
     * @param taskId - selected task whose attempts are requested.
     * @param offset - zero-based execution offset.
     * @returns complete paged attempts, or explicit unavailability when no executor is mounted.
     */
    taskRuns(taskId: ResearchTaskId, offset: number): ResearchWorkspaceTaskRuns;
    /**
     * Start a separate logged execution from inspected task progress.
     * @param reviewerId - explicitly selected registered local identity.
     * @param taskId - task with confirmed exact sources.
     * @param expectedRevision - task revision the researcher inspected.
     * @returns a compact durable receipt or refusal; the receipt does not imply model completion.
     */
    startTaskRun(reviewerId: ResearchAuthorId, taskId: ResearchTaskId, expectedRevision: number): Promise<ResearchWorkspaceTaskRunResult>;
    /**
     * Stop an exact attempt and wait for its owned work to settle.
     * @param reviewerId - explicitly selected registered local identity.
     * @param runId - exact execution, preventing cancellation of a newer attempt.
     * @returns a compact persisted receipt or refusal; read history for the terminal assessment.
     */
    stopTaskRun(reviewerId: ResearchAuthorId, runId: ResearchTaskRunId): Promise<ResearchWorkspaceTaskRunResult>;
    private runReceipt;
    /**
     * Read claim candidates and latest explicit researcher decisions.
     * @param questionId - selected question.
     * @param offset - zero-based claim offset, including historical claims.
     * @param filter - optional matrix cell; selects only current source statements for its paper and facet.
     * @returns exact claim text, activity, and the current question revision.
     */
    claims(questionId: ResearchQuestionId, offset: number, filter?: ResearchWorkspaceClaimFilter): ResearchWorkspaceClaims;
    /**
     * Read immutable notes, including superseded versions, without clipping their text.
     * @param questionId - question owning the notes.
     * @param offset - zero-based note offset in durable insertion order.
     * @returns exact notes and their current activity at the returned question revision.
     */
    notes(questionId: ResearchQuestionId, offset: number): ResearchWorkspaceNotes;
    /**
     * Append a researcher note or revision using the existing evidence and supersession rules.
     * @param reviewerId - explicitly selected local identity.
     * @param request - exact question revision, evidence, note text, and optional predecessor.
     * @returns committed revision or a refusal; the author is derived from the registered identity.
     */
    writeNote(reviewerId: ResearchAuthorId, request: ResearchWorkspaceNoteRequest): Promise<ResearchWorkspaceNoteResult>;
    /**
     * Summarize captured source-statement coverage without treating inference as source content.
     * @param questionId - selected research question.
     * @param offset - zero-based paper offset in first-evidence order.
     * @returns bounded paper rows, independent review counts, and the count of excluded current inferences.
     */
    matrix(questionId: ResearchQuestionId, offset: number): ResearchWorkspaceMatrix;
    /**
     * Browse captured evidence for claim revision and counterevidence selection.
     * @param questionId - question owning the evidence.
     * @param offset - zero-based evidence offset.
     * @returns located previews, with clipping explicitly marked and complete blocks separately available.
     */
    evidenceChoices(questionId: ResearchQuestionId, offset: number): ResearchWorkspaceEvidenceChoices;
    /**
     * Read a captured source block without preview truncation.
     * @param questionId - question owning the evidence.
     * @param evidenceId - exact evidence selected from a claim or review.
     * @returns complete evidence with source and parser locators; oversize responses fail explicitly.
     */
    evidence(questionId: ResearchQuestionId, evidenceId: ResearchEvidenceId): ResearchEvidence;
    /**
     * Read immutable review history in committed revision order.
     * @param questionId - question owning the claim.
     * @param claimId - original or replacement claim whose assessments are requested.
     * @param offset - zero-based review offset.
     * @returns a bounded history page with exact reasons and counterevidence references.
     */
    reviews(questionId: ResearchQuestionId, claimId: ResearchClaimId, offset: number): ResearchWorkspaceReviews;
    /**
     * Submit a researcher decision through the trusted browser carrier.
     * @param reviewerId - identity registered by the local workspace.
     * @param request - question revision, assessment, and optional replacement; no author fields.
     * @returns committed revision or explicit refusal; agent tools cannot supply a researcher author here.
     */
    reviewClaim(reviewerId: ResearchAuthorId, request: ResearchWorkspaceReviewRequest): Promise<ResearchWorkspaceReviewResult>;
    /**
     * Read complete normalized results with source names and current review state.
     * @param questionId - research question owning the observations.
     * @param offset - zero-based observation offset.
     * @returns complete bounded records, including superseded and rejected results for audit.
     */
    observations(questionId: ResearchQuestionId, offset: number): ResearchWorkspaceObservations;
    /**
     * Read complete current source choices for revising a paper-local result.
     * @param questionId - question owning the result.
     * @param observationId - result whose paper limits available source claims.
     * @param offset - continuation offset across claims followed by entities.
     * @returns bounded choices and the question revision required for consistent continuation.
     */
    observationChoices(questionId: ResearchQuestionId, observationId: ResearchObservationId, offset: number): ResearchWorkspaceObservationChoices;
    /**
     * Read exact observation decision history, including the decision that created a replacement.
     * @param questionId - question owning the observation.
     * @param observationId - original or replacement observation.
     * @param offset - zero-based decision offset.
     * @returns bounded, ordered decisions with complete reasons and counterevidence references.
     */
    observationReviews(questionId: ResearchQuestionId, observationId: ResearchObservationId, offset: number): ResearchWorkspaceObservationReviews;
    /**
     * Assess a result under a registered local researcher identity.
     * @param reviewerId - identity explicitly selected in the browser.
     * @param request - inspected question revision, decision, and optional complete replacement.
     * @returns committed revision or an explicit refusal; unload waits for admitted writes.
     */
    reviewObservation(reviewerId: ResearchAuthorId, request: ResearchWorkspaceObservationReviewRequest): Promise<ResearchWorkspaceObservationReviewResult>;
    /**
     * Export the inspected question as a report draft and complete audit/citation files.
     * @param request - question id and the revision the researcher inspected.
     * @returns complete files or a non-writing refusal; the workspace response bound applies to the whole result.
     */
    report(request: ResearchReportRequest): ResearchReportResult;
    private reviewersTable;
    private taskAuthor;
    private inspectedTask;
    private taskReceipt;
    private trackTaskWrite;
    private question;
    private pageItems;
    private requireSource;
    private restore;
    private table;
    private fits;
    private bounded;
}
export default ResearchWorkspace;
//# sourceMappingURL=index.d.ts.map