export const recordHref = {
  product: (id: string) => `/backend/products/${id}`,
  lot: (id: string) => `/backend/stock/lots/${id}`,
  die: (id: string) => `/backend/masters/moulds/${id}`,
  machine: (kind: MachineKind, id: string) => `/backend/masters/plant/${kind}/${id}`,
  customer: (id: string) => `/backend/customers/companies/${id}`,
  vendor: (id: string) => `/backend/cc_vendors/${id}`,
  resinBatch: (id: string) => `/backend/resin/batches/${id}`,
  chemicalIssue: (id: string) => `/backend/resin/issues/${id}`,
  coatingSheet: (id: string) => `/backend/coating/${id}`,
  bstageLot: (id: string) => `/backend/bstage/lots/${id}`,
  pressBatch: (id: string) => `/backend/press/batches/${id}`,
  mouldingEntry: (id: string) => `/backend/moulding/entries/${id}`,
  cutting: (id: string) => `/backend/cutting/${id}`,
  thickness: (id: string) => `/backend/quality/thickness/${id}`,
  fgInspection: (id: string) => `/backend/quality/fg-inspection/${id}`,
  directIn: (id: string) => `/backend/fg/direct-in/${id}`,
  damage: (id: string) => `/backend/fg/damage/${id}`,
  labTest: (id: string) => `/backend/quality/lab/${id}`,
  stocktake: () => '/backend/stock/stocktake',
  storeLedger: () => '/backend/store/ledger',
  order: (id: string) => `/backend/orders/${id}`,
  enquiry: (id: string) => `/backend/crm/enquiries/${id}`,
  quotation: (id: string) => `/backend/crm/quotations/${id}`,
  purchaseOrder: (id: string) => `/backend/purchase/orders/${id}`,
  grn: (id: string) => `/backend/purchase/grns/${id}`,
  proforma: (id: string) => `/backend/accounts/proformas/${id}`,
  invoice: (id: string) => `/backend/accounts/invoices/${id}`,
}

export type MachineKind = 'reactor' | 'dryer' | 'press'

export type DocumentKind = 'grn' | 'resin' | 'press' | 'coating' | 'moulding' | 'chemical_issue' | 'cutting' | 'fg_inspection' | 'direct_in' | 'damage' | 'order' | 'stocktake' | 'scrap' | 'adjustment' | 'transfer'

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  grn: 'GRN',
  resin: 'Resin batch',
  press: 'Press batch',
  coating: 'Coating day sheet',
  moulding: 'Moulding entry',
  chemical_issue: 'Chemical issue',
  cutting: 'Cutting entry',
  fg_inspection: 'FG inspection',
  direct_in: 'Bought-in goods',
  damage: 'Damage entry',
  order: 'Order',
  stocktake: 'Stocktake',
  scrap: 'B-stage scrapped',
  adjustment: 'Stock adjustment',
  transfer: 'Store transfer',
}

export type DocumentLink = { kind: DocumentKind; label: string | null; href: string | null }

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

export function movementDocument(metadata: Record<string, unknown> | null | undefined): DocumentLink | null {
  if (!metadata) return null
  const source = str(metadata.source)
  const grnId = str(metadata.grnId)
  if (grnId) return { kind: 'grn', label: str(metadata.grnCode), href: recordHref.grn(grnId) }
  const batchId = str(metadata.batchId)
  if (source === 'cc_production.resin' && batchId) return { kind: 'resin', label: str(metadata.batchNo), href: recordHref.resinBatch(batchId) }
  if (source === 'cc_production.press' && batchId) return { kind: 'press', label: str(metadata.batchNo), href: recordHref.pressBatch(batchId) }
  const sheetId = str(metadata.sheetId)
  if (source === 'cc_production.coating' && sheetId) {
    const label = [str(metadata.dryerCode), str(metadata.sheetDate)].filter(Boolean).join(' · ')
    return { kind: 'coating', label: label || null, href: recordHref.coatingSheet(sheetId) }
  }
  const entryId = str(metadata.entryId)
  if (source === 'cc_production.moulding' && entryId) {
    const label = [str(metadata.dieNo), str(metadata.entryDate), metadata.shift ? `S${metadata.shift}` : null].filter(Boolean).join(' · ')
    return { kind: 'moulding', label: label || null, href: recordHref.mouldingEntry(entryId) }
  }
  const issueId = str(metadata.issueId)
  if (source === 'cc_production.chemical_issue') return { kind: 'chemical_issue', label: str(metadata.dryerCode), href: issueId ? recordHref.chemicalIssue(issueId) : '/backend/resin/issues' }
  if (source === 'cc_production.finishing') {
    const cuttingId = str(metadata.cuttingId)
    if (cuttingId) return { kind: 'cutting', label: null, href: recordHref.cutting(cuttingId) }
    const fgReportId = str(metadata.fgReportId)
    if (fgReportId) return { kind: 'fg_inspection', label: null, href: recordHref.fgInspection(fgReportId) }
    const directInId = str(metadata.directInId)
    if (directInId) return { kind: 'direct_in', label: null, href: recordHref.directIn(directInId) }
    const damageId = str(metadata.damageId)
    if (damageId) return { kind: 'damage', label: null, href: recordHref.damage(damageId) }
  }
  const orderId = str(metadata.orderId)
  if (orderId) return { kind: 'order', label: str(metadata.orderNo), href: recordHref.order(orderId) }
  if (source === 'cc_production.stocktake') return { kind: 'stocktake', label: str(metadata.countDate), href: recordHref.stocktake() }
  if (source === 'cc_production.bstage_scrap') return { kind: 'scrap', label: null, href: null }
  if (source === 'cc_store.adjust') return { kind: 'adjustment', label: null, href: recordHref.storeLedger() }
  if (source === 'cc_store.transfer') return { kind: 'transfer', label: null, href: recordHref.storeLedger() }
  return null
}
