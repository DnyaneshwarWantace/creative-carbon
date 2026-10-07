import { z } from 'zod'

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
