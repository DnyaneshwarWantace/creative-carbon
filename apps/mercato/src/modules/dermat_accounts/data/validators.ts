import { z } from 'zod'

export const PAYMENT_MODES = ['NEFT / RTGS', 'UPI', 'Cheque', 'Cash', 'Other'] as const

export const paymentInputSchema = z.object({
  orderId: z.string().uuid(),
  kind: z.enum(['advance', 'balance', 'other']),
  amount: z.coerce.number().positive().max(1_000_000_000),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(PAYMENT_MODES).optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
})

export const paymentVoidSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(500) })

export const duesQuerySchema = z.object({ view: z.enum(['due', 'all']).default('due'), search: z.string().trim().max(120).optional() })

export type PaymentInput = z.infer<typeof paymentInputSchema>
