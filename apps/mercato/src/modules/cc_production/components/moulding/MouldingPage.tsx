"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, CalendarClock, ChevronDown, ExternalLink, LayoutList, Plus, RotateCcw, Send, Signature, Table2, X } from 'lucide-react'
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
import { CorrectDialog } from '../../../cc_ui/components/CorrectDialog'

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

type Row = { field: Field; label: string; kind: 'text' | 'number' | 'select-operator' | 'select-cloth'; optional?: boolean; help?: string }
type View = 'entry' | 'register'
const VIEW_KEY = 'cc.moulding.view'

const ROWS: Row[] = [
  { field: 'dieNo', label: 'Die No.', kind: 'text', help: 'The die (mould) on this machine. Weight and order fill in from the die list.' },
  { field: 'dieHeatTime', label: 'Die Heat Time', kind: 'text', help: 'When the die was put on to heat' },
  { field: 'orderQty', label: 'Order Qty.', kind: 'number', help: 'Pieces the customer ordered' },
  { field: 'articleWeightKg', label: 'Weight of Article', kind: 'number', help: 'Kg of one finished piece' },
  { field: 'chindiKg', label: 'Weight of Chindi', kind: 'number', help: 'Kg of chindi used this shift' },
  { field: 'clothKg', label: 'Weight of Cloth', kind: 'number', help: 'Kg of cloth used this shift' },
  { field: 'clothProductId', label: 'Cloth item', kind: 'select-cloth', help: 'Which cloth, taken out of stock on posting' },
  { field: 'clothNote', label: 'Cloth as written', kind: 'text', help: 'Only if the cloth is not in the list' },
  { field: 'bstageGrade', label: 'B-stage grade', kind: 'text', help: 'Grade of the B-stage used' },
  { field: 'bstageKg', label: 'B-stage kg', kind: 'number', help: 'Kg of B-stage used' },
  { field: 'productionNos', label: 'Shift Prod.', kind: 'number' },
  { field: 'startTime', label: 'Start Time', kind: 'text', help: 'When moulding started' },
  { field: 'operatorName', label: 'Operator Name', kind: 'select-operator', help: 'Who ran the machine' },
  { field: 'priorMade', label: 'Made before', kind: 'number', help: 'Pieces of this order made before this shift, only if the app does not know them' },
  { field: 'topTemp', label: 'Top Temp', kind: 'text', optional: true },
  { field: 'bottomTemp', label: 'Bottom Temp', kind: 'text', optional: true },
  { field: 'curingTime', label: 'Curing Time', kind: 'text', optional: true },
]

const GROUPS: Array<{ key: string; title: string; fields: Field[] }> = [
  { key: 'die', title: 'Die & order', fields: ['dieNo', 'dieHeatTime', 'orderQty', 'articleWeightKg'] },
  { key: 'material', title: 'Material used', fields: ['chindiKg', 'clothKg', 'clothProductId', 'clothNote', 'bstageGrade', 'bstageKg'] },
  { key: 'production', title: 'Production', fields: ['productionNos', 'startTime', 'operatorName', 'priorMade', 'topTemp', 'bottomTemp', 'curingTime'] },
]

function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'register' ? 'register' : 'entry'
  } catch {
    return 'entry'
  }
}

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
  const [reopenPress, setReopenPress] = React.useState<string | null>(null)
  const [view, setViewState] = React.useState<View>('entry')
  const [added, setAdded] = React.useState<string[]>([])
  const [expanded, setExpanded] = React.useState<string[]>([])
  React.useEffect(() => setViewState(readView()), [])
  const setView = (next: View) => {
    setViewState(next)
    try {
      window.localStorage.setItem(VIEW_KEY, next)
    } catch {}
  }
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
    setAdded([])
    router.replace(`/backend/moulding?date=${date}&shift=${shift}`)
    const call = await apiCall<Day>(`/api/cc_production/moulding?date=${date}`)
    if (call.ok && call.result) applyDay(call.result)
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

  const act = async (action: 'post' | 'reopen' | 'sign_shift' | 'sign_store' | 'sign_authorised', pressId?: string, reason?: string) => {
    setBusy(true)
    try {
      if (action === 'post') {
        const saved = await save()
        if (!saved) return
      }
      const fresh = action === 'post' ? (await apiCall<Day>(`/api/cc_production/moulding?date=${date}`)).result : day
      const version = fresh?.shifts.find((entry) => entry.shift === shift)?.version
      const body = { entryDate: date, shift, action, ...(pressId ? { pressId } : {}), ...(reason ? { reason } : {}) }
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

  const renderInput = (pressId: string, row: Row, locked: boolean, className: string = cellClass) => {
    const cell = cellFor(pressId)
    if (row.kind === 'select-operator') {
      return (
        <Dropdown className={className} disabled={locked} value={cell.operatorName} onChange={(event) => update(pressId, 'operatorName', event.target.value)} aria-label={row.label}>
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
        <Dropdown className={className} disabled={locked} value={cell.clothProductId} onChange={(event) => update(pressId, 'clothProductId', event.target.value)} aria-label={row.label}>
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
        className={className}
        disabled={locked}
        inputMode={row.kind === 'number' ? 'decimal' : undefined}
        value={cell[row.field]}
        onChange={(event) => update(pressId, row.field, event.target.value)}
        onBlur={row.field === 'dieNo' ? (event) => void lookupDie(pressId, event.target.value) : undefined}
        aria-label={row.label}
      />
    )
  }

  const listed = presses.filter((press) => entryFor(press.id) || filled(cellFor(press.id)) || added.includes(press.id))
  const dieUse = new Map<string, number[]>()
  for (const press of listed) {
    const die = cellFor(press.id).dieNo.trim().toLowerCase()
    if (die) dieUse.set(die, [...(dieUse.get(die) ?? []), press.number])
  }
  const clashWith = (press: { id: string; number: number }) => {
    const die = cellFor(press.id).dieNo.trim().toLowerCase()
    return die ? (dieUse.get(die) ?? []).filter((number) => number !== press.number) : []
  }
  const removeMachine = (pressId: string) => {
    setAdded((previous) => previous.filter((id) => id !== pressId))
    setCells((previous) => {
      const next = { ...previous }
      delete next[pressId]
      return next
    })
  }
  const cardInput = 'h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-sm tabular-nums disabled:border-transparent disabled:bg-muted/40'
  const rowByField = new Map(rows.map((row) => [row.field, row]))

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
                {t('cc_production.moulding.lede', 'Add each machine that ran this shift and fill in its card, or switch to the register to see machines 1–20 across as printed. A die can be on only one machine in a shift. Posting takes chindi, cloth and B-stage out of stock and puts the moulded pieces on the shop floor.')}
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
            <div className="ml-auto hidden items-center gap-1 pb-1.5 md:flex" role="radiogroup" aria-label={t('cc_production.moulding.view', 'How to show the shift')}>
              {(
                [
                  ['entry', t('cc_production.moulding.viewEntry', 'Machine cards'), LayoutList],
                  ['register', t('cc_production.moulding.viewRegister', 'Register (as on paper)'), Table2],
                ] as Array<[View, string, typeof Table2]>
              ).map(([value, label, Icon]) => (
                <button key={value} type="button" role="radio" aria-checked={view === value} onClick={() => setView(value)} className={cn('inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium', view === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:text-foreground')}>
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            <label className="flex items-center gap-2 pb-2 text-xs text-muted-foreground md:ml-3">
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
              <section className={cn('hidden overflow-x-auto rounded-xl border border-border bg-card shadow-sm', view === 'register' && 'md:block')}>
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
                                  <button type="button" className="text-muted-foreground hover:text-foreground" disabled={busy} onClick={() => setReopenPress(press.id)} title={t('cc_production.resin.reopen', 'Reopen')}>
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

              <section className={cn('flex flex-col gap-4', view === 'register' && 'md:hidden')}>
                {listed.length ? (
                  listed.map((press) => {
                    const entry = entryFor(press.id)
                    const locked = !canEnter || entry?.status === 'posted'
                    const info = dies[press.id]
                    const customer = info?.customerName ?? entry?.customerName ?? null
                    const clashes = clashWith(press)
                    const orderQty = Number(cellFor(press.id).orderQty || entry?.orderQty || 0)
                    const made = entry?.total ?? Number(cellFor(press.id).productionNos || 0)
                    const collapsed = entry?.status === 'posted' && !expanded.includes(press.id)
                    const toggle = () => setExpanded((previous) => (previous.includes(press.id) ? previous.filter((id) => id !== press.id) : [...previous, press.id]))
                    return (
                      <article key={press.id} className={cn('rounded-xl border bg-card shadow-xs', clashes.length ? 'border-status-error-border' : 'border-border')}>
                        <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
                          <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg font-bold tabular-nums', entry?.status === 'posted' ? 'bg-status-success-bg text-status-success-text' : 'cc-bar-accent text-primary-foreground')}>{press.number}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">
                              {t('cc_production.moulding.machineShort', 'Machine {no}', { no: press.number })}
                              {cellFor(press.id).dieNo ? <span className="ml-2 font-mono text-muted-foreground">· {t('cc_production.moulding.dieShort', 'die {die}', { die: cellFor(press.id).dieNo })}</span> : null}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {entry?.status === 'posted' ? t('cc_production.moulding.statusPosted', 'Posted') : entry ? t('cc_production.moulding.statusDraft', 'Saved, not posted') : t('cc_production.moulding.statusNew', 'New, not saved yet')}
                              {customer ? ` · ${customer}` : ''}
                              {info?.thicknessMm ? ` · ${info.thicknessMm} mm` : ''}
                              {cellFor(press.id).orderRef ? ` · ${cellFor(press.id).orderRef}` : ''}
                            </p>
                          </div>
                          {orderQty ? (
                            <div className="w-40">
                              <p className="text-right text-xs tabular-nums text-muted-foreground">
                                <b className="text-foreground">{made}</b> / {orderQty} {t('cc_production.moulding.nos', 'nos')}
                              </p>
                              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                                <div className={cn('h-full rounded-full', made >= orderQty ? 'bg-status-success-icon' : 'cc-bar-accent')} style={{ width: `${Math.min(100, Math.round((made / orderQty) * 100))}%` }} />
                              </div>
                            </div>
                          ) : null}
                          <div className="flex items-center gap-1">
                            {entry ? (
                              <Button asChild variant="ghost" size="sm">
                                <Link href={`/backend/moulding/entries/${entry.id}`}>
                                  <ExternalLink className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                                  {entry.status === 'posted' && entry.outputLotNumber ? entry.outputLotNumber.slice(-6) : t('cc_production.moulding.open', 'open')}
                                </Link>
                              </Button>
                            ) : null}
                            {entry?.status === 'posted' && canEnter ? (
                              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setReopenPress(press.id)}>
                                <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                                {t('cc_production.resin.reopen', 'Reopen')}
                              </Button>
                            ) : null}
                            {entry?.status === 'posted' ? (
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-expanded={!collapsed} aria-label={collapsed ? t('cc_production.moulding.showDetails', 'Show details') : t('cc_production.moulding.hideDetails', 'Hide details')} onClick={toggle}>
                                <ChevronDown className={cn('h-4 w-4 transition-transform', !collapsed && 'rotate-180')} aria-hidden="true" />
                              </Button>
                            ) : null}
                            {!locked ? (
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={t('cc_production.moulding.removeMachine', 'Remove machine {no} from this shift', { no: press.number })} onClick={() => removeMachine(press.id)}>
                                <X className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            ) : null}
                          </div>
                        </header>
                        {clashes.length ? (
                          <p className="flex items-center gap-2 border-b border-status-error-border bg-status-error-bg px-4 py-2 text-xs text-status-error-text">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('cc_production.moulding.clash', 'This die is also on machine {machines} in this shift. A die can be on only one machine.', { machines: clashes.join(', ') })}
                          </p>
                        ) : null}
                        {collapsed && entry ? (
                          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
                            {(
                              [
                                [t('cc_production.moulding.piecesThisShift', 'Pieces made this shift'), `${entry.productionNos} ${t('cc_production.moulding.nos', 'nos')}`],
                                [t('cc_production.moulding.row.articleWeightKg', 'Weight of Article'), `${kg(entry.articleWeightKg)} kg`],
                                [t('cc_production.moulding.row.chindiKg', 'Weight of Chindi'), entry.chindiKg ? `${kg(entry.chindiKg)} kg` : '—'],
                                [t('cc_production.moulding.row.clothKg', 'Weight of Cloth'), entry.clothKg ? `${kg(entry.clothKg)} kg` : '—'],
                                [t('cc_production.moulding.row.bstageKg', 'B-stage kg'), entry.bstageKg ? `${kg(entry.bstageKg)} kg${entry.bstageGrade ? ` ${entry.bstageGrade}` : ''}` : '—'],
                                [t('cc_production.moulding.row.operatorName', 'Operator Name'), entry.operatorName ?? '—'],
                              ] as Array<[string, string]>
                            ).map(([label, value]) => (
                              <div key={label} className="min-w-0">
                                <dt className="truncate text-xs text-muted-foreground">{label}</dt>
                                <dd className="truncate font-medium tabular-nums">{value}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : (
                        <div className="grid grid-cols-1 gap-x-6 gap-y-4 p-4 lg:grid-cols-3">
                          {GROUPS.map((group) => (
                            <fieldset key={group.key} className="space-y-3">
                              <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(`cc_production.moulding.group.${group.key}`, group.title)}</legend>
                              <div className="grid grid-cols-2 gap-3">
                                {group.fields.map((field) => {
                                  const row = rowByField.get(field)
                                  if (!row) return null
                                  const label = row.field === 'productionNos' ? t('cc_production.moulding.piecesThisShift', 'Pieces made this shift') : t(`cc_production.moulding.row.${row.field}`, row.label)
                                  return (
                                    <label key={field} className={cn('space-y-1', (row.field === 'dieNo' || row.field === 'productionNos') && 'col-span-2')}>
                                      <span className={cn('block text-xs font-medium', row.field === 'productionNos' && 'text-sm')}>{label}</span>
                                      {renderInput(press.id, row, locked, row.field === 'productionNos' ? cn(cardInput, 'h-11 text-lg font-semibold') : cardInput)}
                                      {row.help ? <span className="block text-xs leading-snug text-muted-foreground">{t(`cc_production.moulding.help.${row.field}`, row.help)}</span> : null}
                                    </label>
                                  )
                                })}
                              </div>
                            </fieldset>
                          ))}
                        </div>
                        )}
                      </article>
                    )
                  })
                ) : (
                  <p className="rounded-xl border border-dashed border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
                    {canEnter ? t('cc_production.moulding.emptyEntry', 'No machine entered for this shift yet. Pick the machines that ran below.') : t('cc_production.moulding.emptyView', 'Nothing entered for this shift.')}
                  </p>
                )}
                {canEnter ? (
                  <div className="rounded-xl border border-border bg-card p-4">
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      {t('cc_production.moulding.addMachine', 'Add a machine that ran this shift')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {presses
                        .filter((press) => !listed.some((item) => item.id === press.id))
                        .map((press) => (
                          <button
                            key={press.id}
                            type="button"
                            disabled={!press.isWorking}
                            title={press.isWorking ? undefined : t('cc_production.moulding.notWorking', 'Marked as not working in Plant machines')}
                            onClick={() => setAdded((previous) => [...previous, press.id])}
                            className="h-10 min-w-10 rounded-lg border border-border bg-background px-2 text-sm font-semibold tabular-nums transition-colors hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:bg-status-error-bg disabled:text-status-error-text"
                          >
                            {press.number}
                          </button>
                        ))}
                    </div>
                  </div>
                ) : null}
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
                  {canSign && !current?.entries.length ? <span className="text-xs text-muted-foreground">{t('cc_production.moulding.signHint', 'Sign once the shift has entries')}</span> : null}
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
      <CorrectDialog
        open={reopenPress !== null}
        onOpenChange={(open) => !open && setReopenPress(null)}
        destructive={false}
        title={t('cc_production.moulding.reopenTitle', 'Reopen this machine’s entry')}
        confirmLabel={t('cc_production.resin.reopen', 'Reopen')}
        undo={[t('cc_production.moulding.undoInputs', 'Puts the chindi, cloth and B-stage back'), t('cc_production.moulding.undoLot', 'Removes the moulded lot it made')]}
        onConfirm={async (reason) => {
          if (reopenPress) await act('reopen', reopenPress, reason)
        }}
      />
    </Page>
  )
}

export default MouldingPage
