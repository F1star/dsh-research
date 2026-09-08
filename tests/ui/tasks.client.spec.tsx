// @vitest-environment jsdom
/** Task forms preserve complete source selections and inspected revision requirements. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Tasks, type TasksProps } from '../../src/ui/Tasks.tsx'
import { WorkspaceController, type WorkspaceView } from '../../src/ui/controller.ts'

afterEach(cleanup)

function setup(stale = false) {
  type Progress = NonNullable<WorkspaceView['task']>
  const question = { id: 'question' as Progress['task']['questionId'], title: 'Review', question: 'How?', revision: 7, claimCount: 0 }
  const task: Progress['task'] = { id: 'task' as Progress['task']['id'], questionId: question.id, kind: 'topic-review', revision: 4, phase: 'active', reason: '' }
  const selection: WorkspaceView['taskSelection'] = ['first', 'second'].map(id => ({
    paperId: id as WorkspaceView['taskSelection'][number]['paperId'], sourceVersionId: id as WorkspaceView['taskSelection'][number]['sourceVersionId'],
  }))
  // The controller supplies the same empty view used by the mounted plugin; no API operation runs here.
  const empty = new WorkspaceController({} as ConstructorParameters<typeof WorkspaceController>[0])
  const state: WorkspaceView = { ...empty.getSnapshot(), claimPage: { question, claims: [], nextOffset: null },
    tasks: { question, tasks: [task], nextOffset: null }, task: { task, questionRevision: question.revision,
      completedStages: [], nextStage: 'acquisition', stale, requiresResume: false, issues: [], nextOffset: null },
    taskSelection: selection, taskSourceCheckpoint: 1, taskSources: { taskRevision: 4, sources: [], nextOffset: null },
    catalog: { papers: [], total: 2, nextOffset: 1 }, catalogQuery: 'submitted', reviewerId: 'reviewer' as NonNullable<WorkspaceView['reviewerId']> }
  const updateTask = vi.fn(async () => true)
  const loadCatalog = vi.fn(async () => {})
  const props = { useWorkspace: (select: (state: WorkspaceView) => unknown) => select(state),
    createQuestion: vi.fn(), createTask: vi.fn(), updateTask, loadTasks: vi.fn(), selectTask: vi.fn(),
    loadTaskHistory: vi.fn(), loadTaskSources: vi.fn(), loadTaskIssues: vi.fn(), loadCatalog, openSource: vi.fn() } as TasksProps
  return { props, updateTask, loadCatalog, question, task, selection, empty }
}

it('submits the full current selection while inspecting historical sources and pages the committed search', () => {
  const { props, updateTask, loadCatalog, question, task, selection, empty } = setup()
  render(<Tasks {...props} />)
  expect(screen.getByText('已选择 2 个来源；翻页保留选择。')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('筛选任务文献'), { target: { value: 'unsubmitted edit' } })
  fireEvent.click(screen.getByRole('button', { name: '下一页任务文献' }))
  expect(loadCatalog).toHaveBeenCalledWith('submitted', 1)
  fireEvent.change(screen.getByLabelText('阶段总结'), { target: { value: '保留全部原来源' } })
  fireEvent.click(screen.getByRole('button', { name: '确认选择来源完成' }))
  expect(updateTask).toHaveBeenCalledWith({ action: 'checkpoint', taskId: task.id, expectedRevision: task.revision,
    expectedQuestionRevision: question.revision, stage: 'acquisition', summary: '保留全部原来源', sources: selection })
  empty.dispose()
})

it('requires explicit recovery before confirming a stage whose scientific inputs changed', () => {
  const { props, updateTask, task, empty } = setup(true)
  render(<Tasks {...props} />)
  fireEvent.change(screen.getByLabelText('阶段总结'), { target: { value: '先检查来源' } })
  const submit = screen.getByRole('button', { name: '确认选择来源完成' })
  expect(submit.hasAttribute('disabled')).toBe(true)
  fireEvent.click(submit)
  expect(updateTask).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('任务调整说明'), { target: { value: '已核对变化' } })
  fireEvent.click(screen.getByRole('button', { name: '恢复任务' }))
  expect(updateTask).toHaveBeenCalledWith({ action: 'resume', taskId: task.id, expectedRevision: task.revision, reason: '已核对变化' })
  empty.dispose()
})
