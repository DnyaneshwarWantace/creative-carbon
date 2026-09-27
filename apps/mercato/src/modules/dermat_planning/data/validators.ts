import { z } from 'zod'

const quantity = z.coerce.number().min(0).max(100_000_000)

export const planItemSchema = z.object({
  key: z.string().min(1).max(80),
  orderId: z.string().uuid().nullable(),
  lineId: z.string().uuid().nullable(),
  productId: z.string().uuid(),
  quantity: z.coerce.number().positive().max(100_000_000),
})

export const calculateSchema = z.object({ items: z.array(planItemSchema).max(200) })

export const reservationActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reserve'), orderId: z.string().uuid(), productId: z.string().uuid(), quantity, note: z.string().trim().max(500).optional().nullable() }),
  z.object({ action: z.literal('clear'), orderId: z.string().uuid(), productId: z.string().uuid(), note: z.string().trim().max(500).optional().nullable() }),
  z.object({
    action: z.literal('move'),
    orderId: z.string().uuid(),
    toOrderId: z.string().uuid(),
    productId: z.string().uuid(),
    quantity: z.coerce.number().positive().max(100_000_000),
    note: z.string().trim().min(1).max(500),
  }),
  z.object({
    action: z.literal('reserve_needed'),
    entries: z.array(z.object({ orderId: z.string().uuid(), productId: z.string().uuid(), quantity: z.coerce.number().positive().max(100_000_000) })).min(1).max(500),
  }),
])

export const reservationListSchema = z.object({
  orderId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
})

export const planInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(planItemSchema).max(200),
})

export const planUpdateSchema = planInputSchema.extend({ id: z.string().uuid() })

export type PlanItemInput = z.infer<typeof planItemSchema>
export type ReservationAction = z.infer<typeof reservationActionSchema>

export const planSendSchema = z.object({
  id: z.string().uuid(),
  prepareBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
})

export const planStoreSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['preparing', 'ready']),
  note: z.string().trim().max(1000).optional().nullable(),
})
