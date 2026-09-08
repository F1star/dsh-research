/** Revision-pinned report service over durable research information and bibliographic metadata. */

import { Service, type Context } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import type {} from '../research-information/index.ts'
import type {} from '../research-library/index.ts'
import type { ResearchReportRequest, ResearchReportResult } from './types.ts'
import { renderReport } from './render.ts'

export type * from './types.ts'

/** Complete export capacity; no report text is silently clipped. */
export interface Config {
  /** Maximum UTF-8 JSON bytes of a complete ready result. Defaults to 8388608. */
  readonly maxReportBytes?: number
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    researchReport: ResearchReport
  }
}

/** Renders a deterministic draft and exact audit files without changing scientific records. */
export class ResearchReport extends Service {
  static inject = ['researchInformation', 'researchLibrary']
  /** Complete-result byte limit, validated when the plugin loads. */
  static Config: s<Config> = s.object({ maxReportBytes: s.number().step(1).min(1).default(8388608) })
  private readonly maxReportBytes: number

  /**
   * @param ctx - durable question and paper services.
   * @param config - complete export capacity.
   */
  constructor(ctx: Context, config: Config = {}) {
    super(ctx, 'researchReport')
    this.maxReportBytes = config.maxReportBytes ?? 8388608
    if (!Number.isSafeInteger(this.maxReportBytes) || this.maxReportBytes < 1) {
      throw new TypeError('maxReportBytes must be a positive safe integer')
    }
  }

  /**
   * Render all report formats from the exact inspected question and current library metadata.
   * @param request - question identity and inspected revision.
   * @returns complete files or a non-writing refusal; the audit file preserves the complete question history.
   */
  render(request: ResearchReportRequest): ResearchReportResult {
    if (!Number.isSafeInteger(request.expectedRevision) || request.expectedRevision < 0) {
      throw new TypeError('expectedRevision must be a non-negative safe integer')
    }
    const question = this.ctx.researchInformation.get(request.questionId)
    if (question === undefined) return { status: 'question-not-found' }
    if (question.revision !== request.expectedRevision) return { status: 'stale-revision', currentRevision: question.revision }
    const papers = new Map(this.ctx.researchLibrary.list().map(paper => [paper.id, paper]))
    const selected = [...new Set(question.evidence.map(evidence => evidence.paperId))].map((id) => {
      const paper = papers.get(id)
      if (paper === undefined) throw new Error('Report evidence references an unavailable paper')
      return paper
    })
    const result = { status: 'ready' as const, bundle: renderReport(question, selected) }
    return Buffer.byteLength(JSON.stringify(result)) <= this.maxReportBytes
      ? result : { status: 'capacity', maxReportBytes: this.maxReportBytes }
  }
}

export default ResearchReport
