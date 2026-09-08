/** Research-only sidebar contribution over the existing typed Remote facade. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { ResearchWorkspaceTaskSource } from '../research-workspace/types.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /** Complete result review inside the research workspace. */
        'research.workspace.observations': {
            kind: 'single';
            scope: 'root';
            owner: Record<never, never>;
        };
        /** Task progress and explicit recovery inside the research workspace. */
        'research.workspace.tasks': {
            kind: 'single';
            scope: 'root';
            owner: {
                openSource: (source: ResearchWorkspaceTaskSource) => void;
            };
        };
    }
}
/** Required services, including the generated workspace namespace lifetime. */
export declare const inject: string[];
/**
 * @param ctx - browser plugin context carrying slots and trusted Remote methods.
 */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map