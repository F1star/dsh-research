/** Research library and source-reading panel, composed into the sidebar action slot. */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { InjectFace, PropsRuntime, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { ResearchWorkspaceReviewRequest, ResearchWorkspaceReviewer, ResearchWorkspaceNotes, ResearchWorkspaceNoteRequest, ResearchWorkspaceClaimFilter } from '../research-workspace/types.ts'
import type { WorkspaceController } from './controller.ts'
import css from './Workspace.module.css'

/** Callbacks and observable bound by the registration, without exposing the controller. */
export interface WorkspaceInjected {
  loadObservations: WorkspaceController['loadObservations']
  prepareReport: WorkspaceController['prepareReport']
  loadNotes: WorkspaceController['loadNotes']
  loadMatrix: WorkspaceController['loadMatrix']
  submitNote: WorkspaceController['submitNote']
  loadQuestions: WorkspaceController['loadQuestions']
  loadClaims: WorkspaceController['loadClaims']
  selectClaim: WorkspaceController['selectClaim']
  loadEvidenceChoices: WorkspaceController['loadEvidenceChoices']
  readEvidence: WorkspaceController['readEvidence']
  loadReviews: WorkspaceController['loadReviews']
  chooseReviewer: WorkspaceController['chooseReviewer']
  registerReviewer: WorkspaceController['registerReviewer']
  submitReview: WorkspaceController['submitReview']
  openEvidence: WorkspaceController['openEvidence']
  load: WorkspaceController['load']
  openPaper: WorkspaceController['open']
  turn: WorkspaceController['turn']
  moreBlocks: WorkspaceController['moreBlocks']
  hooks: { workspace: WorkspaceController }
}

/** Framework owner props plus the registration's data-access face. */
export type WorkspaceProps = PropsRuntime<'sidebar.footer.action'>
  & PropsRenderSlots<'research.workspace.observations' | 'research.workspace.tasks'> & InjectFace<WorkspaceInjected>

/**
 * @param props - slot owner and injected workspace callbacks.
 * @returns the research action and its modal reading workspace.
 */
export function Workspace({ renderSlot, loadObservations, wide, load, openPaper, turn, moreBlocks, useWorkspace,
  loadQuestions, loadClaims, selectClaim, loadEvidenceChoices, readEvidence, loadReviews,
  chooseReviewer, registerReviewer, submitReview, openEvidence, loadNotes, loadMatrix, submitNote, prepareReport,
}: WorkspaceProps): ReactNode {
  const state = useWorkspace(value => value)
  const dialog = useRef<HTMLDialogElement>(null)
  const reviewPanel = useRef<HTMLElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'library' | 'review' | 'notes' | 'matrix' | 'report' | 'observations' | 'tasks'>('library')
  const [noteText, setNoteText] = useState('')
  const [noteKind, setNoteKind] = useState<ResearchWorkspaceNoteRequest['kind']>('note')
  const [editingNote, setEditingNote] = useState<ResearchWorkspaceNotes['notes'][number] | null>(null)
  useEffect(() => { if (reviewPanel.current !== null) reviewPanel.current.scrollTop = 0 }, [mode])
  const [reviewerName, setReviewerName] = useState('')
  const [decision, setDecision] = useState<ResearchWorkspaceReviewRequest['decision']>('accepted')
  const [evidenceSupport, setEvidenceSupport] = useState<ResearchWorkspaceReviewRequest['evidenceSupport']>('uncertain')
  const [rationale, setRationale] = useState('')
  const [qualifications, setQualifications] = useState('')
  const [replacementText, setReplacementText] = useState('')
  const [counterEvidenceIds, setCounterEvidenceIds] = useState<ResearchWorkspaceReviewRequest['counterEvidenceIds']>([])
  const [replacementLinks, setReplacementLinks] = useState<Extract<ResearchWorkspaceReviewRequest, { decision: 'revised' }>['replacement']['evidenceLinks']>([])
  const selected = state.selectedClaim
  const claimPage = state.claimPage
  const nextClaimOffset = claimPage?.nextOffset ?? null
  const nextEvidenceOffset = state.evidenceChoices?.nextOffset ?? null
  const nextReviewOffset = state.reviews?.nextOffset ?? null
  useEffect(() => {
    setDecision('accepted'); setEvidenceSupport('uncertain'); setRationale(''); setQualifications('')
    setCounterEvidenceIds([]); setReplacementText(selected?.claim.text ?? '')
    setReplacementLinks(selected?.claim.evidenceLinks ?? [])
  }, [selected])
  useEffect(() => {
    if (open) {
      dialog.current?.showModal()
      void load('', 0)
    } else dialog.current?.close()
  }, [open, load])
  useEffect(() => { setNoteText(''); setEditingNote(null); setNoteKind('note') }, [state.claimPage?.question.id])
  const reading = state.reading
  return <>
    <button className={css.trigger} type="button" title="科研工作区" aria-haspopup="dialog" aria-expanded={open} onClick={() => {
      setQuery(''); setMode('library'); setOpen(true)
    }}>
      {wide ? '科研工作区' : '科研'}
    </button>
    <dialog ref={dialog} className={css.dialog} aria-label="科研工作区" onCancel={() => { setOpen(false) }}>
      <header className={css.header}>
        <div><h2>科研工作区</h2><p>文献与原文 · 机器提取内容需要审阅</p></div>
        <button type="button" onClick={() => { setOpen(false) }}>返回对话</button>
      </header>
      <nav className={css.controls} aria-label="科研工作区视图">
        <button type="button" aria-pressed={mode === 'tasks'} disabled={state.busy} onClick={() => {
          setMode('tasks'); void loadQuestions(0)
        }}>科研任务</button>
        <button type="button" aria-pressed={mode === 'library'} onClick={() => { setMode('library') }}>文献阅读</button>
        <button type="button" aria-pressed={mode === 'review'} disabled={state.busy} onClick={() => {
          setMode('review'); void loadQuestions(0)
        }}>证据与审阅</button>
        <button type="button" aria-pressed={mode === 'notes'} disabled={state.busy || claimPage === null}
          onClick={() => { setMode('notes'); void loadNotes(0) }}>阅读笔记</button>
        <button type="button" aria-pressed={mode === 'matrix'} disabled={state.busy || claimPage === null}
          onClick={() => { setMode('matrix'); void loadMatrix(0) }}>证据矩阵</button>
        <button type="button" aria-pressed={mode === 'observations'} disabled={state.busy || claimPage === null}
          onClick={() => { setMode('observations'); void loadObservations(0) }}>实验结果</button>
        <button type="button" aria-pressed={mode === 'report'} disabled={state.busy || claimPage === null}
          onClick={() => { setMode('report') }}>报告导出</button>
      </nav>
      {state.error === null ? null : <p className={css.error} role="alert">{state.error}</p>}
      {mode === 'library' ? <div className={css.body} aria-busy={state.busy}>
        <aside className={css.library}>
          <form onSubmit={(event) => {
            event.preventDefault(); void load(query, 0)
          }}>
            <label>查找文献<input type="search" value={query} onChange={(event) => { setQuery(event.target.value) }} /></label>
            <button type="submit" disabled={state.busy}>搜索</button>
          </form>
          <p>{state.catalog === null ? '正在读取文献库…' : `${state.catalog.total} 篇文献`}</p>
          {state.catalog?.papers.length === 0 ? <p>尚无匹配文献。可在对话中导入 PDF 并登记到文献库。</p> : null}
          {state.catalog?.papers.map(paper => <article className={css.paper} key={paper.id}>
            <h3>{paper.title}</h3><p>{paper.authors.join('、')}{paper.year === null ? '' : ` · ${paper.year}`}</p>
            {paper.sources.length === 0 ? <p>尚未导入全文</p> : paper.sources.map((source, index) =>
              <button type="button" key={source.id} disabled={state.busy} onClick={() => { void openPaper(paper, source) }}>
                {paper.sources.length === 1 ? '打开原文' : `打开来源 ${index + 1}`}
              </button>)}
          </article>)}
          {state.catalog?.nextOffset == null ? null : <button type="button" disabled={state.busy}
            onClick={() => { void load(state.catalogQuery, state.catalog?.nextOffset ?? 0) }}>下一页文献</button>}
          <button type="button" disabled={state.busy} onClick={() => { void load(state.catalogQuery, 0) }}>刷新文献库</button>
        </aside>
        <main className={css.reader}>
          {reading === null ? <div className={css.empty}>选择一篇文献，查看原始 PDF 和可追溯的提取文本。</div> : <>
            <div className={css.controls}>
              <strong>{reading.title}</strong>
              <button type="button" disabled={state.busy || reading.page.pageIndex === 0}
                onClick={() => { void turn(reading.page.pageIndex - 1) }}>上一页</button>
              <span>第 {reading.page.pageIndex + 1} / {reading.page.pageCount} 页</span>
              <button type="button" disabled={state.busy || reading.page.pageIndex + 1 >= reading.page.pageCount}
                onClick={() => { void turn(reading.page.pageIndex + 1) }}>下一页</button>
              <a href={reading.sourceUrl} download="paper.pdf">下载原始 PDF</a>
            </div>
            <div className={css.pages}>
              <iframe key={`${reading.sourceUrl}:${reading.page.pageIndex}`} title="原始 PDF"
                className={css.pdf} src={`${reading.sourceUrl}#page=${reading.page.pageIndex + 1}`} />
              <section className={css.extraction} aria-label="本页提取文本">
                <h3>本页提取文本</h3><p>页码按钮会保存阅读位置。PDF 内部滚动不会同步页码。</p>
                {reading.page.blocks.length === 0 ? <p>本页没有可读取的提取文本。</p> : null}
                {reading.page.blocks.map(block => <article key={block.id}>
                  {block.structureKind === null ? null : <span className={css.badge}>
                    {block.structureKind === 'table' ? '表格' : block.structureKind === 'formula' ? '公式' : '图表／图片'} · 待审阅
                  </span>}
                  <p>{block.text || '该对象没有提取文本，请查看原文。'}</p>
                  {block.textTruncated ? <small>文本预览已截断，请查看原文或使用完整读取工具。</small> : null}
                  <details><summary>原文定位</summary><code>{block.id}</code><p>第 {reading.page.pageIndex + 1} 页</p></details>
                </article>)}
                {reading.page.nextOffset === null ? null : <button disabled={state.busy} type="button"
                  onClick={() => { void moreBlocks() }}>显示本页更多文本</button>}
              </section>
            </div>
          </>}
        </main>
      </div> : <div className={css.body} aria-busy={state.busy}>
        <aside className={css.library} aria-label="研究问题">
          <h3>研究问题</h3>
          {state.questions?.questions.map(question => <article className={css.paper} key={question.id}>
            <button type="button" disabled={state.busy} onClick={() => { setMode(mode === 'tasks' ? 'tasks' : 'review'); void loadClaims(question.id, 0) }}>{question.title}</button>
            <p>{question.claimCount} 条论断</p>
          </article>)}
          {state.questions?.questions.length === 0 ? <p>可在科研任务中创建研究问题，并在对话中捕获证据。</p> : null}
          {state.questions?.nextOffset == null ? null : <button type="button" disabled={state.busy}
            onClick={() => { void loadQuestions(state.questions?.nextOffset ?? 0) }}>下一页问题</button>}
          {claimPage === null || mode !== 'review' ? null : <>
            <h3>{claimPage.question.title}</h3><p>{claimPage.question.question}</p>
            {state.claimFilter === null ? null : <p>矩阵筛选：{facetLabels[state.claimFilter.facet]}。刷新论断可返回全部记录。</p>}
            <button type="button" disabled={state.busy} onClick={() => { void loadClaims(claimPage.question.id, 0) }}>刷新论断</button>
            {claimPage.claims.map(value => <article className={css.paper} key={value.claim.id}>
              <button type="button" disabled={state.busy} onClick={() => { void selectClaim(value) }}>{value.claim.text}</button>
              <p>{value.active ? '当前论断' : '历史论断'} · {value.latestReview === null ? '待人工审阅' : reviewLabels[value.latestReview.decision]}</p>
            </article>)}
            {nextClaimOffset === null ? null : <button type="button" disabled={state.busy}
              onClick={() => { void loadClaims(claimPage.question.id, nextClaimOffset, state.claimFilter ?? undefined) }}>下一页论断</button>}
          </>}
        </aside>
        <main ref={reviewPanel} className={css.review}>
          {mode === 'matrix' || mode === 'report' ? null : <section aria-label="本地审阅身份">
            <h3>本地审阅身份</h3><p>请选择本次决定的署名。这是本地登记身份，不是远程用户认证。</p>
            <label>审阅人<select value={state.reviewerId ?? ''} disabled={state.busy} onChange={(event) => {
              chooseReviewer(event.target.value ? event.target.value as ResearchWorkspaceReviewer['id'] : null)
            }}><option value="">请选择审阅人</option>{state.reviewers.map(value =>
                <option value={value.id} key={value.id}>{value.displayName} · {value.id.slice(0, 8)}</option>)}</select></label>
            <form className={css.controls} onSubmit={(event) => { event.preventDefault(); void registerReviewer(reviewerName) }}>
              <label>新审阅人姓名<input required value={reviewerName} onChange={(event) => { setReviewerName(event.target.value) }} /></label>
              <button type="submit" disabled={state.busy || !reviewerName.trim()}>登记审阅人</button>
            </form>
          </section>}
          {mode === 'observations' ? renderSlot('research.workspace.observations', {}) : null}
          {mode === 'tasks' ? renderSlot('research.workspace.tasks', { openSource: (source) => {
            setMode('library'); void openPaper({ title: source.title }, source.source)
          } }) : null}
          {mode === 'report' ? <section aria-label="报告导出">
            <h3>{claimPage?.question.title ?? '科研报告'}</h3>
            <p>生成带引用的科研草稿。正文标记待审阅论断，排除引用历史或已拒绝论断的综合结论；整份报告仍需人工审阅。</p>
            <p>审计附件包含完整问题历史及书目信息，包括未采纳内容。导出文件保留生成时的记录快照。</p>
            <div className={css.controls}>
              <button type="button" disabled={state.busy || claimPage === null} onClick={() => { void prepareReport() }}>生成报告与引用文件</button>
              <button type="button" disabled={state.busy || claimPage === null} onClick={() => {
                if (claimPage !== null) void loadClaims(claimPage.question.id, 0)
              }}>刷新研究问题</button>
            </div>
            {state.report === null ? <p>生成后可预览正文并下载五个配套文件。</p> : <>
              <p>问题修订 {state.report.revision} · 当前论断 {state.report.summary.currentClaims} 条 ·
                待审阅 {state.report.summary.unreviewedClaims} 条 · 已拒绝 {state.report.summary.rejectedClaims} 条</p>
              <p>纳入综合发现 {state.report.summary.includedFindings} 条 · 未纳入 {state.report.summary.excludedFindings} 条 ·
                证据 {state.report.summary.evidenceCount} 条 · 论文维度覆盖缺口 {state.report.summary.missingFacetCount} 项</p>
              <nav className={css.controls} aria-label="报告文件下载">
                {state.reportDownloads.map(file => <a key={file.name} href={file.url} download={file.name}>{file.name}</a>)}
              </nav>
              <p>Markdown 引用使用配套 CSL-JSON；LaTeX 使用配套 BibTeX，可用 XeLaTeX 和 BibTeX 编译。保留配套文件名。</p>
              <details><summary>文件校验标识</summary><code>{state.report.digest}</code></details>
              <h3>Markdown 正文预览</h3>
              <pre className={css.reportPreview}>{state.report.files.find(file => file.name === 'report.md')?.text}</pre>
            </>}
          </section> : null}
          {mode === 'matrix' ? <section aria-label="证据矩阵">
            <h3>{state.matrix?.question.title ?? '证据矩阵'}</h3>
            <p>按论文和研究维度统计当前来源表述。未记录表示尚未保存相关表述，不代表论文没有涉及或提供了反证。人工接受不等于科学结论已获证实。</p>
            <p>推断不计入来源矩阵：{state.matrix?.excludedInferenceCount ?? 0} 条。数值比较仍需明确核对实验条件。</p>
            <div className={css.matrixScroll}><table className={css.matrix}>
              <caption>来源表述覆盖与人工审阅状态</caption>
              <thead><tr><th scope="col">论文</th>{Object.entries(facetLabels).map(([facet, label]) => <th scope="col" key={facet}>{label}</th>)}</tr></thead>
              <tbody>{state.matrix?.rows.map(row => <tr key={row.paperId}><th scope="row">{row.title}</th>
                {row.cells.map(cell => <td key={cell.facet}>{cell.total === 0 ? '未记录' : <>
                  <button type="button" disabled={state.busy} aria-label={`${row.title} · ${facetLabels[cell.facet]} · ${cell.total} 条来源表述`}
                    onClick={() => {
                      if (state.matrix === null) return
                      setMode('review'); void loadClaims(state.matrix.question.id, 0, { paperId: row.paperId, facet: cell.facet })
                    }}>
                    {cell.total} 条来源表述</button>
                  <p>接受 {cell.accepted} · 拒绝 {cell.rejected} · 待审阅 {cell.unreviewed}</p>
                </>}</td>)}</tr>)}</tbody>
            </table></div>
            {state.matrix?.rows.length === 0 ? <p>这个问题尚未捕获论文证据。</p> : null}
            {state.matrix?.nextOffset == null ? null : <button type="button" disabled={state.busy}
              onClick={() => { void loadMatrix(state.matrix?.nextOffset ?? 0) }}>下一页矩阵</button>}
            <button type="button" disabled={state.busy} onClick={() => { void loadMatrix(0) }}>刷新矩阵</button>
          </section> : null}
          {mode === 'notes' ? <section aria-label="阅读笔记">
            <h3>{state.notes?.question.title ?? '阅读笔记'}</h3>
            <p>笔记和段落问题是署名解读，原文证据单独保留；修改会保留旧版本。</p>
            <button type="button" disabled={state.busy} onClick={() => { void loadNotes(0) }}>刷新笔记</button>
            {state.notes?.notes.length === 0 ? <p>尚无阅读笔记。请先选择下方的原文证据。</p> : null}
            {state.notes?.notes.map(value => <article className={css.paper} key={value.note.id}>
              <p>{value.note.kind === 'note' ? '笔记' : '段落问题'} · {value.active ? '当前版本' : '历史版本'} ·{' '}
                {state.reviewers.find(reviewer => reviewer.id === value.note.createdBy.id)?.displayName ??
                  (value.note.createdBy.kind === 'agent' ? '智能体' : value.note.createdBy.id)} · {value.note.createdAt}</p>
              <p className={css.exactText}>{value.note.text}</p>
              <button type="button" disabled={state.busy} onClick={() => { void readEvidence(value.note.evidenceId) }}>查看笔记原文</button>
              <button type="button" disabled={state.busy || !value.active} onClick={() => {
                setEditingNote(value); setNoteKind(value.note.kind); setNoteText(value.note.text); void readEvidence(value.note.evidenceId)
              }}>修订笔记</button>
            </article>)}
            {state.notes?.nextOffset == null ? null : <button type="button" disabled={state.busy}
              onClick={() => { void loadNotes(state.notes?.nextOffset ?? 0) }}>下一页笔记</button>}
            <details open><summary>选择笔记关联的原文</summary>
              {state.evidenceChoices?.evidence.map(choice => <article className={css.paper} key={choice.id}>
                <button type="button" disabled={state.busy} aria-pressed={state.evidence?.id === choice.id}
                  onClick={() => { void readEvidence(choice.id) }}>选择原文 · 第 {choice.pageIndex + 1} 页</button>
                <p>{choice.excerpt}{choice.excerptTruncated ? '（预览已截断）' : ''}</p>
              </article>)}
              {nextEvidenceOffset === null ? null : <button type="button" disabled={state.busy}
                onClick={() => { void loadEvidenceChoices(nextEvidenceOffset) }}>下一页笔记证据</button>}
              <button type="button" disabled={state.busy} onClick={() => { void loadEvidenceChoices(0) }}>回到首批笔记证据</button>
            </details>
            <form aria-label="保存阅读笔记" className={css.reviewForm} onSubmit={(event) => {
              event.preventDefault()
              if (state.notes === null || state.evidence === null) return
              void submitNote({ questionId: state.notes.question.id, expectedRevision: state.notes.question.revision,
                kind: noteKind, text: noteText, evidenceId: state.evidence.id,
                ...(editingNote === null ? {} : { supersedes: editingNote.note.id }) }).then((saved) => {
                if (saved) { setNoteText(''); setEditingNote(null); setNoteKind('note') }
              })
            }}>
              <h3>{editingNote === null ? '新增笔记' : '修订笔记并保留历史'}</h3>
              <label>笔记类型<select value={noteKind} disabled={state.busy || editingNote !== null}
                onChange={(event) => { setNoteKind(event.target.value as typeof noteKind) }}>
                <option value="note">阅读笔记</option><option value="passage-question">段落问题</option>
              </select></label>
              <p>{state.evidence === null ? '尚未选择原文。' : `已关联原文第 ${state.evidence.locator.pageIndex + 1} 页。`}
                段落问题需要带有精确摘录的证据。</p>
              <label>笔记内容<textarea required disabled={state.busy} value={noteText}
                onChange={(event) => { setNoteText(event.target.value) }} /></label>
              <button type="submit" disabled={state.busy || state.notes === null || state.reviewerId === null || state.evidence === null
                || !noteText.trim() || (noteKind === 'passage-question' && state.evidence.selection === undefined)}>保存笔记</button>
              {editingNote === null ? null : <button type="button" disabled={state.busy}
                onClick={() => { setEditingNote(null); setNoteText(''); setNoteKind('note') }}>取消修订</button>}
            </form>
          </section> : null}
          {(mode === 'review' && selected !== null) || mode === 'notes' || mode === 'observations' ? <>
            <section aria-label="完整证据"><h3>完整证据</h3>
              {state.evidence === null ? <p>选择一条证据查看原文。</p> : <>
                <p>原文第 {state.evidence.locator.pageIndex + 1} 页</p>
                {state.evidence.selection === undefined ? null : <blockquote>{state.evidence.selection.text}</blockquote>}
                <p className={css.exactText}>{state.evidence.blockText}</p>
                <button type="button" disabled={state.busy} onClick={() => {
                  void openEvidence().then((opened) => { if (opened) setMode('library') })
                }}>打开证据所在 PDF 页</button>
                <details><summary>来源与版本</summary><p>{state.evidence.locator.documentId}</p>
                  <p>{state.evidence.locator.parserId} · {state.evidence.locator.parserVersion}</p>
                  <p>{state.evidence.locator.blockId}</p></details>
              </>}
            </section>
          </> : null}
          {mode !== 'review' ? null : selected === null ? <p>选择一条论断，核对完整证据后保存审阅决定。</p> : <>
            <section aria-label="待审阅论断"><h3>论断</h3><p>{selected.claim.text}</p>
              <p>{selected.claim.kind === 'source-statement' ? '来源表述' : '推断'} · {selected.active ? '当前版本' : '历史版本，不能再次审阅'}</p>
              {selected.claim.evidenceLinks.map((link, index) => <button type="button" key={`${link.evidenceId}:${link.relation}`}
                disabled={state.busy} onClick={() => { void readEvidence(link.evidenceId) }}>
                证据 {index + 1} · {relationLabels[link.relation]}</button>)}
              {selected.claim.evidenceLinks.length === 0 ? <p>这条推断没有引用证据。</p> : null}
            </section>
            <form aria-label="保存人工审阅" className={css.reviewForm} onSubmit={(event) => {
              event.preventDefault()
              const question = state.claimPage?.question
              if (question === undefined) return
              const base = { questionId: question.id, expectedRevision: question.revision, claimId: selected.claim.id,
                evidenceSupport, rationale, counterEvidenceIds, ...(qualifications.trim() ? { qualifications } : {}) }
              void submitReview(decision === 'revised'
                ? { ...base, decision, replacement: { text: replacementText, evidenceLinks: replacementLinks } }
                : { ...base, decision })
            }}>
              <h3>人工决定</h3>
              <label>审阅决定<select value={decision} onChange={(event) => { setDecision(event.target.value as typeof decision) }}>
                <option value="accepted">接受</option><option value="revised">修改后接受</option><option value="rejected">拒绝</option>
              </select></label>
              <label>证据支持程度<select value={evidenceSupport}
                onChange={(event) => { setEvidenceSupport(event.target.value as typeof evidenceSupport) }}>
                <option value="uncertain">尚不能确定</option><option value="supports">支持</option>
                <option value="partial">部分支持</option><option value="unsupported">不支持</option>
              </select></label>
              <label>审阅理由<textarea required value={rationale} onChange={(event) => { setRationale(event.target.value) }} /></label>
              <label>限定条件与遗漏<textarea value={qualifications} onChange={(event) => { setQualifications(event.target.value) }} /></label>
              {decision !== 'revised' ? null : <>
                <label>修订后的论断<textarea required value={replacementText}
                  onChange={(event) => { setReplacementText(event.target.value) }} /></label>
                <p>保留原论断的类型与研究维度。请核对修订后的证据关系。</p>
                {replacementLinks.map((link, index) => <div className={css.controls} key={`${link.evidenceId}:${index}`}>
                  <button type="button" disabled={state.busy} onClick={() => { void readEvidence(link.evidenceId) }}>查看修订证据 {index + 1}</button>
                  <label>证据关系 {index + 1}<select value={link.relation} onChange={(event) => {
                    setReplacementLinks(replacementLinks.map((value, position) => position === index
                      ? { ...value, relation: event.target.value as typeof link.relation } : value))
                  }}>
                    {Object.entries(relationLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select></label>
                  <button type="button" onClick={() => { setReplacementLinks(replacementLinks.filter((_, position) => position !== index)) }}>移除此引用</button>
                </div>)}
              </>}
              <details><summary>选择反证或补充引用（已选 {counterEvidenceIds.length} 条反证）</summary>
                {state.evidenceChoices?.evidence.map(choice => <article className={css.paper} key={choice.id}>
                  <button type="button" disabled={state.busy} onClick={() => { void readEvidence(choice.id) }}>查看完整证据 · 第 {choice.pageIndex + 1} 页</button>
                  <p>{choice.excerpt}{choice.excerptTruncated ? '（预览已截断）' : ''}</p>
                  <label><input type="checkbox" checked={counterEvidenceIds.includes(choice.id)} onChange={(event) => {
                    setCounterEvidenceIds(event.target.checked
                      ? [...counterEvidenceIds, choice.id] : counterEvidenceIds.filter(id => id !== choice.id))
                  }} />记录为反证</label>
                  {decision !== 'revised' ? null : <button type="button" disabled={replacementLinks.some(link => link.evidenceId === choice.id)}
                    onClick={() => { setReplacementLinks([...replacementLinks, { evidenceId: choice.id, relation: 'supports' }]) }}>加入修订引用</button>}
                </article>)}
                {nextEvidenceOffset === null ? null : <button type="button" disabled={state.busy}
                  onClick={() => { void loadEvidenceChoices(nextEvidenceOffset) }}>下一页证据</button>}
                <button type="button" disabled={state.busy} onClick={() => { void loadEvidenceChoices(0) }}>回到首批证据</button>
              </details>
              <button type="submit" disabled={state.busy || !selected.active || state.reviewerId === null || !rationale.trim()}>保存审阅决定</button>
            </form>
            <section aria-label="审阅历史"><h3>审阅历史</h3>
              {state.reviews?.reviews.length === 0 ? <p>尚无人工决定。</p> : null}
              {state.reviews?.reviews.map(review => <article className={css.paper} key={review.id}>
                <strong>{reviewLabels[review.decision]} · {supportLabels[review.evidenceSupport]}</strong>
                <p>{state.reviewers.find(value => value.id === review.createdBy.id)?.displayName ?? review.createdBy.id}
                  {' · '}{review.createdAt}</p>
                <p className={css.exactText}>{review.rationale}</p><p className={css.exactText}>{review.qualifications}</p>
                {review.counterEvidenceIds.map((id, index) => <button type="button" key={id} disabled={state.busy}
                  onClick={() => { void readEvidence(id) }}>查看反证 {index + 1}</button>)}
              </article>)}
              {nextReviewOffset === null ? null : <button type="button" disabled={state.busy}
                onClick={() => { void loadReviews(nextReviewOffset) }}>更多审阅历史</button>}
            </section>
          </>}
        </main>
      </div>}
    </dialog>
  </>
}

const reviewLabels = { accepted: '已接受', rejected: '已拒绝', revised: '已修订' } as const
const supportLabels = { supports: '支持', partial: '部分支持', unsupported: '不支持', uncertain: '尚不能确定' } as const
const relationLabels = { supports: '支持', contradicts: '反驳', qualifies: '限定', background: '背景' } as const

const facetLabels: Record<ResearchWorkspaceClaimFilter['facet'], string> = {
  aim: '研究目标', method: '方法', dataset: '数据集', metric: '指标', result: '结果',
  limitation: '局限', 'validity-threat': '有效性威胁', other: '其他',
}
