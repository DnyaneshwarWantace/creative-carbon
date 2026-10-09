"use client"

import * as React from 'react'
import { useGranted } from '../../cc_departments/components/useGranted'
import Link from 'next/link'
import {
  AlarmClock,
  ArrowUpRight,
  CalendarClock,
  ClipboardList,
  FlaskConical,
  PauseCircle,
  Plus,
  ShoppingCart,
  Stamp,
  Truck,
  UserRound,
  Workflow,
} from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { PRODUCT_KINDS } from '../../cc_products/lib/kinds'

type WorkItem = {
  orderId: string
  orderNo: string
  customerName: string
  stageKey: string
  stageLabel: string
  department: string
  status: string
  days: number
  stuck: boolean
  holdParty: string | null
  holdReason: string | null
  deliveryDate: string | null
  overdue: boolean
  responsibleName: string | null
  href: string
}
type Overview = {
  today: string
  stuckDays: number
  tiles: { openOrders: number; stuckOrders: number; onHoldOrders: number; dueThisWeek: number; overdue: number }
  pipeline: Array<{ key: string; label: string; department: string; open: number; onHold: number; stuck: number; oldestDays: number }>
  stuck: WorkItem[]
  people: Array<{ name: string; open: number; stuck: number; oldestDays: number }>
  lowStock: Array<{ id: string; title: string; code: string | null; kind: string; unit: string | null; minimum: number; usable: number; underTest: number; onPo: number }>
  lowStockTotal: number
  queues: { poApproval: number; grnUnderTest: number }
  recent: Array<{ id: string; orderNo: string; customerName: string; status: string; orderDate: string; deliveryDate: string | null; current: string[] }>
}

const WORK_PATH: Record<string, string> = {
  advance: 'advance',
  allocation: 'allocation',
  qc: 'qc',
  packing: 'packing',
  invoice: 'invoice',
  dispatch: 'dispatch',
}

const ORDER_VARIANT: Record<string, StatusBadgeVariant> = { booked: 'info', confirmed: 'warning', completed: 'success', cancelled: 'neutral' }

function qty(value: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)
}

function shortDate(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function greeting(): string {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

function Panel({ title, hint, action, children, className }: { title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm', className)}>
      <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {action}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  )
}

export function OverviewPage() {
  const t = useT()
  const granted = useGranted()
  const [data, setData] = React.useState<Overview | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    apiCall<Overview>('/api/cc_dashboard/overview').then((call) => {
      if (!call.ok || !call.result) setError(t('cc_dashboard.loadError', 'Could not load the overview.'))
      else setData(call.result)
    })
  }, [t])

  if (error) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={error} />
        </PageBody>
      </Page>
    )
  }

  const maxStage = Math.max(1, ...(data?.pipeline ?? []).map((row) => row.open + row.onHold))
  const maxPerson = Math.max(1, ...(data?.people ?? []).map((row) => row.open))

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 pb-16">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
              </p>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_dashboard.title', '{greeting}. Here is the factory today.', { greeting: greeting() })}</h1>
              <p className="text-sm text-muted-foreground">
                {t('cc_dashboard.lede', 'Where every order is, what is stuck and with whom. A step is stuck after {days} days.', { days: data?.stuckDays ?? 3 })}
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/backend/my-work">
                <Button type="button" variant="outline">
                  <UserRound className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_dashboard.myWork', 'My pending work')}
                </Button>
              </Link>
              {granted.has('cc_orders.manage') ? (
              <Link href="/backend/orders/new">
                <Button type="button">
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_dashboard.newOrder', 'New order')}
                </Button>
              </Link>
              ) : null}
            </div>
          </header>

          {!data ? (
            <div className="flex justify-center py-24">
              <Spinner />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {[
                  { label: t('cc_dashboard.tile.open', 'Open orders'), value: data.tiles.openOrders, icon: <ClipboardList className="h-4 w-4" />, tone: 'bg-status-info-bg text-status-info-icon', href: '/backend/orders' },
                  { label: t('cc_dashboard.tile.stuck', 'Orders with a stuck step'), value: data.tiles.stuckOrders, icon: <AlarmClock className="h-4 w-4" />, tone: 'bg-status-warning-bg text-status-warning-icon', href: '#stuck' },
                  { label: t('cc_dashboard.tile.hold', 'On hold'), value: data.tiles.onHoldOrders, icon: <PauseCircle className="h-4 w-4" />, tone: 'bg-status-error-bg text-status-error-icon', href: '/backend/orders?status=on_hold' },
                  { label: t('cc_dashboard.tile.due', 'Due in 7 days'), value: data.tiles.dueThisWeek, icon: <CalendarClock className="h-4 w-4" />, tone: 'bg-muted text-muted-foreground', href: '/backend/orders' },
                  { label: t('cc_dashboard.tile.overdue', 'Past delivery date'), value: data.tiles.overdue, icon: <Truck className="h-4 w-4" />, tone: data.tiles.overdue ? 'bg-status-error-bg text-status-error-icon' : 'bg-muted text-muted-foreground', href: '/backend/orders' },
                ].map((tile) => (
                  <Link key={tile.label} href={tile.href} className="group flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-xs transition-shadow hover:shadow-md">
                    <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tile.tone)} aria-hidden="true">
                      {tile.icon}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-2xl font-bold leading-none tabular-nums">{tile.value}</span>
                      <span className="mt-1 block text-xs leading-snug text-muted-foreground">{tile.label}</span>
                    </span>
                  </Link>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
                <Panel
                  className="xl:col-span-3"
                  title={t('cc_dashboard.pipeline', 'Where orders are right now')}
                  hint={t('cc_dashboard.pipelineHint', 'Open steps per stage. Red part is on hold. Click a stage to work on it.')}
                  action={<Workflow className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
                >
                  <ul className="divide-y divide-border">
                    {data.pipeline.map((row) => {
                      const total = row.open + row.onHold
                      return (
                        <li key={row.key}>
                          <Link href={`/backend/work/${WORK_PATH[row.key] ?? row.key}`} className="grid grid-cols-12 items-center gap-3 px-5 py-2.5 transition-colors hover:bg-muted/40">
                            <span className="col-span-4 min-w-0">
                              <span className="block truncate text-sm font-medium">{row.label}</span>
                              <span className="block truncate text-xs text-muted-foreground">{row.department}</span>
                            </span>
                            <span className="col-span-6 flex h-2.5 overflow-hidden rounded-full bg-input" aria-hidden="true">
                              <span className="h-full bg-accent-indigo" style={{ width: `${(row.open / maxStage) * 100}%` }} />
                              <span className="h-full bg-status-error-icon" style={{ width: `${(row.onHold / maxStage) * 100}%` }} />
                            </span>
                            <span className="col-span-2 text-right">
                              <span className={cn('block text-sm font-semibold tabular-nums', !total && 'text-muted-foreground')}>{total}</span>
                              {row.stuck ? (
                                <span className="block text-xs text-status-warning-text">{t('cc_dashboard.oldest', 'oldest {days} d', { days: row.oldestDays })}</span>
                              ) : null}
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                </Panel>

                <Panel className="xl:col-span-2" title={t('cc_dashboard.people', 'Pending by person')} hint={t('cc_dashboard.peopleHint', 'Open steps assigned to each person; stuck in orange')}>
                  {data.people.length ? (
                    <ul className="divide-y divide-border">
                      {data.people.map((person) => (
                        <li key={person.name} className="px-5 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase text-muted-foreground">{person.name.slice(0, 2)}</span>
                              <span className={cn('truncate text-sm font-medium', person.name === 'Not assigned' && 'italic text-muted-foreground')}>{person.name}</span>
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              <span className="font-semibold text-foreground">{person.open}</span> {t('cc_dashboard.steps', 'steps')}
                              {person.stuck ? <span className="text-status-warning-text"> · {person.stuck} stuck</span> : null}
                            </span>
                          </div>
                          <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-input" aria-hidden="true">
                            <span className="h-full bg-status-warning-icon" style={{ width: `${(person.stuck / maxPerson) * 100}%` }} />
                            <span className="h-full bg-accent-indigo" style={{ width: `${((person.open - person.stuck) / maxPerson) * 100}%` }} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-5 py-8 text-sm text-muted-foreground">{t('cc_dashboard.noPeople', 'No open steps.')}</p>
                  )}
                </Panel>
              </div>

              <div id="stuck" className="grid grid-cols-1 gap-6 xl:grid-cols-5">
                <Panel className="xl:col-span-3" title={t('cc_dashboard.stuck', 'Stuck the longest')} hint={t('cc_dashboard.stuckHint', 'On hold, or open for {days}+ days', { days: data.stuckDays })}>
                  {data.stuck.length ? (
                    <ul className="divide-y divide-border">
                      {data.stuck.map((item) => (
                        <li key={`${item.orderId}-${item.stageKey}`}>
                          <Link href={item.href} className="grid grid-cols-12 items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                            <span className="col-span-4 min-w-0">
                              <span className="block font-mono text-sm font-semibold">{item.orderNo}</span>
                              <span className="block truncate text-xs text-muted-foreground">{item.customerName}</span>
                            </span>
                            <span className="col-span-4 min-w-0">
                              <span className="block truncate text-sm">{item.stageLabel}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {item.status === 'on_hold' ? `${t('cc_dashboard.onHoldBy', 'On hold')}: ${item.holdParty ?? '—'}` : (item.responsibleName ?? t('cc_dashboard.unassigned', 'Not assigned'))}
                              </span>
                            </span>
                            <span className="col-span-4 flex items-center justify-end gap-2">
                              {item.overdue ? <StatusBadge variant="error">{t('cc_dashboard.late', 'Late')}</StatusBadge> : null}
                              <span className={cn('rounded-sm px-2 py-0.5 text-xs font-semibold tabular-nums', item.status === 'on_hold' ? 'bg-status-error-bg text-status-error-text' : 'bg-status-warning-bg text-status-warning-text')}>
                                {item.days} {t('cc_dashboard.days', 'days')}
                              </span>
                              <ArrowUpRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-5 py-8 text-sm text-muted-foreground">{t('cc_dashboard.nothingStuck', 'Nothing is stuck. Every open step moved in the last {days} days.', { days: data.stuckDays })}</p>
                  )}
                </Panel>

                <Panel className="xl:col-span-2" title={t('cc_dashboard.queues', 'Waiting on a team')}>
                  <ul className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2">
                    {[
                      { label: t('cc_dashboard.q.po', 'POs to approve'), value: data.queues.poApproval, href: '/backend/purchase/orders', icon: <Stamp className="h-4 w-4" /> },
                      { label: t('cc_dashboard.q.grn', 'GRN batches to check'), value: data.queues.grnUnderTest, href: '/backend/purchase/grns', icon: <FlaskConical className="h-4 w-4" /> },
                      { label: t('cc_dashboard.q.low', 'Materials below minimum'), value: data.lowStockTotal, href: '#materials', icon: <ShoppingCart className="h-4 w-4" /> },
                    ].map((queue) => (
                      <li key={queue.label} className="bg-card">
                        <Link href={queue.href} className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/40">
                          <span className={cn('flex h-8 w-8 items-center justify-center rounded-full', queue.value ? 'bg-status-warning-bg text-status-warning-icon' : 'bg-muted text-muted-foreground')} aria-hidden="true">
                            {queue.icon}
                          </span>
                          <span>
                            <span className="block text-xl font-bold leading-none tabular-nums">{queue.value}</span>
                            <span className="mt-1 block text-xs text-muted-foreground">{queue.label}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>

              <div id="materials" className="grid grid-cols-1 gap-6 xl:grid-cols-5">
                <Panel
                  className="xl:col-span-3"
                  title={t('cc_dashboard.low', 'Materials below minimum')}
                  hint={t('cc_dashboard.lowHint', 'Usable (QC-approved) stock at or below the minimum level set on the material')}
                  action={
                    data.lowStock.length ? (
                      <Link href={`/backend/purchase/orders/new?items=${data.lowStock.map((row) => `${row.id}:${Math.max(0, row.minimum - row.usable - row.onPo)}`).join(',')}`} className="text-xs font-medium text-primary hover:underline">
                        {t('cc_dashboard.raisePo', 'Raise PO')}
                      </Link>
                    ) : null
                  }
                >
                  {data.lowStock.length ? (
                    <ul className="divide-y divide-border">
                      {data.lowStock.map((row) => {
                        const percent = row.minimum > 0 ? Math.min(100, Math.round((row.usable / row.minimum) * 100)) : 0
                        return (
                          <li key={row.id}>
                            <Link href={`/backend/products/${row.id}`} className="grid grid-cols-12 items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                              <span className="col-span-5 min-w-0">
                                <span className="block truncate text-sm font-medium">{row.title}</span>
                                <span className="block font-mono text-xs text-muted-foreground">
                                  {row.code ?? '—'} · {PRODUCT_KINDS.find((entry) => entry.code === row.kind)?.label ?? row.kind}
                                </span>
                              </span>
                              <span className="col-span-4">
                                <span className="flex justify-between text-xs tabular-nums">
                                  <span className={cn(row.usable <= 0 ? 'font-semibold text-status-error-text' : '')}>{qty(row.usable)}</span>
                                  <span className="text-muted-foreground">
                                    {t('cc_dashboard.min', 'min {qty}', { qty: qty(row.minimum) })} {row.unit ?? ''}
                                  </span>
                                </span>
                                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-input" aria-hidden="true">
                                  <span className={cn('block h-full rounded-full', row.usable <= 0 ? 'bg-status-error-icon' : 'bg-status-warning-icon')} style={{ width: `${percent}%` }} />
                                </span>
                              </span>
                              <span className="col-span-3 text-right text-xs text-muted-foreground">
                                {row.onPo > 0 ? <span className="block">{qty(row.onPo)} on PO</span> : <span className="block text-status-error-text">{t('cc_dashboard.noPo', 'no PO yet')}</span>}
                                {row.underTest > 0 ? <span className="block">{qty(row.underTest)} in QC</span> : null}
                              </span>
                            </Link>
                          </li>
                        )
                      })}
                    </ul>
                  ) : (
                    <p className="px-5 py-8 text-sm text-muted-foreground">{t('cc_dashboard.noLow', 'Every material with a minimum level is above it.')}</p>
                  )}
                </Panel>

                <Panel className="xl:col-span-2" title={t('cc_dashboard.recent', 'Latest orders')} action={<Link href="/backend/orders" className="text-xs font-medium text-primary hover:underline">{t('cc_dashboard.allOrders', 'Order book')}</Link>}>
                  <ul className="divide-y divide-border">
                    {data.recent.map((order) => (
                      <li key={order.id}>
                        <Link href={`/backend/orders/${order.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                          <span className="min-w-0">
                            <span className="block font-mono text-sm font-semibold">{order.orderNo}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {order.customerName}
                              {order.current.length ? ` · ${order.current.join(', ')}` : ''}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <StatusBadge variant={ORDER_VARIANT[order.status] ?? 'neutral'}>{order.status}</StatusBadge>
                            <span className="mt-1 block text-xs text-muted-foreground">{t('cc_dashboard.dueShort', 'due {date}', { date: shortDate(order.deliveryDate) })}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Panel>
              </div>
            </>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default OverviewPage
