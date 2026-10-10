import { z } from 'zod'
import { MANUAL_PLACES, STOCK_PLACES } from '../../cc_products/lib/stock'

export { STOCK_PLACES }

export const stockQuerySchema = z.object({
  place: z.enum(STOCK_PLACES).default('wh_a'),
  q: z.string().trim().max(200).optional(),
  view: z.enum(['all', 'under_test', 'expiring', 'hold']).default('all'),
})

export const ledgerQuerySchema = z.object({
  place: z.enum(STOCK_PLACES).optional(),
  productId: z.string().uuid().optional(),
  lotId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const adjustSchema = z.object({
  place: z.enum(MANUAL_PLACES),
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
  from: z.enum(MANUAL_PLACES),
  to: z.enum(MANUAL_PLACES),
  quantity: z.coerce.number().positive().max(100000000),
  note: z.string().trim().max(500).nullable().optional(),
})

const parallelPlace = z.enum(['wh_a', 'wh_b', 'tank', 'floor', 'fg'])

export const parallelQuerySchema = z.object({
  place: parallelPlace.default('wh_a'),
  date: isoDate.optional(),
  summary: z.enum(['1']).optional(),
  targetDays: z.coerce.number().int().min(1).max(90).optional(),
})

export const parallelSaveSchema = z.object({
  place: parallelPlace,
  date: isoDate,
  note: z.string().trim().max(500).nullable().optional(),
  rows: z.array(z.object({ productId: z.string().uuid(), paper: z.coerce.number().min(0).max(100_000_000).nullable() })).min(1).max(2000),
})
