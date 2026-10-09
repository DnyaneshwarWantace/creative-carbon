"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { PLACE_LABEL, type StockPlace } from '../../../cc_products/lib/stock'
import { READINGS, STEP_LABELS, day, kg, todayIso, type BatchView, type ChemicalOption, type ResinSetup } from './shared'
import { Dropdown } from '../../../cc_lists/components/Dropdown'
import { PageLoading } from '../../../cc_ui/components/PageLoading'

type Line = { key: string; productId: string; kg: string; lotId: string }
type ReadingDraft = { tempC: string; time: string }
type Draft = {
  batchDate: string
  batchNo: string
  reactorId: string
  grade: string
  lines: Line[]
  steps: Record<string, { done: boolean; ph: string }>
  readings: Record<string, ReadingDraft>
  gelChecked: boolean
  vacuumStart: string
  coolingDuration: string
  ph: string
  gelTimeSec: string
  viscositySec: string
  solidPct: string
  waterRemovedKg: string
  yieldKg: string
  notes: string
}

const text = (value: number | string | null | undefined) => (value === null || value === undefined ? '' : String(value))
const numberOrNull = (value: string) => (value.trim() === '' ? null : Number(value.replace(/,/g, '')))
let lineSeq = 0
const lineKey = () => `line-${(lineSeq += 1)}`

function initialDraft(setup: ResinSetup, batch: BatchView | null): Draft {
  const standard = setup.chemicals.filter((chemical) => chemical.standard)
  const lines: Line[] = standard.map((chemical) => {
    const existing = batch?.materials.find((line) => line.productId === chemical.id)
    return { key: lineKey(), productId: chemical.id, kg: existing ? text(existing.kg) : '', lotId: existing?.lotId ?? '' }
  })
  for (const line of batch?.materials ?? []) {
    if (!standard.some((chemical) => chemical.id === line.productId)) lines.push({ key: lineKey(), productId: line.productId, kg: text(line.kg), lotId: line.lotId ?? '' })
  }
  const readings: Record<string, ReadingDraft> = {}
  for (const reading of READINGS) readings[reading.key] = { tempC: text(batch?.process[reading.key]?.tempC), time: text(batch?.process[reading.key]?.time) }
  const steps: Record<string, { done: boolean; ph: string }> = {}
  for (const step of STEP_LABELS) steps[step.key] = { done: Boolean(batch?.process.steps[step.key]?.done), ph: text(batch?.process.steps[step.key]?.ph) }
  return {
    batchDate: batch?.batchDate ?? todayIso(),
    batchNo: batch?.batchNo ?? setup.nextBatchNo ?? '',
    reactorId: batch?.reactorId ?? setup.reactors[0]?.id ?? '',
    grade: batch?.grade ?? 'PFC',
    lines,
    steps,
    readings,
    gelChecked: Boolean(batch?.process.gelChecked),
    vacuumStart: text(batch?.process.vacuumStart),
    coolingDuration: text(batch?.process.coolingDuration),
    ph: text(batch?.tests.ph),
    gelTimeSec: text(batch?.tests.gelTimeSec),
    viscositySec: text(batch?.tests.viscositySec),
    solidPct: text(batch?.tests.solidPct),
    waterRemovedKg: text(batch?.waterRemovedKg),
    yieldKg: text(batch?.yieldKg),
    notes: batch?.notes ?? '',
  }
}

function toPayload(draft: Draft) {
  return {
    batchDate: draft.batchDate,
    batchNo: draft.batchNo.trim() || undefined,
    reactorId: draft.reactorId,
    grade: draft.grade,
    materials: draft.lines.filter((line) => line.productId && numberOrNull(line.kg)).map((line) => ({ productId: line.productId, kg: numberOrNull(line.kg), lotId: line.lotId || null })),
    process: {
      steps: Object.fromEntries(Object.entries(draft.steps).map(([key, step]) => [key, { done: step.done, ph: numberOrNull(step.ph) }])),
      ...Object.fromEntries(Object.entries(draft.readings).map(([key, reading]) => [key, { tempC: numberOrNull(reading.tempC), time: reading.time.trim() || null }])),
      gelChecked: draft.gelChecked,
      vacuumStart: draft.vacuumStart.trim() || null,
      coolingDuration: draft.coolingDuration.trim() || null,
    },
    tests: { ph: numberOrNull(draft.ph), gelTimeSec: numberOrNull(draft.gelTimeSec), viscositySec: numberOrNull(draft.viscositySec), solidPct: numberOrNull(draft.solidPct) },
    waterRemovedKg: numberOrNull(draft.waterRemovedKg),
    yieldKg: numberOrNull(draft.yieldKg),
    notes: draft.notes.trim() || null,
  }
}

function Section({ no, title, children }: { no: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-baseline gap-3 border-b border-border px-5 py-3">
        <span className="font-mono text-xs text-muted-foreground">{no}</span>
        <h2 className="text-sm font-semibold">{title}</h2>
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

function LotSelect({ chemical, value, onChange }: { chemical: ChemicalOption | undefined; value: string; onChange: (value: string) => void }) {
  const t = useT()
  return (
    <Dropdown className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={value} onChange={(event) => onChange(event.target.value)} aria-label={t('cc_production.resin.lot', 'Stock lot')}>
      <option value="">{t('cc_production.resin.oldestFirst', 'Oldest lot first')}</option>
      {(chemical?.lots ?? []).map((lot) => (
        <option key={lot.lotId} value={lot.lotId}>
          {lot.lotNumber ?? '—'} · {kg(lot.free)} kg · {PLACE_LABEL[lot.place as StockPlace] ?? lot.place}
        </option>
      ))}
    </Dropdown>
  )
}

export function ResinBatchForm({ batch }: { batch: BatchView | null }) {
  const t = useT()
  const router = useRouter()
  const { runMutation } = useGuardedMutation({ contextId: `cc-resin-form-${batch?.id ?? 'new'}` })
  const [setup, setSetup] = React.useState<ResinSetup | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    void apiCall<ResinSetup>(`/api/cc_production/resin/setup?date=${batch?.batchDate ?? todayIso()}`).then((call) => {
      if (cancelled) return
      if (!call.ok || !call.result) {
        setError(t('cc_production.resin.setupError', 'Could not load the vessels and chemicals.'))
        return
      }
      setSetup(call.result)
      setDraft(initialDraft(call.result, batch))
    })
    return () => {
      cancelled = true
    }
  }, [batch, t])

  const changeDate = async (value: string) => {
    setDraft((current) => (current ? { ...current, batchDate: value } : current))
    if (batch || !value) return
    const call = await apiCall<ResinSetup>(`/api/cc_production/resin/setup?date=${value}`)
    if (call.ok && call.result?.nextBatchNo) setDraft((current) => (current ? { ...current, batchNo: call.result!.nextBatchNo! } : current))
  }

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!setup || !draft) return <Page><PageBody><PageLoading label={t('cc_production.resin.loading', 'Loading…')} /></PageBody></Page>

  const chemicalsById = new Map(setup.chemicals.map((chemical) => [chemical.id, chemical]))
  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
  const updateLine = (key: string, patch: Partial<Line>) => update({ lines: draft.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)) })
  const totalInput = draft.lines.reduce((sum, line) => sum + (numberOrNull(line.kg) ?? 0), 0)
  const yieldKg = numberOrNull(draft.yieldKg)
  const yieldPct = yieldKg && totalInput ? Math.round((yieldKg / totalInput) * 1000) / 10 : null
  const standardIds = new Set(setup.chemicals.filter((chemical) => chemical.standard).map((chemical) => chemical.id))

  const save = async (post: boolean) => {
    const payload = toPayload(draft)
    if (!payload.reactorId) {
      flash(t('cc_production.resin.pickVessel', 'Pick the vessel'), 'error')
      return
    }
    setBusy(true)
    try {
      const body = batch ? { ...payload, id: batch.id } : payload
      const call = await runMutation({
        context: { batchId: batch?.id ?? null },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(batch ? buildOptimisticLockHeader(batch.updatedAt) : {}, () =>
            apiCall<BatchView & { error?: string }>('/api/cc_production/resin/batches', { method: batch ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
          ),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_production.resin.saveError', 'Could not save the batch.'), 'error')
        return
      }
      let saved = call.result
      if (post) {
        const action = { id: saved.id, action: 'post' }
        const posted = await runMutation({
          context: { batchId: saved.id },
          mutationPayload: action,
          operation: () =>
            withScopedApiRequestHeaders(buildOptimisticLockHeader(saved.updatedAt), () =>
              apiCall<BatchView & { error?: string }>('/api/cc_production/resin/batches/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(action) }),
            ),
        })
        if (!posted.ok || !posted.result || posted.result.error) {
          flash(posted.result?.error ?? t('cc_production.resin.postError', 'Saved, but could not post.'), 'error')
          router.push(`/backend/resin/batches/${saved.id}`)
          return
        }
        saved = posted.result
        flash(t('cc_production.resin.posted', 'Posted. Chemicals are out of stock and the resin is in the resin tank.'), 'success')
      } else {
        flash(t('cc_production.resin.saved', 'Saved. Post it when the yield is known.'), 'success')
      }
      router.push(`/backend/resin/batches/${saved.id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-12">
          <div>
            <Link href={batch ? `/backend/resin/batches/${batch.id}` : '/backend/resin/batches'} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {batch ? batch.batchNo : t('cc_production.resin.title', 'Resin batches')}
            </Link>
            <p className="mt-3 text-overline font-semibold uppercase tracking-widest text-muted-foreground">CCCPL/F/QC/03</p>
            <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.resin.formTitle', 'Phenol formaldehyde resin batch report')}</h1>
          </div>

          <Section no="1" title={t('cc_production.resin.header', 'Batch')}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="resin-date">{t('cc_production.resin.date', 'Date')} *</Label>
                <Input id="resin-date" type="date" value={draft.batchDate} onChange={(event) => void changeDate(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="resin-vessel">{t('cc_production.resin.vessel', 'Vessel')} *</Label>
                <Dropdown id="resin-vessel" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={draft.reactorId} onChange={(event) => update({ reactorId: event.target.value })}>
                  {setup.reactors.map((reactor) => (
                    <option key={reactor.id} value={reactor.id}>
                      {reactor.code}
                    </option>
                  ))}
                </Dropdown>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="resin-no">{t('cc_production.resin.batchNo', 'Batch No.')}</Label>
                <Input id="resin-no" className="font-mono" value={draft.batchNo} onChange={(event) => update({ batchNo: event.target.value })} />
              </div>
              <fieldset className="space-y-1.5">
                <legend className="text-sm font-medium">{t('cc_production.resin.grade', 'Grade')} *</legend>
                <div className="flex flex-wrap gap-1.5">
                  {setup.grades.map((grade) => (
                    <button
                      key={grade}
                      type="button"
                      aria-pressed={draft.grade === grade}
                      onClick={() => update({ grade })}
                      className={cn('h-9 rounded-md border px-3 text-sm font-medium transition-colors', draft.grade === grade ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background hover:bg-muted')}
                    >
                      {grade}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          </Section>

          <Section no="2" title={t('cc_production.resin.materials', 'Materials (quantity in kg)')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="w-10 py-2 pr-2" />
                    <th className="py-2 pr-3">{t('cc_production.resin.material', 'Material')}</th>
                    <th className="w-32 py-2 pr-3 text-right">kg</th>
                    <th className="w-64 py-2 pr-3">{t('cc_production.resin.lot', 'Stock lot')}</th>
                    <th className="w-28 py-2 text-right">{t('cc_production.resin.inStock', 'In stock')}</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {draft.lines.map((line) => {
                    const chemical = chemicalsById.get(line.productId)
                    const standard = standardIds.has(line.productId)
                    const short = chemical && numberOrNull(line.kg) !== null && (numberOrNull(line.kg) ?? 0) > chemical.free
                    return (
                      <tr key={line.key}>
                        <td className="py-2 pr-2 font-mono text-xs text-muted-foreground">{standard ? chemical?.letter : '+'}</td>
                        <td className="py-2 pr-3">
                          {standard ? (
                            <span className="font-medium">{chemical?.title}</span>
                          ) : (
                            <Dropdown className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={line.productId} onChange={(event) => updateLine(line.key, { productId: event.target.value, lotId: '' })} aria-label={t('cc_production.resin.material', 'Material')}>
                              <option value="">{t('cc_production.resin.pickChemical', 'Pick a chemical')}</option>
                              {setup.chemicals.map((option) => (
                                <option key={option.id} value={option.id}>
                                  {option.title}
                                </option>
                              ))}
                            </Dropdown>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <Input inputMode="decimal" className={cn('text-right tabular-nums', short && 'border-status-error-border')} value={line.kg} onChange={(event) => updateLine(line.key, { kg: event.target.value })} aria-label={`${chemical?.title ?? ''} kg`} />
                        </td>
                        <td className="py-2 pr-3">
                          <LotSelect chemical={chemical} value={line.lotId} onChange={(value) => updateLine(line.key, { lotId: value })} />
                        </td>
                        <td className={cn('py-2 text-right tabular-nums', short ? 'text-status-error-text' : 'text-muted-foreground')}>{chemical ? `${kg(chemical.free)} kg` : '—'}</td>
                        <td className="py-2 text-right">
                          {!standard ? (
                            <Button type="button" variant="ghost" size="icon" onClick={() => update({ lines: draft.lines.filter((entry) => entry.key !== line.key) })} aria-label={t('cc_production.resin.removeLine', 'Remove row')}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => update({ lines: [...draft.lines, { key: lineKey(), productId: '', kg: '', lotId: '' }] })}>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.resin.addMaterial', 'Add another material')}
            </Button>
          </Section>

          <Section no="3–13" title={t('cc_production.resin.process', 'Process')}>
            <div className="space-y-2">
              {STEP_LABELS.map((step) => (
                <div key={step.key} className="grid grid-cols-12 items-center gap-3">
                  <span className="col-span-1 font-mono text-xs text-muted-foreground">{step.no}</span>
                  <label className="col-span-8 flex items-center gap-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.steps[step.key].done} onChange={(event) => update({ steps: { ...draft.steps, [step.key]: { ...draft.steps[step.key], done: event.target.checked } } })} />
                    {step.label}
                  </label>
                  <Input className="col-span-3" inputMode="decimal" placeholder="pH" value={draft.steps[step.key].ph} onChange={(event) => update({ steps: { ...draft.steps, [step.key]: { ...draft.steps[step.key], ph: event.target.value } } })} aria-label={`${step.label} pH`} />
                </div>
              ))}
              {READINGS.map((reading) => (
                <div key={reading.key} className="grid grid-cols-12 items-center gap-3">
                  <span className="col-span-1 font-mono text-xs text-muted-foreground">{reading.no}</span>
                  <span className="col-span-5 text-sm">{reading.label}</span>
                  <div className="col-span-3 flex items-center gap-1">
                    <Input inputMode="decimal" className="text-right" value={draft.readings[reading.key].tempC} onChange={(event) => update({ readings: { ...draft.readings, [reading.key]: { ...draft.readings[reading.key], tempC: event.target.value } } })} aria-label={`${reading.label} °C`} />
                    <span className="text-sm text-muted-foreground">°C</span>
                  </div>
                  <div className="col-span-3 flex items-center gap-1">
                    <span className="text-sm text-muted-foreground">{t('cc_production.resin.at', 'at')}</span>
                    <Input placeholder="9:10" value={draft.readings[reading.key].time} onChange={(event) => update({ readings: { ...draft.readings, [reading.key]: { ...draft.readings[reading.key], time: event.target.value } } })} aria-label={`${reading.label} time`} />
                  </div>
                </div>
              ))}
              <div className="grid grid-cols-12 items-center gap-3">
                <span className="col-span-1 font-mono text-xs text-muted-foreground">11</span>
                <label className="col-span-11 flex items-center gap-2 text-sm">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={draft.gelChecked} onChange={(event) => update({ gelChecked: event.target.checked })} />
                  {t('cc_production.resin.gelChecked', 'Gel time checked on hot plate')}
                </label>
              </div>
              <div className="grid grid-cols-12 items-center gap-3">
                <span className="col-span-1 font-mono text-xs text-muted-foreground">12</span>
                <span className="col-span-8 text-sm">{t('cc_production.resin.vacuum', 'Water removal under vacuum starts at')}</span>
                <Input className="col-span-3" placeholder="10:31" value={draft.vacuumStart} onChange={(event) => update({ vacuumStart: event.target.value })} aria-label={t('cc_production.resin.vacuum', 'Water removal under vacuum starts at')} />
              </div>
              <div className="grid grid-cols-12 items-center gap-3">
                <span className="col-span-1 font-mono text-xs text-muted-foreground">13</span>
                <span className="col-span-8 text-sm">{t('cc_production.resin.cooling', 'Cooling time to 35–45 °C (hours:minutes)')}</span>
                <Input className="col-span-3" placeholder="4:00" value={draft.coolingDuration} onChange={(event) => update({ coolingDuration: event.target.value })} aria-label={t('cc_production.resin.cooling', 'Cooling time')} />
              </div>
            </div>
          </Section>

          <Section no="14–15" title={t('cc_production.resin.tests', 'Tests and yield')}>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {(
                [
                  ['ph', 'pH'],
                  ['gelTimeSec', t('cc_production.resin.gelTime', 'Gel time (sec)')],
                  ['viscositySec', t('cc_production.resin.viscosity', 'Viscosity (sec)')],
                  ['solidPct', t('cc_production.resin.solid', 'Solid content 150 °C 1 h (%)')],
                ] as Array<[keyof Draft, string]>
              ).map(([key, label]) => (
                <div key={key} className="space-y-1.5">
                  <Label htmlFor={`resin-${key}`}>{label}</Label>
                  <Input id={`resin-${key}`} inputMode="decimal" value={draft[key] as string} onChange={(event) => update({ [key]: event.target.value } as Partial<Draft>)} />
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="resin-water">{t('cc_production.resin.water', 'Water removed (kg)')}</Label>
                <Input id="resin-water" inputMode="decimal" value={draft.waterRemovedKg} onChange={(event) => update({ waterRemovedKg: event.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="resin-yield">{t('cc_production.resin.yield', 'Resin yield (kg)')} *</Label>
                <Input id="resin-yield" inputMode="decimal" value={draft.yieldKg} onChange={(event) => update({ yieldKg: event.target.value })} />
              </div>
              <div className="col-span-2 flex items-end gap-6 rounded-lg bg-muted/50 px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('cc_production.resin.totalInput', 'Total input')}</p>
                  <p className="text-lg font-semibold tabular-nums">{kg(totalInput)} kg</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{t('cc_production.resin.yieldPct', 'Yield')}</p>
                  <p className="text-lg font-semibold tabular-nums">{yieldPct === null ? '—' : `${yieldPct}%`}</p>
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="resin-notes">{t('cc_production.resin.notes', 'Remarks')}</Label>
              <Textarea id="resin-notes" rows={2} value={draft.notes} onChange={(event) => update({ notes: event.target.value })} />
            </div>
          </Section>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
            <p className="mr-auto text-xs text-muted-foreground">
              {batch ? t('cc_production.resin.editing', 'Editing {no} · {date}', { no: batch.batchNo, date: day(batch.batchDate) }) : t('cc_production.resin.postHint', 'Save keeps it as not posted. Post takes the chemicals out of stock.')}
            </p>
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

export default ResinBatchForm

export function ResinBatchEdit({ batchId }: { batchId: string }) {
  const t = useT()
  const [batch, setBatch] = React.useState<BatchView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    let cancelled = false
    void apiCall<BatchView>(`/api/cc_production/resin/batches?id=${encodeURIComponent(batchId)}`).then((call) => {
      if (cancelled) return
      if (!call.ok || !call.result) setError(t('cc_production.resin.loadError', 'Could not load this batch.'))
      else setBatch(call.result)
    })
    return () => {
      cancelled = true
    }
  }, [batchId, t])
  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!batch) return <Page><PageBody><PageLoading label={t('cc_production.resin.loading', 'Loading…')} /></PageBody></Page>
  if (batch.status !== 'draft') return <Page><PageBody><ErrorMessage label={t('cc_production.resin.reopenFirst', 'This batch is posted. Reopen it first to change it.')} /></PageBody></Page>
  return <ResinBatchForm batch={batch} />
}
