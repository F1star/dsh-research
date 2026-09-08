# Changelog

All notable changes to this project are documented here.

## 0.4.0 - 2026-09-08

- Add durable original-PDF and parser-revision archives, page geometry, and `paper_structure` for bounded table, formula, and chart extraction inspection. PDF.js remains the default; the optional Docling provider ships a Python worker and requires a separately configured Python environment. Generated extraction remains unverified until checked against the source.
- Add a Research sidebar workspace for the paper library, archived PDF reading, saved positions, notes, evidence matrices, human claim/result reviews, report downloads, and recoverable task checkpoints. A browser bridge registers the plugin's own typed Remote namespace with the published DSH host.
- Add human review decisions with revision checks and history. Add deterministic Markdown, LaTeX, BibTeX, CSL-JSON, and provenance exports; readiness warnings do not constitute publication approval.
- Add three durable research workflows and an opt-in, bounded task execution service with owned logged sessions, stop handling, source-change invalidation, and human-review stops. Execution start/stop/history is available through the trusted workspace API; dedicated browser execution controls are not included yet. The default execution preset is the installed host's `minimal` preset with the profile's research tools.
- Retain the 0.3 reading pack, digest-paged review renderer, and synthesis comparison-protocol provenance.
- **Storage compatibility:** the paper-library domain is now version 2 and the research-information domain is version 7, combining human review records with the standalone 0.3 comparison fields. There is no automatic migration from library version 1 or information version 5 (nor from the source application's information version 6). Back up profile storage before updating and use separate fresh storage for 0.4. Unsupported versions are refused without rewriting them; pin `v0.3.0` to reopen unchanged 0.3 data.
- DOI/URL/Zotero ingestion, semantic library search, complete scientific-accuracy evaluation, and publication approval remain outside this release.

## 0.3.0 - 2026-09-04

- Add a required `comparisonProtocolIds` array to every durable synthesis finding and expose an optional `comparison_protocol_ids` input through `research_synthesis_write`, with omission recorded as an empty array. Source summaries cannot link a protocol; linked findings must be inferences, may reference only active, non-stale comparison protocols, and must cite every result claim used by each linked protocol. Raise the default claim-reference limit per finding from 64 to 256 so one protocol at its default observation limit remains usable.
- Render linked protocols under `Comparison basis` so a quantitative cross-paper inference retains its authored compatibility basis. This basis does not establish source agreement, calculate a difference, or assess statistical significance. Limit each finding to 64 comparison-protocol references by default through `maxComparisonProtocolReferencesPerFinding`.
- Increase the `research_information` durable domain from version 4 to version 5. Version 4 data is not migrated automatically: back up profile storage before updating. A version mismatch leaves the old data untouched, and pinning the bundle to `v0.2.0` allows that version 4 data to be opened again.
- Publish each GitHub Release with its matching changelog section so storage-version warnings accompany the version-independent bundle asset.

## 0.2.0 - 2026-09-04

- Add `paper_reading_pack` for a bounded, deterministic first pass over recognized abstract, introduction, related-work, method, results, limitations, and conclusion sections, with conservative section boundaries and line-oriented PDF defaults.
- Add `research_review_render` for deterministic Markdown projections of an explicit active synthesis, with source/inference labels, evidence relations, opt-in exact selected text, complete locators, bibliography entries, readiness warnings, digest-bound paging, and a fail-closed render limit.
- Keep both additions read-only and compatible with existing durable paper-library and research-information records; no storage migration is required.

## 0.1.0 - 2026-09-03

- Package the research runtime as one installable DeepSeek Harness bundle.
- Add native-text PDF import, outline navigation, lexical search, and anchored passage reading.
- Add a durable paper library with source-version and bibliography provenance.
- Add structured questions, evidence, notes, claims, entities, numeric observations, comparison protocols, matrices, audits, and syntheses.
- Ship prebuilt JavaScript and declarations so GitHub and release-tarball installs need no build approval.
