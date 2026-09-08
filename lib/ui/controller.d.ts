/** Browser workspace state over the trusted research Remote API. */
import type { ResearchWorkspaceTask, ResearchWorkspaceTasks, ResearchWorkspaceTaskProgress, ResearchWorkspaceTaskHistory, ResearchWorkspaceTaskSources, ResearchWorkspaceTaskCreateRequest, ResearchWorkspaceTaskUpdateRequest, ResearchWorkspaceTaskMutationResult, ResearchWorkspaceObservation, ResearchWorkspaceObservations, ResearchWorkspaceObservationReviews, ResearchWorkspaceObservationReviewRequest, ResearchWorkspaceObservationReviewResult, ResearchWorkspaceObservationChoices, ResearchReportRequest, ResearchReportResult, ResearchReportBundle, ResearchWorkspaceNotes, ResearchWorkspaceNoteRequest, ResearchWorkspaceNoteResult, ResearchWorkspaceMatrix, ResearchWorkspaceClaimFilter, ResearchWorkspaceReviewer, ResearchWorkspaceQuestion, ResearchWorkspaceQuestions, ResearchWorkspaceClaims, ResearchWorkspaceClaim, ResearchWorkspaceReviews, ResearchWorkspaceReviewRequest, ResearchWorkspaceReviewResult, ResearchWorkspaceEvidenceChoices, ResearchEvidence, ResearchReadingPosition, ResearchSourceChunk, ResearchWorkspaceCatalog, ResearchWorkspaceDocument, ResearchWorkspacePage, ResearchWorkspacePaper, ResearchWorkspaceSource, SaveResearchReadingPositionResult } from '../research-workspace/types.ts';
/** Required data operations; transport failures reject before reaching this controller. */
export interface WorkspaceApi {
    createQuestion(this: void, reviewer: ResearchWorkspaceReviewer['id'], title: string, question: string): Promise<ResearchWorkspaceQuestion>;
    tasks(this: void, question: ResearchWorkspaceQuestion['id'], offset: number): Promise<ResearchWorkspaceTasks>;
    task(this: void, id: ResearchWorkspaceTask['id'], offset: number): Promise<ResearchWorkspaceTaskProgress>;
    taskHistory(this: void, id: ResearchWorkspaceTask['id'], revision: number, offset: number): Promise<ResearchWorkspaceTaskHistory>;
    taskSources(this: void, id: ResearchWorkspaceTask['id'], revision: number, checkpoint: number | null, offset: number): Promise<ResearchWorkspaceTaskSources>;
    createTask(this: void, reviewer: ResearchWorkspaceReviewer['id'], request: ResearchWorkspaceTaskCreateRequest): Promise<ResearchWorkspaceTaskMutationResult>;
    updateTask(this: void, reviewer: ResearchWorkspaceReviewer['id'], request: ResearchWorkspaceTaskUpdateRequest): Promise<ResearchWorkspaceTaskMutationResult>;
    observations(this: void, question: ResearchWorkspaceObservationReviewRequest['questionId'], offset: number): Promise<ResearchWorkspaceObservations>;
    observationChoices(this: void, question: ResearchWorkspaceObservationReviewRequest['questionId'], observation: ResearchWorkspaceObservation['observation']['id'], offset: number): Promise<ResearchWorkspaceObservationChoices>;
    observationReviews(this: void, question: ResearchWorkspaceObservationReviewRequest['questionId'], observation: ResearchWorkspaceObservation['observation']['id'], offset: number): Promise<ResearchWorkspaceObservationReviews>;
    reviewObservation(this: void, reviewer: ResearchWorkspaceReviewer['id'], request: ResearchWorkspaceObservationReviewRequest): Promise<ResearchWorkspaceObservationReviewResult>;
    report(this: void, request: ResearchReportRequest): Promise<ResearchReportResult>;
    questions(this: void, offset: number): Promise<ResearchWorkspaceQuestions>;
    claims(this: void, id: ResearchWorkspaceReviewRequest['questionId'], offset: number, filter?: ResearchWorkspaceClaimFilter): Promise<ResearchWorkspaceClaims>;
    notes(this: void, id: ResearchWorkspaceNoteRequest['questionId'], offset: number): Promise<ResearchWorkspaceNotes>;
    writeNote(this: void, reviewer: ResearchWorkspaceReviewer['id'], request: ResearchWorkspaceNoteRequest): Promise<ResearchWorkspaceNoteResult>;
    matrix(this: void, id: ResearchWorkspaceReviewRequest['questionId'], offset: number): Promise<ResearchWorkspaceMatrix>;
    reviewers(this: void): Promise<readonly ResearchWorkspaceReviewer[]>;
    registerReviewer(this: void, name: string): Promise<ResearchWorkspaceReviewer>;
    evidence(this: void, question: ResearchWorkspaceReviewRequest['questionId'], id: ResearchEvidence['id']): Promise<ResearchEvidence>;
    evidenceChoices(this: void, question: ResearchWorkspaceReviewRequest['questionId'], offset: number): Promise<ResearchWorkspaceEvidenceChoices>;
    reviews(this: void, question: ResearchWorkspaceReviewRequest['questionId'], claim: ResearchWorkspaceReviewRequest['claimId'], offset: number): Promise<ResearchWorkspaceReviews>;
    reviewClaim(this: void, reviewer: ResearchWorkspaceReviewer['id'], request: ResearchWorkspaceReviewRequest): Promise<ResearchWorkspaceReviewResult>;
    list(this: void, query: string, offset: number): Promise<ResearchWorkspaceCatalog>;
    source(this: void, id: ResearchWorkspaceDocument['documentId'], offset: number): Promise<ResearchSourceChunk>;
    position(this: void, id: ResearchWorkspaceDocument['documentId']): Promise<ResearchReadingPosition | null>;
    page(this: void, document: ResearchWorkspaceDocument, page: number, offset: number): Promise<ResearchWorkspacePage>;
    savePosition(this: void, document: ResearchWorkspaceDocument, page: number, revision: number): Promise<SaveResearchReadingPositionResult>;
}
/** One selected PDF, its extracted page preview, and the last observed saved-position revision. */
export interface ReadingView {
    readonly title: string;
    readonly document: ResearchWorkspaceDocument;
    readonly page: ResearchWorkspacePage;
    readonly sourceUrl: string;
    readonly revision: number;
}
/** Cached immutable snapshot consumed by the framework-created workspace hook. */
export interface WorkspaceView {
    readonly tasks: ResearchWorkspaceTasks | null;
    readonly task: ResearchWorkspaceTaskProgress | null;
    readonly taskHistory: ResearchWorkspaceTaskHistory | null;
    readonly taskSources: ResearchWorkspaceTaskSources | null;
    readonly taskSelection: NonNullable<Extract<ResearchWorkspaceTaskUpdateRequest, {
        action: 'checkpoint';
    }>['sources']>;
    readonly catalogQuery: string;
    readonly taskSourceCheckpoint: number | null;
    readonly taskReceipt: {
        readonly taskId: ResearchWorkspaceTask['id'];
        readonly revision: number;
    } | null;
    readonly observations: ResearchWorkspaceObservations | null;
    readonly selectedObservation: ResearchWorkspaceObservation | null;
    readonly observationReviews: ResearchWorkspaceObservationReviews | null;
    readonly observationChoices: ResearchWorkspaceObservationChoices | null;
    readonly report: ResearchReportBundle | null;
    readonly reportDownloads: readonly {
        readonly name: string;
        readonly url: string;
    }[];
    readonly notes: ResearchWorkspaceNotes | null;
    readonly matrix: ResearchWorkspaceMatrix | null;
    readonly claimFilter: ResearchWorkspaceClaimFilter | null;
    readonly questions: ResearchWorkspaceQuestions | null;
    readonly claimPage: ResearchWorkspaceClaims | null;
    readonly selectedClaim: ResearchWorkspaceClaim | null;
    readonly evidence: ResearchEvidence | null;
    readonly evidenceChoices: ResearchWorkspaceEvidenceChoices | null;
    readonly reviews: ResearchWorkspaceReviews | null;
    readonly reviewers: readonly ResearchWorkspaceReviewer[];
    readonly reviewerId: ResearchWorkspaceReviewer['id'] | null;
    readonly catalog: ResearchWorkspaceCatalog | null;
    readonly reading: ReadingView | null;
    readonly busy: boolean;
    readonly error: string | null;
}
/** Owns request cancellation, verified source URLs, and committed reading state. */
export declare class WorkspaceController {
    private readonly api;
    private state;
    private readonly listeners;
    private operation;
    private disposed;
    private notificationQueued;
    constructor(api: WorkspaceApi);
    /**
     * Read the current library and reader state.
     * @returns the same snapshot until the next publication.
     */
    getSnapshot: () => WorkspaceView;
    /**
     * Observe committed state and direct interaction feedback.
     * @param listener - framework invalidation callback.
     * @returns subscription disposer.
     */
    subscribe: (listener: () => void) => (() => void);
    /**
     * Replace the catalog with the submitted query's result page.
     * @param query - submitted title or author filter.
     * @param offset - next catalog offset, or zero for a new filter.
     * @returns after the current response has published or been superseded.
     */
    load: (query: string, offset: number) => Promise<void>;
    /**
     * Open a verified archived PDF at its saved parser revision and page.
     * @param paper - selected library entry.
     * @param source - exact source version belonging to that entry.
     * @returns after source verification and the saved page have loaded.
     */
    open: (paper: Pick<ResearchWorkspacePaper, "title">, source: ResearchWorkspaceSource) => Promise<void>;
    /**
     * Save a page selection before displaying its extracted text.
     * @param pageIndex - explicitly selected physical page.
     * @returns after the page selection commits; a stale write leaves the current view unchanged.
     */
    turn: (pageIndex: number) => Promise<void>;
    /**
     * Continue extracted blocks on the selected page without changing the saved page.
     * @returns after the next preview page has loaded.
     */
    moreBlocks: () => Promise<void>;
    /**
     * Browse questions and load explicitly selectable local reviewer identities.
     * @param offset - question continuation offset.
     * @returns after the current selection page loads.
     */
    loadQuestions: (offset: number) => Promise<void>;
    /**
     * Select a question page; changed questions clear the previous evidence and assessment.
     * @param id - durable question id.
     * @param offset - claim continuation offset.
     * @param filter - selected matrix cell, or undefined to show all claims.
     * @returns after exact claim candidates load.
     */
    loadClaims: (id: ResearchWorkspaceReviewRequest["questionId"], offset: number, filter?: ResearchWorkspaceClaimFilter) => Promise<void>;
    /**
     * Create and select a question without creating a second task implicitly.
     * @param title - researcher-authored label.
     * @param question - research question text.
     * @returns true after a confirmed commit, even if a later request supersedes publication.
     */
    createQuestion: (title: string, question: string) => Promise<boolean>;
    /**
     * List tasks belonging to the selected research question.
     * @param offset - task continuation offset; zero refreshes the selection.
     * @returns after the current list page loads.
     */
    loadTasks: (offset: number) => Promise<void>;
    /**
     * Inspect a task, its first history/source pages, and its complete editable source selection.
     * @param id - task selected from the current question or a committed receipt.
     * @returns after a consistent task view loads; failed refreshes preserve the earlier inspected view.
     */
    selectTask: (id: ResearchWorkspaceTask["id"]) => Promise<void>;
    /**
     * Append a page of current task requirements without mixing question or task revisions.
     * @param offset - continuation offset returned by the current task view.
     * @returns after matching requirements append, or a visible refresh request.
     */
    loadTaskIssues: (offset: number) => Promise<void>;
    /**
     * Append retained checkpoints at the inspected task revision.
     * @param offset - history continuation offset.
     * @returns after complete historical summaries append.
     */
    loadTaskHistory: (offset: number) => Promise<void>;
    /**
     * Inspect current or historical exact source selections.
     * @param checkpoint - historical checkpoint revision, or null for current sources.
     * @param offset - source continuation offset; zero replaces the selection view.
     * @returns after complete source choices load at the inspected task revision.
     */
    loadTaskSources: (checkpoint: number | null, offset: number) => Promise<void>;
    /**
     * Create a task for the selected question and load its committed progress.
     * @param kind - research workflow selected by the user.
     * @returns true after a confirmed commit, including a failed subsequent refresh.
     */
    createTask: (kind: ResearchWorkspaceTaskCreateRequest["kind"]) => Promise<boolean>;
    /**
     * Submit an explicit task action against the revisions displayed by the browser.
     * @param request - user-authored action and inspected revisions.
     * @returns true after a confirmed commit; refusals retain the draft and never retry automatically.
     */
    updateTask: (request: ResearchWorkspaceTaskUpdateRequest) => Promise<boolean>;
    /**
     * Read results at the latest question revision and discard earlier result drafts.
     * @param offset - result continuation offset.
     * @returns after the selected result page loads.
     */
    loadObservations: (offset: number) => Promise<void>;
    /**
     * Inspect a result, its complete review history page, source evidence, and revision choices.
     * @param selectedObservation - result from the displayed question revision.
     * @returns after the inspected data loads without mixing question revisions.
     */
    selectObservation: (selectedObservation: ResearchWorkspaceObservation) => Promise<void>;
    /**
     * Append complete source choices from the same inspected revision.
     * @param offset - choice continuation offset.
     * @returns after the next choices append, or a visible revision conflict.
     */
    loadObservationChoices: (offset: number) => Promise<void>;
    /**
     * Append decisions for the selected result, including its approving revision.
     * @param offset - history continuation offset.
     * @returns after the next history page appends.
     */
    loadObservationReviews: (offset: number) => Promise<void>;
    /**
     * Commit the reviewed result and approval atomically; refresh failure never invites resubmission.
     * @param request - researcher-entered decision at the inspected question revision.
     * @returns true once the commit is confirmed, including when refresh fails; false on refusal.
     */
    submitObservationReview: (request: ResearchWorkspaceObservationReviewRequest) => Promise<boolean>;
    /**
     * Generate downloadable report files from the inspected question revision.
     * @returns after complete file-content verification; stale questions require an explicit refresh.
     */
    prepareReport: () => Promise<void>;
    /**
     * Replace the selected question's note page, retaining exact text and historical versions.
     * @param offset - note continuation offset.
     * @returns after notes load; selecting a note's evidence remains an explicit action.
     */
    loadNotes: (offset: number) => Promise<void>;
    /**
     * Read paper-by-facet source coverage at the current durable question revision.
     * @param offset - paper continuation offset.
     * @returns after the matrix page replaces the previous page.
     */
    loadMatrix: (offset: number) => Promise<void>;
    /**
     * Append a locally attributed note and reload its committed history.
     * @param request - user-authored text, evidence, and the inspected question revision.
     * @returns true once committed, including when the subsequent refresh fails; false on refusal.
     */
    submitNote: (request: ResearchWorkspaceNoteRequest) => Promise<boolean>;
    /**
     * Inspect one exact claim and its historical decisions before editing.
     * @param claim - claim from the current question page.
     * @returns after its first evidence block and review page load.
     */
    selectClaim: (claim: ResearchWorkspaceClaim) => Promise<void>;
    /**
     * Continue the current question's evidence selector.
     * @param offset - evidence continuation offset.
     * @returns after the requested evidence choices load.
     */
    loadEvidenceChoices: (offset: number) => Promise<void>;
    /**
     * Read a complete captured evidence block without preview clipping.
     * @param id - selected evidence id in the current question.
     * @returns after the exact block loads.
     */
    readEvidence: (id: ResearchEvidence["id"]) => Promise<void>;
    /**
     * Continue immutable review history for the selected claim.
     * @param offset - review continuation offset.
     * @returns after the history page appends.
     */
    loadReviews: (offset: number) => Promise<void>;
    /**
     * Select a local identity without treating it as authenticated remote identity.
     * @param id - explicitly selected registered reviewer id, or null to clear.
     */
    chooseReviewer: (id: ResearchWorkspaceReviewer["id"] | null) => void;
    /**
     * Register and select a distinct local reviewer after its durable commit.
     * @param name - local display name entered by the researcher.
     * @returns after registration commits.
     */
    registerReviewer: (name: string) => Promise<void>;
    /**
     * Save the explicit assessment and refresh committed candidates; stale edits retain the draft.
     * @param request - exact question revision and researcher-entered assessment.
     * @returns after commit or a visible refusal; never retries a stale assessment automatically.
     */
    submitReview: (request: ResearchWorkspaceReviewRequest) => Promise<void>;
    /**
     * Open the evidence's archived parser revision and physical source page.
     * @returns after source verification; this inspection does not overwrite the saved reading position.
     */
    openEvidence: () => Promise<boolean>;
    /** Stop publication and release the owned source URL when the plugin unloads. */
    dispose(): void;
    private releaseReport;
    private readTask;
    private writeTask;
    private updatedQuestions;
    private readSource;
    private run;
    private publish;
}
//# sourceMappingURL=controller.d.ts.map