"use client"

import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'

export type PlanningLine = { id: string; productId: string; title: string; code: string | null; quantity: number; bomApproved: boolean }
export type PlanningOrder = {
  id: string
  orderNo: string
  orderDate: string
  deliveryDate: string | null
  customerName: string
  planningStatus: string
  planningHold: string | null
  current: string[]
  reservedMaterials: number
  lines: PlanningLine[]
}
export type CalcSource = { key: string; orderId: string | null; orderNo: string | null; label: string; required: number; reserved: number; since: string | null }
export type CalcRow = {
  productId: string
  title: string
  code: string | null
  kind: string | null
  unit: string | null
  required: number
  inStore: number
  reservedHere: number
  reservedOther: number
  free: number
  short: number
  status: 'reserved' | 'available' | 'partial' | 'short'
  sources: CalcSource[]
  holders: Array<{ orderId: string; orderNo: string; quantity: number; since: string }>
}
export type PlanItem = { key: string; orderId: string | null; lineId: string | null; productId: string; quantity: number }
export type SavedPlan = { id: string; code: string; name: string; notes: string | null; items: PlanItem[]; createdByName: string | null; updatedAt: string }

export const ROW_STATUS: Record<CalcRow['status'], { label: string; variant: StatusBadgeVariant }> = {
  reserved: { label: 'Reserved', variant: 'success' },
  available: { label: 'Can reserve', variant: 'info' },
  partial: { label: 'Partly reserved', variant: 'warning' },
  short: { label: 'Short', variant: 'error' },
}

export const PLANNING_STATUS: Record<string, { label: string; variant: StatusBadgeVariant }> = {
  waiting: { label: 'Not in planning yet', variant: 'neutral' },
  open: { label: 'In planning', variant: 'warning' },
  on_hold: { label: 'Parked in planning', variant: 'error' },
  done: { label: 'Planned', variant: 'success' },
  skipped: { label: 'Skipped', variant: 'neutral' },
}

export function qty(value: number, unit?: string | null): string {
  const text = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)
  return unit ? `${text} ${unit}` : text
}

export function shortDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export function age(value: string | null | undefined): string {
  if (!value) return '—'
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000)
  if (days < 1) return 'today'
  if (days < 31) return `${days} day${days === 1 ? '' : 's'}`
  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? '' : 's'}`
}

export function ageDays(value: string | null | undefined): number {
  if (!value) return 0
  return Math.floor((Date.now() - new Date(value).getTime()) / 86400000)
}

export function daysUntil(value: string | null | undefined): number | null {
  if (!value) return null
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Math.ceil((date.getTime() - Date.now()) / 86400000)
}
