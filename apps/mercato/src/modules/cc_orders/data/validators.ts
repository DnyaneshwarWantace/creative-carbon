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
  sampleNeeded: z.boolean().default(false),
  rdNumber: optionalText(60),
  specs: z.object({ material: specSection, packing: specSection }).optional(),
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
  market: z.enum(['domestic', 'export']).default('domestic'),
  incoterm: optionalText(20),
  portOfLoading: optionalText(80),
  country: optionalText(80),
  currency: optionalText(10),
  paymentRemarks: optionalText(200),
  productRemarks: optionalText(2000),
  billingRemarks: optionalText(2000),
  packingRemarks: optionalText(2000),
  pricesIncludeGst: z.boolean().default(false),
  priority: z.enum(['normal', 'urgent']).default('normal'),
  billingAddress: optionalText(1000),
  shippingAddress: optionalText(1000),
  lines: z.array(orderLineInputSchema).min(1).max(50),
})

export const orderUpdateSchema = orderInputSchema.extend({ id: z.string().uuid(), revisionNote: optionalText(500) })

export const stageActionSchema = z.object({
  orderId: z.string().uuid(),
  stageKey: z.enum(STAGE_KEYS as [string, ...string[]]),
  action: z.enum(['start', 'save', 'complete', 'hold', 'resume', 'revert', 'skip', 'assign', 'step', 'delivered']),
  stepKey: z.string().max(60).optional(),
  done: z.boolean().optional(),
  data: z.record(z.string(), z.union([z.string().max(2000), z.number(), z.null()])).optional(),
  note: optionalText(1000),
  holdParty: optionalText(60),
  followUpOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
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

export type OrderListQuery = z.infer<typeof orderListQuerySchema>
export type OrderInput = z.infer<typeof orderInputSchema>
export type OrderLineInput = z.infer<typeof orderLineInputSchema>
export type StageActionInput = z.infer<typeof stageActionSchema>

const settingKey = z.string().trim().min(1).max(60)

export const stageSettingSchema = z.object({
  stageKey: settingKey,
  label: z.string().trim().max(80).optional().nullable(),
  dayLimit: z.coerce.number().int().min(1).max(365).optional().nullable(),
  reopenHours: z.coerce.number().int().min(0).max(720).optional().nullable(),
  hiddenSteps: z.array(settingKey).max(30).default([]),
  requiredFields: z.array(settingKey).max(40).default([]),
  sharedFields: z.array(settingKey).max(60).optional().nullable(),
  defaultUserId: z.string().uuid().optional().nullable(),
  extraFields: z
    .array(
      z.object({
        key: z.string().regex(/^x_[a-z0-9_]{1,40}$/, 'Field keys start with x_'),
        label: z.string().trim().min(1, 'Every extra field needs a name').max(80),
        type: z.enum(['text', 'number', 'date', 'textarea', 'select']),
        options: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
        required: z.boolean().optional(),
      }),
    )
    .max(20)
    .default([]),
  documents: z.record(z.string(), z.enum(['always', 'optional'])).default({}),
  extraDocuments: z
    .array(z.object({ key: z.string().regex(/^x_[a-z0-9_]{1,40}$/), label: z.string().trim().min(1, 'Every extra document needs a name').max(80), required: z.boolean() }))
    .max(10)
    .default([]),
})

export type StageSettingInput = z.infer<typeof stageSettingSchema>

export const fulfilmentQuerySchema = z.object({ id: z.string().uuid(), lineId: z.string().uuid().optional() })

export const fulfilmentActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('allocate'), orderId: z.string().uuid(), lineId: z.string().uuid(), lotId: z.string().uuid(), qty: z.coerce.number().positive().max(10_000_000) }),
  z.object({ action: z.literal('release'), orderId: z.string().uuid(), allocationId: z.string().uuid() }),
  z.object({
    action: z.literal('pack'),
    orderId: z.string().uuid(),
    lineId: z.string().uuid(),
    weights: z.array(z.coerce.number().min(0).max(100_000)).max(2000).default([]),
    pieces: z.coerce.number().int().min(0).max(10_000_000).nullable().optional().transform((value) => value ?? null),
    notes: z.string().trim().max(500).nullable().optional().transform((value) => value ?? null),
  }),
  z.object({ action: z.literal('packed'), orderId: z.string().uuid() }),
  z.object({ action: z.literal('qc_sync'), orderId: z.string().uuid() }),
])
