"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Factory, FlaskConical, Layers, PackageX, PhoneCall, RefreshCcw, ShoppingCart, Sparkles, TrendingUp } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { day, kg, todayIso, when } from '../resin/shared'
import { OfflineBadge, usePlantPwa } from '../offline'
import { CorrectionsPanel } from '../../../cc_ui/components/CorrectionsPanel'
import { DashHeader, KpiStrip, type KpiItem } from '../../../cc_ui/components/DashKit'

type PlanRow = { area: string; resource: string; item: string | null; plannedQty: number; unit: string; actual: number; pct: number | null }
type Overview = {
  date: string
  produced: {
    press: { batches: number; kg: number; sheets: number; byThickness: Array<{ thicknessMm: number; sheets: number; kg: number }> }
    moulding: { pieces: number; kg: number; machines: number }
    resin: { batches: number; kg: number; yieldPct: number | null }
    coating: { sheets: number; kg: number }
  }
  plan: { exists: boolean; rows: PlanRow[]; notes: string | null }
  shortfall: Array<{ productId: string; title: string; unit: string; ordered: number; inStock: number; short: number; orders: number }>
  breakdowns: {
    failedBatches: Array<{ id: string; batchNo: string; batchDate: string; reason: string | null; inputKg: number }>
    idleMachines: Array<{ number: number; usage: string; isWorking: boolean }>
    damaged: Array<{ id: string; entryDate: string; itemTitle: string; kg: number; reason: string }>
    bstageAtRisk: Array<{ lotId: string; lotNumber: string; clothTitle: string | null; kg: number; ageDays: number; band: string }>
    clashes: Array<{ id: string; screen: string; recordRef: string; detail: string | null; byName: string | null; at: string }>
    belowReorder?: Array<{ productId: string; title: string; unit: string; onHand: number; reorderPoint: number; onOrder: number }>
  }
  followUps?: Array<{ id: string; enquiryNo: string; partyName: string | null; subject: string; stage: string; ownerName: string | null; nextActionOn: string | null; nextActionNote: string | null }>
  pressFloor?: Array<{ number: number; usage: 'laminate' | 'moulding' | 'both'; pressType: string; isWorking: boolean; busy: boolean }>
  trend?: Array<{ date: string; pressKg: number; mouldedPieces: number; resinKg: number; coatedKg: number }>
}

const AREA_LABEL: Record<string, string> = { resin: 'Resin', coating: 'Coating', press: 'Press', moulding: 'Moulding' }
const TOP = 5

function shiftDate(iso: string, days: number): string {
  const value = new Date(`${iso}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function weekday(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' })
}

function Tile({ title, icon: Icon, count, tone, action, children }: { title: string; icon: typeof Factory; count?: React.ReactNode; tone?: 'warn' | 'bad' | 'good'; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={cn('rounded-xl border bg-card shadow-xs', tone === 'bad' ? 'border-status-error-border' : tone === 'warn' ? 'border-status-warning-border' : 'border-border')}>
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-md', tone === 'bad' ? 'bg-status-error-bg text-status-error-icon' : tone === 'warn' ? 'bg-status-warning-bg text-status-warning-icon' : 'bg-muted text-muted-foreground')}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-muted-foreground">{count}</span> : null}
        {action ? <span className="ml-auto text-xs">{action}</span> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Bar({ value, max, tone }: { value: number; max: number; tone?: 'good' | 'warn' | 'bad' | 'accent' }) {
  const width = max > 0 ? Math.max(2, Math.min(100, Math.round((value / max) * 100))) : 0
  return (
    <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
      <div className={cn('h-full rounded-full', tone === 'good' ? 'bg-status-success-icon' : tone === 'warn' ? 'bg-status-warning-icon' : tone === 'bad' ? 'bg-status-error-icon' : 'cc-bar-accent')} style={{ width: `${width}%` }} />
    </div>
  )
}

function More({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary underline-offset-2 hover:underline">
      {label}
      <ArrowRight className="h-3 w-3" aria-hidden="true" />
    </Link>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="py-2 text-sm text-muted-foreground">{text}</p>
}

export function PlantTodayPage() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const granted = useGranted()
  usePlantPwa()
  const [date, setDate] = React.useState(params?.get('date') ?? todayIso())
  const [data, setData] = React.useState<Overview | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setData(null)
    router.replace(`/backend/owner?date=${date}`)
    void apiCall<Overview>(`/api/cc_production/owner?date=${date}`).then((call) => {
      if (cancelled) return
      if (!call.ok || !call.result) setError(t('cc_production.owner.loadError', 'Could not load the overview.'))
      else setData(call.result)
    })
    return () => {
      cancelled = true
    }
  }, [date, router, t])

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>

  const isToday = date === todayIso()
  const planned = data?.plan.rows ?? []
  const withPct = planned.filter((row) => row.pct !== null)
  const planPct = withPct.length ? Math.round(withPct.reduce((sum, row) => sum + Math.min(150, row.pct ?? 0), 0) / withPct.length) : null
  const floor = data?.pressFloor ?? []
  const busy = floor.filter((press) => press.busy).length
  const down = floor.filter((press) => !press.isWorking).length
  const trend = data?.trend ?? []
  const trendMaxKg = Math.max(1, ...trend.map((point) => point.pressKg))
  const trendMaxPcs = Math.max(1, ...trend.map((point) => point.mouldedPieces))
  const thicknessMax = Math.max(1, ...(data?.produced.press.byThickness ?? []).map((line) => line.kg))
  const bstage = data?.breakdowns.bstageAtRisk ?? []
  const bands = { blocked: bstage.filter((lot) => lot.band === 'blocked').length, expired: bstage.filter((lot) => lot.band === 'expired').length }
  const damaged = data?.breakdowns.damaged ?? []
  const damagedKg = damaged.reduce((sum, row) => sum + row.kg, 0)

  const kpis: KpiItem[] = data
    ? [
        { label: t('cc_production.dash.pressed', 'Pressed'), value: `${kg(data.produced.press.kg)} kg`, hint: t('cc_production.dash.pressedHint', '{sheets} sheets · {batches} batches', { sheets: data.produced.press.sheets, batches: data.produced.press.batches }), href: '/backend/press/batches' },
        { label: t('cc_production.dash.moulded', 'Moulded'), value: `${data.produced.moulding.pieces} pcs`, hint: t('cc_production.dash.mouldedHint', '{kg} kg on {machines} machines', { kg: kg(data.produced.moulding.kg), machines: data.produced.moulding.machines }), href: '/backend/moulding' },
        { label: t('cc_production.dash.resin', 'Resin made'), value: `${kg(data.produced.resin.kg)} kg`, hint: data.produced.resin.yieldPct !== null ? t('cc_production.dash.yield', 'yield {pct}%', { pct: data.produced.resin.yieldPct }) : t('cc_production.dash.batches', '{n} batches', { n: data.produced.resin.batches }), href: '/backend/resin/batches' },
        { label: t('cc_production.dash.coated', 'B-stage coated'), value: `${kg(data.produced.coating.kg)} kg`, hint: t('cc_production.dash.sheets', '{n} dryer sheets', { n: data.produced.coating.sheets }), href: '/backend/coating' },
        { label: t('cc_production.dash.plan', 'Against the plan'), value: planPct === null ? '—' : `${planPct}%`, hint: data.plan.exists ? t('cc_production.dash.planLines', '{n} plan lines', { n: planned.length }) : t('cc_production.dash.noPlan', 'no plan written'), tone: planPct === null ? undefined : planPct >= 95 ? 'good' : planPct >= 70 ? 'warn' : 'bad', href: `/backend/owner/plan/${date}` },
      ]
    : []

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-4 pb-12">
          <DashHeader
            overline={new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' })}
            title={isToday ? t('cc_production.owner.title', 'Plant today') : t('cc_production.dash.titleDay', 'Plant on {date}', { date: day(date) })}
            lede={t('cc_production.dash.lede', 'What the plant made, how it went against the plan, which presses ran, and what needs attention.')}
            actions={
              <>
                <OfflineBadge />
                <div className="flex items-center rounded-md border border-border bg-background">
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setDate(shiftDate(date, -1))} aria-label={t('cc_production.dash.prev', 'Previous day')}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Input type="date" className="h-9 w-40 border-0 shadow-none" value={date} onChange={(event) => setDate(event.target.value)} aria-label={t('cc_production.resin.date', 'Date')} />
                  <Button type="button" variant="ghost" size="icon" className="h-9 w-9" onClick={() => setDate(shiftDate(date, 1))} aria-label={t('cc_production.dash.next', 'Next day')}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                {!isToday ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setDate(todayIso())}>
                    <CalendarDays className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.dash.today', 'Today')}
                  </Button>
                ) : null}
                {granted.has('cc_production.plan.manage') ? (
                  <Button asChild size="sm">
                    <Link href={`/backend/owner/plan?date=${shiftDate(date, 1)}`}>
                      <ClipboardList className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('cc_production.dash.planTomorrow', 'Plan tomorrow')}
                    </Link>
                  </Button>
                ) : null}
              </>
            }
          />
          {!data ? (
            <div className="flex justify-center py-24">
              <Spinner />
            </div>
          ) : (
            <>
              <KpiStrip items={kpis} />
              <div className="cc-masonry">
                <Tile
                  title={t('cc_production.dash.planVsMade', 'Plan vs made')}
                  icon={ClipboardList}
                  count={planned.length || undefined}
                  action={data.plan.exists ? <Link className="text-primary hover:underline" href={`/backend/owner/plan/${date}`}>{t('cc_production.dash.openPlan', 'Open the plan')}</Link> : null}
                >
                  {planned.length ? (
                    <div className="flex gap-4">
                      <div className="cc-ring shrink-0" style={{ ['--pct' as string]: Math.min(100, planPct ?? 0) }} aria-label={t('cc_production.dash.achieved', '{pct}% achieved', { pct: planPct ?? 0 })}>
                        <span>{planPct ?? 0}%</span>
                      </div>
                      <ul className="min-w-0 flex-1 space-y-2.5">
                        {planned.map((row, index) => (
                          <li key={index}>
                            <div className="flex items-baseline justify-between gap-2 text-sm">
                              <span className="min-w-0 truncate">
                                <span className="font-medium">{AREA_LABEL[row.area] ?? row.area}</span>
                                {row.resource ? <span className="text-muted-foreground"> · {row.resource}</span> : null}
                                {row.item ? <span className="text-muted-foreground"> · {row.item}</span> : null}
                              </span>
                              <span className="shrink-0 font-mono text-xs tabular-nums">
                                {kg(row.actual)} / {kg(row.plannedQty)} {row.unit}
                              </span>
                            </div>
                            <Bar value={row.actual} max={row.plannedQty} tone={(row.pct ?? 0) >= 95 ? 'good' : (row.pct ?? 0) >= 70 ? 'warn' : 'bad'} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <Empty text={t('cc_production.owner.noPlan', 'No plan was written for this day.')} />
                      {granted.has('cc_production.plan.manage') ? (
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/backend/owner/plan?date=${date}`}>{t('cc_production.owner.writePlan', 'Write or change the plan')}</Link>
                        </Button>
                      ) : null}
                    </div>
                  )}
                </Tile>

                <Tile title={t('cc_production.dash.pressFloor', 'Press floor')} icon={Factory} count={`${busy}/${floor.length}`} action={<Link className="text-primary hover:underline" href="/backend/production">{t('cc_production.floor.title', 'Production floor')}</Link>}>
                  {floor.length ? (
                    <>
                      <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-10">
                        {floor.map((press) => (
                          <span
                            key={press.number}
                            className="cc-press"
                            data-state={!press.isWorking ? 'down' : press.busy ? 'busy' : 'idle'}
                            title={`${t('cc_production.dash.press', 'Press')} ${press.number} · ${press.usage} · ${!press.isWorking ? t('cc_production.dash.down', 'down') : press.busy ? t('cc_production.dash.ran', 'ran today') : t('cc_production.dash.idle', 'idle')}`}
                          >
                            {press.number}
                          </span>
                        ))}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5"><span className="cc-press h-3 w-3" data-state="busy" />{t('cc_production.dash.ranCount', 'Ran: {n}', { n: busy })}</span>
                        <span className="inline-flex items-center gap-1.5"><span className="cc-press h-3 w-3" data-state="idle" />{t('cc_production.dash.idleCount', 'Idle: {n}', { n: floor.length - busy - down })}</span>
                        <span className="inline-flex items-center gap-1.5"><span className="cc-press h-3 w-3" data-state="down" />{t('cc_production.dash.downCount', 'Down: {n}', { n: down })}</span>
                      </div>
                    </>
                  ) : (
                    <Empty text={t('cc_production.dash.noPresses', 'No presses in the plant masters yet.')} />
                  )}
                </Tile>

                <Tile title={t('cc_production.dash.week', 'Last 7 days')} icon={TrendingUp}>
                  <div className="space-y-4">
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">{t('cc_production.dash.weekPress', 'Pressed (kg)')}</p>
                      <div className="cc-spark">
                        {trend.map((point) => (
                          <span key={point.date} data-today={point.date === date} style={{ height: `${Math.max(3, Math.round((point.pressKg / trendMaxKg) * 100))}%` }} title={`${day(point.date)} · ${kg(point.pressKg)} kg`} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-xs text-muted-foreground">{t('cc_production.dash.weekMoulded', 'Moulded (pieces)')}</p>
                      <div className="cc-spark">
                        {trend.map((point) => (
                          <span key={point.date} data-today={point.date === date} style={{ height: `${Math.max(3, Math.round((point.mouldedPieces / trendMaxPcs) * 100))}%` }} title={`${day(point.date)} · ${point.mouldedPieces} pcs`} />
                        ))}
                      </div>
                    </div>
                    <div className="grid text-center text-xs text-muted-foreground" style={{ gridTemplateColumns: `repeat(${trend.length || 1}, minmax(0, 1fr))` }}>
                      {trend.map((point) => (
                        <span key={point.date} className={cn(point.date === date && 'font-semibold text-foreground')}>
                          {weekday(point.date)}
                        </span>
                      ))}
                    </div>
                  </div>
                </Tile>

                {data.produced.press.byThickness.length ? (
                  <Tile title={t('cc_production.dash.byThickness', 'Pressed by thickness')} icon={Layers}>
                    <ul className="space-y-2">
                      {data.produced.press.byThickness.map((line) => (
                        <li key={line.thicknessMm}>
                          <div className="flex justify-between text-sm">
                            <span className="font-medium">{line.thicknessMm} mm</span>
                            <span className="font-mono text-xs tabular-nums text-muted-foreground">
                              {line.sheets} {t('cc_production.dash.sheetsShort', 'sheets')} · {kg(line.kg)} kg
                            </span>
                          </div>
                          <Bar value={line.kg} max={thicknessMax} tone="accent" />
                        </li>
                      ))}
                    </ul>
                  </Tile>
                ) : null}

                <Tile title={t('cc_production.dash.short', 'Orders short of finished stock')} icon={ShoppingCart} count={data.shortfall.length} tone={data.shortfall.length ? 'warn' : 'good'}>
                  {data.shortfall.length ? (
                    <>
                      <ul className="space-y-2.5">
                        {data.shortfall.slice(0, TOP).map((row) => (
                          <li key={row.productId}>
                            <div className="flex items-baseline justify-between gap-2 text-sm">
                              <span className="min-w-0 truncate font-medium">{row.title}</span>
                              <span className="shrink-0 text-xs tabular-nums text-status-error-text">
                                {t('cc_production.dash.shortBy', 'short {qty} {unit}', { qty: kg(row.short), unit: row.unit })}
                              </span>
                            </div>
                            <Bar value={row.inStock} max={row.ordered} tone="warn" />
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              {t('cc_production.dash.shortHint', '{stock} in stock of {ordered} {unit} ordered · {orders} orders', { stock: kg(row.inStock), ordered: kg(row.ordered), unit: row.unit, orders: row.orders })}
                            </p>
                          </li>
                        ))}
                      </ul>
                      {data.shortfall.length > TOP ? <More href="/backend/orders" label={t('cc_production.dash.moreN', '{n} more', { n: data.shortfall.length - TOP })} /> : null}
                    </>
                  ) : (
                    <Empty text={t('cc_production.dash.noShort', 'Finished stock covers every open order.')} />
                  )}
                </Tile>

                <Tile title={t('cc_production.dash.bstage', 'B-stage at risk')} icon={Sparkles} count={bstage.length} tone={bands.blocked ? 'bad' : bstage.length ? 'warn' : 'good'}>
                  {bstage.length ? (
                    <>
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {bands.blocked ? <StatusBadge variant="error">{t('cc_production.dash.blocked', '{n} blocked', { n: bands.blocked })}</StatusBadge> : null}
                        {bands.expired ? <StatusBadge variant="warning">{t('cc_production.dash.expired', '{n} past 7 days', { n: bands.expired })}</StatusBadge> : null}
                        <StatusBadge variant="neutral">{t('cc_production.dash.kgAtRisk', '{kg} kg', { kg: kg(bstage.reduce((sum, lot) => sum + lot.kg, 0)) })}</StatusBadge>
                      </div>
                      <ul className="divide-y divide-border text-sm">
                        {bstage.slice(0, TOP).map((lot) => (
                          <li key={lot.lotId} className="flex items-center justify-between gap-2 py-1.5">
                            <Link className="min-w-0 truncate font-mono text-xs hover:underline" href={`/backend/bstage/lots/${lot.lotId}`}>
                              {lot.lotNumber}
                            </Link>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              {kg(lot.kg)} kg · {t('cc_production.dash.dayN', 'day {n}', { n: lot.ageDays })}
                            </span>
                          </li>
                        ))}
                      </ul>
                      <More href="/backend/bstage" label={t('cc_production.dash.bstageBoard', 'B-stage board')} />
                    </>
                  ) : (
                    <Empty text={t('cc_production.dash.bstageOk', 'All B-stage is fresh.')} />
                  )}
                </Tile>

                <Tile title={t('cc_production.dash.damaged', 'Damaged this week')} icon={PackageX} count={damaged.length} tone={damaged.length ? 'warn' : 'good'}>
                  {damaged.length ? (
                    <>
                      <p className="mb-2 text-2xl font-bold tabular-nums">{kg(damagedKg)} <span className="text-sm font-normal text-muted-foreground">{t('cc_production.dash.kgDamaged', 'kg damaged')}</span></p>
                      <ul className="divide-y divide-border text-sm">
                        {damaged.slice(0, TOP).map((row) => (
                          <li key={row.id} className="py-1.5">
                            <div className="flex justify-between gap-2">
                              <span className="min-w-0 truncate">{row.itemTitle}</span>
                              <span className="shrink-0 text-xs tabular-nums">{kg(row.kg)}</span>
                            </div>
                            <p className="truncate text-xs text-muted-foreground">
                              {day(row.entryDate)} · {row.reason}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <Empty text={t('cc_production.dash.noDamage', 'Nothing damaged this week.')} />
                  )}
                </Tile>

                {data.breakdowns.failedBatches.length ? (
                  <Tile title={t('cc_production.owner.failed', 'Failed resin batches (30 days)')} icon={FlaskConical} count={data.breakdowns.failedBatches.length} tone="bad">
                    <ul className="divide-y divide-border text-sm">
                      {data.breakdowns.failedBatches.slice(0, TOP).map((batch) => (
                        <li key={batch.id} className="py-1.5">
                          <Link className="font-mono text-xs hover:underline" href={`/backend/resin/batches/${batch.id}`}>
                            {batch.batchNo}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {day(batch.batchDate)} · {kg(batch.inputKg)} kg · {batch.reason ?? '—'}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </Tile>
                ) : null}

                {data.breakdowns.belowReorder?.length ? (
                  <Tile title={t('cc_production.dash.reorder', 'Below reorder level')} icon={AlertTriangle} count={data.breakdowns.belowReorder.length} tone="warn" action={<Link className="text-primary hover:underline" href="/backend/purchase/reorder">{t('cc_production.dash.reorderOpen', 'Reorder')}</Link>}>
                    <ul className="space-y-2.5">
                      {data.breakdowns.belowReorder.slice(0, TOP).map((row) => (
                        <li key={row.productId}>
                          <div className="flex justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate font-medium">{row.title}</span>
                            <span className="shrink-0 font-mono text-xs tabular-nums">
                              {kg(row.onHand)} / {kg(row.reorderPoint)} {row.unit}
                            </span>
                          </div>
                          <Bar value={row.onHand} max={row.reorderPoint} tone="bad" />
                        </li>
                      ))}
                    </ul>
                  </Tile>
                ) : null}

                {data.followUps?.length ? (
                  <Tile title={t('cc_production.dash.followUps', 'Enquiry follow-ups overdue')} icon={PhoneCall} count={data.followUps.length} tone="warn">
                    <ul className="divide-y divide-border text-sm">
                      {data.followUps.slice(0, TOP).map((row) => (
                        <li key={row.id} className="py-1.5">
                          <Link className="block truncate font-medium hover:underline" href={`/backend/crm/enquiries/${row.id}`}>
                            {row.partyName ?? '—'}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            <span className="text-status-error-text">{day(row.nextActionOn ?? '')}</span>
                            {row.nextActionNote ? ` · ${row.nextActionNote}` : ''}
                            {row.ownerName ? ` · ${row.ownerName}` : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <More href="/backend/crm/follow-ups" label={t('cc_production.dash.allFollowUps', 'All follow-ups')} />
                  </Tile>
                ) : null}

                {data.breakdowns.clashes.length ? (
                  <Tile title={t('cc_production.dash.clashes', 'Offline saves that overwrote a change')} icon={RefreshCcw} count={data.breakdowns.clashes.length} tone="warn">
                    <ul className="divide-y divide-border text-sm">
                      {data.breakdowns.clashes.slice(0, 3).map((clash) => (
                        <li key={clash.id} className="py-1.5">
                          <Link href={`/backend/sync/clashes/${clash.id}`} className="block truncate hover:underline">
                            {clash.screen} · {clash.recordRef}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {clash.byName ?? '—'} · {when(clash.at)}
                          </p>
                        </li>
                      ))}
                    </ul>
                    <More href="/backend/sync/clashes" label={t('cc_production.owner.allClashes', 'All sync clashes')} />
                  </Tile>
                ) : null}

                <div>
                  <CorrectionsPanel scope="plant" />
                </div>
              </div>
            </>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default PlantTodayPage
