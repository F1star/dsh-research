/** Docling process provider for OCR and located scientific document structures. */
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name. */
export declare const name = "research-document-docling";
/** Parser registry and managed process execution requirements. */
export declare const inject: string[];
/** Python runtime, inference stages, and complete process resource limits. */
export interface Config {
    /** Python environment with this package's requirements installed. */
    readonly pythonExecutable: string;
    /** Worker path in the subprocess provider's world; defaults to the shipped local worker. */
    readonly workerPath?: string;
    /** PDF source byte limit. Defaults to 50 MiB. */
    readonly maxSourceBytes?: number;
    /** Complete JSON response limit. Defaults to 32 MiB. */
    readonly maxOutputBytes?: number;
    /** Retained diagnostic tail in bytes. Defaults to 16384. */
    readonly maxDiagnosticBytes?: number;
    /** Physical page limit. Defaults to 500. */
    readonly maxPages?: number;
    /** Whole conversion deadline including model loading. Defaults to 600000 ms. */
    readonly timeoutMs?: number;
    /** Process-tree termination grace. Defaults to 1000 ms. */
    readonly graceMs?: number;
    /** Maximum simultaneous inference processes. Defaults to 1. */
    readonly maxConcurrentParses?: number;
    /** CPU threads per process. Defaults to 4. */
    readonly threads?: number;
    /** Docling accelerator selection. Defaults to cpu. */
    readonly device?: 'cpu' | 'cuda' | 'mps' | 'auto';
    /** RapidOCR language configuration. Defaults to chinese, which includes English recognition. */
    readonly languages?: string[];
    /** OCR entire pages even when native text exists. Defaults to false. */
    readonly forceFullPageOcr?: boolean;
    /** Recognize formula notation. Defaults to true. */
    readonly formulas?: boolean;
    /** Extract chart values. Defaults to true. */
    readonly charts?: boolean;
    /** Generate chart descriptions in addition to values. Defaults to false. */
    readonly chartDescription?: boolean;
}
/** Loader validation for explicit runtime selection and deployment resource policy. */
export declare const Config: z<Config, Required<Config>>;
/**
 * Register a parser whose subprocesses are terminated and drained on unload.
 * @param ctx - parser registry and process provider in the same execution world.
 * @param config - explicit Python runtime and inference policy.
 * @returns resolution after executable lookup and parser registration.
 */
export declare function apply(ctx: Context, config: Config): Promise<void>;
//# sourceMappingURL=index.d.ts.map