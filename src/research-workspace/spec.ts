/** Version-two profile-local reading positions and declared reviewer identities. */

import { z } from 'zod'
import { ResearchDocumentId } from '../research-document/index.ts'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { ResearchAuthorId } from '../research-information/types.ts'
import type { ResearchReadingPosition, ResearchWorkspaceReviewer } from './types.ts'

/** Durable reading-position fields, validated before decoding or writing. */
export const researchReadingPositionSchema = z.strictObject({
  documentId: z.string().regex(/^sha256:[0-9a-f]{64}$/).transform(ResearchDocumentId),
  parserId: z.string().min(1), parserVersion: z.string().min(1),
  pageIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
})

/** Stored local identity; scientific decisions remain in research-information. */
export const researchWorkspaceReviewerSchema = z.strictObject({
  id: z.uuid().transform(value => value as ResearchAuthorId),
  displayName: z.string().min(1),
})

/** Durable reading and local reviewer domain; scientific decisions remain in question aggregates. */
export const researchWorkspaceDomainSpec = defineDomain({
  name: 'research_workspace', version: 2,
  tables: {
    positions: domainTable<ResearchDocumentId, ResearchReadingPosition>(researchReadingPositionSchema),
    reviewers: domainTable<ResearchAuthorId, ResearchWorkspaceReviewer>(researchWorkspaceReviewerSchema),
  },
})
