/** Report decisions remain independent from numeric transcription and source review. */

import { describe, expect, it } from 'vitest'
import {
  ResearchAuthorId, ResearchClaimId, ResearchComparisonProtocolId, ResearchDecimal,
  ResearchEntityId, ResearchEvidenceId, ResearchObservationId,
  type ResearchClaimReviewId, type ResearchObservationReviewId,
  type ResearchObservation, type ResearchObservationReview, type ResearchQuestionRecord,
} from '../../src/research-information/index.ts'
import { ResearchDocumentId } from '../../src/research-document/index.ts'
import { ResearchPaperId, ResearchSourceVersionId } from '../../src/research-library/index.ts'
import { renderReport } from '../../src/research-report/render.ts'
import { reportFixture } from './fixture.ts'

function fixture() {
  const base = reportFixture()
  const source = base.question.evidence[0]!
  const original = base.question.claims[0]!
  const kinds = ['method', 'dataset', 'metric'] as const
  const firstPaper = base.papers[0]!
  const papers = [firstPaper, { ...firstPaper, id: ResearchPaperId('88888888-8888-4888-8888-888888888888'), externalIds: [],
    metadata: { title: { value: 'Independent comparison paper', origin: 'declared' as const } },
    sourceVersions: [{ ...firstPaper.sourceVersions[0]!, id: ResearchSourceVersionId('99999999-9999-4999-8999-999999999999'),
      documentId: ResearchDocumentId(`sha256:${'c'.repeat(64)}`) }],
  }]
  const evidence = papers.map((paper, index) => ({ ...source, id: ResearchEvidenceId(`evidence-${index}`), paperId: paper.id,
    sourceVersionId: paper.sourceVersions[0]!.id, locator: { ...source.locator, documentId: paper.sourceVersions[0]!.documentId },
  }))
  const claims = evidence.flatMap(item => [...kinds, 'result' as const].map(facet => ({ ...original,
    id: ResearchClaimId(`${item.id}-${facet}`), facet, evidenceLinks: [{ evidenceId: item.id, relation: 'supports' as const }],
  })))
  const entities = kinds.map(kind => ({ id: ResearchEntityId(kind), kind, canonicalName: kind,
    sourceClaimIds: claims.filter(claim => claim.facet === kind).map(claim => claim.id), supersedes: [],
    createdBy: original.createdBy, createdAt: original.createdAt,
  }))
  const observations: ResearchObservation[] = evidence.map(item => ({
    id: ResearchObservationId(`observation-${item.id}`), resultClaimId: ResearchClaimId(`${item.id}-result`),
    method: { entityId: entities[0]!.id, sourceClaimId: ResearchClaimId(`${item.id}-method`), role: 'proposed' },
    dataset: { entityId: entities[1]!.id, sourceClaimId: ResearchClaimId(`${item.id}-dataset`),
      split: { status: 'reported', value: 'test', sourceClaimId: ResearchClaimId(`${item.id}-dataset`) } },
    metric: { entityId: entities[2]!.id, sourceClaimId: ResearchClaimId(`${item.id}-metric`) },
    value: ResearchDecimal('85.5'), unit: { status: 'reported', symbol: '%' }, valueStatistic: 'mean over five runs',
    evaluationProtocol: { status: 'reported', value: 'held-out evaluation', sourceClaimId: ResearchClaimId(`${item.id}-method`) },
    uncertainty: { status: 'not-recorded' }, conditions: { status: 'not-applicable' },
    createdBy: original.createdBy, createdAt: original.createdAt,
  }))
  const question: ResearchQuestionRecord = { ...base.question, revision: 20, evidence, claims, entities, observations, syntheses: [],
    comparisonProtocols: [{ id: ResearchComparisonProtocolId('comparison'), observationIds: observations.map(value => value.id),
      direction: 'higher-is-better', compatibilityRationale: 'Same reported evaluation context.',
      createdBy: original.createdBy, createdAt: original.createdAt }],
  }
  const review: ResearchObservationReview = { id: 'review' as ResearchObservationReviewId, observationId: observations[0]!.id,
    decision: 'accepted', evidenceSupport: 'partial', rationale: 'Only the recorded evaluation setting.',
    qualifications: 'External validity remains unassessed.', counterEvidenceIds: [evidence[1]!.id], questionRevision: 21,
    createdBy: { kind: 'researcher', id: ResearchAuthorId('reviewer') }, createdAt: original.createdAt,
  }
  const render = (value: ResearchQuestionRecord) => {
    const report = renderReport(value, papers)
    const audit: unknown = JSON.parse(report.files.find(file => file.name === 'provenance.json')!.text)
    expect(audit).toEqual({ format: 'research-report-audit', version: 1, question: value, papers })
    return report.files.find(file => file.name === 'report.md')!.text
  }
  return { question, review, render }
}

describe('result and comparison report', () => {
  it('retains a synthesis comparison basis and excludes its finding after a result rejection', () => {
    const { question, review, render } = fixture()
    const synthesis = reportFixture().question.syntheses[0]!
    const linked: ResearchQuestionRecord = { ...question, syntheses: [{ ...synthesis, findings: [{ ...synthesis.findings[0]!,
      kind: 'inference', text: 'Linked comparison inference.', claimIds: question.observations.map(value => value.resultClaimId),
      comparisonProtocolIds: [question.comparisonProtocols[0]!.id],
    }] }] }
    expect(render(linked)).toContain('比较依据 / Comparison basis：comparison')
    const rejected = render({ ...linked, revision: 21, observationReviews: [{ ...review, decision: 'rejected' }] })
    expect(rejected).toContain('不可采用的比较协议（comparison）')
    expect(rejected).not.toContain('Linked comparison inference.')
  })

  it('keeps unreviewed results, full evaluation context, and source citations visible without approving comparison members', () => {
    const { question, render } = fixture()
    const markdown = render(question)
    for (const text of ['待人工审阅：结果', '数值：85.5；单位：%', 'mean over five runs', '提出的方法', 'test',
      'held-out evaluation', '不确定性：尚未记录', '实验条件：不适用', '其中 2 条结果待人工审阅',
      '[@p11111111111141118111111111111111]', '[@p88888888888848888888888888888888]']) expect(markdown).toContain(text)
  })

  it('retains review qualifications and counterevidence while a later rejection blocks an existing comparison', () => {
    const { question, review, render } = fixture()
    const accepted = { ...question, revision: 21, observationReviews: [review] }
    const first = render(accepted)
    for (const text of ['人工接受的结果记录', '部分支持', review.rationale, review.qualifications!,
      '结果反证：evidence-1', '其中 1 条结果待人工审阅']) expect(first).toContain(text)
    const rejected = render({ ...accepted, revision: 22, observationReviews: [review, { ...review,
      id: 'rejected' as ResearchObservationReviewId, decision: 'rejected', questionRevision: 22 }] })
    expect(rejected).toContain('不作为当前结论采用：结果 observation-evidence-0')
    expect(rejected).toContain('当前不可采用，包含历史、过期或审核受阻的结果')
    expect(rejected).not.toContain('人工接受的结果记录')
  })

  it('approves the replacement only and preserves a superseded comparison solely in the audit attachment', () => {
    const { question, review, render } = fixture()
    const original = question.observations[0]!
    const replacement = { ...original, id: ResearchObservationId('replacement'), value: ResearchDecimal('85.6'),
      supersedes: original.id, createdBy: review.createdBy }
    const revised: ResearchQuestionRecord = { ...question, revision: 21, observations: [...question.observations, replacement],
      observationReviews: [{ ...review, decision: 'revised', replacementObservationId: replacement.id }] }
    const first = render(revised)
    expect(first).not.toContain(`：结果 ${original.id}；`)
    expect(first).toContain('人工接受的结果记录：结果 replacement')
    expect(first).toContain('修改后接受')
    expect(first).toContain('当前不可采用')
    const protocol = question.comparisonProtocols[0]!
    const second = render({ ...revised, comparisonProtocols: [protocol, { ...protocol,
      id: ResearchComparisonProtocolId('replacement-protocol'), supersedes: protocol.id,
      observationIds: [replacement.id, question.observations[1]!.id] }] })
    expect(second).not.toContain('比较协议 comparison：')
    expect(second).toContain('比较协议 replacement-protocol：记录的条件下可比较')
  })

  it('does not let historical result approval override a rejected source or superseded entity', () => {
    const { question, review, render } = fixture()
    const accepted = { ...question, revision: 22, observationReviews: [review] }
    const rejected = render({ ...accepted, claimReviews: [{ id: 'source-review' as ResearchClaimReviewId,
      claimId: question.observations[0]!.method.sourceClaimId, decision: 'rejected', evidenceSupport: 'unsupported',
      rationale: 'The method attribution is unsupported.', counterEvidenceIds: [], questionRevision: 22,
      createdBy: review.createdBy, createdAt: review.createdAt }] })
    expect(rejected).toContain('该结果引用了已拒绝的来源表述：evidence-0-method')
    expect(rejected).toContain('历史人工接受不解除此警告')
    expect(rejected).toContain('当前不可采用')
    const entity = question.entities[0]!
    const stale = render({ ...accepted, entities: [...question.entities, { ...entity,
      id: ResearchEntityId('replacement-method'), supersedes: [entity.id] }] })
    expect(stale).toContain('该结果的来源或规范化实体已被替换，需要重新核对')
    expect(stale).toContain('当前不可采用')
    expect(stale).not.toContain('人工接受的结果记录')
  })

  it('preserves missing versus inapplicable context, method roles, and condition comparison requirements', () => {
    const { question, review, render } = fixture()
    const first = question.observations[0]!
    const second = question.observations[1]!
    const observations: ResearchObservation[] = [
      { ...first, method: { ...first.method, role: 'baseline' }, unit: { status: 'not-recorded' },
        dataset: { ...first.dataset, split: { status: 'not-recorded' } }, evaluationProtocol: { status: 'not-recorded' },
        conditions: { status: 'reported', values: [
          { name: 'Precision', value: 'float32', sourceClaimId: first.method.sourceClaimId, comparisonRole: 'must-match' },
          { name: 'Implementation', value: 'reference', sourceClaimId: first.method.sourceClaimId, comparisonRole: 'descriptive' },
        ] } },
      { ...second, method: { ...second.method, role: 'other', otherRole: 'ablation' }, unit: { status: 'not-applicable' },
        dataset: { ...second.dataset, split: { status: 'not-applicable' } }, evaluationProtocol: { status: 'not-applicable' },
        conditions: { status: 'not-recorded' } },
    ]
    const { qualifications: _qualifications, ...assessment } = review
    const markdown = render({ ...question, revision: 21, observations, comparisonProtocols: [],
      observationReviews: [{ ...assessment, counterEvidenceIds: [] }] })
    for (const text of ['单位：尚未记录', '单位：不适用', '方法角色：基线方法', '方法角色：ablation',
      '数据划分：尚未记录', '数据划分：不适用', '评测协议：尚未记录', '评测协议：不适用',
      'Precision：float32（比较时必须一致；来源表述 evidence-0-method）',
      'Implementation：reference（描述性条件；来源表述 evidence-0-method）', '实验条件：尚未记录']) expect(markdown).toContain(text)
    expect(markdown).not.toContain('结果限定条件：')
    expect(markdown).not.toContain('结果反证：')
  })

  it.each<{ uncertainty: ResearchObservation['uncertainty']; expected: string }>([
    { uncertainty: { status: 'not-recorded' }, expected: '尚未记录' },
    { uncertainty: { status: 'not-applicable' }, expected: '不适用' },
    { uncertainty: { status: 'reported', value: { kind: 'standard-deviation', magnitude: ResearchDecimal('0.2') } }, expected: '标准差 0.2' },
    { uncertainty: { status: 'reported', value: { kind: 'standard-error', magnitude: ResearchDecimal('0.2') } }, expected: '标准误 0.2' },
    { uncertainty: { status: 'reported', value: { kind: 'unspecified-plus-minus', magnitude: ResearchDecimal('0.2') } },
      expected: '未说明类型的正负误差 0.2' },
    { uncertainty: { status: 'reported', value: { kind: 'confidence-interval', lower: ResearchDecimal('84'), upper: ResearchDecimal('87'),
      confidenceLevelPercent: ResearchDecimal('95') } }, expected: '95% 置信区间 84 至 87' },
    { uncertainty: { status: 'reported', value: { kind: 'range', lower: ResearchDecimal('84'), upper: ResearchDecimal('87') } },
      expected: '范围 84 至 87' },
  ])('distinguishes $expected from other uncertainty meanings', ({ uncertainty, expected }) => {
    const { question, render } = fixture()
    const observations = question.observations.map(value => ({ ...value, uncertainty }))
    expect(render({ ...question, observations })).toContain(`不确定性：${expected}。`)
  })
})
