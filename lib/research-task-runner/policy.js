/** Task-scoped tool admission and logged execution guidance. */
import { RUN_CODE_NAME } from '@deepseek-ai/dsh-tools';
const questionTools = new Set(['research_question_get', 'research_evidence_capture', 'research_note_write',
    'research_claim_write', 'research_entity_write', 'research_observation_write', 'research_comparison_protocol_write', 'research_synthesis_write']);
const documentTools = new Set(['paper_outline', 'paper_search', 'paper_read', 'paper_structure']);
/**
 * Admit only selected-source reading and assigned-question research tools.
 * @param exec - parsed model/tool request, including nested Code Mode dispatches.
 * @param view - current task whose selected sources remain authoritative.
 * @param documents - exact document identities belonging to the selected sources.
 * @returns a non-writing denial or undefined to delegate ordinary tool policy.
 */
export function taskToolDenial(exec, view, documents) {
    if (exec.name === RUN_CODE_NAME)
        return undefined;
    const args = exec.arguments;
    if (args === null || typeof args !== 'object' || Array.isArray(args))
        return 'Research task tools require object arguments.';
    if (questionTools.has(exec.name)) {
        if (!('question_id' in args) || args.question_id !== view.task.questionId)
            return 'Use the research question assigned to this task.';
        if (exec.name === 'research_evidence_capture'
            && (!('document_id' in args) || !documents.some(id => id === args.document_id)))
            return 'Capture only the selected exact sources.';
        return undefined;
    }
    if (documentTools.has(exec.name)) {
        return 'document_id' in args && documents.some(id => id === args.document_id) ? undefined : 'Read only the selected exact sources.';
    }
    if (exec.name === 'paper_library_get') {
        return 'paper_id' in args && view.task.sources.some(source => source.paperId === args.paper_id)
            ? undefined : 'Inspect only papers selected for this task.';
    }
    if (exec.name === 'research_task_get' || exec.name === 'research_task_write') {
        if (!('task_id' in args) || args.task_id !== view.task.id)
            return 'Use the assigned research task.';
        if (exec.name === 'research_task_get')
            return undefined;
        if (!('action' in args) || args.action !== 'checkpoint')
            return 'Task execution may record checkpoints; researchers control source selection and recovery.';
        if ('stage' in args && args.stage === 'acquisition')
            return 'Researchers select the exact task sources before execution.';
        return undefined;
    }
    return 'This execution permits selected-source reading and question-scoped research records only.';
}
/**
 * Describe checkpoint continuation and human review requirements as logged model input.
 * @param view - checkpoint and question identities inspected immediately before dispatch.
 * @returns instructions recorded as plugin-sourced input in the execution session.
 */
export function taskRunPrompt(view) {
    return `Continue research task ${view.task.id} for question ${view.task.questionId} from its current checkpoints.\n`
        + 'First inspect research_task_get and research_question_get. Read the selected exact sources with paper_library_get and paper tools.\n'
        + 'Capture source evidence and author supported claims, notes, entities, and results with their experimental conditions. '
        + 'Keep recognized tables, chart data, and formulas marked as unreviewed. Do not invent missing values or sources.\n'
        + 'Inspect current task and question revisions before each checkpoint. Advance extraction only after recording evidence for every selected source. '
        + 'Human review decisions must already exist before review can advance; stop when review is needed.\n'
        + 'For method comparison record an eligible comparison protocol or explain non-comparability. '
        + 'Write a source-backed synthesis with conflicts, qualifications, and open questions, then checkpoint synthesis and export.\n'
        + 'Inspect existing records before adding replacements; preserve history and avoid duplicating completed work. '
        + 'Only selected-source reading and writes to this question are permitted. Source selection, task recovery, and human approval remain researcher actions.';
}
//# sourceMappingURL=policy.js.map