# @f1star/dsh-research

[English](README.md) | 简体中文

`@f1star/dsh-research` 是面向证据优先论文工作的可安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) bundle。它是 DSH bundle 插件，不是 Codex 插件，需要在现有 DSH profile 内运行。

本 bundle 提供本地原生文本 PDF 阅读、持久论文库和可审计的科研信息工作流。它保留精确来源锚点，并明确区分引文证据与作者撰写的笔记、推断、归一化、比较决策和综合结论。

## 提供的能力

| 能力 | 工具与行为 |
|---|---|
| 论文阅读 | `paper_import`、`paper_reading_pack`、`paper_outline`、`paper_search` 和 `paper_read` 用于导入本地 PDF、从可识别的关键章节收集有界原文片段、浏览结构、进行词法检索，并恢复带物理页索引、解析器版本和引文哈希锚点的精确上下文 block。 |
| 论文库 | `paper_library_register`、`paper_library_list`、`paper_library_get` 和 `paper_library_alias` 在 profile storage 中保留论文身份、书目信息 provenance、精确来源版本、解析器 observation 和可撤销 alias。 |
| 科研信息整合 | 科研问题、证据、笔记、claim、entity、observation、comparison protocol、synthesis、matrix、audit 和 `research_review_render` 操作可构建跨论文可追溯记录。Synthesis inference 可以保留明确的 comparison protocol，renderer 会在可继续编辑的 Markdown 中呈现该 comparison basis，同时避免把作者解释表述成来源原文。 |

这个独立 bundle 会在所选 profile 中同时挂载科研服务和面向模型的工具 Consumer。安装该 bundle 会明确向通过这个 profile 启动的每个 agent 授权：每个 agent 都可以看到科研工具 schema 及其稳定的 prompt 指导。

## 前置条件

- 已安装兼容版本的 `dsh`，并且 `pnpm` 可从 `PATH` 调用。
- 目标 profile 依次包含 `@deepseek-ai/dsh-base` 和 `@deepseek-ai/dsh-web-app`。随发行版提供的 `web` profile 已采用这一组合。
- 可通过 DSH 的常规凭据来源读取模型凭据。
- 会话的文件系统权限允许读取本地 PDF。相对文件路径从会话 workspace 解析。

## 安装与运行

将 bundle 安装到随发行版提供的 Web profile：

```sh
dsh plugin --profile web add github:F1star/dsh-research
dsh --profile web --dump-config
dsh web
```

如果随发行版提供的 `web` profile 尚不存在，安装命令会初始化它。启动前可通过配置转储确认 `@f1star/dsh-research` 层及其科研行已经出现。

GitHub 安装会跟随所选 Git ref。当可信的 tag 或 commit 可用后，可固定该版本以获得可复现安装：

```sh
dsh plugin --profile web add github:F1star/dsh-research#<tag-or-commit>
```

添加、更新或移除 bundle 后，请重启正在运行的 profile。

## 推荐工作流

1. 使用 `paper_import` 导入 PDF，以 `paper_reading_pack` 对可识别的关键章节进行有界初读，通过 `paper_outline` 查看标题结构，以 `paper_search` 补充定位相关 block，并在依赖某段内容前调用 `paper_read` 阅读其上下文。
2. 使用 `paper_library_register` 注册当前保留的文档。将返回的论文、来源版本、文档、block、解析器版本、物理页索引和引文哈希标识随笔记一同保留。
3. 创建科研问题，捕获精确证据，并记录阅读笔记或段落问题。将来源陈述与明确的推断分别记录。
4. 比较数值结果时，分别归一化每篇论文的方法、数据集、指标、数值、单位、数据划分、不确定性、评估协议和条件。只有保留字段兼容时，才记录明确的比较协议。
5. 使用 matrix 和 audit view 查找缺失或过期的支持，再撰写引用有效来源 claim 的结构化 synthesis finding。每个持久 finding 都会存储必需的服务字段 `comparisonProtocolIds`；`research_synthesis_write` 将其公开为可选输入 `comparison_protocol_ids`，省略该输入时会记录空数组。Source summary 不能关联 protocol。非空数组只能用于 inference，只能包含 active、non-stale protocol，并且 `claim_ids` 必须包含每个关联 protocol 中所有 observation 的 `resultClaimId`。将明确的 active synthesis id 传给 `research_review_render`，得到带 comparison basis、证据清单和书目清单的分页 Markdown。

你可以用自然语言描述任务，由 agent 选择工具。例如：

```text
导入 papers/one.pdf，并为摘要、引言、方法、结果、局限和结论构建 reading pack。对导读包遗漏的内容使用 outline 和 search 工具补充查找，并在依赖相关内容前阅读周围 block。注册这篇论文，创建一个关于数据集影响的科研问题，为每条来源陈述捕获精确证据，对报告结果进行归一化，只在结果兼容时记录 comparison protocol，从 synthesis inference 关联该 protocol，再把 synthesis 渲染成研究综述草稿。
```

`paper_reading_pack` 识别一组封闭的中英文章节标签，并在配置的文本预算内返回保留独立锚点的来源 block，同时通过 `text_truncated` 明确标记截断；它不会总结这些 block，`missing_roles` 只表示解析器没有识别出匹配标签。`research_review_render` 同样不会撰写新 finding：它只渲染一个明确选定的 active synthesis，并标注来源摘要、推断、证据关系、当前复核状态和不完整的书目信息。关联了 protocol 的 inference 还会获得一个来自持久 comparison protocol 的 `Comparison basis`；这一作者给出的兼容性决策不能证明统计显著性，也不会把 inference 变成来源原文。精确 selection 文本必须通过 `include_selected_quotes` 显式开启；续页必须复用第一页的 `render_digest`，从而避免把已变化的记录静默拼接到旧页面。`ready-with-warnings` 结果在发布前仍需人工检查。

## 配置

bundle 行位于 [`cordis.patch.yml`](cordis.patch.yml)，各插件的默认值由其配置 schema 提供。profile 自己的 `cordis.patch.yml` 会在其后应用，并可按 `id` 覆盖行。覆盖行时会替换完整的 `config` 值，而不是合并单个键，因此覆盖 `f1star-research-document` 时应保留 `parserProvider: pdfjs`，除非有意选择另一个已注册解析器。`f1star-tool-research-document` 的 reading-pack 默认每节返回 12 个 block、每节最多 14 个 block、一次最多请求 7 节；`defaultReadingPackBlocksPerSection` 不得超过 `maxReadingPackBlocksPerSection`，且 `maxOutputTextChars` 不得小于 `maxReadingPackSections × maxReadingPackBlocksPerSection`。该文本预算只覆盖可变来源字段；固定的 provenance 锚点与提示是额外的有界输出。`f1star-research-information.maxClaimReferencesPerFinding` 默认为 256，因此一个达到默认 observation 上限的 comparison protocol 仍可保留全部 result claim；组合多个 protocol 的 finding 仍可能触及这一明确上限，此时应拆分 finding 或有意调整配置。`maxComparisonProtocolReferencesPerFinding` 默认为 64。`f1star-tool-research-information.maxReviewTextChars` 默认最多允许完整 review 使用 2,000,000 个 UTF-16 code unit，并会在分页前超限时明确失败。

自定义 profile 应按以下顺序组合 bundle：

1. `@deepseek-ai/dsh-base`
2. `@deepseek-ai/dsh-web-app`
3. `@f1star/dsh-research`

如果自定义 profile 只包含 base bundle，安装本 bundle 后会因缺少 Web 层提供的文件系统、工具、system prompt 和持久 storage 服务而启动失败。

## 数据与限制

- 论文身份、来源 observation、科研问题、证据、笔记、claim、entity、observation、comparison protocol 和 synthesis 会写入所选 profile 的持久 storage，并可能对使用该 storage 的多个会话可见。
- 已解析 PDF 页面只存在于当前进程。重启后，必须重新导入 PDF 才能继续读取 block 或捕获新证据。论文库记录身份和 observation，不保存来源 PDF 字节。
- 证据记录保留精确 block 文本和 provenance，但重建历史 PDF 仍需要你自行持久保存来源文件。
- PDF.js 只提取原生文本。扫描版或纯图片文档需要在本 bundle 之外进行 OCR；本次导入不能支持文本 claim。
- Reading pack 的识别依赖提取出的章节标签和近似阅读顺序。角色未匹配不表示论文缺少相应主题。
- 检索与论文库匹配均为词法操作。本 bundle 不提供语义检索、远程 DOI 或 arXiv 验证、自动 claim 聚类或自动 entity resolution。
- 数值 observation 和 comparison protocol 是作者给出的归一化。将 protocol 关联到 synthesis inference 会记录其明确的 comparison basis；本 bundle 仍不会暗中转换单位或 alias，也不会对结果排序、计算差值、推断统计显著性或执行 meta-analysis。
- Review render 是对已保留记录的确定性 Markdown 投影，不是自动生成完整文献综述，也不是正式的 CSL/BibTeX 引用导出器。它始终输出精确 selection 哈希与偏移，仅在显式请求时披露选中文本，否则输出 locator 而不重复完整证据 block。

## 从 0.2 升级

0.3 将 `research_information` 持久 domain 从版本 4 提升到版本 5，因为每个 synthesis finding 现在都会存储一个必需的 comparison-protocol reference 数组。版本 4 数据不会自动迁移到版本 5。更新前请备份所选 profile 的 storage。如果其中已有版本 4 的科研信息数据，0.3 会因版本不匹配而拒绝打开该 domain，并保持原数据不变；将 bundle 固定回 `v0.2.0` 后即可再次访问这些数据。版本 1 的论文库 domain 不受影响。

## 更新或移除

```sh
dsh plugin --profile web update @f1star/dsh-research
dsh plugin --profile web remove @f1star/dsh-research
```

移除 bundle 后，其服务和工具不再挂载。此操作不会删除来源 PDF，科研记录也可能继续保留在 profile storage 中；如需归档或删除，请单独管理该 storage。

有关 profile 和层叠行为，请参阅 DeepSeek Harness 的 [bundle 插件打包与安装指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)。

## 许可证

MIT。本独立发行版派生自 DeepSeek Harness 科研包，并保留其 2026 DeepSeek 版权声明。详见 [LICENSE](LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
