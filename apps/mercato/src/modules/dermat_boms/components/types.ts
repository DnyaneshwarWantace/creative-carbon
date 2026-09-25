import type { BomKind } from '../lib/bomKinds'

export type ComponentOption = {
  id: string
  title: string
  code: string | null
  sku: string | null
  kind: string
  unit: string | null
  onHand: number
  specificGravity?: number | null
}

export type BomItemView = {
  id: string
  position: number
  componentProductId: string
  componentKind: string
  code: string | null
  sku: string | null
  name: string
  unit: string
  value: number
  quantity: number
  onHand: number
  available: number
  remark: string | null
  fillQty: number | null
  fillUnit: string | null
  specificGravity: number | null
}

export type BomView = {
  id: string
  code: string
  kind: BomKind
  productId: string
  product: {
    id: string
    title: string
    kind: string | null
    unit: string | null
    sku: string | null
    code: string | null
    packSize: string | null
    specificGravity: number | null
  } | null
  version: number
  status: 'draft' | 'approved' | 'superseded'
  batchSize: number
  batchUnit: string
  notes: string | null
  createdByName: string | null
  approvedByName: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
  totalPercent: number | null
  items: BomItemView[]
  versions: Array<{ id: string; code: string; version: number; status: string }>
}

export type BomListItem = {
  id: string
  code: string
  productId: string
  productKind: string
  productName: string
  productCode: string | null
  version: number
  status: 'draft' | 'approved' | 'superseded'
  batchSize: number
  batchUnit: string
  lineCount: number
  totalPercent: number | null
  createdByName: string | null
  approvedByName: string | null
  updatedAt: string
}
