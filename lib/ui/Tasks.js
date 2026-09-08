import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
/** Research task selection, authored checkpoints, and explicit recovery. */
import { useEffect, useRef, useState } from 'react';
import css from './Workspace.module.css';
const kinds = {
    'single-paper': '单篇精读', 'topic-review': '主题综述', 'method-comparison': '方法比较',
};
const phases = {
    active: '进行中', paused: '已暂停', blocked: '等待处理', complete: '已完成，需核对当前有效性',
};
const stages = {
    acquisition: '选择来源', extraction: '提取证据', review: '人工审核', comparison: '确认可比性', synthesis: '形成综合', export: '导出报告',
};
const guidance = {
    acquisition: '选择本任务使用的论文来源版本。尚未入库的论文可先在对话中导入。',
    extraction: '在对话中为每个选定来源捕获精确原文，并记录有来源支持的论断。',
    review: '到证据与审阅、实验结果视图核对记录。已过期的获批结果需要修订或拒绝。',
    comparison: '记录基于已审核结果的可比协议，或明确说明这些结果为何不能直接比较。',
    synthesis: '在对话中记录有来源的综合发现，保留限定条件、冲突和开放问题。',
    export: '确认后保存当前报告的校验标识；请到报告导出视图下载文件并审阅整篇草稿。',
};
/**
 * @param props - task data, authored actions, and source-reader navigation.
 * @returns current task progress and historical checkpoints without implying automatic execution.
 */
export function Tasks({ useWorkspace, createQuestion, createTask, updateTask, loadTasks, selectTask, loadTaskHistory, loadTaskSources, loadTaskIssues, loadCatalog, openSource }) {
    const state = useWorkspace(value => value);
    const question = state.claimPage?.question;
    const [title, setTitle] = useState('');
    const [questionText, setQuestionText] = useState('');
    const [kind, setKind] = useState('single-paper');
    const questionForm = useRef(null);
    useEffect(() => { if (question !== undefined)
        void loadTasks(0); }, [question?.id, loadTasks]);
    const current = state.task;
    const disabled = state.busy || state.reviewerId === null;
    return _jsxs("section", { "aria-label": "\u79D1\u7814\u4EFB\u52A1", children: [_jsx("h3", { children: question?.title ?? '创建科研任务' }), _jsx("p", { children: "\u4FDD\u5B58\u7CBE\u8BFB\u3001\u7EFC\u8FF0\u548C\u6BD4\u8F83\u7684\u9636\u6BB5\u8FDB\u5EA6\u3002\u5BF9\u8BDD\u8D1F\u8D23\u6267\u884C\u79D1\u7814\u5DE5\u4F5C\uFF1B\u8FD9\u91CC\u8BB0\u5F55\u5B8C\u6210\u60C5\u51B5\u3001\u7B49\u5F85\u4E8B\u9879\u548C\u6062\u590D\u4F4D\u7F6E\u3002" }), _jsxs("details", { ref: questionForm, children: [_jsx("summary", { children: "\u65B0\u5EFA\u7814\u7A76\u95EE\u9898" }), _jsxs("form", { className: css.reviewForm, onSubmit: (event) => {
                            event.preventDefault();
                            void createQuestion(title, questionText).then((saved) => {
                                if (!saved)
                                    return;
                                setTitle('');
                                setQuestionText('');
                                if (questionForm.current !== null)
                                    questionForm.current.open = false;
                            });
                        }, children: [_jsxs("label", { children: ["\u95EE\u9898\u6807\u9898", _jsx("input", { required: true, value: title, onChange: (event) => { setTitle(event.target.value); } })] }), _jsxs("label", { children: ["\u7814\u7A76\u95EE\u9898\u5185\u5BB9", _jsx("textarea", { required: true, value: questionText, onChange: (event) => { setQuestionText(event.target.value); } })] }), _jsx("button", { type: "submit", disabled: disabled || !title.trim() || !questionText.trim(), children: "\u521B\u5EFA\u7814\u7A76\u95EE\u9898" })] })] }), question === undefined ? _jsx("p", { children: "\u8BF7\u4ECE\u5DE6\u4FA7\u9009\u62E9\u7814\u7A76\u95EE\u9898\uFF0C\u6216\u767B\u8BB0\u7F72\u540D\u540E\u521B\u5EFA\u65B0\u95EE\u9898\u3002" }) : _jsxs(_Fragment, { children: [_jsxs("form", { className: css.controls, onSubmit: (event) => { event.preventDefault(); void createTask(kind); }, children: [_jsxs("label", { children: ["\u4EFB\u52A1\u7C7B\u578B", _jsx("select", { value: kind, onChange: (event) => { setKind(event.target.value); }, children: Object.entries(kinds).map(([value, label]) => _jsx("option", { value: value, children: label }, value)) })] }), _jsx("button", { type: "submit", disabled: disabled, children: "\u521B\u5EFA\u79D1\u7814\u4EFB\u52A1" }), _jsx("button", { type: "button", disabled: state.busy, onClick: () => { void loadTasks(0); }, children: "\u5237\u65B0\u4EFB\u52A1\u5217\u8868" })] }), _jsx("div", { className: css.taskList, children: state.tasks?.tasks.map((task, index) => _jsxs("article", { className: css.paper, children: [_jsxs("button", { type: "button", disabled: state.busy, onClick: () => { void selectTask(task.id); }, children: ["\u67E5\u770B", kinds[task.kind], "\u4EFB\u52A1 \u00B7 ", index + 1] }), _jsxs("p", { children: ["\u5DF2\u4FDD\u5B58\u72B6\u6001\uFF1A", phases[task.phase]] }), task.reason ? _jsx("p", { children: task.reason }) : null] }, task.id)) }), state.tasks?.tasks.length === 0 ? _jsx("p", { children: "\u6B64\u95EE\u9898\u5C1A\u65E0\u79D1\u7814\u4EFB\u52A1\u3002" }) : null, state.tasks?.nextOffset == null ? null : _jsx("button", { type: "button", disabled: state.busy, onClick: () => { void loadTasks(state.tasks?.nextOffset ?? 0); }, children: "\u4E0B\u4E00\u9875\u4EFB\u52A1" })] }), state.taskReceipt === null ? null : _jsxs("p", { role: "status", children: ["\u4EFB\u52A1\u5DF2\u4FDD\u5B58\u3002", _jsx("button", { type: "button", disabled: state.busy, onClick: () => {
                            if (state.taskReceipt !== null)
                                void selectTask(state.taskReceipt.taskId);
                        }, children: "\u5237\u65B0\u5DF2\u4FDD\u5B58\u4EFB\u52A1" })] }), current === null ? null : _jsxs(_Fragment, { children: [_jsxs("section", { "aria-label": "\u5F53\u524D\u4EFB\u52A1\u8FDB\u5EA6", children: [_jsx("h4", { children: kinds[current.task.kind] }), _jsx("p", { children: current.stale ? '科学记录已变化，需要重新核对后续阶段。' : current.nextStage === null ? '全部阶段当前有效。' : `下一步：${stages[current.nextStage]}` }), current.requiresResume ? _jsx("p", { children: "\u4EFB\u52A1\u5728\u91CD\u542F\u524D\u5904\u4E8E\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u663E\u5F0F\u6062\u590D\u540E\u7EE7\u7EED\u3002" }) : null, _jsxs("p", { children: ["\u5F53\u524D\u6709\u6548\u7684\u5DF2\u5B8C\u6210\u9636\u6BB5\uFF1A", current.completedStages.map(stage => stages[stage]).join(' → ') || '尚无'] }), current.nextStage === null ? null : _jsx("p", { children: guidance[current.nextStage] }), _jsx("button", { type: "button", disabled: state.busy, onClick: () => { void selectTask(current.task.id); }, children: "\u5237\u65B0\u5F53\u524D\u4EFB\u52A1" }), current.issues.length === 0 ? null : _jsxs("details", { children: [_jsxs("summary", { children: ["\u9636\u6BB5\u6838\u5BF9\u63D0\u793A\uFF08", current.issues.length, "\uFF09"] }), _jsx("ul", { children: current.issues.map((issue, index) => _jsx("li", { children: issue }, index)) }), current.nextOffset === null ? null : _jsx("button", { type: "button", disabled: state.busy, onClick: () => { void loadTaskIssues(current.nextOffset ?? 0); }, children: "\u66F4\u591A\u6838\u5BF9\u63D0\u793A" })] }), _jsx(TaskActions, { current: current, selectedSources: state.taskSelection, catalogQuery: state.catalogQuery, catalog: state.catalog, disabled: disabled, updateTask: updateTask, loadCatalog: loadCatalog }, `${current.task.id}:${current.task.revision}:${current.questionRevision}`)] }), _jsxs("section", { "aria-label": "\u4EFB\u52A1\u6765\u6E90", children: [_jsx("h4", { children: state.taskSourceCheckpoint === null ? '当前选定来源' : '检查点保留的历史来源' }), _jsx("button", { type: "button", disabled: state.busy, onClick: () => { void loadTaskSources(null, 0); }, children: "\u67E5\u770B\u5F53\u524D\u6765\u6E90" }), state.taskSources?.sources.map(source => _jsx("p", { children: _jsxs("button", { type: "button", disabled: state.busy, onClick: () => { openSource(source); }, children: ["\u9605\u8BFB\u6765\u6E90\uFF1A", source.title] }) }, `${source.paperId}/${source.source.id}`)), state.taskSources?.sources.length === 0 ? _jsx("p", { children: "\u5C1A\u672A\u786E\u8BA4\u6765\u6E90\u3002" }) : null, state.taskSources?.nextOffset == null ? null : _jsx("button", { type: "button", disabled: state.busy, onClick: () => { void loadTaskSources(state.taskSourceCheckpoint, state.taskSources?.nextOffset ?? 0); }, children: "\u66F4\u591A\u4EFB\u52A1\u6765\u6E90" })] }), _jsxs("section", { "aria-label": "\u4EFB\u52A1\u68C0\u67E5\u70B9\u5386\u53F2", children: [_jsx("h4", { children: "\u68C0\u67E5\u70B9\u5386\u53F2" }), state.taskHistory?.checkpoints.map(checkpoint => _jsxs("article", { className: css.paper, children: [_jsxs("h5", { children: [stages[checkpoint.stage], " \u00B7 ", checkpoint.effective ? '保留在当前流程中' : '历史记录'] }), _jsx("p", { children: checkpoint.summary }), _jsxs("p", { children: ["\u6765\u6E90 ", checkpoint.sourceCount, " \u4E2A \u00B7 \u4EA7\u7269\u5F15\u7528 ", checkpoint.artifactCount, " \u9879"] }), _jsxs("p", { children: [checkpoint.createdBy.kind === 'researcher' ? '研究者' : 'Agent', " \u00B7 ", _jsx("time", { dateTime: checkpoint.createdAt, children: checkpoint.createdAt })] }), _jsx("button", { type: "button", disabled: state.busy, onClick: () => { void loadTaskSources(checkpoint.taskRevision, 0); }, children: "\u67E5\u770B\u6B64\u68C0\u67E5\u70B9\u6765\u6E90" })] }, checkpoint.taskRevision)), state.taskHistory?.nextOffset == null ? null : _jsx("button", { type: "button", disabled: state.busy, onClick: () => { void loadTaskHistory(state.taskHistory?.nextOffset ?? 0); }, children: "\u66F4\u591A\u68C0\u67E5\u70B9" })] })] })] });
}
function TaskActions({ current, selectedSources, catalog, catalogQuery, disabled, updateTask, loadCatalog }) {
    const [sources, setSources] = useState(() => selectedSources);
    const [query, setQuery] = useState('');
    const [summary, setSummary] = useState('');
    const [reason, setReason] = useState('');
    const [outcome, setOutcome] = useState('');
    const [rewind, setRewind] = useState(current.completedStages[0] ?? current.nextStage ?? 'acquisition');
    const { task, nextStage } = current;
    const common = { taskId: task.id, expectedRevision: task.revision };
    const phase = (action) => { void updateTask({ ...common, action, reason }); };
    return _jsxs(_Fragment, { children: [nextStage === null ? null : _jsxs("form", { className: css.reviewForm, "aria-label": "\u786E\u8BA4\u4EFB\u52A1\u9636\u6BB5", onSubmit: (event) => {
                    event.preventDefault();
                    void updateTask({ ...common, action: 'checkpoint', expectedQuestionRevision: current.questionRevision,
                        stage: nextStage, summary, ...(nextStage === 'acquisition' ? { sources } : {}),
                        ...(nextStage === 'comparison' && outcome !== '' ? { comparisonOutcome: outcome } : {}) });
                }, children: [nextStage !== 'acquisition' ? null : _jsxs("fieldset", { children: [_jsx("legend", { children: "\u9009\u62E9\u4EFB\u52A1\u6765\u6E90" }), _jsxs("div", { className: css.controls, children: [_jsxs("label", { children: ["\u7B5B\u9009\u4EFB\u52A1\u6587\u732E", _jsx("input", { type: "search", value: query, onChange: (event) => { setQuery(event.target.value); } })] }), _jsx("button", { type: "button", disabled: disabled, onClick: () => { void loadCatalog(query, 0); }, children: "\u67E5\u627E\u4EFB\u52A1\u6587\u732E" })] }), catalog?.papers.flatMap(paper => paper.sources.map((source, index) => {
                                const checked = sources.some(value => value.paperId === paper.id && value.sourceVersionId === source.id);
                                return _jsxs("label", { className: css.taskSourceChoice, children: [_jsx("input", { type: "checkbox", checked: checked, disabled: disabled, onChange: (event) => {
                                                setSources(event.target.checked ? [...sources, { paperId: paper.id, sourceVersionId: source.id }]
                                                    : sources.filter(value => value.paperId !== paper.id || value.sourceVersionId !== source.id));
                                            } }), paper.title, " \u00B7 \u6765\u6E90 ", index + 1] }, `${paper.id}/${source.id}`);
                            })), _jsxs("p", { children: ["\u5DF2\u9009\u62E9 ", sources.length, " \u4E2A\u6765\u6E90\uFF1B\u7FFB\u9875\u4FDD\u7559\u9009\u62E9\u3002"] }), catalog?.nextOffset == null ? null : _jsx("button", { type: "button", disabled: disabled, onClick: () => { void loadCatalog(catalogQuery, catalog.nextOffset ?? 0); }, children: "\u4E0B\u4E00\u9875\u4EFB\u52A1\u6587\u732E" })] }), nextStage !== 'comparison' ? null : _jsxs("label", { children: ["\u53EF\u6BD4\u6027\u51B3\u5B9A", _jsxs("select", { required: true, value: outcome, onChange: (event) => { setOutcome(event.target.value); }, children: [_jsx("option", { value: "", children: "\u8BF7\u9009\u62E9" }), _jsx("option", { value: "protocol", children: "\u4F7F\u7528\u5DF2\u8BB0\u5F55\u7684\u53EF\u6BD4\u534F\u8BAE" }), _jsx("option", { value: "not-comparable", children: "\u4E0D\u53EF\u76F4\u63A5\u6BD4\u8F83\uFF0C\u5E76\u5728\u603B\u7ED3\u4E2D\u8BF4\u660E\u539F\u56E0" })] })] }), _jsxs("label", { children: ["\u9636\u6BB5\u603B\u7ED3", _jsx("textarea", { required: true, value: summary, onChange: (event) => { setSummary(event.target.value); } })] }), _jsxs("button", { type: "submit", disabled: disabled || !summary.trim() || current.stale || current.requiresResume || task.phase !== 'active', children: ["\u786E\u8BA4", stages[nextStage], "\u5B8C\u6210"] })] }), _jsxs("div", { className: css.reviewForm, children: [_jsxs("label", { children: ["\u4EFB\u52A1\u8C03\u6574\u8BF4\u660E", _jsx("textarea", { value: reason, onChange: (event) => { setReason(event.target.value); } })] }), _jsxs("div", { className: css.controls, children: [_jsx("button", { type: "button", disabled: disabled || !reason.trim() || task.phase === 'complete', onClick: () => { phase('pause'); }, children: "\u6682\u505C\u4EFB\u52A1" }), _jsx("button", { type: "button", disabled: disabled || !reason.trim() || task.phase === 'complete', onClick: () => { phase('block'); }, children: "\u6807\u8BB0\u7B49\u5F85\u5904\u7406" }), _jsx("button", { type: "button", disabled: disabled || !reason.trim() || nextStage === null
                                    || (task.phase === 'active' && !current.requiresResume && !current.stale), onClick: () => { phase('resume'); }, children: "\u6062\u590D\u4EFB\u52A1" })] }), _jsxs("label", { children: ["\u56DE\u9000\u5230\u9636\u6BB5", _jsx("select", { value: rewind, onChange: (event) => { setRewind(event.target.value); }, children: [...current.completedStages, ...nextStage === null ? [] : [nextStage]].map(stage => _jsx("option", { value: stage, children: stages[stage] }, stage)) })] }), _jsx("button", { type: "button", disabled: disabled || !reason.trim(), onClick: () => {
                            void updateTask({ ...common, action: 'rewind', stage: rewind, reason });
                        }, children: "\u56DE\u9000\u5E76\u4FDD\u7559\u5386\u53F2" })] })] });
}
//# sourceMappingURL=Tasks.js.map