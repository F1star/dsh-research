/** Tool-result fields for unreviewed scientific extraction, separate from block quotations. */
import type { ResearchDocumentStructure } from '../research-document/index.ts';
import type { InferValue } from '@deepseek-ai/dsh-tools';
/** Exact structure projection used by paper_read's JSON result. */
export declare const STRUCTURE_SCHEMA: {
    readonly oneOf: readonly [{
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly kind: {
                readonly type: "string";
                readonly required: true;
                readonly const: "table";
            };
            readonly data: {
                readonly required: true;
                readonly type: "object";
                readonly additionalProperties: false;
                readonly properties: {
                    readonly rows: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly columns: {
                        readonly type: "integer";
                        readonly required: true;
                    };
                    readonly cells: {
                        readonly type: "array";
                        readonly required: true;
                        readonly items: {
                            readonly type: "object";
                            readonly additionalProperties: false;
                            readonly properties: {
                                readonly row: {
                                    readonly type: "integer";
                                    readonly required: true;
                                };
                                readonly column: {
                                    readonly type: "integer";
                                    readonly required: true;
                                };
                                readonly rowSpan: {
                                    readonly type: "integer";
                                    readonly required: true;
                                };
                                readonly columnSpan: {
                                    readonly type: "integer";
                                    readonly required: true;
                                };
                                readonly text: {
                                    readonly type: "string";
                                    readonly required: true;
                                };
                                readonly columnHeader: {
                                    readonly type: "boolean";
                                    readonly required: true;
                                };
                                readonly rowHeader: {
                                    readonly type: "boolean";
                                    readonly required: true;
                                };
                                readonly bbox: {
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
                            };
                        };
                    };
                };
            };
            readonly captions: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "string";
                };
            };
            readonly footnotes: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "string";
                };
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly kind: {
                readonly type: "string";
                readonly required: true;
                readonly const: "formula";
            };
            readonly latex: {
                readonly oneOf: readonly [{
                    readonly type: "string";
                }, {
                    readonly type: "null";
                }];
                readonly required: true;
            };
            readonly status: {
                readonly type: "string";
                readonly required: true;
                readonly enum: readonly ["extracted", "not-requested", "unavailable"];
            };
        };
    }, {
        readonly type: "object";
        readonly additionalProperties: false;
        readonly properties: {
            readonly kind: {
                readonly type: "string";
                readonly required: true;
                readonly const: "figure";
            };
            readonly captions: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "string";
                };
            };
            readonly footnotes: {
                readonly type: "array";
                readonly required: true;
                readonly items: {
                    readonly type: "string";
                };
            };
            readonly classification: {
                readonly oneOf: readonly [{
                    readonly type: "string";
                }, {
                    readonly type: "null";
                }];
                readonly required: true;
            };
            readonly chartData: {
                readonly oneOf: readonly [{
                    readonly type: "object";
                    readonly additionalProperties: false;
                    readonly properties: {
                        readonly rows: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly columns: {
                            readonly type: "integer";
                            readonly required: true;
                        };
                        readonly cells: {
                            readonly type: "array";
                            readonly required: true;
                            readonly items: {
                                readonly type: "object";
                                readonly additionalProperties: false;
                                readonly properties: {
                                    readonly row: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly column: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly rowSpan: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly columnSpan: {
                                        readonly type: "integer";
                                        readonly required: true;
                                    };
                                    readonly text: {
                                        readonly type: "string";
                                        readonly required: true;
                                    };
                                    readonly columnHeader: {
                                        readonly type: "boolean";
                                        readonly required: true;
                                    };
                                    readonly rowHeader: {
                                        readonly type: "boolean";
                                        readonly required: true;
                                    };
                                    readonly bbox: {
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
                                };
                            };
                        };
                    };
                }, {
                    readonly type: "null";
                }];
                readonly required: true;
            };
            readonly description: {
                readonly oneOf: readonly [{
                    readonly type: "string";
                }, {
                    readonly type: "null";
                }];
                readonly required: true;
            };
            readonly status: {
                readonly type: "string";
                readonly required: true;
                readonly enum: readonly ["extracted", "not-requested", "unavailable"];
            };
        };
    }];
};
/**
 * Copy source-owned readonly extraction into the tool's mutable JSON projection.
 * @param value - scientific object belonging to one anchored document block.
 * @returns detached fields without changing any recognized text or values.
 */
export declare function projectStructure(value: ResearchDocumentStructure): InferValue<typeof STRUCTURE_SCHEMA>;
//# sourceMappingURL=structure-schema.d.ts.map