/** Report paragraphs preserve result review and comparison eligibility independently of source wording. */
import type { ResearchQuestionRecord } from '../research-information/types.ts';
/** One complete result paragraph and its source papers. */
export interface ObservationReportParagraph {
    readonly text: string;
    readonly paperIds: readonly ResearchQuestionRecord['evidence'][number]['paperId'][];
}
/**
 * Project current results and protocols, retaining explicit rejection and stale-source warnings.
 * @param question - complete validated question history at the report revision.
 * @returns source-cited prose without ranking, conversion, aggregation, or significance claims.
 */
export declare function observationReport(question: ResearchQuestionRecord): ObservationReportParagraph[];
//# sourceMappingURL=observations.d.ts.map