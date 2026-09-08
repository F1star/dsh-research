/** Research task selection, authored checkpoints, and explicit recovery. */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ResearchWorkspaceTask, ResearchWorkspaceTaskProgress, ResearchWorkspaceTaskUpdateRequest,
  ResearchWorkspaceCatalog } from '../research-workspace/types.ts'
import type { WorkspaceController } from './controller.ts'
import css from './Workspace.module.css'

/** Task operations and a framework-bound view of the shared workspace. */
export interface TasksInjected {
  createQuestion: WorkspaceController['createQuestion']
  createTask: WorkspaceController['createTask']
  updateTask: WorkspaceController['updateTask']
  loadTasks: WorkspaceController['loadTasks']
  selectTask: WorkspaceController['selectTask']
  loadTaskHistory: WorkspaceController['loadTaskHistory']
  loadTaskSources: WorkspaceController['loadTaskSources']
  loadTaskIssues: WorkspaceController['loadTaskIssues']
  loadCatalog: WorkspaceController['load']
  hooks: { workspace: WorkspaceController }
}

/** Owner navigation plus the task registration's data and callbacks. */
export type TasksProps = PropsRuntime<'research.workspace.tasks'> & InjectFace<TasksInjected>

const kinds: Record<ResearchWorkspaceTask['kind'], string> = {
  'single-paper': '单篇精读', 'topic-review': '主题综述', 'method-comparison': '方法比较',
}
const phases: Record<ResearchWorkspaceTask['phase'], string> = {
  active: '进行中', paused: '已暂停', blocked: '等待处理', complete: '已完成，需核对当前有效性',
}
const stages: Record<NonNullable<ResearchWorkspaceTaskProgress['nextStage']>, string> = {
  acquisition: '选择来源', extraction: '提取证据', review: '人工审核', comparison: '确认可比性', synthesis: '形成综合', export: '导出报告',
}
const guidance: Record<NonNullable<ResearchWorkspaceTaskProgress['nextStage']>, string> = {
  acquisition: '选择本任务使用的论文来源版本。尚未入库的论文可先在对话中导入。',
  extraction: '在对话中为每个选定来源捕获精确原文，并记录有来源支持的论断。',
  review: '到证据与审阅、实验结果视图核对记录。已过期的获批结果需要修订或拒绝。',
  comparison: '记录基于已审核结果的可比协议，或明确说明这些结果为何不能直接比较。',
  synthesis: '在对话中记录有来源的综合发现，保留限定条件、冲突和开放问题。',
  export: '确认后保存当前报告的校验标识；请到报告导出视图下载文件并审阅整篇草稿。',
}

/**
 * @param props - task data, authored actions, and source-reader navigation.
 * @returns current task progress and historical checkpoints without implying automatic execution.
 */
export function Tasks({ useWorkspace, createQuestion, createTask, updateTask, loadTasks, selectTask,
  loadTaskHistory, loadTaskSources, loadTaskIssues, loadCatalog, openSource }: TasksProps): ReactNode {
  const state = useWorkspace(value => value)
  const question = state.claimPage?.question
  const [title, setTitle] = useState('')
  const [questionText, setQuestionText] = useState('')
  const [kind, setKind] = useState<ResearchWorkspaceTask['kind']>('single-paper')
  const questionForm = useRef<HTMLDetailsElement>(null)
  useEffect(() => { if (question !== undefined) void loadTasks(0) }, [question?.id, loadTasks])
  const current = state.task
  const disabled = state.busy || state.reviewerId === null
  return <section aria-label="科研任务">
    <h3>{question?.title ?? '创建科研任务'}</h3>
    <p>保存精读、综述和比较的阶段进度。对话负责执行科研工作；这里记录完成情况、等待事项和恢复位置。</p>
    <details ref={questionForm}><summary>新建研究问题</summary>
      <form className={css.reviewForm} onSubmit={(event) => {
        event.preventDefault()
        void createQuestion(title, questionText).then((saved) => {
          if (!saved) return
          setTitle(''); setQuestionText('')
          if (questionForm.current !== null) questionForm.current.open = false
        })
      }}>
        <label>问题标题<input required value={title} onChange={(event) => { setTitle(event.target.value) }} /></label>
        <label>研究问题内容<textarea required value={questionText} onChange={(event) => { setQuestionText(event.target.value) }} /></label>
        <button type="submit" disabled={disabled || !title.trim() || !questionText.trim()}>创建研究问题</button>
      </form>
    </details>
    {question === undefined ? <p>请从左侧选择研究问题，或登记署名后创建新问题。</p> : <>
      <form className={css.controls} onSubmit={(event) => { event.preventDefault(); void createTask(kind) }}>
        <label>任务类型<select value={kind} onChange={(event) => { setKind(event.target.value as ResearchWorkspaceTask['kind']) }}>
          {Object.entries(kinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <button type="submit" disabled={disabled}>创建科研任务</button>
        <button type="button" disabled={state.busy} onClick={() => { void loadTasks(0) }}>刷新任务列表</button>
      </form>
      <div className={css.taskList}>
        {state.tasks?.tasks.map((task, index) => <article className={css.paper} key={task.id}>
          <button type="button" disabled={state.busy} onClick={() => { void selectTask(task.id) }}>
            查看{kinds[task.kind]}任务 · {index + 1}
          </button>
          <p>已保存状态：{phases[task.phase]}</p>{task.reason ? <p>{task.reason}</p> : null}
        </article>)}
      </div>
      {state.tasks?.tasks.length === 0 ? <p>此问题尚无科研任务。</p> : null}
      {state.tasks?.nextOffset == null ? null : <button type="button" disabled={state.busy}
        onClick={() => { void loadTasks(state.tasks?.nextOffset ?? 0) }}>下一页任务</button>}
    </>}
    {state.taskReceipt === null ? null : <p role="status">任务已保存。
      <button type="button" disabled={state.busy} onClick={() => {
        if (state.taskReceipt !== null) void selectTask(state.taskReceipt.taskId)
      }}>刷新已保存任务</button>
    </p>}
    {current === null ? null : <>
      <section aria-label="当前任务进度">
        <h4>{kinds[current.task.kind]}</h4>
        <p>{current.stale ? '科学记录已变化，需要重新核对后续阶段。' : current.nextStage === null ? '全部阶段当前有效。' : `下一步：${stages[current.nextStage]}`}</p>
        {current.requiresResume ? <p>任务在重启前处于进行中，请显式恢复后继续。</p> : null}
        <p>当前有效的已完成阶段：{current.completedStages.map(stage => stages[stage]).join(' → ') || '尚无'}</p>
        {current.nextStage === null ? null : <p>{guidance[current.nextStage]}</p>}
        <button type="button" disabled={state.busy} onClick={() => { void selectTask(current.task.id) }}>刷新当前任务</button>
        {current.issues.length === 0 ? null : <details><summary>阶段核对提示（{current.issues.length}）</summary>
          <ul>{current.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
          {current.nextOffset === null ? null : <button type="button" disabled={state.busy}
            onClick={() => { void loadTaskIssues(current.nextOffset ?? 0) }}>更多核对提示</button>}
        </details>}
        <TaskActions key={`${current.task.id}:${current.task.revision}:${current.questionRevision}`} current={current}
          selectedSources={state.taskSelection} catalogQuery={state.catalogQuery}
          catalog={state.catalog} disabled={disabled} updateTask={updateTask} loadCatalog={loadCatalog} />
      </section>
      <section aria-label="任务来源">
        <h4>{state.taskSourceCheckpoint === null ? '当前选定来源' : '检查点保留的历史来源'}</h4>
        <button type="button" disabled={state.busy} onClick={() => { void loadTaskSources(null, 0) }}>查看当前来源</button>
        {state.taskSources?.sources.map(source => <p key={`${source.paperId}/${source.source.id}`}>
          <button type="button" disabled={state.busy} onClick={() => { openSource(source) }}>阅读来源：{source.title}</button>
        </p>)}
        {state.taskSources?.sources.length === 0 ? <p>尚未确认来源。</p> : null}
        {state.taskSources?.nextOffset == null ? null : <button type="button" disabled={state.busy}
          onClick={() => { void loadTaskSources(state.taskSourceCheckpoint, state.taskSources?.nextOffset ?? 0) }}>更多任务来源</button>}
      </section>
      <section aria-label="任务检查点历史">
        <h4>检查点历史</h4>
        {state.taskHistory?.checkpoints.map(checkpoint => <article key={checkpoint.taskRevision} className={css.paper}>
          <h5>{stages[checkpoint.stage]} · {checkpoint.effective ? '保留在当前流程中' : '历史记录'}</h5>
          <p>{checkpoint.summary}</p><p>来源 {checkpoint.sourceCount} 个 · 产物引用 {checkpoint.artifactCount} 项</p>
          <p>{checkpoint.createdBy.kind === 'researcher' ? '研究者' : 'Agent'} · <time dateTime={checkpoint.createdAt}>{checkpoint.createdAt}</time></p>
          <button type="button" disabled={state.busy} onClick={() => { void loadTaskSources(checkpoint.taskRevision, 0) }}>查看此检查点来源</button>
        </article>)}
        {state.taskHistory?.nextOffset == null ? null : <button type="button" disabled={state.busy}
          onClick={() => { void loadTaskHistory(state.taskHistory?.nextOffset ?? 0) }}>更多检查点</button>}
      </section>
    </>}
  </section>
}

function TaskActions({ current, selectedSources, catalog, catalogQuery, disabled, updateTask, loadCatalog }: {
  current: ResearchWorkspaceTaskProgress
  selectedSources: NonNullable<Extract<ResearchWorkspaceTaskUpdateRequest, { action: 'checkpoint' }>['sources']>
  catalog: ResearchWorkspaceCatalog | null
  catalogQuery: string
  disabled: boolean
  updateTask: WorkspaceController['updateTask']
  loadCatalog: WorkspaceController['load']
}): ReactNode {
  type Source = NonNullable<Extract<ResearchWorkspaceTaskUpdateRequest, { action: 'checkpoint' }>['sources']>[number]
  const [sources, setSources] = useState<readonly Source[]>(() => selectedSources)
  const [query, setQuery] = useState('')
  const [summary, setSummary] = useState('')
  const [reason, setReason] = useState('')
  const [outcome, setOutcome] = useState<'protocol' | 'not-comparable' | ''>('')
  const [rewind, setRewind] = useState(current.completedStages[0] ?? current.nextStage ?? 'acquisition')
  const { task, nextStage } = current
  const common = { taskId: task.id, expectedRevision: task.revision }
  const phase = (action: 'pause' | 'block' | 'resume') => { void updateTask({ ...common, action, reason }) }
  return <>
    {nextStage === null ? null : <form className={css.reviewForm} aria-label="确认任务阶段" onSubmit={(event) => {
      event.preventDefault()
      void updateTask({ ...common, action: 'checkpoint', expectedQuestionRevision: current.questionRevision,
        stage: nextStage, summary, ...(nextStage === 'acquisition' ? { sources } : {}),
        ...(nextStage === 'comparison' && outcome !== '' ? { comparisonOutcome: outcome } : {}) })
    }}>
      {nextStage !== 'acquisition' ? null : <fieldset><legend>选择任务来源</legend>
        <div className={css.controls}><label>筛选任务文献<input type="search" value={query}
          onChange={(event) => { setQuery(event.target.value) }} /></label>
        <button type="button" disabled={disabled} onClick={() => { void loadCatalog(query, 0) }}>查找任务文献</button></div>
        {catalog?.papers.flatMap(paper => paper.sources.map((source, index) => {
          const checked = sources.some(value => value.paperId === paper.id && value.sourceVersionId === source.id)
          return <label className={css.taskSourceChoice} key={`${paper.id}/${source.id}`}>
            <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => {
              setSources(event.target.checked ? [...sources, { paperId: paper.id, sourceVersionId: source.id }]
                : sources.filter(value => value.paperId !== paper.id || value.sourceVersionId !== source.id))
            }} />{paper.title} · 来源 {index + 1}
          </label>
        }))}
        <p>已选择 {sources.length} 个来源；翻页保留选择。</p>
        {catalog?.nextOffset == null ? null : <button type="button" disabled={disabled}
          onClick={() => { void loadCatalog(catalogQuery, catalog.nextOffset ?? 0) }}>下一页任务文献</button>}
      </fieldset>}
      {nextStage !== 'comparison' ? null : <label>可比性决定<select required value={outcome}
        onChange={(event) => { setOutcome(event.target.value as typeof outcome) }}>
        <option value="">请选择</option><option value="protocol">使用已记录的可比协议</option>
        <option value="not-comparable">不可直接比较，并在总结中说明原因</option>
      </select></label>}
      <label>阶段总结<textarea required value={summary} onChange={(event) => { setSummary(event.target.value) }} /></label>
      <button type="submit" disabled={disabled || !summary.trim() || current.stale || current.requiresResume || task.phase !== 'active'}>
        确认{stages[nextStage]}完成
      </button>
    </form>}
    <div className={css.reviewForm}>
      <label>任务调整说明<textarea value={reason} onChange={(event) => { setReason(event.target.value) }} /></label>
      <div className={css.controls}>
        <button type="button" disabled={disabled || !reason.trim() || task.phase === 'complete'} onClick={() => { phase('pause') }}>暂停任务</button>
        <button type="button" disabled={disabled || !reason.trim() || task.phase === 'complete'} onClick={() => { phase('block') }}>标记等待处理</button>
        <button type="button" disabled={disabled || !reason.trim() || nextStage === null
          || (task.phase === 'active' && !current.requiresResume && !current.stale)} onClick={() => { phase('resume') }}>恢复任务</button>
      </div>
      <label>回退到阶段<select value={rewind} onChange={(event) => { setRewind(event.target.value as typeof rewind) }}>
        {[...current.completedStages, ...nextStage === null ? [] : [nextStage]].map(stage =>
          <option key={stage} value={stage}>{stages[stage]}</option>)}
      </select></label>
      <button type="button" disabled={disabled || !reason.trim()} onClick={() => {
        void updateTask({ ...common, action: 'rewind', stage: rewind, reason })
      }}>回退并保留历史</button>
    </div>
  </>
}
