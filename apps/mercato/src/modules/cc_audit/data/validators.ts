import { z } from 'zod'

export const activityQuerySchema = z.object({
  type: z.string().regex(/^[a-z_]{2,40}$/, 'Unknown record type'),
  id: z.string().min(1).max(80),
  kind: z.enum(['change', 'stage', 'document', 'correction', 'comment', 'attachment', 'system']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})
