import { z } from 'zod'

const text = (max: number) => z.string().trim().max(max).optional().nullable()
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const rdInputSchema = z.object({
  kind: z.enum(['client', 'npd']).default('client'),
  customerId: z.string().uuid().optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
  productName: z.string().trim().min(1).max(200),
  brand: text(200),
  productType: text(120),
  ingredients: text(2000),
  texture: text(200),
  fragrance: text(200),
  colour: text(200),
  packSize: text(60),
  notes: text(2000),
  dueDate: day.optional().nullable(),
  assignedName: text(120),
})

export const rdUpdateSchema = rdInputSchema.extend({ id: z.string().uuid() })

export const rdActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['start', 'sample_sent', 'feedback', 'drop', 'reopen']),
  sentOn: day.optional().nullable(),
  sentVia: text(200),
  result: z.enum(['approved', 'changes']).optional(),
  feedback: text(2000),
  note: text(1000),
})

export const rdListSchema = z.object({
  id: z.string().uuid().optional(),
  view: z.enum(['open', 'samples', 'approved', 'closed', 'all']).default('open'),
  kind: z.enum(['client', 'npd']).optional(),
  customerId: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
})

export type RdInput = z.infer<typeof rdInputSchema>
export type RdAction = z.infer<typeof rdActionSchema>
