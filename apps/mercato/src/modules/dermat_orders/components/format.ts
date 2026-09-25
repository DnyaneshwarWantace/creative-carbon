import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'

export function formatQty(value: number, digits = 3): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(value)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function todayIso(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

export function daysUntil(value: string | null): number | null {
  if (!value) return null
  const target = new Date(`${value}T00:00:00`).getTime()
  const today = new Date(`${todayIso()}T00:00:00`).getTime()
  return Math.round((target - today) / 86400000)
}

export const STAGE_VARIANT: Record<string, StatusBadgeVariant> = {
  done: 'success',
  skipped: 'neutral',
  open: 'warning',
  on_hold: 'error',
  waiting: 'neutral',
}

export const ORDER_VARIANT: Record<string, StatusBadgeVariant> = {
  booked: 'info',
  confirmed: 'warning',
  completed: 'success',
  cancelled: 'neutral',
}

const UNREADABLE_RE = /^[A-Za-z0-9+/=]{8,}:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:v\d+$/

export function readable(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && !UNREADABLE_RE.test(trimmed) ? trimmed : null
}

export const PAYMENT_TERMS_LABEL: Record<string, string> = {
  due_on_delivery: 'Due on delivery',
  '15_days': '15 days',
  '30_days': '30 days',
  '45_days': '45 days',
  '60_days': '60 days',
  '90_days': '90 days',
}
