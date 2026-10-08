"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ExternalLink, LayoutGrid, RotateCcw, Send, Trash2, TriangleAlert } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { sheetFigures } from '../../lib/coatingFigures'
import { kg, todayIso } from '../resin/shared'
import { SHEET_STATUS, paperTime, type CoatingSetup, type SheetListItem, type SheetView } from './shared'

const ROWS = 10

type RowDraft = { clothProductId: string; gsm: string; kushan: string; treatedWeight: string; rawKg: string; balanceRawKg: string; coatedNos: string; resinLotId: string; rcPct: string; vcPct: string }
type SlotDraft = { time: string; dbpKg: string; oleicKg: string; outputKg: string }

const EMPTY_ROW: RowDraft = { clothProductId: '', gsm: '', kushan: '', treatedWeight: '', rawKg: '', balanceRawKg: '', coatedNos: '', resinLotId: '', rcPct: '', vcPct: '' }
const text = (value: number | string | null | undefined) => (value === null || value === undefined ? '' : String(value))
const num = (value: string): number | null => {
  const trimmed = value.trim().replace(/,/g, '')
  if (!trimmed) return null
  if (/^(nil|-|—)$/i.test(trimmed)) return 0
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function draftFrom(sheet: SheetView | null, slots: string[]): { rows: RowDraft[]; slots: SlotDraft[]; notes: string } {
  const rows: RowDraft[] = Array.from({ length: ROWS }, () => ({ ...EMPTY_ROW }))
  for (const row of sheet?.rows ?? []) {
    const index = row.sn - 1
    if (index < 0) continue
    while (rows.length <= index) rows.push({ ...EMPTY_ROW })
    rows[index] = {
      clothProductId: row.clothProductId,
      gsm: text(row.gsm),
      kushan: text(row.kushan),
      treatedWeight: text(row.treatedWeight),
      rawKg: text(row.rawKg),
      balanceRawKg: row.balanceRawKg ? text(row.balanceRawKg) : '',
      coatedNos: text(row.coatedNos),
      resinLotId: row.resinLotId ?? '',
      rcPct: text(row.rcPct),
      vcPct: text(row.vcPct),
    }
  }
  const slotDrafts = (sheet?.slots.length ? sheet.slots : slots.map((time) => ({ time, dbpKg: null, oleicKg: null, outputKg: null }))).map((slot) => ({ time: slot.time, dbpKg: text(slot.dbpKg), oleicKg: text(slot.oleicKg), outputKg: text(slot.outputKg) }))
  return { rows, slots: slotDrafts, notes: sheet?.notes ?? '' }
}

function used(row: RowDraft): boolean {
  return Boolean(row.clothProductId || row.rawKg.trim() || row.coatedNos.trim())
}

export function CoatingDayPage() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const granted = useGranted()
  const canEnter = granted.has('cc_production.coating.enter')
  const { runMutation } = useGuardedMutation({ contextId: 'cc-coating-day' })
  const [setup, setSetup] = React.useState<CoatingSetup | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [date, setDate] = React.useState(params?.get('date') ?? todayIso())
  const [dryerId, setDryerId] = React.useState(params?.get('dryer') ?? '')
  const [daySheets, setDaySheets] = React.useState<SheetListItem[]>([])
  const [sheet, setSheet] = React.useState<SheetView | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [draft, setDraft] = React.useState<ReturnType<typeof draftFrom> | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    void apiCall<CoatingSetup>('/api/cc_production/coating/setup').then((call) => {
      if (!call.ok || !call.result) {
        setError(t('cc_production.coating.setupError', 'Could not load dryers and cloths.'))
        return
      }
      setSetup(call.result)
      setDryerId((current) => current || call.result!.dryers[0]?.id || '')
    })
  }, [t])

  const load = React.useCallback(async () => {
    if (!setup || !dryerId) return
    setLoading(true)
    router.replace(`/backend/coating?date=${date}&dryer=${dryerId}`)
    const list = await apiCall<{ items: SheetListItem[] }>(`/api/cc_production/coating/sheets?date=${date}`, undefined, { fallback: { items: [] } })
    const items = list.result?.items ?? []
    setDaySheets(items)
    const current = items.find((item) => item.dryerId === dryerId)
    let view: SheetView | null = null
    if (current) {
      const call = await apiCall<SheetView>(`/api/cc_production/coating/sheets?id=${current.id}`)
      view = call.result ?? null
    }
    setSheet(view)
    setDraft(draftFrom(view, setup.slots))
    setLoading(false)
  }, [setup, dryerId, date, router])

  React.useEffect(() => {
    void load()
  }, [load])

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>

  const locked = !canEnter || sheet?.status === 'posted'
  const clothById = new Map((setup?.cloths ?? []).map((cloth) => [cloth.id, cloth]))
  const filledRows = (draft?.rows ?? []).map((row, index) => ({ row, sn: index + 1 })).filter((entry) => used(entry.row))
  const figures = draft
    ? sheetFigures(
        filledRows.map(({ row, sn }) => ({ sn, rawKg: num(row.rawKg) ?? 0, balanceRawKg: num(row.balanceRawKg) ?? 0, coatedNos: num(row.coatedNos) ?? 0, treatedWeight: num(row.treatedWeight), kushan: num(row.kushan), rcPct: num(row.rcPct) })),
        draft.slots.map((slot) => ({ time: slot.time, dbpKg: num(slot.dbpKg), oleicKg: num(slot.oleicKg), outputKg: num(slot.outputKg) })),
      )
    : null
  const outOfBand = (value: string, band: { min: number; max: number }) => {
    const parsed = num(value)
    return parsed !== null && (parsed < band.min || parsed > band.max)
  }

  const updateRow = (index: number, patch: Partial<RowDraft>) => {
    if (!draft) return
    const rows = draft.rows.map((row, position) => (position === index ? { ...row, ...patch } : row))
    if (patch.clothProductId) {
      const cloth = clothById.get(patch.clothProductId)
      if (cloth?.gsm && !rows[index].gsm) rows[index] = { ...rows[index], gsm: String(cloth.gsm) }
    }
    setDraft({ ...draft, rows })
  }
  const updateSlot = (index: number, patch: Partial<SlotDraft>) => draft && setDraft({ ...draft, slots: draft.slots.map((slot, position) => (position === index ? { ...slot, ...patch } : slot)) })

  const payload = () => ({
    sheetDate: date,
    dryerId,
    rows: (draft?.rows ?? [])
      .map((row, index) => ({ row, sn: index + 1 }))
      .filter((entry) => used(entry.row))
      .map(({ row, sn }) => ({
        sn,
        clothProductId: row.clothProductId,
        gsm: num(row.gsm),
        kushan: num(row.kushan),
        treatedWeight: num(row.treatedWeight),
        rawKg: num(row.rawKg) ?? 0,
        balanceRawKg: num(row.balanceRawKg),
        coatedNos: num(row.coatedNos) ?? 0,
        resinLotId: row.resinLotId || null,
        rcPct: num(row.rcPct),
        vcPct: num(row.vcPct),
      })),
    slots: (draft?.slots ?? []).map((slot) => ({ time: slot.time, dbpKg: num(slot.dbpKg), oleicKg: num(slot.oleicKg), outputKg: num(slot.outputKg) })),
    notes: draft?.notes.trim() || null,
  })

  const send = async <T,>(path: string, method: 'POST' | 'PUT', body: Record<string, unknown>, updatedAt: string | null) =>
    runMutation({
      context: { sheetId: sheet?.id ?? null },
      mutationPayload: body,
      operation: () =>
        withScopedApiRequestHeaders(updatedAt ? buildOptimisticLockHeader(updatedAt) : {}, () =>
          apiCall<T & { error?: string }>(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
        ),
    })

  const save = async (post: boolean) => {
    const body = payload()
    if (body.rows.some((row) => !row.clothProductId)) {
      flash(t('cc_production.coating.pickCloth', 'Pick the cloth name on every row you filled'), 'error')
      return
    }
    setBusy(true)
    try {
      const saved = await send<SheetView>('/api/cc_production/coating/sheets', sheet ? 'PUT' : 'POST', sheet ? { ...body, id: sheet.id } : body, sheet?.updatedAt ?? null)
      if (!saved.ok || !saved.result || saved.result.error) {
        flash(saved.result?.error ?? t('cc_production.coating.saveError', 'Could not save the sheet.'), 'error')
        return
      }
      let view = saved.result
      if (post) {
        const posted = await send<SheetView>('/api/cc_production/coating/sheets/action', 'POST', { id: view.id, action: 'post' }, view.updatedAt)
        if (!posted.ok || !posted.result || posted.result.error) {
          flash(posted.result?.error ?? t('cc_production.coating.postError', 'Saved, but could not post.'), 'error')
          await load()
          return
        }
        view = posted.result
        flash(t('cc_production.coating.posted', 'Posted. Raw cloth and resin are out of stock; the B-stage lots are on the board.'), 'success')
      } else {
        flash(t('cc_production.coating.saved', 'Saved.'), 'success')
      }
      await load()
    } finally {
      setBusy(false)
    }
  }

  const act = async (action: 'reopen' | 'delete') => {
    if (!sheet) return
    setBusy(true)
    try {
      const call = await send<SheetView>('/api/cc_production/coating/sheets/action', 'POST', { id: sheet.id, action }, sheet.updatedAt)
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_production.coating.actionError', 'Could not do that.'), 'error')
        return
      }
      flash(action === 'reopen' ? t('cc_production.coating.reopened', 'Reopened. The stock movements are reversed.') : t('cc_production.coating.deleted', 'Sheet deleted.'), 'success')
      await load()
    } finally {
      setBusy(false)
    }
  }

  const cell = 'h-8 w-full min-w-0 rounded border border-input bg-background px-1.5 text-right text-sm tabular-nums disabled:border-transparent disabled:bg-transparent'

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-7xl flex-col gap-5 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('cc_production.coating.eyebrow', 'Coating · Quality Control Report')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.coating.title', 'Dryer sheets')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {t('cc_production.coating.lede', 'One sheet per dryer per day, as on paper. Posting takes the raw cloth (raw − balance) and the resin out of stock and puts one B-stage lot per row on the shop floor, with its 7-day clock.')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input type="date" className="w-44" value={date} onChange={(event) => setDate(event.target.value)} aria-label={t('cc_production.resin.date', 'Date')} />
              <Button asChild variant="outline">
                <Link href="/backend/bstage">
                  <LayoutGrid className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.coating.board', 'B-stage board')}
                </Link>
              </Button>
            </div>
          </header>

          <nav className="flex flex-wrap gap-1 border-b border-border" aria-label={t('cc_production.coating.dryers', 'Dryers')}>
            {(setup?.dryers ?? []).map((dryer) => {
              const existing = daySheets.find((item) => item.dryerId === dryer.id)
              const active = dryer.id === dryerId
              return (
                <button
                  key={dryer.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setDryerId(dryer.id)}
                  className={cn('-mb-px flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors', active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}
                >
                  {dryer.code}
                  {existing ? <span className={cn('h-2 w-2 rounded-full', existing.status === 'posted' ? 'bg-status-success-icon' : 'bg-status-warning-icon')} aria-hidden="true" /> : null}
                </button>
              )
            })}
          </nav>

          {loading || !draft || !setup ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3">
                {sheet ? (
                  <StatusBadge variant={SHEET_STATUS[sheet.status].variant} dot>
                    {SHEET_STATUS[sheet.status].label}
                  </StatusBadge>
                ) : (
                  <span className="text-sm text-muted-foreground">{t('cc_production.coating.newSheet', 'No sheet yet for this dryer and day.')}</span>
                )}
                {sheet ? (
                  <Link href={`/backend/coating/${sheet.id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('cc_production.coating.openSheet', 'Sheet page, lots and history')}
                  </Link>
                ) : null}
              </div>

              {sheet?.warnings.length ? (
                <Alert variant="warning">
                  <TriangleAlert className="h-4 w-4" aria-hidden="true" />
                  <AlertTitle>{t('cc_production.coating.warnings', 'Check these')}</AlertTitle>
                  <AlertDescription>
                    <ul className="list-disc pl-4">
                      {sheet.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : null}

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
                <section className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm xl:col-span-3">
                  <table className="w-full min-w-240 text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="w-8 px-2 py-2 text-left">S.N.</th>
                        <th className="w-36 px-1 py-2 text-left">{t('cc_production.coating.cloth', 'Cloth name')}</th>
                        <th className="w-16 px-1 py-2 text-right">GSM</th>
                        <th className="w-20 px-1 py-2 text-right" title={t('cc_production.coating.kushanHint', 'Sample weight before treating')}>Kushan</th>
                        <th className="w-20 px-1 py-2 text-right" title={t('cc_production.coating.treatedHint', 'Sample weight after coating')}>{t('cc_production.coating.treated', 'Treated')}</th>
                        <th className="w-20 px-1 py-2 text-right">{t('cc_production.coating.raw', 'Raw kg')}</th>
                        <th className="w-20 px-1 py-2 text-right">{t('cc_production.coating.balance', 'Balance')}</th>
                        <th className="w-16 px-1 py-2 text-right">{t('cc_production.coating.nos', 'Nos')}</th>
                        <th className="w-40 px-1 py-2 text-left">{t('cc_production.coating.resin', 'Resine type / batch')}</th>
                        <th className="w-14 px-1 py-2 text-right">RC %</th>
                        <th className="w-14 px-1 py-2 text-right">VC %</th>
                        <th className="w-24 px-2 py-2 text-right">{t('cc_production.coating.bstageKg', 'B-stage kg')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {draft.rows.map((row, index) => {
                        const sn = index + 1
                        const figure = figures?.rows.find((entry) => entry.sn === sn)
                        const posted = sheet?.rows.find((entry) => entry.sn === sn)
                        return (
                          <tr key={sn}>
                            <td className="px-2 py-1 font-mono text-xs text-muted-foreground">{sn}</td>
                            <td className="px-1 py-1">
                              <select className="h-8 w-full rounded border border-input bg-background px-1 text-sm disabled:border-transparent disabled:bg-transparent" disabled={locked} value={row.clothProductId} onChange={(event) => updateRow(index, { clothProductId: event.target.value })} aria-label={`${sn} cloth`}>
                                <option value="" />
                                {setup.cloths.map((cloth) => (
                                  <option key={cloth.id} value={cloth.id}>
                                    {cloth.title}
                                  </option>
                                ))}
                              </select>
                            </td>
                            {(['gsm', 'kushan', 'treatedWeight', 'rawKg', 'balanceRawKg', 'coatedNos'] as Array<keyof RowDraft>).map((key) => (
                              <td key={key} className="px-1 py-1">
                                <input className={cell} disabled={locked} inputMode="decimal" placeholder={key === 'balanceRawKg' && used(row) ? 'NIL' : ''} value={row[key]} onChange={(event) => updateRow(index, { [key]: event.target.value })} aria-label={`${sn} ${key}`} />
                              </td>
                            ))}
                            <td className="px-1 py-1">
                              <select className="h-8 w-full rounded border border-input bg-background px-1 text-xs disabled:border-transparent disabled:bg-transparent" disabled={locked} value={row.resinLotId} onChange={(event) => updateRow(index, { resinLotId: event.target.value })} aria-label={`${sn} resin`}>
                                <option value="">{used(row) ? t('cc_production.coating.oldestResin', 'P.F. · oldest in tank') : ''}</option>
                                {setup.resinLots.map((lot) => (
                                  <option key={lot.lotId} value={lot.lotId}>
                                    {lot.grade ?? 'P.F.'} · {lot.lotNumber} · {kg(lot.free)} kg
                                  </option>
                                ))}
                                {posted?.resinLotId && !setup.resinLots.some((lot) => lot.lotId === posted.resinLotId) ? <option value={posted.resinLotId}>{posted.resinBatchNo}</option> : null}
                              </select>
                              {posted?.resinBatchNo && sheet?.status === 'posted' ? <p className="px-1 text-xs text-muted-foreground">{posted.resinBatchNo}</p> : null}
                            </td>
                            <td className="px-1 py-1">
                              <input className={cn(cell, outOfBand(row.rcPct, setup.bands.rc) && 'border-status-warning-border text-status-warning-text')} disabled={locked} inputMode="decimal" value={row.rcPct} onChange={(event) => updateRow(index, { rcPct: event.target.value })} aria-label={`${sn} RC`} />
                            </td>
                            <td className="px-1 py-1">
                              <input className={cn(cell, outOfBand(row.vcPct, setup.bands.vc) && 'border-status-warning-border text-status-warning-text')} disabled={locked} inputMode="decimal" value={row.vcPct} onChange={(event) => updateRow(index, { vcPct: event.target.value })} aria-label={`${sn} VC`} />
                            </td>
                            <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                              {posted?.bstageLotNumber && sheet?.status === 'posted' ? (
                                <Link className="block font-mono text-xs text-foreground underline-offset-2 hover:underline" href={`/backend/bstage/lots/${posted.bstageLotId}`}>
                                  {posted.bstageLotNumber}
                                </Link>
                              ) : null}
                              {figure ? kg(figure.bstageKg) : ''}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold tabular-nums">
                        <td colSpan={5} className="px-2 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                          {t('cc_production.coating.totals', 'Totals')}
                        </td>
                        <td className="px-1 py-2 text-right">{kg(figures?.rawTotal ?? 0)}</td>
                        <td className="px-1 py-2 text-right">{figures?.balanceTotal ? kg(figures.balanceTotal) : ''}</td>
                        <td className="px-1 py-2 text-right">{figures?.nosTotal ?? 0}</td>
                        <td className="px-1 py-2 text-xs font-normal text-muted-foreground" colSpan={3}>
                          {t('cc_production.coating.resinUsed', 'Resin {kg} kg', { kg: kg(figures?.resinTotal ?? 0) })}
                        </td>
                        <td className="px-2 py-2 text-right">{kg(figures?.bstageTotal ?? 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </section>

                <section className="rounded-xl border border-border bg-card shadow-sm">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-2 py-2 text-left">{t('cc_production.coating.time', 'Time')}</th>
                        <th className="px-1 py-2 text-right">DBP</th>
                        <th className="px-1 py-2 text-right">{t('cc_production.coating.oleic', 'Olic acid')}</th>
                        <th className="px-2 py-2 text-right">{t('cc_production.coating.remarks', 'Remarks (kg)')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {draft.slots.map((slot, index) => (
                        <tr key={`${slot.time}-${index}`}>
                          <td className="px-2 py-1 font-mono text-xs">{paperTime(slot.time)}</td>
                          {(['dbpKg', 'oleicKg', 'outputKg'] as Array<keyof SlotDraft>).map((key) => (
                            <td key={key} className="px-1 py-1">
                              <input className={cell} disabled={locked} inputMode="decimal" value={slot[key]} onChange={(event) => updateSlot(index, { [key]: event.target.value })} aria-label={`${slot.time} ${key}`} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border font-semibold tabular-nums">
                        <td className="px-2 py-2 text-xs uppercase tracking-wide text-muted-foreground">{t('cc_production.coating.day', 'Day')}</td>
                        <td className="px-1 py-2 text-right">{figures?.dbpTotal ? kg(figures.dbpTotal) : ''}</td>
                        <td className="px-1 py-2 text-right">{figures?.oleicTotal ? kg(figures.oleicTotal) : ''}</td>
                        <td className="px-2 py-2 text-right">{kg(figures?.outputTotal ?? 0)}</td>
                      </tr>
                    </tfoot>
                  </table>
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    {figures?.outputTotal
                      ? t('cc_production.coating.split', "The day's output is shared across the rows by raw kg × treated ÷ Kushan.")
                      : t('cc_production.coating.noOutput', 'No output written yet: B-stage kg is estimated from raw kg and RC %.')}
                  </p>
                </section>
              </div>

              {canEnter ? (
                <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
                  {sheet?.status === 'posted' ? (
                    <Button type="button" variant="outline" disabled={busy} onClick={() => void act('reopen')}>
                      <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('cc_production.resin.reopen', 'Reopen')}
                    </Button>
                  ) : (
                    <>
                      {sheet ? (
                        <Button type="button" variant="outline" disabled={busy} onClick={() => void act('delete')}>
                          <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          {t('cc_production.coating.delete', 'Delete sheet')}
                        </Button>
                      ) : null}
                      <Button type="button" variant="outline" disabled={busy} onClick={() => void save(false)}>
                        {t('cc_production.resin.save', 'Save')}
                      </Button>
                      <Button type="button" disabled={busy} onClick={() => void save(true)}>
                        <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                        {t('cc_production.resin.saveAndPost', 'Save and post')}
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default CoatingDayPage
