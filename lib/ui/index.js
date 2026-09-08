/** Research-only sidebar contribution over the existing typed Remote facade. */
import { WorkspaceController } from "./controller.js";
import { Workspace } from "./Workspace.js";
import { Observations } from "./Observations.js";
import { Tasks } from "./Tasks.js";
/** Required services, including the generated workspace namespace lifetime. */
export const inject = ['slots', 'remote', 'remote.researchWorkspace'];
/**
 * @param ctx - browser plugin context carrying slots and trusted Remote methods.
 */
export function apply(ctx) {
    const controller = new WorkspaceController({
        createQuestion: async (reviewer, title, question) => unwrap(await ctx.remote.researchWorkspace.createQuestion(reviewer, title, question)),
        tasks: async (question, offset) => unwrap(await ctx.remote.researchWorkspace.tasks(question, offset)),
        task: async (id, offset) => unwrap(await ctx.remote.researchWorkspace.task(id, offset)),
        taskHistory: async (id, revision, offset) => unwrap(await ctx.remote.researchWorkspace.taskHistory(id, revision, offset)),
        taskSources: async (id, revision, checkpoint, offset) => unwrap(await ctx.remote.researchWorkspace.taskSources(id, revision, checkpoint, offset)),
        createTask: async (reviewer, request) => unwrap(await ctx.remote.researchWorkspace.createTask(reviewer, request)),
        updateTask: async (reviewer, request) => unwrap(await ctx.remote.researchWorkspace.updateTask(reviewer, request)),
        observations: async (id, offset) => unwrap(await ctx.remote.researchWorkspace.observations(id, offset)),
        observationChoices: async (id, observation, offset) => unwrap(await ctx.remote.researchWorkspace.observationChoices(id, observation, offset)),
        observationReviews: async (id, observation, offset) => unwrap(await ctx.remote.researchWorkspace.observationReviews(id, observation, offset)),
        reviewObservation: async (reviewer, request) => unwrap(await ctx.remote.researchWorkspace.reviewObservation(reviewer, request)),
        report: async (request) => unwrap(await ctx.remote.researchWorkspace.report(request)),
        questions: async (offset) => unwrap(await ctx.remote.researchWorkspace.questions(offset)),
        claims: async (id, offset, filter) => unwrap(await ctx.remote.researchWorkspace.claims(id, offset, filter)),
        notes: async (id, offset) => unwrap(await ctx.remote.researchWorkspace.notes(id, offset)),
        matrix: async (id, offset) => unwrap(await ctx.remote.researchWorkspace.matrix(id, offset)),
        writeNote: async (reviewer, request) => unwrap(await ctx.remote.researchWorkspace.writeNote(reviewer, request)),
        reviewers: async () => unwrap(await ctx.remote.researchWorkspace.reviewers()),
        registerReviewer: async (name) => unwrap(await ctx.remote.researchWorkspace.registerReviewer(name)),
        evidence: async (id, evidence) => unwrap(await ctx.remote.researchWorkspace.evidence(id, evidence)),
        evidenceChoices: async (id, offset) => unwrap(await ctx.remote.researchWorkspace.evidenceChoices(id, offset)),
        reviews: async (id, claim, offset) => unwrap(await ctx.remote.researchWorkspace.reviews(id, claim, offset)),
        reviewClaim: async (reviewer, request) => unwrap(await ctx.remote.researchWorkspace.reviewClaim(reviewer, request)),
        list: async (query, offset) => unwrap(await ctx.remote.researchWorkspace.list(query, offset)),
        source: async (id, offset) => unwrap(await ctx.remote.researchWorkspace.source(id, offset)),
        page: async (document, page, offset) => unwrap(await ctx.remote.researchWorkspace.page(document, page, offset)),
        position: async (id) => unwrap(await ctx.remote.researchWorkspace.position(id)),
        savePosition: async (document, page, revision) => unwrap(await ctx.remote.researchWorkspace.savePosition(document, page, revision)),
    });
    ctx.effect(() => () => { controller.dispose(); }, 'research-workspace.controller');
    const injectProps = () => ({
        loadObservations: controller.loadObservations,
        prepareReport: controller.prepareReport, loadNotes: controller.loadNotes, loadMatrix: controller.loadMatrix,
        submitNote: controller.submitNote,
        loadQuestions: controller.loadQuestions, loadClaims: controller.loadClaims, selectClaim: controller.selectClaim,
        loadEvidenceChoices: controller.loadEvidenceChoices, readEvidence: controller.readEvidence, loadReviews: controller.loadReviews,
        chooseReviewer: controller.chooseReviewer, registerReviewer: controller.registerReviewer,
        submitReview: controller.submitReview, openEvidence: controller.openEvidence,
        load: controller.load, openPaper: controller.open, turn: controller.turn, moreBlocks: controller.moreBlocks,
        hooks: { workspace: controller },
    });
    const injectObservations = () => ({
        loadObservations: controller.loadObservations, selectObservation: controller.selectObservation,
        loadObservationChoices: controller.loadObservationChoices, loadObservationReviews: controller.loadObservationReviews,
        submitObservationReview: controller.submitObservationReview, readEvidence: controller.readEvidence,
        loadEvidenceChoices: controller.loadEvidenceChoices, hooks: { workspace: controller },
    });
    ctx.slots.inject('research.workspace.observations', () => ctx.slots.register({
        name: 'research.workspace.observations', inject: injectObservations,
    }, Observations));
    const injectTasks = () => ({
        createQuestion: controller.createQuestion, createTask: controller.createTask, updateTask: controller.updateTask,
        loadTasks: controller.loadTasks, selectTask: controller.selectTask, loadTaskHistory: controller.loadTaskHistory,
        loadTaskSources: controller.loadTaskSources, loadTaskIssues: controller.loadTaskIssues, loadCatalog: controller.load,
        hooks: { workspace: controller },
    });
    ctx.slots.inject('research.workspace.tasks', () => ctx.slots.register({
        name: 'research.workspace.tasks', inject: injectTasks,
    }, Tasks));
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action', id: 'research', order: 10, inject: injectProps,
        children: { 'research.workspace.observations': { kind: 'single', scope: 'root' },
            'research.workspace.tasks': { kind: 'single', scope: 'root' } },
    }, Workspace));
}
function unwrap(result) {
    if (!result.ok)
        throw new Error(result.error.message);
    return result.value;
}
//# sourceMappingURL=index.js.map