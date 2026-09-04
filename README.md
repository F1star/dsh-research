# @f1star/dsh-research

English | [简体中文](README.zh-CN.md)

`@f1star/dsh-research` is an installable [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) bundle for evidence-first paper work. It is a DSH bundle plugin, not a Codex plugin, and runs inside an existing DSH profile.

The bundle adds local native-text PDF reading, a durable paper library, and an auditable research-information workflow. It preserves exact source anchors and keeps quoted evidence distinct from authored notes, inferences, normalizations, comparison decisions, and syntheses.

## What it adds

| Capability | Tools and behavior |
|---|---|
| Paper reading | `paper_import`, `paper_reading_pack`, `paper_outline`, `paper_search`, and `paper_read` import a local PDF, collect bounded excerpts from recognized key sections, navigate its structure, search lexical matches, and recover exact surrounding blocks with physical-page, parser-revision, and quote-hash anchors. |
| Paper library | `paper_library_register`, `paper_library_list`, `paper_library_get`, and `paper_library_alias` retain paper identities, bibliography provenance, exact source versions, parser observations, and reversible aliases in profile storage. |
| Research integration | Research-question, evidence, note, claim, entity, observation, comparison-protocol, synthesis, matrix, audit, and `research_review_render` operations build a traceable record across papers and render an explicit active synthesis as review-ready Markdown without presenting authored interpretation as source text. |

This standalone bundle mounts both the research services and their model-facing tool consumers in the selected profile. Installing it is an explicit grant to every agent started through that profile: each agent can see the research tool schemas and their stable prompt guidance.

## Prerequisites

- A compatible `dsh` installation with `pnpm` available on `PATH`.
- A target profile containing `@deepseek-ai/dsh-base` followed by `@deepseek-ai/dsh-web-app`. The shipped `web` profile has this composition.
- Model credentials available through the normal DSH credential sources.
- Local PDFs readable under the session's filesystem permissions. Relative file paths resolve from the session workspace.

## Install and run

Install the bundle into the shipped Web profile:

```sh
dsh plugin --profile web add github:F1star/dsh-research
dsh --profile web --dump-config
dsh web
```

The install command initializes the shipped `web` profile when it does not exist. The configuration dump lets you confirm that the `@f1star/dsh-research` layer and its research rows are present before booting the profile.

A GitHub install follows the selected Git ref. After a tag or commit you trust is available, pin it for reproducible installation:

```sh
dsh plugin --profile web add github:F1star/dsh-research#<tag-or-commit>
```

Restart a running profile after adding, updating, or removing the bundle.

## Recommended workflow

1. Import a PDF with `paper_import`, use `paper_reading_pack` for a bounded first pass over recognized key sections, inspect headings with `paper_outline`, find additional blocks with `paper_search`, and call `paper_read` before relying on a passage.
2. Register the retained document with `paper_library_register`. Keep the returned paper, source-version, document, block, parser-version, physical-page, and quote-hash identifiers with your notes.
3. Create a research question, capture exact evidence, and record reading notes or passage questions. Write source statements separately from explicit inferences.
4. When comparing numeric results, normalize the method, dataset, metric, value, unit, split, uncertainty, evaluation protocol, and conditions for each paper. Record an explicit comparison protocol only after the retained fields are compatible.
5. Use the matrix and audit views to find missing or stale support, then write structured synthesis findings that cite active source claims. Pass an explicit active synthesis id to `research_review_render` to obtain paged Markdown with evidence and bibliography ledgers.

You can describe the task in natural language; the agent chooses the tools. For example:

```text
Import papers/one.pdf and build a reading pack for its abstract, introduction, method, results, limitations, and conclusion. Use the outline and search tools for anything the pack misses, and read the surrounding blocks before relying on them. Register the paper, create a research question about dataset effects, capture exact evidence for each source statement, show the audit view, write a synthesis, and render that synthesis as a review draft.
```

`paper_reading_pack` recognizes a closed set of English and Chinese section labels and returns individually anchored source blocks, subject to the configured text budget and explicit `text_truncated` flags. It does not summarize those blocks, and an entry in `missing_roles` means only that the parser did not recognize a matching label. `research_review_render` likewise does not write new findings: it renders one selected active synthesis and labels source summaries, inferences, evidence relations, current verification state, and incomplete bibliography metadata. Exact selected text is opt-in through `include_selected_quotes`; every continuation page must reuse the first page's `render_digest`, so a changed record cannot be silently combined with an earlier page. A `ready-with-warnings` result requires review before publication.

## Configuration

The bundle rows live in [`cordis.patch.yml`](cordis.patch.yml), while each plugin's schema supplies its defaults. A profile's own `cordis.patch.yml` is applied later and can override a row by `id`. A row override replaces its complete `config` value rather than merging individual keys, so retain `parserProvider: pdfjs` when overriding `f1star-research-document` unless another registered parser is intentional. The reading-pack controls on `f1star-tool-research-document` default to 12 blocks per section, at most 14 blocks per section, and at most 7 requested sections; `defaultReadingPackBlocksPerSection` must not exceed `maxReadingPackBlocksPerSection`, and `maxOutputTextChars` must be at least `maxReadingPackSections × maxReadingPackBlocksPerSection`. That text budget covers variable source fields; fixed provenance anchors and notices are additional bounded output. `f1star-tool-research-information.maxReviewTextChars` defaults to 2,000,000 UTF-16 code units and fails a complete review closed before paging if that limit is exceeded.

For a custom profile, compose the bundles in this order:

1. `@deepseek-ai/dsh-base`
2. `@deepseek-ai/dsh-web-app`
3. `@f1star/dsh-research`

Installing this bundle into a custom profile that contains only the base bundle fails because the filesystem, tool, system-prompt, and durable-storage services supplied by the Web layer are absent.

## Data and limitations

- Paper identities, source observations, research questions, evidence, notes, claims, entities, observations, comparison protocols, and syntheses are stored in the selected profile's durable storage and can be visible across sessions using that storage.
- Parsed PDF pages are process-local. After a restart, import the PDF again before reading blocks or capturing new evidence. The library records identities and observations, not the source PDF bytes.
- Evidence records retain exact block text and provenance, but reconstructing an historical PDF still requires your own durable copy of the source file.
- PDF.js extracts native text only. Scanned or image-only documents require OCR outside this bundle and do not support a text claim from the import.
- Reading-pack recognition depends on extracted heading labels and approximate reading order. A missing role does not establish that the paper omits the corresponding topic.
- Search and library matching are lexical. The bundle does not provide semantic retrieval, remote DOI or arXiv verification, automatic claim clustering, or automatic entity resolution.
- Numeric observations and comparison protocols are authored normalizations. The bundle does not silently convert units or aliases, rank results, calculate deltas, infer statistical significance, or perform meta-analysis.
- Review rendering is a deterministic Markdown projection of retained records, not automatic literature-review generation or a formal CSL/BibTeX citation exporter. It always emits exact selection hashes and offsets, includes selected text only when explicitly requested, and otherwise emits locators instead of repeating complete evidence blocks.

## Update or remove

```sh
dsh plugin --profile web update @f1star/dsh-research
dsh plugin --profile web remove @f1star/dsh-research
```

Removing the bundle stops mounting its services and tools. It does not delete source PDFs, and research records can remain in the profile's storage; manage that storage separately if you need archival or deletion.

See the DeepSeek Harness guide to [packaging and installing bundle plugins](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md) for profile and layer behavior.

## License

MIT. This standalone distribution is derived from the DeepSeek Harness research packages and retains their 2026 DeepSeek copyright notice. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
