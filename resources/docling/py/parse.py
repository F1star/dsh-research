"""One-shot Docling worker; stdout contains only a versioned extraction response."""

import base64
import contextlib
import hashlib
import importlib.metadata
import io
import json
import sys
from pathlib import Path


def rectangle(box, width, height):
    """Project Docling's explicit coordinate origin into the source page."""
    top = box.t if box.coord_origin.value == "TOPLEFT" else height - box.t
    bottom = box.b if box.coord_origin.value == "TOPLEFT" else height - box.b
    left, right = max(0.0, box.l), min(width, box.r)
    top, bottom = max(0.0, top), min(height, bottom)
    if right < left or bottom < top:
        raise ValueError("extracted rectangle is outside its source page")
    return {"x": left / width, "y": top / height,
            "width": (right - left) / width, "height": (bottom - top) / height}


def table_data(data, size=None):
    """Retain text, spans and header flags without numeric conversion."""
    cells = []
    for cell in data.table_cells:
        value = {"row": cell.start_row_offset_idx, "column": cell.start_col_offset_idx,
                 "rowSpan": cell.row_span, "columnSpan": cell.col_span,
                 "text": cell.text, "columnHeader": cell.column_header,
                 "rowHeader": cell.row_header}
        if size is not None and cell.bbox is not None:
            value["bbox"] = rectangle(cell.bbox, size.width, size.height)
        cells.append(value)
    return {"rows": data.num_rows, "columns": data.num_cols, "cells": cells}


def normalize(document, options):
    """Keep recognized source text separate from formula and chart interpretations."""
    from docling_core.types.doc import TableItem, PictureItem, TextItem

    pages = [{"pageIndex": number - 1, "width": page.size.width,
              "height": page.size.height, "blocks": []}
             for number, page in sorted(document.pages.items())]
    for item, _level in document.iterate_items():
        if not item.prov:
            continue
        text = item.orig if isinstance(item, TextItem) else ""
        structure = None
        if isinstance(item, TableItem):
            size = document.pages[item.prov[0].page_no].size if len(item.prov) == 1 else None
            data = table_data(item.data, size)
            text = "\n".join("\t".join(c["text"] for c in data["cells"] if c["row"] == row)
                             for row in range(data["rows"]))
            structure = {"kind": "table", "data": data,
                         "captions": [r.resolve(document).text for r in item.captions],
                         "footnotes": [r.resolve(document).text for r in item.footnotes]}
        elif isinstance(item, PictureItem):
            meta = item.meta
            chart = None if meta is None else meta.tabular_chart
            description = None if meta is None or meta.description is None else meta.description.text
            classification = None
            if meta is not None and meta.classification is not None:
                classification = meta.classification.get_main_prediction().class_name
            captions = [r.resolve(document).text for r in item.captions]
            text = "\n".join(captions)
            structure = {"kind": "figure", "captions": captions,
                         "footnotes": [r.resolve(document).text for r in item.footnotes],
                         "classification": classification,
                         "chartData": None if chart is None else table_data(chart.chart_data),
                         "description": description,
                         "status": "extracted" if chart is not None or description else
                         "unavailable" if options["charts"] else "not-requested"}
        elif item.label.value == "formula":
            latex = item.text.strip() if options["formulas"] else ""
            structure = {"kind": "formula", "latex": latex or None,
                         "status": "extracted" if latex else
                         "unavailable" if options["formulas"] else "not-requested"}
        for index, provenance in enumerate(item.prov):
            page = pages[provenance.page_no - 1]
            block = {"kind": "heading" if item.label.value in ("title", "section_header") else "paragraph",
                     "text": text if index == 0 else "",
                     "bbox": rectangle(provenance.bbox, page["width"], page["height"])}
            if block["kind"] == "heading":
                block["headingLevel"] = min(3, max(1, getattr(item, "level", 1)))
            if structure is not None and index == 0:
                block["structure"] = structure
            page["blocks"].append(block)
    result = {"extraction": {"text": "ocr-assisted", "layout": "approximate"}, "pages": pages}
    digest = hashlib.sha256(json.dumps(result, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    result["parserVersion"] = "docling-" + importlib.metadata.version("docling-slim") + "-v1-" + digest
    return result


def convert(request):
    """Convert bounded PDF bytes using explicitly selected enrichment stages."""
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.pipeline_options import PdfPipelineOptions, RapidOcrOptions
    from docling.datamodel.accelerator_options import AcceleratorOptions
    from docling.document_converter import DocumentConverter, PdfFormatOption
    from docling_core.types.io import DocumentStream

    if request["protocol"] != 1:
        raise ValueError("unsupported research Docling worker protocol")
    source = base64.b64decode(request["sourceBase64"], validate=True)
    options = request["options"]
    if len(source) > options["maxSourceBytes"]:
        raise ValueError("PDF exceeds maxSourceBytes")
    pipeline = PdfPipelineOptions()
    pipeline.do_ocr = True
    pipeline.ocr_options = RapidOcrOptions(force_full_page_ocr=options["forceFullPageOcr"], lang=options["languages"])
    pipeline.do_table_structure = True
    pipeline.do_formula_enrichment = options["formulas"]
    pipeline.do_chart_extraction = options["charts"]
    pipeline.chart_extraction_options.chart2summary = options["chartDescription"]
    pipeline.accelerator_options = AcceleratorOptions(device=options["device"], num_threads=options["threads"])
    converter = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline)})
    result = converter.convert(DocumentStream(name="source.pdf", stream=io.BytesIO(source)),
                               max_num_pages=options["maxPages"], max_file_size=options["maxSourceBytes"])
    if result.status.value != "success":
        raise ValueError("Docling conversion did not finish successfully: " + result.status.value)
    return normalize(result.document, options)


def main():
    """Reserve stdout for one bounded response and route library diagnostics to stderr."""
    if sys.argv[1] == '--check':
        from docling.document_converter import DocumentConverter
        from rapidocr import RapidOCR
        from packaging.requirements import Requirement
        for line in (Path(__file__).resolve().parent.parent / 'requirements.txt').read_text().splitlines():
            requirement = Requirement(line)
            if importlib.metadata.version(requirement.name) not in requirement.specifier:
                raise ValueError('Install the pinned scientific parser dependency: ' + str(requirement))
        sys.stdout.write(json.dumps({'protocol': 1, 'ready': True}))
        return
    limit = int(sys.argv[1])
    raw = sys.stdin.buffer.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("worker request exceeds configured input limit")
    request = json.loads(raw)
    with contextlib.redirect_stdout(sys.stderr):
        parsed = convert(request)
    output = json.dumps({"protocol": 1, "parsed": parsed}, ensure_ascii=False, allow_nan=False).encode()
    if len(output) > request["options"]["maxOutputBytes"]:
        raise ValueError("extracted document exceeds maxOutputBytes")
    sys.stdout.buffer.write(output)


if __name__ == "__main__":
    main()
