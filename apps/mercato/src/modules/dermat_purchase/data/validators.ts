import { z } from 'zod'

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')

export const poLineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(100_000_000),
  rate: z.coerce.number().min(0).max(100_000_000),
  gstPercent: z.coerce.number().min(0).max(40).default(18),
  notes: z.string().trim().max(500).optional().nullable(),
})

export const poInputSchema = z.object({
  vendorId: z.string().uuid(),
  poDate: day,
  expectedDate: day.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  terms: z.string().trim().max(2000).optional().nullable(),
  orderRefs: z.array(z.object({ orderId: z.string().uuid(), orderNo: z.string().max(60) })).max(50).default([]),
  lines: z.array(poLineSchema).min(1).max(200),
  submit: z.boolean().default(false),
})

export const poUpdateSchema = poInputSchema.extend({ id: z.string().uuid() })

export const poActionSchema = z.object({ id: z.string().uuid(), note: z.string().trim().max(1000).optional().nullable() })
export const poCancelSchema = z.object({ id: z.string().uuid(), note: z.string().trim().min(1).max(1000) })

export const poListSchema = z.object({
  id: z.string().uuid().optional(),
  view: z.enum(['draft', 'pending_approval', 'open', 'received', 'all']).default('all'),
  productId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export const grnInputSchema = z.object({
  poId: z.string().uuid(),
  grnDate: day,
  invoiceNo: z.string().trim().max(80).optional().nullable(),
  invoiceDate: day.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(
      z.object({
        poLineId: z.string().uuid(),
        quantity: z.coerce.number().positive().max(100_000_000),
        lotNumber: z.string().trim().min(1).max(80),
        mfgDate: day.optional().nullable(),
        expiryDate: day.optional().nullable(),
      }),
    )
    .min(1)
    .max(200),
})

export const grnReturnSchema = z.object({ id: z.string().uuid(), lineId: z.string().uuid(), note: z.string().trim().min(1).max(1000) })

export const grnListSchema = z.object({
  id: z.string().uuid().optional(),
  view: z.enum(['under_test', 'approved', 'rejected', 'all']).default('all'),
  poId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export type PoInput = z.infer<typeof poInputSchema>
export type GrnInput = z.infer<typeof grnInputSchema>
