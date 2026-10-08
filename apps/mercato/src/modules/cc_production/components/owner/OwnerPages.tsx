"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowLeft, ClipboardList, Factory, Plus, Search, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { day, kg, todayIso, when } from '../resin/shared'
import { selectClass, useSend } from '../finishing/shared'
import { OfflineBadge, usePlantPwa } from '../offline'
import { PlantTable } from '../PlantTable'

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
}

function Card({ title, children, tone }: { title: string; children: React.ReactNode; tone?: 'warning' }) {
  return (
    <section className={cn('rounded-xl border bg-card p-4 shadow-sm', tone === 'warning' ? 'border-status-warning-border' : 'border-border')}>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">{title}</h2>
      {children}
    </section>
  )
}

function Big({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-2xl font-bold leading-none tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  )
}

export function OwnerOverviewPage() {
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
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-3xl flex-col gap-4 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">Creative Carbon · Kanera</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.owner.title', 'Owner overview')}</h1>
            </div>
            <div className="flex items-center gap-2">
              <OfflineBadge />
              <Input type="date" className="w-40" value={date} onChange={(event) => setDate(event.target.value)} aria-label={t('cc_production.resin.date', 'Date')} />
            </div>
          </header>
          {!data ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <>
              <Card title={t('cc_production.owner.produced', '1 · What was produced')}>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Big value={`${kg(data.produced.press.kg)} kg`} label={t('cc_production.owner.pressed', '{sheets} sheets pressed in {batches} batches', { sheets: data.produced.press.sheets, batches: data.produced.press.batches })} />
                  <Big value={`${data.produced.moulding.pieces}`} label={t('cc_production.owner.moulded', 'moulded pieces ({kg} kg, {machines} machines)', { kg: kg(data.produced.moulding.kg), machines: data.produced.moulding.machines })} />
                  <Big value={`${kg(data.produced.resin.kg)} kg`} label={t('cc_production.owner.resin', 'resin{pct}', { pct: data.produced.resin.yieldPct !== null ? ` · yield ${data.produced.resin.yieldPct}%` : '' })} />
                  <Big value={`${kg(data.produced.coating.kg)} kg`} label={t('cc_production.owner.coated', 'B-stage coated')} />
                </div>
                {data.produced.press.byThickness.length ? (
                  <p className="mt-3 font-mono text-xs text-muted-foreground">{data.produced.press.byThickness.map((line) => `${line.thicknessMm} mm: ${line.sheets} · ${kg(line.kg)} kg`).join('   ')}</p>
                ) : null}
              </Card>

              <Card title={t('cc_production.owner.onPlan', '2 · Against the plan')}>
                {data.plan.rows.length ? (
                  <ul className="space-y-2">
                    {data.plan.rows.map((row, index) => (
                      <li key={index} className="space-y-1">
                        <div className="flex justify-between gap-2 text-sm">
                          <span>
                            <span className="font-medium capitalize">{row.area}</span> {row.resource}
                            {row.item ? <span className="text-muted-foreground"> · {row.item}</span> : null}
                          </span>
                          <span className="tabular-nums">
                            {kg(row.actual)} / {kg(row.plannedQty)} {row.unit}
                          </span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className={cn('h-full rounded-full', (row.pct ?? 0) >= 100 ? 'bg-status-success-icon' : (row.pct ?? 0) >= 70 ? 'bg-status-warning-icon' : 'bg-status-error-icon')} style={{ width: `${Math.min(100, row.pct ?? 0)}%` }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('cc_production.owner.noPlan', 'No plan was written for this day.')}</p>
                )}
                {granted.has('cc_production.plan.manage') ? (
                  <Button asChild variant="outline" size="sm" className="mt-3">
                    <Link href={`/backend/owner/plan?date=${date}`}>
                      <ClipboardList className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('cc_production.owner.writePlan', 'Write or change the plan')}
                    </Link>
                  </Button>
                ) : null}
                {data.shortfall.length ? (
                  <div className="mt-4">
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('cc_production.owner.shortfall', 'Orders short of finished stock')}</p>
                    <ul className="space-y-1 text-sm">
                      {data.shortfall.map((row) => (
                        <li key={row.productId} className="flex justify-between gap-2">
                          <span>{row.title}</span>
                          <span className="tabular-nums text-status-error-text">
                            {t('cc_production.owner.short', 'short {short} {unit} ({orders} orders)', { short: kg(row.short), unit: row.unit, orders: row.orders })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </Card>

              {data.followUps?.length ? (
                <Card title={t('cc_production.owner.followUps', 'Enquiry follow-ups overdue: {count}', { count: data.followUps.length })} tone="warning">
                  <ul className="space-y-1.5 text-sm">
                    {data.followUps.map((row) => (
                      <li key={row.id}>
                        <Link className="underline-offset-2 hover:underline" href={`/backend/crm/enquiries/${row.id}`}>
                          <span className="font-mono text-xs">{row.enquiryNo}</span> · {row.partyName ?? '—'} · {row.subject}
                        </Link>
                        <span className="block text-xs text-status-error-text">
                          {day(row.nextActionOn ?? '')}
                          {row.nextActionNote ? ` · ${row.nextActionNote}` : ''}
                          {row.ownerName ? ` · ${row.ownerName}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Card>
              ) : null}

              <Card title={t('cc_production.owner.breakdowns', '3 · Breakdowns and risks')} tone={data.breakdowns.failedBatches.length || data.breakdowns.damaged.length || data.breakdowns.bstageAtRisk.length ? 'warning' : undefined}>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium">{t('cc_production.owner.idle', 'Idle presses today: {count}', { count: data.breakdowns.idleMachines.length })}</p>
                    <p className="text-xs text-muted-foreground">{data.breakdowns.idleMachines.map((press) => `${press.number}${press.isWorking ? '' : ' (down)'}`).join(', ') || '—'}</p>
                  </div>
                  {data.breakdowns.failedBatches.length ? (
                    <div>
                      <p className="flex items-center gap-1 font-medium text-status-error-text">
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                        {t('cc_production.owner.failed', 'Failed resin batches (30 days)')}
                      </p>
                      {data.breakdowns.failedBatches.map((batch) => (
                        <Link key={batch.id} className="block text-xs underline-offset-2 hover:underline" href={`/backend/resin/batches/${batch.id}`}>
                          {batch.batchNo} · {day(batch.batchDate)} · {kg(batch.inputKg)} kg · {batch.reason}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  <div>
                    <p className="font-medium">{t('cc_production.owner.bstage', 'B-stage at risk: {count} lots', { count: data.breakdowns.bstageAtRisk.length })}</p>
                    {data.breakdowns.bstageAtRisk.slice(0, 8).map((lot) => (
                      <Link key={lot.lotId} className="block text-xs underline-offset-2 hover:underline" href={`/backend/bstage/lots/${lot.lotId}`}>
                        {lot.lotNumber} · {lot.clothTitle ?? ''} · {kg(lot.kg)} kg · day {lot.ageDays}
                        {lot.band === 'blocked' ? ' · blocked' : lot.band === 'expired' ? ' · past 7 days' : ''}
                      </Link>
                    ))}
                  </div>
                  <div>
                    <p className="font-medium">{t('cc_production.owner.damaged', 'Damaged this week: {count}', { count: data.breakdowns.damaged.length })}</p>
                    {data.breakdowns.damaged.map((row) => (
                      <p key={row.id} className="text-xs text-muted-foreground">
                        {day(row.entryDate)} · {row.itemTitle} · {kg(row.kg)} · {row.reason}
                      </p>
                    ))}
                  </div>
                  {data.breakdowns.belowReorder?.length ? (
                    <div>
                      <p className="flex items-center gap-1 font-medium text-status-warning-text">
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                        <Link className="underline-offset-2 hover:underline" href="/backend/purchase/reorder">
                          {t('cc_production.owner.reorder', 'Below reorder level: {count}', { count: data.breakdowns.belowReorder.length })}
                        </Link>
                      </p>
                      {data.breakdowns.belowReorder.map((row) => (
                        <p key={row.productId} className="text-xs text-muted-foreground">
                          {row.title} · {kg(row.onHand)} / {kg(row.reorderPoint)} {row.unit}
                          {row.onOrder ? ` · ${t('cc_production.owner.onOrder', '{qty} on order', { qty: kg(row.onOrder) })}` : ''}
                        </p>
                      ))}
                    </div>
                  ) : null}
                  {data.breakdowns.clashes.length ? (
                    <div>
                      <p className="font-medium">{t('cc_production.owner.clashes', 'Offline saves that overwrote a change')}</p>
                      {data.breakdowns.clashes.map((clash) => (
                        <p key={clash.id} className="text-xs text-muted-foreground">
                          {clash.screen} · {clash.recordRef} · {clash.byName ?? '—'} · {when(clash.at)}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </Card>
            </>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

type PlanLineDraft = { key: string; area: 'resin' | 'coating' | 'press' | 'moulding'; resource: string; item: string; plannedQty: string; unit: 'kg' | 'nos' | 'sheets' }
type PlanView = { id: string | null; planDate: string; lines: Array<Omit<PlanLineDraft, 'key' | 'plannedQty' | 'item'> & { plannedQty: number; item: string | null }>; notes: string | null; updatedAt: string | null }

let seq = 0
const key = () => `p${(seq += 1)}`
const UNIT_FOR: Record<PlanLineDraft['area'], PlanLineDraft['unit']> = { resin: 'kg', coating: 'kg', press: 'kg', moulding: 'nos' }

function tomorrow(): string {
  const date = new Date(`${todayIso()}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

export function PlanPage() {
  const t = useT()
  const params = useSearchParams()
  const send = useSend('cc-plan')
  const [date, setDate] = React.useState(params?.get('date') ?? tomorrow())
  const [plan, setPlan] = React.useState<PlanView | null>(null)
  const [lines, setLines] = React.useState<PlanLineDraft[]>([])
  const [notes, setNotes] = React.useState('')

  React.useEffect(() => {
    void apiCall<PlanView>(`/api/cc_production/plan?date=${date}`).then((call) => {
      const view = call.result ?? null
      setPlan(view)
      setLines((view?.lines ?? []).map((line) => ({ key: key(), area: line.area, resource: line.resource, item: line.item ?? '', plannedQty: String(line.plannedQty), unit: line.unit })))
      setNotes(view?.notes ?? '')
    })
  }, [date])

  const save = async () => {
    const body = { planDate: date, notes: notes || null, lines: lines.filter((line) => line.plannedQty).map((line) => ({ area: line.area, resource: line.resource, item: line.item || null, plannedQty: Number(line.plannedQty), unit: line.unit })) }
    const saved = await send<PlanView>('/api/cc_production/plan', 'PUT', body, plan?.updatedAt ?? null)
    if (saved) {
      setPlan(saved)
      flash(t('cc_production.plan.saved', 'Plan saved.'), 'success')
    }
  }

  const update = (lineKey: string, patch: Partial<PlanLineDraft>) => setLines(lines.map((line) => (line.key === lineKey ? { ...line, ...patch } : line)))
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-12">
          <Link href={`/backend/owner?date=${date}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('cc_production.owner.title', 'Owner overview')}
          </Link>
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.plan.title', 'Production plan')}</h1>
              <p className="text-sm text-muted-foreground">{t('cc_production.plan.lede', 'Written the day before (a die change takes a day). The overview compares each line with what was posted.')}</p>
            </div>
            <Input type="date" className="w-40" value={date} onChange={(event) => setDate(event.target.value)} aria-label={t('cc_production.resin.date', 'Date')} />
          </header>
          <section className="space-y-2 rounded-xl border border-border bg-card p-4 shadow-sm">
            {lines.map((line) => (
              <div key={line.key} className="grid grid-cols-12 gap-2">
                <select className={cn(selectClass, 'col-span-3')} value={line.area} onChange={(event) => update(line.key, { area: event.target.value as PlanLineDraft['area'], unit: UNIT_FOR[event.target.value as PlanLineDraft['area']] })} aria-label="Area">
                  <option value="resin">Resin</option>
                  <option value="coating">Coating</option>
                  <option value="press">Press</option>
                  <option value="moulding">Moulding</option>
                </select>
                <Input className="col-span-2" placeholder={line.area === 'coating' ? 'Dryer 2' : line.area === 'resin' ? '' : 'No.'} value={line.resource} onChange={(event) => update(line.key, { resource: event.target.value })} aria-label="Press / machine / dryer" />
                <Input className="col-span-3" placeholder={line.area === 'moulding' ? 'Die No.' : 'Grade / item'} value={line.item} onChange={(event) => update(line.key, { item: event.target.value })} aria-label="Item" />
                <Input className="col-span-2 text-right" inputMode="decimal" value={line.plannedQty} onChange={(event) => update(line.key, { plannedQty: event.target.value })} aria-label="Planned" />
                <select className={cn(selectClass, 'col-span-1 px-1')} value={line.unit} onChange={(event) => update(line.key, { unit: event.target.value as PlanLineDraft['unit'] })} aria-label="Unit">
                  <option value="kg">kg</option>
                  <option value="nos">nos</option>
                  <option value="sheets">sheets</option>
                </select>
                <Button type="button" variant="ghost" size="icon" className="col-span-1" onClick={() => setLines(lines.filter((entry) => entry.key !== line.key))} aria-label={t('cc_production.resin.removeLine', 'Remove row')}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, { key: key(), area: 'moulding', resource: '', item: '', plannedQty: '', unit: 'nos' }])}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              {t('cc_production.plan.add', 'Add a line')}
            </Button>
            <Input placeholder={t('cc_production.resin.notes', 'Remarks')} value={notes} onChange={(event) => setNotes(event.target.value)} />
            <div className="flex justify-end">
              <Button type="button" onClick={() => void save()}>
                {t('cc_production.resin.save', 'Save')}
              </Button>
            </div>
          </section>
        </div>
      </PageBody>
    </Page>
  )
}

type StockRow = { productId: string; title: string; kind: string; unit: string; place: string; placeLabel: string; qty: number; free: number; nos: number | null; lots: number; onHold: number; oldestDays: number | null; reorderPoint: number | null; reorder: boolean }
type StockGrid = { items: StockRow[]; places: Array<{ key: string; label: string }>; totals: { kg: number; pieces: number; reorder: number } }
type LotRow = { lotId: string; lotNumber: string; productId: string; title: string; place: string; placeLabel: string; status: string; onHand: number; free: number; nosLeft: number | null; unit: string; madeOn: string | null }

const KINDS: Array<{ value: string; label: string }> = [
  { value: '', label: 'All types' },
  { value: 'chemical', label: 'Chemicals' },
  { value: 'reinforcement', label: 'Reinforcement' },
  { value: 'chindi', label: 'Chindi' },
  { value: 'resin', label: 'Resin' },
  { value: 'bstage', label: 'B-stage' },
  { value: 'laminate', label: 'Sheets, tubes, rods' },
  { value: 'moulded', label: 'Moulded' },
  { value: 'bought_in', label: 'Bought-in' },
]

function StockLots({ row }: { row: StockRow }) {
  const [lots, setLots] = React.useState<LotRow[] | null>(null)
  React.useEffect(() => {
    void apiCall<{ items: LotRow[] }>(`/api/cc_production/finishing/lots?kinds=${row.kind}`, undefined, { fallback: { items: [] } }).then((call) => setLots((call.result?.items ?? []).filter((lot) => lot.productId === row.productId && lot.place === row.place)))
  }, [row.kind, row.productId, row.place])
  if (!lots) return <Spinner />
  return (
    <ul className="space-y-1 text-xs">
      {lots.map((lot) => (
        <li key={lot.lotId} className="flex justify-between gap-3">
          <Link className="font-mono underline-offset-2 hover:underline" href={`/backend/stock/lots/${lot.lotId}`} onClick={(event) => event.stopPropagation()}>
            {lot.lotNumber}
          </Link>
          <span className="tabular-nums text-muted-foreground">
            {kg(lot.onHand)} {lot.unit === 'nos' ? 'pcs' : 'kg'}
            {lot.nosLeft !== null && lot.unit !== 'nos' ? ` · ${lot.nosLeft} nos` : ''}
            {lot.madeOn ? ` · ${day(lot.madeOn)}` : ''}
            {lot.status !== 'available' ? ` · ${lot.status}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function StockGridPage() {
  const t = useT()
  const granted = useGranted()
  const [kind, setKind] = React.useState('')
  const [place, setPlace] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [grid, setGrid] = React.useState<StockGrid | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const handle = window.setTimeout(async () => {
      const params = new URLSearchParams()
      if (kind) params.set('kind', kind)
      if (place) params.set('place', place)
      if (search.trim()) params.set('q', search.trim())
      const call = await apiCall<StockGrid>(`/api/cc_production/stock?${params.toString()}`)
      if (!cancelled) setGrid(call.result ?? null)
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [kind, place, search])

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('cc_production.stock.eyebrow', 'Stock')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.stock.title', 'All stock')}</h1>
              <p className="text-sm text-muted-foreground">{t('cc_production.stock.lede', 'Every item in every store, weight first. Click a row for its lots; click a lot for where it came from and went to.')}</p>
            </div>
            {granted.has('cc_store.adjust') ? (
              <Button asChild variant="outline">
                <Link href="/backend/stock/stocktake">
                  <ClipboardList className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.stock.stocktake', 'Stocktake')}
                </Link>
              </Button>
            ) : null}
          </header>
          <div className="flex flex-wrap items-center gap-2">
            <select className={cn(selectClass, 'w-48')} value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Type">
              {KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select className={cn(selectClass, 'w-44')} value={place} onChange={(event) => setPlace(event.target.value)} aria-label="Store">
              <option value="">{t('cc_production.stock.allStores', 'All stores')}</option>
              {(grid?.places ?? []).map((entry) => (
                <option key={entry.key} value={entry.key}>
                  {entry.label}
                </option>
              ))}
            </select>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('cc_production.stock.search', 'Item or lot')} />
            </div>
            {grid ? (
              <span className="ml-auto text-sm text-muted-foreground">
                {kg(grid.totals.kg)} kg · {grid.totals.pieces} pcs{grid.totals.reorder ? ` · ${grid.totals.reorder} to reorder` : ''}
              </span>
            ) : null}
          </div>
          {!grid ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <PlantTable
              tableId="cc_production.stock_grid"
              rows={grid.items}
              rowKey={(row) => `${row.productId}|${row.place}`}
              renderExpanded={(row) => <StockLots row={row} />}
              columns={[
                { key: 'item', label: t('cc_production.stock.item', 'Item'), alwaysVisible: true, render: (row) => <span className="font-medium">{row.title}{row.reorder ? <span className="ml-2 rounded bg-status-warning-bg px-1.5 py-0.5 text-xs text-status-warning-text">{t('cc_production.stock.reorder', 'reorder')}</span> : null}</span> },
                { key: 'type', label: t('cc_production.stock.type', 'Type'), render: (row) => <span className="text-xs text-muted-foreground">{KINDS.find((option) => option.value === row.kind)?.label ?? row.kind}</span> },
                { key: 'store', label: t('cc_production.stock.store', 'Store'), render: (row) => <span className="text-xs">{row.placeLabel}</span> },
                { key: 'qty', label: t('cc_production.stock.qty', 'kg / pcs'), align: 'right', render: (row) => <span>{kg(row.qty)} {row.unit === 'nos' ? 'pcs' : 'kg'}{row.onHold ? <span className="block text-xs text-status-warning-text">{kg(row.onHold)} on hold</span> : null}</span> },
                { key: 'free', label: t('cc_production.stock.free', 'Free'), align: 'right', hidden: true, render: (row) => kg(row.free) },
                { key: 'nos', label: t('cc_production.stock.nos', 'Nos'), align: 'right', render: (row) => row.nos ?? '' },
                { key: 'lots', label: t('cc_production.stock.lots', 'Lots'), align: 'right', render: (row) => row.lots },
                { key: 'oldest', label: t('cc_production.stock.oldest', 'Oldest'), align: 'right', render: (row) => (row.oldestDays === null ? '—' : `${row.oldestDays} d`) },
                { key: 'reorderPoint', label: t('cc_production.stock.reorderPoint', 'Reorder at'), align: 'right', hidden: true, render: (row) => row.reorderPoint ?? '' },
              ]}
            />
          )}
        </div>
      </PageBody>
    </Page>
  )
}

type LotPage = { lot: { lotId: string; lotNumber: string; title: string; onHand: number; free: number; placeLabel: string; unit?: string; nosLeft?: number | null; status?: string; madeOn?: string | null; batchNo?: string | null }; metadata: Record<string, unknown> | null; movements: Array<{ id: string; at: string; qty: number; place: string | null; reason: string | null; source: string | null }> }

export function StockLotPage({ lotId }: { lotId: string }) {
  const t = useT()
  const [data, setData] = React.useState<LotPage | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    void apiCall<LotPage>(`/api/cc_production/stock/lot?id=${encodeURIComponent(lotId)}`).then((call) => {
      if (!call.ok || !call.result) setError(t('cc_production.stock.lotError', 'Could not load this lot.'))
      else setData(call.result)
    })
  }, [lotId, t])
  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!data) return <Page><PageBody><LoadingMessage label={t('cc_production.resin.loading', 'Loading…')} /></PageBody></Page>
  const meta = data.metadata ?? {}
  const facts = (['grade', 'thicknessMm', 'cutSize', 'sheetSize', 'batchNo', 'dieNo', 'customerName', 'disposition', 'supplier', 'invoiceNo', 'parentLot'] as const).filter((field) => meta[field] !== undefined && meta[field] !== null && meta[field] !== '')
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-3xl flex-col gap-5 pb-12">
          <Link href="/backend/stock" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('cc_production.stock.title', 'All stock')}
          </Link>
          <header>
            <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{data.lot.title}</p>
            <h1 className="font-mono text-2xl font-bold tracking-tight">{data.lot.lotNumber}</h1>
            <p className="text-sm text-muted-foreground">
              {data.lot.placeLabel} · {kg(data.lot.onHand)} {data.lot.unit === 'nos' ? 'pcs' : 'kg'} left{data.lot.status && data.lot.status !== 'available' ? ` · ${data.lot.status}` : ''}
            </p>
          </header>
          {facts.length ? (
            <section className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 shadow-sm sm:grid-cols-3">
              {facts.map((field) => (
                <div key={field}>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{field}</p>
                  <p className="text-sm font-semibold">{String(meta[field])}</p>
                </div>
              ))}
            </section>
          ) : null}
          <section className="rounded-xl border border-border bg-card shadow-sm">
            <h2 className="border-b border-border px-5 py-3 text-sm font-semibold uppercase tracking-wide">{t('cc_production.bstage.movements', 'Came from and went to')}</h2>
            <ul className="divide-y divide-border">
              {data.movements.map((movement) => (
                <li key={movement.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5 text-sm">
                  <span>
                    {movement.reason ?? '—'}
                    {movement.place ? <span className="text-muted-foreground"> · {movement.place}</span> : null}
                  </span>
                  <span className="flex gap-4 tabular-nums">
                    <span className={movement.qty < 0 ? 'text-muted-foreground' : 'font-semibold'}>
                      {movement.qty > 0 ? '+' : ''}
                      {kg(movement.qty)}
                    </span>
                    <span className="text-xs text-muted-foreground">{when(movement.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </PageBody>
    </Page>
  )
}

export function StocktakePage() {
  const t = useT()
  const send = useSend('cc-stocktake')
  const [place, setPlace] = React.useState('wh_a')
  const [kind, setKind] = React.useState('reinforcement')
  const [countDate, setCountDate] = React.useState(todayIso())
  const [lots, setLots] = React.useState<LotRow[] | null>(null)
  const [counts, setCounts] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    setLots(null)
    const params = new URLSearchParams({ place })
    if (kind) params.set('kind', kind)
    const call = await apiCall<{ items: LotRow[] }>(`/api/cc_production/stocktake?${params.toString()}`, undefined, { fallback: { items: [] } })
    setLots(call.result?.items ?? [])
    setCounts({})
  }, [place, kind])
  React.useEffect(() => {
    void load()
  }, [load])

  const counted = Object.entries(counts).filter(([, value]) => value.trim() !== '')
  const post = async () => {
    setBusy(true)
    try {
      const result = await send<{ adjusted: number }>('/api/cc_production/stocktake', 'POST', { place, countDate, lines: counted.map(([lotId, value]) => ({ lotId, counted: Number(value) })) })
      if (result) {
        flash(t('cc_production.stocktake.done', 'Posted. {count} lots adjusted to the count.', { count: result.adjusted }), 'success')
        await load()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-4xl flex-col gap-5 pb-12">
          <Link href="/backend/stock" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('cc_production.stock.title', 'All stock')}
          </Link>
          <header className="space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.stocktake.title', 'Stocktake')}</h1>
            <p className="text-sm text-muted-foreground">{t('cc_production.stocktake.lede', 'The dated reinforcement stock list as a count: enter what is actually there for the lots you counted; only the differences are posted, with the date.')}</p>
          </header>
          <div className="flex flex-wrap gap-2">
            <select className={cn(selectClass, 'w-44')} value={place} onChange={(event) => setPlace(event.target.value)} aria-label="Store">
              {[
                ['wh_a', 'Warehouse A'],
                ['wh_b', 'Warehouse B'],
                ['tank', 'Resin tank'],
                ['floor', 'Shop floor'],
                ['fg', 'FG store'],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select className={cn(selectClass, 'w-48')} value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Type">
              {KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <Input type="date" className="w-40" value={countDate} onChange={(event) => setCountDate(event.target.value)} aria-label={t('cc_production.resin.date', 'Date')} />
          </div>
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {!lots ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : !lots.length ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">{t('cc_production.stocktake.empty', 'Nothing in stock here.')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2">{t('cc_production.stock.item', 'Item')}</th>
                    <th className="px-4 py-2">{t('cc_production.stocktake.lot', 'Lot')}</th>
                    <th className="px-4 py-2 text-right">{t('cc_production.stocktake.book', 'Book')}</th>
                    <th className="w-32 px-4 py-2 text-right">{t('cc_production.stocktake.counted', 'Counted')}</th>
                    <th className="px-4 py-2 text-right">{t('cc_production.stocktake.diff', 'Difference')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lots.map((lot) => {
                    const value = counts[lot.lotId] ?? ''
                    const diff = value.trim() === '' ? null : Math.round((Number(value) - lot.onHand) * 1000) / 1000
                    return (
                      <tr key={lot.lotId}>
                        <td className="px-4 py-1.5">{lot.title}</td>
                        <td className="px-4 py-1.5 font-mono text-xs">{lot.lotNumber}</td>
                        <td className="px-4 py-1.5 text-right tabular-nums">{kg(lot.onHand)}</td>
                        <td className="px-4 py-1.5">
                          <Input className="h-8 text-right" inputMode="decimal" value={value} onChange={(event) => setCounts({ ...counts, [lot.lotId]: event.target.value })} aria-label={`${lot.lotNumber} counted`} />
                        </td>
                        <td className={cn('px-4 py-1.5 text-right tabular-nums', diff !== null && diff !== 0 && (diff < 0 ? 'text-status-error-text' : 'text-status-success-text'))}>{diff === null ? '' : `${diff > 0 ? '+' : ''}${kg(diff)}`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </section>
          <div className="flex justify-end">
            <Button type="button" disabled={busy || !counted.length} onClick={() => void post()}>
              <Factory className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.stocktake.post', 'Post the differences')}
            </Button>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}
