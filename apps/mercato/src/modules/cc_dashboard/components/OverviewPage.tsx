"use client"

import * as React from 'react'
import Link from 'next/link'
import { AlarmClock, CalendarClock, ChevronRight, ClipboardList, FlaskConical, Gauge, PieChart, Plus, ShoppingCart, Stamp, UserRound, Users, Workflow } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { useGranted } from '../../cc_departments/components/useGranted'
import { DashCard, DashHeader, EmptyLine, KpiStrip, MeterBar, MoreLink } from '../../cc_ui/components/DashKit'
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
  dueByDay?: Array<{ date: string; count: number }>
  statusMix?: Array<{ status: string; count: number }>
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
const MIX_CLASS: Record<string, string> = { booked: 'bg-status-info-icon', confirmed: 'bg-status-warning-icon', completed: 'bg-status-success-icon', cancelled: 'bg-muted-foreground' }
const TOP = 6

function qty(value: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)
}

function shortDate(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

function dayLabel(value: string): { weekday: string; day: string } {
  const date = new Date(`${value}T00:00:00Z`)
  return { weekday: date.toLocaleDateString('en-IN', { weekday: 'narrow', timeZone: 'UTC' }), day: String(date.getUTCDate()) }
}

function greeting(): string {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
}

function title(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ') : value
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

  const tiles = data?.tiles
  const onTime = tiles && tiles.openOrders ? Math.round(((tiles.openOrders - tiles.overdue) / tiles.openOrders) * 100) : 100
  const maxPerson = Math.max(1, ...(data?.people ?? []).map((row) => row.open))
  const due = data?.dueByDay ?? []
  const dueMax = Math.max(1, ...due.map((point) => point.count))
  const dueTotal = due.reduce((sum, point) => sum + point.count, 0)
  const mix = data?.statusMix ?? []
  const mixTotal = mix.reduce((sum, row) => sum + row.count, 0)
  const openSteps = (data?.pipeline ?? []).reduce((sum, row) => sum + row.open + row.onHold, 0)

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 pb-16">
          <DashHeader
            overline={new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
            title={t('cc_dashboard.title', '{greeting}. Here is the factory today.', { greeting: greeting() })}
            lede={t('cc_dashboard.lede', 'Where every order is, what is stuck and with whom. A step is stuck after {days} days.', { days: data?.stuckDays ?? 3 })}
            actions={
              <>
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
              </>
            }
          />

          {!data || !tiles ? (
            <div className="flex justify-center py-24">
              <Spinner />
            </div>
          ) : (
            <>
              <KpiStrip
                items={[
                  { label: t('cc_dashboard.tile.open', 'Open orders'), value: tiles.openOrders, hint: t('cc_dashboard.tile.openHint', '{count} open steps', { count: openSteps }), href: '/backend/orders' },
                  { label: t('cc_dashboard.tile.stuck', 'Orders with a stuck step'), value: tiles.stuckOrders, tone: tiles.stuckOrders ? 'warn' : 'good', href: '#stuck' },
                  { label: t('cc_dashboard.tile.hold', 'On hold'), value: tiles.onHoldOrders, tone: tiles.onHoldOrders ? 'bad' : undefined, href: '/backend/orders?status=on_hold' },
                  { label: t('cc_dashboard.tile.due', 'Due in 7 days'), value: tiles.dueThisWeek, href: '/backend/orders' },
                  { label: t('cc_dashboard.tile.overdue', 'Past delivery date'), value: tiles.overdue, tone: tiles.overdue ? 'bad' : 'good', href: '/backend/orders' },
                ]}
              />

              <DashCard
                title={t('cc_dashboard.pipeline', 'Where orders are right now')}
                icon={Workflow}
                count={openSteps}
                action={<span className="text-muted-foreground">{t('cc_dashboard.pipelineHint', 'Click a stage to work on it')}</span>}
              >
                <ol className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                  {data.pipeline.map((row, index) => {
                    const total = row.open + row.onHold
                    return (
                      <li key={row.key} className="relative">
                        <Link
                          href={`/backend/work/${WORK_PATH[row.key] ?? row.key}`}
                          className={cn(
                            'flex h-full flex-col rounded-lg border p-3 transition-colors hover:border-foreground/40',
                            row.onHold ? 'border-status-error-border bg-status-error-bg' : row.stuck ? 'border-status-warning-border bg-status-warning-bg' : 'border-border bg-background',
                          )}
                        >
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted font-mono text-xs font-semibold text-foreground">{index + 1}</span>
                            <span className="truncate">{row.department}</span>
                          </span>
                          <span className="mt-2 text-sm font-semibold leading-tight">{row.label}</span>
                          <span className={cn('cc-figure mt-1 text-3xl', !total && 'text-muted-foreground')}>{total}</span>
                          <span className="mt-1 flex flex-wrap gap-1 text-xs">
                            {row.onHold ? <span className="text-status-error-text">{t('cc_dashboard.onHoldCount', '{count} on hold', { count: row.onHold })}</span> : null}
                            {row.stuck ? <span className="text-status-warning-text">{t('cc_dashboard.oldest', 'oldest {days} d', { days: row.oldestDays })}</span> : null}
                            {!row.onHold && !row.stuck ? <span className="text-muted-foreground">{total ? t('cc_dashboard.moving', 'moving') : t('cc_dashboard.clear', 'clear')}</span> : null}
                          </span>
                        </Link>
                        {index < data.pipeline.length - 1 ? <ChevronRight className="absolute -right-2 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground xl:block" aria-hidden="true" /> : null}
                      </li>
                    )
                  })}
                </ol>
              </DashCard>

              <div className="cc-masonry">
                <DashCard title={t('cc_dashboard.health', 'Delivery promise')} icon={Gauge} tone={tiles.overdue ? 'warn' : 'good'}>
                  <div className="flex items-center gap-4">
                    <div className="cc-ring shrink-0" style={{ ['--pct' as string]: onTime }} aria-label={t('cc_dashboard.onTimePct', '{pct}% on time', { pct: onTime })}>
                      <span>{onTime}%</span>
                    </div>
                    <dl className="grid flex-1 grid-cols-3 gap-2 text-center">
                      <div className="rounded-md bg-muted px-2 py-2">
                        <dt className="text-xs text-muted-foreground">{t('cc_dashboard.onTrack', 'On track')}</dt>
                        <dd className="cc-figure text-xl">{tiles.openOrders - tiles.overdue}</dd>
                      </div>
                      <div className="rounded-md bg-muted px-2 py-2">
                        <dt className="text-xs text-muted-foreground">{t('cc_dashboard.dueSoon', 'Due 7 days')}</dt>
                        <dd className="cc-figure text-xl">{tiles.dueThisWeek}</dd>
                      </div>
                      <div className={cn('rounded-md px-2 py-2', tiles.overdue ? 'bg-status-error-bg' : 'bg-muted')}>
                        <dt className="text-xs text-muted-foreground">{t('cc_dashboard.lateCount', 'Late')}</dt>
                        <dd className={cn('cc-figure text-xl', tiles.overdue && 'text-status-error-text')}>{tiles.overdue}</dd>
                      </div>
                    </dl>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">{t('cc_dashboard.healthHint', 'Share of open orders still inside their delivery date.')}</p>
                </DashCard>

                <DashCard title={t('cc_dashboard.dueCalendar', 'Deliveries in the next 14 days')} icon={CalendarClock} count={dueTotal}>
                  {dueTotal ? (
                    <>
                      <div className="grid text-center text-xs font-semibold tabular-nums" style={{ gridTemplateColumns: `repeat(${due.length}, minmax(0, 1fr))` }}>
                        {due.map((point) => (
                          <span key={point.date} className={cn(!point.count && 'text-transparent')}>
                            {point.count}
                          </span>
                        ))}
                      </div>
                      <div className="cc-spark mt-1">
                        {due.map((point, index) => (
                          <span key={point.date} data-today={index === 0} style={{ height: `${Math.max(3, Math.round((point.count / dueMax) * 100))}%` }} title={`${shortDate(point.date)} · ${point.count}`} />
                        ))}
                      </div>
                      <div className="mt-1 grid text-center text-xs text-muted-foreground" style={{ gridTemplateColumns: `repeat(${due.length}, minmax(0, 1fr))` }}>
                        {due.map((point, index) => {
                          const label = dayLabel(point.date)
                          return (
                            <span key={point.date} className={cn('leading-tight', index === 0 && 'font-semibold text-foreground')}>
                              <span className="block">{label.weekday}</span>
                              <span className="block tabular-nums">{label.day}</span>
                            </span>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <EmptyLine text={t('cc_dashboard.noDue', 'No open order is due in the next two weeks.')} />
                  )}
                </DashCard>

                <div id="stuck">
                  <DashCard title={t('cc_dashboard.stuck', 'Stuck the longest')} icon={AlarmClock} tone={data.stuck.length ? 'warn' : undefined}>
                    {data.stuck.length ? (
                      <ul className="divide-y divide-border">
                        {data.stuck.slice(0, TOP).map((item) => (
                          <li key={`${item.orderId}-${item.stageKey}`}>
                            <Link href={item.href} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50">
                              <span className="min-w-0">
                                <span className="block font-mono text-sm font-semibold">{item.orderNo}</span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {item.customerName} · {item.stageLabel}
                                </span>
                                <span className="block truncate text-xs text-muted-foreground">
                                  {item.status === 'on_hold' ? `${t('cc_dashboard.onHoldBy', 'On hold')}: ${item.holdParty ?? '—'}` : (item.responsibleName ?? t('cc_dashboard.unassigned', 'Not assigned'))}
                                </span>
                              </span>
                              <span className="flex shrink-0 flex-col items-end gap-1">
                                <span className={cn('rounded-sm px-2 py-0.5 text-xs font-semibold tabular-nums', item.status === 'on_hold' ? 'bg-status-error-bg text-status-error-text' : 'bg-status-warning-bg text-status-warning-text')}>
                                  {item.days} {t('cc_dashboard.days', 'days')}
                                </span>
                                {item.overdue ? <StatusBadge variant="error">{t('cc_dashboard.late', 'Late')}</StatusBadge> : null}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyLine text={t('cc_dashboard.nothingStuck', 'Nothing is stuck. Every open step moved in the last {days} days.', { days: data.stuckDays })} />
                    )}
                    {data.stuck.length > TOP ? <MoreLink href="/backend/my-work" label={t('cc_dashboard.allStuck', 'All pending work')} /> : null}
                  </DashCard>
                </div>

                <DashCard title={t('cc_dashboard.queues', 'Waiting on a team')} icon={ClipboardList}>
                  <ul className="grid grid-cols-3 gap-2">
                    {[
                      { label: t('cc_dashboard.q.po', 'POs to approve'), value: data.queues.poApproval, href: '/backend/purchase/orders', icon: Stamp },
                      { label: t('cc_dashboard.q.grn', 'GRN batches to check'), value: data.queues.grnUnderTest, href: '/backend/purchase/grns', icon: FlaskConical },
                      { label: t('cc_dashboard.q.low', 'Materials below minimum'), value: data.lowStockTotal, href: '#materials', icon: ShoppingCart },
                    ].map((queue) => (
                      <li key={queue.label}>
                        <Link href={queue.href} className={cn('flex h-full flex-col items-start gap-2 rounded-lg border p-3 transition-colors hover:border-foreground/40', queue.value ? 'border-status-warning-border' : 'border-border')}>
                          <span className={cn('flex h-7 w-7 items-center justify-center rounded-md', queue.value ? 'bg-status-warning-bg text-status-warning-icon' : 'bg-muted text-muted-foreground')} aria-hidden="true">
                            <queue.icon className="h-4 w-4" />
                          </span>
                          <span className="cc-figure text-2xl">{queue.value}</span>
                          <span className="text-xs leading-tight text-muted-foreground">{queue.label}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </DashCard>

                <DashCard title={t('cc_dashboard.people', 'Pending by person')} icon={Users} count={data.people.length}>
                  {data.people.length ? (
                    <ul className="space-y-3">
                      {data.people.slice(0, TOP).map((person) => (
                        <li key={person.name}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold uppercase text-muted-foreground">{person.name.slice(0, 2)}</span>
                              <span className={cn('truncate text-sm font-medium', person.name === 'Not assigned' && 'italic text-muted-foreground')}>{person.name}</span>
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              <span className="font-semibold text-foreground">{person.open}</span> {t('cc_dashboard.steps', 'steps')}
                              {person.stuck ? <span className="text-status-warning-text"> · {t('cc_dashboard.stuckCount', '{count} stuck', { count: person.stuck })}</span> : null}
                            </span>
                          </div>
                          <div className="mt-1.5">
                            <MeterBar value={person.open} max={maxPerson} tone={person.stuck ? 'warn' : 'accent'} />
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyLine text={t('cc_dashboard.noPeople', 'No open steps.')} />
                  )}
                  {data.people.length > TOP ? <MoreLink href="/backend/my-work" label={t('cc_dashboard.allPeople', 'Everyone’s work')} /> : null}
                </DashCard>

                <div id="materials">
                  <DashCard
                    title={t('cc_dashboard.low', 'Materials below minimum')}
                    icon={ShoppingCart}
                    count={data.lowStockTotal}
                    tone={data.lowStockTotal ? 'warn' : undefined}
                    action={
                      data.lowStock.length ? (
                        <Link href={`/backend/purchase/orders/new?items=${data.lowStock.map((row) => `${row.id}:${Math.max(0, row.minimum - row.usable - row.onPo)}`).join(',')}`} className="font-medium text-primary hover:underline">
                          {t('cc_dashboard.raisePo', 'Raise PO')}
                        </Link>
                      ) : null
                    }
                  >
                    {data.lowStock.length ? (
                      <ul className="space-y-3">
                        {data.lowStock.slice(0, TOP).map((row) => (
                          <li key={row.id}>
                            <Link href={`/backend/products/${row.id}`} className="block rounded-md transition-colors hover:bg-muted/50">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="min-w-0 truncate text-sm font-medium">{row.title}</span>
                                <span className={cn('shrink-0 font-mono text-xs tabular-nums', row.usable <= 0 && 'font-semibold text-status-error-text')}>
                                  {qty(row.usable)} / {qty(row.minimum)} {row.unit ?? ''}
                                </span>
                              </div>
                              <div className="my-1">
                                <MeterBar value={row.usable} max={row.minimum} tone={row.usable <= 0 ? 'bad' : 'warn'} />
                              </div>
                              <p className="truncate text-xs text-muted-foreground">
                                {row.code ?? '—'} · {PRODUCT_KINDS.find((entry) => entry.code === row.kind)?.label ?? row.kind}
                                {' · '}
                                {row.onPo > 0 ? t('cc_dashboard.onPo', '{qty} on PO', { qty: qty(row.onPo) }) : <span className="text-status-error-text">{t('cc_dashboard.noPo', 'no PO yet')}</span>}
                                {row.underTest > 0 ? ` · ${t('cc_dashboard.inQc', '{qty} in QC', { qty: qty(row.underTest) })}` : ''}
                              </p>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <EmptyLine text={t('cc_dashboard.noLow', 'Every material with a minimum level is above it.')} />
                    )}
                    {data.lowStockTotal > TOP ? <MoreLink href="/backend/purchase/reorder" label={t('cc_dashboard.allLow', 'All {count} materials', { count: data.lowStockTotal })} /> : null}
                  </DashCard>
                </div>

                <DashCard title={t('cc_dashboard.mix', 'Orders in the last 30 days')} icon={PieChart} count={mixTotal}>
                  {mixTotal ? (
                    <>
                      <div className="flex h-3 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        {mix.map((row) => (
                          <span key={row.status} className={cn('h-full', MIX_CLASS[row.status] ?? 'bg-muted-foreground')} style={{ width: `${(row.count / mixTotal) * 100}%` }} />
                        ))}
                      </div>
                      <ul className="mt-3 grid grid-cols-2 gap-2">
                        {mix.map((row) => (
                          <li key={row.status} className="flex items-center justify-between gap-2 rounded-md bg-muted px-3 py-2 text-sm">
                            <span className="flex items-center gap-2">
                              <span className={cn('h-2.5 w-2.5 rounded-full', MIX_CLASS[row.status] ?? 'bg-muted-foreground')} aria-hidden="true" />
                              {t(`cc_dashboard.status.${row.status}`, title(row.status))}
                            </span>
                            <span className="font-semibold tabular-nums">{row.count}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <EmptyLine text={t('cc_dashboard.noMix', 'No orders booked in the last 30 days.')} />
                  )}
                </DashCard>

                <DashCard title={t('cc_dashboard.recent', 'Latest orders')} icon={ClipboardList} action={<Link href="/backend/orders" className="font-medium text-primary hover:underline">{t('cc_dashboard.allOrders', 'Order book')}</Link>}>
                  {data.recent.length ? (
                    <ul className="divide-y divide-border">
                      {data.recent.map((order) => (
                        <li key={order.id}>
                          <Link href={`/backend/orders/${order.id}`} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50">
                            <span className="min-w-0">
                              <span className="block font-mono text-sm font-semibold">{order.orderNo}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {order.customerName}
                                {order.current.length ? ` · ${order.current.join(', ')}` : ''}
                              </span>
                            </span>
                            <span className="shrink-0 text-right">
                              <StatusBadge variant={ORDER_VARIANT[order.status] ?? 'neutral'}>{t(`cc_dashboard.status.${order.status}`, title(order.status))}</StatusBadge>
                              <span className="mt-1 block text-xs text-muted-foreground">{t('cc_dashboard.dueShort', 'due {date}', { date: shortDate(order.deliveryDate) })}</span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyLine text={t('cc_dashboard.noOrders', 'No orders yet.')} />
                  )}
                </DashCard>
              </div>
            </>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default OverviewPage
