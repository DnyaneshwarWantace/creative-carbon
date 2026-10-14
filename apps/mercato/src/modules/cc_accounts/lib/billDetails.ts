import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { poTermsForBill } from '../../cc_orders/lib/poDocs'
import { CustomerAddress } from '@open-mercato/core/modules/customers/data/entities'
import { CcOrderLine, CcOrderStage, type CcOrder } from '../../cc_orders/data/entities'
import { loadCustomers, type OrderContext } from '../../cc_orders/lib/server'
import { paymentTermLabel } from '../../cc_lists/lib/paymentTerms'
import type { z } from 'zod'
import type { BillDetails, BillParty } from '../data/entities'
import type { billDetailsPatchSchema } from '../data/validators'
import { GST_STATES } from './gstStates'

type Scope = Pick<OrderContext, 'em' | 'tenantId' | 'organizationId'>

export const BILL_TEXT_FIELDS = [
  'placeOfSupply',
  'deliveryNote',
  'paymentTerms',
  'referenceNo',
  'otherReferences',
  'buyerOrderNo',
  'buyerOrderDate',
  'dispatchDocNo',
  'deliveryNoteDate',
  'dispatchedThrough',
  'destination',
  'termsOfDelivery',
  'remarks',
  'irn',
  'ackNo',
  'ackDate',
  'signedQr',
] as const

export const BILL_PARTY_FIELDS = ['name', 'address', 'gstin', 'pan', 'stateName', 'stateCode', 'contact', 'email'] as const

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function dotDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const [year, month, day] = iso.slice(0, 10).split('-')
  return `${day}.${month}.${year}`
}

export function partyFromGstin(gstin: string | null): Pick<BillParty, 'pan' | 'stateCode' | 'stateName'> {
  const code = gstin && /^\d{2}/.test(gstin) ? gstin.slice(0, 2) : null
  return {
    pan: gstin && gstin.length >= 12 ? gstin.slice(2, 12) : null,
    stateCode: code,
    stateName: code ? (GST_STATES[code] ?? null) : null,
  }
}

export function addressText(row: CustomerAddress): string {
  const street = [row.buildingNumber, row.flatNumber, row.addressLine1, row.addressLine2].filter((part) => text(part)).join(', ')
  const town = [row.city, row.region].filter((part) => text(part)).join(', ')
  const pin = [town, text(row.postalCode)].filter(Boolean).join(' - ')
  return [street, [pin, text(row.country) && row.country !== 'IN' && row.country !== 'India' ? row.country : 'India'].filter(Boolean).join(', ')].filter(Boolean).join('\n')
}

export async function customerAddresses(ctx: Scope, customerId: string): Promise<{ billing: CustomerAddress | null; shipping: CustomerAddress | null }> {
  const rows = await findWithDecryption(ctx.em, CustomerAddress, { entity: customerId, tenantId: ctx.tenantId, organizationId: ctx.organizationId } as never, undefined, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  const ordered = [...rows].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary))
  const billing = ordered.find((row) => row.purpose === 'billing') ?? ordered.find((row) => row.purpose !== 'shipping') ?? ordered[0] ?? null
  const shipping = ordered.find((row) => row.purpose === 'shipping') ?? billing
  return { billing, shipping }
}

export function lineNote(specs: Record<string, Record<string, string | undefined> | undefined> | null | undefined): string {
  const material = specs?.material ?? {}
  const packing = specs?.packing ?? {}
  const size = text(material.sheet_size)
  const thick = text(material.thickness_mm)
  const sizeText = size && thick ? `${size.replace(/\s*[x×]\s*/gi, 'X')}X${thick}MM` : thick ? `${thick}MM` : size
  const remarks = text(packing.remarks)
  return [sizeText?.toUpperCase(), remarks].filter(Boolean).join(' ')
}

export function piRemarks(code: string, date: string): string {
  return `AS PER PROFORMA INVOICE N ${code} DT ${dotDate(date).replace(/\./g, ' ')}`
}

export function invoiceRemarks(code: string, date: string, ewayBillNo: string | null): string {
  return `AS PER BILL NO. ${code} DT.${dotDate(date)}${ewayBillNo ? ` - EWAY BILL NO.${ewayBillNo}` : ''}`
}

type BillDoc = { code: string; orderId: string; lines: Array<{ productId: string }>; billDetails?: BillDetails | null; placeOfSupply?: string | null; transporter?: string | null; ewayBillNo?: string | null }

export async function ensureBillDetails(ctx: Scope, doc: BillDoc, kind: 'pi' | 'invoice' | 'credit_note', date: string): Promise<BillDetails> {
  if (doc.billDetails) return doc.billDetails
  const { findOrder } = await import('../../cc_orders/lib/server')
  const order = await findOrder(ctx as OrderContext, doc.orderId)
  doc.billDetails = await defaultBillDetails(ctx, { order, code: doc.code, date, kind, placeOfSupply: doc.placeOfSupply ?? null, transporter: doc.transporter ?? null, ewayBillNo: doc.ewayBillNo ?? null, lineProductIds: doc.lines.map((line) => line.productId) })
  return doc.billDetails
}

export async function defaultBillDetails(
  ctx: Scope,
  input: { order: CcOrder; code: string; date: string; kind: 'pi' | 'invoice' | 'credit_note'; placeOfSupply: string | null; transporter?: string | null; ewayBillNo?: string | null; lineProductIds: string[] },
): Promise<BillDetails> {
  const { order } = input
  const [customers, addresses, lines, stages] = await Promise.all([
    loadCustomers(ctx, [order.customerId]),
    customerAddresses(ctx, order.customerId),
    ctx.em.find(CcOrderLine, { orderId: order.id }, { orderBy: { position: 'asc' } }),
    ctx.em.find(CcOrderStage, { orderId: order.id, stageKey: { $in: ['dispatch', 'packing'] } }),
  ])
  const customer = customers.get(order.customerId)
  const gstin = customer?.gstin ?? null
  const fromGstin = partyFromGstin(gstin)
  const party = (address: CustomerAddress | null): BillParty => ({
    name: (customer?.name ?? '').toUpperCase(),
    address: address ? addressText(address) : null,
    gstin,
    ...fromGstin,
    contact: customer?.phone ?? null,
    email: customer?.email ?? null,
  })
  const dispatch = (stages.find((stage) => stage.stageKey === 'dispatch')?.data ?? {}) as Record<string, unknown>
  const po = await poTermsForBill(ctx, order.id)
  const terms = text(order.paymentRemarks) ?? (order.paymentTerms ? paymentTermLabel(order.paymentTerms) : null)
  const used = new Set<string>()
  const lineNotes = input.lineProductIds.map((productId) => {
    const line = lines.find((entry) => entry.productId === productId && !used.has(entry.id))
    if (!line) return ''
    used.add(line.id)
    return lineNote(line.specs as Record<string, Record<string, string | undefined>> | null)
  })
  const remarks = input.kind === 'pi' ? piRemarks(input.code, input.date) : invoiceRemarks(input.code, input.date, input.ewayBillNo ?? null)
  return {
    buyer: party(addresses.billing),
    consignee: party(addresses.shipping),
    placeOfSupply: input.placeOfSupply ? input.placeOfSupply.replace(/^\d{2}\s*/, '') : fromGstin.stateName,
    deliveryNote: input.code,
    paymentTerms: terms ? terms.toUpperCase() : null,
    referenceNo: `${input.code} dt. ${input.date}`,
    otherReferences: null,
    buyerOrderNo: text(order.customerPoRef) ?? 'VERBAL',
    buyerOrderDate: po.poDate ?? order.orderDate ?? null,
    dispatchDocNo: input.code,
    deliveryNoteDate: input.date,
    dispatchedThrough: text(input.transporter) ?? text(dispatch.transporter) ?? po.carrier,
    destination: text(dispatch.destination),
    termsOfDelivery: po.termsOfDelivery,
    remarks,
    lineNotes,
    irn: null,
    ackNo: null,
    ackDate: null,
    signedQr: null,
  }
}

export type BillDetailsPatch = z.infer<typeof billDetailsPatchSchema>

export function mergeBillDetails(current: BillDetails, patch: BillDetailsPatch): BillDetails {
  const next: BillDetails = { ...current, buyer: { ...current.buyer }, consignee: { ...current.consignee }, lineNotes: [...(current.lineNotes ?? [])] }
  for (const key of BILL_TEXT_FIELDS) {
    const value = patch[key]
    if (value !== undefined) next[key] = text(value)
  }
  for (const side of ['buyer', 'consignee'] as const) {
    const party = patch[side]
    if (!party) continue
    for (const key of BILL_PARTY_FIELDS) {
      const value = party[key]
      if (value === undefined) continue
      if (key === 'name') next[side].name = text(value) ?? next[side].name
      else next[side][key] = text(value)
    }
  }
  if (patch.lineNotes) next.lineNotes = patch.lineNotes.map((note) => (typeof note === 'string' ? note.trim() : ''))
  return next
}
