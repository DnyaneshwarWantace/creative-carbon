"use client"

import * as React from 'react'
import { ArrowRight, Boxes, FlaskConical, Package } from 'lucide-react'
import { cn } from '@open-mercato/shared/lib/utils'
import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import type { StepIndicatorStep } from '@open-mercato/ui/primitives/step-indicator'

export type RequestStatus = 'requested' | 'partly_issued' | 'issued' | 'received' | 'used' | 'cancelled'
export type StoreKey = 'rm' | 'pm'

export type LotView = { lotId: string | null; lotNumber: string | null; onHand: number; free: number; expiresAt: string | null }
export type IssueView = { lotId: string | null; lotNumber: string | null; quantity: number; used: number; returned: number; by: string | null; at: string }
export type LineView = {
  id: string
  productId: string
  title: string
  code: string | null
  unit: string
  required: number
  issued: number
  received: number
  used: number
  returned: number
  withProduction: number
  issues: IssueView[]
  reservedForOrder: number
  lots: LotView[]
  inStore: number
}
export type RequestView = {
  id: string
  code: string
  orderId: string
  orderNo: string
  stageKey: string
  stageLabel: string
  store: StoreKey
  storeLabel: string
  status: RequestStatus
  awaitingReceipt: boolean
  notes: string | null
  requestedByName: string | null
  receivedByName: string | null
  receivedAt: string | null
  usedAt: string | null
  history: Array<{ action: string; by: string | null; at: string; note: string | null }>
  createdAt: string
  updatedAt: string
  lines: LineView[]
}
export type RequestListItem = {
  id: string
  code: string
  orderId: string
  orderNo: string
  stageKey: string
  stageLabel: string
  store: StoreKey
  storeLabel: string
  status: RequestStatus
  awaitingReceipt: boolean
  requestedByName: string | null
  createdAt: string
  lineCount: number
  issuedLines: number
  items: string[]
}

export const STATUS_LABEL: Record<RequestStatus, string> = {
  requested: 'Requested',
  partly_issued: 'Partly issued',
  issued: 'Issued',
  received: 'Received',
  used: 'Used',
  cancelled: 'Cancelled',
}

export const STATUS_VARIANT: Record<RequestStatus, StatusBadgeVariant> = {
  requested: 'warning',
  partly_issued: 'info',
  issued: 'info',
  received: 'success',
  used: 'neutral',
  cancelled: 'error',
}

export const STORE_LOCATION: Record<StoreKey, string> = { rm: 'RM STORE', pm: 'PM STORE' }

export const HISTORY_LABEL: Record<string, string> = {
  requested: 'Asked the store',
  issued: 'Store issued',
  received: 'Production received',
  returned: 'Returned to store',
  used: 'Used in production',
  cancelled: 'Cancelled',
}

export function qty(value: number, unit?: string | null): string {
  const text = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)
  return unit ? `${text} ${unit}` : text
}

export function when(value: string | null | undefined): string {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function ago(value: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function journey(status: RequestStatus, awaitingReceipt: boolean): StepIndicatorStep[] {
  const order: RequestStatus[] = ['requested', 'issued', 'received', 'used']
  const reached =
    status === 'used' ? 3 : status === 'received' ? 2 : status === 'issued' || status === 'partly_issued' ? 1 : 0
  const labels = ['Requested', status === 'partly_issued' ? 'Partly issued' : 'Issued', 'Received', 'Used']
  const descriptions = ['Production asked', 'Store sent it', awaitingReceipt ? 'Waiting for production' : 'Production confirmed', 'Batch made']
  const stepStatus = (index: number): StepIndicatorStep['status'] => {
    if (status === 'cancelled') return index === 0 ? 'complete' : index === 1 ? 'error' : 'pending'
    if (status === 'partly_issued' && index === 1) return 'current'
    if (index <= reached) return 'complete'
    return index === reached + 1 ? 'current' : 'pending'
  }
  return order.map((key, index) => ({ id: key, label: labels[index], description: descriptions[index], status: stepStatus(index) }))
}

export function StageIcon({ stageKey, className }: { stageKey: string; className?: string }) {
  if (stageKey === 'manufacturing') return <FlaskConical className={className} aria-hidden="true" />
  if (stageKey === 'filling') return <Boxes className={className} aria-hidden="true" />
  return <Package className={className} aria-hidden="true" />
}

export function StockRoute({ store, className }: { store: StoreKey; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-mono text-xs', className)}>
      <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5">{STORE_LOCATION[store]}</span>
      <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
      <span className="rounded-sm border border-border bg-muted px-1.5 py-0.5">PRODUCTION</span>
    </span>
  )
}

export function Meter({ value, max, tone = 'accent', className }: { value: number; max: number; tone?: 'accent' | 'success' | 'warning' | 'muted'; className?: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  const fill = { accent: 'bg-accent-indigo', success: 'bg-status-success-icon', warning: 'bg-status-warning-icon', muted: 'bg-muted-foreground' }[tone]
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-input', className)} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all duration-300', fill)} style={{ width: `${percent}%` }} />
    </div>
  )
}
