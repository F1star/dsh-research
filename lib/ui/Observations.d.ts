/** Researcher review of paper-local results with complete experimental context and source choices. */
import { type ReactNode } from 'react';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { WorkspaceController } from './controller.ts';
/** Plain review callbacks and framework-bound workspace data. */
export interface ObservationsInjected {
    loadObservations: WorkspaceController['loadObservations'];
    selectObservation: WorkspaceController['selectObservation'];
    loadObservationChoices: WorkspaceController['loadObservationChoices'];
    loadObservationReviews: WorkspaceController['loadObservationReviews'];
    submitObservationReview: WorkspaceController['submitObservationReview'];
    readEvidence: WorkspaceController['readEvidence'];
    loadEvidenceChoices: WorkspaceController['loadEvidenceChoices'];
    hooks: {
        workspace: WorkspaceController;
    };
}
/** Root-scoped result review panel and its registration-owned callbacks. */
export type ObservationsProps = PropsRuntime<'research.workspace.observations'> & InjectFace<ObservationsInjected>;
/**
 * @param props - framework-bound question state and explicit researcher actions.
 * @returns complete result context, revision form, evidence links, and immutable decisions.
 */
export declare function Observations({ useWorkspace, loadObservations, selectObservation, loadObservationChoices, loadObservationReviews, submitObservationReview, readEvidence, loadEvidenceChoices }: ObservationsProps): ReactNode;
//# sourceMappingURL=Observations.d.ts.map