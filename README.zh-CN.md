# @f1star/dsh-research

[English](README.md) | 简体中文

首次使用请从[前置条件](#前置条件)和[安装与运行](#安装与运行)开始，无需预先安装全局 `dsh` 命令。

`@f1star/dsh-research` 是面向证据优先论文工作的可安装 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) bundle。它是 DSH bundle 插件，不是 Codex 插件，需要在现有 DSH profile 内运行。

0.4 版提供原始 PDF 归档、科研工作台、可选 OCR、人工审阅、带引用的报告导出和可恢复科研任务。它保留精确来源锚点，并明确区分引文证据与作者撰写的笔记、推断、归一化、比较决策和综合结论。

**升级提醒：0.3 的 profile 数据不能直接由 0.4 打开。请先备份完整存储，并为 0.4 使用独立的新存储，详见“从 0.3 升级”。**

## 提供的能力

| 能力 | 工具与行为 |
|---|---|
| 论文阅读 | `paper_import`、`paper_reading_pack`、`paper_outline`、`paper_search` 和 `paper_read` 用于导入本地 PDF、从可识别的关键章节收集有界原文片段、浏览结构、进行词法检索，并恢复带物理页索引、解析器版本和引文哈希锚点的精确上下文 block。 |
| 论文库 | `paper_library_register`、`paper_library_list`、`paper_library_get` 和 `paper_library_alias` 在 profile storage 中保留论文身份、书目信息 provenance、精确来源版本、解析器 observation 和可撤销 alias。 |
| 科研信息整合 | 科研问题、证据、笔记、claim、entity、observation、comparison protocol、synthesis、matrix、audit 和 `research_review_render` 操作可构建跨论文可追溯记录。Synthesis inference 可以保留明确的 comparison protocol，renderer 会在可继续编辑的 Markdown 中呈现该 comparison basis，同时避免把作者解释表述成来源原文。 |

这个独立 bundle 会在所选 profile 中同时挂载科研服务和面向模型的工具 Consumer。安装该 bundle 会明确向通过这个 profile 启动的每个 agent 授权：每个 agent 都可以看到科研工具 schema 及其稳定的 prompt 指导。

## 前置条件

使用 Node.js 24 LTS（包含 npm 和 npx）。支持的 Node 范围为 `^22.19.0 || >=24.0.0`。先在终端检查：

```sh
node --version
npm --version
pnpm --version
```

如果找不到 `node` 或 `npm`，请先安装 Node.js 24 LTS，再重新打开终端。如果只是缺少 `pnpm`，执行：

```sh
npm install --global pnpm@11.7.0
pnpm --version
```

即使通过 npx 启动，DSH 也需要调用 pnpm 安装 profile 插件。默认 PDF 阅读不需要 Python；只有可选的 [OCR](docs/ocr.md) 需要独立 Python 环境。

## 安装与运行

### 1. 为 0.4 选择独立存储

以下命令适用于 macOS/Linux 终端，包括 zsh。无需克隆本仓库，也无需预先全局安装 `dsh`。请在同一个终端中依次执行。

```sh
export DSH_HOME="$HOME/.dsh-research-v040"
```

首次配置时，请选择不含旧版 DSH 数据的目录，DSH 会按需创建它。这里将配置、凭据与默认存储隔离到新目录，不迁移也不删除旧数据。仅换一个 profile 名称不一定能隔离存储。以后继续使用同一个 `DSH_HOME`，才能打开本次保存的 0.4 数据。

### 2. 安装已发布插件

以下固定使用本次发布验证过的宿主版本。如果 npx 提示安装宿主包，输入 `y`。宿主的 `0.1.1-rc.2` 和科研插件的 `0.4.0` 是两个独立版本号。

```sh
npx @deepseek-ai/dsh@0.1.1-rc.2 --version
npx @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web add https://github.com/F1star/dsh-research/releases/download/v0.4.0/dsh-research.tgz
npx @deepseek-ai/dsh@0.1.1-rc.2 --profile web --dump-config
```

请复制代码块里的命令。下载参数是纯 URL，不是 `[网址](网址)`。安装会初始化包含 base 和 Web bundle 的 profile；配置输出中应出现 `@f1star/dsh-research` 及其科研行。配置转储成功只表示组合成功，还没有启动网页服务。

### 3. 启动科研工作台

```sh
npx @deepseek-ai/dsh@0.1.1-rc.2 web
```

保持终端运行，打开它输出的本地网址。在浏览器中配置模型 API Key，选择包含论文 PDF 的工作区，再点击侧栏的 **科研工作区**。可以选择稍后配置 Key 来浏览界面，但模型辅助阅读需要有效的模型凭据。首次使用可在对话中输入：“导入 `papers/one.pdf`，登记到论文库，并生成带原文证据锚点的导读包。”请替换为真实、可读取的 PDF 路径；相对路径以会话工作区为基准。登记后，论文才会出现在文献列表中。

按 `Ctrl+C` 停止服务。下次新开终端时，两行都要执行：

```sh
export DSH_HOME="$HOME/.dsh-research-v040"
npx @deepseek-ai/dsh@0.1.1-rc.2 web
```

### 可选：安装全局 dsh 命令

上面的流程不需要全局命令。如果希望以后直接输入 `dsh`，可以执行：

```sh
npm install --global @deepseek-ai/dsh@0.1.1-rc.2
dsh --version
```

确认命令可用后，可将示例中的 `npx @deepseek-ai/dsh@0.1.1-rc.2` 换成 `dsh`，但仍需设置相同的 `DSH_HOME`。如果终端依旧找不到 `dsh`，先使用 npx 路线，并检查 PATH 是否包含 npm 的全局可执行文件目录。

## 常见问题与源码运行

- `zsh: command not found: dsh`：终端找不到全局 CLI；进入克隆的仓库不会自动安装该命令。使用上面的 npx 命令即可。
- `command not found: pnpm`：按前置条件安装 pnpm，确认当前终端能运行 `pnpm --version` 后重试。
- 没有科研侧栏：检查 `DSH_HOME` 是否正确，通过 `--profile web --dump-config` 确认科研行已加载，并在安装后重启 Web 服务。
- 原有记录不见了：先确认是否使用了同一个 `DSH_HOME`。不要通过删除存储或向旧目录重新安装来消除版本不匹配错误。
- 本仓库 `dsh-research` 是独立插件仓库，不是 DSH 启动器。在这里运行 `pnpm install` 和 `pnpm run build` 只会构建插件；本仓库没有 `pnpm dsh` 脚本。
- 如果使用另一个增强版 Research Harness 应用源码仓库，请在那个仓库的根目录依次运行 `pnpm install`、`pnpm run build`、`pnpm dsh --profile research`。这会使用源码内置科研 bundle，不是独立插件的 0.4 发行版。不要将两套科研 bundle 装入同一 profile；它们的存储格式不能互换。未经改造的上游 checkout 可能没有 research preset。

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
- 原始 PDF 字节及其精确解析版本会归档到 profile storage，重启后可以恢复。请备份整个 profile storage；仅导出论文库记录不等于备份原文。
- PDF.js 默认只提取原生文本。扫描文档需配置可选 [Docling OCR](docs/ocr.md)。`paper_structure` 可分页检查带定位的科学内容提取结果；OCR、公式与图表提取可能出错，必须对照原文复核。
- Reading pack 的识别依赖提取出的章节标签和近似阅读顺序。角色未匹配不表示论文缺少相应主题。
- 检索与论文库匹配均为词法操作。本 bundle 不提供语义检索、远程 DOI 或 arXiv 验证、自动 claim 聚类或自动 entity resolution。
- 数值 observation 和 comparison protocol 是作者给出的归一化。将 protocol 关联到 synthesis inference 会记录其明确的 comparison basis；本 bundle 仍不会暗中转换单位或 alias，也不会对结果排序、计算差值、推断统计显著性或执行 meta-analysis。
- `research_review_render` 保留精确哈希、偏移和按需披露原文的确定性 Markdown 输出；工作台新增报告服务，可导出 Markdown、LaTeX、BibTeX、CSL-JSON 和完整 provenance 文件。缺失书目或证据仍会明确警告，两种输出都不代表获准发表。
- 在 Web 侧栏打开 Research，可浏览归档 PDF、保存阅读位置、写笔记、查看证据矩阵，并以注册研究者身份审阅论断与数值结果。
- `research_task_list`、`research_task_get`、`research_task_write` 保存阶段检查点、暂停与恢复状态。检查点可跨重启恢复，运行中的 agent 不会自动重启。执行服务需要可信客户端显式启动，具有步骤、时间、并发限制，并在需要人工审阅时停止。浏览器已包含任务创建、进度查看、暂停与恢复，但尚未加入执行器的启动、停止和运行历史按钮。

## 从 0.3 升级

0.4 使用 `research_library` 版本 2 和 `research_information` 版本 7。版本 7 将人工审阅记录与独立插件 0.3 的比较溯源字段合并，不等同于源码应用的版本 6。没有自动迁移：请停止旧 profile，备份完整存储，并为 0.4 使用独立的新存储。不支持的版本会被拒绝打开，不会改写原有记录；固定回 `v0.3.0` 可再次打开未改动的 0.3 数据。不要通过删除存储来消除版本错误。更早的 0.2 数据同样需要匹配的旧插件。

包职责、浏览器生成描述符和任务执行归属见[架构说明](docs/architecture.md)。开发检验使用 `pnpm install && pnpm run check`；GitHub 和 release 安装使用预构建产物，不需要安装时编译。

## 更新或移除

本教程固定安装 release 压缩包的 URL。更换版本时，请先阅读目标版本的存储兼容说明、备份数据，再使用那个版本的精确压缩包 URL 重新执行 `plugin --profile web add`；普通 `update` 不会替你选择新的固定 URL。更换插件后需重启。不要将独立插件与源码应用的存储混用。

如需从上述独立目录中移除插件，请先停止 Web 服务，再执行：

```sh
export DSH_HOME="$HOME/.dsh-research-v040"
npx @deepseek-ai/dsh@0.1.1-rc.2 plugin --profile web remove @f1star/dsh-research
```

移除 bundle 后，其服务和工具不再挂载。此操作不会删除来源 PDF，科研记录也可能继续保留在 profile storage 中；如需归档或删除，请单独管理该 storage。

有关 profile 和层叠行为，请参阅 DeepSeek Harness 的 [bundle 插件打包与安装指南](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)。

## 许可证

MIT。本独立发行版派生自 DeepSeek Harness 科研包，并保留其 2026 DeepSeek 版权声明。详见 [LICENSE](LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
