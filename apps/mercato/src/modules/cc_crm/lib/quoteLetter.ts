import { z } from 'zod'

export const quoteLetterSchema = z.object({
  quoteType: z.enum(['budgetary', 'firm']).default('budgetary'),
  toDesignation: z.string().trim().max(200).default(''),
  toCompany: z.string().trim().max(200).default(''),
  toAddress: z.string().trim().max(600).default(''),
  kindAttn: z.string().trim().max(120).default(''),
  refLine: z.string().trim().max(400).default(''),
  grade: z.string().trim().max(80).default(''),
  delivery: z.string().trim().max(200).default(''),
  taxes: z.string().trim().max(200).default(''),
  packing: z.string().trim().max(200).default(''),
  freight: z.string().trim().max(200).default(''),
  validity: z.string().trim().max(200).default(''),
  payment: z.string().trim().max(200).default(''),
  showTotal: z.boolean().default(false),
  lines: z
    .array(z.object({ drawing: z.string().trim().max(200).default(''), unit: z.string().trim().max(20).default(''), ratePer: z.string().trim().max(20).default('') }))
    .max(50)
    .default([]),
})

export type QuoteLetter = z.infer<typeof quoteLetterSchema>

export const QUOTE_TERMS_DEFAULTS = {
  delivery: 'Within 30 to 40 Days',
  packing: 'Nill',
  freight: 'Freight Paid Basis',
  payment: '100% Against GRN.',
}

const SOURCE_WORD: Record<string, string> = {
  Email: 'Mail',
  WhatsApp: 'WhatsApp message',
  Phone: 'call',
  IndiaMART: 'IndiaMART enquiry',
  'Walk-in': 'visit',
  Referral: 'enquiry',
}

export function slashDate(iso: string | Date | null | undefined): string {
  if (!iso) return ''
  const value = typeof iso === 'string' ? iso.slice(0, 10) : iso.toISOString().slice(0, 10)
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

export function refLineFor(enquiry: { source: string; receivedAt: Date; contactName?: string | null; phone?: string | null } | null): string {
  if (!enquiry) return ''
  const word = SOURCE_WORD[enquiry.source] ?? 'enquiry'
  const by = enquiry.contactName ? ` by ${enquiry.contactName}` : ''
  const phone = enquiry.phone ? `. MO: ${enquiry.phone.replace(/^\+91\s*/, '')}` : ''
  return `With Ref. To your ${word} Dated: ${slashDate(enquiry.receivedAt)}${by}${phone}`
}

export function defaultQuoteLetter(input: {
  customerName: string
  address: string | null
  enquiry: { source: string; receivedAt: Date; contactName?: string | null; phone?: string | null } | null
  interState: boolean
  gstPercent: number
  quoteDate: string
  validUntil: string | null
  paymentRemarks: string | null
  lines: Array<{ unit: string | null; grade: string | null }>
}): QuoteLetter {
  const days = input.validUntil ? Math.max(1, Math.round((new Date(`${input.validUntil}T00:00:00Z`).getTime() - new Date(`${input.quoteDate}T00:00:00Z`).getTime()) / 86_400_000)) : 30
  const grades = [...new Set(input.lines.map((line) => line.grade).filter((grade): grade is string => Boolean(grade)))]
  return {
    quoteType: 'budgetary',
    toDesignation: '',
    toCompany: input.customerName.toUpperCase(),
    toAddress: (input.address ?? '').toUpperCase(),
    kindAttn: input.enquiry?.contactName ? input.enquiry.contactName.toUpperCase() : '',
    refLine: refLineFor(input.enquiry),
    grade: grades.length === 1 ? grades[0] : '',
    delivery: QUOTE_TERMS_DEFAULTS.delivery,
    taxes: `${input.interState ? 'IGST' : 'GST'}-${input.gstPercent}% Extra or as Applicable.`,
    packing: QUOTE_TERMS_DEFAULTS.packing,
    freight: QUOTE_TERMS_DEFAULTS.freight,
    validity: `${days} DAYS`,
    payment: input.paymentRemarks ? input.paymentRemarks : QUOTE_TERMS_DEFAULTS.payment,
    showTotal: false,
    lines: input.lines.map((line) => {
      const pieces = line.unit === 'nos' || line.unit === 'pcs'
      return { drawing: '', unit: pieces ? 'NOS' : 'KG', ratePer: pieces ? 'EACH' : 'KG' }
    }),
  }
}
