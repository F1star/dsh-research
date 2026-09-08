/**
 * Public namespaces for the standalone DSH research bundle.
 * @module @f1star/dsh-research
 */

/** Root loader entry makes the bundle's browser and Remote descriptors discoverable. */
export const name = 'f1star-research'
/** The subpath plugins own host services; this root entry declares the client contribution. */
export function apply(): void {}

export * as researchDocument from './research-document/index.ts'
export * as researchDocumentPdfjs from './research-document-pdfjs/index.ts'
export * as researchInformation from './research-information/index.ts'
export * as researchLibrary from './research-library/index.ts'
export * as researchDocumentTools from './tool-research-document/index.ts'
export * as researchInformationTools from './tool-research-information/index.ts'
export * as researchLibraryTools from './tool-research-library/index.ts'
export * as researchDocumentDocling from './research-document-docling/index.ts'
export * as researchDocumentStorage from './research-document-storage/index.ts'
export * as researchWorkspace from './research-workspace/index.ts'
export * as researchReport from './research-report/index.ts'
export * as researchTask from './research-task/index.ts'
export * as researchTaskRunner from './research-task-runner/index.ts'
export * as researchTaskTools from './tool-research-task/index.ts'
