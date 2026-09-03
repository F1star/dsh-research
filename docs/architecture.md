# Architecture

`@f1star/dsh-research` is one installable DSH bundle containing seven Cordis plugin entry points. The entries remain separate so each service and consumer keeps an explicit lifecycle and dependency list, while the package is self-contained for GitHub installation.

| Entry | Role |
|---|---|
| `research-document` | Parser-neutral document service, stable document and block identifiers, cache, outline, search, and exact reads. |
| `research-document-pdfjs` | PDF.js native-text parser registered as provider `pdfjs`. |
| `research-library` | Durable paper identity, bibliography provenance, source versions, parser observations, and aliases. |
| `research-information` | Durable questions, evidence, notes, claims, entities, observations, comparison protocols, and syntheses. |
| `tool-research-document` | Model-facing paper import and passage-navigation tools. |
| `tool-research-library` | Model-facing paper-library tools. |
| `tool-research-information` | Model-facing evidence capture, structured integration, matrix, and audit tools. |

The profile bundle patch mounts the four services first and then the three tool consumers. Service injection still controls activation; list order makes the intended ownership visible in the composed configuration.

Installing the bundle into a profile is an explicit profile-wide tool grant. The consumers register into that profile's global tool layer, so every agent preset started through the profile inherits the research tools. Removing the bundle withdraws both the services and those registrations on the next profile start.

Parsed PDF blocks are process-local because the parser service is a bounded runtime cache. Durable storage contains paper identities, source observations, evidence text and anchors, and authored research records, but not the PDF bytes. This separation prevents a durable record from being mistaken for a retrievable source file.

Internal imports between the seven entries use relative ESM paths. Official `@deepseek-ai/*` packages remain peer dependencies so the plugin resolves the DSH installation's single Cordis and service-definition instances. The package commits prebuilt `lib/` artifacts and declares no install-time lifecycle script.
