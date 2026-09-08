/** Durable research task progress; checkpoints attest to recorded work, not scientific truth. */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type {
  ResearchAuthorship, ResearchQuestionId, ResearchEvidenceId, ResearchClaimId, ResearchClaimReviewId,
  ResearchObservationId, ResearchObservationReviewId, ResearchComparisonProtocolId, ResearchSynthesisId,
} from '../research-information/types.ts'
import type { ResearchPaperId, ResearchSourceVersionId } from '../research-library/types.ts'
import type { ResearchReportDigest } from '../research-report/types.ts'

/** Opaque identity of one profile-local research task. */
export type ResearchTaskId = Branded<'ResearchTaskId'>

/** Named research workflows with explicit source, review, and export steps. */
export type ResearchTaskKind = 'single-paper' | 'topic-review' | 'method-comparison'

/** Ordered stages; method comparison includes a separate comparability decision. */
export type ResearchTaskStage = 'acquisition' | 'extraction' | 'review' | 'comparison' | 'synthesis' | 'export'

/** Exact paper source selected for this task; metadata and parser revisions remain library-owned. */
export interface ResearchTaskSource {
  readonly paperId: ResearchPaperId
  readonly sourceVersionId: ResearchSourceVersionId
}

/** Exact immutable scientific records used by a stage; empty collections carry no implied coverage. */
export interface ResearchTaskArtifacts {
  readonly evidenceIds: readonly ResearchEvidenceId[]
  readonly claimIds: readonly ResearchClaimId[]
  readonly claimReviewIds: readonly ResearchClaimReviewId[]
  readonly observationIds: readonly ResearchObservationId[]
  readonly observationReviewIds: readonly ResearchObservationReviewId[]
  readonly comparisonProtocolIds: readonly ResearchComparisonProtocolId[]
  readonly synthesisIds: readonly ResearchSynthesisId[]
  readonly reportDigest?: ResearchReportDigest | undefined
}

/** Immutable completed stage and a digest of its scientific inputs. */
export interface ResearchTaskCheckpoint {
  readonly taskRevision: number
  readonly stage: ResearchTaskStage
  readonly questionRevision: number
  readonly basisDigest: Branded<'ResearchTaskBasisDigest'>
  readonly sources: readonly ResearchTaskSource[]
  readonly artifacts: ResearchTaskArtifacts
  readonly summary: string
  /** Required for the comparison stage; a non-comparable outcome requires an explicit explanation. */
  readonly comparisonOutcome?: 'protocol' | 'not-comparable' | undefined
  readonly createdBy: ResearchAuthorship
  readonly createdAt: string
}

/** One atomic task aggregate; rewinding retains every historical checkpoint. */
export interface ResearchTaskRecord {
  readonly id: ResearchTaskId
  readonly questionId: ResearchQuestionId
  readonly kind: ResearchTaskKind
  readonly revision: number
  readonly phase: 'active' | 'paused' | 'blocked' | 'complete'
  readonly reason: string
  readonly sources: readonly ResearchTaskSource[]
  readonly checkpoints: readonly ResearchTaskCheckpoint[]
  /** Task revisions of the effective, ordered checkpoint prefix. */
  readonly checkpointRevisions: readonly number[]
  readonly createdBy: ResearchAuthorship
  readonly updatedBy: ResearchAuthorship
  readonly createdAt: string
  readonly updatedAt: string
}

/** Live progress derived from saved inputs and the current question, without writing. */
export interface ResearchTaskView {
  readonly task: ResearchTaskRecord
  readonly questionRevision: number
  readonly completedStages: readonly ResearchTaskStage[]
  readonly nextStage: ResearchTaskStage | null
  /** A saved checkpoint has different inputs or no longer meets its stage requirements. */
  readonly stale: boolean
  /** An active saved task requires explicit resume after a process restart. */
  readonly requiresResume: boolean
  readonly issues: readonly string[]
}

/** Create a task for an existing question; source selection commits at acquisition. */
export interface CreateResearchTaskRequest {
  readonly questionId: ResearchQuestionId
  readonly kind: ResearchTaskKind
  readonly author: ResearchAuthorship
}

/** Mutations use the inspected task revision; advancing also pins the question revision. */
export type UpdateResearchTaskRequest = {
  readonly taskId: ResearchTaskId
  readonly expectedRevision: number
  readonly author: ResearchAuthorship
} & (
  | { readonly action: 'pause' | 'block' | 'resume'; readonly reason: string }
  | { readonly action: 'rewind'; readonly stage: ResearchTaskStage; readonly reason: string }
  | {
    readonly action: 'checkpoint'
    readonly expectedQuestionRevision: number
    readonly stage: ResearchTaskStage
    readonly summary: string
    readonly sources?: readonly ResearchTaskSource[] | undefined
    readonly comparisonOutcome?: 'protocol' | 'not-comparable' | undefined
  }
)

/** Refusals leave saved progress unchanged; a successful view can already expose concurrently changed scientific inputs. */
export type ResearchTaskMutationResult =
  | { readonly status: 'saved'; readonly view: ResearchTaskView }
  | { readonly status: 'task-not-found' | 'question-not-found' }
  | { readonly status: 'stale-revision'; readonly currentRevision: number }
  | { readonly status: 'stale-question'; readonly currentRevision: number }
  | { readonly status: 'cannot-advance'; readonly issues: readonly string[]; readonly view: ResearchTaskView }
