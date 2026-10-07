"use client"

import * as React from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { HorizontalScroll } from '@open-mercato/ui/primitives/drag-scroll'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { formatDate, formatQty } from './format'

type Column = { key: string; label: string; stage: string }
type Card = {
  orderId: string
  orderNo: string
  customer: string | null
  priority: string
  column: string
  stageKey: string
  onHold: boolean
  holdReason: string | null
  batchNo: string | null
  products: Array<{ title: string; quantity: number }>
  responsibleName: string | null
  days: number | null
  deliveryDate: string | null
  note: string | null
}
type Planned = { orderId: string; orderNo: string; customer: string | null; priority: string; date: string; vessel: string | null; batchNo: string | null; kg: number | null; products: string[]; state: 'planned' | 'in_progress' | 'made' }

const DAY_MS = 86400000
const GROUP_TONE: Record<string, string> = { manufacturing: 'border-t-status-info-border', filling: 'border-t-status-warning-border', packing: 'border-t-status-success-border', qc_qa: 'border-t-border' }

function mondayOf(iso: string): string {
  const date = new Date(`${iso}T00:00:00Z`)
  const day = (date.getUTCDay() + 6) % 7
  return new Date(date.getTime() - day * DAY_MS).toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

export function ProductionBoard() {
  const t = useT()
  const [tab, setTab] = React.useState<'board' | 'schedule'>('board')
  const [data, setData] = React.useState<{ columns: Column[]; cards: Card[]; schedule: Planned[] } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const [week, setWeek] = React.useState(() => mondayOf(today))

  React.useEffect(() => {
    apiCall<{ columns?: Column[]; cards?: Card[]; schedule?: Planned[]; error?: string }>('/api/dermat_orders/production-board').then((call) => {
      if (!call.ok) setError(call.result?.error ?? t('dermat_orders.board.loadError', 'Could not load the production board.'))
      else setData({ columns: call.result?.columns ?? [], cards: call.result?.cards ?? [], schedule: call.result?.schedule ?? [] })
    })
  }, [t])

  const days = Array.from({ length: 7 }, (_, index) => addDays(week, index))
  const weekItems = (data?.schedule ?? []).filter((item) => item.date >= days[0] && item.date <= days[6])
  const vessels = [...new Set(weekItems.map((item) => item.vessel ?? ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)))

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_orders.board.title', 'Production board')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('dermat_orders.board.lede', 'Every batch in production, in the step it is at now: store material, making, QC, filling, packing and QA. The schedule shows what is planned on which vessel.')}</p>
            </div>
            <SegmentedControl value={tab} onValueChange={(value) => setTab(value as 'board' | 'schedule')} aria-label={t('dermat_orders.board.view', 'View')}>
              <SegmentedControlItem value="board">{t('dermat_orders.board.boardTab', 'Board ({count})', { count: data?.cards.length ?? 0 })}</SegmentedControlItem>
              <SegmentedControlItem value="schedule">{t('dermat_orders.board.scheduleTab', 'Schedule')}</SegmentedControlItem>
            </SegmentedControl>
          </header>

          {error ? <ErrorMessage label={error} /> : null}
          {!data && !error ? <LoadingMessage label={t('dermat_orders.board.loading', 'Loading…')} /> : null}

          {data && tab === 'board' ? (
            <HorizontalScroll showButtons showGradients step={280} className="pb-2">
              <div className="flex min-w-max gap-3 py-1">
                {data.columns.map((column) => {
                  const cards = data.cards.filter((card) => card.column === column.key)
                  return (
                    <section key={column.key} className={cn('flex w-60 shrink-0 flex-col rounded-lg border border-t-4 bg-muted/20', GROUP_TONE[column.stage])} aria-labelledby={`col-${column.key}`}>
                      <h2 id={`col-${column.key}`} className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {column.label}
                        <span className="tabular-nums">{cards.length}</span>
                      </h2>
                      <ul className="flex flex-col gap-2 px-2 pb-2">
                        {cards.map((card) => (
                          <li key={`${card.orderId}-${card.stageKey}`}>
                            <Link href={`/backend/orders/${card.orderId}?stage=${card.stageKey}`} className={cn('block rounded-md border bg-card p-2.5 text-sm shadow-xs hover:border-primary', card.onHold && 'border-status-error-border')}>
                              <span className="flex items-center justify-between gap-2">
                                <span className="font-mono text-xs font-semibold">{card.batchNo ? `#${card.batchNo}` : card.orderNo}</span>
                                {card.priority === 'urgent' ? <span className="rounded-sm bg-status-error-bg px-1 text-xs text-status-error-text">{t('dermat_orders.priority.urgent', 'Urgent')}</span> : null}
                              </span>
                              <span className="mt-1 block truncate font-medium">{card.products.map((product) => product.title).join(', ')}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {card.customer ?? ''} · {formatQty(card.products.reduce((sum, product) => sum + product.quantity, 0), 0)} pcs
                              </span>
                              {card.onHold ? <span className="mt-1 block text-xs text-status-error-text">{t('dermat_orders.board.onHold', 'On hold: {reason}', { reason: card.holdReason ?? '' })}</span> : null}
                              {card.note ? <span className="mt-1 block text-xs text-muted-foreground">{card.note}</span> : null}
                              <span className="mt-1 flex justify-between text-xs text-muted-foreground">
                                <span className="truncate">{card.responsibleName ?? t('dermat_orders.board.unassigned', 'Unassigned')}</span>
                                <span className={cn('tabular-nums', (card.days ?? 0) > 3 && 'font-medium text-status-warning-text')}>{card.days !== null ? `${card.days} d` : ''}</span>
                              </span>
                            </Link>
                          </li>
                        ))}
                        {!cards.length ? <li className="px-1 py-3 text-center text-xs text-muted-foreground">{t('dermat_orders.board.empty', 'Nothing here')}</li> : null}
                      </ul>
                    </section>
                  )
                })}
              </div>
            </HorizontalScroll>
          ) : null}

          {data && tab === 'schedule' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="icon" aria-label={t('dermat_orders.board.prevWeek', 'Previous week')} onClick={() => setWeek(addDays(week, -7))}>
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setWeek(mondayOf(today))}>
                  {t('dermat_orders.board.thisWeek', 'This week')}
                </Button>
                <Button type="button" variant="outline" size="icon" aria-label={t('dermat_orders.board.nextWeek', 'Next week')} onClick={() => setWeek(addDays(week, 7))}>
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </Button>
                <span className="text-sm font-medium">
                  {formatDate(days[0])} – {formatDate(days[6])}
                </span>
              </div>
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full min-w-max text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="w-40 px-3 py-2 text-left font-semibold">{t('dermat_orders.board.vessel', 'Vessel')}</th>
                      {days.map((date) => (
                        <th key={date} className={cn('w-36 px-2 py-2 text-left font-semibold', date === today && 'text-primary')}>
                          {new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' })}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {vessels.map((vessel) => (
                      <tr key={vessel || 'none'} className="align-top">
                        <th scope="row" className="px-3 py-2 text-left font-medium">
                          {vessel || <span className="text-muted-foreground">{t('dermat_orders.board.noVessel', 'No vessel set')}</span>}
                        </th>
                        {days.map((date) => (
                          <td key={date} className="px-2 py-2">
                            <div className="flex flex-col gap-1.5">
                              {weekItems
                                .filter((item) => item.date === date && (item.vessel ?? '') === vessel)
                                .map((item) => (
                                  <Link
                                    key={item.orderId}
                                    href={`/backend/orders/${item.orderId}?stage=manufacturing`}
                                    className={cn(
                                      'block rounded-md border px-2 py-1 text-xs hover:border-primary',
                                      item.state === 'made' ? 'bg-status-success-bg text-status-success-text' : item.state === 'in_progress' ? 'bg-status-warning-bg text-status-warning-text' : 'bg-card',
                                    )}
                                  >
                                    <span className="font-mono font-semibold">{item.batchNo ? `#${item.batchNo}` : item.orderNo}</span>
                                    {item.priority === 'urgent' ? ' !' : ''}
                                    <span className="block truncate">{item.products.join(', ')}</span>
                                    {item.kg ? <span className="block tabular-nums">{formatQty(item.kg, 1)} kg</span> : null}
                                  </Link>
                                ))}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                    {!vessels.length ? (
                      <tr>
                        <td colSpan={8} className="px-3 py-10 text-center text-sm text-muted-foreground">
                          {t('dermat_orders.board.noPlan', 'Nothing planned this week. Set "Manufacturing planned on" and the vessel in the Planning stage.')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </PageBody>
    </Page>
  )
}

export default ProductionBoard
