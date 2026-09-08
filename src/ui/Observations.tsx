/** Researcher review of paper-local results with complete experimental context and source choices. */

import { useEffect, useState, type ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ResearchWorkspaceObservationReviewRequest } from '../research-workspace/types.ts'
import type { WorkspaceController } from './controller.ts'
import css from './Workspace.module.css'

type Request = ResearchWorkspaceObservationReviewRequest
type Replacement = Extract<Request, { decision: 'revised' }>['replacement']
type Context = Replacement['evaluationProtocol']

/** Plain review callbacks and framework-bound workspace data. */
export interface ObservationsInjected {
  loadObservations: WorkspaceController['loadObservations']
  selectObservation: WorkspaceController['selectObservation']
  loadObservationChoices: WorkspaceController['loadObservationChoices']
  loadObservationReviews: WorkspaceController['loadObservationReviews']
  submitObservationReview: WorkspaceController['submitObservationReview']
  readEvidence: WorkspaceController['readEvidence']
  loadEvidenceChoices: WorkspaceController['loadEvidenceChoices']
  hooks: { workspace: WorkspaceController }
}

/** Root-scoped result review panel and its registration-owned callbacks. */
export type ObservationsProps = PropsRuntime<'research.workspace.observations'> & InjectFace<ObservationsInjected>

/**
 * @param props - framework-bound question state and explicit researcher actions.
 * @returns complete result context, revision form, evidence links, and immutable decisions.
 */
export function Observations({ useWorkspace, loadObservations, selectObservation, loadObservationChoices,
  loadObservationReviews, submitObservationReview, readEvidence, loadEvidenceChoices }: ObservationsProps): ReactNode {
  const state = useWorkspace(value => value)
  const selected = state.selectedObservation
  const [replacement, setReplacement] = useState<Replacement | null>(null)
  const [decision, setDecision] = useState<Request['decision']>('accepted')
  const [support, setSupport] = useState<Request['evidenceSupport']>('uncertain')
  const [rationale, setRationale] = useState('')
  const [qualifications, setQualifications] = useState('')
  const [counterEvidenceIds, setCounterEvidenceIds] = useState<Request['counterEvidenceIds']>([])
  useEffect(() => {
    setDecision('accepted'); setSupport('uncertain'); setRationale(''); setQualifications(''); setCounterEvidenceIds([])
    if (selected === null) { setReplacement(null); return }
    const { resultClaimId, method, dataset, metric, value, unit, valueStatistic, evaluationProtocol, uncertainty, conditions }
      = selected.observation
    setReplacement({ resultClaimId, method, dataset, metric, value, unit, valueStatistic, evaluationProtocol, uncertainty, conditions })
  }, [selected])
  const claims = state.observationChoices?.choices.flatMap(item => item.kind === 'claim' ? [item.claim] : []) ?? []
  const entities = state.observationChoices?.choices.flatMap(item => item.kind === 'entity' ? [item.entity] : []) ?? []
  const claimSelect = (label: string, id: Replacement['resultClaimId'], change: (id: Replacement['resultClaimId']) => void, facet?: string) => {
    const choices = claims.filter(value => facet === undefined || value.facet === facet)
    return <label>{label}<select value={id} onChange={(event) => { change(event.target.value as typeof id) }}>
      {choices.some(value => value.id === id) ? null : <option value={id}>当前引用（加载来源后可更改）</option>}
      {choices.map(value => <option key={value.id} value={value.id}>{value.text}</option>)}
    </select></label>
  }
  const entitySelect = (kind: 'method' | 'dataset' | 'metric', label: string, reference: Replacement['metric'], change: (ref: Replacement['metric']) => void) => {
    const choices = entities.filter(value => value.kind === kind).flatMap(entity => claims.filter(claim =>
      entity.sourceClaimIds.includes(claim.id))
      .map(claim => ({ entity, claim })))
    const index = choices.findIndex(value => value.entity.id === reference.entityId && value.claim.id === reference.sourceClaimId)
    return <label>{label}<select value={index} onChange={(event) => {
      const choice = choices[Number(event.target.value)]
      if (choice !== undefined) change({ entityId: choice.entity.id, sourceClaimId: choice.claim.id })
    }}>
      {index === -1 ? <option value={-1}>当前引用（加载来源后可更改）</option> : null}
      {choices.map((choice, position) =>
        <option key={position} value={position}>{choice.entity.canonicalName} — {choice.claim.text}</option>)}
    </select></label>
  }
  const contextEditor = (label: string, context: Context, change: (value: Context) => void) => <fieldset><legend>{label}</legend>
    <label>{label}记录状态<select value={context.status} onChange={(event) => {
      const status = event.target.value as Context['status']
      if (replacement !== null) change(status === 'reported' ? { status, value: '', sourceClaimId: replacement.resultClaimId } : { status })
    }}>{Object.entries(statusLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
    {context.status === 'reported' ? <>
      <label>{label}内容<input required value={context.value}
        onChange={(event) => { change({ ...context, value: event.target.value }) }} /></label>
      {claimSelect(`${label}来源表述`, context.sourceClaimId, (sourceClaimId) => { change({ ...context, sourceClaimId }) })}
    </> : null}
  </fieldset>
  return <section aria-label="实验结果审阅">
    <h3>{state.observations?.question.title ?? '实验结果'}</h3>
    <p>结果是署名规范化记录。接受表示审阅者采纳该记录，不代表已证明科学结论或跨论文可比性。</p>
    <button type="button" disabled={state.busy} onClick={() => { void loadObservations(0) }}>刷新实验结果</button>
    {state.observations?.observations.length === 0 ? <p>尚无实验结果。可在对话中依据原文记录数值和实验条件。</p> : null}
    <div className={css.observationList}>{state.observations?.observations.map(item =>
      <article className={css.paper} key={item.observation.id}>
        <button type="button" disabled={state.busy} aria-pressed={selected?.observation.id === item.observation.id}
          onClick={() => { void selectObservation(item) }}>{item.paperTitle} · {item.metricName} = {item.observation.value}
          {item.observation.unit.status === 'reported' ? ` ${item.observation.unit.symbol}` : ''}</button>
        <p>{item.methodName} · {item.datasetName} · {item.state.active ? '当前版本' : '历史版本'} ·{' '}
          {item.state.review === null ? '待人工审阅' : item.state.review.decision === 'revised'
          && item.state.review.observationId === item.observation.id ? '已被修订，批准的是替代结果' : decisionLabels[item.state.review.decision]}
          {item.state.stale ? ' · 来源已过期' : ''}{item.state.rejectedClaimIds.length ? ' · 引用了已拒绝的来源表述' : ''}</p>
      </article>)}</div>
    {state.observations?.nextOffset == null ? null : <button type="button" disabled={state.busy}
      onClick={() => { void loadObservations(state.observations?.nextOffset ?? 0) }}>下一页实验结果</button>}
    {selected === null || replacement === null ? <p>选择一条结果，对照原文核对数值、单位与实验条件。</p> : <>
      <section aria-label="结果记录">
        <h3>{selected.paperTitle}</h3>
        <dl className={css.resultDetails}>
          <dt>方法</dt><dd>{selected.methodName} · {methodLabels[selected.observation.method.role]}
            {selected.observation.method.otherRole}</dd>
          <dt>数据集</dt><dd>{selected.datasetName}</dd><dt>指标</dt><dd>{selected.metricName}</dd>
          <dt>数值与单位</dt><dd>{selected.observation.value} · {selected.observation.unit.status === 'reported'
            ? selected.observation.unit.symbol : statusLabels[selected.observation.unit.status]}</dd>
          <dt>统计口径</dt><dd>{selected.observation.valueStatistic}</dd>
          <dt>数据划分</dt><dd>{contextText(selected.observation.dataset.split)}</dd>
          <dt>评测协议</dt><dd>{contextText(selected.observation.evaluationProtocol)}</dd>
          <dt>不确定性</dt><dd>{uncertaintyText(selected.observation.uncertainty)}</dd>
          <dt>实验条件</dt><dd>{selected.observation.conditions.status === 'reported'
            ? selected.observation.conditions.values.map((value, index) => <p key={index}>{value.name}：{value.value} · {value.comparisonRole === 'must-match' ? '比较时必须一致' : '描述性条件'}</p>)
            : statusLabels[selected.observation.conditions.status]}</dd>
          <dt>记录作者</dt><dd>{selected.observation.createdBy.kind === 'agent' ? '智能体' : '研究者'} · {selected.observation.createdBy.id}</dd>
        </dl>
        {selected.evidenceIds.map((id, index) => <button type="button" key={id} disabled={state.busy}
          onClick={() => { void readEvidence(id) }}>查看结果原文 {index + 1}</button>)}
        {selected.state.stale ? <p>部分来源已被替换，接受前需修订来源引用。</p> : null}
        {selected.state.rejectedClaimIds.length ? <p>结果引用了已拒绝的来源表述，不能直接接受或用于新的比较协议。</p> : null}
      </section>
      <form className={css.reviewForm} aria-label="保存实验结果审阅" onSubmit={(event) => {
        event.preventDefault()
        const question = state.observations?.question
        if (question === undefined) return
        const base = { questionId: question.id, expectedRevision: question.revision, observationId: selected.observation.id,
          evidenceSupport: support, rationale, counterEvidenceIds, ...(qualifications.trim() ? { qualifications } : {}) }
        void submitObservationReview(decision === 'revised' ? { ...base, decision, replacement } : { ...base, decision })
      }}>
        <fieldset disabled={state.busy || !selected.state.active} className={css.reviewForm}>
          <legend>结果人工决定</legend>
          <label>结果审阅决定<select value={decision} onChange={(event) => { setDecision(event.target.value as typeof decision) }}>
            {Object.entries(decisionLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select></label>
          <label>结果证据支持程度<select value={support} onChange={(event) => { setSupport(event.target.value as typeof support) }}>
            {Object.entries(supportLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select></label>
          <label>结果审阅理由<textarea required value={rationale} onChange={(event) => { setRationale(event.target.value) }} /></label>
          <label>结果限定条件与遗漏<textarea value={qualifications} onChange={(event) => { setQualifications(event.target.value) }} /></label>
          {decision !== 'revised' ? null : <>
            <h3>修订结果并保留原始记录</h3>
            <p>来源选择仅包含这篇论文的当前来源表述及相关规范化实体。缺少正确来源时，请先在对话中补充，再刷新结果。</p>
            {state.observationChoices?.nextOffset == null ? null : <button type="button" onClick={() => {
              void loadObservationChoices(state.observationChoices?.nextOffset ?? 0)
            }}>加载更多修订来源</button>}
            {claimSelect('结果来源表述', replacement.resultClaimId, (resultClaimId) => { setReplacement({ ...replacement, resultClaimId }) }, 'result')}
            {entitySelect('method', '方法与来源', replacement.method, (ref) => { setReplacement({ ...replacement, method: { ...replacement.method, ...ref } }) })}
            <label>方法角色<select value={replacement.method.role} onChange={(event) => {
              const role = event.target.value as Replacement['method']['role']
              setReplacement({ ...replacement, method: { entityId: replacement.method.entityId,
                sourceClaimId: replacement.method.sourceClaimId,
                role, ...(role === 'other' ? { otherRole: '' } : {}) } })
            }}>{Object.entries(methodLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
            {replacement.method.role === 'other' ? <label>其他方法角色<input required value={replacement.method.otherRole}
              onChange={(event) => { setReplacement({ ...replacement, method:
                { ...replacement.method, otherRole: event.target.value } }) }} /></label> : null}
            {entitySelect('dataset', '数据集与来源', replacement.dataset, (ref) => { setReplacement({ ...replacement, dataset: { ...replacement.dataset, ...ref } }) })}
            {entitySelect('metric', '指标与来源', replacement.metric, (metric) => { setReplacement({ ...replacement, metric }) })}
            <label>修订数值<input required inputMode="decimal" value={replacement.value}
              onChange={(event) => { setReplacement({ ...replacement, value: event.target.value as Replacement['value'] }) }} /></label>
            <label>单位记录状态<select value={replacement.unit.status} onChange={(event) => {
              const status = event.target.value as Replacement['unit']['status']
              setReplacement({ ...replacement, unit: status === 'reported' ? { status, symbol: '' } : { status } })
            }}>{Object.entries(statusLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
            {replacement.unit.status === 'reported' ? <label>单位符号<input required value={replacement.unit.symbol}
              onChange={(event) => { setReplacement({ ...replacement, unit: { status: 'reported', symbol: event.target.value } }) }} /></label> : null}
            <label>统计口径<input required value={replacement.valueStatistic}
              onChange={(event) => { setReplacement({ ...replacement, valueStatistic: event.target.value }) }} /></label>
            {contextEditor('数据划分', replacement.dataset.split, (split) => { setReplacement({ ...replacement, dataset: { ...replacement.dataset, split } }) })}
            {contextEditor('评测协议', replacement.evaluationProtocol, (evaluationProtocol) => { setReplacement({ ...replacement, evaluationProtocol }) })}
            <fieldset><legend>不确定性</legend>
              <label>不确定性记录状态<select value={replacement.uncertainty.status} onChange={(event) => {
                const status = event.target.value as Replacement['uncertainty']['status']
                setReplacement({ ...replacement, uncertainty: status === 'reported'
                  ? { status, value: { kind: 'standard-deviation', magnitude: '' as Replacement['value'] } } : { status } })
              }}>{Object.entries(statusLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
              {replacement.uncertainty.status === 'reported' ? <>
                <label>不确定性类型<select value={replacement.uncertainty.value.kind} onChange={(event) => {
                  const kind = event.target.value as Extract<Replacement['uncertainty'], { status: 'reported' }>['value']['kind']
                  const blank = '' as Replacement['value']
                  setReplacement({ ...replacement, uncertainty: { status: 'reported', value: kind === 'confidence-interval'
                    ? { kind, lower: blank, upper: blank, confidenceLevelPercent: blank } : kind === 'range'
                      ? { kind, lower: blank, upper: blank } : { kind, magnitude: blank } } })
                }}>{Object.entries(uncertaintyLabels).map(([value, text]) =>
                    <option key={value} value={value}>{text}</option>)}</select></label>
                {('magnitude' in replacement.uncertainty.value ? ['magnitude'] : replacement.uncertainty.value.kind === 'confidence-interval'
                  ? ['lower', 'upper', 'confidenceLevelPercent'] : ['lower', 'upper']).map((field) => {
                  const uncertainty = replacement.uncertainty
                  if (uncertainty.status !== 'reported') return null
                  const value = uncertainty.value
                  const text = field === 'magnitude' && 'magnitude' in value ? value.magnitude
                    : field === 'lower' && 'lower' in value ? value.lower : field === 'upper' && 'upper' in value ? value.upper
                      : 'confidenceLevelPercent' in value ? value.confidenceLevelPercent : ''
                  return <label key={field}>{decimalLabels[field]}<input required inputMode="decimal" value={text} onChange={(event) => {
                    setReplacement({ ...replacement, uncertainty: { status: 'reported', value: { ...value, [field]: event.target.value } } })
                  }} /></label>
                })}
              </> : null}
            </fieldset>
            <fieldset><legend>实验条件</legend>
              <label>实验条件记录状态<select value={replacement.conditions.status} onChange={(event) => {
                const status = event.target.value as Replacement['conditions']['status']
                setReplacement({ ...replacement, conditions: status === 'reported' ? { status, values: [] } : { status } })
              }}>{Object.entries(statusLabels).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>
              {replacement.conditions.status === 'reported' ? <>
                {replacement.conditions.values.map((condition, index) => {
                  const conditions = replacement.conditions
                  if (conditions.status !== 'reported') return null
                  const change = (value: typeof condition) => { setReplacement({ ...replacement, conditions: {
                    status: 'reported', values: conditions.values.map((current, position) => position === index ? value : current),
                  } }) }
                  return <div className={css.reviewForm} key={index}>
                    <label>条件 {index + 1} 名称<input required value={condition.name}
                      onChange={(event) => { change({ ...condition, name: event.target.value }) }} /></label>
                    <label>条件 {index + 1} 内容<input required value={condition.value}
                      onChange={(event) => { change({ ...condition, value: event.target.value }) }} /></label>
                    {claimSelect(`条件 ${index + 1} 来源表述`, condition.sourceClaimId, (sourceClaimId) => { change({ ...condition, sourceClaimId }) })}
                    <label>条件 {index + 1} 比较要求<select value={condition.comparisonRole} onChange={(event) => {
                      change({ ...condition, comparisonRole: event.target.value as typeof condition.comparisonRole })
                    }}><option value="must-match">比较时必须一致</option><option value="descriptive">描述性条件</option></select></label>
                    <button type="button" onClick={() => { setReplacement({ ...replacement, conditions: {
                      status: 'reported', values: conditions.values.filter((_, position) => position !== index),
                    } }) }}>移除条件 {index + 1}</button>
                  </div>
                })}
                <button type="button" onClick={() => {
                  if (replacement.conditions.status !== 'reported') return
                  setReplacement({ ...replacement, conditions: { status: 'reported', values: [...replacement.conditions.values,
                    { name: '', value: '', sourceClaimId: replacement.resultClaimId, comparisonRole: 'must-match' }] } })
                }}>添加实验条件</button>
              </> : null}
            </fieldset>
          </>}
          <details><summary>结果反证（已选 {counterEvidenceIds.length} 条）</summary>
            {state.evidenceChoices?.evidence.map(choice => <article key={choice.id} className={css.paper}>
              <button type="button" onClick={() => { void readEvidence(choice.id) }}>查看结果反证原文 · 第 {choice.pageIndex + 1} 页</button>
              <p>{choice.excerpt}{choice.excerptTruncated ? '（预览已截断）' : ''}</p>
              <label><input type="checkbox" checked={counterEvidenceIds.includes(choice.id)} onChange={(event) => {
                setCounterEvidenceIds(event.target.checked ? [...counterEvidenceIds, choice.id] : counterEvidenceIds.filter(id =>
                  id !== choice.id))
              }} />选为结果反证</label>
            </article>)}
            {state.evidenceChoices?.nextOffset == null ? null : <button type="button" onClick={() => {
              void loadEvidenceChoices(state.evidenceChoices?.nextOffset ?? 0)
            }}>下一页结果反证</button>}
            <button type="button" onClick={() => { void loadEvidenceChoices(0) }}>回到首批结果反证</button>
          </details>
          <button type="submit" disabled={state.reviewerId === null || !rationale.trim()
            || (decision === 'accepted' && (selected.state.stale || selected.state.rejectedClaimIds.length > 0))}>保存结果审阅决定</button>
        </fieldset>
      </form>
      <section aria-label="结果审阅历史"><h3>结果审阅历史</h3>
        {state.observationReviews?.reviews.length === 0 ? <p>尚无结果人工决定。</p> : null}
        {state.observationReviews?.reviews.map(review => <article className={css.paper} key={review.id}>
          <strong>{decisionLabels[review.decision]} · {supportLabels[review.evidenceSupport]}</strong>
          <p>{state.reviewers.find(value => value.id === review.createdBy.id)?.displayName ?? review.createdBy.id} · {review.createdAt}</p>
          <p className={css.exactText}>{review.rationale}</p><p className={css.exactText}>{review.qualifications}</p>
          {review.counterEvidenceIds.map((id, index) => <button type="button" disabled={state.busy} key={id}
            onClick={() => { void readEvidence(id) }}>查看历史结果反证 {index + 1}</button>)}
        </article>)}
        {state.observationReviews?.nextOffset == null ? null : <button type="button" disabled={state.busy}
          onClick={() => { void loadObservationReviews(state.observationReviews?.nextOffset ?? 0) }}>更多结果审阅历史</button>}
      </section>
    </>}
  </section>
}

const statusLabels = { reported: '已记录', 'not-recorded': '尚未记录', 'not-applicable': '不适用' }
const decisionLabels = { accepted: '接受', revised: '修改后接受', rejected: '拒绝' }
const supportLabels = { uncertain: '尚不能确定', supports: '支持', partial: '部分支持', unsupported: '不支持' }
const methodLabels = { proposed: '提出的方法', baseline: '基线方法', other: '其他角色' }
const uncertaintyLabels = { 'standard-deviation': '标准差', 'standard-error': '标准误', 'unspecified-plus-minus': '未说明类型的正负误差', 'confidence-interval': '置信区间', range: '范围' }
const decimalLabels: Record<string, string> = { magnitude: '误差幅度', lower: '下界', upper: '上界', confidenceLevelPercent: '置信水平（%）' }

function contextText(context: Context): string {
  return context.status === 'reported' ? context.value : statusLabels[context.status]
}

function uncertaintyText(uncertainty: Replacement['uncertainty']): string {
  if (uncertainty.status !== 'reported') return statusLabels[uncertainty.status]
  const value = uncertainty.value
  if ('magnitude' in value) return `${uncertaintyLabels[value.kind]}：${value.magnitude}`
  return `${uncertaintyLabels[value.kind]}：${value.lower} 至 ${value.upper}${value.kind === 'confidence-interval' ? `（${value.confidenceLevelPercent}%）` : ''}`
}
