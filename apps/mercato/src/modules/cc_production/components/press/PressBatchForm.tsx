"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { pressFigures } from '../../lib/pressFigures'
import { kg, todayIso } from '../resin/shared'
import { HEATING_FIELDS, parseWeight, weightText, type PressBatchView, type PressSetup } from './shared'
import { Dropdown } from '../../../cc_lists/components/Dropdown'

type SheetDraft = { key: string; thicknessMm: string; count: string; weight: string; grade: string }
type DaylightDraft = { key: string; no: number; sheets: SheetDraft[] }
type Draft = {
  batchDate: string
  pressId: string
  cycleNo: string
  daylights: DaylightDraft[]
  choices: Record<string, { lotId: string; reason: string }>
  heating: Record<string, string>
  checkedBy: string
  remark: string
}

let seq = 0
const key = () => `k${(seq += 1)}`
const emptySheet = (): SheetDraft => ({ key: key(), thicknessMm: '', count: '1', weight: '', grade: '' })

function initial(setup: PressSetup, batch: PressBatchView | null): Draft {
  const daylights = batch?.daylights.length
    ? batch.daylights.map((daylight) => ({ key: key(), no: daylight.no, sheets: daylight.sheets.map((sheet) => ({ key: key(), thicknessMm: String(sheet.thicknessMm), count: String(sheet.count), weight: weightText(sheet), grade: sheet.grade })) }))
    : Array.from({ length: setup.presses.find((press) => press.id === setup.presses[0]?.id)?.daylights ?? 9 }, (_, index) => ({ key: key(), no: index + 1, sheets: [emptySheet()] }))
  return {
    batchDate: batch?.batchDate ?? todayIso(),
    pressId: batch?.pressId ?? setup.presses[0]?.id ?? '',
    cycleNo: batch?.cycleNo != null ? String(batch.cycleNo) : '',
    daylights,
    choices: Object.fromEntries((batch?.lotChoices ?? []).map((choice) => [choice.grade, { lotId: choice.lotId, reason: choice.reason }])),
    heating: Object.fromEntries(Object.entries(batch?.heating ?? {}).map(([field, value]) => [field, value == null ? '' : String(value)])),
    checkedBy: batch?.checkedBy ?? '',
    remark: batch?.remark ?? '',
  }
}

function resolvedSheets(draft: Draft) {
  const result: Array<{ no: number; sheets: Array<{ thicknessMm: number; count: number; weightKg: number; weightMinKg: number | null; grade: string }> }> = []
  let lastGrade = ''
  for (const daylight of draft.daylights) {
    const sheets = []
    for (const sheet of daylight.sheets) {
      const thickness = Number(sheet.thicknessMm.replace(/mm/i, '').trim())
      const { weightKg, weightMinKg } = parseWeight(sheet.weight)
      const grade = sheet.grade.trim() && !/^("|,,|do)$/i.test(sheet.grade.trim()) ? sheet.grade.trim() : lastGrade
      if (!(thickness > 0) || !weightKg) continue
      lastGrade = grade
      sheets.push({ thicknessMm: thickness, count: Math.max(1, Number(sheet.count) || 1), weightKg, weightMinKg, grade })
    }
    if (sheets.length) result.push({ no: daylight.no, sheets })
  }
  return result
}

export function PressBatchForm({ batch }: { batch: PressBatchView | null }) {
  const t = useT()
  const router = useRouter()
  const { runMutation } = useGuardedMutation({ contextId: `cc-press-form-${batch?.id ?? 'new'}` })
  const [setup, setSetup] = React.useState<PressSetup | null>(null)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void apiCall<PressSetup>(`/api/cc_production/press/setup?date=${batch?.batchDate ?? todayIso()}`).then((call) => {
      if (cancelled) return
      if (!call.ok || !call.result) {
        setError(t('cc_production.press.setupError', 'Could not load presses and B-stage lots.'))
        return
      }
      setSetup(call.result)
      setDraft(initial(call.result, batch))
    })
    return () => {
      cancelled = true
    }
  }, [batch, t])

  const changeDate = async (value: string) => {
    setDraft((current) => (current ? { ...current, batchDate: value } : current))
    if (batch || !value) return
    const call = await apiCall<PressSetup>(`/api/cc_production/press/setup?date=${value}`)
    if (call.result) setSetup(call.result)
  }

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!setup || !draft) return <Page><PageBody><LoadingMessage label={t('cc_production.resin.loading', 'Loading…')} /></PageBody></Page>

  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const updateSheet = (daylightKey: string, sheetKey: string, patch: Partial<SheetDraft>) =>
    update({ daylights: draft.daylights.map((daylight) => (daylight.key === daylightKey ? { ...daylight, sheets: daylight.sheets.map((sheet) => (sheet.key === sheetKey ? { ...sheet, ...patch } : sheet)) } : daylight)) })
  const daylights = resolvedSheets(draft)
  const figures = pressFigures(daylights)
  const tolerance = (thickness: string) => setup.tolerances.find((entry) => Math.abs(entry.thicknessMm - Number(thickness.replace(/mm/i, ''))) < 0.001)
  const press = setup.presses.find((entry) => entry.id === draft.pressId)

  const save = async (post: boolean) => {
    const body = {
      batchDate: draft.batchDate,
      pressId: draft.pressId,
      cycleNo: draft.cycleNo.trim() || null,
      daylights,
      lotChoices: Object.entries(draft.choices)
        .filter(([, choice]) => choice.lotId)
        .map(([grade, choice]) => ({ grade, lotId: choice.lotId, reason: choice.reason })),
      heating: Object.values(draft.heating).some((value) => value.trim()) ? Object.fromEntries(Object.entries(draft.heating).map(([field, value]) => [field, value.trim() || null])) : null,
      checkedBy: draft.checkedBy.trim() || null,
      remark: draft.remark.trim() || null,
    }
    if (!body.daylights.length) {
      flash(t('cc_production.press.noSheets', 'Enter at least one daylight with thickness and loading weight'), 'error')
      return
    }
    setBusy(true)
    try {
      const payload = batch ? { ...body, id: batch.id } : body
      const saved = await runMutation({
        context: { batchId: batch?.id ?? null },
        mutationPayload: payload,
        operation: () =>
          withScopedApiRequestHeaders(batch ? buildOptimisticLockHeader(batch.updatedAt) : {}, () =>
            apiCall<PressBatchView & { error?: string }>('/api/cc_production/press/batches', { method: batch ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }),
          ),
      })
      if (!saved.ok || !saved.result || saved.result.error) {
        flash(saved.result?.error ?? t('cc_production.press.saveError', 'Could not save the batch.'), 'error')
        return
      }
      const view = saved.result
      if (post) {
        const action = { id: view.id, action: 'post' }
        const posted = await runMutation({
          context: { batchId: view.id },
          mutationPayload: action,
          operation: () =>
            withScopedApiRequestHeaders(buildOptimisticLockHeader(view.updatedAt), () =>
              apiCall<PressBatchView & { error?: string }>('/api/cc_production/press/batches/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action) }),
            ),
        })
        if (!posted.ok || !posted.result || posted.result.error) flash(posted.result?.error ?? t('cc_production.press.postError', 'Saved, but could not post.'), 'error')
        else flash(t('cc_production.press.posted', 'Posted. B-stage is out of stock and the pressed lots are on the shop floor.'), 'success')
      } else {
        flash(t('cc_production.press.saved', 'Saved as {no}.', { no: view.batchNo }), 'success')
      }
      router.push(`/backend/press/batches/${view.id}`)
    } finally {
      setBusy(false)
    }
  }

  const cell = 'h-8 w-full rounded border border-input bg-background px-1.5 text-sm tabular-nums'

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-12">
          <div>
            <Link href={batch ? `/backend/press/batches/${batch.id}` : '/backend/press/batches'} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {batch ? batch.batchNo : t('cc_production.press.title', 'Press batches')}
            </Link>
            <p className="mt-3 text-overline font-semibold uppercase tracking-widest text-muted-foreground">CCCPL/F/PRP/02 · {t('cc_production.press.loadingRegister', 'Press loading register')}</p>
            <h1 className="text-2xl font-bold tracking-tight">
              {batch ? batch.batchNo : setup.nextBatchNo}
              {!batch ? <span className="ml-2 text-sm font-normal text-muted-foreground">{t('cc_production.press.numberOnSave', 'number given when saved')}</span> : null}
            </h1>
          </div>

          <section className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="press-date">{t('cc_production.resin.date', 'Date')} *</Label>
              <Input id="press-date" type="date" value={draft.batchDate} onChange={(event) => void changeDate(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="press-no">{t('cc_production.press.press', 'Press No.')} *</Label>
              <Dropdown id="press-no" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={draft.pressId} onChange={(event) => update({ pressId: event.target.value })}>
                {setup.presses.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.number}
                    {entry.daylights ? ` · ${entry.daylights} daylights` : ''}
                    {entry.isWorking ? '' : ' · not working'}
                  </option>
                ))}
              </Dropdown>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="press-cycle">{t('cc_production.press.cycle', 'Cycle no.')}</Label>
              <Input id="press-cycle" inputMode="numeric" value={draft.cycleNo} onChange={(event) => update({ cycleNo: event.target.value })} />
            </div>
            <div className="flex items-end gap-6 rounded-lg bg-muted/50 px-4 py-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('cc_production.press.sheets', 'Sheets')}</p>
                <p className="text-lg font-semibold tabular-nums">{figures.totalSheets}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('cc_production.press.total', 'Total kg')}</p>
                <p className="text-lg font-semibold tabular-nums">{kg(figures.totalKg)}</p>
              </div>
            </div>
          </section>

          <section className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-180 text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-20 px-3 py-2 text-left">{t('cc_production.press.daylight', 'Daylight')}</th>
                  <th className="w-24 px-1 py-2 text-left">{t('cc_production.press.thickness', 'Thickness mm')}</th>
                  <th className="w-20 px-1 py-2 text-left">{t('cc_production.press.count', 'Sheets')}</th>
                  <th className="w-40 px-1 py-2 text-left">{t('cc_production.press.weight', 'Loading weight kg')}</th>
                  <th className="w-36 px-1 py-2 text-left">{t('cc_production.press.grade', 'Grade')}</th>
                  <th className="px-2 py-2 text-left">{t('cc_production.press.range', 'Specified range')}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {draft.daylights.map((daylight) =>
                  daylight.sheets.map((sheet, index) => {
                    const limit = tolerance(sheet.thicknessMm)
                    const { weightKg, weightMinKg } = parseWeight(sheet.weight)
                    const out = limit && weightKg !== null && [weightKg, weightMinKg].some((weight) => weight !== null && (weight < limit.minKg || weight > limit.maxKg))
                    return (
                      <tr key={sheet.key} className={index > 0 ? 'border-t-0' : undefined}>
                        <td className="px-3 py-1 font-mono text-xs text-muted-foreground">{index === 0 ? `${daylight.no})` : ''}</td>
                        <td className="px-1 py-1">
                          <input className={cell} inputMode="decimal" value={sheet.thicknessMm} onChange={(event) => updateSheet(daylight.key, sheet.key, { thicknessMm: event.target.value })} aria-label={`${daylight.no} thickness`} />
                        </td>
                        <td className="px-1 py-1">
                          <input className={cell} inputMode="numeric" value={sheet.count} onChange={(event) => updateSheet(daylight.key, sheet.key, { count: event.target.value })} aria-label={`${daylight.no} count`} />
                        </td>
                        <td className="px-1 py-1">
                          <input className={cn(cell, out && 'border-status-warning-border text-status-warning-text')} placeholder="117.600 or 6.200/6.400" value={sheet.weight} onChange={(event) => updateSheet(daylight.key, sheet.key, { weight: event.target.value })} aria-label={`${daylight.no} weight`} />
                        </td>
                        <td className="px-1 py-1">
                          <input className={cell} list="press-grades" placeholder={t('cc_production.press.ditto', 'blank = as above')} value={sheet.grade} onChange={(event) => updateSheet(daylight.key, sheet.key, { grade: event.target.value })} aria-label={`${daylight.no} grade`} />
                        </td>
                        <td className="px-2 py-1 text-xs text-muted-foreground">
                          {limit ? (
                            <span className={cn('inline-flex items-center gap-1', out && 'text-status-warning-text')}>
                              {out ? <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" /> : null}
                              {limit.minKg.toFixed(3)} / {limit.maxKg.toFixed(3)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-1 py-1 text-right">
                          {index === 0 ? (
                            <Button type="button" variant="ghost" size="icon" title={t('cc_production.press.addSheet', 'Another sheet in this daylight')} onClick={() => update({ daylights: draft.daylights.map((entry) => (entry.key === daylight.key ? { ...entry, sheets: [...entry.sheets, emptySheet()] } : entry)) })}>
                              <Plus className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          ) : (
                            <Button type="button" variant="ghost" size="icon" onClick={() => update({ daylights: draft.daylights.map((entry) => (entry.key === daylight.key ? { ...entry, sheets: entry.sheets.filter((candidate) => candidate.key !== sheet.key) } : entry)) })} aria-label={t('cc_production.resin.removeLine', 'Remove row')}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  }),
                )}
              </tbody>
            </table>
            <datalist id="press-grades">
              {setup.grades.map((grade) => (
                <option key={grade} value={grade} />
              ))}
            </datalist>
            <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={Boolean(press?.daylights && draft.daylights.length >= press.daylights)}
                onClick={() => update({ daylights: [...draft.daylights, { key: key(), no: (draft.daylights[draft.daylights.length - 1]?.no ?? 0) + 1, sheets: [emptySheet()] }] })}
              >
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.press.addDaylight', 'Add daylight')}
              </Button>
              <p className="text-xs text-muted-foreground">{figures.paperLines.length ? figures.sizeLines.map((line, index) => `${line.grade} ${figures.paperLines[index]}`).join(' · ') : ''}</p>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide">{t('cc_production.press.bstage', 'B-stage used')}</h2>
            <p className="mb-3 text-xs text-muted-foreground">{t('cc_production.press.bstageHint', 'Taken oldest first for each grade when posted. Pick another lot only with a reason. Lots past 10 days cannot be used.')}</p>
            {Object.keys(figures.kgByGrade).length ? (
              <div className="space-y-3">
                {Object.entries(figures.kgByGrade).map(([grade, needed]) => {
                  const lots = setup.lots.filter((lot) => lot.grades.includes(grade) && lot.band !== 'blocked')
                  const usual = lots.filter((lot) => lot.band !== 'expired')
                  const available = kg(usual.reduce((sum, lot) => sum + lot.freeKg, 0))
                  const choice = draft.choices[grade] ?? { lotId: '', reason: '' }
                  const needsReason = Boolean(choice.lotId && (choice.lotId !== usual[0]?.lotId || lots.find((lot) => lot.lotId === choice.lotId)?.band === 'expired'))
                  return (
                    <div key={grade} className="grid grid-cols-1 items-center gap-2 md:grid-cols-12">
                      <p className="text-sm font-medium md:col-span-2">{grade}</p>
                      <p className={cn('text-sm tabular-nums md:col-span-2', usual.reduce((sum, lot) => sum + lot.freeKg, 0) < needed && 'text-status-error-text')}>
                        {kg(needed)} kg · {t('cc_production.press.inStock', '{kg} in stock', { kg: available })}
                      </p>
                      <Dropdown className="h-9 rounded-md border border-input bg-background px-2 text-sm md:col-span-4" value={choice.lotId} onChange={(event) => update({ choices: { ...draft.choices, [grade]: { ...choice, lotId: event.target.value } } })} aria-label={`${grade} lot`}>
                        <option value="">{t('cc_production.press.oldest', 'Oldest first ({lot})', { lot: usual[0]?.lotNumber ?? '—' })}</option>
                        {lots.map((lot) => (
                          <option key={lot.lotId} value={lot.lotId}>
                            {lot.lotNumber} · {kg(lot.freeKg)} kg · day {lot.ageDays}
                            {lot.band === 'expired' ? ' · past 7 days' : ''}
                          </option>
                        ))}
                      </Dropdown>
                      {needsReason ? (
                        <Input className="md:col-span-4" placeholder={t('cc_production.press.why', 'Why not the oldest?')} value={choice.reason} onChange={(event) => update({ choices: { ...draft.choices, [grade]: { ...choice, reason: event.target.value } } })} />
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('cc_production.press.noGrades', 'Enter the daylights first.')}</p>
            )}
          </section>

          <section className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="press-checked">{t('cc_production.press.checkedBy', 'Checked by')}</Label>
              <Input id="press-checked" value={draft.checkedBy} onChange={(event) => update({ checkedBy: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="press-remark">{t('cc_production.press.remark', 'Remark')}</Label>
              <Input id="press-remark" value={draft.remark} onChange={(event) => update({ remark: event.target.value })} />
            </div>
          </section>

          <details className="rounded-xl border border-border bg-card shadow-sm">
            <summary className="cursor-pointer px-5 py-3 text-sm font-semibold uppercase tracking-wide">{t('cc_production.press.heating', 'Press heating slip (optional)')}</summary>
            <div className="grid grid-cols-1 gap-3 border-t border-border p-5 sm:grid-cols-3">
              {HEATING_FIELDS.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`heat-${field.key}`}>{field.label}</Label>
                  <Input id={`heat-${field.key}`} value={draft.heating[field.key] ?? ''} onChange={(event) => update({ heating: { ...draft.heating, [field.key]: event.target.value } })} />
                </div>
              ))}
              <p className="text-xs text-muted-foreground sm:col-span-3">{t('cc_production.press.heatingWeight', 'Total input weight = batch total, {kg} kg.', { kg: kg(figures.totalKg) })}</p>
            </div>
          </details>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
            <Button type="button" variant="outline" disabled={busy} onClick={() => void save(false)}>
              {t('cc_production.resin.save', 'Save')}
            </Button>
            <Button type="button" disabled={busy} onClick={() => void save(true)}>
              {t('cc_production.resin.saveAndPost', 'Save and post')}
            </Button>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}

export function PressBatchEdit({ batchId }: { batchId: string }) {
  const t = useT()
  const [batch, setBatch] = React.useState<PressBatchView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    void apiCall<PressBatchView>(`/api/cc_production/press/batches?id=${encodeURIComponent(batchId)}`).then((call) => {
      if (!call.ok || !call.result) setError(t('cc_production.press.loadError', 'Could not load this batch.'))
      else setBatch(call.result)
    })
  }, [batchId, t])
  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!batch) return <Page><PageBody><LoadingMessage label={t('cc_production.resin.loading', 'Loading…')} /></PageBody></Page>
  if (batch.status !== 'draft') return <Page><PageBody><ErrorMessage label={t('cc_production.press.reopenFirst', 'This batch is posted or cancelled. Reopen it first to change it.')} /></PageBody></Page>
  return <PressBatchForm batch={batch} />
}

export default PressBatchForm
