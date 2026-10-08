import { z } from 'zod'
import { orderInputSchema } from '../../cc_orders/data/validators'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null))

export const ENQUIRY_STAGES = ['new', 'quoted', 'negotiating', 'won', 'lost'] as const

export const enquiryInputSchema = z.object({
  source: z.string().trim().min(1).max(60),
  receivedAt: z.string().min(10).max(40),
  customerId: z.string().uuid().optional().nullable(),
  companyName: text(200),
  contactName: text(120),
  phone: text(40),
  email: text(160),
  place: text(120),
  subject: z.string().trim().min(1).max(300),
  details: text(4000),
  ownerName: text(120),
  nextActionOn: isoDate.optional().nullable(),
  nextActionNote: text(500),
})

export const enquiryUpdateSchema = enquiryInputSchema.extend({ id: z.string().uuid() })

export const enquiryActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['stage', 'follow_up', 'note']),
  stage: z.enum(ENQUIRY_STAGES).optional(),
  lostReason: text(200),
  nextActionOn: isoDate.optional().nullable(),
  nextActionNote: text(500),
  note: text(1000),
})

export const enquiryListSchema = z.object({
  id: z.string().uuid().optional(),
  stage: z.enum([...ENQUIRY_STAGES, 'open', 'overdue', 'all']).default('open'),
  search: z.string().trim().max(200).optional(),
})

export const quotationInputSchema = orderInputSchema.extend({
  validUntil: isoDate.optional().nullable(),
  enquiryId: z.string().uuid().optional().nullable(),
})

export const quotationUpdateSchema = quotationInputSchema.extend({ id: z.string().uuid() })

export const quotationActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['sent', 'accepted', 'rejected', 'reopen', 'convert']),
  orderDate: isoDate.optional(),
  customerPoRef: text(120),
  note: text(1000),
})

export const quotationListSchema = z.object({
  id: z.string().uuid().optional(),
  enquiryId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  status: z.enum(['draft', 'sent', 'accepted', 'rejected', 'converted', 'open', 'all']).default('all'),
})

export const rateQuerySchema = z.object({
  grade: z.string().trim().max(60).optional(),
  thickness: z.coerce.number().min(0).max(1000).optional(),
  currency: z.string().trim().max(10).optional(),
})

export type EnquiryInput = z.infer<typeof enquiryInputSchema>
export type EnquiryAction = z.infer<typeof enquiryActionSchema>
export type QuotationInput = z.infer<typeof quotationInputSchema>
export type QuotationAction = z.infer<typeof quotationActionSchema>
