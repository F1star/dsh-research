/** Report paragraphs preserve result review and comparison eligibility independently of source wording. */
import assert from 'node:assert/strict';
import { researchObservationState } from "../research-information/index.js";
/**
 * Project current results and protocols, retaining explicit rejection and stale-source warnings.
 * @param question - complete validated question history at the report revision.
 * @returns source-cited prose without ranking, conversion, aggregation, or significance claims.
 */
export function observationReport(question) {
    const paragraphs = [];
    const states = new Map(question.observations.map(value => [value.id, researchObservationState(question, value)]));
    const claims = new Map(question.claims.map(value => [value.id, value]));
    const evidence = new Map(question.evidence.map(value => [value.id, value]));
    const entities = new Map(question.entities.map(value => [value.id, value]));
    const add = (text, paperIds = []) => { paragraphs.push({ text, paperIds }); };
    for (const observation of question.observations) {
        const state = states.get(observation.id);
        assert(state !== undefined);
        if (!state.active)
            continue;
        const result = claims.get(observation.resultClaimId);
        const link = result?.evidenceLinks[0];
        assert(link !== undefined);
        const source = evidence.get(link.evidenceId);
        const method = entities.get(observation.method.entityId);
        const dataset = entities.get(observation.dataset.entityId);
        const metric = entities.get(observation.metric.entityId);
        assert(source !== undefined && method !== undefined && dataset !== undefined && metric !== undefined);
        const review = state.review;
        const blocked = state.stale || state.rejectedClaimIds.length > 0 || review?.decision === 'rejected';
        const status = blocked ? '不作为当前结论采用' : review === null ? '待人工审阅' : '人工接受的结果记录';
        add(`${status}：结果 ${observation.id}；${method.canonicalName}；数据集：${dataset.canonicalName}；指标：${metric.canonicalName}；数值：${observation.value}；单位：${observation.unit.status === 'reported' ? observation.unit.symbol : statusText(observation.unit.status)}。`, [source.paperId]);
        add(`统计口径：${observation.valueStatistic}；方法角色：${observation.method.role === 'proposed' ? '提出的方法' : observation.method.role === 'baseline' ? '基线方法' : observation.method.otherRole}；数据划分：${contextText(observation.dataset.split)}；评测协议：${contextText(observation.evaluationProtocol)}；不确定性：${uncertaintyText(observation.uncertainty)}。`);
        add(`实验条件：${observation.conditions.status === 'reported' ? observation.conditions.values.map(value => `${value.name}：${value.value}（${value.comparisonRole === 'must-match' ? '比较时必须一致' : '描述性条件'}；来源表述 ${value.sourceClaimId}）`).join('；') : statusText(observation.conditions.status)}。`);
        add(`结果来源表述：${observation.resultClaimId}；方法来源：${observation.method.sourceClaimId}；数据集来源：${observation.dataset.sourceClaimId}；指标来源：${observation.metric.sourceClaimId}；结果作者：${observation.createdBy.kind} / ${observation.createdBy.id}。完整来源关系见审计附件，原文见证据附录。`);
        if (state.stale)
            add('该结果的来源或规范化实体已被替换，需要重新核对。');
        if (state.rejectedClaimIds.length > 0)
            add(`该结果引用了已拒绝的来源表述：${state.rejectedClaimIds.join('、')}。历史人工接受不解除此警告。`);
        if (review !== null) {
            add(`结果审阅：${review.decision === 'rejected' ? '拒绝' : review.decision === 'revised' ? '修改后接受' : '接受'}；证据支持程度：${support[review.evidenceSupport]}；审阅人：${review.createdBy.id}；时间：${review.createdAt}；理由：${review.rationale}`);
            if (review.qualifications !== undefined)
                add(`结果限定条件：${review.qualifications}`);
            if (review.counterEvidenceIds.length > 0)
                add(`结果反证：${review.counterEvidenceIds.join('、')}。完整内容见证据附录。`);
        }
    }
    if (paragraphs.length === 0)
        add('尚无当前结构化结果。');
    const retiredProtocols = new Set(question.comparisonProtocols.flatMap(value => value.supersedes === undefined ? [] : [value.supersedes]));
    for (const protocol of question.comparisonProtocols) {
        if (retiredProtocols.has(protocol.id))
            continue;
        const members = protocol.observationIds.map((id) => {
            const state = states.get(id);
            assert(state !== undefined);
            return state;
        });
        const blocked = members.some(state => !state.active || state.stale || state.review?.decision === 'rejected' || state.rejectedClaimIds.length > 0);
        const unreviewed = members.filter(state => state.review === null).length;
        add(`比较协议 ${protocol.id}：${blocked ? '当前不可采用，包含历史、过期或审核受阻的结果' : `记录的条件下可比较；其中 ${unreviewed} 条结果待人工审阅`}。成员：${protocol.observationIds.join('、')}；作者：${protocol.createdBy.kind} / ${protocol.createdBy.id}；理由：${protocol.compatibilityRationale}`);
    }
    add('结果审核与来源表述审核相互独立。比较协议记录作者对条件一致性的判断；报告不自动换算、排序、计算差值、合并研究或推断统计显著性。');
    return paragraphs;
}
const support = { supports: '支持', partial: '部分支持', unsupported: '不支持', uncertain: '尚不能确定' };
function statusText(status) { return status === 'not-recorded' ? '尚未记录' : '不适用'; }
function contextText(value) {
    return value.status === 'reported' ? `${value.value}（来源表述 ${value.sourceClaimId}）` : statusText(value.status);
}
function uncertaintyText(value) {
    if (value.status !== 'reported')
        return statusText(value.status);
    const uncertainty = value.value;
    switch (uncertainty.kind) {
        case 'standard-deviation': return `标准差 ${uncertainty.magnitude}`;
        case 'standard-error': return `标准误 ${uncertainty.magnitude}`;
        case 'unspecified-plus-minus': return `未说明类型的正负误差 ${uncertainty.magnitude}`;
        case 'confidence-interval': return `${uncertainty.confidenceLevelPercent}% 置信区间 ${uncertainty.lower} 至 ${uncertainty.upper}`;
        case 'range': return `范围 ${uncertainty.lower} 至 ${uncertainty.upper}`;
        /* v8 ignore next -- the validated uncertainty union is exhaustive. */
        default: return assertNever(uncertainty);
    }
}
/* v8 ignore next 3 -- only an impossible member of the validated uncertainty union reaches this assertion. */
function assertNever(value) {
    throw new Error(`Unexpected research uncertainty: ${JSON.stringify(value)}`);
}
//# sourceMappingURL=observations.js.map