/** Research task selection, authored checkpoints, and explicit recovery. */
import { type ReactNode } from 'react';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { WorkspaceController } from './controller.ts';
/** Task operations and a framework-bound view of the shared workspace. */
export interface TasksInjected {
    createQuestion: WorkspaceController['createQuestion'];
    createTask: WorkspaceController['createTask'];
    updateTask: WorkspaceController['updateTask'];
    loadTasks: WorkspaceController['loadTasks'];
    selectTask: WorkspaceController['selectTask'];
    loadTaskHistory: WorkspaceController['loadTaskHistory'];
    loadTaskSources: WorkspaceController['loadTaskSources'];
    loadTaskIssues: WorkspaceController['loadTaskIssues'];
    loadCatalog: WorkspaceController['load'];
    hooks: {
        workspace: WorkspaceController;
    };
}
/** Owner navigation plus the task registration's data and callbacks. */
export type TasksProps = PropsRuntime<'research.workspace.tasks'> & InjectFace<TasksInjected>;
/**
 * @param props - task data, authored actions, and source-reader navigation.
 * @returns current task progress and historical checkpoints without implying automatic execution.
 */
export declare function Tasks({ useWorkspace, createQuestion, createTask, updateTask, loadTasks, selectTask, loadTaskHistory, loadTaskSources, loadTaskIssues, loadCatalog, openSource }: TasksProps): ReactNode;
//# sourceMappingURL=Tasks.d.ts.map