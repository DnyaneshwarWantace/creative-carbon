import { z } from 'zod'
import { requireReasonFor } from '../../cc_audit/lib/reason'

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
  indentIds: z.array(z.string().uuid()).max(50).default([]),
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
  vehicleNo: z.string().trim().max(60).optional().nullable(),
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

export const grnDecideSchema = z.object({ id: z.string().uuid(), lineId: z.string().uuid(), decision: z.enum(['passed', 'failed']), note: z.string().trim().max(1000).nullable().optional() })

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

export const directGrnInputSchema = z.object({
  vendorId: z.string().uuid(),
  grnDate: day,
  invoiceNo: z.string().trim().max(80).optional().nullable(),
  invoiceDate: day.optional().nullable(),
  vehicleNo: z.string().trim().max(60).optional().nullable(),
  reason: z.string().trim().min(3, 'Write why there is no PO').max(500),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z
    .array(
      z.object({
        productId: z.string().uuid(),
        quantity: z.coerce.number().positive().max(100_000_000),
        rate: z.coerce.number().min(0).max(100_000_000).default(0),
        gstPercent: z.coerce.number().min(0).max(28).default(18),
        lotNumber: z.string().trim().min(1).max(80),
        mfgDate: day.optional().nullable(),
        expiryDate: day.optional().nullable(),
      }),
    )
    .min(1)
    .max(200),
})

export type DirectGrnInput = z.infer<typeof directGrnInputSchema>

export const indentInputSchema = z.object({
  department: z.string().trim().max(120).optional().nullable(),
  source: z.enum(['department', 'planning', 'low_stock']).default('department'),
  neededBy: day.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  orderRefs: z.array(z.object({ orderId: z.string().uuid(), orderNo: z.string().max(60) })).max(50).default([]),
  lines: z.array(z.object({ productId: z.string().uuid(), quantity: z.coerce.number().positive().max(100_000_000), note: z.string().trim().max(500).optional().nullable() })).min(1).max(200),
})

export const indentActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['approve', 'reject', 'cancel']),
  note: z.string().trim().max(1000).optional().nullable(),
}).superRefine(requireReasonFor(['reject', 'cancel'], 'note'))

export const indentListSchema = z.object({
  id: z.string().uuid().optional(),
  view: z.enum(['to_approve', 'approved', 'ordered', 'closed', 'all']).default('all'),
  search: z.string().trim().max(200).optional(),
})

export type IndentInput = z.infer<typeof indentInputSchema>

const emailList = z.array(z.string().trim().email('Check the email address')).max(10)

export const poEmailSchema = z.object({
  id: z.string().uuid(),
  to: emailList.min(1, 'Enter the vendor email'),
  cc: emailList.default([]),
  message: z.string().trim().max(2000).optional().nullable(),
})

const jobWorkDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the date')
const jobWorkPlace = z.enum(['wh_a', 'wh_b', 'floor', 'fg'])
const optionalText = (max: number) => z.preprocess((value) => (typeof value === 'string' && value.trim() ? value.trim() : null), z.string().max(max).nullable().optional())

export const jobWorkCreateSchema = z.object({
  vendorId: z.string().uuid('Pick the job worker'),
  challanDate: jobWorkDay,
  process: z.string().trim().min(2, 'Write the process, e.g. Machining').max(120),
  expectedReturn: jobWorkDay.nullable().optional(),
  vehicleNo: optionalText(30),
  notes: optionalText(1000),
  lines: z.array(z.object({ lotId: z.string().uuid(), qty: z.coerce.number().positive('Enter the quantity').max(10_000_000), value: z.coerce.number().min(0).max(1_000_000_000).optional() })).min(1, 'Add at least one lot').max(40),
})

export const jobWorkReceiveSchema = z.object({
  id: z.string().uuid(),
  action: z.literal('receive'),
  date: jobWorkDay,
  note: optionalText(500),
  lines: z.array(z.object({ lineId: z.string().uuid(), qty: z.coerce.number().min(0).max(10_000_000).default(0), lossQty: z.coerce.number().min(0).max(10_000_000).default(0), toPlace: jobWorkPlace.optional() })).min(1).max(40),
})

export const jobWorkCancelSchema = z.object({
  id: z.string().uuid(),
  action: z.literal('cancel'),
  reason: z.string().trim().min(3, 'Write why it is cancelled').max(300),
})

export const jobWorkActionSchema = z.discriminatedUnion('action', [jobWorkReceiveSchema, jobWorkCancelSchema])

export const jobWorkListSchema = z.object({
  id: z.string().uuid().optional(),
  status: z.enum(['open', 'part_returned', 'returned', 'cancelled']).optional(),
  vendorId: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
  lots: z.enum(['1']).optional(),
})

export type JobWorkCreateInput = z.infer<typeof jobWorkCreateSchema>
export type JobWorkReceiveInput = z.infer<typeof jobWorkReceiveSchema>
