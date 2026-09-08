/** Fixed report inputs with source provenance and characters meaningful to Markdown and TeX. */

import { createHash } from 'node:crypto'
import { ResearchDocumentId, ResearchDocumentBlockId, ResearchDocumentQuoteHash } from '../../src/research-document/index.ts'
import { ResearchPaperId, ResearchSourceVersionId, type ResearchPaperRecord } from '../../src/research-library/index.ts'
import { ResearchAuthorId, ResearchQuestionId, ResearchEvidenceId, ResearchClaimId, ResearchSynthesisId, ResearchFindingId,
  type ResearchQuestionRecord } from '../../src/research-information/index.ts'

/**
 * @returns a source-backed question whose draft includes one current synthesis finding.
 */
export function reportFixture(): { question: ResearchQuestionRecord; papers: ResearchPaperRecord[] } {
  const time = '2026-09-08T00:00:00.000Z'
  const author = { kind: 'agent' as const, id: ResearchAuthorId('fixture-agent') }
  const paperId = ResearchPaperId('11111111-1111-4111-8111-111111111111')
  const sourceId = ResearchSourceVersionId('22222222-2222-4222-8222-222222222222')
  const documentId = ResearchDocumentId(`sha256:${'a'.repeat(64)}`)
  const text = 'Observed accuracy: 85.5% under the stated conditions. 原文结果。'
  const evidenceId = ResearchEvidenceId('33333333-3333-4333-8333-333333333333')
  const claimId = ResearchClaimId('44444444-4444-4444-8444-444444444444')
  const paper: ResearchPaperRecord = { id: paperId, metadata: {
    title: { value: 'Study & comparison: \\input{untrusted} _ 85.5%', origin: 'declared' },
    authors: { value: ['陈 & Smith'], origin: 'declared' }, year: { value: 2026, origin: 'declared' },
    venue: { value: 'Research Journal', origin: 'declared' },
  }, externalIds: [{ kind: 'doi', value: '10.1234/example', origin: 'declared', addedAt: time }],
  acquisitionState: 'imported', sourceVersions: [{ id: sourceId, documentId, state: 'imported', aliases: [], observations: [{
    parserId: 'fixture', parserVersion: 'v1', mediaType: 'application/pdf', extraction: { text: 'native', layout: 'approximate' },
    pageCount: 1, blockCount: 1, observedAt: time,
  }], createdAt: time, updatedAt: time }], createdAt: time, updatedAt: time }
  const question: ResearchQuestionRecord = { id: ResearchQuestionId('55555555-5555-4555-8555-555555555555'), revision: 3,
    title: '科研报告：结果与限制', question: '结论是否受到原文支持？', createdBy: author, updatedBy: author,
    createdAt: time, updatedAt: time,
    evidence: [{ id: evidenceId, paperId, sourceVersionId: sourceId, blockText: text, sectionPath: ['Results'],
      locator: { kind: 'block', documentId, blockId: ResearchDocumentBlockId(`block:${'b'.repeat(64)}`), parserId: 'fixture',
        parserVersion: 'v1', pageIndex: 0, bbox: { x: 0, y: 0, width: 1, height: 1 },
        quoteHash: ResearchDocumentQuoteHash(`sha256:${createHash('sha256').update(text).digest('hex')}`) }, createdBy: author, createdAt: time }],
    claims: [{ id: claimId, kind: 'source-statement', facet: 'result', text: '在报告条件下准确率为 85.5%。',
      evidenceLinks: [{ evidenceId, relation: 'supports' }], createdBy: author, createdAt: time }], claimReviews: [], observationReviews: [], readingNotes: [],
    syntheses: [{ id: ResearchSynthesisId('66666666-6666-4666-8666-666666666666'), findings: [{
      id: ResearchFindingId('77777777-7777-4777-8777-777777777777'), kind: 'source-summary', stance: 'qualification',
      text: '结果仅适用于文中条件。', claimIds: [claimId], comparisonProtocolIds: [],
    }], createdBy: author, createdAt: time }], entities: [], observations: [], comparisonProtocols: [],
  }
  return { question, papers: [paper] }
}
