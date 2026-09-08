# Architecture

The standalone bundle contains fourteen service/consumer entry points, thirteen mounted by default, plus a package-root discovery entry. The optional Docling provider needs explicit Python configuration. The source application and this standalone distribution remain separate releases.

| Entries | Responsibility |
|---|---|
| research-document, research-document-pdfjs, research-document-docling | Exact reads, native-text/geometry extraction, and optional managed Python OCR/scientific extraction. |
| research-document-storage, research-library | Original-byte and parser-revision archives; durable identities, metadata, observations, and aliases. |
| research-information | Questions, exact evidence, notes, claims, numeric observations, human review history, comparison protocols, and syntheses. |
| research-report, research-workspace | Deterministic report/citation exports and trusted-client access to archives, reviews, reading positions, and tasks. |
| research-task, research-task-runner | Durable workflow checkpoints and separately authorized, bounded, logged execution attempts. |
| tool-research-document, tool-research-library, tool-research-information, tool-research-task | Model-facing consumers, including the retained reading pack and digest-paged review renderer. |

The patch mounts services before consumers. Installation is an explicit profile-wide research-tool grant, including the published host's minimal preset selected for task execution. The runner owns each fresh session, enforces tool and task limits, flushes its transcript before disposal, and never resumes an execution automatically after restart. Saved workflow state and saved execution attempts are separate records. Human review is a trusted-client operation, not an agent self-approval tool.

The browser entry registers the generated researchWorkspace Remote namespace before mounting its sidebar contribution. The hashes in generated/source.json identify the source descriptors used for this port; host and client descriptors are package-renamed together. Host and client use separate TypeScript programs because their Cordis declarations differ. The browser bundle uses DSH's closure-factory loader and the host's React instance.

The archive domain is version 2, paper library version 2, research information version 7, workspace version 2, and task/execution domains version 1. Information version 7 combines source-application review records with standalone 0.3's required comparisonProtocolIds on synthesis findings. A linked finding must be an inference and retain every result claim from its referenced current protocols. No migration is implied between repositories or versions. Back up complete profile storage and use fresh separate storage for this release; unsupported formats fail without rewriting data.

The reading pack returns independently anchored blocks from recognized English/Chinese section labels, not generated summaries. The review renderer projects one explicit synthesis with source/inference labels, evidence relations, bibliography warnings, and retained comparison bases. Continuations require matching digests. Report exports include the complete provenance snapshot, including superseded and rejected records; human acceptance is not publication approval.

Official @deepseek-ai dependencies remain peers to share Cordis and service identities with the host. Internal research imports are relative ESM. Committed lib artifacts and the Python worker are included in release tarballs; there are no install-time lifecycle scripts. See [OCR setup](ocr.md) for the explicitly enabled Python environment.
