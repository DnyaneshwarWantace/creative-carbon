import { z } from 'zod'

export const PO_DOCUMENTS = ['Original tax invoice', 'E-way bill', 'LR copy', 'Packing list', 'Test certificate', 'Material test certificate', 'Inspection certificate', 'Order copy', 'MSDS', 'Delivery challan'] as const

export const customerPoSchema = z.object({
  poDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).default(''),
  amendmentNo: z.coerce.number().int().min(0).max(99).default(0),
  offerRef: z.string().trim().max(120).default(''),
  vendorCode: z.string().trim().max(60).default(''),
  buyerName: z.string().trim().max(120).default(''),
  buyerPhone: z.string().trim().max(60).default(''),
  buyerEmail: z.string().trim().max(200).default(''),
  indentNo: z.string().trim().max(80).default(''),
  indentDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).default(''),
  division: z.string().trim().max(120).default(''),
  priceBasis: z.string().trim().max(120).default(''),
  freight: z.string().trim().max(120).default(''),
  packing: z.string().trim().max(120).default(''),
  carrier: z.string().trim().max(200).default(''),
  insurance: z.string().trim().max(300).default(''),
  docsRequired: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  docsSent: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
  acknowledged: z.boolean().default(false),
})

export type CustomerPo = z.infer<typeof customerPoSchema>

export const customerPoLineSchema = z.object({
  lineId: z.string().uuid(),
  itemCode: z.string().trim().max(80).default(''),
  description: z.string().trim().max(300).default(''),
  deliveryDate: z.string().regex(/^$|^\d{4}-\d{2}-\d{2}$/).default(''),
})

export function customerPoOf(stored: unknown): CustomerPo | null {
  if (!stored) return null
  const parsed = customerPoSchema.safeParse(stored)
  return parsed.success ? parsed.data : null
}

export function docsMissing(po: CustomerPo | null): string[] {
  if (!po) return []
  return po.docsRequired.filter((doc) => !po.docsSent.includes(doc))
}

export function termsOfDelivery(po: CustomerPo | null): string | null {
  if (!po) return null
  const parts = [po.priceBasis, po.freight ? `Freight: ${po.freight}` : '', po.packing ? `P&F: ${po.packing}` : ''].filter(Boolean)
  return parts.length ? parts.join(' · ').toUpperCase() : null
}
