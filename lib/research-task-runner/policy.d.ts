/** Task-scoped tool admission and logged execution guidance. */
import { type ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ResearchTaskView } from '../research-task/types.ts';
import type { ResearchDocumentId } from '../research-document/types.ts';
/**
 * Admit only selected-source reading and assigned-question research tools.
 * @param exec - parsed model/tool request, including nested Code Mode dispatches.
 * @param view - current task whose selected sources remain authoritative.
 * @param documents - exact document identities belonging to the selected sources.
 * @returns a non-writing denial or undefined to delegate ordinary tool policy.
 */
export declare function taskToolDenial(exec: ToolExecution, view: ResearchTaskView, documents: readonly ResearchDocumentId[]): string | undefined;
/**
 * Describe checkpoint continuation and human review requirements as logged model input.
 * @param view - checkpoint and question identities inspected immediately before dispatch.
 * @returns instructions recorded as plugin-sourced input in the execution session.
 */
export declare function taskRunPrompt(view: ResearchTaskView): string;
//# sourceMappingURL=policy.d.ts.map