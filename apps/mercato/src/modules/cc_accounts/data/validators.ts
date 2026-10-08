import { z } from 'zod'


const paymentModeSchema = z.string().trim().min(1).max(80)

export const paymentInputSchema = z.object({
  orderId: z.string().uuid(),
  kind: z.enum(['advance', 'balance', 'other']),
  amount: z.coerce.number().positive().max(1_000_000_000),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: paymentModeSchema.optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
})

export const paymentUpdateSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['advance', 'balance', 'other']).optional(),
  amount: z.coerce.number().positive().max(1_000_000_000).optional(),
  paidOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mode: paymentModeSchema.optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(500).optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  reason: z.string().trim().min(1).max(500),
})

export const receiptsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mode: paymentModeSchema.optional(),
  customerId: z.string().uuid().optional(),
  search: z.string().trim().max(120).optional(),
  includeVoided: z.enum(['0', '1']).default('0'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export const statementQuerySchema = z.object({ customerId: z.string().uuid() })

export const paymentVoidSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(500) })

export const duesQuerySchema = z.object({ view: z.enum(['due', 'all']).default('due'), search: z.string().trim().max(120).optional() })

export type PaymentInput = z.infer<typeof paymentInputSchema>

const text = (max: number) => z.string().trim().max(max).optional().nullable()
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const companyInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  legalName: text(200),
  gstin: z.string().trim().max(15).regex(/^$|^[0-9]{2}[A-Z0-9]{13}$/, 'GSTIN is 15 characters').optional().nullable(),
  pan: text(10),
  address: text(500),
  phone: text(60),
  email: text(200),
  website: text(200),
  bankName: text(120),
  bankBranch: text(120),
  bankAccount: text(40),
  bankIfsc: text(20),
  upiId: text(80),
  signatory: text(120),
  piTerms: text(3000),
  invoiceTerms: text(3000),
  piValidityDays: z.coerce.number().int().min(1).max(365).default(15),
  grnOverPercent: z.coerce.number().int().min(0).max(50).default(0),
})

export const piCreateSchema = z.object({
  orderId: z.string().uuid(),
  piDate: isoDay.optional().nullable(),
  validUntil: isoDay.optional().nullable(),
  advancePercent: z.coerce.number().min(0).max(100).optional().nullable(),
  terms: text(3000),
  bankDetails: text(1000),
  notes: text(2000),
})

export const piUpdateSchema = z.object({
  id: z.string().uuid(),
  piDate: isoDay.optional(),
  validUntil: isoDay.optional().nullable(),
  advancePercent: z.coerce.number().min(0).max(100).optional().nullable(),
  terms: text(3000),
  bankDetails: text(1000),
  notes: text(2000),
  refreshLines: z.boolean().optional(),
})

export const piActionSchema = z.object({ id: z.string().uuid(), action: z.enum(['send', 'cancel']), reason: text(500) })

export const piListSchema = z.object({
  id: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  status: z.enum(['draft', 'sent', 'cancelled']).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

const invoiceLineSchema = z.object({ orderLineId: z.string().uuid(), quantity: z.coerce.number().min(0).max(100_000_000) })

export const invoiceCreateSchema = z.object({
  orderId: z.string().uuid(),
  invoiceDate: isoDay.optional().nullable(),
  lines: z.array(invoiceLineSchema).max(50).optional().nullable(),
  notes: text(2000),
})

export const invoiceUpdateSchema = z.object({
  id: z.string().uuid(),
  invoiceDate: isoDay.optional(),
  dueDate: isoDay.optional().nullable(),
  lines: z.array(invoiceLineSchema).max(50).optional(),
  transporter: text(120),
  vehicleNo: text(40),
  lrNo: text(60),
  ewayBillNo: text(20),
  terms: text(3000),
  bankDetails: text(1000),
  notes: text(2000),
})

export const invoiceActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['issue', 'cancel', 'credit_note']),
  reason: text(500),
  lines: z.array(invoiceLineSchema).max(50).optional(),
})

export const invoiceListSchema = z.object({
  id: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  kind: z.enum(['invoice', 'credit_note']).optional(),
  status: z.enum(['draft', 'issued', 'cancelled']).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

const billDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const vendorBillInputSchema = z.object({
  vendorId: z.string().uuid(),
  billNo: z.string().trim().min(1).max(80),
  billDate: billDay,
  dueDate: billDay.optional().nullable(),
  grnIds: z.array(z.string().uuid()).max(50).default([]),
  taxable: z.coerce.number().min(0).max(1_000_000_000).optional().nullable(),
  gst: z.coerce.number().min(0).max(1_000_000_000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
})

export const vendorBillActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['pay', 'cancel']),
  amount: z.coerce.number().positive().max(1_000_000_000).optional(),
  paidOn: billDay.optional().nullable(),
  mode: z.string().trim().max(80).optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(1000).optional().nullable(),
})

export const vendorBillListSchema = z.object({
  id: z.string().uuid().optional(),
  view: z.enum(['to_pay', 'overdue', 'paid', 'all']).default('to_pay'),
  vendorId: z.string().uuid().optional(),
  unbilledFor: z.string().uuid().optional(),
})

export type VendorBillInput = z.infer<typeof vendorBillInputSchema>
export type VendorBillAction = z.infer<typeof vendorBillActionSchema>

const seriesText = z.string().max(60).regex(/^[A-Za-z0-9/\-_. {}]*$/, 'Use letters, digits, spaces, / - _ . and the {…} codes only')

export const numberSeriesInputSchema = z.object({
  items: z
    .array(
      z.object({
        key: z.enum(['SO', 'PI', 'INV', 'CN', 'VB', 'IND', 'PO', 'GR', 'SKU', 'RB', 'PB', 'LOT_BS', 'LOT_PR', 'LOT_MO', 'LOT_CUT', 'LOT_FG', 'LOT_BI']),
        prefix: seriesText.min(1, 'Prefix cannot be empty'),
        suffix: seriesText.optional().nullable(),
        pad: z.coerce.number().int().min(1).max(8),
        startAt: z.coerce.number().int().min(1).max(99_999_999),
      }),
    )
    .min(1)
    .max(40),
})

export const tallyQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the start date'),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the end date'),
  kinds: z.string().max(200).optional(),
  format: z.enum(['summary', 'xml', 'csv']).default('summary'),
  masters: z.enum(['true', 'false']).optional(),
}).passthrough()
