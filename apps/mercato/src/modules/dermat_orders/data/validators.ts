import { z } from 'zod'
import { STAGE_KEYS } from '../lib/stages'

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable()
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const specSection = z.record(z.string().regex(/^[a-z_]+$/), z.string().trim().max(500)).optional()

export const orderLineInputSchema = z.object({
  productId: z.string().uuid(),
  brandName: optionalText(200),
  packSize: optionalText(60),
  mrp: z.coerce.number().min(0).max(10_000_000).optional().nullable(),
  quantity: z.coerce.number().positive().max(100_000_000),
  rate: z.coerce.number().min(0).max(10_000_000).optional().nullable(),
  gstPercent: z.coerce.number().min(0).max(40).default(18),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  batchNo: optionalText(60),
  specs: z.object({ production: specSection, primary: specSection, secondary: specSection }).optional(),
})

export const orderInputSchema = z.object({
  orderDate: isoDate,
  deliveryDate: isoDate.optional().nullable(),
  customerId: z.string().uuid(),
  customerPoRef: optionalText(120),
  orderType: z.enum(['new', 'repeat', 'revision']).default('new'),
  sourceOrderId: z.string().uuid().optional().nullable(),
  salesManager: optionalText(120),
  paymentTerms: optionalText(120),
  paymentRemarks: optionalText(200),
  productRemarks: optionalText(2000),
  billingRemarks: optionalText(2000),
  packingRemarks: optionalText(2000),
  pricesIncludeGst: z.boolean().default(false),
  lines: z.array(orderLineInputSchema).min(1).max(50),
})

export const orderUpdateSchema = orderInputSchema.extend({ id: z.string().uuid() })

export const stageActionSchema = z.object({
  orderId: z.string().uuid(),
  stageKey: z.enum(STAGE_KEYS as [string, ...string[]]),
  action: z.enum(['save', 'complete', 'hold', 'resume', 'revert', 'skip', 'assign', 'step', 'pm_status', 'new_round']),
  stepKey: z.string().max(60).optional(),
  productId: z.string().uuid().optional(),
  pmStatus: z.string().max(60).optional(),
  done: z.boolean().optional(),
  data: z.record(z.string(), z.union([z.string().max(2000), z.number(), z.null()])).optional(),
  note: optionalText(1000),
  holdParty: optionalText(60),
  responsibleUserId: z.string().uuid().optional().nullable(),
})

export const orderListQuerySchema = z.object({
  id: z.string().uuid().optional(),
  search: z.string().trim().max(200).optional(),
  status: z.enum(['booked', 'confirmed', 'on_hold', 'completed', 'cancelled', 'open']).optional(),
  stage: z.enum(STAGE_KEYS as [string, ...string[]]).optional(),
  stageStatus: z.enum(['active', 'waiting', 'done']).default('active'),
  customerId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export type OrderInput = z.infer<typeof orderInputSchema>
export type OrderLineInput = z.infer<typeof orderLineInputSchema>
export type StageActionInput = z.infer<typeof stageActionSchema>
