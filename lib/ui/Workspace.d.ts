/** Research library and source-reading panel, composed into the sidebar action slot. */
import { type ReactNode } from 'react';
import type { InjectFace, PropsRuntime, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots';
import type { WorkspaceController } from './controller.ts';
/** Callbacks and observable bound by the registration, without exposing the controller. */
export interface WorkspaceInjected {
    loadObservations: WorkspaceController['loadObservations'];
    prepareReport: WorkspaceController['prepareReport'];
    loadNotes: WorkspaceController['loadNotes'];
    loadMatrix: WorkspaceController['loadMatrix'];
    submitNote: WorkspaceController['submitNote'];
    loadQuestions: WorkspaceController['loadQuestions'];
    loadClaims: WorkspaceController['loadClaims'];
    selectClaim: WorkspaceController['selectClaim'];
    loadEvidenceChoices: WorkspaceController['loadEvidenceChoices'];
    readEvidence: WorkspaceController['readEvidence'];
    loadReviews: WorkspaceController['loadReviews'];
    chooseReviewer: WorkspaceController['chooseReviewer'];
    registerReviewer: WorkspaceController['registerReviewer'];
    submitReview: WorkspaceController['submitReview'];
    openEvidence: WorkspaceController['openEvidence'];
    load: WorkspaceController['load'];
    openPaper: WorkspaceController['open'];
    turn: WorkspaceController['turn'];
    moreBlocks: WorkspaceController['moreBlocks'];
    hooks: {
        workspace: WorkspaceController;
    };
}
/** Framework owner props plus the registration's data-access face. */
export type WorkspaceProps = PropsRuntime<'sidebar.footer.action'> & PropsRenderSlots<'research.workspace.observations' | 'research.workspace.tasks'> & InjectFace<WorkspaceInjected>;
/**
 * @param props - slot owner and injected workspace callbacks.
 * @returns the research action and its modal reading workspace.
 */
export declare function Workspace({ renderSlot, loadObservations, wide, load, openPaper, turn, moreBlocks, useWorkspace, loadQuestions, loadClaims, selectClaim, loadEvidenceChoices, readEvidence, loadReviews, chooseReviewer, registerReviewer, submitReview, openEvidence, loadNotes, loadMatrix, submitNote, prepareReport, }: WorkspaceProps): ReactNode;
//# sourceMappingURL=Workspace.d.ts.map