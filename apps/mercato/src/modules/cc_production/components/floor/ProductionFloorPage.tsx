"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowRight, Boxes, FlaskConical, Layers, RefreshCw, Shapes, Wind } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Input } from '@open-mercato/ui/primitives/input'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { MachineState, MachineTile } from '../../lib/floorBoard'

type Summary = { total: number; running: number; done: number; idle: number; breakdown: number }
type Produced = {
  press: { batches: number; kg: number; sheets: number }
  moulding: { pieces: number; kg: number; machines: number }
  resin: { batches: number; kg: number; yieldPct: number | null }
  coating: { sheets: number; kg: number }
}
type Floor = {
  date: string
  machines: { reactors: MachineTile[]; dryers: MachineTile[]; presses: MachineTile[] }
  summary: { reactors: Summary; dryers: Summary; presses: Summary }
  feed: Array<{ key: string; at: string; area: 'resin' | 'coating' | 'press' | 'moulding'; title: string; detail: string; status: string; href: string }>
  open: { resin: number; coating: number; press: number; moulding: number }
  produced: Produced | null
  plan: { exists: boolean; rows: Array<{ area: string; resource: string; item: string | null; plannedQty: number; unit: string; actual: number; pct: number | null }> } | null
  alerts: { failedBatches: Array<{ id: string; batchNo: string; reason: string | null }>; bstageAtRisk: Array<{ lotId: string; lotNumber: string; clothTitle: string; kg: number }>; belowReorder: Array<{ productId: string; title: string }>; damaged: Array<{ id: string; itemTitle: string; kg: number }> } | null
}

const todayIst = () => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10)

const STATE_STYLE: Record<MachineState, { frame: string; dot: string; label: string }> = {
  running: { frame: 'border-status-info-border bg-status-info-bg', dot: 'bg-status-info-icon', label: 'Running' },
  done: { frame: 'border-status-success-border bg-status-success-bg', dot: 'bg-status-success-icon', label: 'Posted' },
  idle: { frame: 'border-border bg-card', dot: 'bg-muted-foreground', label: 'Free' },
  breakdown: { frame: 'border-status-error-border bg-status-error-bg', dot: 'bg-status-error-icon', label: 'Down' },
}

const AREA_ICON = { resin: FlaskConical, coating: Wind, press: Layers, moulding: Shapes } as const

function kg(value: number): string {
  return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value)
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })
}

function Tile({ tile, big }: { tile: MachineTile; big?: boolean }) {
  const style = STATE_STYLE[tile.state]
  const body = (
    <div className={cn('flex h-full flex-col gap-1 rounded-md border p-2.5 transition-colors hover:border-foreground/40', style.frame)}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn('font-mono font-bold tabular-nums', big ? 'text-base' : 'text-lg')}>{tile.label}</span>
        <span className="flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
          <span className={cn('size-1.5 rounded-full', style.dot, tile.state === 'running' && 'animate-pulse')} aria-hidden="true" />
          {style.label}
        </span>
      </div>
      {tile.sub ? <span className="text-xs text-muted-foreground">{tile.sub}</span> : null}
      <span className="line-clamp-2 text-xs">{tile.detail}</span>
    </div>
  )
  return tile.href ? <Link href={tile.href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">{body}</Link> : body
}

function Station({ href, icon: Icon, label, figure, sub, open, last }: { href: string; icon: typeof Boxes; label: string; figure: string; sub: string; open: number; last?: boolean }) {
  const t = useT()
  return (
    <div className="flex min-w-0 flex-1 items-stretch">
      <Link href={href} className="group flex min-w-0 flex-1 flex-col gap-1 rounded-md border border-border bg-card p-3 hover:border-foreground/40">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3.5" aria-hidden="true" />
          {label}
        </span>
        <span className="cc-figure text-2xl font-bold tabular-nums">{figure}</span>
        <span className="text-xs text-muted-foreground">{sub}</span>
        {open ? <StatusBadge variant="warning" className="mt-1 w-fit">{t('cc_production.floor.open', '{count} not posted', { count: open })}</StatusBadge> : null}
      </Link>
      {last ? null : <ArrowRight className="mx-1 hidden size-4 self-center text-muted-foreground lg:block" aria-hidden="true" />}
    </div>
  )
}

function Group({ title, summary, children }: { title: string; summary: Summary; children: React.ReactNode }) {
  const t = useT()
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">
          {t('cc_production.floor.summary', '{running} running · {done} posted · {idle} free', { running: summary.running, done: summary.done, idle: summary.idle })}
          {summary.breakdown ? <span className="ml-1 font-semibold text-status-error-text">· {t('cc_production.floor.down', '{count} down', { count: summary.breakdown })}</span> : null}
        </p>
      </div>
      {children}
    </section>
  )
}

export function ProductionFloorPage() {
  const t = useT()
  const [date, setDate] = React.useState(todayIst())
  const [data, setData] = React.useState<Floor | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loadedAt, setLoadedAt] = React.useState<Date | null>(null)
  const isToday = date === todayIst()

  const load = React.useCallback(async () => {
    const call = await apiCall<Floor>(`/api/cc_production/floor?date=${date}`)
    if (!call.ok || !call.result) {
      setError(t('cc_production.floor.loadError', 'Could not load the production floor.'))
      return
    }
    setError(null)
    setData(call.result)
    setLoadedAt(new Date())
  }, [date, t])

  React.useEffect(() => {
    setData(null)
    void load()
  }, [load])

  React.useEffect(() => {
    if (!isToday) return undefined
    const handle = window.setInterval(() => void load(), 60_000)
    return () => window.clearInterval(handle)
  }, [isToday, load])

  if (error && !data) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>

  const produced = data?.produced
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-7xl flex-col gap-5 pb-16">
          <header className="cc-band flex flex-wrap items-end justify-between gap-3 px-5 py-4">
            <div>
              <p className="cc-overline">Creative Carbon · Kanera</p>
              <h1 className="mt-1 text-3xl font-bold tracking-tight">{t('cc_production.floor.title', 'Production floor')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t('cc_production.floor.lede', 'Every reactor, dryer and press, and everything entered today, in one place.')}</p>
            </div>
            <div className="flex items-center gap-3">
              {loadedAt && isToday ? (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <RefreshCw className="size-3.5" aria-hidden="true" />
                  {t('cc_production.floor.updated', 'Updated {time}', { time: clock(loadedAt.toISOString()) })}
                </span>
              ) : null}
              <Input type="date" className="w-40" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} aria-label={t('cc_production.resin.date', 'Date')} />
            </div>
          </header>

          {!data ? (
            <div className="flex justify-center py-20"><Spinner /></div>
          ) : (
            <>
              <section aria-label={t('cc_production.floor.flow', 'Flow of production')} className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
                <Station href="/backend/resin/batches" icon={FlaskConical} label={t('cc_production.floor.resin', 'Resin')} figure={produced ? `${kg(produced.resin.kg)} kg` : `${data.summary.reactors.running + data.summary.reactors.done}/${data.summary.reactors.total}`} sub={produced ? t('cc_production.floor.resinSub', '{batches} batches{yield}', { batches: produced.resin.batches, yield: produced.resin.yieldPct !== null ? ` · ${produced.resin.yieldPct}% yield` : '' }) : t('cc_production.floor.reactorsUsed', 'reactors in use')} open={data.open.resin} />
                <Station href="/backend/coating" icon={Wind} label={t('cc_production.floor.coating', 'Coating · B-stage')} figure={produced ? `${kg(produced.coating.kg)} kg` : `${data.summary.dryers.running + data.summary.dryers.done}/${data.summary.dryers.total}`} sub={produced ? t('cc_production.floor.coatingSub', '{sheets} dryer sheets', { sheets: produced.coating.sheets }) : t('cc_production.floor.dryersUsed', 'dryers in use')} open={data.open.coating} />
                <Station href="/backend/press/batches" icon={Layers} label={t('cc_production.floor.press', 'Laminate press')} figure={produced ? `${kg(produced.press.kg)} kg` : String(data.open.press)} sub={produced ? t('cc_production.floor.pressSub', '{sheets} sheets · {batches} batches', { sheets: produced.press.sheets, batches: produced.press.batches }) : t('cc_production.floor.batchesToday', 'batches today')} open={data.open.press} />
                <Station href="/backend/moulding" icon={Shapes} label={t('cc_production.floor.moulding', 'Moulding')} figure={produced ? `${new Intl.NumberFormat('en-IN').format(produced.moulding.pieces)} pcs` : String(data.open.moulding)} sub={produced ? t('cc_production.floor.mouldingSub', '{kg} kg · {machines} machines', { kg: kg(produced.moulding.kg), machines: produced.moulding.machines }) : t('cc_production.floor.entriesToday', 'entries today')} open={data.open.moulding} />
                <Station href="/backend/quality/fg-inspection" icon={Boxes} label={t('cc_production.floor.finish', 'Finishing · QC · FG store')} figure="→" sub={t('cc_production.floor.finishSub', 'cutting, inspection, lab, FG stock')} open={0} last />
              </section>

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
                <div className="flex flex-col gap-6 xl:col-span-2">
                  <Group title={t('cc_production.floor.presses', 'Presses')} summary={data.summary.presses}>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                      {data.machines.presses.map((tile) => <Tile key={tile.key} tile={tile} />)}
                    </div>
                  </Group>
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <Group title={t('cc_production.floor.dryers', 'Dryers')} summary={data.summary.dryers}>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{data.machines.dryers.map((tile) => <Tile key={tile.key} tile={tile} big />)}</div>
                    </Group>
                    <Group title={t('cc_production.floor.reactors', 'Resin reactors')} summary={data.summary.reactors}>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{data.machines.reactors.map((tile) => <Tile key={tile.key} tile={tile} big />)}</div>
                    </Group>
                  </div>
                </div>

                <aside className="flex flex-col gap-6">
                  <section className="space-y-2">
                    <h2 className="text-sm font-semibold">{t('cc_production.floor.feed', 'Today, as it happens')}</h2>
                    <ul className="divide-y divide-border rounded-md border border-border bg-card">
                      {data.feed.length ? data.feed.map((item) => {
                        const Icon = AREA_ICON[item.area]
                        return (
                          <li key={item.key}>
                            <Link href={item.href} className="flex items-start gap-2.5 px-3 py-2 hover:bg-muted/50">
                              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-medium">{item.title}</span>
                                <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                              </span>
                              <span className="flex shrink-0 flex-col items-end gap-1">
                                <span className="font-mono text-xs tabular-nums text-muted-foreground">{clock(item.at)}</span>
                                <StatusBadge variant={item.status === 'posted' ? 'success' : item.status === 'failed' ? 'error' : 'warning'}>{item.status === 'posted' ? t('cc_production.floor.posted', 'Posted') : item.status === 'failed' ? t('cc_production.floor.failed', 'Failed') : t('cc_production.floor.draft', 'Open')}</StatusBadge>
                              </span>
                            </Link>
                          </li>
                        )
                      }) : <li className="px-3 py-6 text-center text-sm text-muted-foreground">{t('cc_production.floor.nothing', 'Nothing entered yet on this day.')}</li>}
                    </ul>
                  </section>

                  {data.plan ? (
                    <section className="space-y-2">
                      <div className="flex items-baseline justify-between">
                        <h2 className="text-sm font-semibold">{t('cc_production.floor.plan', 'Plan against actual')}</h2>
                        <Link className="text-xs text-muted-foreground underline-offset-2 hover:underline" href={`/backend/owner/plan?date=${data.date}`}>{t('cc_production.floor.openPlan', 'Open plan')}</Link>
                      </div>
                      <div className="divide-y divide-border rounded-md border border-border bg-card">
                        {data.plan.rows.length ? data.plan.rows.map((row, index) => (
                          <div key={index} className="space-y-1 px-3 py-2">
                            <div className="flex items-baseline justify-between gap-2 text-sm"><span className="capitalize">{row.area} {row.resource} {row.item ?? ''}</span><span className="font-mono text-xs tabular-nums">{row.actual}/{row.plannedQty} {row.unit}</span></div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className={cn('h-full rounded-full', (row.pct ?? 0) >= 100 ? 'bg-status-success-icon' : 'bg-status-info-icon')} style={{ width: `${Math.min(100, row.pct ?? 0)}%` }} /></div>
                          </div>
                        )) : <p className="px-3 py-4 text-sm text-muted-foreground">{data.plan.exists ? t('cc_production.floor.planEmpty', 'The plan has no lines.') : t('cc_production.floor.noPlan', 'No plan was written for this day.')}</p>}
                      </div>
                    </section>
                  ) : null}

                  {data.alerts && (data.alerts.failedBatches.length || data.alerts.bstageAtRisk.length || data.alerts.belowReorder.length) ? (
                    <section className="space-y-2">
                      <h2 className="text-sm font-semibold">{t('cc_production.floor.alerts', 'Needs attention')}</h2>
                      <ul className="space-y-1.5 text-sm">
                        {data.alerts.failedBatches.map((row) => <li key={row.id} className="rounded-md border border-status-error-border bg-status-error-bg px-3 py-2 text-status-error-text">{t('cc_production.floor.failedBatch', 'Resin batch {no} failed{why}', { no: row.batchNo, why: row.reason ? `: ${row.reason}` : '' })}</li>)}
                        {data.alerts.bstageAtRisk.slice(0, 5).map((row) => <li key={row.lotId} className="rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-status-warning-text">{t('cc_production.floor.bstageRisk', 'B-stage {lot} ({kg} kg) is getting old', { lot: row.lotNumber, kg: kg(row.kg) })}</li>)}
                        {data.alerts.belowReorder.slice(0, 5).map((row) => <li key={row.productId} className="rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-status-warning-text">{t('cc_production.floor.belowReorder', '{title} is below its reorder level', { title: row.title })}</li>)}
                      </ul>
                    </section>
                  ) : null}
                </aside>
              </div>
            </>
          )}
        </div>
      </PageBody>
    </Page>
  )
}
