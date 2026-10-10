"use client"

import * as React from 'react'
import { PauseCircle, RotateCcw, Scissors, Ruler } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { day, kg, thisMonth, todayIso } from '../resin/shared'
import { lotLabel, selectClass, useSend, useSetup } from './shared'
import { OfflineBadge, isOffline, queueSave } from '../offline'
import { PlantTable } from '../PlantTable'
import { Dropdown } from '../../../cc_lists/components/Dropdown'
import { recordHref } from '../../../cc_ui/lib/links'
import { CorrectDialog } from '../../../cc_ui/components/CorrectDialog'

type Cutting = { id: string; entryDate: string; sourceLotNumber: string | null; sheetsIn: number; sourceKgUsed: number; cutSize: string; trimmedKg: number; trimKg: number; trimPct: number; outputLotNumber: string | null; status: string; warnings: string[]; updatedAt: string }

function Header({ eyebrow, title, lede, month, setMonth }: { eyebrow: string; title: string; lede: string; month: string; setMonth: (value: string) => void }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1">
        <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{eyebrow}</p>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">{lede}</p>
      </div>
      <Input type="month" className="w-44" value={month} onChange={(event) => setMonth(event.target.value)} aria-label="Month" />
    </header>
  )
}

export function CuttingPage() {
  const t = useT()
  const granted = useGranted()
  const send = useSend('cc-cutting')
  const { setup, reload } = useSetup()
  const [month, setMonth] = React.useState(thisMonth())
  const [items, setItems] = React.useState<Cutting[]>([])
  const [form, setForm] = React.useState({ entryDate: todayIso(), lotId: '', cutSize: '8x4', weights: '' })
  const [busy, setBusy] = React.useState(false)
  const [reversing, setReversing] = React.useState<Cutting | null>(null)

  const load = React.useCallback(async () => {
    const call = await apiCall<{ items: Cutting[] }>(`/api/cc_production/cutting?month=${month}`, undefined, { fallback: { items: [] } })
    setItems(call.result?.items ?? [])
  }, [month])
  React.useEffect(() => {
    void load()
  }, [load])

  const lots = (setup?.floorLots ?? []).filter((lot) => lot.kind === 'laminate')
  const lot = lots.find((entry) => entry.lotId === form.lotId)
  const weights = form.weights
    .split(/[\s,;]+/)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
  const trimmed = weights.reduce((sum, value) => sum + value, 0)
  const used = lot ? (lot.nosLeft && weights.length >= lot.nosLeft ? lot.free : lot.nosLeft ? (lot.free * weights.length) / lot.nosLeft : 0) : 0
  const trimPct = used ? Math.round(((used - trimmed) / used) * 1000) / 10 : null
  const band = setup?.trimBand.laminate ?? { min: 6, max: 10 }

  const submit = async () => {
    if (!lot || !weights.length) {
      flash(t('cc_production.cutting.fill', 'Pick the pressed lot and enter each sheet weight'), 'error')
      return
    }
    setBusy(true)
    try {
      const result = await send<Cutting>('/api/cc_production/cutting', 'POST', { entryDate: form.entryDate, lotId: lot.lotId, cutSize: form.cutSize, sheets: weights.map((weightKg, index) => ({ no: index + 1, weightKg })) })
      if (result) {
        flash(t('cc_production.cutting.done', 'Saved. Trimmed lot {lot} is on the shop floor.', { lot: result.outputLotNumber ?? '' }), 'success')
        setForm({ ...form, lotId: '', weights: '' })
        await Promise.all([load(), reload()])
      }
    } finally {
      setBusy(false)
    }
  }

  const reverse = async (cut: Cutting, reason: string) => {
    const result = await send<{ ok: boolean }>('/api/cc_production/cutting/reverse', 'POST', { id: cut.id, reason }, cut.updatedAt)
    if (result) {
      flash(t('cc_production.cutting.reversed', 'Reversed. The sheets are back in the pressed lot.'), 'success')
      await Promise.all([load(), reload()])
    }
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-12">
          <Header eyebrow={t('cc_production.cutting.eyebrow', 'Finishing')} title={t('cc_production.cutting.title', 'Cutting & trimming')} lede={t('cc_production.cutting.lede', 'Sheets from a pressed lot are trimmed, cut to size, numbered and weighed. The trimmed lot goes on to thickness and FG inspection; the trim loss leaves stock. (No paper form was photographed; confirm what is written today.)')} month={month} setMonth={setMonth} />
          {granted.has('cc_production.cutting.enter') ? (
            <section className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm md:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="cut-date">{t('cc_production.resin.date', 'Date')}</Label>
                <Input id="cut-date" type="date" value={form.entryDate} onChange={(event) => setForm({ ...form, entryDate: event.target.value })} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <Label htmlFor="cut-lot">{t('cc_production.cutting.lot', 'Pressed lot (batch + thickness)')}</Label>
                <Dropdown id="cut-lot" value={form.lotId} onChange={(event) => setForm({ ...form, lotId: event.target.value })}>
                  <option value="" />
                  {lots.map((entry) => (
                    <option key={entry.lotId} value={entry.lotId}>
                      {lotLabel(entry)}
                    </option>
                  ))}
                </Dropdown>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cut-size">{t('cc_production.cutting.size', 'Cut size')}</Label>
                <Input id="cut-size" list="cut-sizes" value={form.cutSize} onChange={(event) => setForm({ ...form, cutSize: event.target.value })} />
                <datalist id="cut-sizes">
                  {(setup?.cutSizes ?? []).map((size) => (
                    <option key={size} value={size} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5 md:col-span-4">
                <Label htmlFor="cut-weights">{t('cc_production.cutting.weights', 'Sheet weights after trimming (kg, in sheet order; paste a column or separate by spaces)')}</Label>
                <textarea id="cut-weights" rows={3} className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm" value={form.weights} onChange={(event) => setForm({ ...form, weights: event.target.value })} placeholder="108.400 109.100 108.900" />
              </div>
              <div className="flex flex-wrap items-center gap-6 text-sm md:col-span-3">
                <span>
                  {t('cc_production.cutting.sheets', 'Sheets')}: <b>{weights.length}</b>
                  {lot?.nosLeft != null ? ` of ${lot.nosLeft}` : ''}
                </span>
                <span>
                  {t('cc_production.cutting.trimmed', 'Trimmed')}: <b className="tabular-nums">{kg(trimmed)} kg</b>
                </span>
                <span>
                  {t('cc_production.cutting.used', 'From the lot')}: <b className="tabular-nums">{kg(used)} kg</b>
                </span>
                <span className={cn(trimPct !== null && (trimPct < band.min || trimPct > band.max) && 'font-semibold text-status-warning-text')}>
                  {t('cc_production.cutting.loss', 'Trim loss')}: {trimPct === null ? '—' : `${kg(used - trimmed)} kg · ${trimPct}%`}
                </span>
              </div>
              <div className="flex justify-end">
                <Button type="button" disabled={busy} onClick={() => void submit()}>
                  <Scissors className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.resin.save', 'Save')}
                </Button>
              </div>
            </section>
          ) : null}
          <PlantTable
            tableId="cc_production.cutting"
            rows={items}
            rowKey={(cut) => cut.id}
            rowHref={(cut) => recordHref.cutting(cut.id)}
            empty={<EmptyState className="py-12" variant="subtle" icon={<Scissors className="h-5 w-5" aria-hidden="true" />} title={t('cc_production.cutting.empty', 'No cutting this month')} />}
            columns={[
              { key: 'date', label: t('cc_production.resin.date', 'Date'), alwaysVisible: true, render: (cut) => <span className={cut.status === 'reversed' ? 'text-muted-foreground line-through' : undefined}>{day(cut.entryDate)}</span> },
              { key: 'lot', label: t('cc_production.cutting.lotShort', 'Lot'), render: (cut) => <span className="font-mono text-xs">{cut.sourceLotNumber}<span className="block text-muted-foreground">→ {cut.outputLotNumber}</span></span> },
              { key: 'size', label: t('cc_production.cutting.size', 'Cut size'), render: (cut) => cut.cutSize },
              { key: 'sheets', label: t('cc_production.cutting.sheets', 'Sheets'), align: 'right', render: (cut) => cut.sheetsIn },
              { key: 'used', label: t('cc_production.cutting.used', 'From the lot'), align: 'right', hidden: true, render: (cut) => `${kg(cut.sourceKgUsed)} kg` },
              { key: 'trimmed', label: t('cc_production.cutting.trimmed', 'Trimmed'), align: 'right', render: (cut) => `${kg(cut.trimmedKg)} kg` },
              { key: 'loss', label: t('cc_production.cutting.loss', 'Trim loss'), align: 'right', render: (cut) => <span className={cut.warnings.length ? 'text-status-warning-text' : undefined}>{kg(cut.trimKg)} kg · {cut.trimPct}%</span> },
              {
                key: 'actions',
                label: '',
                render: (cut) =>
                  cut.status === 'posted' && granted.has('cc_production.cutting.enter') ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setReversing(cut)}>
                      <RotateCcw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      {t('cc_production.cutting.reverse', 'Reverse')}
                    </Button>
                  ) : null,
              },
            ]}
          />
        </div>
      </PageBody>
      <CorrectDialog
        open={reversing !== null}
        onOpenChange={(open) => !open && setReversing(null)}
        title={t('cc_production.cutting.reverseTitle', 'Reverse this cutting entry')}
        confirmLabel={t('cc_production.cutting.reverse', 'Reverse')}
        undo={[t('cc_production.cutting.undoSheets', 'Puts the sheets back in the pressed lot'), t('cc_production.cutting.undoLot', 'Removes the trimmed lot and its trim loss')]}
        onConfirm={async (reason) => {
          if (reversing) await reverse(reversing, reason)
        }}
      />
    </Page>
  )
}

type Thickness = { id: string; inspectDate: string; lotRef: string; grade: string | null; daylight: string | null; targetMm: number; minusMm: number | null; plusMm: number | null; readings: number[]; outOfTolerance: number; result: 'pass' | 'hold'; inspector: string | null }

const ROW_LABELS = ["4'", "8'", "4'", "8'"]

function ReadingSummary({ readings, isOut }: { readings: string[]; isOut: (value: string) => boolean }) {
  const t = useT()
  const values = readings.map(Number).filter((value) => Number.isFinite(value) && value > 0)
  if (!values.length) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length
  const outCount = readings.filter((value) => isOut(value)).length
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 border-t px-3 py-2 text-xs">
      <span>{t('cc_production.thickness.entered', '{n} of 12 entered', { n: values.length })}</span>
      <span className="font-mono">min {min.toFixed(2)}</span>
      <span className="font-mono">max {max.toFixed(2)}</span>
      <span className="font-mono">avg {avg.toFixed(2)}</span>
      {outCount ? <span className="font-semibold text-status-error-text">{t('cc_production.thickness.outCount', '{n} out of tolerance', { n: outCount })}</span> : null}
    </div>
  )
}

export function ThicknessPage() {
  const t = useT()
  const granted = useGranted()
  const send = useSend('cc-thickness')
  const { setup, reload } = useSetup()
  const [month, setMonth] = React.useState(thisMonth())
  const [items, setItems] = React.useState<Thickness[]>([])
  const [form, setForm] = React.useState({ inspectDate: todayIso(), lotId: '', lotRef: '', grade: '', daylight: '', targetMm: '', minusMm: '', plusMm: '', readings: Array.from({ length: 12 }, () => '') })
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<{ items: Thickness[] }>(`/api/cc_production/thickness?month=${month}`, undefined, { fallback: { items: [] } })
    setItems(call.result?.items ?? [])
  }, [month])
  React.useEffect(() => {
    void load()
  }, [load])

  const lots = (setup?.floorLots ?? []).filter((lot) => lot.kind === 'laminate')
  const pickLot = (lotId: string) => {
    const lot = lots.find((entry) => entry.lotId === lotId)
    setForm({ ...form, lotId, lotRef: lot?.batchNo ?? '', grade: lot?.grade ?? '', targetMm: lot?.thicknessMm ? String(lot.thicknessMm) : form.targetMm })
  }
  const target = Number(form.targetMm)
  const out = (value: string) => {
    const reading = Number(value)
    if (!value || !target || (!form.minusMm && !form.plusMm)) return false
    return reading < target - Number(form.minusMm || 0) - 0.0001 || reading > target + Number(form.plusMm || 0) + 0.0001
  }

  const submit = async (result: 'pass' | 'hold' | null) => {
    if (form.readings.some((value) => !Number(value))) {
      flash(t('cc_production.thickness.fill', 'Enter all 12 readings'), 'error')
      return
    }
    setBusy(true)
    try {
      const body = { inspectDate: form.inspectDate, lotId: form.lotId || null, lotRef: form.lotRef, grade: form.grade, daylight: form.daylight, targetMm: form.targetMm, minusMm: form.minusMm, plusMm: form.plusMm, readings: form.readings.map(Number), result }
      if (isOffline()) {
        queueSave({ screen: 'Thickness inspection', recordRef: `${form.lotRef || form.lotId} ${form.inspectDate} ${Date.now()}`, path: '/api/cc_production/thickness', method: 'POST', body, updatedAt: null })
        flash(t('cc_production.offline.queued', 'Saved on this phone. It will sync when the network is back.'), 'success')
        setForm({ ...form, lotId: '', lotRef: '', daylight: '', readings: Array.from({ length: 12 }, () => '') })
        return
      }
      const saved = await send<Thickness>('/api/cc_production/thickness', 'POST', body)
      if (saved) {
        flash(saved.result === 'pass' ? t('cc_production.thickness.passed', 'Passed.') : t('cc_production.thickness.held', 'On hold. The lot stays out of FG.'), saved.result === 'pass' ? 'success' : 'error')
        setForm({ ...form, lotId: '', lotRef: '', daylight: '', readings: Array.from({ length: 12 }, () => '') })
        await Promise.all([load(), reload()])
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-12">
          <OfflineBadge onSynced={() => void load()} />
          <Header eyebrow={t('cc_production.quality.eyebrow', 'Quality')} title={t('cc_production.thickness.title', 'Thickness inspection')} lede={t('cc_production.thickness.lede', 'Twelve readings per board, rows 4′ 8′ 4′ 8′ as in the book. A board on hold stays out of the FG store until it passes. The tolerance is kept per thickness once entered.')} month={month} setMonth={setMonth} />
          {granted.has('cc_production.quality.enter') ? (
            <section className="rounded-xl border bg-card shadow-sm" aria-labelledby="th-new-title">
              <header className="flex items-center gap-2 border-b px-4 py-3 sm:px-5">
                <Ruler className="h-4 w-4 text-primary" aria-hidden="true" />
                <h2 id="th-new-title" className="text-sm font-semibold">{t('cc_production.thickness.newTitle', 'New inspection')}</h2>
              </header>
              <div className="space-y-5 p-4 sm:p-5">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-12">
                  <div className="col-span-2 space-y-1.5 md:col-span-3">
                    <Label htmlFor="th-date">{t('cc_production.resin.date', 'Date')}</Label>
                    <Input id="th-date" type="date" value={form.inspectDate} onChange={(event) => setForm({ ...form, inspectDate: event.target.value })} />
                  </div>
                  <div className="col-span-2 space-y-1.5 md:col-span-6">
                    <Label htmlFor="th-lot">{t('cc_production.thickness.lot', 'Lot')}</Label>
                    <Dropdown id="th-lot" value={form.lotId} onChange={(event) => pickLot(event.target.value)}>
                      <option value="">{t('cc_production.thickness.noLotShort', 'Not in the list — type the ref')}</option>
                      {lots.map((entry) => (
                        <option key={entry.lotId} value={entry.lotId}>
                          {lotLabel(entry)}
                        </option>
                      ))}
                    </Dropdown>
                  </div>
                  <div className="col-span-2 space-y-1.5 md:col-span-3">
                    <Label htmlFor="th-ref">{t('cc_production.thickness.ref', 'Lot ref')}</Label>
                    <Input id="th-ref" placeholder="F/61/9/26" value={form.lotRef} onChange={(event) => setForm({ ...form, lotRef: event.target.value })} />
                  </div>
                  {(
                    [
                      ['grade', t('cc_production.press.grade', 'Grade'), 'F2 F3', 'md:col-span-3'],
                      ['daylight', t('cc_production.press.daylight', 'Daylight'), 'D4', 'md:col-span-3'],
                      ['targetMm', t('cc_production.thickness.target', 'Target mm'), '10', 'md:col-span-2'],
                      ['minusMm', t('cc_production.thickness.minus', '− tolerance mm'), '0.10', 'md:col-span-2'],
                      ['plusMm', t('cc_production.thickness.plus', '+ tolerance mm'), '0.10', 'md:col-span-2'],
                    ] as Array<['grade' | 'daylight' | 'targetMm' | 'minusMm' | 'plusMm', string, string, string]>
                  ).map(([field, label, placeholder, span]) => (
                    <div key={field} className={cn('space-y-1.5', span)}>
                      <Label htmlFor={`th-${field}`}>{label}</Label>
                      <Input id={`th-${field}`} inputMode={field === 'grade' || field === 'daylight' ? 'text' : 'decimal'} placeholder={placeholder} value={form[field]} onChange={(event) => setForm({ ...form, [field]: event.target.value })} />
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                    <p className="text-sm font-semibold">{t('cc_production.thickness.readingsTitle', '12 readings (mm)')}</p>
                    <p className="text-xs text-muted-foreground">{t('cc_production.thickness.readingsHint', 'Rows 4′ 8′ 4′ 8′ as in the book · out of tolerance shows red')}</p>
                  </div>
                  <table className="w-full table-fixed text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground">
                        <th scope="col" className="w-24 px-3 py-2 text-left font-medium">{t('cc_production.thickness.row', 'Row')}</th>
                        {[1, 2, 3].map((point) => (
                          <th key={point} scope="col" className="px-1.5 py-2 text-center font-medium">
                            {t('cc_production.thickness.point', 'Point {n}', { n: point })}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ROW_LABELS.map((label, row) => (
                        <tr key={row} className={cn(row % 2 === 1 && 'bg-muted/30', row === 2 && 'border-t-2 border-dashed')}>
                          <th scope="row" className="px-3 py-1.5 text-left font-normal">
                            <span className="text-xs text-muted-foreground">{row + 1} · </span>
                            <span className="font-mono">{label}</span>
                          </th>
                          {[0, 1, 2].map((column) => {
                            const index = row * 3 + column
                            return (
                              <td key={index} className="px-1.5 py-1.5">
                                <input
                                  className={cn('h-10 w-full rounded-md border border-input bg-background px-2 text-center font-mono text-sm', out(form.readings[index]) && 'border-status-error-border bg-status-error-bg text-status-error-text')}
                                  inputMode="decimal"
                                  value={form.readings[index]}
                                  onChange={(event) => setForm({ ...form, readings: form.readings.map((value, position) => (position === index ? event.target.value : value)) })}
                                  aria-label={t('cc_production.thickness.readingLabel', 'Row {row} ({label}), point {point}', { row: row + 1, label, point: column + 1 })}
                                />
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ReadingSummary readings={form.readings} isOut={out} />
                </div>

                <div className="flex flex-col-reverse gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-muted-foreground">{t('cc_production.thickness.passRule', 'Saving passes the board when all 12 readings are within tolerance; otherwise it goes on hold and stays out of FG.')}</p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" className="flex-1 border-status-warning-border text-status-warning-text sm:flex-none" disabled={busy} onClick={() => void submit('hold')}>
                      <PauseCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('cc_production.thickness.holdLong', 'Put on hold')}
                    </Button>
                    <Button type="button" className="flex-1 sm:flex-none" disabled={busy} onClick={() => void submit(null)}>
                      <Ruler className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('cc_production.thickness.saveShort', 'Save inspection')}
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          ) : null}
          <section className="space-y-3" aria-labelledby="th-history-title">
            <h2 id="th-history-title" className="text-sm font-semibold">{t('cc_production.thickness.history', 'Inspections this month')}</h2>
            <PlantTable
              tableId="cc_production.thickness"
              rows={items}
              rowKey={(item) => item.id}
              rowHref={(item) => recordHref.thickness(item.id)}
              columns={[
                { key: 'date', label: t('cc_production.resin.date', 'Date'), alwaysVisible: true, render: (item) => day(item.inspectDate) },
                { key: 'lot', label: t('cc_production.thickness.ref', 'Lot ref'), render: (item) => <span className="font-mono text-xs">{item.lotRef}</span> },
                { key: 'grade', label: t('cc_production.press.grade', 'Grade'), render: (item) => item.grade ?? '' },
                { key: 'daylight', label: t('cc_production.press.daylight', 'Daylight'), render: (item) => item.daylight ?? '' },
                { key: 'target', label: t('cc_production.thickness.target', 'Target mm'), align: 'right', render: (item) => item.targetMm },
                { key: 'tolerance', label: t('cc_production.thickness.tolerance', 'Tolerance'), render: (item) => (item.plusMm !== null || item.minusMm !== null ? `−${item.minusMm ?? 0} / +${item.plusMm ?? 0}` : '—') },
                { key: 'readings', label: t('cc_production.thickness.readings', '12 readings'), render: (item) => <span className="font-mono text-xs">{item.readings.join(' ')}</span> },
                { key: 'inspector', label: t('cc_production.fg.inspector', 'Q.C. inspector'), hidden: true, render: (item) => item.inspector ?? '' },
                { key: 'result', label: t('cc_production.lab.result', 'Result'), render: (item) => <StatusBadge variant={item.result === 'pass' ? 'success' : 'error'} dot>{item.result === 'pass' ? 'Pass' : `Hold · ${item.outOfTolerance} out`}</StatusBadge> },
              ]}
            />
          </section>
        </div>
      </PageBody>
    </Page>
  )
}
