"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { CalendarClock, RotateCcw, Send, Signature } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { kg, todayIso } from '../resin/shared'
import { OfflineBadge, isOffline, queueSave } from '../offline'
import { Dropdown } from '../../../cc_lists/components/Dropdown'

type Setup = { presses: Array<{ id: string; number: number; isWorking: boolean }>; operators: string[]; chindi: Array<{ id: string; title: string }>; cloths: Array<{ id: string; title: string }> }
type EntryView = {
  id: string
  pressId: string
  pressNumber: number
  dieNo: string
  customerName: string | null
  dieHeatTime: string | null
  orderQty: number | null
  orderRef: string | null
  priorMade: number | null
  articleWeightKg: number
  chindiKg: number | null
  clothProductId: string | null
  clothKg: number | null
  clothNote: string | null
  bstageGrade: string | null
  bstageKg: number | null
  productionNos: number
  startTime: string | null
  operatorName: string | null
  topTemp: string | null
  bottomTemp: string | null
  curingTime: string | null
  total: number
  status: 'draft' | 'posted'
  outputLotNumber: string | null
}
type ShiftView = { shift: number; version: string; entries: EntryView[]; grandTotal: number; weightTotal: number; signoff: { shiftIncharge: string | null; storeIncharge: string | null; authorised: string | null } }
type Day = { date: string; shifts: ShiftView[]; grandTotal: number; weightTotal: number; errors?: string[] }
type DieInfo = { dieNo: string; found: boolean; customerName: string | null; articleWeightKg: number | null; thicknessMm: number | null; description: string | null; openOrders?: Array<{ orderNo: string; qty: number }> }

const FIELDS = ['dieNo', 'dieHeatTime', 'orderQty', 'orderRef', 'articleWeightKg', 'chindiKg', 'clothKg', 'clothNote', 'clothProductId', 'bstageGrade', 'bstageKg', 'productionNos', 'priorMade', 'startTime', 'operatorName', 'topTemp', 'bottomTemp', 'curingTime'] as const
type Field = (typeof FIELDS)[number]
type Cell = Record<Field, string>

const blank = (): Cell => Object.fromEntries(FIELDS.map((field) => [field, ''])) as Cell
const toCell = (entry: EntryView): Cell => Object.fromEntries(FIELDS.map((field) => [field, entry[field] === null || entry[field] === undefined ? '' : String(entry[field])])) as Cell
const filled = (cell: Cell) => Boolean(cell.dieNo.trim())

type Row = { field: Field; label: string; kind: 'text' | 'number' | 'select-operator' | 'select-cloth'; optional?: boolean }

const ROWS: Row[] = [
  { field: 'dieNo', label: 'Die No.', kind: 'text' },
  { field: 'dieHeatTime', label: 'Die Heat Time', kind: 'text' },
  { field: 'orderQty', label: 'Order Qty.', kind: 'number' },
  { field: 'articleWeightKg', label: 'Weight of Article', kind: 'number' },
  { field: 'chindiKg', label: 'Weight of Chindi', kind: 'number' },
  { field: 'clothKg', label: 'Weight of Cloth', kind: 'number' },
  { field: 'clothProductId', label: '· cloth item', kind: 'select-cloth' },
  { field: 'clothNote', label: '· as written', kind: 'text' },
  { field: 'bstageGrade', label: 'B-stage grade', kind: 'text' },
  { field: 'bstageKg', label: 'B-stage kg', kind: 'number' },
  { field: 'productionNos', label: 'Shift Prod.', kind: 'number' },
  { field: 'startTime', label: 'Start Time', kind: 'text' },
  { field: 'operatorName', label: 'Operator Name', kind: 'select-operator' },
  { field: 'priorMade', label: 'Made before', kind: 'number' },
  { field: 'topTemp', label: 'Top Temp', kind: 'text', optional: true },
  { field: 'bottomTemp', label: 'Bottom Temp', kind: 'text', optional: true },
  { field: 'curingTime', label: 'Curing Time', kind: 'text', optional: true },
]

export function MouldingPage() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const granted = useGranted()
  const canEnter = granted.has('cc_production.moulding.enter')
  const canSign = granted.has('cc_production.moulding.sign')
  const { runMutation } = useGuardedMutation({ contextId: 'cc-moulding' })
  const [setup, setSetup] = React.useState<Setup | null>(null)
  const [date, setDate] = React.useState(params?.get('date') ?? todayIso())
  const [shift, setShift] = React.useState(Number(params?.get('shift') ?? 1))
  const [day, setDay] = React.useState<Day | null>(null)
  const [cells, setCells] = React.useState<Record<string, Cell>>({})
  const [dies, setDies] = React.useState<Record<string, DieInfo>>({})
  const [showTemps, setShowTemps] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void apiCall<Setup>('/api/cc_production/moulding/setup').then((call) => {
      if (!call.ok || !call.result) setError(t('cc_production.moulding.setupError', 'Could not load the machines.'))
      else setSetup(call.result)
    })
  }, [t])

  const current = day?.shifts.find((entry) => entry.shift === shift) ?? null

  const applyDay = React.useCallback(
    (next: Day) => {
      setDay(next)
      const block = next.shifts.find((entry) => entry.shift === shift)
      setCells(Object.fromEntries((block?.entries ?? []).map((entry) => [entry.pressId, toCell(entry)])))
    },
    [shift],
  )

  const load = React.useCallback(async () => {
    setDay(null)
    router.replace(`/backend/moulding?date=${date}&shift=${shift}`)
    const call = await apiCall<Day>(`/api/cc_production/moulding?date=${date}`)
    if (call.result) applyDay(call.result)
  }, [date, shift, router, applyDay])

  React.useEffect(() => {
    void load()
  }, [load])

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>

  const entryFor = (pressId: string) => current?.entries.find((entry) => entry.pressId === pressId) ?? null
  const cellFor = (pressId: string) => cells[pressId] ?? blank()
  const update = (pressId: string, field: Field, value: string) => setCells((previous) => ({ ...previous, [pressId]: { ...(previous[pressId] ?? blank()), [field]: value } }))

  const lookupDie = async (pressId: string, dieNo: string) => {
    if (!dieNo.trim()) return
    const call = await apiCall<{ items: DieInfo[] }>(`/api/cc_production/moulding/dies?lookup=${encodeURIComponent(dieNo.trim())}`)
    const info = call.result?.items[0]
    if (!info) return
    setDies((previous) => ({ ...previous, [pressId]: info }))
    if (!info.found) flash(t('cc_production.moulding.unknownDie', 'Die {die} is not in the mould list', { die: dieNo }), 'error')
    else {
      setCells((previous) => {
        const current = previous[pressId] ?? blank()
        const order = info.openOrders?.[0]
        return {
          ...previous,
          [pressId]: {
            ...current,
            articleWeightKg: current.articleWeightKg || (info.articleWeightKg ? String(info.articleWeightKg) : ''),
            orderQty: current.orderQty || (order ? String(order.qty) : ''),
            orderRef: current.orderRef || (order ? order.orderNo : ''),
          },
        }
      })
    }
  }

  const send = async (path: string, method: 'PUT' | 'POST', body: Record<string, unknown>) =>
    runMutation({
      context: { date, shift },
      mutationPayload: body,
      operation: () =>
        withScopedApiRequestHeaders(current?.entries.length ? buildOptimisticLockHeader(current.version) : {}, () =>
          apiCall<Day & { error?: string }>(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        ),
    })

  const save = async (): Promise<Day | null> => {
    const entries = (setup?.presses ?? [])
      .filter((press) => filled(cellFor(press.id)) && entryFor(press.id)?.status !== 'posted')
      .map((press) => {
        const cell = cellFor(press.id)
        const value = (field: Field) => (cell[field].trim() === '' ? null : cell[field].trim())
        return {
          pressId: press.id,
          dieNo: cell.dieNo.trim(),
          dieHeatTime: value('dieHeatTime'),
          orderQty: value('orderQty'),
          orderRef: value('orderRef'),
          priorMade: value('priorMade'),
          articleWeightKg: value('articleWeightKg'),
          chindiKg: value('chindiKg'),
          clothProductId: value('clothProductId'),
          clothKg: value('clothKg'),
          clothNote: value('clothNote'),
          bstageGrade: value('bstageGrade'),
          bstageKg: value('bstageKg'),
          productionNos: value('productionNos') ?? '0',
          startTime: value('startTime'),
          operatorName: value('operatorName'),
          topTemp: value('topTemp'),
          bottomTemp: value('bottomTemp'),
          curingTime: value('curingTime'),
        }
      })
    const body = { entryDate: date, shift, entries }
    if (isOffline()) {
      queueSave({ screen: 'Moulding register', recordRef: `${date} shift ${shift}`, path: '/api/cc_production/moulding', method: 'PUT', body, updatedAt: current?.entries.length ? current.version : null })
      flash(t('cc_production.offline.queued', 'Saved on this phone. It will sync when the network is back.'), 'success')
      return null
    }
    const call = await send('/api/cc_production/moulding', 'PUT', body)
    if (!call.ok || !call.result || call.result.error) {
      flash(call.result?.error ?? t('cc_production.moulding.saveError', 'Could not save the shift.'), 'error')
      return null
    }
    applyDay(call.result)
    return call.result
  }

  const act = async (action: 'post' | 'reopen' | 'sign_shift' | 'sign_store' | 'sign_authorised', pressId?: string) => {
    setBusy(true)
    try {
      if (action === 'post') {
        const saved = await save()
        if (!saved) return
      }
      const fresh = action === 'post' ? (await apiCall<Day>(`/api/cc_production/moulding?date=${date}`)).result : day
      const version = fresh?.shifts.find((entry) => entry.shift === shift)?.version
      const body = { entryDate: date, shift, action, ...(pressId ? { pressId } : {}) }
      const call = await runMutation({
        context: { date, shift },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(version ? buildOptimisticLockHeader(version) : {}, () =>
            apiCall<Day & { error?: string }>('/api/cc_production/moulding/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
          ),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_production.resin.actionError', 'Could not do that.'), 'error')
        await load()
        return
      }
      applyDay(call.result)
      if (call.result.errors?.length) flash(call.result.errors.join(' · '), 'error')
      else flash(action === 'post' ? t('cc_production.moulding.posted', 'Posted. Moulded lots are on the shop floor.') : action === 'reopen' ? t('cc_production.coating.reopened', 'Reopened. The stock movements are reversed.') : t('cc_production.moulding.signed', 'Signed.'), 'success')
    } finally {
      setBusy(false)
    }
  }

  const rows = ROWS.filter((row) => showTemps || !row.optional)
  const presses = setup?.presses ?? []
  const cellClass = 'h-7 w-full min-w-0 rounded border border-input bg-background px-1 text-xs tabular-nums disabled:border-transparent disabled:bg-transparent'

  const renderInput = (pressId: string, row: Row, locked: boolean) => {
    const cell = cellFor(pressId)
    if (row.kind === 'select-operator') {
      return (
        <Dropdown className={cellClass} disabled={locked} value={cell.operatorName} onChange={(event) => update(pressId, 'operatorName', event.target.value)} aria-label={row.label}>
          <option value="" />
          {(setup?.operators ?? []).map((operator) => (
            <option key={operator} value={operator}>
              {operator}
            </option>
          ))}
        </Dropdown>
      )
    }
    if (row.kind === 'select-cloth') {
      return (
        <Dropdown className={cellClass} disabled={locked} value={cell.clothProductId} onChange={(event) => update(pressId, 'clothProductId', event.target.value)} aria-label={row.label}>
          <option value="" />
          {(setup?.cloths ?? []).map((cloth) => (
            <option key={cloth.id} value={cloth.id}>
              {cloth.title}
            </option>
          ))}
        </Dropdown>
      )
    }
    return (
      <input
        className={cellClass}
        disabled={locked}
        inputMode={row.kind === 'number' ? 'decimal' : undefined}
        value={cell[row.field]}
        onChange={(event) => update(pressId, row.field, event.target.value)}
        onBlur={row.field === 'dieNo' ? (event) => void lookupDie(pressId, event.target.value) : undefined}
        aria-label={row.label}
      />
    )
  }

  const totalLine = (pressId: string) => {
    const entry = entryFor(pressId)
    if (!entry) return ''
    return entry.orderQty ? `${entry.total} of ${entry.orderQty}` : String(entry.total)
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-full flex-col gap-5 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('cc_production.moulding.eyebrow', 'Moulding')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.moulding.title', 'Moulded products daily production register')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {t('cc_production.moulding.lede', 'Machines 1–20 across, as printed. A die can be on only one machine in a shift. Posting takes chindi, cloth and B-stage out of stock and puts the moulded pieces on the shop floor.')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <OfflineBadge onSynced={() => void load()} />
              <Input type="date" className="w-44" value={date} onChange={(event) => setDate(event.target.value)} aria-label={t('cc_production.resin.date', 'Date')} />
              <Button asChild variant="outline">
                <Link href={`/backend/moulding/dies?date=${date}`}>
                  <CalendarClock className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.moulding.dies', 'Die availability')}
                </Link>
              </Button>
            </div>
          </header>

          <nav className="flex flex-wrap items-center gap-1 border-b border-border">
            {[1, 2].map((value) => (
              <button key={value} type="button" aria-pressed={shift === value} onClick={() => setShift(value)} className={cn('-mb-px border-b-2 px-4 py-2 text-sm font-medium', shift === value ? 'border-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                {value === 1 ? t('cc_production.moulding.shift1', '1st shift') : t('cc_production.moulding.shift2', '2nd shift')}
                {day ? <span className="ml-2 text-xs text-muted-foreground">{day.shifts.find((entry) => entry.shift === value)?.grandTotal ?? 0} nos</span> : null}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 pb-2 text-xs text-muted-foreground">
              <input type="checkbox" className="h-3.5 w-3.5 accent-primary" checked={showTemps} onChange={(event) => setShowTemps(event.target.checked)} />
              {t('cc_production.moulding.temps', 'Show top / bottom temp and curing time')}
            </label>
          </nav>

          {!day || !setup ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <>
              <section className="hidden overflow-x-auto rounded-xl border border-border bg-card shadow-sm md:block">
                <table className="text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="sticky left-0 z-10 min-w-32 bg-muted px-2 py-2 text-left uppercase tracking-wide">{t('cc_production.moulding.machine', 'Machine No.')}</th>
                      {presses.map((press) => {
                        const entry = entryFor(press.id)
                        return (
                          <th key={press.id} className={cn('min-w-24 px-1 py-2 text-center', !press.isWorking && 'text-muted-foreground')}>
                            {press.number}
                            {entry?.status === 'posted' ? <span className="ml-1 text-status-success-text">✓</span> : null}
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((row) => (
                      <tr key={row.field}>
                        <th className="sticky left-0 z-10 bg-card px-2 py-1 text-left font-medium">{row.field === 'productionNos' ? `${shift === 1 ? '1st' : '2nd'} ${row.label}` : row.label}</th>
                        {presses.map((press) => (
                          <td key={press.id} className="px-0.5 py-0.5">
                            {renderInput(press.id, row, !canEnter || entryFor(press.id)?.status === 'posted')}
                            {row.field === 'dieNo' && (dies[press.id]?.customerName || entryFor(press.id)?.customerName) ? <span className="block truncate px-1 text-muted-foreground">{dies[press.id]?.customerName ?? entryFor(press.id)?.customerName}</span> : null}
                            {row.field === 'dieHeatTime' && dies[press.id]?.thicknessMm ? <span className="block px-1 text-muted-foreground">({dies[press.id]?.thicknessMm} mm)</span> : null}
                            {row.field === 'orderQty' && cellFor(press.id).orderRef ? <span className="block truncate px-1 font-mono text-muted-foreground">{cellFor(press.id).orderRef}</span> : null}
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="bg-muted/30 font-semibold">
                      <th className="sticky left-0 z-10 bg-muted px-2 py-1.5 text-left">{t('cc_production.moulding.total', 'Total')}</th>
                      {presses.map((press) => (
                        <td key={press.id} className="px-1 py-1.5 text-center tabular-nums">
                          {totalLine(press.id)}
                        </td>
                      ))}
                    </tr>
                    {canEnter ? (
                      <tr>
                        <th className="sticky left-0 z-10 bg-card px-2 py-1 text-left text-muted-foreground">{t('cc_production.moulding.lot', 'Lot')}</th>
                        {presses.map((press) => {
                          const entry = entryFor(press.id)
                          return (
                            <td key={press.id} className="px-1 py-1 text-center">
                              {entry?.status === 'posted' ? (
                                <span className="flex flex-col items-center gap-0.5">
                                  <Link className="font-mono underline-offset-2 hover:underline" href={`/backend/moulding/entries/${entry.id}`}>
                                    {entry.outputLotNumber?.slice(-6) ?? '—'}
                                  </Link>
                                  <button type="button" className="text-muted-foreground hover:text-foreground" disabled={busy} onClick={() => void act('reopen', press.id)} title={t('cc_production.resin.reopen', 'Reopen')}>
                                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                                  </button>
                                </span>
                              ) : entry ? (
                                <Link className="text-muted-foreground underline-offset-2 hover:underline" href={`/backend/moulding/entries/${entry.id}`}>
                                  {t('cc_production.moulding.open', 'open')}
                                </Link>
                              ) : null}
                            </td>
                          )
                        })}
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>

              <section className="flex flex-col gap-3 md:hidden">
                {presses.map((press) => {
                  const entry = entryFor(press.id)
                  const locked = !canEnter || entry?.status === 'posted'
                  return (
                    <details key={press.id} className="rounded-lg border border-border bg-card" open={Boolean(entry)}>
                      <summary className="flex cursor-pointer items-center justify-between px-4 py-2.5 text-sm font-medium">
                        <span>
                          {t('cc_production.moulding.machineShort', 'Machine {no}', { no: press.number })}
                          {entry ? <span className="ml-2 font-mono text-xs text-muted-foreground">{entry.dieNo}</span> : null}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">{totalLine(press.id)}</span>
                      </summary>
                      <div className="grid grid-cols-2 gap-2 border-t border-border p-3">
                        {rows.map((row) => (
                          <label key={row.field} className="space-y-1 text-xs">
                            <span className="text-muted-foreground">{row.label}</span>
                            {renderInput(press.id, row, locked)}
                          </label>
                        ))}
                      </div>
                    </details>
                  )
                })}
              </section>

              <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-3 shadow-sm">
                <div className="flex gap-8 text-sm">
                  <span>
                    {t('cc_production.moulding.grandTotal', 'Grand Total')}: <b className="tabular-nums">{current?.grandTotal ?? 0}</b>
                  </span>
                  <span>
                    {t('cc_production.moulding.weightTotal', 'Weight Total')}: <b className="tabular-nums">{kg(current?.weightTotal ?? 0)} kg</b>
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      ['sign_shift', t('cc_production.moulding.signShift', 'Shift in-charge'), current?.signoff.shiftIncharge],
                      ['sign_store', t('cc_production.moulding.signStore', 'Store in-charge'), current?.signoff.storeIncharge],
                      ['sign_authorised', t('cc_production.moulding.signAuthorised', 'Authorised'), current?.signoff.authorised],
                    ] as Array<['sign_shift' | 'sign_store' | 'sign_authorised', string, string | null | undefined]>
                  ).map(([action, label, signed]) =>
                    signed ? (
                      <span key={action} className="text-xs text-muted-foreground">
                        {label}: {signed}
                      </span>
                    ) : canSign ? (
                      <Button key={action} type="button" variant="outline" size="sm" disabled={busy || !current?.entries.length} onClick={() => void act(action)}>
                        <Signature className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        {label}
                      </Button>
                    ) : null,
                  )}
                </div>
              </section>

              {canEnter ? (
                <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      try {
                        if (await save()) flash(t('cc_production.coating.saved', 'Saved.'), 'success')
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    {t('cc_production.resin.save', 'Save')}
                  </Button>
                  <Button type="button" disabled={busy} onClick={() => void act('post')}>
                    <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.moulding.postShift', 'Save and post shift')}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default MouldingPage
