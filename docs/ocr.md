# Optional Docling OCR / 可选 OCR

PDF.js extracts native text only. Docling is optional and is not enabled by installing this bundle. It uses a separately managed Python environment and may download model weights on first use. Allow for substantial disk space, memory, and conversion time. OCR, formula notation, and chart values require human verification against the original page.

默认 PDF.js 不进行 OCR。Docling 需独立 Python 环境，首次使用可能下载模型；生成的文字、公式和图表数值都必须对照原文检查。

From a checkout or extracted release, install the pinned requirements into your own Python environment:

```sh
python3 -m venv .venv-docling
.venv-docling/bin/python -m pip install -r resources/docling/requirements.txt
.venv-docling/bin/python -I resources/docling/py/parse.py --check
```

Add the provider to your profile's `cordis.patch.yml` and select it on the document service. Replace the example path with the absolute executable path. The subprocess provider must share the filesystem containing that interpreter and the shipped worker.

```yaml
- insert:
    - id: f1star-research-document-docling
      name: '@f1star/dsh-research/research-document-docling'
      config:
        pythonExecutable: /absolute/path/to/.venv-docling/bin/python
- id: f1star-research-document
  config:
    parserProvider: docling
```

Inspect the composition with `dsh --profile web --dump-config` before restarting. The required setting is `pythonExecutable`; optional controls include `device`, `threads`, `languages`, `forceFullPageOcr`, `formulas`, `charts`, `chartDescription`, `maxPages`, and `timeoutMs`. Startup checks the worker environment and fails explicitly on missing requirements. A custom `workerPath` must identify the same worker in the subprocess provider's execution world.

Use `paper_structure` to inspect bounded extraction pages pinned to the exact parser version. Generated text alone does not establish units, axis semantics, uncertainty, or formula definitions. Scientific-accuracy evaluation and automatic validation are not completed by this release.
