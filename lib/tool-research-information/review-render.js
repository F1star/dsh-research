/**
 * Deterministic Markdown projection for one retained research synthesis.
 * @module @f1star/dsh-research/tool-research-information/review-render
 */
/** Stable warning codes emitted by the review renderer. */
export const RESEARCH_REVIEW_WARNING_CODES = [
    'question-not-found',
    'synthesis-not-found',
    'synthesis-inactive',
    'stale-claim-reference',
    'claim-not-found',
    'evidence-not-found',
    'source-summary-without-supporting-evidence',
    'uncited-inference-finding',
    'paper-not-found',
    'bibliography-incomplete',
    'evidence-not-currently-readable',
    'review-too-large',
];
/**
 * Render one explicit active synthesis without generating new prose or changing durable state.
 * @param question - durable question aggregate, or `undefined` when the id is absent.
 * @param synthesisId - explicit synthesis selected by the caller.
 * @param dependencies - current library metadata and evidence reproducibility checks.
 * @param options - output disclosure and complete-render safety limits.
 * @returns readiness, warnings, and deterministic Markdown when the synthesis is active.
 */
export function renderResearchReview(question, synthesisId, dependencies, options) {
    if (question === undefined) {
        return notReady('', synthesisId, {
            code: 'question-not-found',
            message: 'The research question does not exist.',
        });
    }
    const synthesis = question.syntheses.find(value => value.id === synthesisId);
    if (synthesis === undefined) {
        return notReady(question.id, synthesisId, {
            code: 'synthesis-not-found',
            message: `Synthesis ${synthesisId} does not belong to question ${question.id}.`,
        });
    }
    const activeSyntheses = activeSynthesisIds(question);
    if (!activeSyntheses.has(synthesis.id)) {
        return notReady(question.id, synthesis.id, {
            code: 'synthesis-inactive',
            message: `Synthesis ${synthesis.id} has been superseded; select an active synthesis.`,
        });
    }
    try {
        const state = new ReviewRenderState(question, synthesis, dependencies, options);
        const markdown = state.render();
        return {
            status: state.warnings.length === 0 ? 'ready' : 'ready-with-warnings',
            questionId: question.id,
            synthesisId: synthesis.id,
            warnings: state.warnings,
            markdown,
        };
    }
    catch (error) {
        if (!(error instanceof ReviewTooLargeError))
            throw error;
        return notReady(question.id, synthesis.id, {
            code: 'review-too-large',
            message: `The complete review exceeds its configured ${error.kind} limit; narrow the synthesis or raise the deployment limit.`,
        });
    }
}
function notReady(questionId, synthesisId, warning) {
    return {
        status: 'not-ready',
        questionId,
        synthesisId,
        warnings: [warning],
    };
}
class ReviewRenderState {
    question;
    synthesis;
    dependencies;
    options;
    warnings = [];
    warningKeys = new Set();
    claimById;
    evidenceById;
    activeClaims;
    evidenceNumbers = new Map();
    evidence = [];
    paperNumbers = new Map();
    papers = [];
    lines;
    constructor(question, synthesis, dependencies, options) {
        this.question = question;
        this.synthesis = synthesis;
        this.dependencies = dependencies;
        this.options = options;
        this.claimById = new Map(question.claims.map(value => [value.id, value]));
        this.evidenceById = new Map(question.evidence.map(value => [value.id, value]));
        this.activeClaims = activeClaimIds(question);
        this.lines = new MarkdownLines(options.maxCharacters);
    }
    render() {
        const lines = this.lines;
        lines.push(`# ${markdownInline(this.question.title)}`, '', `**Research question:** ${markdownInline(this.question.question)}`, '', `**Synthesis:** \`${this.synthesis.id}\``, '', 'This document deterministically renders retained research records. It does not generate new findings.', '', '## Findings');
        for (const [index, finding] of this.synthesis.findings.entries()) {
            lines.push('', `### ${index + 1}. ${finding.stance}`);
            lines.push('', finding.kind === 'inference' ? '**[Inference]**' : '**[Source summary]**');
            lines.push('', markdownParagraph(finding.text));
            if (finding.claimIds.length === 0) {
                lines.push('', '_No claim references._');
                if (finding.kind === 'inference') {
                    this.warn(`uncited-finding:${finding.id}`, {
                        code: 'uncited-inference-finding',
                        message: `Inference finding ${finding.id} has no claim references.`,
                        findingId: finding.id,
                    });
                }
                continue;
            }
            lines.push('', 'Claims:');
            for (const claimId of finding.claimIds) {
                const claim = this.claimById.get(claimId);
                if (claim === undefined) {
                    lines.push(`- **[Missing claim]** \`${claimId}\``);
                    this.warn(`missing-claim:${claimId}`, {
                        code: 'claim-not-found',
                        message: `Finding ${finding.id} references missing claim ${claimId}.`,
                        findingId: finding.id,
                        claimId,
                    });
                    continue;
                }
                const active = this.activeClaims.has(claim.id);
                if (!active) {
                    this.warn(`stale-claim:${finding.id}:${claim.id}`, {
                        code: 'stale-claim-reference',
                        message: `Finding ${finding.id} references superseded claim ${claim.id}.`,
                        findingId: finding.id,
                        claimId: claim.id,
                    });
                }
                const label = claim.kind === 'inference' ? '[Inference claim]' : '[Source statement]';
                lines.push(`- **${label}${active ? '' : ' [Superseded]'}** ${markdownInline(claim.text)}`);
                if (claim.evidenceLinks.length === 0) {
                    lines.push('  - Evidence: none recorded.');
                    if (finding.kind === 'source-summary') {
                        this.warn(`unsupported-summary:${finding.id}:${claim.id}`, {
                            code: 'source-summary-without-supporting-evidence',
                            message: `Source-summary finding ${finding.id} references claim ${claim.id} without a supports or qualifies evidence relation.`,
                            findingId: finding.id,
                            claimId: claim.id,
                        });
                    }
                    continue;
                }
                const links = [];
                let hasSupportingEvidence = false;
                for (const link of claim.evidenceLinks) {
                    const evidence = this.evidenceById.get(link.evidenceId);
                    if (evidence === undefined) {
                        links.push(`missing \`${link.evidenceId}\` (${link.relation})`);
                        this.warn(`missing-evidence:${claim.id}:${link.evidenceId}`, {
                            code: 'evidence-not-found',
                            message: `Claim ${claim.id} references missing evidence ${link.evidenceId}.`,
                            claimId: claim.id,
                            evidenceId: link.evidenceId,
                        });
                        continue;
                    }
                    const number = this.addEvidence(evidence);
                    links.push(`[E${number}](#evidence-e${number}) (${link.relation})`);
                    if (claim.kind === 'source-statement'
                        && (link.relation === 'supports' || link.relation === 'qualifies')) {
                        hasSupportingEvidence = true;
                    }
                }
                lines.push(`  - Evidence: ${links.join(', ')}`);
                if (finding.kind === 'source-summary' && !hasSupportingEvidence) {
                    this.warn(`unsupported-summary:${finding.id}:${claim.id}`, {
                        code: 'source-summary-without-supporting-evidence',
                        message: `Source-summary finding ${finding.id} references claim ${claim.id} without a supports or qualifies evidence relation.`,
                        findingId: finding.id,
                        claimId: claim.id,
                    });
                }
            }
        }
        lines.push('', '## Evidence ledger');
        if (this.evidence.length === 0)
            lines.push('', '_No evidence is referenced by this synthesis._');
        for (const [index, evidence] of this.evidence.entries()) {
            const number = index + 1;
            const paperNumber = this.addPaper(evidence.paperId);
            const coverage = this.dependencies.evidenceCoverage(evidence);
            if (coverage !== 'readable') {
                this.warn(`coverage:${evidence.id}:${coverage}`, {
                    code: 'evidence-not-currently-readable',
                    message: `Evidence ${evidence.id} currently has ${coverage} coverage; its durable text and locator remain historical records.`,
                    evidenceId: evidence.id,
                    paperId: evidence.paperId,
                });
            }
            const locator = evidence.locator;
            const page = locator.pageLabel === undefined
                ? `physical page ${locator.pageIndex + 1}`
                : `physical page ${locator.pageIndex + 1}, label ${markdownInline(locator.pageLabel)}`;
            lines.push('', `### <a id="evidence-e${number}"></a>E${number} · [P${paperNumber}](#paper-p${paperNumber})`, '', `- Evidence id: \`${evidence.id}\``, `- Source version: \`${evidence.sourceVersionId}\``, `- Document: \`${locator.documentId}\``, `- Location: ${page}; block \`${locator.blockId}\``, `- Bounding box: x=${locator.bbox.x}, y=${locator.bbox.y}, width=${locator.bbox.width}, height=${locator.bbox.height}`, `- Parser: ${markdownInline(locator.parserId)} @ ${markdownInline(locator.parserVersion)}`, `- Block quote hash: \`${locator.quoteHash}\``, `- Current verification: **${coverage}**`);
            if (evidence.selection === undefined) {
                lines.push('- Selected quote: not recorded; inspect the exact block locator before quoting.');
            }
            else {
                lines.push(`- Selected quote UTF-8 bytes: ${evidence.selection.startUtf8Byte}-${evidence.selection.endUtf8Byte}`, `- Selected quote hash: \`${evidence.selection.textHash}\``);
                if (this.options.includeSelectedQuotes) {
                    lines.push('- Selected quote (exact):', '', fencedCode(evidence.selection.text));
                }
                else {
                    lines.push('- Selected quote text: omitted; set include_selected_quotes=true to disclose the retained exact text.');
                }
            }
        }
        lines.push('', '## Bibliography');
        if (this.papers.length === 0)
            lines.push('', '_No papers are referenced by this synthesis._');
        for (const [index, paperId] of this.papers.entries()) {
            const number = index + 1;
            const paper = this.dependencies.paper(paperId);
            lines.push('', `### <a id="paper-p${number}"></a>P${number}`);
            if (paper === undefined) {
                lines.push('', `Missing paper record: \`${paperId}\`.`);
                this.warn(`missing-paper:${paperId}`, {
                    code: 'paper-not-found',
                    message: `Paper ${paperId} is missing from the durable library.`,
                    paperId,
                });
                continue;
            }
            const metadata = paper.metadata;
            const authors = metadata.authors?.value.join(', ');
            const year = metadata.year?.value;
            const venue = metadata.venue?.value;
            const identifiers = paper.externalIds.map(value => `${value.kind.toUpperCase()}: ${value.value}`);
            lines.push('', [
                authors === undefined ? '[authors not recorded]' : markdownInline(authors),
                year === undefined ? '[year not recorded]' : `(${year})`,
                markdownInline(metadata.title.value),
                venue === undefined ? '[venue not recorded]' : markdownInline(venue),
            ].join(' '));
            lines.push('', `Paper id: \`${paper.id}\`${identifiers.length === 0 ? '' : ` · ${identifiers.map(markdownInline).join(' · ')}`}`);
            if (authors === undefined || year === undefined || venue === undefined) {
                const fields = [
                    ...(authors === undefined ? ['authors'] : []),
                    ...(year === undefined ? ['year'] : []),
                    ...(venue === undefined ? ['venue'] : []),
                ];
                this.warn(`bibliography:${paper.id}:${fields.join(',')}`, {
                    code: 'bibliography-incomplete',
                    message: `Paper ${paper.id} is missing bibliography fields: ${fields.join(', ')}.`,
                    paperId: paper.id,
                });
            }
        }
        if (this.warnings.length > 0) {
            lines.push('', '## Readiness warnings');
            for (const warning of this.warnings) {
                lines.push(`- **${warning.code}:** ${markdownInline(warning.message)}`);
            }
        }
        return lines.finish();
    }
    addEvidence(evidence) {
        const existing = this.evidenceNumbers.get(evidence.id);
        if (existing !== undefined)
            return existing;
        const number = this.evidence.length + 1;
        this.evidenceNumbers.set(evidence.id, number);
        this.evidence.push(evidence);
        return number;
    }
    addPaper(paperId) {
        const existing = this.paperNumbers.get(paperId);
        if (existing !== undefined)
            return existing;
        const number = this.papers.length + 1;
        this.paperNumbers.set(paperId, number);
        this.papers.push(paperId);
        return number;
    }
    warn(key, value) {
        if (this.warningKeys.has(key))
            return;
        if (this.warnings.length >= this.options.maxWarnings) {
            throw new ReviewTooLargeError('warning-count');
        }
        this.warningKeys.add(key);
        this.warnings.push(value);
    }
}
class ReviewTooLargeError extends Error {
    kind;
    constructor(kind) {
        super(`research review exceeded its ${kind} limit`);
        this.kind = kind;
    }
}
class MarkdownLines {
    maximum;
    values = [];
    characters = 0;
    constructor(maximum) {
        this.maximum = maximum;
    }
    push(...values) {
        for (const value of values) {
            if (this.characters + value.length + 1 > this.maximum) {
                throw new ReviewTooLargeError('text-size');
            }
            this.values.push(value);
            this.characters += value.length + 1;
        }
        return this.values.length;
    }
    finish() {
        return `${this.values.join('\n')}\n`;
    }
}
function activeClaimIds(question) {
    const superseded = new Set(question.claims.flatMap(value => value.supersedes === undefined ? [] : [value.supersedes]));
    return new Set(question.claims.filter(value => !superseded.has(value.id)).map(value => value.id));
}
function activeSynthesisIds(question) {
    const superseded = new Set(question.syntheses.flatMap(value => value.supersedes === undefined ? [] : [value.supersedes]));
    return new Set(question.syntheses.filter(value => !superseded.has(value.id)).map(value => value.id));
}
function markdownInline(value) {
    return value
        .replaceAll('\\', '\\\\')
        .replace(/([`*_{}\[\]<>])/gu, '\\$1')
        .replace(/\s+/gu, ' ')
        .trim();
}
function markdownParagraph(value) {
    return value.split(/\r?\n/u).map(markdownInline).filter(Boolean).join('  \n');
}
function fencedCode(value) {
    const longest = Math.max(0, ...(value.match(/`+/gu) ?? []).map(run => run.length));
    const fence = '`'.repeat(Math.max(3, longest + 1));
    return `${fence}text\n${value}${value.endsWith('\n') ? '' : '\n'}${fence}`;
}
//# sourceMappingURL=review-render.js.map