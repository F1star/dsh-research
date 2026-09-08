/** Report attribution, stale findings, stable citation keys, and complete audit preservation. */

import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { ResearchAuthorId, ResearchClaimId, ResearchReadingNoteId, ResearchEvidenceTextHash, ResearchSynthesisId, ResearchFindingId,
  type ResearchClaimReview, type ResearchReadingNote, type ResearchFacet } from '../../src/research-information/index.ts'
import { renderReport } from '../../src/research-report/render.ts'
import { reportFixture } from './fixture.ts'

describe('research report rendering', () => {
  it('retains exact file identity when durable decoding reorders object properties', () => {
    const { question, papers } = reportFixture()
    const reorder = <T>(value: T): T => JSON.parse(JSON.stringify(value), (_key, item: unknown) =>
      item !== null && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).reverse()) : item) as T
    const report = renderReport(question, papers)
    expect(renderReport(reorder(question), reorder(papers))).toEqual(report)
    expect(renderReport({ ...question, title: 'Different report title' }, papers).digest).not.toBe(report.digest)
  })

  it('emits matching Markdown, LaTeX, BibTeX, CSL, and lossless audit records with deterministic file identity', () => {
    const { question, papers } = reportFixture()
    const report = renderReport(question, papers)
    const files = Object.fromEntries(report.files.map(file => [file.name, file.text]))
    const key = 'p11111111111141118111111111111111'
    expect(report.summary).toMatchObject({ currentClaims: 1, unreviewedClaims: 1, includedFindings: 1, missingFacetCount: 7 })
    expect(files['report.md']).toContain(`[@${key}]`)
    expect(files['report.tex']).toContain(`\\cite{${key}}`)
    expect(files['references.bib']).toContain(`@article{${key},`)
    expect(files['references.bib']).toContain('陈 \\& Smith')
    expect(files['references.bib']).not.toContain('\\input{untrusted}')
    expect(files['report.tex']).not.toContain('\\input{untrusted}')
    expect(JSON.parse(files['references.csl.json']!)).toMatchObject([{ id: key, 'citation-key': key,
      author: [{ literal: '陈 & Smith' }], issued: { 'date-parts': [[2026]] }, DOI: '10.1234/example' }])
    expect(JSON.parse(files['provenance.json']!)).toEqual({ format: 'research-report-audit', version: 1, question, papers })
    expect(files['report.md']).toContain('引用 1 条待审阅论断')
    expect(files['report.md']).toContain('原文第 1 页')
    expect(report.digest).toBe(`sha256:${createHash('sha256').update(JSON.stringify(report.files.map(file =>
      [file.name, file.mediaType, file.text]))).digest('hex')}`)
    expect(renderReport(question, papers)).toEqual(report)
    expect(report.files.every(file => file.text.endsWith('\n') && !file.text.endsWith('\n\n'))).toBe(true)
  })

  it('excludes findings citing rejected or replaced claims while preserving their complete audit history', () => {
    const { question, papers } = reportFixture()
    const claim = question.claims[0]!
    const rejected = { ...question, revision: 4, claimReviews: [{ id: 'review' as ResearchClaimReview['id'], claimId: claim.id,
      decision: 'rejected' as const, evidenceSupport: 'partial' as const, rationale: 'A condition is missing.', counterEvidenceIds: [],
      questionRevision: 4, createdBy: { kind: 'researcher' as const, id: ResearchAuthorId('reviewer') }, createdAt: question.updatedAt }] }
    const first = renderReport(rejected, papers)
    expect(first.summary).toMatchObject({ includedFindings: 0, excludedFindings: 1, rejectedClaims: 1, missingFacetCount: 8 })
    expect(first.files.find(file => file.name === 'report.md')?.text).toContain('已拒绝论断（不作为结论采用）')
    const revised = { ...question, revision: 4, claims: [...question.claims,
      { ...claim, id: ResearchClaimId('replacement'), supersedes: claim.id, text: 'Qualified result.' }] }
    const second = renderReport(revised, papers)
    expect(second.summary).toMatchObject({ currentClaims: 1, includedFindings: 0, excludedFindings: 1 })
    expect(JSON.parse(second.files.find(file => file.name === 'provenance.json')!.text)).toMatchObject({ question: revised })
  })

  it('does not invent authors, years, venues, evidence coverage, or a synthesis for empty input', () => {
    const { question } = reportFixture()
    const empty = { ...question, evidence: [], claims: [], syntheses: [] }
    const report = renderReport(empty, [])
    expect(report.summary).toMatchObject({ currentClaims: 0, evidenceCount: 0, includedFindings: 0, missingFacetCount: 0 })
    expect(report.files.find(file => file.name === 'references.csl.json')?.text).toBe('[]\n')
    expect(report.files.find(file => file.name === 'report.md')?.text).toContain('尚未捕获论文证据')
  })
})

it('preserves revised acceptance, support qualifications, counterevidence, and current note authorship', () => {
  const { question, papers } = reportFixture()
  const original = question.claims[0]!
  const replacement = { ...original, id: ResearchClaimId('replacement'), text: 'Qualified source statement', supersedes: original.id }
  const reviewer = { kind: 'researcher' as const, id: ResearchAuthorId('reviewer') }
  const review: ResearchClaimReview = { id: 'review' as ResearchClaimReview['id'], claimId: original.id,
    decision: 'revised', replacementClaimId: replacement.id, evidenceSupport: 'partial', rationale: 'Check conditions',
    qualifications: 'Only the reported split', counterEvidenceIds: [question.evidence[0]!.id], questionRevision: 4,
    createdBy: reviewer, createdAt: question.updatedAt }
  const note: ResearchReadingNote = { id: ResearchReadingNoteId('note'), evidenceId: question.evidence[0]!.id, kind: 'note',
    text: 'Old note', createdBy: reviewer, createdAt: question.updatedAt }
  const selected = '85.5%'
  const text = question.evidence[0]!.blockText
  const start = Buffer.byteLength(text.slice(0, text.indexOf(selected)))
  const prior = question.syntheses[0]!
  const updated = { ...question, revision: 6, claims: [original, replacement], claimReviews: [review],
    evidence: [{ ...question.evidence[0]!, selection: { text: selected, startUtf8Byte: start, endUtf8Byte: start + selected.length,
      textHash: ResearchEvidenceTextHash(`sha256:${createHash('sha256').update(selected).digest('hex')}`) } }],
    readingNotes: [note, { ...note, id: ResearchReadingNoteId('new-note'), text: 'Current note', supersedes: note.id },
      { ...note, id: ResearchReadingNoteId('question'), kind: 'passage-question' as const, text: 'Does this generalize?' }],
    syntheses: [prior, { ...prior, id: ResearchSynthesisId('new-synthesis'), supersedes: prior.id,
      findings: [{ ...prior.findings[0]!, id: ResearchFindingId('new-finding'), text: 'Current synthesis', claimIds: [replacement.id] }] }] }
  const report = renderReport(updated, papers)
  const markdown = report.files.find(file => file.name === 'report.md')!.text
  expect(report.summary).toMatchObject({ currentClaims: 1, unreviewedClaims: 0, includedFindings: 1, excludedFindings: 0 })
  for (const value of ['修改后接受', '部分支持', review.rationale, review.qualifications!, '记录的反证', 'Current note',
    'Does this generalize?', 'Current synthesis', '所引论断已获人工接受', '精确摘录：85.5%']) expect(markdown).toContain(value)
  expect(markdown).not.toContain('Old note')
  expect(markdown).not.toContain(prior.findings[0]!.text)
  expect(JSON.parse(report.files.find(file => file.name === 'provenance.json')!.text)).toMatchObject({ question: updated })
  const accepted = renderReport({ ...updated, revision: 7, claimReviews: [...updated.claimReviews, { ...review,
    id: 'second-review' as ResearchClaimReview['id'], claimId: replacement.id, decision: 'accepted', evidenceSupport: 'supports',
    qualifications: undefined, counterEvidenceIds: [], questionRevision: 7 }] }, papers)
  expect(accepted.files.find(file => file.name === 'report.md')!.text).toContain('人工接受；证据支持程度：支持')
})

it('labels uncited inference and missing metadata without conflating them with source coverage', () => {
  const { question, papers } = reportFixture()
  const facets: ResearchFacet[] = ['aim', 'method', 'dataset', 'metric', 'result', 'limitation', 'validity-threat', 'other']
  const claims = facets.map(facet => ({ ...question.claims[0]!, id: ResearchClaimId(facet), facet,
    ...(facet === 'other' ? { otherFacet: 'Implementation' } : {}) }))
  const inference = { ...question.claims[0]!, id: ResearchClaimId('inference'), kind: 'inference' as const, evidenceLinks: [] }
  const report = renderReport({ ...question, claims: [...claims, inference], syntheses: [{ ...question.syntheses[0]!,
    findings: [{ ...question.syntheses[0]!.findings[0]!, kind: 'inference', claimIds: [] }] }] },
  [{ ...papers[0]!, metadata: { title: papers[0]!.metadata.title },
    externalIds: [{ kind: 'arxiv', value: '2609.00001', origin: 'declared', addedAt: question.createdAt }] }])
  const markdown = report.files.find(file => file.name === 'report.md')!.text
  expect(report.summary.missingFacetCount).toBe(0)
  for (const value of ['每个固定维度均有', '作者推断', '未引用论断', '未引用证据', '其他 / Implementation',
    '书目信息未记录：作者、年份、发表载体']) expect(markdown).toContain(value)
  expect(JSON.parse(report.files.find(file => file.name === 'references.csl.json')!.text)).toEqual([
    { id: 'p11111111111141118111111111111111', 'citation-key': 'p11111111111141118111111111111111',
      type: 'article', title: papers[0]!.metadata.title.value, URL: 'https://arxiv.org/abs/2609.00001' },
  ])
})
