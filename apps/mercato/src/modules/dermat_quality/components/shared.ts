import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'

export const OPERATION_LABEL: Record<string, string> = {
  purchase_receipt: 'Inward (purchase receipt)',
  bulk: 'Bulk after manufacturing',
  filling: 'After filling',
  packing: 'Final after packing',
}

export const CHECK_VARIANT: Record<string, StatusBadgeVariant> = { pending: 'warning', passed: 'success', failed: 'error', reworked: 'neutral', rejected: 'neutral' }
export const CHECK_LABEL: Record<string, string> = { pending: 'Testing', passed: 'Passed', failed: 'Failed', reworked: 'Sent to rework', rejected: 'Batch rejected' }
export const PART_VARIANT: Record<string, StatusBadgeVariant> = { pending: 'warning', pass: 'success', fail: 'error', na: 'neutral' }
export const PART_LABEL: Record<string, string> = { pending: 'Pending', pass: 'Passed', fail: 'Failed', na: 'Not needed' }

export type QcResultRow = {
  key: string
  name: string
  class: string
  spec: string
  test: 'chemical' | 'micro'
  observation: string
  remark: string
  min?: number | null
  max?: number | null
  unit?: string | null
  instrument?: string | null
  inSpec?: boolean | null
}

export type QcWorksheet = {
  sampledBy?: string | null
  sampledAt?: string | null
  sampleQty?: string | null
  sampleRef?: string | null
  platedAt?: string | null
  incubationDays?: number | null
  retentionQty?: string | null
  retentionLocation?: string | null
  retentionKeptBy?: string | null
  notes?: string | null
}

export function limitText(row: Pick<QcResultRow, 'min' | 'max' | 'unit'>): string {
  const unit = row.unit ? ` ${row.unit}` : ''
  const has = (value: number | null | undefined) => value !== null && value !== undefined
  if (has(row.min) && has(row.max)) return `${row.min}–${row.max}${unit}`
  if (has(row.min)) return `≥ ${row.min}${unit}`
  if (has(row.max)) return `≤ ${row.max}${unit}`
  return ''
}

export type QcCheckView = {
  id: string
  code: string
  arNo: string | null
  round: number
  worksheet: QcWorksheet
  operation: string
  productId: string
  productTitle: string
  productCode: string | null
  orderId: string | null
  orderNo: string | null
  stageKey: string | null
  batchNo: string | null
  requiresChemical: boolean
  requiresMicro: boolean
  chemicalStatus: 'pending' | 'pass' | 'fail' | 'na'
  microStatus: 'pending' | 'pass' | 'fail' | 'na'
  status: 'pending' | 'passed' | 'failed' | 'reworked' | 'rejected'
  results: QcResultRow[]
  chemicalBy: string | null
  chemicalAt: string | null
  microBy: string | null
  microAt: string | null
  history: Array<{ action: string; by: string | null; at: string; note: string | null }>
  createdAt: string
  updatedAt: string
}

export function when(value: string | null): string {
  return value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''
}
