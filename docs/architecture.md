# Architecture

`@f1star/dsh-research` is one installable DSH bundle containing seven Cordis plugin entry points. The entries remain separate so each service and consumer keeps an explicit lifecycle and dependency list, while the package is self-contained for GitHub installation.

| Entry | Role |
|---|---|
| `research-document` | Parser-neutral document service, stable document and block identifiers, cache, outline, search, and exact reads. |
| `research-document-pdfjs` | PDF.js native-text parser registered as provider `pdfjs`. |
| `research-library` | Durable paper identity, bibliography provenance, source versions, parser observations, and aliases. |
| `research-information` | Durable questions, evidence, notes, claims, entities, observations, comparison protocols, and syntheses whose findings can retain explicit comparison-protocol references. |
| `tool-research-document` | Model-facing paper import, semantic reading-pack, and exact passage-navigation tools. |
| `tool-research-library` | Model-facing paper-library tools. |
| `tool-research-information` | Model-facing evidence capture, structured integration, matrix, audit, and deterministic review-rendering tools. |

The profile bundle patch mounts the four services first and then the three tool consumers. Service injection still controls activation; list order makes the intended ownership visible in the composed configuration.

Installing the bundle into a profile is an explicit profile-wide tool grant. The consumers register into that profile's global tool layer, so every agent preset started through the profile inherits the research tools. Removing the bundle withdraws both the services and those registrations on the next profile start.

Parsed PDF blocks are process-local because the parser service is a bounded runtime cache. Durable storage contains paper identities, source observations, evidence text and anchors, and authored research records, but not the PDF bytes. This separation prevents a durable record from being mistaken for a retrievable source file.

`paper_reading_pack` is a read-only projection over retained document blocks. It recognizes a closed set of English and Chinese semantic section labels, selects bounded source blocks without combining their text, and preserves every block locator and quote hash. The result is navigation material, not a summary; an unmatched role reports parser recognition failure rather than source-level absence.

`research_review_render` is a read-only projection over one explicit active synthesis and the claims, comparison protocols, observations, evidence, and paper records it references. The renderer preserves finding kind, stance, claim kind, and every evidence relation. An inference with retained comparison-protocol references receives a `Comparison basis` drawn from those authored compatibility decisions rather than a newly computed comparison. Exact selected text requires an explicit disclosure flag, while omitted selections and unselected full blocks retain exact hashes and locators. Current runtime coverage and incomplete bibliography fields become readiness warnings. Continuation pages are bound to a digest of the complete projection, and a configurable complete-render limit fails closed before paging. The rendered Markdown is not persisted and contains no generated findings.

The paper-library domain remains at version 1. The research-information domain is version 5 because every synthesis finding stores a required `comparisonProtocolIds` array. An empty array records no explicit comparison basis. A non-empty array is valid only on an inference; each referenced protocol must be active and non-stale when the synthesis is written, and the finding's claim references must include every result claim used by the protocol's observations. Later supersession leaves the immutable synthesis intact; the audit and renderer mark its comparison reference as not current. A finding retains at most 256 claim references and 64 comparison-protocol references by default; the claim limit lets one protocol at its default 256-observation limit remain usable.

There is no automatic migration from research-information version 4 to version 5. A backend that contains version 4 data rejects the version 5 open without changing the stored data. Operators must back up the selected profile storage before updating; pinning the bundle to `v0.2.0` allows the unchanged version 4 data to be opened again.

Internal imports between the seven entries use relative ESM paths. Official `@deepseek-ai/*` packages remain peer dependencies so the plugin resolves the DSH installation's single Cordis and service-definition instances. The package commits prebuilt `lib/` artifacts and declares no install-time lifecycle script.
