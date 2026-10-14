export const PO_DOCUMENTS = [
  { key: 'tax_invoice', label: 'Original tax invoice' },
  { key: 'eway_bill', label: 'E-way bill' },
  { key: 'lr_copy', label: 'LR copy (lorry receipt)' },
  { key: 'packing_list', label: 'Packing list' },
  { key: 'test_certificate', label: 'Test certificate' },
  { key: 'mtc', label: 'Manufacturer test certificate (MTC)' },
  { key: 'inspection_certificate', label: 'Inspection certificate' },
  { key: 'order_copy', label: 'Copy of the order' },
  { key: 'msds', label: 'MSDS' },
] as const

export type PoDocumentKey = (typeof PO_DOCUMENTS)[number]['key']
export type PoDocumentState = 'pending' | 'sent'

export type PoDocumentCheck = { key: PoDocumentKey; state: PoDocumentState }

export type PoDetails = {
  poDate: string | null
  amendmentNo: string | null
  ourOfferRef: string | null
  vendorCode: string | null
  buyerName: string | null
  buyerPhone: string | null
  buyerEmail: string | null
  indentNo: string | null
  indentDate: string | null
  division: string | null
  priceBasis: string | null
  freight: string | null
  packingForwarding: string | null
  carrier: string | null
  insurance: string | null
}

export type PoLineDetails = { itemCode: string | null; description: string | null; uom: string | null; deliveryDate: string | null }

export type PoAmendment = { no: string; date: string | null; note: string | null; byName: string | null; at: string }

export const EMPTY_PO_DETAILS: PoDetails = {
  poDate: null,
  amendmentNo: null,
  ourOfferRef: null,
  vendorCode: null,
  buyerName: null,
  buyerPhone: null,
  buyerEmail: null,
  indentNo: null,
  indentDate: null,
  division: null,
  priceBasis: null,
  freight: null,
  packingForwarding: null,
  carrier: null,
  insurance: null,
}

export const ACK_DAYS = 7

function isoDay(value: string): Date {
  return new Date(`${value}T12:00:00Z`)
}

export function addDaysIso(value: string, days: number): string {
  const date = isoDay(value)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function acknowledgementDue(poDate: string | null, acknowledgedAt: string | null, today: string): { due: string | null; overdue: boolean; daysLeft: number | null } {
  if (!poDate || acknowledgedAt) return { due: null, overdue: false, daysLeft: null }
  const due = addDaysIso(poDate, ACK_DAYS)
  const daysLeft = Math.round((isoDay(due).getTime() - isoDay(today).getTime()) / 86_400_000)
  return { due, overdue: daysLeft < 0, daysLeft }
}

export function earliestDelivery(lines: Array<{ deliveryDate: string | null }>, closed: boolean, today: string): { earliest: string | null; lateCount: number } {
  const dates = lines.map((line) => line.deliveryDate).filter((value): value is string => Boolean(value))
  const earliest = dates.length ? [...dates].sort()[0] : null
  const lateCount = closed ? 0 : dates.filter((value) => value < today).length
  return { earliest, lateCount }
}

export function openDocuments(checks: PoDocumentCheck[]): Array<{ key: PoDocumentKey; label: string }> {
  return checks.filter((check) => check.state !== 'sent').map((check) => ({ key: check.key, label: PO_DOCUMENTS.find((entry) => entry.key === check.key)?.label ?? check.key }))
}

export function termsOfDelivery(details: Pick<PoDetails, 'priceBasis' | 'freight' | 'packingForwarding' | 'insurance'>): string | null {
  const parts = [details.priceBasis, details.freight ? `Freight ${details.freight}` : null, details.packingForwarding ? `P&F ${details.packingForwarding}` : null, details.insurance ? `Insurance ${details.insurance}` : null]
  const text = parts.filter((part): part is string => Boolean(part && part.trim())).join(', ')
  return text || null
}

export function nextAmendmentNo(amendments: PoAmendment[]): string {
  const numbers = amendments.map((entry) => Number(entry.no)).filter((value) => Number.isFinite(value))
  return String((numbers.length ? Math.max(...numbers) : 0) + 1)
}
