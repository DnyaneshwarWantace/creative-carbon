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

export type BomRef = { id: string; version: number; status: string } | null

export type OrderLine = {
  id: string
  position: number
  productId: string
  product: ProductInfo | null
  bom: BomRef
  brandName: string | null
  packSize: string | null
  mrp: number | null
  quantity: number
  rate: number | null
  batchNo: string | null
  specs: Record<string, Record<string, string>>
}

export type Stage = {
  key: string
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
}

export type OrderEvent = { id: string; stageKey: string | null; action: string; note: string | null; byName: string | null; at: string }

export type OrderQcCheck = {
  id: string
  code: string
  productId: string
  productTitle: string
  status: 'pending' | 'passed' | 'failed'
  chemicalStatus: 'pending' | 'pass' | 'fail' | 'na'
  microStatus: 'pending' | 'pass' | 'fail' | 'na'
  batchNo: string | null
}

export type OrderStoreRequest = {
  id: string
  code: string
  store: 'rm' | 'pm'
  status: 'requested' | 'partly_issued' | 'issued' | 'received' | 'used' | 'cancelled'
  awaitingReceipt: boolean
  lineCount: number
  issuedLines: number
}

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
  paymentTerms: string | null
  paymentRemarks: string | null
  productRemarks: string | null
  billingRemarks: string | null
  packingRemarks: string | null
  status: 'booked' | 'confirmed' | 'completed' | 'cancelled'
  onHold: boolean
  createdByName: string | null
  createdAt: string
  updatedAt: string
  linesLocked: boolean
  lines: OrderLine[]
  stages: Stage[]
  qc: Record<string, OrderQcCheck[]>
  store: Record<string, OrderStoreRequest[]>
  reservations: Array<{ productId: string; title: string; unit: string | null; quantity: number; since: string }>
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
  orderType: string
  salesManager: string | null
  products: Array<{ id: string; title: string; code: string | null; quantity: number }>
  current: Array<{ key: string; label: string; status: string; responsibleName: string | null; days: number | null; holdParty: string | null }>
  doneCount: number
  stageCount: number
}
