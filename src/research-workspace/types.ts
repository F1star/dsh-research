/** Browser-safe research workspace records; sources retain their owning identities. */

import type { ResearchDocumentId, ResearchDocumentBlockId, ResearchDocumentRect } from '../research-document/types.ts'
import type {
  ResearchAuthorId, ResearchQuestionId, ResearchEvidenceId, ResearchClaim, ResearchClaimReview, ResearchClaimEvidenceLink,
  ReviewResearchClaimRequest, ReviewResearchClaimResult, ResearchFacet, ResearchReadingNote,
  WriteResearchReadingNoteRequest, WriteResearchReadingNoteResult,
  ResearchObservation, ResearchObservationState, ResearchObservationReview, ResearchEntity,
  ReviewResearchObservationRequest, ReviewResearchObservationResult,
} from '../research-information/types.ts'
import type { ResearchPaperId, ResearchSourceVersionId } from '../research-library/types.ts'
import type {
  ResearchTaskRecord, ResearchTaskView, ResearchTaskCheckpoint, ResearchTaskMutationResult,
  CreateResearchTaskRequest, UpdateResearchTaskRequest,
} from '../research-task/types.ts'

import type { ResearchTaskRunId, ResearchTaskRunView, ResearchTaskRunResult } from '../research-task-runner/types.ts'

/** One source choice, including every registered parser revision. */
export interface ResearchWorkspaceSource {
  readonly id: ResearchSourceVersionId
  readonly documentId: ResearchDocumentId
  readonly parsers: readonly { readonly id: string; readonly version: string }[]
}

/** Bibliographic display values; authoritative metadata provenance remains in the library. */
export interface ResearchWorkspacePaper {
  readonly id: ResearchPaperId
  readonly title: string
  readonly authors: readonly string[]
  readonly year: number | null
  readonly sources: readonly ResearchWorkspaceSource[]
}

/** A page of the profile-local paper catalog. */
export interface ResearchWorkspaceCatalog {
  readonly papers: readonly ResearchWorkspacePaper[]
  readonly total: number
  readonly nextOffset: number | null
}

/** Exact parser revision required for page navigation and saved reading state. */
export interface ResearchWorkspaceDocument {
  readonly documentId: ResearchDocumentId
  readonly parserId: string
  readonly parserVersion: string
}

/** Profile-local reading position; revision prevents stale clients overwriting newer navigation. */
export interface ResearchReadingPosition extends ResearchWorkspaceDocument {
  readonly pageIndex: number
  readonly revision: number
}

/** Source bytes are base64-encoded in bounded chunks for the authenticated Remote carrier. */
export interface ResearchSourceChunk {
  readonly documentId: ResearchDocumentId
  readonly offset: number
  readonly totalBytes: number
  readonly base64: string
  readonly nextOffset: number | null
}

/** Located extracted text for a source-page reading panel. */
export interface ResearchWorkspaceBlock {
  readonly id: ResearchDocumentBlockId
  readonly text: string
  readonly textTruncated: boolean
  readonly bbox: ResearchDocumentRect
  readonly structureKind: 'table' | 'formula' | 'figure' | null
}

/** One bounded page of extracted blocks belonging to an exact PDF page. */
export interface ResearchWorkspacePage extends ResearchWorkspaceDocument {
  readonly pageIndex: number
  readonly pageCount: number
  readonly blocks: readonly ResearchWorkspaceBlock[]
  readonly nextOffset: number | null
}

/** A successful position update or the newer position that rejected a stale write. */
export type SaveResearchReadingPositionResult =
  | { readonly status: 'saved'; readonly position: ResearchReadingPosition }
  | { readonly status: 'conflict'; readonly position: ResearchReadingPosition | null }

/** Locally declared reviewer identity; this is not multi-user authentication. */
export interface ResearchWorkspaceReviewer {
  readonly id: ResearchAuthorId
  readonly displayName: string
}

/** One question available for evidence review. */
export interface ResearchWorkspaceQuestion {
  readonly id: ResearchQuestionId
  readonly title: string
  readonly question: string
  readonly revision: number
  readonly claimCount: number
}

/** Bounded question selection in durable insertion order. */
export interface ResearchWorkspaceQuestions {
  readonly questions: readonly ResearchWorkspaceQuestion[]
  readonly nextOffset: number | null
}

/** Exact claim text and its latest assessment, without treating supersession as rejection. */
export interface ResearchWorkspaceClaim {
  readonly claim: ResearchClaim
  readonly active: boolean
  readonly latestReview: ResearchClaimReview | null
}

/** A stable-revision page of claim candidates; evidence is fetched separately without truncation. */
export interface ResearchWorkspaceClaims {
  readonly question: ResearchWorkspaceQuestion
  readonly claims: readonly ResearchWorkspaceClaim[]
  readonly nextOffset: number | null
}

/** Historical assessments for one claim, including the review that created a replacement. */
export interface ResearchWorkspaceReviews {
  readonly reviews: readonly ResearchClaimReview[]
  readonly nextOffset: number | null
}

/** Browser review input; authorship comes from a registered local reviewer. */
export type ResearchWorkspaceReviewRequest = Omit<ReviewResearchClaimRequest, 'author' | 'decision' | 'replacement'> & (
  | { readonly decision: 'accepted' | 'rejected' }
  | { readonly decision: 'revised'; readonly replacement: { readonly text: string; readonly evidenceLinks: readonly ResearchClaimEvidenceLink[] } }
)

/** Compact review outcome; the client reloads the committed question after success. */
export type ResearchWorkspaceReviewResult =
  | { readonly status: 'created'; readonly revision: number }
  | Exclude<ReviewResearchClaimResult, { readonly status: 'created' }>

export type { ResearchEvidence } from '../research-information/types.ts'

/** Located preview used to select evidence; decisions can inspect the complete block separately. */
export interface ResearchWorkspaceEvidenceChoice {
  readonly id: ResearchEvidenceId
  readonly pageIndex: number
  readonly excerpt: string
  readonly excerptTruncated: boolean
}

/** Bounded evidence selector; selection survives paging by exact evidence id. */
export interface ResearchWorkspaceEvidenceChoices {
  readonly evidence: readonly ResearchWorkspaceEvidenceChoice[]
  readonly nextOffset: number | null
}

/** Exact reading notes and supersession state at one question revision. */
export interface ResearchWorkspaceNotes {
  readonly question: ResearchWorkspaceQuestion
  readonly notes: readonly { readonly note: ResearchReadingNote; readonly active: boolean }[]
  readonly nextOffset: number | null
}

/** Browser-authored note; the selected local reviewer supplies authorship. */
export type ResearchWorkspaceNoteRequest = Omit<WriteResearchReadingNoteRequest, 'author'>

/** Committed note revision or a refusal that leaves the question unchanged. */
export type ResearchWorkspaceNoteResult =
  | { readonly status: 'created'; readonly revision: number }
  | Exclude<WriteResearchReadingNoteResult, { readonly status: 'created' }>

/** Matrix drill-down selects current source statements for one paper and facet. */
export interface ResearchWorkspaceClaimFilter {
  readonly paperId: ResearchPaperId
  readonly facet: ResearchFacet
}

/** Coverage counts for current source statements, including rejected and unreviewed material. */
export interface ResearchWorkspaceMatrixRow {
  readonly paperId: ResearchPaperId
  readonly title: string
  readonly cells: readonly {
    readonly facet: ResearchFacet
    readonly total: number
    readonly accepted: number
    readonly rejected: number
    readonly unreviewed: number
  }[]
}

/** Papers with captured evidence; zero counts mean no current source statement, not contrary evidence. */
export interface ResearchWorkspaceMatrix {
  readonly question: ResearchWorkspaceQuestion
  readonly rows: readonly ResearchWorkspaceMatrixRow[]
  readonly excludedInferenceCount: number
  readonly nextOffset: number | null
}

export type { ResearchReportRequest, ResearchReportResult, ResearchReportBundle, ResearchReportFile } from '../research-report/types.ts'

/** Exact normalized result, source names, and current researcher assessment for browser review. */
export interface ResearchWorkspaceObservation {
  readonly observation: ResearchObservation
  readonly state: ResearchObservationState
  readonly paperId: ResearchPaperId
  readonly paperTitle: string
  readonly methodName: string
  readonly datasetName: string
  readonly metricName: string
  readonly evidenceIds: readonly ResearchEvidenceId[]
}

/** Bounded observation page at one inspected question revision. */
export interface ResearchWorkspaceObservations {
  readonly question: ResearchWorkspaceQuestion
  readonly observations: readonly ResearchWorkspaceObservation[]
  readonly nextOffset: number | null
}

/** Ordered decisions on the selected original or replacement observation. */
export interface ResearchWorkspaceObservationReviews {
  readonly reviews: readonly ResearchObservationReview[]
  readonly nextOffset: number | null
}

/** Browser decision; the workspace derives authorship from its registered reviewer. */
export type ResearchWorkspaceObservationReviewRequest =
  | Omit<Extract<ReviewResearchObservationRequest, { readonly decision: 'accepted' | 'rejected' }>, 'author'>
  | Omit<Extract<ReviewResearchObservationRequest, { readonly decision: 'revised' }>, 'author'>

/** Committed revision or a refusal without an observation or review write. */
export type ResearchWorkspaceObservationReviewResult =
  | { readonly status: 'created'; readonly revision: number }
  | Exclude<ReviewResearchObservationResult, { readonly status: 'created' }>

/** Complete active source claims or normalized entities available for a result revision. */
export type ResearchWorkspaceObservationChoice =
  | { readonly kind: 'claim'; readonly claim: ResearchClaim }
  | { readonly kind: 'entity'; readonly entity: ResearchEntity }

/** Revision-pinned continuation of same-paper claims and their current normalized entities. */
export interface ResearchWorkspaceObservationChoices {
  readonly questionRevision: number
  readonly choices: readonly ResearchWorkspaceObservationChoice[]
  readonly nextOffset: number | null
}

/** Saved task identity and phase; current validity requires the progress endpoint. */
export type ResearchWorkspaceTask = Pick<ResearchTaskRecord, 'id' | 'questionId' | 'kind' | 'revision' | 'phase' | 'reason'>

/** Task selection for one research question, in durable insertion order. */
export interface ResearchWorkspaceTasks {
  readonly question: ResearchWorkspaceQuestion
  readonly tasks: readonly ResearchWorkspaceTask[]
  readonly nextOffset: number | null
}

/** Live task progress with independently paged, complete requirement messages. */
export interface ResearchWorkspaceTaskProgress {
  readonly task: ResearchWorkspaceTask
  readonly questionRevision: number
  readonly completedStages: ResearchTaskView['completedStages']
  readonly nextStage: ResearchTaskView['nextStage']
  readonly stale: boolean
  readonly requiresResume: boolean
  readonly issues: readonly string[]
  readonly nextOffset: number | null
}

/** Historical stage authorship and counts; source selections have their own endpoint. */
export type ResearchWorkspaceTaskCheckpoint = Pick<ResearchTaskCheckpoint,
  'taskRevision' | 'stage' | 'summary' | 'comparisonOutcome' | 'createdBy' | 'createdAt'> & {
    readonly effective: boolean
    readonly sourceCount: number
    readonly artifactCount: number
  }

/** Ordered checkpoint history at one inspected task revision. */
export interface ResearchWorkspaceTaskHistory {
  readonly taskRevision: number
  readonly checkpoints: readonly ResearchWorkspaceTaskCheckpoint[]
  readonly nextOffset: number | null
}

/** A selected exact source and its current bibliographic title, suitable for opening the reader. */
export interface ResearchWorkspaceTaskSource {
  readonly paperId: ResearchPaperId
  readonly title: string
  readonly source: ResearchWorkspaceSource
}

/** Current or checkpoint-specific source selections; paging pins the task revision. */
export interface ResearchWorkspaceTaskSources {
  readonly taskRevision: number
  readonly sources: readonly ResearchWorkspaceTaskSource[]
  readonly nextOffset: number | null
}

/** Task creation derives researcher authorship from the selected registered identity. */
export type ResearchWorkspaceTaskCreateRequest = Omit<CreateResearchTaskRequest, 'author'>

/** Task updates retain action-specific fields and never accept client-authored attribution. */
export type ResearchWorkspaceTaskUpdateRequest =
  | Omit<Extract<UpdateResearchTaskRequest, { readonly action: 'pause' | 'block' | 'resume' }>, 'author'>
  | Omit<Extract<UpdateResearchTaskRequest, { readonly action: 'rewind' }>, 'author'>
  | Omit<Extract<UpdateResearchTaskRequest, { readonly action: 'checkpoint' }>, 'author'>

/** Compact committed task receipt or a non-writing refusal without duplicating the full history. */
export type ResearchWorkspaceTaskMutationResult =
  | { readonly status: 'saved'; readonly taskId: ResearchTaskRecord['id']; readonly revision: number }
  | { readonly status: 'cannot-advance'; readonly issues: readonly string[] }
  | Exclude<ResearchTaskMutationResult, { readonly status: 'saved' | 'cannot-advance' }>

/** Executor availability and complete execution records, paged without clipping individual attempts. */
export type ResearchWorkspaceTaskRuns =
  | { readonly status: 'unavailable' }
  | { readonly status: 'available'; readonly runs: readonly ResearchTaskRunView[]; readonly nextOffset: number | null }

/** Compact receipt remains deliverable after execution acceptance without requiring a history refresh. */
export type ResearchWorkspaceTaskRunResult =
  | { readonly status: 'saved'; readonly runId: ResearchTaskRunId }
  | Exclude<ResearchTaskRunResult, { readonly status: 'saved' }>
