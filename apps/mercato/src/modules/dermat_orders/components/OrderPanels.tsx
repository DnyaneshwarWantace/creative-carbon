"use client"

import * as React from 'react'
import { AlertTriangle, CheckCircle2, CircleAlert, FileText, Info as InfoIcon } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { daysUntil, formatDate } from './format'
import type { Order } from './types'
import { stageDayLimit } from '../lib/stages'

export type OrderTab = 'work' | 'products' | 'materials' | 'record' | 'documents' | 'money' | 'history'

type Attention = { key: string; tone: 'error' | 'warning' | 'info'; text: string; action?: { label: string; stageKey?: string; tab?: OrderTab } }

function rupees(value: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)}`
}

export function orderAttention(order: Order, shortCount: number | null, t: ReturnType<typeof useT>): Attention[] {
  const items: Attention[] = []
  if (order.status === 'cancelled' || order.status === 'completed') return items
  for (const stage of order.stages.filter((entry) => entry.status === 'on_hold')) {
    const followUp = typeof stage.data?.__follow_up === 'string' ? stage.data.__follow_up : null
    const due = followUp ? daysUntil(followUp) : null
    items.push({
      key: `hold-${stage.key}`,
      tone: 'error',
      text: `${t('dermat_orders.attention.hold', '{stage} on hold{party}: {reason}', { stage: stage.label, party: stage.holdParty ? ` (${stage.holdParty})` : '', reason: stage.holdReason ?? '—' })}${followUp ? ` · ${due !== null && due < 0 ? t('dermat_orders.attention.followLate', 'follow-up was due {date}', { date: formatDate(followUp) }) : t('dermat_orders.attention.follow', 'follow up {date}', { date: formatDate(followUp) })}` : ''}`,
      action: { label: t('dermat_orders.attention.open', 'Open'), stageKey: stage.key },
    })
  }
  const left = daysUntil(order.deliveryDate)
  if (left !== null && left < 0) items.push({ key: 'late', tone: 'error', text: t('dermat_orders.attention.late', 'Delivery date {date} passed {days} days ago', { date: formatDate(order.deliveryDate), days: -left }) })
  else if (left !== null && left <= 7) items.push({ key: 'soon', tone: 'warning', text: t('dermat_orders.attention.soon', 'Delivery due in {days} days ({date})', { days: left, date: formatDate(order.deliveryDate) }) })
  for (const [stageKey, checks] of Object.entries(order.qc ?? {})) {
    const failed = checks.filter((check) => check.status === 'failed')
    if (failed.length) {
      const stage = order.stages.find((entry) => entry.key === stageKey)
      items.push({
        key: `qc-${stageKey}`,
        tone: 'error',
        text: t('dermat_orders.attention.qc', 'QC failed at {stage}: {checks}', { stage: stage?.label ?? stageKey, checks: failed.map((check) => check.arNo ?? check.code).join(', ') }),
        action: { label: t('dermat_orders.attention.open', 'Open'), stageKey },
      })
    }
  }
  for (const stage of order.stages.filter((entry) => entry.status === 'open')) {
    const missing = (order.documents?.[stage.key] ?? []).filter((doc) => doc.needed && !doc.count)
    if (missing.length) {
      items.push({
        key: `docs-${stage.key}`,
        tone: 'warning',
        text: t('dermat_orders.attention.docs', '{stage} needs: {docs}', { stage: stage.label, docs: missing.map((doc) => doc.label).join(', ') }),
        action: { label: t('dermat_orders.attention.upload', 'Upload'), stageKey: stage.key },
      })
    }
  }
  for (const stage of order.stages.filter((entry) => entry.status === 'open' || entry.status === 'on_hold')) {
    const limit = stageDayLimit(stage.key)
    if (limit && stage.days !== null && stage.days > limit) {
      items.push({
        key: `late-${stage.key}`,
        tone: 'warning',
        text: t('dermat_orders.attention.overLimit', '{stage} open {days} days; its limit is {limit}', { stage: stage.label, days: Math.floor(stage.days), limit }),
        action: { label: t('dermat_orders.attention.open', 'Open'), stageKey: stage.key },
      })
    }
  }
  const noBom = order.lines.filter((line) => !line.bom)
  if (noBom.length) items.push({ key: 'bom', tone: 'warning', text: t('dermat_orders.attention.noBom', 'No BOM yet for {count} product(s)', { count: noBom.length }), action: { label: t('dermat_orders.attention.see', 'See'), tab: 'products' } })
  if (shortCount) items.push({ key: 'short', tone: 'warning', text: t('dermat_orders.attention.short', '{count} material(s) short for this order', { count: shortCount }), action: { label: t('dermat_orders.attention.see', 'See'), tab: 'materials' } })
  const advance = order.stages.find((stage) => stage.key === 'advance')
  if (advance?.status === 'open' && order.payments && order.payments.received <= 0) items.push({ key: 'advance', tone: 'info', text: t('dermat_orders.attention.advance', 'Waiting for the advance payment'), action: { label: t('dermat_orders.attention.open', 'Open'), tab: 'money' } })
  const billingOpen = order.stages.filter((stage) => stage.key === 'billing' || stage.key === 'dispatch').some((stage) => stage.status === 'open')
  if (billingOpen && order.payments && order.payments.due > 0.5) items.push({ key: 'due', tone: 'warning', text: t('dermat_orders.attention.due', '{amount} still to receive before dispatch', { amount: rupees(order.payments.due) }), action: { label: t('dermat_orders.attention.see', 'See'), tab: 'money' } })
  return items
}

export function AttentionList({ items, onStage, onTab }: { items: Attention[]; onStage: (key: string) => void; onTab: (tab: OrderTab) => void }) {
  const t = useT()
  if (!items.length) {
    return (
      <p className="flex items-center gap-2 text-sm text-status-success-text">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t('dermat_orders.attention.none', 'Nothing is blocking this order right now.')}
      </p>
    )
  }
  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const Icon = item.tone === 'error' ? AlertTriangle : item.tone === 'warning' ? CircleAlert : InfoIcon
        return (
          <li
            key={item.key}
            className={cn(
              'flex items-start gap-2 rounded-md border p-2 text-sm',
              item.tone === 'error' && 'border-status-error-border bg-status-error-bg text-status-error-text',
              item.tone === 'warning' && 'border-status-warning-border bg-status-warning-bg text-status-warning-text',
              item.tone === 'info' && 'border-status-info-border bg-status-info-bg text-status-info-text',
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1">{item.text}</span>
            {item.action ? (
              <button
                type="button"
                className="shrink-0 text-xs font-semibold underline underline-offset-2"
                onClick={() => (item.action?.stageKey ? onStage(item.action.stageKey) : item.action?.tab ? onTab(item.action.tab) : undefined)}
              >
                {item.action.label}
              </button>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

export function DocumentsOverview({ order, onStage }: { order: Order; onStage: (key: string) => void }) {
  const t = useT()
  const rows = order.stages
    .map((stage) => ({ stage, docs: order.documents?.[stage.key] ?? [] }))
    .filter((row) => row.docs.length)
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.docsTab.stage', 'Stage')}</th>
            <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.docsTab.document', 'Document')}</th>
            <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.docsTab.rule', 'Rule')}</th>
            <th className="px-3 py-2 text-right font-semibold">{t('dermat_orders.docsTab.files', 'Files')}</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.flatMap(({ stage, docs }) =>
            docs.map((doc, index) => {
              const missing = doc.needed && !doc.count && stage.status !== 'waiting' && stage.status !== 'skipped'
              return (
                <tr key={`${stage.key}-${doc.key}`} className={cn(missing && 'bg-status-warning-bg')}>
                  <td className="px-3 py-2 text-muted-foreground">{index === 0 ? stage.label : ''}</td>
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      {doc.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {doc.needed ? t('dermat_orders.docsTab.required', 'Required') : doc.required === 'eway' ? t('dermat_orders.docsTab.ewayBelow', 'Not needed below ₹50,000') : t('dermat_orders.docsTab.optional', 'Optional')}
                  </td>
                  <td className={cn('px-3 py-2 text-right tabular-nums', missing && 'font-semibold text-status-warning-text')}>{doc.count || (missing ? t('dermat_orders.docsTab.missing', 'Missing') : '—')}</td>
                  <td className="px-3 py-2 text-right">
                    {stage.status !== 'waiting' ? (
                      <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => onStage(stage.key)}>
                        {doc.count ? t('dermat_orders.docsTab.view', 'View') : t('dermat_orders.docsTab.upload', 'Upload')}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t('dermat_orders.docsTab.later', 'Stage not started')}</span>
                    )}
                  </td>
                </tr>
              )
            }),
          )}
        </tbody>
      </table>
    </div>
  )
}
