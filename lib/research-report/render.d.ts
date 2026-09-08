/** Pure report projection and text rendering; scientific authorship remains in the input records. */
import '@citation-js/plugin-bibtex';
import type { ResearchQuestionRecord } from '../research-information/types.ts';
import type { ResearchPaperRecord } from '../research-library/types.ts';
import type { ResearchReportBundle } from './types.ts';
/**
 * Render reproducible report and citation files from a complete question snapshot.
 * @param question - exact durable question revision, including superseded records.
 * @param papers - every paper referenced by the question's captured evidence, in first-evidence order.
 * @returns all formats with a digest of their exact contents; no records are mutated.
 */
export declare function renderReport(question: ResearchQuestionRecord, papers: readonly ResearchPaperRecord[]): ResearchReportBundle;
//# sourceMappingURL=render.d.ts.map