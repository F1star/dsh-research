/**
 * Provider and consumer types for parsed research documents. Runtime id
 * factories and error classes live in the package root.
 * @module @f1star/dsh-research/research-document/types
 */
/**
 * Brand an exact document content hash as a runtime document id.
 * @param value - validated or runtime-generated document hash.
 * @returns the same string with its document-id brand.
 */
export function ResearchDocumentId(value) {
    return value;
}
/**
 * Brand a runtime-owned block identity.
 * @param value - validated or runtime-generated block id.
 * @returns the same string with its block-id brand.
 */
export function ResearchDocumentBlockId(value) {
    return value;
}
/**
 * Brand a complete block-text hash as a quote-integrity token.
 * @param value - runtime-generated quote hash.
 * @returns the same string with its quote-hash brand.
 */
export function ResearchDocumentQuoteHash(value) {
    return value;
}
//# sourceMappingURL=types.js.map