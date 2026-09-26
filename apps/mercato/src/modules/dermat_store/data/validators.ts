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

export const STOCK_PLACES = ['rm', 'pm', 'production', 'fg'] as const

export const stockQuerySchema = z.object({
  place: z.enum(STOCK_PLACES).default('rm'),
  q: z.string().trim().max(200).optional(),
  view: z.enum(['all', 'under_test', 'expiring', 'hold']).default('all'),
})

export const ledgerQuerySchema = z.object({
  place: z.enum(STOCK_PLACES).optional(),
  productId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const adjustSchema = z.object({
  place: z.enum(STOCK_PLACES),
  productId: z.string().uuid(),
  direction: z.enum(['in', 'out']),
  quantity: z.coerce.number().positive().max(100000000),
  lotId: z.string().uuid().nullable().optional(),
  newLot: z.object({ lotNumber: z.string().trim().min(1).max(120), expiryDate: isoDate.nullable().optional(), mfgDate: isoDate.nullable().optional() }).nullable().optional(),
  reason: z.string().trim().min(1).max(80),
  note: z.string().trim().max(500).nullable().optional(),
})

export const transferSchema = z.object({
  productId: z.string().uuid(),
  lotId: z.string().uuid().nullable(),
  from: z.enum(STOCK_PLACES),
  to: z.enum(STOCK_PLACES),
  quantity: z.coerce.number().positive().max(100000000),
  note: z.string().trim().max(500).nullable().optional(),
})
