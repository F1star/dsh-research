/** Docling process provider for OCR and located scientific document structures. */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import z from '@deepseek-ai/schemastery';
import { ResearchDocumentError, researchDocumentParseResultSchema, } from "../research-document/index.js";
/** Cordis plugin name. */
export const name = 'research-document-docling';
/** Parser registry and managed process execution requirements. */
export const inject = ['researchDocuments', 'subprocess'];
/** Loader validation for explicit runtime selection and deployment resource policy. */
export const Config = z.object({
    pythonExecutable: z.string().min(1).required(),
    workerPath: z.string().min(1).default(fileURLToPath(new URL('../../resources/docling/py/parse.py', import.meta.url))),
    maxSourceBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(50 * 1024 * 1024),
    maxOutputBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(32 * 1024 * 1024),
    maxDiagnosticBytes: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(16384),
    maxPages: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(500),
    timeoutMs: z.number().step(1).min(1).max(2147483647).default(600000),
    graceMs: z.number().step(1).min(1).max(2147483647).default(1000),
    maxConcurrentParses: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(1),
    threads: z.number().step(1).min(1).max(Number.MAX_SAFE_INTEGER).default(4),
    device: z.union(['cpu', 'cuda', 'mps', 'auto']).default('cpu'),
    languages: z.array(z.string().min(1)).default(['chinese']),
    forceFullPageOcr: z.boolean().default(false),
    formulas: z.boolean().default(true),
    charts: z.boolean().default(true),
    chartDescription: z.boolean().default(false),
});
/**
 * Register a parser whose subprocesses are terminated and drained on unload.
 * @param ctx - parser registry and process provider in the same execution world.
 * @param config - explicit Python runtime and inference policy.
 * @returns resolution after executable lookup and parser registration.
 */
export async function apply(ctx, config) {
    const resolved = Config(config);
    const workerPath = resolved.workerPath;
    const shutdown = new AbortController();
    const active = new Set();
    ctx.effect(() => async () => {
        shutdown.abort();
        await Promise.allSettled([...active].map(async (handle) => {
            handle.terminate();
            await handle.done;
            await handle.waitForExit();
        }));
    }, 'research-document-docling workers');
    const python = await ctx.subprocess.resolveExecutable(resolved.pythonExecutable, undefined, shutdown.signal);
    shutdown.signal.throwIfAborted();
    const startup = ctx.subprocess.spawn({
        argv: [python, '-I', workerPath, '--check'], cwd: dirname(workerPath), graceMs: resolved.graceMs,
        signal: AbortSignal.any([shutdown.signal, AbortSignal.timeout(resolved.timeoutMs)]),
        stdio: { stdin: 'ignore', stdout: { maxBytes: resolved.maxOutputBytes }, stderr: { maxBytes: resolved.maxDiagnosticBytes } },
    });
    active.add(startup);
    try {
        const outcome = await startup.done;
        const output = startup.collected.stdout.readFrom(0);
        if (outcome.exitCode !== 0 || outcome.signal !== null || output.lossy) {
            throw new ResearchDocumentError(`Docling runtime check failed: ${startup.collected.stderr?.readFrom(0).text ?? ''}`, 'RESEARCH_DOCLING_SETUP');
        }
        const response = JSON.parse(output.text);
        if (typeof response !== 'object' || response === null || !('protocol' in response)
            || response.protocol !== 1 || !('ready' in response) || response.ready !== true) {
            throw new ResearchDocumentError('Docling worker failed its startup protocol check', 'RESEARCH_DOCLING_SETUP');
        }
        shutdown.signal.throwIfAborted();
    }
    finally {
        startup.terminate();
        await startup.waitForExit();
        active.delete(startup);
    }
    const parser = {
        id: 'docling',
        available: () => !shutdown.signal.aborted,
        supports: mediaType => mediaType.toLowerCase() === 'application/pdf',
        async parse(request, signal) {
            shutdown.signal.throwIfAborted();
            signal?.throwIfAborted();
            if (request.bytes.length > resolved.maxSourceBytes) {
                throw new ResearchDocumentError('PDF exceeds Docling maxSourceBytes', 'RESEARCH_DOCLING_CAPACITY');
            }
            if (active.size >= resolved.maxConcurrentParses) {
                throw new ResearchDocumentError('Docling concurrent parsing capacity reached', 'RESEARCH_DOCLING_CAPACITY');
            }
            const input = JSON.stringify({
                protocol: 1,
                sourceBase64: Buffer.from(request.bytes).toString('base64'),
                options: {
                    maxSourceBytes: resolved.maxSourceBytes, maxOutputBytes: resolved.maxOutputBytes,
                    maxPages: resolved.maxPages, threads: resolved.threads, device: resolved.device,
                    languages: resolved.languages, forceFullPageOcr: resolved.forceFullPageOcr,
                    formulas: resolved.formulas, charts: resolved.charts, chartDescription: resolved.chartDescription,
                },
            });
            const deadline = AbortSignal.timeout(resolved.timeoutMs);
            const combined = AbortSignal.any([shutdown.signal, deadline, ...(signal === undefined ? [] : [signal])]);
            const handle = ctx.subprocess.spawn({
                argv: [python, '-I', workerPath, String(Buffer.byteLength(input))],
                cwd: dirname(workerPath), graceMs: resolved.graceMs, signal: combined,
                stdio: {
                    stdin: { data: input }, stdout: { maxBytes: resolved.maxOutputBytes },
                    stderr: { maxBytes: resolved.maxDiagnosticBytes },
                },
            });
            active.add(handle);
            try {
                const outcome = await handle.done;
                if (signal?.aborted || shutdown.signal.aborted) {
                    throw new ResearchDocumentError('Docling parsing was cancelled', 'RESEARCH_DOCUMENT_ABORTED');
                }
                if (deadline.aborted) {
                    throw new ResearchDocumentError('Docling parsing exceeded timeoutMs', 'RESEARCH_DOCLING_TIMEOUT');
                }
                if (outcome.exitCode !== 0 || outcome.signal !== null) {
                    const diagnostic = handle.collected.stderr?.readFrom(0).text ?? '';
                    throw new ResearchDocumentError(`Docling parsing failed: ${diagnostic}`, 'RESEARCH_DOCLING_PROCESS');
                }
                const output = handle.collected.stdout.readFrom(0);
                if (output.lossy) {
                    throw new ResearchDocumentError('Docling response exceeds maxOutputBytes', 'RESEARCH_DOCLING_CAPACITY');
                }
                const response = JSON.parse(output.text);
                if (typeof response !== 'object' || response === null || !('protocol' in response)
                    || response.protocol !== 1 || !('parsed' in response)) {
                    throw new ResearchDocumentError('Unsupported Docling response protocol', 'RESEARCH_DOCLING_PROTOCOL');
                }
                return researchDocumentParseResultSchema.parse(response.parsed);
            }
            finally {
                handle.terminate();
                await handle.waitForExit();
                active.delete(handle);
            }
        },
    };
    ctx.researchDocuments.registerParser(parser);
}
//# sourceMappingURL=index.js.map