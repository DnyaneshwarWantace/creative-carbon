import { z } from 'zod'

export const STORE_STAGES = ['manufacturing', 'filling', 'packing'] as const

const quantity = z.coerce.number().positive().max(100_000_000)

export const requestCreateSchema = z.object({
  orderId: z.string().uuid(),
  stageKey: z.enum(STORE_STAGES),
  notes: z.string().trim().max(1000).optional().nullable(),
  lines: z.array(z.object({ productId: z.string().uuid(), quantity })).min(1).max(200),
})

export const issueSchema = z.object({
  id: z.string().uuid(),
  lines: z.array(z.object({ lineId: z.string().uuid(), lotId: z.string().uuid().nullable().optional(), quantity })).min(1).max(200),
  note: z.string().trim().max(1000).optional().nullable(),
})

export const receiveSchema = z.object({ id: z.string().uuid(), note: z.string().trim().max(1000).optional().nullable() })

export const returnSchema = z.object({
  id: z.string().uuid(),
  lines: z.array(z.object({ lineId: z.string().uuid(), quantity })).min(1).max(200),
  note: z.string().trim().min(1).max(1000),
})

export const cancelSchema = z.object({ id: z.string().uuid(), note: z.string().trim().min(1).max(1000) })

export const listSchema = z.object({
  id: z.string().uuid().optional(),
  view: z.enum(['to_issue', 'to_receive', 'done', 'all']).default('all'),
  store: z.enum(['rm', 'pm']).optional(),
  orderId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  stageKey: z.enum(STORE_STAGES).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export const suggestSchema = z.object({ orderId: z.string().uuid(), stageKey: z.enum(STORE_STAGES) })

export type RequestCreateInput = z.infer<typeof requestCreateSchema>
export type IssueInput = z.infer<typeof issueSchema>
export type ReturnInput = z.infer<typeof returnSchema>
