"use client"

import * as React from 'react'
import Link from 'next/link'
import { PackageCheck, Plus, RefreshCw, Scale, Search, X } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../cc_departments/components/useGranted'

export const ORDER_CHANGED_EVENT = 'cc-order-changed'

type Allocation = { id: string; lotId: string; lotNumber: string; place: string; qty: number; shippedQty: number; status: 'reserved' | 'shipped' | 'released'; lotStatus: string }
type Line = { lineId: string; productId: string; title: string; kind: string | null; unit: string; qty: number; material: Record<string, string>; allocated: number; short: number; packed: number | null; weights: number[]; despatched: number; made: number | null; allocations: Allocation[] }
type QcLot = { allocationId: string; lotId: string; lotNumber: string; status: string; fgInspected: boolean; thickness: { result: string; date: string } | null; boughtIn: boolean }
type Fulfilment = { lines: Line[]; totals: { ordered: number; allocated: number; packed: number; despatched: number }; onHold: string[]; qc: { lots: QcLot[]; labTests?: QcLabTest[]; allThickness: boolean; allFg: boolean } }
type QcLabTest = { id: string; testDate: string; testType: string; standard: string | null; result: string; reportNo: string | null; lotRefs: string | null }
type Candidate = { lotId: string; lotNumber: string; placeLabel: string; status: string; free: number; unit: string; nosLeft: number | null; thicknessMm: number | null; sheetSize: string | null; madeOn: string | null; expiresOn: string | null; forCustomer: boolean; markedFor: string | null; matches: boolean }

const num = (value: number | null | undefined) => (value === null || value === undefined ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value))

export function notifyOrderChanged(orderId: string) {
  window.dispatchEvent(new CustomEvent(ORDER_CHANGED_EVENT, { detail: { orderId } }))
}

export function useOrderChanged(orderId: string | null | undefined, reload: () => void) {
  const reloadRef = React.useRef(reload)
  reloadRef.current = reload
  React.useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<{ orderId: string }>).detail
      if (!orderId || detail?.orderId === orderId) reloadRef.current()
    }
    window.addEventListener(ORDER_CHANGED_EVENT, listener)
    return () => window.removeEventListener(ORDER_CHANGED_EVENT, listener)
  }, [orderId])
}

function spec(line: Line): string {
  return [line.material.grade, line.material.weave, line.material.sheet_size, line.material.thickness_mm ? `${line.material.thickness_mm} mm` : null, line.material.die_no ? `die ${line.material.die_no}` : null].filter(Boolean).join(' · ')
}

function LineHead({ line, children }: { line: Line; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <p className="text-sm font-medium">{line.title}</p>
        <p className="text-xs text-muted-foreground">{spec(line)}</p>
      </div>
      <div className="text-xs tabular-nums">{children}</div>
    </div>
  )
}

export function FulfilmentPanel({ orderId, stageKey, stageStatus, editable }: { orderId: string; stageKey: string; stageStatus: string; editable: boolean }) {
  const t = useT()
  const granted = useGranted()
  const { runMutation } = useGuardedMutation({ contextId: `cc-fulfilment-${orderId}` })
  const [data, setData] = React.useState<Fulfilment | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [picking, setPicking] = React.useState<string | null>(null)
  const [candidates, setCandidates] = React.useState<Candidate[] | null>(null)
  const [qty, setQty] = React.useState<Record<string, string>>({})
  const [weights, setWeights] = React.useState<Record<string, string[]>>({})
  const [pieces, setPieces] = React.useState<Record<string, string>>({})

  const load = React.useCallback(async () => {
    const call = await apiCall<Fulfilment>(`/api/cc_orders/orders/fulfilment?id=${orderId}`)
    if (call.ok && call.result) {
      setData(call.result)
      setWeights(Object.fromEntries(call.result.lines.map((line) => [line.lineId, line.weights.length ? line.weights.map(String) : ['', '', '', '', '']])))
      setPieces(Object.fromEntries(call.result.lines.map((line) => [line.lineId, line.packed !== null && line.unit === 'nos' ? String(line.packed) : ''])))
    }
  }, [orderId])

  React.useEffect(() => {
    void load()
  }, [load])
  useOrderChanged(orderId, () => void load())

  const open = stageStatus === 'open' || stageStatus === 'on_hold'
  const can = (feature: string) => editable && open && granted.has(feature)

  const [overAge, setOverAge] = React.useState<{ lotId: string; message: string; reason: string } | null>(null)

  const post = async (body: Record<string, unknown>, success: string) => {
    setBusy(true)
    try {
      const call = await runMutation({
        context: { orderId },
        mutationPayload: body,
        operation: () => apiCall<Fulfilment & { error?: string; overAllocated?: boolean }>('/api/cc_orders/orders/fulfilment', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ orderId, ...body }) }),
      })
      if (!call.ok || !call.result || call.result.error) {
        const message = call.result?.error ?? t('cc_orders.fulfilment.error', 'Could not do that.')
        if (body.action === 'allocate' && typeof body.lotId === 'string' && /Give a reason to sell it/.test(message)) {
          setOverAge({ lotId: body.lotId, message, reason: '' })
          return false
        }
        flash(message, 'error')
        return false
      }
      setOverAge(null)
      flash(call.result.overAllocated ? t('cc_orders.fulfilment.over', 'Saved. The packed weight is more than the allocated stock; allocate more before despatch.') : success, call.result.overAllocated ? 'error' : 'success')
      notifyOrderChanged(orderId)
      return true
    } finally {
      setBusy(false)
    }
  }

  const findStock = async (line: Line) => {
    setPicking(line.lineId)
    setCandidates(null)
    const call = await apiCall<{ items: Candidate[] }>(`/api/cc_orders/orders/fulfilment?id=${orderId}&lineId=${line.lineId}`, undefined, { fallback: { items: [] } })
    const items = call.result?.items ?? []
    setCandidates(items)
    let left = line.short
    const proposal: Record<string, string> = {}
    for (const candidate of items) {
      if (left <= 0 || !candidate.matches || candidate.status !== 'available') continue
      const take = Math.min(left, candidate.free)
      proposal[candidate.lotId] = String(Math.round(take * 1000) / 1000)
      left -= take
    }
    setQty(proposal)
  }

  if (!data) return <Spinner />
  if (!['allocation', 'qc', 'packing', 'dispatch'].includes(stageKey)) return null

  return (
    <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">
          {stageKey === 'allocation' ? t('cc_orders.fulfilment.allocation', 'Stock for this order') : stageKey === 'qc' ? t('cc_orders.fulfilment.qc', 'Allocated lots and their checks') : stageKey === 'packing' ? t('cc_orders.fulfilment.weighment', 'Sheet weighment') : t('cc_orders.fulfilment.goingOut', 'What goes out')}
        </h4>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t('cc_orders.fulfilment.totals', 'ordered {o} · allocated {a} · packed {p} · despatched {d}', { o: num(data.totals.ordered), a: num(data.totals.allocated), p: num(data.totals.packed), d: num(data.totals.despatched) })}
        </span>
      </div>

      {stageKey === 'allocation'
        ? data.lines.map((line) => (
            <div key={line.lineId} className="space-y-2 rounded-md border border-border bg-background p-3">
              <LineHead line={line}>
                {num(line.allocated)} / {num(line.qty)} {line.unit}
                {line.short > 0 ? <span className="ml-2 text-status-warning-text">{t('cc_orders.fulfilment.short', 'short {n}', { n: num(line.short) })}</span> : <span className="ml-2 text-status-success-text">✓</span>}
                {line.made !== null ? <span className="ml-2 text-muted-foreground">{t('cc_orders.fulfilment.made', 'made {n}', { n: line.made })}</span> : null}
              </LineHead>
              {line.allocations.length ? (
                <ul className="space-y-1 text-xs">
                  {line.allocations.map((allocation) => (
                    <li key={allocation.id} className="flex items-center justify-between gap-2">
                      <span className="font-mono">
                        <Link className="underline-offset-2 hover:underline" href={`/backend/stock/lots/${allocation.lotId}`}>
                          {allocation.lotNumber}
                        </Link>
                        {allocation.lotStatus !== 'available' ? <span className="ml-1 text-status-error-text">({allocation.lotStatus})</span> : null}
                      </span>
                      <span className="flex items-center gap-2 tabular-nums">
                        {num(allocation.qty)} {line.unit}
                        {allocation.status === 'shipped' ? <span className="text-muted-foreground">{t('cc_orders.fulfilment.shipped', 'despatched')}</span> : null}
                        {allocation.status === 'reserved' && can('cc_orders.work.store') ? (
                          <button type="button" className="text-muted-foreground hover:text-foreground" disabled={busy} onClick={() => void post({ action: 'release', allocationId: allocation.id }, t('cc_orders.fulfilment.released', 'Released back to free stock.'))} aria-label={t('cc_orders.fulfilment.release', 'Release')}>
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {line.short > 0 && can('cc_orders.work.store') ? (
                picking === line.lineId ? (
                  !candidates ? (
                    <Spinner />
                  ) : !candidates.length ? (
                    <p className="text-xs text-muted-foreground">{t('cc_orders.fulfilment.noStock', 'No finished stock of this item. The short quantity shows on the production plan.')}</p>
                  ) : (
                    <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-muted-foreground">
                          <th className="py-1">{t('cc_orders.fulfilment.lot', 'Lot')}</th>
                          <th className="py-1">{t('cc_orders.fulfilment.sizeThickness', 'Size · thickness')}</th>
                          <th className="py-1 text-right">{t('cc_orders.fulfilment.free', 'Free')}</th>
                          <th className="w-24 py-1 text-right">{t('cc_orders.fulfilment.take', 'Take')}</th>
                          <th className="w-8" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {candidates.map((candidate) => (
                          <tr key={candidate.lotId} className={cn(!candidate.matches && 'text-muted-foreground')}>
                            <td className="py-1">
                              <Link className="font-mono underline-offset-2 hover:underline" href={`/backend/stock/lots/${candidate.lotId}`}>
                                {candidate.lotNumber}
                              </Link>
                              {candidate.forCustomer ? <span className="ml-1 rounded bg-status-success-bg px-1 text-status-success-text">{t('cc_orders.fulfilment.forThem', 'for this customer')}</span> : candidate.markedFor ? <span className="ml-1 text-muted-foreground">({candidate.markedFor})</span> : null}
                              {candidate.expiresOn ? <span className="ml-1">{t('cc_orders.fulfilment.useBy', 'use by {d}', { d: candidate.expiresOn })}</span> : null}
                              {candidate.status !== 'available' ? <span className="ml-1 text-status-error-text">{candidate.status}</span> : null}
                            </td>
                            <td className="py-1">{[candidate.sheetSize, candidate.thicknessMm ? `${candidate.thicknessMm} mm` : null, candidate.madeOn].filter(Boolean).join(' · ')}</td>
                            <td className="py-1 text-right tabular-nums">
                              {num(candidate.free)} {candidate.unit}
                              {candidate.nosLeft !== null && candidate.unit !== 'nos' ? ` · ${candidate.nosLeft} nos` : ''}
                            </td>
                            <td className="py-1">
                              <input className="h-7 w-full rounded border border-input bg-background px-1 text-right" inputMode="decimal" value={qty[candidate.lotId] ?? ''} onChange={(event) => setQty({ ...qty, [candidate.lotId]: event.target.value })} aria-label={`${candidate.lotNumber} take`} />
                            </td>
                            <td className="py-1 text-right">
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                disabled={busy || !Number(qty[candidate.lotId]) || candidate.status !== 'available'}
                                onClick={async () => {
                                  const reason = overAge?.lotId === candidate.lotId ? overAge.reason.trim() : ''
                                  if (overAge?.lotId === candidate.lotId && !reason) return
                                  if (await post({ action: 'allocate', lineId: line.lineId, lotId: candidate.lotId, qty: Number(qty[candidate.lotId]), ...(reason ? { reason } : {}) }, t('cc_orders.fulfilment.allocated', 'Allocated and held for this order.'))) setPicking(null)
                                }}
                                aria-label={t('cc_orders.fulfilment.allocate', 'Allocate')}
                              >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                        {overAge && candidates.some((candidate) => candidate.lotId === overAge.lotId) ? (
                          <tr>
                            <td colSpan={5} className="py-2">
                              <div className="space-y-1.5 rounded-md border border-status-warning-border bg-status-warning-bg p-2 text-status-warning-text">
                                <p className="text-xs font-medium">{overAge.message}</p>
                                <input
                                  className="h-8 w-full rounded border border-input bg-background px-2 text-sm text-foreground"
                                  placeholder={t('cc_orders.fulfilment.overAgeHint', 'e.g. Customer agreed after a press trial; priced lower')}
                                  aria-label={t('cc_orders.fulfilment.overAgeReason', 'Reason to sell an old B-stage lot')}
                                  value={overAge.reason}
                                  onChange={(event) => setOverAge({ ...overAge, reason: event.target.value })}
                                />
                                <p className="text-xs">{t('cc_orders.fulfilment.overAgeThen', 'Then press + again. The reason is kept on the order.')}</p>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                    </div>
                  )
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => void findStock(line)}>
                    <Search className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    {t('cc_orders.fulfilment.find', 'Find stock')}
                  </Button>
                )
              ) : null}
            </div>
          ))
        : null}

      {stageKey === 'qc' ? (
        <div className="space-y-2">
          {data.qc.lots.length ? (
            <ul className="space-y-1 text-xs">
              {data.qc.lots.map((lot) => (
                <li key={lot.allocationId} className="flex flex-wrap justify-between gap-2">
                  <Link className="font-mono underline-offset-2 hover:underline" href={`/backend/stock/lots/${lot.lotId}`}>
                    {lot.lotNumber}
                  </Link>
                  <span className={cn(lot.status !== 'available' && 'text-status-error-text')}>
                    {lot.status !== 'available' ? `${lot.status} · ` : ''}
                    {lot.boughtIn ? t('cc_orders.fulfilment.boughtIn', 'bought-in') : `${t('cc_orders.fulfilment.thickness', 'thickness')} ${lot.thickness?.result ?? '—'}`} · FG {lot.fgInspected ? '✓' : '—'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{t('cc_orders.fulfilment.nothingAllocated', 'Nothing is allocated yet.')}</p>
          )}
          <div className="space-y-1 border-t pt-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">{t('cc_orders.fulfilment.labTests', 'Lab test reports for this order')}</p>
              {can('cc_production.quality.enter') ? (
                <Link className="inline-flex items-center gap-1 text-xs text-primary hover:underline" href={`/backend/quality/lab/new?orderId=${orderId}`}>
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  {t('cc_orders.fulfilment.addLabTest', 'Add lab test')}
                </Link>
              ) : null}
            </div>
            {data.qc.labTests?.length ? (
              <ul className="space-y-1 text-xs">
                {data.qc.labTests.map((test) => (
                  <li key={test.id} className="flex flex-wrap justify-between gap-2">
                    <Link className="underline-offset-2 hover:underline" href={`/backend/quality/lab/${test.id}`}>
                      {test.testType}
                      {test.standard ? ` · ${test.standard}` : ''}
                      {test.reportNo ? ` · ${test.reportNo}` : ''}
                    </Link>
                    <span className={cn(test.result === 'pass' ? 'text-status-success-text' : test.result === 'fail' ? 'text-status-error-text' : 'text-muted-foreground')}>{test.result}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">{t('cc_orders.fulfilment.noLabTests', 'No lab test linked yet. A passed test ticks "Customer tests done".')}</p>
            )}
          </div>
          {data.onHold.length ? <p className="text-xs text-status-error-text">{t('cc_orders.fulfilment.holdBlocks', 'QC cannot be completed while these lots are on hold: {lots}', { lots: data.onHold.join(', ') })}</p> : null}
          {can('cc_orders.work.qc') && data.qc.lots.length ? (
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void post({ action: 'qc_sync' }, t('cc_orders.fulfilment.qcRead', 'Steps ticked from the thickness and FG inspections.'))}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t('cc_orders.fulfilment.readQc', 'Read from the inspections')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {stageKey === 'packing'
        ? data.lines.map((line) => {
            const list = weights[line.lineId] ?? []
            const total = list.reduce((sum, value) => sum + (Number(value) || 0), 0)
            const rows = Math.ceil(Math.max(list.length, 5) / 5)
            return (
              <div key={line.lineId} className="space-y-2 rounded-md border border-border bg-background p-3">
                <LineHead line={line}>
                  {t('cc_orders.fulfilment.allocatedPacked', 'allocated {a} · packed {p} {unit}', { a: num(line.allocated), p: num(line.packed), unit: line.unit })}
                </LineHead>
                {line.unit === 'nos' ? (
                  <div className="flex items-center gap-2">
                    <Input className="h-8 w-28 text-right" inputMode="numeric" value={pieces[line.lineId] ?? ''} disabled={!can('cc_orders.work.dispatch')} onChange={(event) => setPieces({ ...pieces, [line.lineId]: event.target.value })} aria-label={`${line.title} pieces`} />
                    <span className="text-xs text-muted-foreground">{t('cc_orders.fulfilment.pieces', 'pieces packed')}</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {Array.from({ length: rows }, (_, row) => (
                      <div key={row} className="grid grid-cols-6 gap-1">
                        {Array.from({ length: 5 }, (_, column) => {
                          const index = row * 5 + column
                          return (
                            <input
                              key={index}
                              className="h-7 rounded border border-input bg-background px-1 text-right font-mono text-xs disabled:bg-transparent"
                              inputMode="decimal"
                              disabled={!can('cc_orders.work.dispatch')}
                              value={list[index] ?? ''}
                              onChange={(event) => {
                                const next = [...list]
                                while (next.length <= index) next.push('')
                                next[index] = event.target.value
                                setWeights({ ...weights, [line.lineId]: next })
                              }}
                              aria-label={`${line.title} sheet ${index + 1}`}
                            />
                          )
                        })}
                        <span className="self-center text-right font-mono text-xs tabular-nums text-muted-foreground">{num(list.slice(row * 5, row * 5 + 5).reduce((sum, value) => sum + (Number(value) || 0), 0))}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between text-xs">
                      {can('cc_orders.work.dispatch') ? (
                        <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setWeights({ ...weights, [line.lineId]: [...list, '', '', '', '', ''] })}>
                          + {t('cc_orders.fulfilment.row', 'row of 5')}
                        </button>
                      ) : (
                        <span />
                      )}
                      <span className="font-mono font-semibold tabular-nums">
                        {list.filter((value) => Number(value) > 0).length} {t('cc_orders.fulfilment.sheets', 'sheets')} · {num(total)} kg
                      </span>
                    </div>
                  </div>
                )}
                {can('cc_orders.work.dispatch') ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void post({ action: 'pack', lineId: line.lineId, weights: list.map((value) => Number(value) || 0).filter((value) => value > 0), pieces: line.unit === 'nos' ? Number(pieces[line.lineId] || 0) : null }, t('cc_orders.fulfilment.weighedOk', 'Weights saved.'))}
                  >
                    <Scale className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    {t('cc_orders.fulfilment.saveWeights', 'Save weights')}
                  </Button>
                ) : null}
              </div>
            )
          })
        : null}
      {stageKey === 'packing' && can('cc_orders.work.dispatch') ? (
        <Button type="button" size="sm" disabled={busy || data.lines.some((line) => line.packed === null)} onClick={() => void post({ action: 'packed' }, t('cc_orders.fulfilment.packedOk', 'Marked packed.'))}>
          <PackageCheck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          {t('cc_orders.fulfilment.markPacked', 'All packed')}
        </Button>
      ) : null}

      {stageKey === 'dispatch' ? (
        <ul className="space-y-1 text-xs">
          {data.lines.map((line) => (
            <li key={line.lineId} className="flex flex-wrap justify-between gap-2">
              <span>{line.title}</span>
              <span className="tabular-nums">
                {line.despatched > 0
                  ? t('cc_orders.fulfilment.wentOut', '{n} {unit} despatched', { n: num(line.despatched), unit: line.unit })
                  : t('cc_orders.fulfilment.willGo', '{n} {unit} will go out from {lots}', { n: num(line.packed ?? line.allocated), unit: line.unit, lots: line.allocations.filter((row) => row.status === 'reserved').map((row) => row.lotNumber).join(', ') || '—' })}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

export function LineProgress({ orderId }: { orderId: string }) {
  const t = useT()
  const [data, setData] = React.useState<Fulfilment | null>(null)
  const load = React.useCallback(async () => {
    const call = await apiCall<Fulfilment>(`/api/cc_orders/orders/fulfilment?id=${orderId}`)
    setData(call.ok ? (call.ok ? (call.result ?? null) : null) : null)
  }, [orderId])
  React.useEffect(() => {
    void load()
  }, [load])
  useOrderChanged(orderId, () => void load())
  if (!data || !data.lines.length) return null
  return (
    <section className="mb-4 rounded-lg border border-border bg-card p-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('cc_orders.fulfilment.progress', 'Line progress')}</h4>
      <ul className="space-y-1.5">
        {data.lines.map((line) => (
          <li key={line.lineId} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span>
              <span className="font-medium">{line.title}</span>
              <span className="ml-2 text-xs text-muted-foreground">{spec(line)}</span>
            </span>
            <span className="text-xs tabular-nums">
              {num(line.qty)} {line.unit} · {t('cc_orders.fulfilment.allocatedShort', 'allocated {n}', { n: num(line.allocated) })}
              {line.made !== null ? ` · ${t('cc_orders.fulfilment.made', 'made {n}', { n: line.made })}` : ''}
              {line.packed !== null ? ` · ${t('cc_orders.fulfilment.packedShort', 'packed {n}', { n: num(line.packed) })}` : ''}
              {line.despatched ? ` · ${t('cc_orders.fulfilment.despatchedShort', 'despatched {n}', { n: num(line.despatched) })}` : ''}
              {line.short > 0 ? <span className="ml-1 text-status-warning-text">· {t('cc_orders.fulfilment.short', 'short {n}', { n: num(line.short) })}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
