/** Stage requirements and dependency digests over authoritative scientific records. */
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { researchObservationState } from "../research-information/index.js";
/**
 * Resolve the ordered named workflow, including explicit method comparability.
 * @param kind - user-selected research workflow.
 * @returns stages whose completion requires recorded artifacts and an authored checkpoint.
 */
export function taskStages(kind) {
    return kind === 'method-comparison'
        ? ['acquisition', 'extraction', 'review', 'comparison', 'synthesis', 'export']
        : ['acquisition', 'extraction', 'review', 'synthesis', 'export'];
}
/**
 * Check a stage against current source, review, and report state without mutation.
 * @param stage - workflow stage under inspection.
 * @param kind - selected workflow's source-count requirements.
 * @param question - complete current scientific aggregate.
 * @param sources - exact task source selection.
 * @param papers - current registered paper records.
 * @param report - lazy revision-pinned export used only by the export stage.
 * @param comparisonOutcome - authored comparability choice for method comparisons.
 * @returns issues, historical artifact references, and the digest that detects changed dependencies.
 */
export function inspectStage(stage, kind, question, sources, papers, report, comparisonOutcome) {
    const issues = [];
    const artifacts = { evidenceIds: [], claimIds: [], claimReviewIds: [], observationIds: [],
        observationReviewIds: [], comparisonProtocolIds: [], synthesisIds: [] };
    const result = (basis, refs = artifacts) => ({
        issues, basisDigest: `sha256:${createHash('sha256').update(JSON.stringify(basis)).digest('hex')}`,
        artifacts: refs,
    });
    if (stage === 'acquisition') {
        if (sources.length === 0)
            issues.push('Select at least one imported paper source.');
        const paperIds = new Set(sources.map(source => source.paperId));
        if (kind === 'single-paper' && paperIds.size !== 1)
            issues.push('Single-paper reading requires exactly one paper.');
        if (kind === 'method-comparison' && paperIds.size < 2)
            issues.push('Method comparison requires at least two papers.');
        if (new Set(sources.map(source => `${source.paperId}/${source.sourceVersionId}`)).size !== sources.length) {
            issues.push('A paper source may be selected only once.');
        }
        for (const source of sources) {
            if (!papers.find(paper => paper.id === source.paperId)?.sourceVersions.some(value => value.id === source.sourceVersionId)) {
                issues.push(`Imported source is unavailable: ${source.paperId}/${source.sourceVersionId}.`);
            }
        }
        return result(sources);
    }
    const evidence = question.evidence.filter(item => sources.some(source => source.paperId === item.paperId
        && source.sourceVersionId === item.sourceVersionId));
    const evidenceIds = new Set(evidence.map(item => item.id));
    const retiredClaims = new Set(question.claims.flatMap(value => value.supersedes === undefined ? [] : [value.supersedes]));
    const selectedClaims = question.claims.filter(claim => claim.kind === 'source-statement'
        && claim.evidenceLinks.some(link => evidenceIds.has(link.evidenceId)));
    const claims = selectedClaims.filter(claim => !retiredClaims.has(claim.id));
    const refs = { ...artifacts, evidenceIds: [...evidenceIds], claimIds: claims.map(claim => claim.id) };
    if (stage === 'extraction') {
        for (const source of sources) {
            const captured = new Set(evidence.filter(item => item.paperId === source.paperId
                && item.sourceVersionId === source.sourceVersionId).map(item => item.id));
            if (!claims.some(claim => claim.evidenceLinks.some(link => captured.has(link.evidenceId)))) {
                issues.push(`Capture exact evidence and a current source statement for ${source.paperId}/${source.sourceVersionId}.`);
            }
        }
        const byId = new Map(question.claims.map(claim => [claim.id, claim]));
        const roots = claims.map((claim) => {
            let root = claim;
            while (root.supersedes !== undefined) {
                const predecessor = byId.get(root.supersedes);
                assert(predecessor !== undefined);
                root = predecessor;
            }
            return root.id;
        });
        return result({ evidence: [...evidenceIds], claimLineages: [...new Set(roots)].sort() }, refs);
    }
    const latestClaimReviews = claims.map(claim => question.claimReviews.findLast(review => review.claimId === claim.id
        || (review.decision === 'revised' && review.replacementClaimId === claim.id)));
    const selectedClaimIds = new Set(selectedClaims.map(claim => claim.id));
    const observations = question.observations.filter(observation => selectedClaimIds.has(observation.resultClaimId)
        && !question.observations.some(value => value.supersedes === observation.id));
    const states = observations.map(observation => researchObservationState(question, observation));
    const assessed = { ...refs, claimReviewIds: latestClaimReviews.flatMap(value => value === undefined ? [] : [value.id]),
        observationIds: observations.map(value => value.id),
        observationReviewIds: states.flatMap(state => state.review === null ? [] : [state.review.id]) };
    const reviewBasis = { claims: claims.map((claim, index) => [claim.id, latestClaimReviews[index]?.id ?? null]),
        observations: observations.map((observation, index) => {
            const state = states[index];
            assert(state !== undefined);
            return [observation.id, state.stale, state.review?.id ?? null, state.rejectedClaimIds];
        }) };
    if (stage === 'review') {
        for (const [index, claim] of claims.entries()) {
            if (latestClaimReviews[index] === undefined)
                issues.push(`Researcher review is required for claim ${claim.id}.`);
        }
        for (const [index, observation] of observations.entries()) {
            const state = states[index];
            assert(state !== undefined);
            if (state.review === null)
                issues.push(`Researcher review is required for result ${observation.id}.`);
            else if (state.review.decision !== 'rejected' && (state.stale || state.rejectedClaimIds.length > 0)) {
                issues.push(`Revise or reject result ${observation.id}; its source assessment is no longer usable.`);
            }
        }
        return result(reviewBasis, assessed);
    }
    const retiredProtocols = new Set(question.comparisonProtocols.flatMap(value => value.supersedes === undefined ? [] : [value.supersedes]));
    const eligible = new Set(observations.filter((_, index) => {
        const state = states[index];
        assert(state !== undefined);
        return !state.stale && state.rejectedClaimIds.length === 0 && state.review !== null && state.review.decision !== 'rejected';
    }).map(value => value.id));
    const protocols = question.comparisonProtocols.filter(protocol => !retiredProtocols.has(protocol.id)
        && protocol.observationIds.every(id => eligible.has(id)));
    const compared = { ...assessed, comparisonProtocolIds: protocols.map(value => value.id) };
    if (stage === 'comparison') {
        if (comparisonOutcome === undefined)
            issues.push('Record a comparison protocol or explicitly explain why results are not comparable.');
        if (comparisonOutcome === 'protocol' && protocols.length === 0)
            issues.push('A current protocol over researcher-accepted results is required.');
        return result({ reviewBasis, protocols: protocols.map(value => value.id), comparisonOutcome }, compared);
    }
    const retiredSyntheses = new Set(question.syntheses.flatMap(value => value.supersedes === undefined ? [] : [value.supersedes]));
    const syntheses = question.syntheses.filter(value => !retiredSyntheses.has(value.id)
        && value.findings.some(finding => finding.claimIds.some(id => selectedClaimIds.has(id)) || finding.claimIds.length === 0));
    const synthesized = { ...compared, synthesisIds: syntheses.map(value => value.id) };
    if (stage === 'synthesis') {
        if (syntheses.length === 0)
            issues.push('Record a current synthesis, including qualifications or open questions where evidence is insufficient.');
        for (const synthesis of syntheses) {
            for (const finding of synthesis.findings) {
                if (finding.claimIds.some(id => retiredClaims.has(id) || question.claimReviews.findLast(review => review.claimId === id
                    || (review.decision === 'revised' && review.replacementClaimId === id))?.decision === 'rejected')) {
                    issues.push(`Revise synthesis ${synthesis.id}; a finding cites a replaced or rejected source statement.`);
                }
            }
        }
        return result(syntheses.map(value => value.id), synthesized);
    }
    const rendered = report();
    if (rendered.status !== 'ready') {
        issues.push(`A complete report export is unavailable: ${rendered.status}.`);
        return result({ status: rendered.status }, synthesized);
    }
    return result(rendered.bundle.digest, { ...synthesized, reportDigest: rendered.bundle.digest });
}
//# sourceMappingURL=stages.js.map