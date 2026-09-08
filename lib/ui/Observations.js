import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Researcher review of paper-local results with complete experimental context and source choices. */
import { useEffect, useState } from 'react';
import css from './Workspace.module.css';
/**
 * @param props - framework-bound question state and explicit researcher actions.
 * @returns complete result context, revision form, evidence links, and immutable decisions.
 */
export function Observations({ useWorkspace, loadObservations, selectObservation, loadObservationChoices, loadObservationReviews, submitObservationReview, readEvidence, loadEvidenceChoices }) {
    const state = useWorkspace(value => value);
    const selected = state.selectedObservation;
    const [replacement, setReplacement] = useState(null);
    const [decision, setDecision] = useState('accepted');
    const [support, setSupport] = useState('uncertain');
    const [rationale, setRationale] = useState('');
    const [qualifications, setQualifications] = useState('');
    const [counterEvidenceIds, setCounterEvidenceIds] = useState([]);
    useEffect(() => {
        setDecision('accepted');
        setSupport('uncertain');
        setRationale('');
        setQualifications('');
        setCounterEvidenceIds([]);
        if (selected === null) {
            setReplacement(null);
            return;
        }
        const { resultClaimId, method, dataset, metric, value, unit, valueStatistic, evaluationProtocol, uncertainty, conditions } = selected.observation;
        setReplacement({ resultClaimId, method, dataset, metric, value, unit, valueStatistic, evaluationProtocol, uncertainty, conditions });
    }, [selected]);
    const claims = state.observationChoices?.choices.flatMap(item => item.kind === 'claim' ? [item.claim] : []) ?? [];
    const entities = state.observationChoices?.choices.flatMap(item => item.kind === 'entity' ? [item.entity] : []) ?? [];
    const claimSelect = (label, id, change, facet) => {
        const choices = claims.filter(value => facet === undefined || value.facet === facet);
        return _jsxs("label", { children: [label, _jsxs("select", { value: id, onChange: (event) => { change(event.target.value); }, children: [choices.some(value => value.id === id) ? null : _jsx("option", { value: id, children: "\u5F53\u524D\u5F15\u7528\uFF08\u52A0\u8F7D\u6765\u6E90\u540E\u53EF\u66F4\u6539\uFF09" }), choices.map(value => _jsx("option", { value: value.id, children: value.text }, value.id))] })] });
    };
    const entitySelect = (kind, label, reference, change) => {
        const choices = entities.filter(value => value.kind === kind).flatMap(entity => claims.filter(claim => entity.sourceClaimIds.includes(claim.id))
            .map(claim => ({ entity, claim })));
        const index = choices.findIndex(value => value.entity.id === reference.entityId && value.claim.id === reference.sourceClaimId);
        return _jsxs("label", { children: [label, _jsxs("select", { value: index, onChange: (event) => {
                        const choice = choices[Number(event.target.value)];
                        if (choice !== undefined)
                            change({ entityId: choice.entity.id, sourceClaimId: choice.claim.id });
                    }, children: [index === -1 ? _jsx("option", { value: -1, children: "\u5F53\u524D\u5F15\u7528\uFF08\u52A0\u8F7D\u6765\u6E90\u540E\u53EF\u66F4\u6539\uFF09" }) : null, choices.map((choice, position) => _jsxs("option", { value: position, children: [choice.entity.canonicalName, " \u2014 ", choice.claim.text] }, position))] })] });
    };
    const contextEditor = (label, context, change) => _jsxs("fieldset", { children: [_jsx("legend", { children: label }), _jsxs("label", { children: [label, "\u8BB0\u5F55\u72B6\u6001", _jsx("select", { value: context.status, onChange: (event) => {
                            const status = event.target.value;
                            if (replacement !== null)
                                change(status === 'reported' ? { status, value: '', sourceClaimId: replacement.resultClaimId } : { status });
                        }, children: Object.entries(statusLabels).map(([value, text]) => _jsx("option", { value: value, children: text }, value)) })] }), context.status === 'reported' ? _jsxs(_Fragment, { children: [_jsxs("label", { children: [label, "\u5185\u5BB9", _jsx("input", { required: true, value: context.value, onChange: (event) => { change({ ...context, value: event.target.value }); } })] }), claimSelect(`${label}来源表述`, context.sourceClaimId, (sourceClaimId) => { change({ ...context, sourceClaimId }); })] }) : null] });
    return _jsxs("section", { "aria-label": "\u5B9E\u9A8C\u7ED3\u679C\u5BA1\u9605", children: [_jsx("h3", { children: state.observations?.question.title ?? '实验结果' }), _jsx("p", { children: "\u7ED3\u679C\u662F\u7F72\u540D\u89C4\u8303\u5316\u8BB0\u5F55\u3002\u63A5\u53D7\u8868\u793A\u5BA1\u9605\u8005\u91C7\u7EB3\u8BE5\u8BB0\u5F55\uFF0C\u4E0D\u4EE3\u8868\u5DF2\u8BC1\u660E\u79D1\u5B66\u7ED3\u8BBA\u6216\u8DE8\u8BBA\u6587\u53EF\u6BD4\u6027\u3002" }), _jsx("button", { type: "button", disabled: state.busy, onClick: () => { void loadObservations(0); }, children: "\u5237\u65B0\u5B9E\u9A8C\u7ED3\u679C" }), state.observations?.observations.length === 0 ? _jsx("p", { children: "\u5C1A\u65E0\u5B9E\u9A8C\u7ED3\u679C\u3002\u53EF\u5728\u5BF9\u8BDD\u4E2D\u4F9D\u636E\u539F\u6587\u8BB0\u5F55\u6570\u503C\u548C\u5B9E\u9A8C\u6761\u4EF6\u3002" }) : null, _jsx("div", { className: css.observationList, children: state.observations?.observations.map(item => _jsxs("article", { className: css.paper, children: [_jsxs("button", { type: "button", disabled: state.busy, "aria-pressed": selected?.observation.id === item.observation.id, onClick: () => { void selectObservation(item); }, children: [item.paperTitle, " \u00B7 ", item.metricName, " = ", item.observation.value, item.observation.unit.status === 'reported' ? ` ${item.observation.unit.symbol}` : ''] }), _jsxs("p", { children: [item.methodName, " \u00B7 ", item.datasetName, " \u00B7 ", item.state.active ? '当前版本' : '历史版本', " \u00B7", ' ', item.state.review === null ? '待人工审阅' : item.state.review.decision === 'revised'
                                    && item.state.review.observationId === item.observation.id ? '已被修订，批准的是替代结果' : decisionLabels[item.state.review.decision], item.state.stale ? ' · 来源已过期' : '', item.state.rejectedClaimIds.length ? ' · 引用了已拒绝的来源表述' : ''] })] }, item.observation.id)) }), state.observations?.nextOffset == null ? null : _jsx("button", { type: "button", disabled: state.busy, onClick: () => { void loadObservations(state.observations?.nextOffset ?? 0); }, children: "\u4E0B\u4E00\u9875\u5B9E\u9A8C\u7ED3\u679C" }), selected === null || replacement === null ? _jsx("p", { children: "\u9009\u62E9\u4E00\u6761\u7ED3\u679C\uFF0C\u5BF9\u7167\u539F\u6587\u6838\u5BF9\u6570\u503C\u3001\u5355\u4F4D\u4E0E\u5B9E\u9A8C\u6761\u4EF6\u3002" }) : _jsxs(_Fragment, { children: [_jsxs("section", { "aria-label": "\u7ED3\u679C\u8BB0\u5F55", children: [_jsx("h3", { children: selected.paperTitle }), _jsxs("dl", { className: css.resultDetails, children: [_jsx("dt", { children: "\u65B9\u6CD5" }), _jsxs("dd", { children: [selected.methodName, " \u00B7 ", methodLabels[selected.observation.method.role], selected.observation.method.otherRole] }), _jsx("dt", { children: "\u6570\u636E\u96C6" }), _jsx("dd", { children: selected.datasetName }), _jsx("dt", { children: "\u6307\u6807" }), _jsx("dd", { children: selected.metricName }), _jsx("dt", { children: "\u6570\u503C\u4E0E\u5355\u4F4D" }), _jsxs("dd", { children: [selected.observation.value, " \u00B7 ", selected.observation.unit.status === 'reported'
                                                ? selected.observation.unit.symbol : statusLabels[selected.observation.unit.status]] }), _jsx("dt", { children: "\u7EDF\u8BA1\u53E3\u5F84" }), _jsx("dd", { children: selected.observation.valueStatistic }), _jsx("dt", { children: "\u6570\u636E\u5212\u5206" }), _jsx("dd", { children: contextText(selected.observation.dataset.split) }), _jsx("dt", { children: "\u8BC4\u6D4B\u534F\u8BAE" }), _jsx("dd", { children: contextText(selected.observation.evaluationProtocol) }), _jsx("dt", { children: "\u4E0D\u786E\u5B9A\u6027" }), _jsx("dd", { children: uncertaintyText(selected.observation.uncertainty) }), _jsx("dt", { children: "\u5B9E\u9A8C\u6761\u4EF6" }), _jsx("dd", { children: selected.observation.conditions.status === 'reported'
                                            ? selected.observation.conditions.values.map((value, index) => _jsxs("p", { children: [value.name, "\uFF1A", value.value, " \u00B7 ", value.comparisonRole === 'must-match' ? '比较时必须一致' : '描述性条件'] }, index))
                                            : statusLabels[selected.observation.conditions.status] }), _jsx("dt", { children: "\u8BB0\u5F55\u4F5C\u8005" }), _jsxs("dd", { children: [selected.observation.createdBy.kind === 'agent' ? '智能体' : '研究者', " \u00B7 ", selected.observation.createdBy.id] })] }), selected.evidenceIds.map((id, index) => _jsxs("button", { type: "button", disabled: state.busy, onClick: () => { void readEvidence(id); }, children: ["\u67E5\u770B\u7ED3\u679C\u539F\u6587 ", index + 1] }, id)), selected.state.stale ? _jsx("p", { children: "\u90E8\u5206\u6765\u6E90\u5DF2\u88AB\u66FF\u6362\uFF0C\u63A5\u53D7\u524D\u9700\u4FEE\u8BA2\u6765\u6E90\u5F15\u7528\u3002" }) : null, selected.state.rejectedClaimIds.length ? _jsx("p", { children: "\u7ED3\u679C\u5F15\u7528\u4E86\u5DF2\u62D2\u7EDD\u7684\u6765\u6E90\u8868\u8FF0\uFF0C\u4E0D\u80FD\u76F4\u63A5\u63A5\u53D7\u6216\u7528\u4E8E\u65B0\u7684\u6BD4\u8F83\u534F\u8BAE\u3002" }) : null] }), _jsx("form", { className: css.reviewForm, "aria-label": "\u4FDD\u5B58\u5B9E\u9A8C\u7ED3\u679C\u5BA1\u9605", onSubmit: (event) => {
                            event.preventDefault();
                            const question = state.observations?.question;
                            if (question === undefined)
                                return;
                            const base = { questionId: question.id, expectedRevision: question.revision, observationId: selected.observation.id,
                                evidenceSupport: support, rationale, counterEvidenceIds, ...(qualifications.trim() ? { qualifications } : {}) };
                            void submitObservationReview(decision === 'revised' ? { ...base, decision, replacement } : { ...base, decision });
                        }, children: _jsxs("fieldset", { disabled: state.busy || !selected.state.active, className: css.reviewForm, children: [_jsx("legend", { children: "\u7ED3\u679C\u4EBA\u5DE5\u51B3\u5B9A" }), _jsxs("label", { children: ["\u7ED3\u679C\u5BA1\u9605\u51B3\u5B9A", _jsx("select", { value: decision, onChange: (event) => { setDecision(event.target.value); }, children: Object.entries(decisionLabels).map(([value, text]) => _jsx("option", { value: value, children: text }, value)) })] }), _jsxs("label", { children: ["\u7ED3\u679C\u8BC1\u636E\u652F\u6301\u7A0B\u5EA6", _jsx("select", { value: support, onChange: (event) => { setSupport(event.target.value); }, children: Object.entries(supportLabels).map(([value, text]) => _jsx("option", { value: value, children: text }, value)) })] }), _jsxs("label", { children: ["\u7ED3\u679C\u5BA1\u9605\u7406\u7531", _jsx("textarea", { required: true, value: rationale, onChange: (event) => { setRationale(event.target.value); } })] }), _jsxs("label", { children: ["\u7ED3\u679C\u9650\u5B9A\u6761\u4EF6\u4E0E\u9057\u6F0F", _jsx("textarea", { value: qualifications, onChange: (event) => { setQualifications(event.target.value); } })] }), decision !== 'revised' ? null : _jsxs(_Fragment, { children: [_jsx("h3", { children: "\u4FEE\u8BA2\u7ED3\u679C\u5E76\u4FDD\u7559\u539F\u59CB\u8BB0\u5F55" }), _jsx("p", { children: "\u6765\u6E90\u9009\u62E9\u4EC5\u5305\u542B\u8FD9\u7BC7\u8BBA\u6587\u7684\u5F53\u524D\u6765\u6E90\u8868\u8FF0\u53CA\u76F8\u5173\u89C4\u8303\u5316\u5B9E\u4F53\u3002\u7F3A\u5C11\u6B63\u786E\u6765\u6E90\u65F6\uFF0C\u8BF7\u5148\u5728\u5BF9\u8BDD\u4E2D\u8865\u5145\uFF0C\u518D\u5237\u65B0\u7ED3\u679C\u3002" }), state.observationChoices?.nextOffset == null ? null : _jsx("button", { type: "button", onClick: () => {
                                                void loadObservationChoices(state.observationChoices?.nextOffset ?? 0);
                                            }, children: "\u52A0\u8F7D\u66F4\u591A\u4FEE\u8BA2\u6765\u6E90" }), claimSelect('结果来源表述', replacement.resultClaimId, (resultClaimId) => { setReplacement({ ...replacement, resultClaimId }); }, 'result'), entitySelect('method', '方法与来源', replacement.method, (ref) => { setReplacement({ ...replacement, method: { ...replacement.method, ...ref } }); }), _jsxs("label", { children: ["\u65B9\u6CD5\u89D2\u8272", _jsx("select", { value: replacement.method.role, onChange: (event) => {
                                                        const role = event.target.value;
                                                        setReplacement({ ...replacement, method: { entityId: replacement.method.entityId,
                                                                sourceClaimId: replacement.method.sourceClaimId,
                                                                role, ...(role === 'other' ? { otherRole: '' } : {}) } });
                                                    }, children: Object.entries(methodLabels).map(([value, text]) => _jsx("option", { value: value, children: text }, value)) })] }), replacement.method.role === 'other' ? _jsxs("label", { children: ["\u5176\u4ED6\u65B9\u6CD5\u89D2\u8272", _jsx("input", { required: true, value: replacement.method.otherRole, onChange: (event) => {
                                                        setReplacement({ ...replacement, method: { ...replacement.method, otherRole: event.target.value } });
                                                    } })] }) : null, entitySelect('dataset', '数据集与来源', replacement.dataset, (ref) => { setReplacement({ ...replacement, dataset: { ...replacement.dataset, ...ref } }); }), entitySelect('metric', '指标与来源', replacement.metric, (metric) => { setReplacement({ ...replacement, metric }); }), _jsxs("label", { children: ["\u4FEE\u8BA2\u6570\u503C", _jsx("input", { required: true, inputMode: "decimal", value: replacement.value, onChange: (event) => { setReplacement({ ...replacement, value: event.target.value }); } })] }), _jsxs("label", { children: ["\u5355\u4F4D\u8BB0\u5F55\u72B6\u6001", _jsx("select", { value: replacement.unit.status, onChange: (event) => {
                                                        const status = event.target.value;
                                                        setReplacement({ ...replacement, unit: status === 'reported' ? { status, symbol: '' } : { status } });
                                                    }, children: Object.entries(statusLabels).map(([value, text]) => _jsx("option", { value: value, children: text }, value)) })] }), replacement.unit.status === 'reported' ? _jsxs("label", { children: ["\u5355\u4F4D\u7B26\u53F7", _jsx("input", { required: true, value: replacement.unit.symbol, onChange: (event) => { setReplacement({ ...replacement, unit: { status: 'reported', symbol: event.target.value } }); } })] }) : null, _jsxs("label", { children: ["\u7EDF\u8BA1\u53E3\u5F84", _jsx("input", { required: true, value: replacement.valueStatistic, onChange: (event) => { setReplacement({ ...replacement, valueStatistic: event.target.value }); } })] }), contextEditor('数据划分', replacement.dataset.split, (split) => { setReplacement({ ...replacement, dataset: { ...replacement.dataset, split } }); }), contextEditor('评测协议', replacement.evaluationProtocol, (evaluationProtocol) => { setReplacement({ ...replacement, evaluationProtocol }); }), _jsxs("fieldset", { children: [_jsx("legend", { children: "\u4E0D\u786E\u5B9A\u6027" }), _jsxs("label", { children: ["\u4E0D\u786E\u5B9A\u6027\u8BB0\u5F55\u72B6\u6001", _jsx("select", { value: replacement.uncertainty.status, onChange: (event) => {
                                                                const status = event.target.value;
                                                                setReplacement({ ...replacement, uncertainty: status === 'reported'
                                                                        ? { status, value: { kind: 'standard-deviation', magnitude: '' } } : { status } });
                                                            }, children: Object.entries(statusLabels).map(([value, text]) => _jsx("option", { value: value, children: text }, value)) })] }), replacement.uncertainty.status === 'reported' ? _jsxs(_Fragment, { children: [_jsxs("label", { children: ["\u4E0D\u786E\u5B9A\u6027\u7C7B\u578B", _jsx("select", { value: replacement.uncertainty.value.kind, onChange: (event) => {
                                                                        const kind = event.target.value;
                                                                        const blank = '';
                                                                        setReplacement({ ...replacement, uncertainty: { status: 'reported', value: kind === 'confidence-interval'
                                                                                    ? { kind, lower: blank, upper: blank, confidenceLevelPercent: blank } : kind === 'range'
                                                                                    ? { kind, lower: blank, upper: blank } : { kind, magnitude: blank } } });
                                                                    }, children: Object.entries(uncertaintyLabels).map(([value, text]) => _jsx("option", { value: value, children: text }, value)) })] }), ('magnitude' in replacement.uncertainty.value ? ['magnitude'] : replacement.uncertainty.value.kind === 'confidence-interval'
                                                            ? ['lower', 'upper', 'confidenceLevelPercent'] : ['lower', 'upper']).map((field) => {
                                                            const uncertainty = replacement.uncertainty;
                                                            if (uncertainty.status !== 'reported')
                                                                return null;
                                                            const value = uncertainty.value;
                                                            const text = field === 'magnitude' && 'magnitude' in value ? value.magnitude
                                                                : field === 'lower' && 'lower' in value ? value.lower : field === 'upper' && 'upper' in value ? value.upper
                                                                    : 'confidenceLevelPercent' in value ? value.confidenceLevelPercent : '';
                                                            return _jsxs("label", { children: [decimalLabels[field], _jsx("input", { required: true, inputMode: "decimal", value: text, onChange: (event) => {
                                                                            setReplacement({ ...replacement, uncertainty: { status: 'reported', value: { ...value, [field]: event.target.value } } });
                                                                        } })] }, field);
                                                        })] }) : null] }), _jsxs("fieldset", { children: [_jsx("legend", { children: "\u5B9E\u9A8C\u6761\u4EF6" }), _jsxs("label", { children: ["\u5B9E\u9A8C\u6761\u4EF6\u8BB0\u5F55\u72B6\u6001", _jsx("select", { value: replacement.conditions.status, onChange: (event) => {
                                                                const status = event.target.value;
                                                                setReplacement({ ...replacement, conditions: status === 'reported' ? { status, values: [] } : { status } });
                                                            }, children: Object.entries(statusLabels).map(([value, text]) => _jsx("option", { value: value, children: text }, value)) })] }), replacement.conditions.status === 'reported' ? _jsxs(_Fragment, { children: [replacement.conditions.values.map((condition, index) => {
                                                            const conditions = replacement.conditions;
                                                            if (conditions.status !== 'reported')
                                                                return null;
                                                            const change = (value) => {
                                                                setReplacement({ ...replacement, conditions: {
                                                                        status: 'reported', values: conditions.values.map((current, position) => position === index ? value : current),
                                                                    } });
                                                            };
                                                            return _jsxs("div", { className: css.reviewForm, children: [_jsxs("label", { children: ["\u6761\u4EF6 ", index + 1, " \u540D\u79F0", _jsx("input", { required: true, value: condition.name, onChange: (event) => { change({ ...condition, name: event.target.value }); } })] }), _jsxs("label", { children: ["\u6761\u4EF6 ", index + 1, " \u5185\u5BB9", _jsx("input", { required: true, value: condition.value, onChange: (event) => { change({ ...condition, value: event.target.value }); } })] }), claimSelect(`条件 ${index + 1} 来源表述`, condition.sourceClaimId, (sourceClaimId) => { change({ ...condition, sourceClaimId }); }), _jsxs("label", { children: ["\u6761\u4EF6 ", index + 1, " \u6BD4\u8F83\u8981\u6C42", _jsxs("select", { value: condition.comparisonRole, onChange: (event) => {
                                                                                    change({ ...condition, comparisonRole: event.target.value });
                                                                                }, children: [_jsx("option", { value: "must-match", children: "\u6BD4\u8F83\u65F6\u5FC5\u987B\u4E00\u81F4" }), _jsx("option", { value: "descriptive", children: "\u63CF\u8FF0\u6027\u6761\u4EF6" })] })] }), _jsxs("button", { type: "button", onClick: () => {
                                                                            setReplacement({ ...replacement, conditions: {
                                                                                    status: 'reported', values: conditions.values.filter((_, position) => position !== index),
                                                                                } });
                                                                        }, children: ["\u79FB\u9664\u6761\u4EF6 ", index + 1] })] }, index);
                                                        }), _jsx("button", { type: "button", onClick: () => {
                                                                if (replacement.conditions.status !== 'reported')
                                                                    return;
                                                                setReplacement({ ...replacement, conditions: { status: 'reported', values: [...replacement.conditions.values,
                                                                            { name: '', value: '', sourceClaimId: replacement.resultClaimId, comparisonRole: 'must-match' }] } });
                                                            }, children: "\u6DFB\u52A0\u5B9E\u9A8C\u6761\u4EF6" })] }) : null] })] }), _jsxs("details", { children: [_jsxs("summary", { children: ["\u7ED3\u679C\u53CD\u8BC1\uFF08\u5DF2\u9009 ", counterEvidenceIds.length, " \u6761\uFF09"] }), state.evidenceChoices?.evidence.map(choice => _jsxs("article", { className: css.paper, children: [_jsxs("button", { type: "button", onClick: () => { void readEvidence(choice.id); }, children: ["\u67E5\u770B\u7ED3\u679C\u53CD\u8BC1\u539F\u6587 \u00B7 \u7B2C ", choice.pageIndex + 1, " \u9875"] }), _jsxs("p", { children: [choice.excerpt, choice.excerptTruncated ? '（预览已截断）' : ''] }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: counterEvidenceIds.includes(choice.id), onChange: (event) => {
                                                                setCounterEvidenceIds(event.target.checked ? [...counterEvidenceIds, choice.id] : counterEvidenceIds.filter(id => id !== choice.id));
                                                            } }), "\u9009\u4E3A\u7ED3\u679C\u53CD\u8BC1"] })] }, choice.id)), state.evidenceChoices?.nextOffset == null ? null : _jsx("button", { type: "button", onClick: () => {
                                                void loadEvidenceChoices(state.evidenceChoices?.nextOffset ?? 0);
                                            }, children: "\u4E0B\u4E00\u9875\u7ED3\u679C\u53CD\u8BC1" }), _jsx("button", { type: "button", onClick: () => { void loadEvidenceChoices(0); }, children: "\u56DE\u5230\u9996\u6279\u7ED3\u679C\u53CD\u8BC1" })] }), _jsx("button", { type: "submit", disabled: state.reviewerId === null || !rationale.trim()
                                        || (decision === 'accepted' && (selected.state.stale || selected.state.rejectedClaimIds.length > 0)), children: "\u4FDD\u5B58\u7ED3\u679C\u5BA1\u9605\u51B3\u5B9A" })] }) }), _jsxs("section", { "aria-label": "\u7ED3\u679C\u5BA1\u9605\u5386\u53F2", children: [_jsx("h3", { children: "\u7ED3\u679C\u5BA1\u9605\u5386\u53F2" }), state.observationReviews?.reviews.length === 0 ? _jsx("p", { children: "\u5C1A\u65E0\u7ED3\u679C\u4EBA\u5DE5\u51B3\u5B9A\u3002" }) : null, state.observationReviews?.reviews.map(review => _jsxs("article", { className: css.paper, children: [_jsxs("strong", { children: [decisionLabels[review.decision], " \u00B7 ", supportLabels[review.evidenceSupport]] }), _jsxs("p", { children: [state.reviewers.find(value => value.id === review.createdBy.id)?.displayName ?? review.createdBy.id, " \u00B7 ", review.createdAt] }), _jsx("p", { className: css.exactText, children: review.rationale }), _jsx("p", { className: css.exactText, children: review.qualifications }), review.counterEvidenceIds.map((id, index) => _jsxs("button", { type: "button", disabled: state.busy, onClick: () => { void readEvidence(id); }, children: ["\u67E5\u770B\u5386\u53F2\u7ED3\u679C\u53CD\u8BC1 ", index + 1] }, id))] }, review.id)), state.observationReviews?.nextOffset == null ? null : _jsx("button", { type: "button", disabled: state.busy, onClick: () => { void loadObservationReviews(state.observationReviews?.nextOffset ?? 0); }, children: "\u66F4\u591A\u7ED3\u679C\u5BA1\u9605\u5386\u53F2" })] })] })] });
}
const statusLabels = { reported: '已记录', 'not-recorded': '尚未记录', 'not-applicable': '不适用' };
const decisionLabels = { accepted: '接受', revised: '修改后接受', rejected: '拒绝' };
const supportLabels = { uncertain: '尚不能确定', supports: '支持', partial: '部分支持', unsupported: '不支持' };
const methodLabels = { proposed: '提出的方法', baseline: '基线方法', other: '其他角色' };
const uncertaintyLabels = { 'standard-deviation': '标准差', 'standard-error': '标准误', 'unspecified-plus-minus': '未说明类型的正负误差', 'confidence-interval': '置信区间', range: '范围' };
const decimalLabels = { magnitude: '误差幅度', lower: '下界', upper: '上界', confidenceLevelPercent: '置信水平（%）' };
function contextText(context) {
    return context.status === 'reported' ? context.value : statusLabels[context.status];
}
function uncertaintyText(uncertainty) {
    if (uncertainty.status !== 'reported')
        return statusLabels[uncertainty.status];
    const value = uncertainty.value;
    if ('magnitude' in value)
        return `${uncertaintyLabels[value.kind]}：${value.magnitude}`;
    return `${uncertaintyLabels[value.kind]}：${value.lower} 至 ${value.upper}${value.kind === 'confidence-interval' ? `（${value.confidenceLevelPercent}%）` : ''}`;
}
//# sourceMappingURL=Observations.js.map