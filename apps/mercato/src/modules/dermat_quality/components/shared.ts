import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'

export const OPERATION_LABEL: Record<string, string> = {
  purchase_receipt: 'Inward (purchase receipt)',
  bulk: 'Bulk after manufacturing',
  filling: 'After filling',
  packing: 'Final after packing',
}

export const CHECK_VARIANT: Record<string, StatusBadgeVariant> = { pending: 'warning', passed: 'success', failed: 'error' }
export const PART_VARIANT: Record<string, StatusBadgeVariant> = { pending: 'warning', pass: 'success', fail: 'error', na: 'neutral' }
export const PART_LABEL: Record<string, string> = { pending: 'Pending', pass: 'Passed', fail: 'Failed', na: 'Not needed' }

export type QcResultRow = { key: string; name: string; class: string; spec: string; test: 'chemical' | 'micro'; observation: string; remark: string }

export type QcCheckView = {
  id: string
  code: string
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
  status: 'pending' | 'passed' | 'failed'
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
