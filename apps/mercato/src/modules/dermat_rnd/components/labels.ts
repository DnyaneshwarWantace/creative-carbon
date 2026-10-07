import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import type { RequestStatus, StabilityStatus, TrialStatus } from './types'

type Label = { key: string; fallback: string; variant: StatusBadgeVariant }

export const REQUEST_STATUS: Record<RequestStatus, Label> = {
  requested: { key: 'dermat_rnd.status.requested', fallback: 'New request', variant: 'warning' },
  in_progress: { key: 'dermat_rnd.status.inProgress', fallback: 'R&D working', variant: 'info' },
  sample_sent: { key: 'dermat_rnd.status.sampleSent', fallback: 'Sample with client', variant: 'info' },
  changes: { key: 'dermat_rnd.status.changes', fallback: 'Client wants changes', variant: 'warning' },
  approved: { key: 'dermat_rnd.status.approved', fallback: 'Approved', variant: 'success' },
  dropped: { key: 'dermat_rnd.status.dropped', fallback: 'Dropped', variant: 'neutral' },
}

export const TRIAL_STATUS: Record<TrialStatus, Label> = {
  draft: { key: 'dermat_rnd.trialStatus.draft', fallback: 'Draft', variant: 'neutral' },
  testing: { key: 'dermat_rnd.trialStatus.testing', fallback: 'In testing', variant: 'info' },
  passed: { key: 'dermat_rnd.trialStatus.passed', fallback: 'Passed', variant: 'success' },
  failed: { key: 'dermat_rnd.trialStatus.failed', fallback: 'Failed', variant: 'error' },
  approved: { key: 'dermat_rnd.trialStatus.approved', fallback: 'Approved formula', variant: 'success' },
  rejected: { key: 'dermat_rnd.trialStatus.rejected', fallback: 'Rejected', variant: 'neutral' },
}

export const STABILITY_STATUS: Record<StabilityStatus, Label> = {
  not_started: { key: 'dermat_rnd.stability.notStarted', fallback: 'Not started', variant: 'neutral' },
  running: { key: 'dermat_rnd.stability.running', fallback: 'Running', variant: 'info' },
  passed: { key: 'dermat_rnd.stability.passed', fallback: 'Stable', variant: 'success' },
  failed: { key: 'dermat_rnd.stability.failed', fallback: 'Unstable', variant: 'error' },
}

export const HISTORY_ACTION: Record<string, string> = {
  requested: 'Request raised',
  edited: 'Request edited',
  start: 'R&D started',
  sample_sent: 'Sample sent',
  feedback_approved: 'Client approved',
  feedback_changes: 'Client asked for changes',
  drop: 'Dropped',
  reopen: 'Reopened',
  trial_created: 'Trial made',
  formula_approved: 'Formula approved',
  bom_made: 'BOM made',
  created: 'Trial made',
  submit: 'Sent for testing',
  record_result: 'Lab result recorded',
  start_stability: 'Stability started',
  record_reading: 'Stability reading',
  finish_stability: 'Stability finished',
  approve: 'Approved',
  reject: 'Rejected',
  replaced: 'Replaced by another trial',
}

export function dayText(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function dateTimeText(value: string): string {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function todayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export function numberText(value: number | null | undefined, digits = 3): string {
  if (value == null) return '—'
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(value)
}

export function daysBetween(fromDay: string, toDay: string): number {
  const from = new Date(`${fromDay}T00:00:00Z`).getTime()
  const to = new Date(`${toDay}T00:00:00Z`).getTime()
  return Math.round((to - from) / 86_400_000)
}

export function addDays(day: string, count: number): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + count)
  return date.toISOString().slice(0, 10)
}
