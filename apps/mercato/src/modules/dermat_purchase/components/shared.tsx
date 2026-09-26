"use client"

import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'

export type PoStatus = 'draft' | 'pending_approval' | 'approved' | 'partly_received' | 'received' | 'cancelled'
export type GrnStatus = 'under_test' | 'partly_approved' | 'approved' | 'rejected'
export type LineQc = 'pending' | 'passed' | 'failed' | 'returned'
export type HistoryEntry = { action: string; by: string | null; at: string; note: string | null }

export type PoLineView = {
  id: string
  productId: string
  title: string
  code: string | null
  kind: string | null
  unit: string
  quantity: number
  rate: number
  gstPercent: number
  amount: number
  gst: number
  received: number
  open: number
  notes: string | null
}

export type PoView = {
  id: string
  code: string
  vendorId: string
  vendorName: string
  vendorGstin: string | null
  poDate: string
  expectedDate: string | null
  status: PoStatus
  notes: string | null
  terms: string | null
  orderRefs: Array<{ orderId: string; orderNo: string }>
  createdByName: string | null
  approvedByName: string | null
  approvedAt: string | null
  history: HistoryEntry[]
  createdAt: string
  updatedAt: string
  lines: PoLineView[]
  subtotal: number
  gst: number
  total: number
  grns: Array<{ id: string; code: string; grnDate: string; status: GrnStatus; invoiceNo: string | null }>
}

export type GrnLineView = {
  id: string
  productId: string
  title: string
  code: string | null
  unit: string
  store: 'rm' | 'pm'
  quantity: number
  rate: number | null
  lotNumber: string
  mfgDate: string | null
  expiryDate: string | null
  qcStatus: LineQc
  returnedQty: number
  check: { id: string; code: string; status: string; chemicalStatus: string; microStatus: string } | null
}

export type GrnView = {
  id: string
  code: string
  poId: string
  poCode: string
  vendorId: string
  vendorName: string
  grnDate: string
  invoiceNo: string | null
  invoiceDate: string | null
  status: GrnStatus
  notes: string | null
  receivedByName: string | null
  history: HistoryEntry[]
  createdAt: string
  updatedAt: string
  lines: GrnLineView[]
}

export const PO_STATUS: Record<PoStatus, { label: string; variant: StatusBadgeVariant }> = {
  draft: { label: 'Draft', variant: 'neutral' },
  pending_approval: { label: 'Waiting for approval', variant: 'warning' },
  approved: { label: 'Approved', variant: 'info' },
  partly_received: { label: 'Partly received', variant: 'info' },
  received: { label: 'Received', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'error' },
}

export const GRN_STATUS: Record<GrnStatus, { label: string; variant: StatusBadgeVariant }> = {
  under_test: { label: 'Under QC test', variant: 'warning' },
  partly_approved: { label: 'Partly approved', variant: 'info' },
  approved: { label: 'Approved stock', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'error' },
}

export const LINE_QC: Record<LineQc, { label: string; variant: StatusBadgeVariant }> = {
  pending: { label: 'Under test', variant: 'warning' },
  passed: { label: 'Approved', variant: 'success' },
  failed: { label: 'Rejected', variant: 'error' },
  returned: { label: 'Returned to vendor', variant: 'neutral' },
}

export const HISTORY_LABEL: Record<string, string> = {
  created: 'Created as draft',
  edited: 'Edited',
  submitted: 'Sent for approval',
  approved: 'Approved',
  cancelled: 'Cancelled',
  goods_received: 'Goods received',
  returned: 'Returned to vendor',
  received: 'Goods received',
  qc_passed: 'QC approved a batch',
  qc_failed: 'QC rejected a batch',
  qc_retest: 'Batch sent for re-test',
}

export function money(value: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value)
}

export function qty(value: number, unit?: string | null): string {
  const text = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)
  return unit ? `${text} ${unit}` : text
}

export function day(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function when(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function todayIso(): string {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}
