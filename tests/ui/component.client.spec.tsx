// @vitest-environment jsdom
/** Reader presentation and dialog-local search state. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Workspace, type WorkspaceProps } from '../../src/ui/Workspace.tsx'
import type { WorkspaceView } from '../../src/ui/controller.ts'

beforeEach(() => {
  // jsdom lacks the native dialog top layer; the browser suite covers that path.
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value(this: HTMLDialogElement) { this.setAttribute('open', '') } },
    close: { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute('open') } },
  })
})
afterEach(() => {
  cleanup()
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal')
  Reflect.deleteProperty(HTMLDialogElement.prototype, 'close')
})

function props(input: Pick<WorkspaceView, 'catalog' | 'reading' | 'busy' | 'error'> & Partial<WorkspaceView>) {
  const state: WorkspaceView = { tasks: null, task: null, taskHistory: null, taskSources: null, taskSelection: [], catalogQuery: '',
    taskSourceCheckpoint: null, taskReceipt: null, observations: null, selectedObservation: null, observationReviews: null,
    observationChoices: null, questions: null, claimPage: null, selectedClaim: null, evidence: null, evidenceChoices: null,
    report: null, reportDownloads: [], reviews: null, reviewers: [], reviewerId: null, notes: null, matrix: null,
    claimFilter: null, ...input }
  const load = vi.fn(async () => {})
  const inputs = {
    loadObservations: vi.fn(), renderSlot: vi.fn(), prepareReport: vi.fn(), loadNotes: vi.fn(), loadMatrix: vi.fn(),
    submitNote: vi.fn(), loadQuestions: vi.fn(), loadClaims: vi.fn(),
    selectClaim: vi.fn(), loadEvidenceChoices: vi.fn(), readEvidence: vi.fn(),
    loadReviews: vi.fn(), chooseReviewer: vi.fn(), registerReviewer: vi.fn(), submitReview: vi.fn(), openEvidence: vi.fn(),
    wide: true, load, openPaper: vi.fn(), turn: vi.fn(), moreBlocks: vi.fn(),
    useWorkspace: (select: (snapshot: WorkspaceView) => unknown) => select(state),
  } as WorkspaceProps
  return { inputs, load }
}

describe('research reader presentation', () => {
  it('opens an empty catalog, searches, and clears the search on reopening', () => {
    const { inputs, load } = props({ catalog: { papers: [], total: 0, nextOffset: null }, reading: null, busy: false, error: null })
    render(<Workspace {...inputs} />)
    const trigger = screen.getByRole('button', { name: '科研工作区' })
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog', { name: '科研工作区' })).toBeTruthy()
    expect(load).toHaveBeenLastCalledWith('', 0)
    expect(screen.getByText('0 篇文献')).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'method' } })
    fireEvent.click(screen.getByRole('button', { name: '搜索' }))
    expect(load).toHaveBeenLastCalledWith('method', 0)
    fireEvent.click(screen.getByRole('button', { name: '返回对话' }))
    fireEvent.click(trigger)
    expect(screen.getByRole('searchbox').getAttribute('value')).toBe('')
    expect(load).toHaveBeenLastCalledWith('', 0)
  })

  it('shows a load failure and prevents duplicate submissions while a request is pending', () => {
    const { inputs } = props({ catalog: null, reading: null, busy: true, error: '来源读取失败' })
    render(<Workspace {...inputs} />)
    fireEvent.click(screen.getByRole('button', { name: '科研工作区' }))
    expect(screen.getByRole('alert').textContent).toBe('来源读取失败')
    expect(screen.getByRole('button', { name: '搜索' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByText('正在读取文献库…')).toBeTruthy()
  })
})
