"use client"

import * as React from 'react'
import Link from 'next/link'
import { CheckCircle2, CircleAlert, ClipboardCheck, Save } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../cc_departments/components/useGranted'

type Place = 'wh_a' | 'wh_b' | 'tank' | 'floor' | 'fg'
type Row = { productId: string; title: string; code: string | null; unit: string; paper: number | null; system: number; diff: number | null; matched: boolean | null }
type Sheet = { date: string; place: Place; placeLabel: string; live: boolean; saved: boolean; rows: Row[]; note: string | null; byName: string | null; updatedAt: string | null }
type Day = { date: string; counted: number; matched: number; agrees: boolean; stores: Array<{ place: string; placeLabel: string; counted: number; matched: number }>; differences: Array<{ place: string; title: string; unit: string; paper: number | null; system: number; diff: number | null }> }
type Summary = { targetDays: number; streak: number; ready: boolean; lastDate: string | null; days: Day[] }

const PLACES: Array<{ value: Place; label: string }> = [
  { value: 'wh_a', label: 'Warehouse A' },
  { value: 'wh_b', label: 'Warehouse B' },
  { value: 'tank', label: 'Resin tank' },
  { value: 'floor', label: 'Shop floor' },
  { value: 'fg', label: 'FG store' },
]

function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function num(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)
}

function shortDay(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export function ParallelRunPage() {
  const t = useT()
  const granted = useGranted()
  const canSave = granted.has('cc_store.adjust')
  const { runMutation, retryLastMutation } = useGuardedMutation({ contextId: 'cc-parallel-run' })
  const [place, setPlace] = React.useState<Place>('wh_a')
  const [date, setDate] = React.useState(today())
  const [sheet, setSheet] = React.useState<Sheet | null>(null)
  const [summary, setSummary] = React.useState<Summary | null>(null)
  const [paper, setPaper] = React.useState<Record<string, string>>({})
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [filter, setFilter] = React.useState('')

  const loadSummary = React.useCallback(async () => {
    const call = await apiCall<Summary>('/api/cc_store/parallel?summary=1', undefined, { fallback: null })
    setSummary(call.result ?? null)
  }, [])

  const loadSheet = React.useCallback(async () => {
    setSheet(null)
    const call = await apiCall<Sheet>(`/api/cc_store/parallel?place=${place}&date=${date}`)
    if (!call.ok || !call.result) return flash(t('cc_store.parallel.loadError', 'Could not load the sheet.'), 'error')
    setSheet(call.result)
    setPaper(Object.fromEntries(call.result.rows.filter((row) => row.paper !== null).map((row) => [row.productId, String(row.paper)])))
    setNote(call.result.note ?? '')
  }, [place, date, t])

  React.useEffect(() => {
    void loadSheet()
  }, [loadSheet])

  React.useEffect(() => {
    void loadSummary()
  }, [loadSummary])

  const save = async () => {
    if (!sheet) return
    const rows = sheet.rows.filter((row) => paper[row.productId] !== undefined && paper[row.productId].trim() !== '').map((row) => ({ productId: row.productId, paper: Number(paper[row.productId]) }))
    if (!rows.length) return flash(t('cc_store.parallel.needPaper', 'Enter the paper balance for at least one item.'), 'error')
    if (rows.some((row) => !Number.isFinite(row.paper) || row.paper < 0)) return flash(t('cc_store.parallel.badNumber', 'Paper balances must be numbers.'), 'error')
    setBusy(true)
    try {
      const body = { place, date, note: note || null, rows }
      const call = await runMutation({
        context: { formId: 'cc-parallel-run', resourceKind: 'cc_store.parallel_check', resourceId: `${date}:${place}`, retryLastMutation },
        mutationPayload: body,
        operation: () => apiCall<Sheet & { error?: string }>('/api/cc_store/parallel', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result) return flash(call.result?.error ?? t('cc_store.parallel.saveError', 'Could not save.'), 'error')
      setSheet(call.result)
      const counted = call.result.rows.filter((row) => row.matched !== null)
      const differ = counted.filter((row) => row.matched === false).length
      flash(differ ? t('cc_store.parallel.differ', '{count} items differ; look at them before tomorrow', { count: differ }) : t('cc_store.parallel.agree', 'All {count} counted items agree', { count: counted.length }), differ ? 'error' : 'success')
      await loadSummary()
    } finally {
      setBusy(false)
    }
  }

  const rows = (sheet?.rows ?? []).filter((row) => !filter.trim() || `${row.title} ${row.code ?? ''}`.toLowerCase().includes(filter.trim().toLowerCase()))
  const editable = canSave && Boolean(sheet && (sheet.live || sheet.saved))

  return (
    <Page>
      <PageBody>
        <div className="space-y-5">
          <header className="space-y-1 border-b pb-4">
            <h1 className="text-2xl font-bold tracking-tight">{t('cc_store.parallel.title', 'Paper vs system')}</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">{t('cc_store.parallel.lede', 'During the parallel run, at the end of each day copy the balance from the paper stock book for each store. The difference against the system shows at once. Go-live needs the stores to agree day after day.')}</p>
          </header>

          {summary ? (
            <section className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">
                    {summary.ready
                      ? t('cc_store.parallel.ready', 'Ready: {streak} days in a row agree', { streak: summary.streak })
                      : t('cc_store.parallel.streak', '{streak} of {target} days in a row agree', { streak: summary.streak, target: summary.targetDays })}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('cc_store.parallel.rule', 'A day agrees when every counted item in every store checked that day is within 0.1% (at least 0.5).')}</p>
                </div>
                <Link className="text-sm text-primary hover:underline" href="/backend/golive">
                  {t('cc_store.parallel.golive', 'Go-live checklist')}
                </Link>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <div className={cn('h-full rounded-full', summary.ready ? 'bg-status-success-icon' : 'bg-primary')} style={{ width: `${Math.min(100, (summary.streak / summary.targetDays) * 100)}%` }} />
              </div>
              {summary.days.length ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {[...summary.days].slice(0, 30).reverse().map((day) => (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => setDate(day.date)}
                      title={`${day.matched}/${day.counted} · ${day.stores.map((store) => store.placeLabel).join(', ')}`}
                      className={cn('rounded-md border px-2 py-1 text-xs tabular-nums', day.agrees ? 'border-status-success-border bg-status-success-bg text-status-success-text' : 'border-status-error-border bg-status-error-bg text-status-error-text', date === day.date && 'ring-2 ring-ring')}
                    >
                      {shortDay(day.date)}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-wrap gap-1 rounded-lg border bg-muted/40 p-0.5" role="radiogroup" aria-label={t('cc_store.parallel.store', 'Store')}>
              {PLACES.map((entry) => (
                <button key={entry.value} type="button" role="radio" aria-checked={place === entry.value} onClick={() => setPlace(entry.value)} className={cn('h-8 rounded-md px-3 text-sm', place === entry.value ? 'bg-background font-medium shadow-xs' : 'text-muted-foreground hover:text-foreground')}>
                  {entry.label}
                </button>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="parallel-date" className="text-xs text-muted-foreground">{t('cc_store.parallel.date', 'Day')}</Label>
              <Input id="parallel-date" type="date" className="w-44" value={date} max={today()} onChange={(event) => setDate(event.target.value || today())} />
            </div>
            <Input className="w-64" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={t('cc_store.parallel.filter', 'Find an item')} aria-label={t('cc_store.parallel.filter', 'Find an item')} />
          </div>

          {!sheet ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : !sheet.live && !sheet.saved ? (
            <EmptyState className="rounded-lg border bg-card py-12" variant="subtle" icon={<ClipboardCheck className="h-5 w-5" aria-hidden="true" />} title={t('cc_store.parallel.noPast', 'No check was saved for this store on this day')} description={t('cc_store.parallel.noPastHint', 'Checks are made the same day; past days keep the figures they were saved with.')} />
          ) : !sheet.rows.length ? (
            <EmptyState className="rounded-lg border bg-card py-12" variant="subtle" icon={<ClipboardCheck className="h-5 w-5" aria-hidden="true" />} title={t('cc_store.parallel.empty', 'Nothing in this store in the system')} />
          ) : (
            <section className="space-y-3">
              <div className="overflow-x-auto rounded-lg border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">{t('cc_store.parallel.item', 'Item')}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t('cc_store.parallel.system', 'System')}</th>
                      <th className="w-40 px-3 py-2 text-right font-semibold">{t('cc_store.parallel.paper', 'Paper book')}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t('cc_store.parallel.diff', 'Difference')}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t('cc_store.parallel.state', 'Check')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((row) => {
                      const typed = paper[row.productId]
                      const liveDiff = typed !== undefined && typed.trim() !== '' && Number.isFinite(Number(typed)) ? Math.round((Number(typed) - row.system) * 1000) / 1000 : null
                      const off = liveDiff !== null && Math.abs(liveDiff) > Math.max(0.5, Math.abs(row.system) * 0.001)
                      return (
                        <tr key={row.productId} className={cn(off && 'bg-status-error-bg/40')}>
                          <td className="px-3 py-2">
                            <span className="font-medium">{row.title}</span>
                            {row.code ? <span className="ml-2 font-mono text-xs text-muted-foreground">{row.code}</span> : null}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                            {num(row.system)} {row.unit}
                          </td>
                          <td className="px-3 py-1.5">
                            <Input inputMode="decimal" className="h-8 text-right" disabled={!editable} value={typed ?? ''} onChange={(event) => setPaper((prev) => ({ ...prev, [row.productId]: event.target.value }))} aria-label={`${row.title} paper balance`} />
                          </td>
                          <td className={cn('whitespace-nowrap px-3 py-2 text-right tabular-nums', off ? 'font-semibold text-status-error-text' : 'text-muted-foreground')}>{liveDiff === null ? '—' : `${liveDiff > 0 ? '+' : ''}${num(liveDiff)}`}</td>
                          <td className="px-3 py-2">
                            {liveDiff === null ? (
                              <span className="text-xs text-muted-foreground">{t('cc_store.parallel.notCounted', 'Not counted')}</span>
                            ) : off ? (
                              <span className="inline-flex items-center gap-1 text-xs text-status-error-text">
                                <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                                {t('cc_store.parallel.differs', 'Differs')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-status-success-text">
                                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                {t('cc_store.parallel.agrees', 'Agrees')}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <Label htmlFor="parallel-note" className="text-xs text-muted-foreground">{t('cc_store.parallel.note', 'Note (who counted, why something differs)')}</Label>
                  <Input id="parallel-note" value={note} disabled={!editable} onChange={(event) => setNote(event.target.value)} />
                </div>
                <div className="flex items-center gap-3">
                  {sheet.saved ? <span className="text-xs text-muted-foreground">{t('cc_store.parallel.savedBy', 'Saved by {by}', { by: sheet.byName ?? '—' })}</span> : null}
                  {editable ? (
                    <Button type="button" disabled={busy} onClick={() => void save()}>
                      <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {busy ? t('cc_store.parallel.saving', 'Saving…') : t('cc_store.parallel.save', 'Save the check')}
                    </Button>
                  ) : null}
                </div>
              </div>
            </section>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default ParallelRunPage
