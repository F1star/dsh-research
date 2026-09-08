/** Revision-pinned report service over durable research information and bibliographic metadata. */
import { Service, type Context } from '@deepseek-ai/cordis';
import s from '@deepseek-ai/schemastery';
import type { ResearchReportRequest, ResearchReportResult } from './types.ts';
export type * from './types.ts';
/** Complete export capacity; no report text is silently clipped. */
export interface Config {
    /** Maximum UTF-8 JSON bytes of a complete ready result. Defaults to 8388608. */
    readonly maxReportBytes?: number;
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        researchReport: ResearchReport;
    }
}
/** Renders a deterministic draft and exact audit files without changing scientific records. */
export declare class ResearchReport extends Service {
    static inject: string[];
    /** Complete-result byte limit, validated when the plugin loads. */
    static Config: s<Config>;
    private readonly maxReportBytes;
    /**
     * @param ctx - durable question and paper services.
     * @param config - complete export capacity.
     */
    constructor(ctx: Context, config?: Config);
    /**
     * Render all report formats from the exact inspected question and current library metadata.
     * @param request - question identity and inspected revision.
     * @returns complete files or a non-writing refusal; the audit file preserves the complete question history.
     */
    render(request: ResearchReportRequest): ResearchReportResult;
}
export default ResearchReport;
//# sourceMappingURL=index.d.ts.map