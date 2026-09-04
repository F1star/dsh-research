# Changelog

All notable changes to this project are documented here.

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
