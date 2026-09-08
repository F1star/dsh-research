# 0.4 integration record

This release ports completed work from task `01a07eac-d3a0-7860-a886-d03fbbb6545e` in the Research Harness source application into the independent DSH bundle. It does not mark that task's remaining research roadmap complete.

The port preserves standalone 0.3 reading packs, digest-bound review pagination, and synthesis comparison provenance. The information domain is version 7 because the source application's version 6 lacks the standalone comparison-reference field. Report projection retains those references and withholds findings whose linked comparisons are no longer usable. Old storage is rejected unchanged; migration is not part of this release.

The source composition's dedicated task preset is not shipped by the published DSH host. This bundle selects its installed minimal preset, inherits the explicitly granted profile research tools, and retains the runner's task-specific tool policy. A package-root loader row enables browser and generated descriptor discovery; individual host services still use separate subpath entries. Host/client TypeScript programs remain separate.

The generated descriptor hashes identify the source inputs. The package-renamed host and browser descriptors ship together. The build includes the closure-factory browser entry and the optional Python worker. Default PDF reading does not require Python; OCR requires the explicit setup in [ocr.md](ocr.md).

Tests exercise archives, restarts, scientific structure paging, review revisions, comparisons, report formats, checkpoints, execution cancellation/persistence, and UI lifetimes. The standalone suite uses published DSH packages, not workspace aliases to the source application. Browser factories are loaded using the published factory format in the plugin registration test.

The release tarball was installed through the published DSH CLI in an isolated Web profile. Browser verification covered sidebar loading, researcher registration, question/task creation, task pause, five report download links, and retained question/task state after a host restart, with no browser runtime errors. These checks used no model credentials and do not establish live-provider or real OCR accuracy.

Remaining work includes DOI/URL/Zotero acquisition, semantic library retrieval, dedicated browser execution controls, full report approval, and scientific extraction accuracy evaluation. Human review and source provenance remain necessary even when extraction or a report render succeeds.
