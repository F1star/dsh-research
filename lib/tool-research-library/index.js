/**
 * Model-facing tools for registering, finding, and explicitly reconciling
 * durable research-paper identities through `ctx.researchLibrary`.
 * @module @f1star/dsh-research/tool-research-library
 */
import z from '@deepseek-ai/schemastery';
import { ResearchDocumentId, } from "../research-document/index.js";
import { ResearchPaperId, ResearchSourceVersionId, } from "../research-library/index.js";
import { defineTool } from '@deepseek-ai/dsh-tools';
/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-research-library';
/** Services required by the durable paper-library tool suite. */
export const inject = ['researchDocuments', 'researchLibrary', 'systemPrompt', 'tools'];
/** Default maximum papers returned by one library list call. */
export const DEFAULT_MAX_LIST_RESULTS = 50;
/** Default maximum exact source versions projected by one result. */
export const DEFAULT_MAX_SOURCES_PER_RESULT = 32;
/** Default combined author, identifier, alias, observation, and candidate count. */
export const DEFAULT_MAX_NESTED_ITEMS_PER_RESULT = 256;
/** Default combined human-text character budget for one canonical result and rendering. */
export const DEFAULT_MAX_OUTPUT_TEXT_CHARS = 100_000;
/** Default maximum normalized query length accepted by the list tool. */
export const DEFAULT_MAX_QUERY_CHARS = 500;
/** Loader schema for paper-library tool limits. */
export const Config = z.object({
    maxListResults: z.number().step(1).min(1).default(DEFAULT_MAX_LIST_RESULTS),
    maxSourcesPerResult: z.number().step(1).min(1).default(DEFAULT_MAX_SOURCES_PER_RESULT),
    maxNestedItemsPerResult: z.number().step(1).min(1).default(DEFAULT_MAX_NESTED_ITEMS_PER_RESULT),
    maxOutputTextChars: z.number().step(1).min(256).default(DEFAULT_MAX_OUTPUT_TEXT_CHARS),
    maxQueryChars: z.number().step(1).min(1).default(DEFAULT_MAX_QUERY_CHARS),
});
const ORIGIN_SCHEMA = { type: 'string', enum: ['declared', 'parser', 'source-derived'] };
const EXTRACTION_SCHEMA = {
    oneOf: [
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                text: { type: 'string', required: true, const: 'native' },
                layout: { type: 'string', required: true, const: 'approximate' },
            },
        },
        {
            type: 'object',
            additionalProperties: false,
            properties: {
                text: { type: 'string', required: true, const: 'none' },
                layout: { type: 'string', required: true, const: 'page-only' },
            },
        },
    ],
};
const TEXT_FIELD_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        value: { type: 'string', required: true },
        origin: { ...ORIGIN_SCHEMA, required: true },
        value_truncated: { type: 'boolean', required: true },
    },
};
const AUTHORS_FIELD_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        values: {
            type: 'array',
            required: true,
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    value: { type: 'string', required: true },
                    value_truncated: { type: 'boolean', required: true },
                },
            },
        },
        origin: { ...ORIGIN_SCHEMA, required: true },
        total_values: { type: 'integer', required: true },
        truncated: { type: 'boolean', required: true },
    },
};
const METADATA_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        title: { ...TEXT_FIELD_SCHEMA, required: true },
        authors: { ...AUTHORS_FIELD_SCHEMA },
        year: {
            type: 'object',
            additionalProperties: false,
            properties: {
                value: { type: 'integer', required: true },
                origin: { ...ORIGIN_SCHEMA, required: true },
            },
        },
        venue: { ...TEXT_FIELD_SCHEMA },
    },
};
const EXTERNAL_ID_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        kind: { type: 'string', required: true, enum: ['doi', 'arxiv'] },
        value: { type: 'string', required: true },
        value_truncated: { type: 'boolean', required: true },
        origin: { ...ORIGIN_SCHEMA, required: true },
        added_at: { type: 'string', required: true },
    },
};
const SOURCE_ALIAS_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        value: { type: 'string', required: true },
        value_truncated: { type: 'boolean', required: true },
        origin: { ...ORIGIN_SCHEMA, required: true },
        added_at: { type: 'string', required: true },
    },
};
const OBSERVATION_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        parser_id: { type: 'string', required: true },
        parser_id_truncated: { type: 'boolean', required: true },
        parser_version: { type: 'string', required: true },
        parser_version_truncated: { type: 'boolean', required: true },
        media_type: { type: 'string', required: true },
        media_type_truncated: { type: 'boolean', required: true },
        extraction: { ...EXTRACTION_SCHEMA, required: true },
        document_title: { type: 'string' },
        document_title_truncated: { type: 'boolean' },
        page_count: { type: 'integer', required: true },
        block_count: { type: 'integer', required: true },
        observed_at: { type: 'string', required: true },
    },
};
const SOURCE_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        source_version_id: { type: 'string', required: true },
        document_id: { type: 'string', required: true },
        last_observed_state: { type: 'string', required: true, const: 'imported' },
        current_runtime_coverage: {
            type: 'string',
            required: true,
            enum: ['readable', 'needs-ocr', 'reimport-required', 'parser-mismatch'],
        },
        aliases: { type: 'array', required: true, items: SOURCE_ALIAS_SCHEMA },
        total_aliases: { type: 'integer', required: true },
        aliases_truncated: { type: 'boolean', required: true },
        observations: { type: 'array', required: true, items: OBSERVATION_SCHEMA },
        total_observations: { type: 'integer', required: true },
        observations_truncated: { type: 'boolean', required: true },
        created_at: { type: 'string', required: true },
        updated_at: { type: 'string', required: true },
        truncated: { type: 'boolean', required: true },
    },
};
const PAPER_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        paper_id: { type: 'string', required: true },
        metadata: { ...METADATA_SCHEMA, required: true },
        external_ids: { type: 'array', required: true, items: EXTERNAL_ID_SCHEMA },
        total_external_ids: { type: 'integer', required: true },
        external_ids_truncated: { type: 'boolean', required: true },
        acquisition_state: { type: 'string', required: true, enum: ['metadata-only', 'imported'] },
        last_observed_state: { type: 'string', required: true, enum: ['metadata-only', 'imported'] },
        current_runtime_coverage: {
            type: 'string',
            required: true,
            enum: ['metadata-only', 'readable', 'needs-ocr', 'reimport-required', 'parser-mismatch'],
        },
        sources: { type: 'array', required: true, items: SOURCE_SCHEMA },
        total_sources: { type: 'integer', required: true },
        sources_truncated: { type: 'boolean', required: true },
        possible_duplicate_ids: { type: 'array', required: true, items: { type: 'string' } },
        total_possible_duplicate_ids: { type: 'integer', required: true },
        possible_duplicate_ids_truncated: { type: 'boolean', required: true },
        created_at: { type: 'string', required: true },
        updated_at: { type: 'string', required: true },
        truncated: { type: 'boolean', required: true },
    },
};
const REGISTER_OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        status: {
            type: 'string',
            required: true,
            enum: [
                'created', 'updated', 'unchanged', 'paper-not-found', 'identifier-conflict',
                'document-conflict', 'metadata-conflict', 'capacity',
            ],
        },
        paper: PAPER_SCHEMA,
        source_version_id: { type: 'string' },
        paper_id: { type: 'string' },
        paper_ids: { type: 'array', items: { type: 'string' } },
        identifiers: { type: 'array', items: { type: 'string' } },
        document_id: { type: 'string' },
        fields: { type: 'array', items: { type: 'string' } },
        resource: { type: 'string' },
        truncated: { type: 'boolean', required: true },
    },
};
const LIST_OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        query: { type: 'string' },
        papers: { type: 'array', required: true, items: PAPER_SCHEMA },
        total_matches: { type: 'integer', required: true },
        truncated: { type: 'boolean', required: true },
    },
};
const GET_OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        status: { type: 'string', required: true, enum: ['found', 'paper-not-found'] },
        paper_id: { type: 'string', required: true },
        paper: PAPER_SCHEMA,
        truncated: { type: 'boolean', required: true },
    },
};
const ALIAS_OUTPUT_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        status: {
            type: 'string',
            required: true,
            enum: ['updated', 'unchanged', 'paper-not-found', 'source-not-found', 'identifier-conflict', 'capacity'],
        },
        paper: PAPER_SCHEMA,
        paper_id: { type: 'string' },
        paper_ids: { type: 'array', items: { type: 'string' } },
        source_version_id: { type: 'string' },
        identifiers: { type: 'array', items: { type: 'string' } },
        resource: { type: 'string' },
        truncated: { type: 'boolean', required: true },
    },
};
/** Register stable guidance and four explicit durable paper-library tools. */
export function apply(ctx, config = {}) {
    const resolved = resolveConfig(config);
    ctx.systemPrompt.section({
        name: 'tool:research-library',
        order: 113,
        text: 'Use paper_import before paper_library_register with document_id so the library records the exact retained bytes and parser observation. A persisted last_observed_state=imported is historical; consult current_runtime_coverage and import the document again when it is reimport-required. Treat possible_duplicate_ids from title similarity only as candidates and never merge papers automatically. Add or remove DOI, arXiv, and source aliases with paper_library_alias only when the identity relationship is explicitly established.',
    });
    ctx.tools.register(defineTool({
        name: 'paper_library_register',
        description: 'Create or enrich one durable paper identity. A document_id must refer to a currently retained paper_import result; parser observations are read from that runtime value, never accepted as arguments.',
        parameters: {
            paper_id: { type: 'string', description: 'Existing paper id to enrich. Omit to select only by exact DOI, arXiv id, or document id, or to create a new identity.' },
            document_id: { type: 'string', description: 'Exact document id returned by paper_import and still retained in the current runtime.' },
            title: { type: 'string', description: 'Declared title. Required for a new metadata-only identity.' },
            authors: { type: 'array', items: { type: 'string' }, description: 'Declared author names in publication order.' },
            year: { type: 'integer', description: 'Declared publication year.' },
            venue: { type: 'string', description: 'Declared venue.' },
            doi: { type: 'string', description: 'Declared DOI identity alias.' },
            arxiv_id: { type: 'string', description: 'Declared arXiv identity alias.' },
            source_alias: { type: 'string', description: 'Declared display alias for this exact document source; requires document_id.' },
        },
        output: {
            schema: REGISTER_OUTPUT_SCHEMA,
            render: (_args, value) => [{ type: 'text', text: formatJson('Paper library registration', value, resolved.maxOutputTextChars) }],
            presentationMeta: (_args, value) => taggedMeta('dsh/paper-library-register', value),
        },
        async execute(args) {
            if (args.source_alias !== undefined && args.document_id === undefined) {
                throw new Error('source_alias requires document_id');
            }
            const metadata = args.title === undefined
                && args.authors === undefined
                && args.year === undefined
                && args.venue === undefined
                ? undefined
                : {
                    origin: 'declared',
                    ...(args.title === undefined ? {} : { title: args.title }),
                    ...(args.authors === undefined ? {} : { authors: args.authors }),
                    ...(args.year === undefined ? {} : { year: args.year }),
                    ...(args.venue === undefined ? {} : { venue: args.venue }),
                };
            const externalIds = [
                ...(args.doi === undefined ? [] : [{ kind: 'doi', value: args.doi, origin: 'declared' }]),
                ...(args.arxiv_id === undefined
                    ? []
                    : [{ kind: 'arxiv', value: args.arxiv_id, origin: 'declared' }]),
            ];
            const document = args.document_id === undefined
                ? undefined
                : runtimeDocumentInput(ctx.researchDocuments.get(parseDocumentId(args.document_id)), args.source_alias);
            const result = await ctx.researchLibrary.register({
                ...(args.paper_id === undefined ? {} : { paperId: parsePaperId(args.paper_id) }),
                ...(metadata === undefined ? {} : { metadata }),
                ...(externalIds.length === 0 ? {} : { externalIds }),
                ...(document === undefined ? {} : { document }),
            });
            return projectRegistration(ctx, result, resolved);
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: args.paper_id === undefined ? 'Register paper in library' : `Update library paper ${shortId(args.paper_id)}`,
                kind: 'edit',
                ...(args.document_id === undefined ? {} : { rawInput: args.document_id }),
            };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'paper_library_list',
        description: 'List or filter durable paper identities with historical import state, current runtime coverage, and non-merging title-duplicate candidates.',
        parameters: {
            query: { type: 'string', description: `Optional title, author, venue, exact identifier, or source-alias query of at most ${resolved.maxQueryChars} normalized characters.` },
            max_results: { type: 'integer', description: `Optional result cap from 1 through ${resolved.maxListResults}.` },
        },
        output: {
            schema: LIST_OUTPUT_SCHEMA,
            render: (_args, value) => [{ type: 'text', text: formatJson('Paper library list', value, resolved.maxOutputTextChars) }],
            presentationMeta: (_args, value) => taggedMeta('dsh/paper-library-list', value),
        },
        isConcurrencySafe: () => true,
        execute(args) {
            const query = args.query === undefined ? undefined : normalizedQuery(args.query, resolved.maxQueryChars);
            const maximum = boundedOptionalCount('max_results', args.max_results, resolved.maxListResults);
            const all = ctx.researchLibrary.list();
            const matches = query === undefined ? all : all.filter(paper => searchablePaper(paper).includes(query));
            const retained = matches.slice(0, maximum);
            const duplicates = duplicateMap(all);
            const budget = new ProjectionBudget(resolved);
            const papers = retained.map(paper => projectPaper(ctx, paper, duplicates.get(paper.id) ?? [], budget));
            return Promise.resolve({
                ...(query === undefined ? {} : { query }),
                papers,
                total_matches: matches.length,
                truncated: matches.length > retained.length || budget.truncated || papers.some(paper => paper.truncated),
            });
        },
        presentCall(args) {
            return args.query === undefined
                ? { card: 'generic', title: 'List paper library', kind: 'read' }
                : { card: 'generic', title: `Search paper library: ${args.query}`, kind: 'search', rawInput: args.query };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'paper_library_get',
        description: 'Read one durable paper identity, its exact source versions, historical parser observations, and current in-memory readability.',
        parameters: {
            paper_id: { type: 'string', required: true, description: 'Stable paper id returned by a paper-library tool.' },
        },
        output: {
            schema: GET_OUTPUT_SCHEMA,
            render: (_args, value) => [{ type: 'text', text: formatJson('Paper library record', value, resolved.maxOutputTextChars) }],
            presentationMeta: (_args, value) => taggedMeta('dsh/paper-library-get', value),
        },
        isConcurrencySafe: () => true,
        execute(args) {
            const paperId = parsePaperId(args.paper_id);
            const paper = ctx.researchLibrary.get(paperId);
            if (paper === undefined) {
                return Promise.resolve({ status: 'paper-not-found', paper_id: paperId, truncated: false });
            }
            const all = ctx.researchLibrary.list();
            const budget = new ProjectionBudget(resolved);
            const projected = projectPaper(ctx, paper, duplicateMap(all).get(paper.id) ?? [], budget);
            return Promise.resolve({
                status: 'found',
                paper_id: paper.id,
                paper: projected,
                truncated: budget.truncated || projected.truncated,
            });
        },
        presentCall(args) {
            return { card: 'generic', title: `Read library paper ${shortId(args.paper_id)}`, kind: 'read' };
        },
    }));
    ctx.tools.register(defineTool({
        name: 'paper_library_alias',
        description: 'Explicitly add or remove one DOI, arXiv, or exact-source display alias without merging or deleting paper records.',
        parameters: {
            paper_id: { type: 'string', required: true, description: 'Stable paper id to update.' },
            action: { type: 'string', required: true, enum: ['add', 'remove'], description: 'Reversible alias action.' },
            kind: { type: 'string', required: true, enum: ['doi', 'arxiv', 'source'], description: 'External identity alias or exact-source display alias.' },
            value: { type: 'string', required: true, description: 'Alias value.' },
            source_version_id: { type: 'string', description: 'Required only when kind=source.' },
        },
        output: {
            schema: ALIAS_OUTPUT_SCHEMA,
            render: (_args, value) => [{ type: 'text', text: formatJson('Paper library alias', value, resolved.maxOutputTextChars) }],
            presentationMeta: (_args, value) => taggedMeta('dsh/paper-library-alias', value),
        },
        async execute(args) {
            const paperId = parsePaperId(args.paper_id);
            let result;
            if (args.kind === 'source') {
                const sourceVersionId = args.source_version_id;
                if (sourceVersionId === undefined) {
                    throw new Error('source_version_id is required when kind=source');
                }
                result = await ctx.researchLibrary.updateAlias({
                    action: args.action,
                    paperId,
                    kind: 'source',
                    sourceVersionId: parseSourceVersionId(sourceVersionId),
                    value: args.value,
                    origin: 'declared',
                });
            }
            else {
                if (args.source_version_id !== undefined) {
                    throw new Error('source_version_id is only valid when kind=source');
                }
                result = await ctx.researchLibrary.updateAlias({
                    action: args.action,
                    paperId,
                    kind: args.kind,
                    value: args.value,
                    origin: 'declared',
                });
            }
            return projectAlias(ctx, result, resolved);
        },
        presentCall(args) {
            return {
                card: 'generic',
                title: `${args.action === 'add' ? 'Add' : 'Remove'} ${args.kind} alias for ${shortId(args.paper_id)}`,
                kind: 'edit',
                rawInput: args.value,
            };
        },
    }));
}
function runtimeDocumentInput(document, sourceAlias) {
    return {
        documentId: document.id,
        mediaType: document.mediaType,
        parserId: document.parser.id,
        parserVersion: document.parser.version,
        extraction: document.extraction,
        ...(document.title === undefined ? {} : { documentTitle: document.title }),
        pageCount: document.pageCount,
        blockCount: document.blockCount,
        ...(sourceAlias === undefined ? {} : { sourceAlias }),
    };
}
function projectRegistration(ctx, result, config) {
    switch (result.status) {
        case 'created':
        case 'updated':
        case 'unchanged': {
            const budget = new ProjectionBudget(config);
            const paper = projectPaper(ctx, result.paper, result.possibleDuplicateIds, budget);
            return {
                status: result.status,
                paper,
                ...(result.sourceVersionId === undefined ? {} : { source_version_id: result.sourceVersionId }),
                truncated: budget.truncated || paper.truncated,
            };
        }
        case 'paper-not-found':
            return { status: result.status, paper_id: result.paperId, truncated: false };
        case 'identifier-conflict': {
            const budget = new ProjectionBudget(config);
            const identifiers = result.identifiers.map(identifier => budget.text(identifier));
            return {
                status: result.status,
                paper_ids: [...result.paperIds],
                identifiers: identifiers.map(identifier => identifier.value),
                truncated: identifiers.some(identifier => identifier.truncated),
            };
        }
        case 'document-conflict':
            return {
                status: result.status,
                paper_id: result.paperId,
                document_id: result.documentId,
                truncated: false,
            };
        case 'metadata-conflict':
            return {
                status: result.status,
                paper_id: result.paperId,
                fields: [...result.fields],
                truncated: false,
            };
        case 'capacity':
            return { status: result.status, resource: result.resource, truncated: false };
        /* v8 ignore next 2 -- exhaustive over the closed RegisterResearchPaperResult union. */
        default:
            return assertNever(result);
    }
}
function projectAlias(ctx, result, config) {
    switch (result.status) {
        case 'updated':
        case 'unchanged': {
            const all = ctx.researchLibrary.list();
            const budget = new ProjectionBudget(config);
            const paper = projectPaper(ctx, result.paper, duplicateMap(all).get(result.paper.id) ?? [], budget);
            return { status: result.status, paper, truncated: budget.truncated || paper.truncated };
        }
        case 'paper-not-found':
            return { status: result.status, paper_id: result.paperId, truncated: false };
        case 'source-not-found':
            return {
                status: result.status,
                paper_id: result.paperId,
                source_version_id: result.sourceVersionId,
                truncated: false,
            };
        case 'identifier-conflict': {
            const budget = new ProjectionBudget(config);
            const identifiers = result.identifiers.map(identifier => budget.text(identifier));
            return {
                status: result.status,
                paper_ids: [...result.paperIds],
                identifiers: identifiers.map(identifier => identifier.value),
                truncated: identifiers.some(identifier => identifier.truncated),
            };
        }
        case 'capacity':
            return { status: result.status, resource: result.resource, truncated: false };
        /* v8 ignore next 2 -- exhaustive over the closed UpdateResearchAliasResult union. */
        default:
            return assertNever(result);
    }
}
function projectPaper(ctx, paper, possibleDuplicateIds, budget) {
    const title = budget.text(paper.metadata.title.value);
    const authorsField = paper.metadata.authors;
    const authors = authorsField === undefined
        ? undefined
        : {
            projection: budget.collection(authorsField.value),
            origin: authorsField.origin,
            total: authorsField.value.length,
        };
    const externalIds = budget.collection(paper.externalIds);
    const projectedExternalIds = externalIds.values.map((identifier) => {
        const value = budget.text(identifier.value);
        return {
            kind: identifier.kind,
            value: value.value,
            value_truncated: value.truncated,
            origin: identifier.origin,
            added_at: identifier.addedAt,
        };
    });
    const sources = budget.sources(paper.sourceVersions);
    const projectedSources = sources.values.map(source => projectSource(ctx, source, budget));
    const duplicates = budget.collection(possibleDuplicateIds);
    const venueField = paper.metadata.venue;
    const venue = venueField === undefined
        ? undefined
        : { ...budget.text(venueField.value), origin: venueField.origin };
    const coverage = paperCoverage(paper.sourceVersions.map(source => runtimeCoverage(ctx, source)), paper);
    const truncated = title.truncated
        || (authors?.projection.truncated ?? false)
        || venue?.truncated === true
        || externalIds.truncated
        || projectedExternalIds.some(identifier => identifier.value_truncated)
        || sources.truncated
        || projectedSources.some(source => source.truncated)
        || duplicates.truncated;
    if (truncated)
        budget.noteTruncation();
    return {
        paper_id: paper.id,
        metadata: {
            title: { value: title.value, origin: paper.metadata.title.origin, value_truncated: title.truncated },
            ...(authors === undefined ? {} : {
                authors: {
                    values: authors.projection.values.map((author) => {
                        const projected = budget.text(author);
                        return { value: projected.value, value_truncated: projected.truncated };
                    }),
                    origin: authors.origin,
                    total_values: authors.total,
                    truncated: authors.projection.truncated,
                },
            }),
            ...(paper.metadata.year === undefined
                ? {}
                : { year: { value: paper.metadata.year.value, origin: paper.metadata.year.origin } }),
            ...(venue === undefined
                ? {}
                : { venue: { value: venue.value, origin: venue.origin, value_truncated: venue.truncated } }),
        },
        external_ids: projectedExternalIds,
        total_external_ids: paper.externalIds.length,
        external_ids_truncated: externalIds.truncated,
        acquisition_state: paper.acquisitionState,
        last_observed_state: paper.acquisitionState,
        current_runtime_coverage: coverage,
        sources: projectedSources,
        total_sources: paper.sourceVersions.length,
        sources_truncated: sources.truncated,
        possible_duplicate_ids: duplicates.values.map(String),
        total_possible_duplicate_ids: possibleDuplicateIds.length,
        possible_duplicate_ids_truncated: duplicates.truncated,
        created_at: paper.createdAt,
        updated_at: paper.updatedAt,
        truncated,
    };
}
function projectSource(ctx, source, budget) {
    const aliases = budget.collection(source.aliases);
    const observations = budget.collection(source.observations);
    const projectedAliases = aliases.values.map((alias) => {
        const value = budget.text(alias.value);
        return {
            value: value.value,
            value_truncated: value.truncated,
            origin: alias.origin,
            added_at: alias.addedAt,
        };
    });
    const projectedObservations = observations.values.map(observation => projectObservation(observation, budget));
    const truncated = aliases.truncated
        || observations.truncated
        || projectedAliases.some(alias => alias.value_truncated)
        || projectedObservations.some(observation => observation.document_title_truncated === true
            || observation.parser_id_truncated
            || observation.parser_version_truncated
            || observation.media_type_truncated);
    if (truncated)
        budget.noteTruncation();
    return {
        source_version_id: source.id,
        document_id: source.documentId,
        last_observed_state: 'imported',
        current_runtime_coverage: runtimeCoverage(ctx, source),
        aliases: projectedAliases,
        total_aliases: source.aliases.length,
        aliases_truncated: aliases.truncated,
        observations: projectedObservations,
        total_observations: source.observations.length,
        observations_truncated: observations.truncated,
        created_at: source.createdAt,
        updated_at: source.updatedAt,
        truncated,
    };
}
function projectObservation(observation, budget) {
    const documentTitle = observation.documentTitle === undefined ? undefined : budget.text(observation.documentTitle);
    const parserId = budget.text(observation.parserId);
    const parserVersion = budget.text(observation.parserVersion);
    const mediaType = budget.text(observation.mediaType);
    return {
        parser_id: parserId.value,
        parser_id_truncated: parserId.truncated,
        parser_version: parserVersion.value,
        parser_version_truncated: parserVersion.truncated,
        media_type: mediaType.value,
        media_type_truncated: mediaType.truncated,
        extraction: observation.extraction,
        ...(documentTitle === undefined
            ? {}
            : { document_title: documentTitle.value, document_title_truncated: documentTitle.truncated }),
        page_count: observation.pageCount,
        block_count: observation.blockCount,
        observed_at: observation.observedAt,
    };
}
function runtimeCoverage(ctx, source) {
    const retained = ctx.researchDocuments.peek(source.documentId);
    if (retained === undefined)
        return 'reimport-required';
    if (retained.extraction.text === 'none')
        return 'needs-ocr';
    const observedParser = source.observations.some(observation => observation.parserId === retained.parser.id && observation.parserVersion === retained.parser.version);
    return observedParser ? 'readable' : 'parser-mismatch';
}
function paperCoverage(sourceCoverage, paper) {
    if (paper.acquisitionState === 'metadata-only')
        return 'metadata-only';
    for (const status of ['readable', 'needs-ocr', 'parser-mismatch']) {
        if (sourceCoverage.includes(status))
            return status;
    }
    return 'reimport-required';
}
class ProjectionBudget {
    textRemaining;
    sourcesRemaining;
    nestedRemaining;
    truncated = false;
    constructor(config) {
        this.textRemaining = config.maxOutputTextChars;
        this.sourcesRemaining = config.maxSourcesPerResult;
        this.nestedRemaining = config.maxNestedItemsPerResult;
    }
    text(value) {
        if (value.length <= this.textRemaining) {
            this.textRemaining -= value.length;
            return { value, truncated: false };
        }
        this.truncated = true;
        if (this.textRemaining === 0)
            return { value: '', truncated: true };
        const retained = this.textRemaining === 1 ? '…' : `${value.slice(0, this.textRemaining - 1)}…`;
        this.textRemaining = 0;
        return { value: retained, truncated: true };
    }
    sources(values) {
        const count = Math.min(values.length, this.sourcesRemaining);
        this.sourcesRemaining -= count;
        const truncated = count < values.length;
        if (truncated)
            this.truncated = true;
        return { values: values.slice(0, count), truncated };
    }
    collection(values) {
        const count = Math.min(values.length, this.nestedRemaining);
        this.nestedRemaining -= count;
        const truncated = count < values.length;
        if (truncated)
            this.truncated = true;
        return { values: values.slice(0, count), truncated };
    }
    noteTruncation() {
        this.truncated = true;
    }
}
function duplicateMap(papers) {
    const groups = new Map();
    for (const paper of papers) {
        const title = comparableTitle(paper.metadata.title.value);
        const values = groups.get(title) ?? [];
        values.push(paper.id);
        groups.set(title, values);
    }
    const duplicates = new Map();
    for (const group of groups.values()) {
        if (group.length < 2)
            continue;
        for (const paperId of group)
            duplicates.set(paperId, group.filter(candidate => candidate !== paperId));
    }
    return duplicates;
}
function searchablePaper(paper) {
    return [
        paper.metadata.title.value,
        ...(paper.metadata.authors?.value ?? []),
        paper.metadata.venue?.value ?? '',
        ...paper.externalIds.flatMap(identifier => [identifier.value, `${identifier.kind}:${identifier.value}`]),
        ...paper.sourceVersions.flatMap(source => source.aliases.map(alias => alias.value)),
    ].map(comparableText).join('\n');
}
function comparableTitle(value) {
    return comparableText(value).replace(/\s+/gu, ' ');
}
function comparableText(value) {
    return value.normalize('NFKC').trim().toLowerCase();
}
function normalizedQuery(value, maximum) {
    const query = comparableText(value).replace(/\s+/gu, ' ');
    if (query.length === 0)
        throw new Error('query must be a non-empty string');
    if (query.length > maximum)
        throw new Error(`query must be at most ${maximum} normalized characters`);
    return query;
}
function parseDocumentId(value) {
    if (!/^sha256:[0-9a-f]{64}$/u.test(value))
        throw new Error('document_id must be a paper_import sha256 id');
    return ResearchDocumentId(value);
}
function parsePaperId(value) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
        throw new Error('paper_id must be a research-library UUID');
    }
    return ResearchPaperId(value);
}
function parseSourceVersionId(value) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value)) {
        throw new Error('source_version_id must be a research-library UUID');
    }
    return ResearchSourceVersionId(value);
}
function boundedOptionalCount(name, value, maximum) {
    if (value === undefined)
        return maximum;
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
        throw new Error(`${name} must be an integer from 1 through ${maximum}`);
    }
    return value;
}
function resolveConfig(config = {}) {
    const resolved = {
        maxListResults: positiveSafeInteger('maxListResults', config.maxListResults ?? DEFAULT_MAX_LIST_RESULTS),
        maxSourcesPerResult: positiveSafeInteger('maxSourcesPerResult', config.maxSourcesPerResult ?? DEFAULT_MAX_SOURCES_PER_RESULT),
        maxNestedItemsPerResult: positiveSafeInteger('maxNestedItemsPerResult', config.maxNestedItemsPerResult ?? DEFAULT_MAX_NESTED_ITEMS_PER_RESULT),
        maxOutputTextChars: positiveSafeInteger('maxOutputTextChars', config.maxOutputTextChars ?? DEFAULT_MAX_OUTPUT_TEXT_CHARS),
        maxQueryChars: positiveSafeInteger('maxQueryChars', config.maxQueryChars ?? DEFAULT_MAX_QUERY_CHARS),
    };
    if (resolved.maxOutputTextChars < 256) {
        throw new TypeError('tool-research-library: maxOutputTextChars must be at least 256');
    }
    return resolved;
}
function positiveSafeInteger(field, value) {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError(`tool-research-library: ${field} must be a positive safe integer`);
    }
    return value;
}
function taggedMeta(kind, value) {
    return { kind, version: 1, value };
}
function formatJson(label, value, maximum) {
    const text = `${label}\n${JSON.stringify(value, null, 2)}`;
    if (text.length <= maximum)
        return text;
    const marker = '\n… output truncated; use paper_library_get or a narrower paper_library_list query.';
    return `${text.slice(0, maximum - marker.length)}${marker}`;
}
function shortId(value) {
    return value.length <= 20 ? value : `${value.slice(0, 12)}…${value.slice(-6)}`;
}
/* v8 ignore next 3 -- only exhaustive closed-union defaults call this defensive assertion. */
function assertNever(value) {
    throw new Error(`unsupported research-library result: ${JSON.stringify(value)}`);
}
//# sourceMappingURL=index.js.map