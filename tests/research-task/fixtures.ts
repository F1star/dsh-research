/** Real task-domain mutations, human review requirements, and recovery over retained scientific records. */

import { Context } from '@deepseek-ai/cordis'
import Storage from '@deepseek-ai/dsh-storage'
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain'
import ResearchDocuments from '../../src/research-document/index.ts'
import ResearchLibrary from '../../src/research-library/index.ts'
import ResearchInformation, { ResearchAuthorId, type ResearchQuestionId, type ResearchClaimId } from '../../src/research-information/index.ts'
import ResearchReport from '../../src/research-report/index.ts'
import { MemoryMediaPool, MemoryStorageBackend } from '../helpers/memory-backend.ts'
import ResearchTasks, { type Config } from '../../src/research-task/index.ts'
import type { ResearchTaskKind, ResearchTaskStage, ResearchTaskId, ResearchTaskSource, ResearchTaskMutationResult } from '../../src/research-task/types.ts'

export const author = { kind: 'agent' as const, id: ResearchAuthorId('research-agent') }
const researcher = { kind: 'researcher' as const, id: ResearchAuthorId('researcher') }

export async function mount(pool = new MemoryMediaPool(), config: Config = {}) {
  const ctx = new Context()
  try {
    await ctx.plugin(Storage)
    ctx.storage.backend.register('memory', new MemoryStorageBackend(pool))
    const facility = new DomainFacility(ctx, { backend: 'memory' })
    ctx.storage.mount('domain', facility)
    ctx.provide('storageDomain', facility)
    await ctx.plugin(ResearchDocuments)
    await ctx.plugin(ResearchLibrary)
    await ctx.plugin(ResearchInformation)
    await ctx.plugin(ResearchReport)
    await ctx.plugin(ResearchTasks, config)
    ctx.researchDocuments.registerParser({ id: 'fixture', available: () => true, supports: () => true,
      parse: async () => ({ parserVersion: 'v1', extraction: { text: 'native', layout: 'approximate' },
        pages: [{ pageIndex: 0, width: 100, height: 100, blocks: [{ kind: 'paragraph', text: 'The reported accuracy is 85.5%.',
          bbox: { x: 0, y: 0, width: 1, height: 1 } }] }] }) })
    return { ctx, pool }
  } catch (error) { await ctx.fiber.dispose(); throw error }
}

export function saved(result: ResearchTaskMutationResult) {
  if (result.status !== 'saved') throw new Error(JSON.stringify(result))
  return result.view
}

export async function create(ctx: Context, kind: ResearchTaskKind = 'single-paper') {
  const question = await ctx.researchInformation.writeQuestion({ action: 'create', title: 'Research task', question: 'What is supported?', author })
  if (question.status !== 'created') throw new Error(question.status)
  const view = saved(await ctx.researchTasks.create({ questionId: question.question.id, kind, author }))
  return { taskId: view.task.id, questionId: question.question.id }
}

export async function paper(ctx: Context, questionId: ResearchQuestionId, index: number) {
  const document = await ctx.researchDocuments.import({ bytes: Uint8Array.from([index]), mediaType: 'application/pdf' })
  const registered = await ctx.researchLibrary.register({ metadata: { title: `Paper ${index}`, origin: 'declared' },
    document: { documentId: document.id, mediaType: document.mediaType, parserId: document.parser.id,
      parserVersion: document.parser.version,
      extraction: document.extraction, pageCount: document.pageCount, blockCount: document.blockCount } })
  if (registered.status !== 'created' || registered.sourceVersionId === undefined) throw new Error(registered.status)
  const block = document.pages[0]!.blocks[0]!
  const capture = await ctx.researchInformation.captureEvidence({ questionId,
    expectedRevision: ctx.researchInformation.get(questionId)!.revision,
    paperId: registered.paper.id, sourceVersionId: registered.sourceVersionId, locator: block.locator,
    blockText: block.text, sectionPath: block.sectionPath, author })
  if (capture.status !== 'created') throw new Error(capture.status)
  const claim = await ctx.researchInformation.writeClaim({ questionId, expectedRevision: capture.question.revision,
    kind: 'source-statement', facet: 'result', text: 'The reported accuracy is 85.5%.',
    evidenceLinks: [{ evidenceId: capture.evidenceId, relation: 'supports' }], author })
  if (claim.status !== 'created') throw new Error(claim.status)
  return { source: { paperId: registered.paper.id, sourceVersionId: registered.sourceVersionId }, claimId: claim.claimId }
}

export async function checkpoint(ctx: Context, taskId: ResearchTaskId, stage: ResearchTaskStage,
  options: { sources?: readonly ResearchTaskSource[]; comparisonOutcome?: 'protocol' | 'not-comparable' } = {}) {
  const view = ctx.researchTasks.get(taskId)!
  return ctx.researchTasks.update({ taskId, expectedRevision: view.task.revision, expectedQuestionRevision: view.questionRevision,
    action: 'checkpoint', stage, summary: `Inspected ${stage}; limitations remain explicit.`, author, ...options })
}

export async function review(ctx: Context, questionId: ResearchQuestionId, claimId: ResearchClaimId, decision: 'accepted' | 'rejected' = 'accepted') {
  const result = await ctx.researchInformation.reviewClaim({ questionId,
    expectedRevision: ctx.researchInformation.get(questionId)!.revision,
    claimId, decision, evidenceSupport: decision === 'accepted' ? 'supports' : 'unsupported', rationale: 'Checked the captured source.',
    counterEvidenceIds: [], author: researcher })
  if (result.status !== 'created') throw new Error(result.status)
}
export async function synthesize(ctx: Context, questionId: ResearchQuestionId, claimIds: readonly ResearchClaimId[]) {
  const question = ctx.researchInformation.get(questionId)!
  const previous = question.syntheses.at(-1)
  const result = await ctx.researchInformation.writeSynthesis({ questionId, expectedRevision: question.revision,
    findings: [{ kind: claimIds.length > 0 ? 'source-summary' : 'inference', stance: 'qualification',
      text: 'The conclusion is limited to the captured evidence.', claimIds }],
    ...(previous === undefined ? {} : { supersedes: previous.id }), author })
  if (result.status !== 'created') throw new Error(result.status)
}
