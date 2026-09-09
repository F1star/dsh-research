# @f1star/dsh-research

English | [简体中文](README.zh-CN.md)

First time here? Start with [prerequisites](#prerequisites) and [install and run](#install-and-run). No global `dsh` command is required.

`@f1star/dsh-research` is an installable [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) bundle for evidence-first paper work. It is a DSH bundle plugin, not a Codex plugin, and runs inside an existing DSH profile.

Version 0.4 adds an archived-PDF research workspace, optional OCR, human review, cited report exports, and recoverable research tasks. It preserves exact source anchors and keeps quoted evidence distinct from authored notes, inferences, normalizations, comparison decisions, and syntheses.

**Upgrade warning:** 0.3 profile data cannot be opened directly by 0.4. Back up existing storage and use fresh, separate profile storage; see [upgrading](#upgrading-from-03).

## What it adds

| Capability | Tools and behavior |
|---|---|
| Paper reading | `paper_import`, `paper_reading_pack`, `paper_outline`, `paper_search`, and `paper_read` import a local PDF, collect bounded excerpts from recognized key sections, navigate its structure, search lexical matches, and recover exact surrounding blocks with physical-page, parser-revision, and quote-hash anchors. |
| Paper library | `paper_library_register`, `paper_library_list`, `paper_library_get`, and `paper_library_alias` retain paper identities, bibliography provenance, exact source versions, parser observations, and reversible aliases in profile storage. |
| Research integration | Research-question, evidence, note, claim, entity, observation, comparison-protocol, synthesis, matrix, audit, and `research_review_render` operations build a traceable record across papers. Synthesis inferences can retain explicit comparison protocols, and the renderer presents that comparison basis in review-ready Markdown without presenting authored interpretation as source text. |
| Scientific extraction | `paper_structure` pages through located tables, formula text, and chart extraction with exact parser-revision pins. The optional Docling provider supplies OCR and generated scientific structures. |
| Research workspace | Open Research in the Web sidebar to browse archived PDFs, retain reading positions, write notes, inspect matrices, and review claims and numeric observations as a registered researcher. |
| Reports and tasks | Download Markdown, LaTeX, BibTeX, CSL-JSON, and provenance files. `research_task_list`, `research_task_get`, and `research_task_write` retain explicit workflow checkpoints, pause/resume state, and stale-source warnings. |

This standalone bundle mounts both the research services and their model-facing tool consumers in the selected profile. Installing it is an explicit grant to every agent started through that profile: each agent can see the research tool schemas and their stable prompt guidance.

## Prerequisites

Use Node.js 24 LTS (including npm and npx). The supported Node range is `^22.19.0 || >=24.0.0`. Check your terminal:

```sh
node --version
npm --version
pnpm --version
```

If `node` or `npm` is missing, install Node.js 24 LTS and reopen the terminal. If only `pnpm` is missing, install it and check again:

```sh
npm install --global pnpm@11.7.0
pnpm --version
```

DSH uses pnpm to install profile plugins, even when you launch DSH with npx. Python is not needed for the default PDF reader; only optional [OCR](docs/ocr.md) needs it.

## Install and run

### 1. Select separate storage for 0.4

These commands are for macOS/Linux shells, including zsh. You do not need to clone this repository or install a global `dsh` command. Run them in the same terminal.

```sh
export DSH_HOME="$HOME/.dsh-research-v040"
```

On first setup, choose a directory that does not contain older DSH data. DSH creates it as needed. This example isolates configuration, credentials, and default storage from your existing DSH installation; it does not migrate or delete old data. A different profile name alone does not guarantee separate storage. Keep using the same `DSH_HOME` to return to your 0.4 records.

### 2. Install the released plugin

Use the host version tested for this release. If npx asks to install the host package, answer `y`. The host's `0.1.1-rc.2` version and this plugin's `0.4.0` version are separate.

```sh
npx @deepseek-ai/dsh@0.1.1-rc.2 --version
npx @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web add https://github.com/F1star/dsh-research/releases/download/v0.4.0/dsh-research.tgz
npx @deepseek-ai/dsh@0.1.1-rc.2 --profile web --dump-config
```

Copy commands from the code block. The download argument is a plain URL, not `[URL](URL)`. The install creates a Web profile with the base and Web bundles; the configuration dump should include `@f1star/dsh-research` and its research rows. A successful dump confirms composition, not a running Web server.

### 3. Start the research workspace

```sh
npx @deepseek-ai/dsh@0.1.1-rc.2 web
```

Keep that terminal running and open the local URL it prints. In the browser, configure your model API key, select a workspace containing your PDFs, and open **科研工作区** in the sidebar. You may defer the key to inspect the interface, but model-assisted reading needs valid model credentials. For your first paper, ask in the conversation: “Import `papers/one.pdf`, register it in the paper library, and prepare an evidence-anchored reading pack.” Replace that example with a real readable PDF path; relative paths resolve from the session workspace. The paper will appear in the library after registration.

Stop the server with `Ctrl+C`. In a new terminal, start it again with both lines:

```sh
export DSH_HOME="$HOME/.dsh-research-v040"
npx @deepseek-ai/dsh@0.1.1-rc.2 web
```

### Optional: install a global dsh command

The steps above already work without it. If you prefer the shorter `dsh` command:

```sh
npm install --global @deepseek-ai/dsh@0.1.1-rc.2
dsh --version
```

After confirming the command works, `dsh` can replace `npx @deepseek-ai/dsh@0.1.1-rc.2` in the examples. Continue to set the same `DSH_HOME`. If your terminal still cannot find `dsh`, use the npx route and check the global npm executable directory in your PATH.

## Troubleshooting and source checkouts

- `zsh: command not found: dsh`: the shell cannot find a global CLI; entering a cloned repository does not install one. Use the npx commands above.
- `command not found: pnpm`: install pnpm as shown in prerequisites, then retry in a terminal where `pnpm --version` succeeds.
- No research sidebar: check the selected `DSH_HOME`, inspect `--profile web --dump-config` for the plugin rows, then restart the Web server after installation.
- Records appear missing: verify that you reused the same `DSH_HOME`. Do not delete storage or reinstall into an old home to suppress a version mismatch.
- This repository, `dsh-research`, contains the independent plugin, not the DSH launcher. `pnpm install` and `pnpm run build` here build the plugin; this repository has no `pnpm dsh` script.
- In the separate, enhanced Research Harness application source checkout, run `pnpm install`, `pnpm run build`, then `pnpm dsh --profile research` from its root. That uses its built-in research bundle, not this standalone 0.4 release. Do not install both research bundles into the same profile; their storage formats are not interchangeable. An unmodified upstream checkout may not contain the research preset.

## Recommended workflow

1. Import a PDF with `paper_import`, use `paper_reading_pack` for a bounded first pass over recognized key sections, inspect headings with `paper_outline`, find additional blocks with `paper_search`, and call `paper_read` before relying on a passage.
2. Register the retained document with `paper_library_register`. Keep the returned paper, source-version, document, block, parser-version, physical-page, and quote-hash identifiers with your notes.
3. Create a research question, capture exact evidence, and record reading notes or passage questions. Write source statements separately from explicit inferences.
4. When comparing numeric results, normalize the method, dataset, metric, value, unit, split, uncertainty, evaluation protocol, and conditions for each paper. Record an explicit comparison protocol only after the retained fields are compatible.
5. Use the matrix and audit views to find missing or stale support, then write structured synthesis findings that cite active source claims. Every durable finding stores the required `comparisonProtocolIds` service field; `research_synthesis_write` exposes it as the optional `comparison_protocol_ids` input and records an omitted input as an empty array. Source summaries cannot link a protocol. A non-empty array is accepted only on an inference, may contain only active, non-stale protocols, and requires `claim_ids` to include every `resultClaimId` from every observation in each linked protocol. Pass an explicit active synthesis id to `research_review_render` to obtain paged Markdown with `Comparison basis` sections plus evidence and bibliography ledgers.

You can describe the task in natural language; the agent chooses the tools. For example:

```text
Import papers/one.pdf and build a reading pack for its abstract, introduction, method, results, limitations, and conclusion. Use the outline and search tools for anything the pack misses, and read the surrounding blocks before relying on them. Register the paper, create a research question about dataset effects, capture exact evidence for each source statement, normalize the reported results, record a comparison protocol only when they are compatible, link it from a synthesis inference, and render that synthesis as a review draft.
```

`paper_reading_pack` recognizes a closed set of English and Chinese section labels and returns individually anchored source blocks, subject to the configured text budget and explicit `text_truncated` flags. It does not summarize those blocks, and an entry in `missing_roles` means only that the parser did not recognize a matching label. `research_review_render` likewise does not write new findings: it renders one selected active synthesis and labels source summaries, inferences, evidence relations, current verification state, and incomplete bibliography metadata. A linked inference also receives a `Comparison basis` drawn from its retained comparison protocols; that authored compatibility decision does not establish statistical significance or turn an inference into source text. Exact selected text is opt-in through `include_selected_quotes`; every continuation page must reuse the first page's `render_digest`, so a changed record cannot be silently combined with an earlier page. A `ready-with-warnings` result requires review before publication.

## Configuration

The bundle rows live in [`cordis.patch.yml`](cordis.patch.yml), while each plugin's schema supplies its defaults. A profile's own `cordis.patch.yml` is applied later and can override a row by `id`. A row override replaces its complete `config` value rather than merging individual keys, so retain `parserProvider: pdfjs` when overriding `f1star-research-document` unless another registered parser is intentional. The reading-pack controls on `f1star-tool-research-document` default to 12 blocks per section, at most 14 blocks per section, and at most 7 requested sections; `defaultReadingPackBlocksPerSection` must not exceed `maxReadingPackBlocksPerSection`, and `maxOutputTextChars` must be at least `maxReadingPackSections × maxReadingPackBlocksPerSection`. That text budget covers variable source fields; fixed provenance anchors and notices are additional bounded output. `f1star-research-information.maxClaimReferencesPerFinding` defaults to 256 so one comparison protocol at the default observation limit can retain every result claim; a finding that combines several protocols can still reach this explicit limit and should be split or deliberately reconfigured. `maxComparisonProtocolReferencesPerFinding` defaults to 64. `f1star-tool-research-information.maxReviewTextChars` defaults to 2,000,000 UTF-16 code units and fails a complete review closed before paging if that limit is exceeded.

For a custom profile, compose the bundles in this order:

1. `@deepseek-ai/dsh-base`
2. `@deepseek-ai/dsh-web-app`
3. `@f1star/dsh-research`

Installing this bundle into a custom profile that contains only the base bundle fails because the filesystem, tool, system-prompt, and durable-storage services supplied by the Web layer are absent.

## Data and limitations

- Paper identities, source observations, research questions, evidence, notes, claims, entities, observations, comparison protocols, and syntheses are stored in the selected profile's durable storage and can be visible across sessions using that storage.
- Original PDF bytes and exact parsed revisions are archived in profile storage and can be restored after restart. Back up the complete profile storage; a paper-library record alone is not an archive backup.
- PDF.js extracts native text only. Scanned documents need the optional [Docling setup](docs/ocr.md). OCR, formula, and chart outputs can contain recognition errors and must be verified against the original; extraction is not scientific validation.
- Reading-pack recognition depends on extracted heading labels and approximate reading order. A missing role does not establish that the paper omits the corresponding topic.
- Search and library matching are lexical. The bundle does not provide semantic retrieval, remote DOI or arXiv verification, automatic claim clustering, or automatic entity resolution.
- Numeric observations and comparison protocols are authored normalizations. Linking a protocol to a synthesis inference records its explicit comparison basis; the bundle still does not silently convert units or aliases, rank results, calculate deltas, infer statistical significance, or perform meta-analysis.
- `research_review_render` remains a deterministic Markdown projection with exact hashes, offsets, and opt-in selected text. The workspace additionally exports citation files and LaTeX through the report service; incomplete metadata and evidence remain visible as warnings. Neither path grants publication approval.
- Task checkpoints survive restart; running agent executions never silently restart. The execution service requires an explicit trusted-client start, uses bounded steps/time/concurrency, and stops for required human review. Dedicated execution start/stop/history controls in the browser are not yet included; task creation, progress inspection, pause, and resume are included.

## Upgrading from 0.3

Version 0.4 uses `research_library` version 2 and `research_information` version 7. Version 7 preserves standalone 0.3 synthesis comparison fields while adding human review records; it is not interchangeable with the source application's version 6. There is no automatic migration. Stop the old profile, back up its complete storage, and use separate fresh storage for 0.4. Unsupported versions fail without modifying old records; pin `v0.3.0` to reopen unchanged 0.3 data. Do not delete storage to suppress a version error. Older 0.2 data likewise requires its matching plugin version.

See [architecture](docs/architecture.md) for package roles, generated browser descriptors, and execution ownership. Run `pnpm install && pnpm run check` to build and test the standalone checkout; GitHub and release installations use committed prebuilt artifacts without install-time compilation.

## Update or remove

The quickstart pins a release-tarball URL. To change versions, read the target release's storage-compatibility notes, back up your data, and repeat `plugin --profile web add` with that release's exact tarball URL; a generic `update` does not select a new pinned URL for you. Restart after changing the installed plugin. Do not mix standalone storage with the source application's storage.

To remove the plugin from the isolated home used above, stop the Web server first, then run:

```sh
export DSH_HOME="$HOME/.dsh-research-v040"
npx @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web remove @f1star/dsh-research
```

Removing the bundle stops mounting its services and tools. It does not delete source PDFs, and research records can remain in the profile's storage; manage that storage separately if you need archival or deletion.

See the DeepSeek Harness guide to [packaging and installing bundle plugins](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md) for profile and layer behavior.

## License

MIT. This standalone distribution is derived from the DeepSeek Harness research packages and retains their 2026 DeepSeek copyright notice. See [LICENSE](LICENSE) and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
