import { z } from 'zod'
import { FILL_UNITS } from '../lib/bomKinds'

const decimal = z.coerce.number().finite()

export const bomItemInputSchema = z
  .object({
    componentProductId: z.string().uuid(),
    value: decimal.positive().max(1_000_000).optional(),
    fillQty: decimal.positive().max(1_000_000).optional().nullable(),
    fillUnit: z.enum(FILL_UNITS).optional().nullable(),
    remark: z.string().trim().max(500).optional().nullable(),
  })
  .refine((item) => item.value != null || (item.fillQty != null && item.fillUnit != null), {
    message: 'Enter a quantity or a fill size',
  })

export const bomCreateSchema = z.object({
  productId: z.string().uuid(),
  batchSize: decimal.positive().max(10_000_000),
  notes: z.string().trim().max(4000).optional().nullable(),
  items: z.array(bomItemInputSchema).max(200),
})

export const bomUpdateSchema = bomCreateSchema.omit({ productId: true }).extend({
  id: z.string().uuid(),
})

export const bomActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['approve', 'new_version']),
})

export const bomListQuerySchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(['formula', 'pack']).optional(),
  productId: z.string().uuid().optional(),
  status: z.enum(['draft', 'approved', 'superseded']).optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export type BomCreateInput = z.infer<typeof bomCreateSchema>
export type BomUpdateInput = z.infer<typeof bomUpdateSchema>
export type BomItemInput = z.infer<typeof bomItemInputSchema>
