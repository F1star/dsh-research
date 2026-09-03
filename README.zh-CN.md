# @f1star/dsh-research

[English](README.md) | 简体中文

`@f1star/dsh-research` 是面向证据优先论文工作的可安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) bundle。它是 DSH bundle 插件，不是 Codex 插件，需要在现有 DSH profile 内运行。

本 bundle 提供本地原生文本 PDF 阅读、持久论文库和可审计的科研信息工作流。它保留精确来源锚点，并明确区分引文证据与作者撰写的笔记、推断、归一化、比较决策和综合结论。

## 提供的能力

| 能力 | 工具与行为 |
|---|---|
| 论文阅读 | `paper_import`、`paper_outline`、`paper_search` 和 `paper_read` 用于导入本地 PDF、浏览结构、进行词法检索，并恢复带物理页索引、解析器版本和引文哈希锚点的精确上下文 block。 |
| 论文库 | `paper_library_register`、`paper_library_list`、`paper_library_get` 和 `paper_library_alias` 在 profile storage 中保留论文身份、书目信息 provenance、精确来源版本、解析器 observation 和可撤销 alias。 |
| 科研信息整合 | 科研问题、证据、笔记、claim、entity、observation、comparison protocol、synthesis、matrix 和 audit 操作可构建跨论文可追溯记录，同时避免把作者解释表述成来源原文。 |

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

1. 使用 `paper_import` 导入 PDF，通过 `paper_outline` 查看标题结构，以 `paper_search` 定位相关 block，并在依赖某段内容前调用 `paper_read` 阅读其上下文。
2. 使用 `paper_library_register` 注册当前保留的文档。将返回的论文、来源版本、文档、block、解析器版本、物理页索引和引文哈希标识随笔记一同保留。
3. 创建科研问题，捕获精确证据，并记录阅读笔记或段落问题。将来源陈述与明确的推断分别记录。
4. 比较数值结果时，分别归一化每篇论文的方法、数据集、指标、数值、单位、数据划分、不确定性、评估协议和条件。只有保留字段兼容时，才记录明确的比较协议。
5. 使用 matrix 和 audit view 查找缺失或过期的支持，再撰写引用有效来源 claim 的结构化 synthesis finding。

你可以用自然语言描述任务，由 agent 选择工具。例如：

```text
导入 papers/one.pdf，显示论文结构并查找讨论评估数据集的段落。请先阅读相关 block 的上下文再总结。注册这篇论文，创建一个关于数据集影响的科研问题，为每条来源陈述捕获精确证据，并在综合结论前展示 audit view。
```

## 配置

bundle 的默认配置位于 [`cordis.patch.yml`](cordis.patch.yml)。profile 自己的 `cordis.patch.yml` 会在其后应用，并可按 `id` 覆盖行。覆盖行时会替换完整的 `config` 值，而不是合并单个键，因此覆盖 `f1star-research-document` 时应保留 `parserProvider: pdfjs`，除非有意选择另一个已注册解析器。

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
- 检索与论文库匹配均为词法操作。本 bundle 不提供语义检索、远程 DOI 或 arXiv 验证、自动 claim 聚类或自动 entity resolution。
- 数值 observation 和 comparison protocol 是作者给出的归一化。本 bundle 不会暗中转换单位或 alias，也不会对结果排序、计算差值、推断统计显著性、执行 meta-analysis、生成完整文献综述或导出引用。

## 更新或移除

```sh
dsh plugin --profile web update @f1star/dsh-research
dsh plugin --profile web remove @f1star/dsh-research
```

移除 bundle 后，其服务和工具不再挂载。此操作不会删除来源 PDF，科研记录也可能继续保留在 profile storage 中；如需归档或删除，请单独管理该 storage。

有关 profile 和层叠行为，请参阅 DeepSeek Harness 的 [bundle 插件打包与安装指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)。

## 许可证

MIT。本独立发行版派生自 DeepSeek Harness 科研包，并保留其 2026 DeepSeek 版权声明。详见 [LICENSE](LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
