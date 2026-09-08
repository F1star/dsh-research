/** Stage requirements and dependency digests over authoritative scientific records. */
import type { ResearchQuestionRecord } from '../research-information/types.ts';
import type { ResearchPaperRecord } from '../research-library/types.ts';
import type { ResearchReportResult } from '../research-report/types.ts';
import type { ResearchTaskKind, ResearchTaskStage, ResearchTaskSource, ResearchTaskArtifacts, ResearchTaskCheckpoint } from './types.ts';
/**
 * Resolve the ordered named workflow, including explicit method comparability.
 * @param kind - user-selected research workflow.
 * @returns stages whose completion requires recorded artifacts and an authored checkpoint.
 */
export declare function taskStages(kind: ResearchTaskKind): readonly ResearchTaskStage[];
/** Current requirements and exact record references for one stage. */
export interface StageInspection {
    readonly issues: readonly string[];
    readonly basisDigest: ResearchTaskCheckpoint['basisDigest'];
    readonly artifacts: ResearchTaskArtifacts;
}
/**
 * Check a stage against current source, review, and report state without mutation.
 * @param stage - workflow stage under inspection.
 * @param kind - selected workflow's source-count requirements.
 * @param question - complete current scientific aggregate.
 * @param sources - exact task source selection.
 * @param papers - current registered paper records.
 * @param report - lazy revision-pinned export used only by the export stage.
 * @param comparisonOutcome - authored comparability choice for method comparisons.
 * @returns issues, historical artifact references, and the digest that detects changed dependencies.
 */
export declare function inspectStage(stage: ResearchTaskStage, kind: ResearchTaskKind, question: ResearchQuestionRecord, sources: readonly ResearchTaskSource[], papers: readonly ResearchPaperRecord[], report: () => ResearchReportResult, comparisonOutcome?: 'protocol' | 'not-comparable'): StageInspection;
//# sourceMappingURL=stages.d.ts.map