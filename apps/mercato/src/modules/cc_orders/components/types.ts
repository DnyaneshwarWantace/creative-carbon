import type { ReopenInfo } from '../lib/stages'
export type Customer = {
  id: string
  name: string
  gstin: string | null
  paymentTerms: string | null
  paymentRemarks: string | null
  salesManager: string | null
  phone?: string | null
  email?: string | null
}

export type ProductInfo = {
  id: string
  title: string
  code: string | null
  sku: string | null
  kind: string | null
  unit: string | null
  packSize: string | null
  brandName: string | null
  mrp: number | null
}

export type OrderLine = {
  id: string
  position: number
  productId: string
  product: ProductInfo | null
  brandName: string | null
  packSize: string | null
  mrp: number | null
  quantity: number
  rate: number | null
  gstPercent: number
  discountPercent: number | null
  price: { gross: number; discount: number; taxable: number; gst: number; total: number } | null
  batchNo: string | null
  sampleNeeded?: boolean
  rdNumber?: string | null
  specs: Record<string, Record<string, string>>
}

export type OrderPayment = {
  id: string
  kind: 'advance' | 'balance' | 'other'
  amount: number
  paidOn: string
  mode: string | null
  reference: string | null
  note: string | null
  byName: string | null
  voided: boolean
  voidReason: string | null
  createdAt: string
}

export type Stage = {
  key: string
  locked?: boolean
  label: string
  department: string
  hint: string
  status: 'waiting' | 'open' | 'on_hold' | 'done' | 'skipped'
  responsibleUserId: string | null
  responsibleName: string | null
  data: Record<string, unknown>
  holdReason: string | null
  holdParty: string | null
  openedAt: string | null
  completedAt: string | null
  completedByName: string | null
  days: number | null
  reopen?: ReopenInfo
}

export type OrderEvent = { id: string; stageKey: string | null; action: string; note: string | null; byName: string | null; changes: Array<{ key: string; label: string; from: string | number | null; to: string | number | null }>; at: string }

export type StageDocumentStatus = { key: string; label: string; hint: string; required?: 'always' | 'eway'; count: number; needed: boolean }

export type Order = {
  id: string
  orderNo: string
  orderDate: string
  deliveryDate: string | null
  customerId: string
  customer: Customer | null
  customerPoRef: string | null
  orderType: 'new' | 'repeat' | 'revision'
  sourceOrderId: string | null
  salesManager: string | null
  market?: 'domestic' | 'export'
  incoterm?: string | null
  portOfLoading?: string | null
  country?: string | null
  currency?: string | null
  paymentTerms: string | null
  paymentRemarks: string | null
  productRemarks: string | null
  billingRemarks: string | null
  packingRemarks: string | null
  status: 'booked' | 'confirmed' | 'completed' | 'cancelled'
  headline?: 'booked' | 'confirmed' | 'updated' | 'completed' | 'delivered' | 'cancelled'
  priority?: 'normal' | 'urgent'
  billingAddress?: string | null
  shippingAddress?: string | null
  revisedAt?: string | null
  revisedByName?: string | null
  revisionNote?: string | null
  onHold: boolean
  revision?: number
  held?: { at: string; reason: string | null; by: string | null } | null
  createdByName: string | null
  createdAt: string
  updatedAt: string
  linesLocked: boolean
  lines: OrderLine[]
  stages: Stage[]
  documents?: Record<string, StageDocumentStatus[]>
  pricesIncludeGst: boolean
  canSeeMoney: boolean
  access?: { full: boolean; stages: string[] }
  totals: { gross: number; discount: number; taxable: number; gst: number; total: number } | null
  payments: { received: number; due: number; items: OrderPayment[] } | null
  events: OrderEvent[]
}

export type OrderListItem = {
  id: string
  orderNo: string
  orderDate: string
  deliveryDate: string | null
  customerId: string
  customerName: string
  status: Order['status']
  headline?: Order['headline']
  priority?: 'normal' | 'urgent'
  orderType: string
  salesManager: string | null
  products: Array<{ id: string; title: string; code: string | null; quantity: number }>
  current: Array<{ key: string; label: string; status: string; responsibleName: string | null; days: number | null; holdParty: string | null; started?: boolean }>
  doneCount: number
  stageCount: number
}
