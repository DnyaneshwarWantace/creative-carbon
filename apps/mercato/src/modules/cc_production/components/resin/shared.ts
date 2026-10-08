"use client"

import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'

export type ResinStatus = 'draft' | 'posted' | 'failed'
export type Reading = { tempC: number | null; time: string | null }
export type HistoryEntry = { action: string; by: string | null; at: string; note: string | null }

export type ResinProcess = {
  steps: Record<string, { done: boolean; ph: number | null }>
  startHeating: Reading
  stopHeating: Reading
  reactionStart: Reading
  reactionComplete: Reading
  gelChecked: boolean
  vacuumStart: string | null
  coolingDuration: string | null
}

export type ResinTests = { ph: number | null; gelTimeSec: number | null; viscositySec: number | null; solidPct: number | null }

export type BatchLot = { lotId: string; lotNumber: string | null; place: string; kg: number; grnCode: string | null; grnId: string | null }

export type BatchRow = {
  id: string
  batchNo: string
  batchDate: string
  reactorCode: string
  grade: string
  status: ResinStatus
  failReason: string | null
  totalInputKg: number
  yieldKg: number | null
  yieldPct: number | null
  chemistSigned: boolean
  inchargeSigned: boolean
  updatedAt: string
}

export type BatchView = BatchRow & {
  reactorId: string
  materials: Array<{ productId: string; title: string; kg: number; lotId: string | null; lots: BatchLot[] }>
  process: ResinProcess
  tests: ResinTests
  waterRemovedKg: number | null
  notes: string | null
  chemistSign: string | null
  chemistSignedAt: string | null
  inchargeSign: string | null
  inchargeSignedAt: string | null
  postedAt: string | null
  postedByName: string | null
  reopenUntil: string | null
  canReopen: boolean
  resin: { productId: string | null; title: string | null; lotId: string; lotNumber: string | null; leftKg: number | null } | null
  wentTo: Array<{ id: string; label: string; kg: number }>
  compare: { batches: Array<{ id: string; batchNo: string; batchDate: string; yieldPct: number | null; totalInputKg: number; yieldKg: number | null }>; averagePct: number | null }
  history: HistoryEntry[]
  createdAt: string
}

export type ChemicalOption = { id: string; title: string; unit: string; standard: boolean; letter: string | null; free: number; lots: Array<{ lotId: string; lotNumber: string | null; place: string; free: number; receivedAt: string }> }

export type ResinSetup = { nextBatchNo: string | null; reactors: Array<{ id: string; code: string; capacityKg: number | null }>; grades: string[]; chemicals: ChemicalOption[] }

export const RESIN_STATUS: Record<ResinStatus, { label: string; variant: StatusBadgeVariant }> = {
  draft: { label: 'Not posted', variant: 'warning' },
  posted: { label: 'Posted', variant: 'success' },
  failed: { label: 'Failed', variant: 'error' },
}

export const STEP_LABELS: Array<{ key: string; no: number; label: string }> = [
  { key: 'check_ph_heat', no: 3, label: 'Check pH and heat to 45–50 °C' },
  { key: 'stir_1', no: 4, label: 'Stir for 15 minutes' },
  { key: 'cool_change', no: 5, label: 'Cool to 35 °C and charge Liq. NH3 / caustic' },
  { key: 'stir_2', no: 6, label: 'Stir for 15 minutes' },
]

export const READINGS: Array<{ key: 'startHeating' | 'stopHeating' | 'reactionStart' | 'reactionComplete'; no: number; label: string }> = [
  { key: 'startHeating', no: 7, label: 'Start heating up to' },
  { key: 'stopHeating', no: 8, label: 'Stop heating up to' },
  { key: 'reactionStart', no: 9, label: 'Reaction start at' },
  { key: 'reactionComplete', no: 10, label: 'Reaction complete at' },
]

export const HISTORY_LABEL: Record<string, string> = {
  created: 'Entered',
  edited: 'Edited',
  posted: 'Posted',
  failed: 'Marked failed',
  reopened: 'Reopened',
  signed_chemist: 'Signed by chemist',
  signed_incharge: 'Signed by in-charge',
  issued: 'Issued',
  cancelled: 'Cancelled',
  reviewed: 'Reviewed',
}

export function kg(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 3 }).format(value)
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

export function thisMonth(): string {
  return todayIso().slice(0, 7)
}
