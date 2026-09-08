/**
 * Provider and consumer types for parsed research documents. Runtime id
 * factories and error classes live in the package root.
 * @module @deepseek-ai/dsh-research-document/types
 */
import type { Branded } from '@deepseek-ai/dsh-brand';
/** Content-derived identity of one exact imported document version. */
export type ResearchDocumentId = Branded<'ResearchDocumentId'>;
/** Stable identity of one parsed block inside an exact document version. */
export type ResearchDocumentBlockId = Branded<'ResearchDocumentBlockId'>;
/** Content hash of the complete text carried by one block anchor. */
export type ResearchDocumentQuoteHash = Branded<'ResearchDocumentQuoteHash'>;
/** Rectangle normalized to the page's top-left coordinate space. */
export interface ResearchDocumentRect {
    /** Horizontal offset divided by page width. */
    readonly x: number;
    /** Vertical offset divided by page height. */
    readonly y: number;
    /** Rectangle width divided by page width. */
    readonly width: number;
    /** Rectangle height divided by page height. */
    readonly height: number;
}
/** Whole-block anchor returned with every model-visible research excerpt. */
export interface ResearchDocumentBlockLocator {
    readonly kind: 'block';
    readonly documentId: ResearchDocumentId;
    readonly blockId: ResearchDocumentBlockId;
    /** Parser implementation that produced the ordered block. */
    readonly parserId: string;
    /** Parser extraction revision that produced the ordered block. */
    readonly parserVersion: string;
    /** Zero-based physical page index. */
    readonly pageIndex: number;
    /** Printed page label when the source declares one. */
    readonly pageLabel?: string;
    readonly bbox: ResearchDocumentRect;
    readonly quoteHash: ResearchDocumentQuoteHash;
}
/** One ordered, independently addressable text block. */
export interface ResearchDocumentBlock {
    readonly id: ResearchDocumentBlockId;
    readonly kind: 'heading' | 'paragraph';
    readonly text: string;
    /** Machine-extracted scientific content; generated interpretations are not block quotations. */
    readonly structure?: ResearchDocumentStructure;
    /** Heading ancestry after applying this block. */
    readonly sectionPath: readonly string[];
    /** Heading level when `kind` is `heading`. */
    readonly headingLevel?: 1 | 2 | 3;
    /** Zero-based physical page index. */
    readonly pageIndex: number;
    /** Monotonic order across the complete document. */
    readonly readingOrder: number;
    readonly locator: ResearchDocumentBlockLocator;
}
/** One physical source page and its extracted blocks. */
export interface ResearchDocumentPage {
    /** Zero-based physical page index. */
    readonly pageIndex: number;
    /** Printed page label when the source declares one. */
    readonly pageLabel?: string;
    /** Page width in provider display units. */
    readonly width: number;
    /** Page height in provider display units. */
    readonly height: number;
    readonly blocks: readonly ResearchDocumentBlock[];
}
/** Extraction quality state that consumers must preserve in output. */
export type ResearchDocumentExtraction = {
    readonly text: 'native';
    readonly layout: 'approximate';
} | {
    readonly text: 'ocr-assisted';
    readonly layout: 'approximate';
} | {
    readonly text: 'none';
    readonly layout: 'page-only';
};
/** One extracted cell. Offsets are zero-based; merged cells occupy their full span. */
export interface ResearchDocumentTableCell {
    readonly row: number;
    readonly column: number;
    readonly rowSpan: number;
    readonly columnSpan: number;
    readonly text: string;
    readonly columnHeader: boolean;
    readonly rowHeader: boolean;
    /** Source-page coordinates when supplied by the extractor; absent for generated chart data. */
    readonly bbox?: ResearchDocumentRect;
}
/** Extracted cell grid; empty text is retained and is not a numeric zero. */
export interface ResearchDocumentTable {
    readonly rows: number;
    readonly columns: number;
    readonly cells: readonly ResearchDocumentTableCell[];
}
/** Scientific object extracted from a located block; all values require interpretation review. */
export type ResearchDocumentStructure = {
    readonly kind: 'table';
    readonly data: ResearchDocumentTable;
    readonly captions: readonly string[];
    readonly footnotes: readonly string[];
} | {
    readonly kind: 'formula';
    /** Recognized notation, not a claim that the equation or its transcription is correct. */
    readonly latex: string | null;
    readonly status: 'extracted' | 'not-requested' | 'unavailable';
} | {
    readonly kind: 'figure';
    readonly captions: readonly string[];
    readonly footnotes: readonly string[];
    /** Predicted figure class; null when no classifier result is available. */
    readonly classification: string | null;
    /** Vision-generated values, distinct from original captions and OCR text. */
    readonly chartData: ResearchDocumentTable | null;
    readonly description: string | null;
    readonly status: 'extracted' | 'not-requested' | 'unavailable';
};
/** Readonly parsed representation retained by the runtime. */
export interface ResearchDocument {
    readonly id: ResearchDocumentId;
    readonly mediaType: string;
    readonly title?: string;
    readonly parser: {
        readonly id: string;
        readonly version: string;
    };
    readonly extraction: ResearchDocumentExtraction;
    readonly pageCount: number;
    readonly blockCount: number;
    readonly pages: readonly ResearchDocumentPage[];
}
/** Provider-owned block before the runtime adds content-derived anchors. */
export interface ParsedResearchDocumentBlock {
    readonly kind: 'heading' | 'paragraph';
    readonly text: string;
    readonly structure?: ResearchDocumentStructure;
    readonly bbox: ResearchDocumentRect;
    readonly headingLevel?: 1 | 2 | 3;
}
/** Provider-owned physical page before runtime materialization. */
export interface ParsedResearchDocumentPage {
    /** Zero-based physical page index. */
    readonly pageIndex: number;
    /** Printed page label when the source declares one. */
    readonly pageLabel?: string;
    readonly width: number;
    readonly height: number;
    readonly blocks: readonly ParsedResearchDocumentBlock[];
}
/** Complete provider result for one exact byte snapshot. */
export interface ResearchDocumentParseResult {
    readonly parserVersion: string;
    readonly title?: string;
    readonly extraction: ResearchDocumentExtraction;
    readonly pages: readonly ParsedResearchDocumentPage[];
}
/** Request passed from the runtime to a selected parser. */
export interface ResearchDocumentParseRequest {
    /**
     * Runtime-owned snapshot borrowed until `parse()` settles. A parser must not
     * mutate these bytes or retain them after its returned promise settles.
     */
    readonly bytes: Uint8Array;
    readonly mediaType: string;
}
/** Named parser implementation registered on the runtime. */
export interface ResearchDocumentParser {
    readonly id: string;
    /** Cheap local check; must not perform parsing or network I/O. */
    available(): boolean;
    /** Return whether this parser accepts the supplied media type. */
    supports(mediaType: string): boolean;
    /** Parse one complete, consumer-bounded runtime snapshot without retaining it. */
    parse(request: ResearchDocumentParseRequest, signal?: AbortSignal): Promise<ResearchDocumentParseResult>;
}
/** Exact extraction implementation and revision used by an archived snapshot. */
export interface ResearchDocumentParserIdentity {
    readonly id: string;
    readonly version: string;
}
/** Source bytes and parser output saved together before publishing an import. */
export interface ResearchDocumentSnapshot {
    readonly documentId: ResearchDocumentId;
    readonly mediaType: string;
    /** Owned source snapshot; callers must not mutate the bytes. */
    readonly bytes: Uint8Array;
    readonly parserId: string;
    readonly parsed: ResearchDocumentParseResult;
}
/** Optional durable provider. Stored bytes and parsed revisions must remain exact. */
export interface ResearchDocumentArchive {
    /**
     * Commit a source and parser revision atomically without discarding older revisions.
     * @param snapshot - runtime-owned bytes and complete parser result.
     * @returns resolution after durability; failure leaves the archive unchanged.
     */
    save(snapshot: ResearchDocumentSnapshot): Promise<void>;
    /**
     * Recover a validated snapshot without reparsing or requiring the original file.
     * @param documentId - exact content-derived document id.
     * @param parser - exact historical parser; omission selects the last saved revision.
     * @returns saved snapshot, or undefined when that document or revision is absent.
     */
    load(documentId: ResearchDocumentId, parser?: ResearchDocumentParserIdentity): Promise<ResearchDocumentSnapshot | undefined>;
}
/** One outline entry projected from a parsed heading block. */
export interface ResearchDocumentOutlineEntry {
    readonly text: string;
    readonly level: 1 | 2 | 3;
    readonly locator: ResearchDocumentBlockLocator;
}
/** One deterministic in-document search hit. */
export interface ResearchDocumentSearchHit {
    readonly text: string;
    readonly score: number;
    readonly locator: ResearchDocumentBlockLocator;
}
/** Bounded block window around one requested focus block. */
export interface ResearchDocumentReadResult {
    readonly focusBlockId: ResearchDocumentBlockId;
    readonly blocks: readonly ResearchDocumentBlock[];
}
//# sourceMappingURL=types.d.ts.map