/**
 * Deterministic Markdown projection for one retained research synthesis.
 * @module @f1star/dsh-research/tool-research-information/review-render
 */

import type {
  ResearchClaim,
  ResearchComparisonProtocol,
  ResearchEvidence,
  ResearchEntity,
  ResearchObservation,
  ResearchObservationConditions,
  ResearchObservationReportedContext,
  ResearchObservationUncertainty,
  ResearchObservationUnit,
  ResearchQuestionRecord,
  ResearchSynthesis,
  ResearchSynthesisId,
} from '../research-information/index.ts'
import type {
  ResearchPaperId,
  ResearchPaperRecord,
} from '../research-library/index.ts'

/** Current ability to verify durable evidence against an imported document. */
export type ResearchReviewEvidenceCoverage =
  | 'readable'
  | 'needs-ocr'
  | 'reimport-required'
  | 'parser-mismatch'
  | 'locator-mismatch'

/** Stable warning codes emitted by the review renderer. */
export const RESEARCH_REVIEW_WARNING_CODES = [
  'question-not-found',
  'synthesis-not-found',
  'synthesis-inactive',
  'stale-claim-reference',
  'claim-not-found',
  'evidence-not-found',
  'comparison-protocol-not-found',
  'comparison-protocol-inactive',
  'comparison-protocol-stale',
  'observation-not-found',
  'source-summary-without-supporting-evidence',
  'uncited-inference-finding',
  'paper-not-found',
  'bibliography-incomplete',
  'evidence-not-currently-readable',
  'review-too-large',
] as const

/** One actionable limitation of a rendered review. */
export interface ResearchReviewWarning {
  readonly code: typeof RESEARCH_REVIEW_WARNING_CODES[number]
  readonly message: string
  readonly findingId?: string
  readonly claimId?: string
  readonly evidenceId?: string
  readonly paperId?: string
  readonly comparisonProtocolId?: string
  readonly observationId?: string
}

/** Read-only dependencies owned by the mounted research services. */
export interface ResearchReviewRenderDependencies {
  /**
   * Return current bibliographic metadata for one durable paper identity.
   * @param paperId - durable paper identity referenced by evidence.
   * @returns current paper metadata, or `undefined` if the record is absent.
   */
  paper(paperId: ResearchPaperId): ResearchPaperRecord | undefined
  /**
   * Inspect whether one durable evidence anchor is currently reproducible.
   * @param evidence - durable evidence whose locator should be checked.
   * @returns current reproducibility status.
   */
  evidenceCoverage(evidence: ResearchEvidence): ResearchReviewEvidenceCoverage
}

/** Safety and disclosure policy for one deterministic review projection. */
export interface ResearchReviewRenderOptions {
  readonly includeSelectedQuotes: boolean
  readonly maxCharacters: number
  readonly maxWarnings: number
}

/** Complete deterministic projection before model-output paging. */
export interface ResearchReviewRenderResult {
  readonly status: 'ready' | 'ready-with-warnings' | 'not-ready'
  readonly questionId: string
  readonly synthesisId: string
  readonly warnings: readonly ResearchReviewWarning[]
  readonly markdown?: string
}

/**
 * Render one explicit active synthesis without generating new prose or changing durable state.
 * @param question - durable question aggregate, or `undefined` when the id is absent.
 * @param synthesisId - explicit synthesis selected by the caller.
 * @param dependencies - current library metadata and evidence reproducibility checks.
 * @param options - output disclosure and complete-render safety limits.
 * @returns readiness, warnings, and deterministic Markdown when the synthesis is active.
 */
export function renderResearchReview(
  question: ResearchQuestionRecord | undefined,
  synthesisId: ResearchSynthesisId,
  dependencies: ResearchReviewRenderDependencies,
  options: ResearchReviewRenderOptions,
): ResearchReviewRenderResult {
  if (question === undefined) {
    return notReady('', synthesisId, {
      code: 'question-not-found',
      message: 'The research question does not exist.',
    })
  }
  const synthesis = question.syntheses.find(value => value.id === synthesisId)
  if (synthesis === undefined) {
    return notReady(question.id, synthesisId, {
      code: 'synthesis-not-found',
      message: `Synthesis ${synthesisId} does not belong to question ${question.id}.`,
    })
  }
  const activeSyntheses = activeSynthesisIds(question)
  if (!activeSyntheses.has(synthesis.id)) {
    return notReady(question.id, synthesis.id, {
      code: 'synthesis-inactive',
      message: `Synthesis ${synthesis.id} has been superseded; select an active synthesis.`,
    })
  }

  try {
    const state = new ReviewRenderState(question, synthesis, dependencies, options)
    const markdown = state.render()
    return {
      status: state.warnings.length === 0 ? 'ready' : 'ready-with-warnings',
      questionId: question.id,
      synthesisId: synthesis.id,
      warnings: state.warnings,
      markdown,
    }
  } catch (error) {
    if (!(error instanceof ReviewTooLargeError)) throw error
    return notReady(question.id, synthesis.id, {
      code: 'review-too-large',
      message: `The complete review exceeds its configured ${error.kind} limit; narrow the synthesis or raise the deployment limit.`,
    })
  }
}

function notReady(
  questionId: string,
  synthesisId: ResearchSynthesisId,
  warning: ResearchReviewWarning,
): ResearchReviewRenderResult {
  return {
    status: 'not-ready',
    questionId,
    synthesisId,
    warnings: [warning],
  }
}

class ReviewRenderState {
  readonly warnings: ResearchReviewWarning[] = []
  private readonly warningKeys = new Set<string>()
  private readonly claimById: ReadonlyMap<string, ResearchClaim>
  private readonly evidenceById: ReadonlyMap<string, ResearchEvidence>
  private readonly comparisonProtocolById: ReadonlyMap<string, ResearchComparisonProtocol>
  private readonly observationById: ReadonlyMap<string, ResearchObservation>
  private readonly entityById: ReadonlyMap<string, ResearchEntity>
  private readonly activeClaims: ReadonlySet<string>
  private readonly activeObservations: ReadonlySet<string>
  private readonly activeComparisonProtocols: ReadonlySet<string>
  private readonly staleObservations: ReadonlySet<string>
  private readonly evidenceNumbers = new Map<string, number>()
  private readonly evidence: ResearchEvidence[] = []
  private readonly paperNumbers = new Map<string, number>()
  private readonly papers: ResearchPaperId[] = []
  private readonly comparisonProtocolNumbers = new Map<string, number>()
  private readonly comparisonProtocols: ResearchComparisonProtocol[] = []
  private readonly observationNumbers = new Map<string, number>()
  private readonly observations: ResearchObservation[] = []
  private readonly observationEvidenceReferences = new Map<string, readonly string[]>()
  private readonly lines: MarkdownLines

  constructor(
    private readonly question: ResearchQuestionRecord,
    private readonly synthesis: ResearchSynthesis,
    private readonly dependencies: ResearchReviewRenderDependencies,
    private readonly options: ResearchReviewRenderOptions,
  ) {
    this.claimById = new Map(question.claims.map(value => [value.id, value]))
    this.evidenceById = new Map(question.evidence.map(value => [value.id, value]))
    this.comparisonProtocolById = new Map(
      question.comparisonProtocols.map(value => [value.id, value]),
    )
    this.observationById = new Map(question.observations.map(value => [value.id, value]))
    this.entityById = new Map(question.entities.map(value => [value.id, value]))
    this.activeClaims = activeClaimIds(question)
    this.activeObservations = activeObservationIds(question)
    this.activeComparisonProtocols = activeComparisonProtocolIds(question)
    this.staleObservations = staleObservationIds(question, this.activeClaims)
    this.lines = new MarkdownLines(options.maxCharacters)
  }

  render(): string {
    const lines = this.lines
    lines.push(
      `# ${markdownInline(this.question.title)}`,
      '',
      `**Research question:** ${markdownInline(this.question.question)}`,
      '',
      `**Synthesis:** \`${this.synthesis.id}\``,
      '',
      'This document deterministically renders retained research records. It does not generate new findings.',
      '',
      '## Findings',
    )
    for (const [index, finding] of this.synthesis.findings.entries()) {
      lines.push('', `### ${index + 1}. ${finding.stance}`)
      lines.push('', finding.kind === 'inference' ? '**[Inference]**' : '**[Source summary]**')
      lines.push('', markdownParagraph(finding.text))
      if (finding.claimIds.length === 0) {
        lines.push('', '_No claim references._')
        if (finding.kind === 'inference' && finding.comparisonProtocolIds.length === 0) {
          this.warn(
            `uncited-finding:${finding.id}`,
            {
              code: 'uncited-inference-finding',
              message: `Inference finding ${finding.id} has no claim references.`,
              findingId: finding.id,
            },
          )
        }
        if (finding.comparisonProtocolIds.length === 0) continue
      } else {
        lines.push('', 'Claims:')
        for (const claimId of finding.claimIds) {
          const claim = this.claimById.get(claimId)
          if (claim === undefined) {
            lines.push(`- **[Missing claim]** \`${claimId}\``)
            this.warn(`missing-claim:${claimId}`, {
              code: 'claim-not-found',
              message: `Finding ${finding.id} references missing claim ${claimId}.`,
              findingId: finding.id,
              claimId,
            })
            continue
          }
          const active = this.activeClaims.has(claim.id)
          if (!active) {
            this.warn(`stale-claim:${finding.id}:${claim.id}`, {
              code: 'stale-claim-reference',
              message: `Finding ${finding.id} references superseded claim ${claim.id}.`,
              findingId: finding.id,
              claimId: claim.id,
            })
          }
          const label = claim.kind === 'inference' ? '[Inference claim]' : '[Source statement]'
          lines.push(`- **${label}${active ? '' : ' [Superseded]'}** ${markdownInline(claim.text)}`)
          if (claim.evidenceLinks.length === 0) {
            lines.push('  - Evidence: none recorded.')
            if (finding.kind === 'source-summary') {
              this.warn(`unsupported-summary:${finding.id}:${claim.id}`, {
                code: 'source-summary-without-supporting-evidence',
                message: `Source-summary finding ${finding.id} references claim ${claim.id} without a supports or qualifies evidence relation.`,
                findingId: finding.id,
                claimId: claim.id,
              })
            }
            continue
          }
          const links: string[] = []
          let hasSupportingEvidence = false
          for (const link of claim.evidenceLinks) {
            const evidence = this.evidenceById.get(link.evidenceId)
            if (evidence === undefined) {
              links.push(`missing \`${link.evidenceId}\` (${link.relation})`)
              this.warn(`missing-evidence:${claim.id}:${link.evidenceId}`, {
                code: 'evidence-not-found',
                message: `Claim ${claim.id} references missing evidence ${link.evidenceId}.`,
                claimId: claim.id,
                evidenceId: link.evidenceId,
              })
              continue
            }
            const number = this.addEvidence(evidence)
            links.push(`[E${number}](#evidence-e${number}) (${link.relation})`)
            if (claim.kind === 'source-statement'
              && (link.relation === 'supports' || link.relation === 'qualifies')) {
              hasSupportingEvidence = true
            }
          }
          lines.push(`  - Evidence: ${links.join(', ')}`)
          if (finding.kind === 'source-summary' && !hasSupportingEvidence) {
            this.warn(`unsupported-summary:${finding.id}:${claim.id}`, {
              code: 'source-summary-without-supporting-evidence',
              message: `Source-summary finding ${finding.id} references claim ${claim.id} without a supports or qualifies evidence relation.`,
              findingId: finding.id,
              claimId: claim.id,
            })
          }
        }
      }
      if (finding.comparisonProtocolIds.length === 0) continue
      lines.push('', 'Comparison basis:')
      for (const protocolId of finding.comparisonProtocolIds) {
        const protocol = this.comparisonProtocolById.get(protocolId)
        if (protocol === undefined) {
          lines.push(`- **[Missing]** \`${protocolId}\``)
          this.warn(`missing-comparison-protocol:${finding.id}:${protocolId}`, {
            code: 'comparison-protocol-not-found',
            message: `Finding ${finding.id} references missing comparison protocol ${protocolId}.`,
            findingId: finding.id,
            comparisonProtocolId: protocolId,
          })
          continue
        }
        const number = this.addComparisonProtocol(protocol)
        this.warnComparisonProtocolReference(protocol, finding.id)
        const badges = currentStateBadges(
          this.activeComparisonProtocols.has(protocol.id),
          this.isComparisonProtocolStale(protocol),
        )
        lines.push(
          `- [C${number}](#comparison-protocol-c${number}) ${badges} \`${protocol.id}\``,
        )
      }
    }

    if (this.comparisonProtocols.length > 0) this.renderComparisonLedgers()

    lines.push('', '## Evidence ledger')
    if (this.evidence.length === 0) lines.push('', '_No evidence is referenced by this synthesis._')
    for (const [index, evidence] of this.evidence.entries()) {
      const number = index + 1
      const paperNumber = this.addPaper(evidence.paperId)
      const coverage = this.dependencies.evidenceCoverage(evidence)
      if (coverage !== 'readable') {
        this.warn(`coverage:${evidence.id}:${coverage}`, {
          code: 'evidence-not-currently-readable',
          message: `Evidence ${evidence.id} currently has ${coverage} coverage; its durable text and locator remain historical records.`,
          evidenceId: evidence.id,
          paperId: evidence.paperId,
        })
      }
      const locator = evidence.locator
      const page = locator.pageLabel === undefined
        ? `physical page ${locator.pageIndex + 1}`
        : `physical page ${locator.pageIndex + 1}, label ${markdownInline(locator.pageLabel)}`
      lines.push(
        '',
        `### <a id="evidence-e${number}"></a>E${number} · [P${paperNumber}](#paper-p${paperNumber})`,
        '',
        `- Evidence id: \`${evidence.id}\``,
        `- Source version: \`${evidence.sourceVersionId}\``,
        `- Document: \`${locator.documentId}\``,
        `- Location: ${page}; block \`${locator.blockId}\``,
        `- Bounding box: x=${locator.bbox.x}, y=${locator.bbox.y}, width=${locator.bbox.width}, height=${locator.bbox.height}`,
        `- Parser: ${markdownInline(locator.parserId)} @ ${markdownInline(locator.parserVersion)}`,
        `- Block quote hash: \`${locator.quoteHash}\``,
        `- Current verification: **${coverage}**`,
      )
      if (evidence.selection === undefined) {
        lines.push('- Selected quote: not recorded; inspect the exact block locator before quoting.')
      } else {
        lines.push(
          `- Selected quote UTF-8 bytes: ${evidence.selection.startUtf8Byte}-${evidence.selection.endUtf8Byte}`,
          `- Selected quote hash: \`${evidence.selection.textHash}\``,
        )
        if (this.options.includeSelectedQuotes) {
          lines.push('- Selected quote (exact):', '', fencedCode(evidence.selection.text))
        } else {
          lines.push('- Selected quote text: omitted; set include_selected_quotes=true to disclose the retained exact text.')
        }
      }
    }

    lines.push('', '## Bibliography')
    if (this.papers.length === 0) lines.push('', '_No papers are referenced by this synthesis._')
    for (const [index, paperId] of this.papers.entries()) {
      const number = index + 1
      const paper = this.dependencies.paper(paperId)
      lines.push('', `### <a id="paper-p${number}"></a>P${number}`)
      if (paper === undefined) {
        lines.push('', `Missing paper record: \`${paperId}\`.`)
        this.warn(`missing-paper:${paperId}`, {
          code: 'paper-not-found',
          message: `Paper ${paperId} is missing from the durable library.`,
          paperId,
        })
        continue
      }
      const metadata = paper.metadata
      const authors = metadata.authors?.value.join(', ')
      const year = metadata.year?.value
      const venue = metadata.venue?.value
      const identifiers = paper.externalIds.map(value => `${value.kind.toUpperCase()}: ${value.value}`)
      lines.push('', [
        authors === undefined ? '[authors not recorded]' : markdownInline(authors),
        year === undefined ? '[year not recorded]' : `(${year})`,
        markdownInline(metadata.title.value),
        venue === undefined ? '[venue not recorded]' : markdownInline(venue),
      ].join(' '))
      lines.push('', `Paper id: \`${paper.id}\`${identifiers.length === 0 ? '' : ` · ${identifiers.map(markdownInline).join(' · ')}`}`)
      if (authors === undefined || year === undefined || venue === undefined) {
        const fields = [
          ...(authors === undefined ? ['authors'] : []),
          ...(year === undefined ? ['year'] : []),
          ...(venue === undefined ? ['venue'] : []),
        ]
        this.warn(`bibliography:${paper.id}:${fields.join(',')}`, {
          code: 'bibliography-incomplete',
          message: `Paper ${paper.id} is missing bibliography fields: ${fields.join(', ')}.`,
          paperId: paper.id,
        })
      }
    }

    if (this.warnings.length > 0) {
      lines.push('', '## Readiness warnings')
      for (const warning of this.warnings) {
        lines.push(`- **${warning.code}:** ${markdownInline(warning.message)}`)
      }
    }
    return lines.finish()
  }

  private addEvidence(evidence: ResearchEvidence): number {
    const existing = this.evidenceNumbers.get(evidence.id)
    if (existing !== undefined) return existing
    const number = this.evidence.length + 1
    this.evidenceNumbers.set(evidence.id, number)
    this.evidence.push(evidence)
    return number
  }

  private addComparisonProtocol(protocol: ResearchComparisonProtocol): number {
    const existing = this.comparisonProtocolNumbers.get(protocol.id)
    if (existing !== undefined) return existing
    const number = this.comparisonProtocols.length + 1
    this.comparisonProtocolNumbers.set(protocol.id, number)
    this.comparisonProtocols.push(protocol)
    return number
  }

  private warnComparisonProtocolReference(
    protocol: ResearchComparisonProtocol,
    findingId: string,
  ): void {
    if (!this.activeComparisonProtocols.has(protocol.id)) {
      this.warn(`inactive-comparison-protocol:${findingId}:${protocol.id}`, {
        code: 'comparison-protocol-inactive',
        message: `Finding ${findingId} references superseded comparison protocol ${protocol.id}.`,
        findingId,
        comparisonProtocolId: protocol.id,
      })
    }
    if (this.isComparisonProtocolStale(protocol)) {
      this.warn(`stale-comparison-protocol:${findingId}:${protocol.id}`, {
        code: 'comparison-protocol-stale',
        message: `Finding ${findingId} references comparison protocol ${protocol.id} whose observations or source references are no longer current.`,
        findingId,
        comparisonProtocolId: protocol.id,
      })
    }
  }

  private addObservation(observation: ResearchObservation): number {
    const existing = this.observationNumbers.get(observation.id)
    if (existing !== undefined) return existing
    const number = this.observations.length + 1
    this.observationNumbers.set(observation.id, number)
    this.observations.push(observation)
    return number
  }

  private renderComparisonLedgers(): void {
    const lines = this.lines
    lines.push('', '## Comparison protocol ledger')
    for (const [index, protocol] of this.comparisonProtocols.entries()) {
      const number = index + 1
      const observationLinks = protocol.observationIds.map(observationId =>
        this.observationReference(observationId, protocol.id))
      const referenceObservation = protocol.referenceObservationId === undefined
        ? 'not recorded'
        : this.observationReference(protocol.referenceObservationId, protocol.id)
      lines.push(
        '',
        `### <a id="comparison-protocol-c${number}"></a>C${number}`,
        '',
        `- Protocol id: \`${protocol.id}\``,
        '- Content role: **authored-comparison-decision**',
        `- Current state: **${currentState(
          this.activeComparisonProtocols.has(protocol.id),
          this.isComparisonProtocolStale(protocol),
        )}**`,
        `- Created by: ${markdownInline(`${protocol.createdBy.kind}:${protocol.createdBy.id}`)}`,
        `- Created at: ${markdownInline(protocol.createdAt)}`,
        `- Direction: **${protocol.direction}**`,
        '- Statistical significance: **not-assessed**',
        `- Reference observation: ${referenceObservation}`,
        `- Observations, in authored order: ${observationLinks.join(', ')}`,
      )
      if (protocol.supersedes !== undefined) {
        lines.push(`- Supersedes comparison protocol: \`${protocol.supersedes}\``)
      }
      lines.push('- Compatibility rationale:', '', markdownParagraph(protocol.compatibilityRationale))
    }

    for (const observation of this.observations) {
      this.observationEvidenceReferences.set(
        observation.id,
        this.collectObservationEvidenceReferences(observation),
      )
    }
    for (const evidence of this.evidence) this.addPaper(evidence.paperId)

    lines.push('', '## Observation ledger')
    if (this.observations.length === 0) {
      lines.push('', '_No observations are available for the referenced protocols._')
    }
    for (const [index, observation] of this.observations.entries()) {
      this.renderObservation(observation, index + 1)
    }
  }

  private observationReference(observationId: string, protocolId: string): string {
    const observation = this.observationById.get(observationId)
    if (observation === undefined) {
      this.warn(`missing-observation:${observationId}`, {
        code: 'observation-not-found',
        message: `Comparison protocol ${protocolId} references missing observation ${observationId}.`,
        comparisonProtocolId: protocolId,
        observationId,
      })
      return `missing \`${observationId}\``
    }
    const number = this.addObservation(observation)
    return `[O${number}](#observation-o${number})`
  }

  private renderObservation(observation: ResearchObservation, number: number): void {
    const lines = this.lines
    const paperId = this.observationPaperId(observation)
    const paperNumber = paperId === undefined ? undefined : this.addPaper(paperId)
    const otherRole = observation.method.otherRole === undefined
      ? ''
      : `; other role ${markdownInline(observation.method.otherRole)}`
    lines.push(
      '',
      `### <a id="observation-o${number}"></a>O${number}`,
      '',
      `- Observation id: \`${observation.id}\``,
      '- Content role: **authored-normalization**',
      `- Current state: **${currentState(
        this.activeObservations.has(observation.id),
        this.staleObservations.has(observation.id),
      )}**`,
      `- Created by: ${markdownInline(`${observation.createdBy.kind}:${observation.createdBy.id}`)}`,
      `- Created at: ${markdownInline(observation.createdAt)}`,
      ...(paperId === undefined || paperNumber === undefined
        ? []
        : [`- Paper: [P${paperNumber}](#paper-p${paperNumber}) \`${paperId}\``]),
      `- Result claim: \`${observation.resultClaimId}\``,
      `- Method: ${this.entityReference(observation.method.entityId)}; source claim \`${observation.method.sourceClaimId}\`; role **${observation.method.role}**${otherRole}`,
      `- Dataset: ${this.entityReference(observation.dataset.entityId)}; source claim \`${observation.dataset.sourceClaimId}\``,
      `- Dataset split: ${reportedContext(observation.dataset.split)}`,
      `- Metric: ${this.entityReference(observation.metric.entityId)}; source claim \`${observation.metric.sourceClaimId}\``,
      `- Value: \`${observation.value}\``,
      `- Unit: ${observationUnit(observation.unit)}`,
      `- Value statistic: ${markdownInline(observation.valueStatistic)}`,
      `- Evaluation protocol: ${reportedContext(observation.evaluationProtocol)}`,
      `- Uncertainty: ${observationUncertainty(observation.uncertainty)}`,
    )
    this.renderObservationConditions(observation.conditions)
    if (observation.supersedes !== undefined) {
      lines.push(`- Supersedes observation: \`${observation.supersedes}\``)
    }
    const evidenceReferences = this.observationEvidenceReferences.get(observation.id) ?? []
    lines.push(`- Evidence: ${evidenceReferences.length === 0 ? 'none recorded.' : evidenceReferences.join(', ')}`)
  }

  private renderObservationConditions(conditions: ResearchObservationConditions): void {
    if (conditions.status !== 'reported') {
      this.lines.push(`- Conditions: **${conditions.status}**`)
      return
    }
    this.lines.push('- Conditions: **reported**')
    for (const condition of conditions.values) {
      this.lines.push(
        `  - ${markdownInline(condition.name)} = ${markdownInline(condition.value)}; comparison role **${condition.comparisonRole}**; source claim \`${condition.sourceClaimId}\``,
      )
    }
  }

  private collectObservationEvidenceReferences(observation: ResearchObservation): readonly string[] {
    const references: string[] = []
    for (const reference of observationClaimReferences(observation)) {
      const claim = this.claimById.get(reference.claimId)
      if (claim === undefined) {
        this.warn(`missing-observation-claim:${observation.id}:${reference.claimId}`, {
          code: 'claim-not-found',
          message: `Observation ${observation.id} references missing claim ${reference.claimId}.`,
          claimId: reference.claimId,
          observationId: observation.id,
        })
        continue
      }
      for (const link of claim.evidenceLinks) {
        const annotation = observationEvidenceAnnotation(reference, link.relation)
        const evidence = this.evidenceById.get(link.evidenceId)
        if (evidence === undefined) {
          references.push(
            `missing \`${link.evidenceId}\` (${annotation})`,
          )
          this.warn(`missing-observation-evidence:${observation.id}:${link.evidenceId}`, {
            code: 'evidence-not-found',
            message: `Observation ${observation.id} claim ${claim.id} references missing evidence ${link.evidenceId}.`,
            claimId: claim.id,
            evidenceId: link.evidenceId,
            observationId: observation.id,
          })
          continue
        }
        const evidenceNumber = this.addEvidence(evidence)
        references.push(
          `[E${evidenceNumber}](#evidence-e${evidenceNumber}) (${annotation})`,
        )
      }
    }
    return references
  }

  private observationPaperId(observation: ResearchObservation): ResearchPaperId | undefined {
    const resultClaim = this.claimById.get(observation.resultClaimId)
    const resultEvidenceId = resultClaim?.evidenceLinks[0]?.evidenceId
    return resultEvidenceId === undefined
      ? undefined
      : this.evidenceById.get(resultEvidenceId)?.paperId
  }

  private entityReference(entityId: string): string {
    const entity = this.entityById.get(entityId)
    return entity === undefined
      ? `missing entity \`${entityId}\``
      : `${markdownInline(entity.canonicalName)} (entity \`${entity.id}\`)`
  }

  private isComparisonProtocolStale(protocol: ResearchComparisonProtocol): boolean {
    return protocol.observationIds.some(observationId =>
      !this.activeObservations.has(observationId)
      || this.staleObservations.has(observationId)
      || !this.observationById.has(observationId))
  }

  private addPaper(paperId: ResearchPaperId): number {
    const existing = this.paperNumbers.get(paperId)
    if (existing !== undefined) return existing
    const number = this.papers.length + 1
    this.paperNumbers.set(paperId, number)
    this.papers.push(paperId)
    return number
  }

  private warn(key: string, value: ResearchReviewWarning): void {
    if (this.warningKeys.has(key)) return
    if (this.warnings.length >= this.options.maxWarnings) {
      throw new ReviewTooLargeError('warning-count')
    }
    this.warningKeys.add(key)
    this.warnings.push(value)
  }
}

class ReviewTooLargeError extends Error {
  constructor(readonly kind: 'text-size' | 'warning-count') {
    super(`research review exceeded its ${kind} limit`)
  }
}

class MarkdownLines {
  private readonly values: string[] = []
  private characters = 0

  constructor(private readonly maximum: number) {}

  push(...values: string[]): number {
    for (const value of values) {
      if (this.characters + value.length + 1 > this.maximum) {
        throw new ReviewTooLargeError('text-size')
      }
      this.values.push(value)
      this.characters += value.length + 1
    }
    return this.values.length
  }

  finish(): string {
    return `${this.values.join('\n')}\n`
  }
}

function activeClaimIds(question: ResearchQuestionRecord): ReadonlySet<string> {
  const superseded = new Set(question.claims.flatMap(value => value.supersedes === undefined ? [] : [value.supersedes]))
  return new Set(question.claims.filter(value => !superseded.has(value.id)).map(value => value.id))
}

function activeSynthesisIds(question: ResearchQuestionRecord): ReadonlySet<string> {
  const superseded = new Set(question.syntheses.flatMap(value => value.supersedes === undefined ? [] : [value.supersedes]))
  return new Set(question.syntheses.filter(value => !superseded.has(value.id)).map(value => value.id))
}

function activeObservationIds(question: ResearchQuestionRecord): ReadonlySet<string> {
  const superseded = new Set(question.observations.flatMap(value =>
    value.supersedes === undefined ? [] : [value.supersedes]))
  return new Set(question.observations
    .filter(value => !superseded.has(value.id))
    .map(value => value.id))
}

function activeComparisonProtocolIds(question: ResearchQuestionRecord): ReadonlySet<string> {
  const superseded = new Set(question.comparisonProtocols.flatMap(value =>
    value.supersedes === undefined ? [] : [value.supersedes]))
  return new Set(question.comparisonProtocols
    .filter(value => !superseded.has(value.id))
    .map(value => value.id))
}

function activeEntityIds(question: ResearchQuestionRecord): ReadonlySet<string> {
  const superseded = new Set(question.entities.flatMap(value => value.supersedes))
  return new Set(question.entities.filter(value => !superseded.has(value.id)).map(value => value.id))
}

function staleObservationIds(
  question: ResearchQuestionRecord,
  activeClaims: ReadonlySet<string>,
): ReadonlySet<string> {
  const activeEntities = activeEntityIds(question)
  const entityById = new Map(question.entities.map(value => [value.id, value]))
  return new Set(question.observations.filter((observation) => {
    if (observationClaimReferences(observation).some(value => !activeClaims.has(value.claimId))) {
      return true
    }
    return [observation.method.entityId, observation.dataset.entityId, observation.metric.entityId]
      .some((entityId) => {
        const entity = entityById.get(entityId)
        return entity === undefined
          || !activeEntities.has(entityId)
          || entity.sourceClaimIds.some(claimId => !activeClaims.has(claimId))
      })
  }).map(value => value.id))
}

function observationClaimReferences(observation: ResearchObservation): readonly {
  readonly kind: string
  readonly claimId: string
  readonly conditionName?: string
}[] {
  return [
    { kind: 'result claim', claimId: observation.resultClaimId },
    { kind: 'method source claim', claimId: observation.method.sourceClaimId },
    { kind: 'dataset source claim', claimId: observation.dataset.sourceClaimId },
    { kind: 'metric source claim', claimId: observation.metric.sourceClaimId },
    ...(observation.dataset.split.status === 'reported'
      ? [{ kind: 'dataset split source claim', claimId: observation.dataset.split.sourceClaimId }]
      : []),
    ...(observation.evaluationProtocol.status === 'reported'
      ? [{
        kind: 'evaluation protocol source claim',
        claimId: observation.evaluationProtocol.sourceClaimId,
      }]
      : []),
    ...(observation.conditions.status === 'reported'
      ? observation.conditions.values.map(value => ({
        kind: 'condition source claim',
        claimId: value.sourceClaimId,
        conditionName: value.name,
      }))
      : []),
  ]
}

function observationEvidenceAnnotation(
  reference: {
    readonly kind: string
    readonly claimId: string
    readonly conditionName?: string
  },
  relation: ResearchClaim['evidenceLinks'][number]['relation'],
): string {
  const role = reference.conditionName === undefined
    ? reference.kind
    : `${reference.kind} "${markdownInline(reference.conditionName)}"`
  return `${role}; source claim \`${reference.claimId}\`; ${relation}`
}

function currentState(active: boolean, stale: boolean): string {
  if (active && !stale) return 'current'
  if (!active && stale) return 'inactive; stale'
  return active ? 'stale' : 'inactive'
}

function currentStateBadges(active: boolean, stale: boolean): string {
  if (active && !stale) return '**[Current]**'
  return `${active ? '' : '**[Inactive]** '}${stale ? '**[Stale]**' : ''}`.trim()
}

function reportedContext(context: ResearchObservationReportedContext): string {
  if (context.status !== 'reported') return `**${context.status}**`
  return `**reported**; ${markdownInline(context.value)}; source claim \`${context.sourceClaimId}\``
}

function observationUnit(unit: ResearchObservationUnit): string {
  if (unit.status !== 'reported') return `**${unit.status}**`
  return `**reported**; ${markdownInline(unit.symbol)}`
}

function observationUncertainty(uncertainty: ResearchObservationUncertainty): string {
  if (uncertainty.status !== 'reported') return `**${uncertainty.status}**`
  const value = uncertainty.value
  switch (value.kind) {
    case 'standard-deviation':
    case 'standard-error':
    case 'unspecified-plus-minus':
      return `**reported**; kind **${value.kind}**; magnitude \`${value.magnitude}\``
    case 'confidence-interval':
      return `**reported**; kind **${value.kind}**; lower \`${value.lower}\`; upper \`${value.upper}\`; confidence level \`${value.confidenceLevelPercent}\`%`
    case 'range':
      return `**reported**; kind **${value.kind}**; lower \`${value.lower}\`; upper \`${value.upper}\``
    default:
      return assertNever(value)
  }
}

function assertNever(value: never): never {
  throw new Error(`unexpected research review value: ${String(value)}`)
}

function markdownInline(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replace(/([`*_{}\[\]<>])/gu, '\\$1')
    .replace(/\s+/gu, ' ')
    .trim()
}

function markdownParagraph(value: string): string {
  return value.split(/\r?\n/u).map(markdownInline).filter(Boolean).join('  \n')
}

function fencedCode(value: string): string {
  const longest = Math.max(0, ...(value.match(/`+/gu) ?? []).map(run => run.length))
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}text\n${value}${value.endsWith('\n') ? '' : '\n'}${fence}`
}
