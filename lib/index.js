/**
 * Public namespaces for the standalone DSH research bundle.
 * @module @f1star/dsh-research
 */
/** Root loader entry makes the bundle's browser and Remote descriptors discoverable. */
export const name = 'f1star-research';
/** The subpath plugins own host services; this root entry declares the client contribution. */
export function apply() { }
export * as researchDocument from "./research-document/index.js";
export * as researchDocumentPdfjs from "./research-document-pdfjs/index.js";
export * as researchInformation from "./research-information/index.js";
export * as researchLibrary from "./research-library/index.js";
export * as researchDocumentTools from "./tool-research-document/index.js";
export * as researchInformationTools from "./tool-research-information/index.js";
export * as researchLibraryTools from "./tool-research-library/index.js";
export * as researchDocumentDocling from "./research-document-docling/index.js";
export * as researchDocumentStorage from "./research-document-storage/index.js";
export * as researchWorkspace from "./research-workspace/index.js";
export * as researchReport from "./research-report/index.js";
export * as researchTask from "./research-task/index.js";
export * as researchTaskRunner from "./research-task-runner/index.js";
export * as researchTaskTools from "./tool-research-task/index.js";
//# sourceMappingURL=index.js.map