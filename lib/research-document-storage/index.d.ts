/** Durable research-document archive over the configured domain-storage backend. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
export { researchDocumentArchiveDomainSpec, researchDocumentArchiveRecord } from './spec.ts';
/** Cordis plugin name. */
export declare const name = "research-document-storage";
/** Archive registration and durable domain dependencies. */
export declare const inject: string[];
/** Inclusive archive capacity policy; durable records are never evicted automatically. */
export interface Config {
    /** Maximum archived sources. Defaults to 1000. */
    readonly maxDocuments?: number;
    /** Maximum source bytes per document. Defaults to 50 MiB. */
    readonly maxSourceBytes?: number;
    /** Maximum UTF-8 JSON bytes per complete source-and-revisions row. Defaults to 100 MiB. */
    readonly maxRecordBytes?: number;
    /** Maximum sum of serialized record bytes. Defaults to 512 MiB. */
    readonly maxTotalBytes?: number;
    /** Maximum immutable parser revisions per source. Defaults to 16. */
    readonly maxParserRevisions?: number;
}
/** Loader schema for archive limits. */
export declare const Config: z<Config>;
/**
 * Register validated durable storage for research imports and on-demand restoration.
 * Teardown stops registration, rejects new writes, and drains accepted writes before closing storage.
 * @param ctx - host context owning documents and domain storage.
 * @param config - archive capacity policy.
 */
export declare function apply(ctx: Context, config?: Config): Promise<void>;
//# sourceMappingURL=index.d.ts.map