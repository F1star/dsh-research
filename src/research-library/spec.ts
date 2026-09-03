/**
 * Durable schema and domain declaration for the research-paper library.
 * @module @f1star/dsh-research/research-library/src/spec
 */

import { z } from 'zod'
import {
  ResearchDocumentId,
  type ResearchDocumentExtraction,
} from '../research-document/index.ts'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type {
  ResearchDocumentObservation,
  ResearchExternalId,
  ResearchMetadataField,
  ResearchMetadataOrigin,
  ResearchPaperId,
  ResearchPaperRecord,
  ResearchSourceAlias,
  ResearchSourceVersion,
  ResearchSourceVersionId,
} from './types.ts'

const metadataOrigin: z.ZodType<ResearchMetadataOrigin> = z.enum(['declared', 'parser', 'source-derived'])
const paperId = z.string().transform(value => value as ResearchPaperId)
const sourceVersionId = z.string().transform(value => value as ResearchSourceVersionId)
const instant = z.iso.datetime({ offset: true })

const textField: z.ZodType<ResearchMetadataField<string>> = z.object({
  value: z.string(),
  origin: metadataOrigin,
})

const authorsField: z.ZodType<ResearchMetadataField<readonly string[]>> = z.object({
  value: z.array(z.string()),
  origin: metadataOrigin,
})

const yearField: z.ZodType<ResearchMetadataField<number>> = z.object({
  value: z.number().int(),
  origin: metadataOrigin,
})

const extraction: z.ZodType<ResearchDocumentExtraction> = z.discriminatedUnion('text', [
  z.object({ text: z.literal('native'), layout: z.literal('approximate') }),
  z.object({ text: z.literal('none'), layout: z.literal('page-only') }),
])

const externalId: z.ZodType<ResearchExternalId> = z.object({
  kind: z.enum(['doi', 'arxiv']),
  value: z.string(),
  origin: metadataOrigin,
  addedAt: instant,
})

const sourceAlias: z.ZodType<ResearchSourceAlias> = z.object({
  value: z.string(),
  origin: metadataOrigin,
  addedAt: instant,
})

const documentObservation: z.ZodType<ResearchDocumentObservation> = z.object({
  parserId: z.string(),
  parserVersion: z.string(),
  mediaType: z.string(),
  extraction,
  documentTitle: z.string().optional(),
  pageCount: z.number().int().nonnegative(),
  blockCount: z.number().int().nonnegative(),
  observedAt: instant,
})

const sourceVersion: z.ZodType<ResearchSourceVersion> = z.object({
  id: sourceVersionId,
  documentId: z.string().transform(ResearchDocumentId),
  state: z.literal('imported'),
  aliases: z.array(sourceAlias),
  observations: z.array(documentObservation),
  createdAt: instant,
  updatedAt: instant,
})

/** Durable schema for one paper aggregate. */
export const researchPaperRecord: z.ZodType<ResearchPaperRecord> = z.object({
  id: paperId,
  metadata: z.object({
    title: textField,
    authors: authorsField.optional(),
    year: yearField.optional(),
    venue: textField.optional(),
  }),
  externalIds: z.array(externalId),
  acquisitionState: z.enum(['metadata-only', 'imported']),
  sourceVersions: z.array(sourceVersion),
  createdAt: instant,
  updatedAt: instant,
})

/** Version-one, single-table durable library declaration. */
export const researchLibraryDomainSpec = defineDomain({
  name: 'research_library',
  version: 1,
  tables: {
    papers: domainTable<ResearchPaperId, ResearchPaperRecord>(researchPaperRecord),
  },
})
