/** Pure report projection and text rendering; scientific authorship remains in the input records. */
import { createHash } from 'node:crypto';
import { Cite } from '@citation-js/core';
import '@citation-js/plugin-bibtex';
import stableStringify from 'fast-json-stable-stringify';
import { observationReport } from "./observations.js";
import { researchObservationState } from "../research-information/index.js";
const facets = {
    aim: '研究目标', method: '方法', dataset: '数据集', metric: '指标', result: '结果',
    limitation: '局限', 'validity-threat': '有效性威胁', other: '其他',
};
const decisions = { accepted: '人工接受', revised: '修改后接受', rejected: '人工拒绝' };
const support = { supports: '支持', partial: '部分支持', unsupported: '不支持', uncertain: '尚不能确定' };
const relations = { supports: '支持', contradicts: '反驳', qualifies: '限定', background: '背景' };
const stances = { agreement: '一致', conflict: '冲突', qualification: '限定', 'open-question': '开放问题' };
/**
 * Render reproducible report and citation files from a complete question snapshot.
 * @param question - exact durable question revision, including superseded records.
 * @param papers - every paper referenced by the question's captured evidence, in first-evidence order.
 * @returns all formats with a digest of their exact contents; no records are mutated.
 */
export function renderReport(question, papers) {
    const evidence = new Map(question.evidence.map(value => [value.id, value]));
    const superseded = new Set(question.claims.flatMap(claim => claim.supersedes === undefined ? [] : [claim.supersedes]));
    const currentClaims = question.claims.filter(claim => !superseded.has(claim.id));
    const claims = new Map(currentClaims.map(claim => [claim.id, claim]));
    const retiredProtocols = new Set(question.comparisonProtocols.flatMap(value => value.supersedes === undefined ? [] : [value.supersedes]));
    const protocols = new Map(question.comparisonProtocols.map(value => [value.id, value]));
    const observationStates = new Map(question.observations.map(value => [value.id, researchObservationState(question, value)]));
    const reviews = new Map();
    for (const review of question.claimReviews) {
        reviews.set(review.claimId, review);
        if (review.decision === 'revised')
            reviews.set(review.replacementClaimId, review);
    }
    const citeClaim = (claim) => [...new Set(claim.evidenceLinks.map((link) => {
            const source = evidence.get(link.evidenceId);
            /* v8 ignore next -- information startup and claim writes require same-question evidence. */
            if (source === undefined)
                throw new Error('Claim references unavailable evidence');
            return citationKey(source.paperId);
        }))];
    const reviewText = (claim) => {
        const review = reviews.get(claim.id);
        return review === undefined ? '待人工审阅' : `${decisions[review.decision]}；证据支持程度：${support[review.evidenceSupport]}`;
    };
    const sections = [];
    const section = (title) => { const value = { title, paragraphs: [] }; sections.push(value); return value; };
    const add = (target, text, citations = []) => { target.paragraphs.push({ text, citations }); };
    const overview = section('研究问题与报告范围');
    add(overview, question.question);
    add(overview, `问题标识：${question.id}；修订：${question.revision}。本报告是待整体审阅的科研草稿。人工接受论断不等于科学结论已获证实，也不批准综合段落的全部措辞。`);
    add(overview, '正文呈现当前综合结论及来源表述。引用历史或已拒绝论断的综合结论不纳入正文；待审阅内容明确标记。provenance.json 保留完整问题历史和书目信息快照，包括未采纳记录。');
    const synthesis = section('综合结论');
    const omitted = section('未纳入正文的综合结论');
    const replacedSyntheses = new Set(question.syntheses.flatMap(value => value.supersedes === undefined ? [] : [value.supersedes]));
    let includedFindings = 0;
    let excludedFindings = 0;
    for (const value of question.syntheses) {
        if (replacedSyntheses.has(value.id))
            continue;
        for (const finding of value.findings) {
            const invalid = finding.claimIds.filter(id => !claims.has(id) || reviews.get(id)?.decision === 'rejected');
            const invalidProtocols = finding.comparisonProtocolIds.filter(id => {
                const protocol = protocols.get(id);
                return protocol === undefined || retiredProtocols.has(id) || protocol.observationIds.some(observationId => {
                    const state = observationStates.get(observationId);
                    return state === undefined || !state.active || state.stale || state.review?.decision === 'rejected' || state.rejectedClaimIds.length > 0;
                });
            });
            if (invalid.length > 0 || invalidProtocols.length > 0) {
                excludedFindings++;
                add(omitted, `发现 ${finding.id}：引用已替代、缺失或被拒绝的论断（${invalid.join('、')}）或不可采用的比较协议（${invalidProtocols.join('、')}）。原文及作者记录保留在审计附件。`);
                continue;
            }
            const referenced = finding.claimIds.map((id) => {
                const claim = claims.get(id);
                /* v8 ignore next -- the preceding invalid-reference filter requires every current claim. */
                if (claim === undefined)
                    throw new Error('Finding references an unavailable current claim');
                return claim;
            });
            includedFindings++;
            const unreviewed = referenced.filter(claim => !reviews.has(claim.id)).length;
            const status = referenced.length === 0 ? '未引用论断' : unreviewed > 0 ? `引用 ${unreviewed} 条待审阅论断` : '所引论断已获人工接受';
            add(synthesis, `${finding.kind === 'source-summary' ? '来源综合' : '作者推断'} · ${stances[finding.stance]} · ${status}：${finding.text}`, [...new Set(referenced.flatMap(citeClaim))]);
            add(synthesis, `综合作者：${value.createdBy.kind} / ${value.createdBy.id}；时间：${value.createdAt}；发现标识：${finding.id}。`);
            for (const id of finding.comparisonProtocolIds) {
                const protocol = protocols.get(id);
                add(synthesis, `比较依据 / Comparison basis：${id}；成员：${protocol.observationIds.join('、')}；理由：${protocol.compatibilityRationale}。这是作者记录的兼容性判断，不证明统计显著性。`);
            }
        }
    }
    if (includedFindings === 0)
        add(synthesis, '尚无可纳入正文的当前综合结论。');
    if (excludedFindings === 0)
        add(omitted, '没有因引用失效或被拒绝而排除的当前综合结论。');
    const statements = section('当前来源表述与推断');
    const rejected = section('已拒绝论断（不作为结论采用）');
    for (const claim of currentClaims) {
        const review = reviews.get(claim.id);
        const target = review?.decision === 'rejected' ? rejected : statements;
        add(target, `${facets[claim.facet]}${claim.otherFacet === undefined ? '' : ` / ${claim.otherFacet}`} · ${claim.kind === 'source-statement' ? '来源表述' : '作者推断'} · ${reviewText(claim)}：${claim.text}`, citeClaim(claim));
        add(target, `论断 ${claim.id}；作者：${claim.createdBy.kind} / ${claim.createdBy.id}；时间：${claim.createdAt}。`);
        if (claim.evidenceLinks.length === 0)
            add(target, '未引用证据；不能作为论文原文陈述。');
        for (const link of claim.evidenceLinks)
            add(target, `证据 ${link.evidenceId}：${relations[link.relation]}。定位和精确文本见证据附录。`);
        if (review !== undefined) {
            add(target, `审阅人：${review.createdBy.id}；时间：${review.createdAt}；理由：${review.rationale}`);
            if (review.qualifications !== undefined)
                add(target, `限定条件：${review.qualifications}`);
            if (review.counterEvidenceIds.length > 0)
                add(target, `记录的反证：${review.counterEvidenceIds.join('、')}。完整内容见证据附录。`);
        }
    }
    if (currentClaims.length === 0)
        add(statements, '尚无论断。');
    if (!currentClaims.some(claim => reviews.get(claim.id)?.decision === 'rejected'))
        add(rejected, '没有当前被拒绝的论断。');
    const results = section('结构化结果与比较条件');
    for (const paragraph of observationReport(question))
        add(results, paragraph.text, paragraph.paperIds.map(citationKey));
    const notes = section('阅读笔记（署名解读）');
    const replacedNotes = new Set(question.readingNotes.flatMap(note => note.supersedes === undefined ? [] : [note.supersedes]));
    for (const note of question.readingNotes) {
        if (replacedNotes.has(note.id))
            continue;
        const source = evidence.get(note.evidenceId);
        /* v8 ignore next -- information startup and note writes require same-question evidence. */
        if (source === undefined)
            throw new Error('Note references unavailable evidence');
        add(notes, `${note.kind === 'note' ? '笔记' : '段落问题'}：${note.text}`, [citationKey(source.paperId)]);
        add(notes, `作者：${note.createdBy.kind} / ${note.createdBy.id}；时间：${note.createdAt}；证据：${note.evidenceId}。`);
    }
    if (notes.paragraphs.length === 0)
        add(notes, '尚无当前阅读笔记。');
    const gaps = section('覆盖缺口与审阅提醒');
    const unreviewedClaims = currentClaims.filter(claim => !reviews.has(claim.id)).length;
    const rejectedClaims = currentClaims.filter(claim => reviews.get(claim.id)?.decision === 'rejected').length;
    add(gaps, `当前论断 ${currentClaims.length} 条；待人工审阅 ${unreviewedClaims} 条；已拒绝 ${rejectedClaims} 条；未纳入正文的当前综合发现 ${excludedFindings} 条。`);
    add(gaps, '覆盖只针对本问题已捕获证据的论文；未记录不表示论文没有涉及，不表示反证，也不保证文献检索已经完整。');
    let missingFacetCount = 0;
    for (const paper of papers) {
        const captured = new Set(question.evidence.filter(value => value.paperId === paper.id).map(value => value.id));
        const recorded = new Set(currentClaims.filter(claim => claim.kind === 'source-statement'
            && reviews.get(claim.id)?.decision !== 'rejected' && claim.evidenceLinks.some(link => captured.has(link.evidenceId))).map(claim => claim.facet));
        const missing = Object.keys(facets).filter(facet => !recorded.has(facet));
        missingFacetCount += missing.length;
        add(gaps, `${paper.metadata.title.value}：${missing.length === 0 ? '每个固定维度均有当前未被拒绝的来源表述' : `尚无可采用来源表述的维度：${missing.map(facet => facets[facet]).join('、')}`}。`, [citationKey(paper.id)]);
        const missingMetadata = [paper.metadata.authors === undefined ? '作者' : '', paper.metadata.year === undefined ? '年份' : '',
            paper.metadata.venue === undefined ? '发表载体' : ''].filter(Boolean);
        if (missingMetadata.length > 0)
            add(gaps, `书目信息未记录：${missingMetadata.join('、')}；导出不会补写或推测这些字段。`, [citationKey(paper.id)]);
    }
    if (papers.length === 0)
        add(gaps, '尚未捕获论文证据，无法评估论文维度覆盖。');
    add(gaps, `审计附件保留 ${question.observations.length} 条结构化观测和 ${question.comparisonProtocols.length} 条比较协议（含历史记录）。结果的独立审核状态及当前比较条件见正文；历史版本和全部审核决定保留在附件中。`);
    const appendix = section('证据附录');
    for (const value of question.evidence) {
        add(appendix, `证据 ${value.id}；原文第 ${value.locator.pageIndex + 1} 页。`, [citationKey(value.paperId)]);
        add(appendix, `来源版本：${value.sourceVersionId}；文档：${value.locator.documentId}；解析：${value.locator.parserId} / ${value.locator.parserVersion}；文本块：${value.locator.blockId}。`);
        if (value.selection !== undefined)
            add(appendix, `精确摘录：${value.selection.text}`);
        add(appendix, `完整原文块：${value.blockText}`);
    }
    const references = papers.map(toCsl);
    const bibliography = new Cite(references.map(value => ({ ...value,
        ...(value.author === undefined ? {} : { author: value.author.map(name => ({ literal: escapeLatex(name.literal) })) }),
    }))).format('bibtex');
    // Storage decoders can reorder properties without changing scientific records.
    const audit = JSON.parse(stableStringify({ format: 'research-report-audit', version: 1, question, papers }));
    const files = [
        { name: 'report.md', mediaType: 'text/markdown', text: markdown(question.title, sections, papers) },
        { name: 'report.tex', mediaType: 'application/x-tex', text: latex(question.title, sections) },
        { name: 'references.bib', mediaType: 'application/x-bibtex', text: bibliography.trimEnd() + '\n' },
        { name: 'references.csl.json', mediaType: 'application/vnd.citationstyles.csl+json', text: JSON.stringify(references, null, 2) + '\n' },
        { name: 'provenance.json', mediaType: 'application/json', text: JSON.stringify(audit, null, 2) + '\n' },
    ];
    return { questionId: question.id, revision: question.revision,
        digest: `sha256:${createHash('sha256').update(JSON.stringify(files.map(file => [file.name, file.mediaType, file.text]))).digest('hex')}`, files,
        summary: { currentClaims: currentClaims.length, unreviewedClaims, rejectedClaims, includedFindings, excludedFindings,
            evidenceCount: question.evidence.length, missingFacetCount } };
}
function citationKey(id) { return `p${id.replaceAll('-', '')}`; }
function toCsl(paper) {
    const doi = paper.externalIds.find(value => value.kind === 'doi')?.value;
    const arxiv = paper.externalIds.find(value => value.kind === 'arxiv')?.value;
    return { id: citationKey(paper.id), 'citation-key': citationKey(paper.id), type: 'article', title: paper.metadata.title.value,
        ...(paper.metadata.authors === undefined ? {} : { author: paper.metadata.authors.value.map(literal => ({ literal })) }),
        ...(paper.metadata.year === undefined ? {} : { issued: { 'date-parts': [[paper.metadata.year.value]] } }),
        ...(paper.metadata.venue === undefined ? {} : { 'container-title': paper.metadata.venue.value }),
        ...(doi === undefined ? {} : { DOI: doi }),
        ...(arxiv === undefined ? {} : { URL: `https://arxiv.org/abs/${encodeURIComponent(arxiv)}` }),
    };
}
function markdown(title, sections, papers) {
    const lines = ['---', 'bibliography: references.csl.json', '---', '', `# ${escapeMarkdown(title)}`, ''];
    for (const section of sections) {
        lines.push(`## ${section.title}`, '');
        for (const paragraph of section.paragraphs) {
            lines.push(`${escapeMarkdown(paragraph.text)}${paragraph.citations.length === 0 ? '' : ` [${paragraph.citations.map(key => `@${key}`).join('; ')}]`}`, '');
        }
    }
    lines.push('## 参考文献索引', '');
    for (const paper of papers)
        lines.push(`- ${citationKey(paper.id)}：${escapeMarkdown(paper.metadata.title.value)}。`, '');
    return lines.join('\n').trimEnd() + '\n';
}
function escapeMarkdown(text) {
    return text.replace(/[\\`*_{}\[\]<>#+!|~]/gu, '\\$&').replace(/^(\s*)([-=]|\d+[.)])(?=\s|$)/gmu, '$1\\$2');
}
function latex(title, sections) {
    const lines = [String.raw `\documentclass[UTF8]{ctexart}`, String.raw `\usepackage{hyperref}`, String.raw `\usepackage{xurl}`, String.raw `\urlstyle{same}`,
        String.raw `\usepackage[margin=2.5cm]{geometry}`, `\\title{${escapeLatex(title)}}`, String.raw `\author{Research Harness}`,
        String.raw `\date{}`, String.raw `\begin{document}`, String.raw `\maketitle`];
    for (const section of sections) {
        lines.push(`\\section{${escapeLatex(section.title)}}`);
        for (const paragraph of section.paragraphs) {
            lines.push(latexParagraph(paragraph.text) + (paragraph.citations.length === 0 ? '' : `\\cite{${paragraph.citations.join(',')}}`), '');
        }
    }
    lines.push(String.raw `\bibliographystyle{plain}`, String.raw `\bibliography{references}`, String.raw `\end{document}`);
    return lines.join('\n') + '\n';
}
function escapeLatex(text) {
    const escapes = {
        '\\': String.raw `\textbackslash{}`, '{': String.raw `\{`, '}': String.raw `\}`, '$': String.raw `\$`, '&': String.raw `\&`,
        '#': String.raw `\#`, '%': String.raw `\%`, '_': String.raw `\_`, '^': String.raw `\textasciicircum{}`, '~': String.raw `\textasciitilde{}`,
    };
    return text.replace(/[\\{}$&#%_^~]/gu, character => escapes[character]);
}
function latexParagraph(text) {
    const identifiers = /((?:sha256:|block:)[a-f0-9]{64}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})/gu;
    return text.split(identifiers).map((part, index) => index % 2 === 0 ? escapeLatex(part) : `\\nolinkurl{${part}}`).join('');
}
//# sourceMappingURL=render.js.map