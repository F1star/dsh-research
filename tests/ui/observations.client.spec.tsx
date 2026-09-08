// @vitest-environment jsdom
/** Result forms preserve complete context and keep researcher decisions explicit. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Observations, type ObservationsProps } from '../../src/ui/Observations.tsx'
import { WorkspaceController, type WorkspaceView } from '../../src/ui/controller.ts'
import type { ResearchWorkspaceObservation } from '../../src/research-workspace/types.ts'

afterEach(cleanup)

it('revises decimal values and uncertainty without silently replacing existing source references', () => {
  type Observation = ResearchWorkspaceObservation['observation']
  const reference = { entityId: 'entity' as Observation['metric']['entityId'], sourceClaimId: 'claim' as Observation['resultClaimId'] }
  const observation: Observation = { id: 'observation' as Observation['id'], resultClaimId: reference.sourceClaimId,
    method: { ...reference, role: 'proposed' }, dataset: { ...reference, split: { status: 'not-recorded' } }, metric: reference,
    value: '85' as Observation['value'], unit: { status: 'reported', symbol: '%' }, valueStatistic: 'point estimate',
    evaluationProtocol: { status: 'not-recorded' }, uncertainty: { status: 'not-recorded' }, conditions: { status: 'not-recorded' },
    createdBy: { kind: 'agent', id: 'agent' as Observation['createdBy']['id'] }, createdAt: '2026-09-08T00:00:00.000Z' }
  const item: ResearchWorkspaceObservation = { observation, state: { active: true, stale: false, rejectedClaimIds: [], review: null },
    paperId: 'paper' as ResearchWorkspaceObservation['paperId'], paperTitle: 'Source paper', methodName: 'Method', datasetName: 'Dataset', metricName: 'Accuracy', evidenceIds: [] }
  // No request is made while obtaining the controller's empty view.
  const empty = new WorkspaceController({} as ConstructorParameters<typeof WorkspaceController>[0])
  const question = { id: 'question' as NonNullable<WorkspaceView['observations']>['question']['id'], revision: 4, title: 'Results', question: 'How?', claimCount: 1 }
  const state: WorkspaceView = { ...empty.getSnapshot(), observations: { question, observations: [item], nextOffset: null },
    selectedObservation: item, reviewerId: 'reviewer' as Observation['createdBy']['id'], observationReviews: { reviews: [], nextOffset: null } }
  const submitObservationReview = vi.fn(async () => true)
  const props = { useWorkspace: (select: (state: WorkspaceView) => unknown) => select(state),
    loadObservations: vi.fn(), selectObservation: vi.fn(), loadObservationChoices: vi.fn(), loadObservationReviews: vi.fn(),
    readEvidence: vi.fn(), loadEvidenceChoices: vi.fn(), submitObservationReview } as ObservationsProps
  render(<Observations {...props} />)
  expect(screen.getByRole('button', { name: '保存结果审阅决定' }).hasAttribute('disabled')).toBe(true)
  fireEvent.change(screen.getByLabelText('结果审阅决定'), { target: { value: 'revised' } })
  fireEvent.change(screen.getByLabelText('修订数值'), { target: { value: '85.5' } })
  fireEvent.change(screen.getByLabelText('不确定性记录状态'), { target: { value: 'reported' } })
  fireEvent.change(screen.getByLabelText('不确定性类型'), { target: { value: 'confidence-interval' } })
  for (const [label, value] of [['下界', '84'], ['上界', '87'], ['置信水平（%）', '95'], ['结果审阅理由', '核对原表']]) {
    fireEvent.change(screen.getByLabelText(label!), { target: { value } })
  }
  fireEvent.click(screen.getByRole('button', { name: '保存结果审阅决定' }))
  expect(submitObservationReview).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 4, observationId: observation.id,
    decision: 'revised', rationale: '核对原表', replacement: { resultClaimId: observation.resultClaimId,
      method: observation.method, dataset: observation.dataset, metric: observation.metric, value: '85.5',
      unit: observation.unit, valueStatistic: observation.valueStatistic, evaluationProtocol: observation.evaluationProtocol,
      conditions: observation.conditions, uncertainty: { status: 'reported', value: { kind: 'confidence-interval', lower: '84', upper: '87', confidenceLevelPercent: '95' } } } }))
  expect(observation.value).toBe('85')
  empty.dispose()
})
