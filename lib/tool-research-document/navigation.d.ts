/** Source anchors, extraction states, and argument validation for paper navigation tools. */
import { ResearchDocumentId, ResearchDocumentBlockId, type ResearchDocumentBlockLocator } from '../research-document/index.ts';
/** Snake-case source anchor shared by paper navigation results. */
export interface ProjectedLocator {
    readonly kind: 'block';
    readonly document_id: string;
    readonly block_id: string;
    readonly parser_id: string;
    readonly parser_version: string;
    readonly page_index: number;
    readonly page_label?: string;
    readonly bbox: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    };
    readonly quote_hash: string;
}
/** Extraction states retained in model-visible navigation results. */
export declare const EXTRACTION_SCHEMA: {
    readonly oneOf: readonly [{
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly text: {
                readonly type: "string";
                readonly required: true;
                readonly enum: readonly ["native", "ocr-assisted"];
            };
            readonly layout: {
                readonly type: "string";
                readonly required: true;
                readonly const: "approximate";
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly text: {
                readonly type: "string";
                readonly required: true;
                readonly const: "none";
            };
            readonly layout: {
                readonly type: "string";
                readonly required: true;
                readonly const: "page-only";
            };
        };
    }];
};
/** Complete source anchor fields exposed by paper tools. */
export declare const LOCATOR_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly properties: {
        readonly kind: {
            readonly type: "string";
            readonly required: true;
            readonly const: "block";
        };
        readonly document_id: {
            readonly type: "string";
            readonly required: true;
        };
        readonly block_id: {
            readonly type: "string";
            readonly required: true;
        };
        readonly parser_id: {
            readonly type: "string";
            readonly required: true;
        };
        readonly parser_version: {
            readonly type: "string";
            readonly required: true;
        };
        readonly page_index: {
            readonly type: "integer";
            readonly required: true;
        };
        readonly page_label: {
            readonly type: "string";
        };
        readonly bbox: {
            readonly required: true;
            readonly type: "object";
            readonly additionalProperties: false;
            readonly properties: {
                readonly x: {
                    readonly type: "number";
                    readonly required: true;
                };
                readonly y: {
                    readonly type: "number";
                    readonly required: true;
                };
                readonly width: {
                    readonly type: "number";
                    readonly required: true;
                };
                readonly height: {
                    readonly type: "number";
                    readonly required: true;
                };
            };
        };
        readonly quote_hash: {
            readonly type: "string";
            readonly required: true;
        };
    };
};
/**
 * Validate a model-supplied document identity.
 * @param value - exact content id.
 * @returns branded document id.
 */
export declare function parseDocumentId(value: string): ReturnType<typeof ResearchDocumentId>;
/**
 * Validate a model-supplied block identity.
 * @param value - exact block id.
 * @returns branded block id.
 */
export declare function parseBlockId(value: string): ReturnType<typeof ResearchDocumentBlockId>;
/**
 * Resolve a positive bounded item count.
 * @param name - diagnostic field name.
 * @param value - optional requested count.
 * @param maximum - configured ceiling and default.
 * @returns resolved count.
 */
export declare function boundedOptionalCount(name: string, value: number | undefined, maximum: number): number;
/**
 * Resolve a non-negative safe offset.
 * @param name - diagnostic field name.
 * @param value - optional requested offset.
 * @param fallback - default offset.
 * @returns resolved offset.
 */
export declare function nonNegativeOptionalCount(name: string, value: number | undefined, fallback: number): number;
/**
 * Project a source-owned locator into tool JSON.
 * @param locator - exact block anchor.
 * @returns detached locator fields.
 */
export declare function projectLocator(locator: ResearchDocumentBlockLocator): ProjectedLocator;
/**
 * Tag the complete navigation value for tool presentation.
 * @param kind - presentation tag.
 * @param value - result fields.
 * @returns versioned presentation metadata.
 */
export declare function taggedMeta<T>(kind: string, value: T): {
    kind: string;
    version: number;
    value: T;
};
//# sourceMappingURL=navigation.d.ts.map