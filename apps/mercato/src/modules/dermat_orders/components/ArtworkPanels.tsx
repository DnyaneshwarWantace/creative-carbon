"use client"

import * as React from 'react'
import { ListSelectItems } from '../../dermat_lists/components/ListSelectItems'
import Link from 'next/link'
import { RefreshCcw, ShoppingCart } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { formatDateTime, formatQty } from './format'
import type { Order, Stage } from './types'

type PmEntry = { status?: string; note?: string | null; at?: string; by?: string | null }
type Round = { round: number; feedback: string; at: string; by: string | null }

const TONE: Record<string, string> = {
  'PM OK': 'bg-status-success-bg text-status-success-text',
  'Half PM OK': 'bg-status-info-bg text-status-info-text',
  Hold: 'bg-status-error-bg text-status-error-text',
  'Need to Order PM': 'bg-status-error-bg text-status-error-text',
  'Client Side': 'bg-status-warning-bg text-status-warning-text',
}

export function PackItemsPanel({ order, stage, editable, busy, onStatus }: { order: Order; stage: Stage; editable: boolean; busy: boolean; onStatus: (productId: string, status: string) => void }) {
  const t = useT()
  const statuses = ((stage.data as Record<string, unknown>)?.__pm as Record<string, PmEntry> | undefined) ?? {}
  const ready = order.packItems.filter((item) => ['PM OK', 'Half PM OK'].includes(statuses[item.productId]?.status ?? '')).length
  const toOrder = order.packItems.filter((item) => statuses[item.productId]?.status === 'Need to Order PM')
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs text-muted-foreground">{t('dermat_orders.artwork.items', 'Packing material, item by item')}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">{t('dermat_orders.artwork.ready', '{ready} of {total} ready', { ready, total: order.packItems.length })}</span>
      </div>
      <ul className="divide-y rounded-md border text-sm">
        {order.packItems.map((item) => {
          const entry = statuses[item.productId]
          return (
            <li key={item.productId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0">
                <Link href={`/backend/products/${item.productId}`} className="block truncate font-medium hover:underline">
                  {item.title}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {formatQty(item.quantity, 0)} {item.unit}
                  {entry?.by ? ` · ${entry.by}, ${formatDateTime(entry.at ?? '')}` : ''}
                </span>
              </span>
              {editable ? (
                <Select value={entry?.status ?? ''} onValueChange={(value) => onStatus(item.productId, value)} disabled={busy}>
                  <SelectTrigger className={cn('h-8 w-44 text-xs', entry?.status ? TONE[entry.status] : '')} aria-label={item.title}>
                    <SelectValue placeholder={t('dermat_orders.artwork.pick', 'Set status')} />
                  </SelectTrigger>
                  <SelectContent>
                    <ListSelectItems listKey="designer_statuses" current={entry?.status ?? null} />
                  </SelectContent>
                </Select>
              ) : (
                <span className={cn('rounded-sm px-2 py-0.5 text-xs font-medium', entry?.status ? TONE[entry.status] ?? 'bg-muted text-muted-foreground' : 'bg-muted text-muted-foreground')}>
                  {entry?.status ?? t('dermat_orders.artwork.none', 'No status')}
                </span>
              )}
            </li>
          )
        })}
      </ul>
      {toOrder.length ? (
        <Link
          href={`/backend/purchase/orders/new?items=${toOrder.map((item) => `${item.productId}:${item.quantity}`).join(',')}&orders=${order.id}:${encodeURIComponent(order.orderNo)}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <ShoppingCart className="h-3.5 w-3.5" aria-hidden="true" />
          {t('dermat_orders.artwork.raisePo', 'Raise PO for {count} items to order', { count: toOrder.length })}
        </Link>
      ) : null}
      <p className="text-xs text-muted-foreground">{t('dermat_orders.artwork.rule', 'Artwork & packaging can be finished when every item is PM OK or Half PM OK.')}</p>
    </div>
  )
}

export function SampleRoundsPanel({ stage, editable, busy, onNewRound }: { stage: Stage; editable: boolean; busy: boolean; onNewRound: (note: string) => void }) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const [note, setNote] = React.useState('')
  const rounds = (((stage.data as Record<string, unknown>)?.__rounds as Round[] | undefined) ?? []).slice().reverse()
  const current = rounds.length + 1
  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{t('dermat_orders.sample.round', 'Sample round {round}', { round: current })}</p>
        {editable && !open ? (
          <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)} disabled={busy}>
            <RefreshCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t('dermat_orders.sample.changes', 'Client asked for changes')}
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-2">
          <Label htmlFor="round-note" className="text-xs text-muted-foreground">
            {t('dermat_orders.sample.what', 'What should change? (fragrance, texture, colour…)')}
          </Label>
          <Textarea id="round-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy || !note.trim()}
              onClick={() => {
                onNewRound(note.trim())
                setNote('')
                setOpen(false)
              }}
            >
              {t('dermat_orders.sample.start', 'Start round {round}', { round: current + 1 })}
            </Button>
          </div>
        </div>
      ) : null}
      {rounds.length ? (
        <ol className="space-y-1.5 border-l pl-3 text-xs">
          {rounds.map((round) => (
            <li key={round.round}>
              <span className="font-medium">{t('dermat_orders.sample.roundBack', 'Round {round} sent back', { round: round.round })}</span>
              <span className="text-muted-foreground">
                {' '}
                · {round.by ?? '—'}, {formatDateTime(round.at)}
              </span>
              <p className="text-muted-foreground">{round.feedback}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs text-muted-foreground">{t('dermat_orders.sample.first', 'First sample. If the client wants changes, start another round; the order waits here until they approve.')}</p>
      )}
    </div>
  )
}
