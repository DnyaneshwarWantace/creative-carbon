"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ChevronRight, ClipboardList, FileText, Plus, Printer } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { day, kg, thisMonth, todayIso } from '../resin/shared'
import { PRESS_STATUS, weightText, type PressBatchRow, type PressBatchView, type PressSetup } from './shared'

function shortDate(iso: string): string {
  const [year, month, dayOfMonth] = iso.split('-')
  return `${Number(dayOfMonth)}/${Number(month)}/${year.slice(2)}`
}

export function PressBatchesPage() {
  const t = useT()
  const granted = useGranted()
  const [month, setMonth] = React.useState(thisMonth())
  const [items, setItems] = React.useState<PressBatchRow[] | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setItems(null)
    void apiCall<{ items: PressBatchRow[] }>(`/api/cc_production/press/batches?month=${month}`, undefined, { fallback: { items: [] } }).then((call) => {
      if (!cancelled) setItems(call.result?.items ?? [])
    })
    return () => {
      cancelled = true
    }
  }, [month])

  const posted = (items ?? []).filter((item) => item.status === 'posted')
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('cc_production.press.eyebrow', 'Pressing · CCCPL/F/PRP/02')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.press.title', 'Press batches')}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t('cc_production.press.lede', 'One record per press load: the loading register (daylight by daylight), the daily production batch report and the heating slip are three views of it. Numbers run F/01, F/02… in each month without gaps.')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Input type="month" className="w-44" value={month} onChange={(event) => setMonth(event.target.value)} aria-label={t('cc_production.resin.month', 'Month')} />
              <Button asChild variant="outline">
                <Link href={`/backend/press/daily-report?date=${todayIso()}`}>
                  <FileText className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.press.dailyReport', 'Daily report')}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/backend/press/loading">
                  <ClipboardList className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.press.loadingRegister', 'Press loading register')}
                </Link>
              </Button>
              {granted.has('cc_production.press.enter') ? (
                <Button asChild>
                  <Link href="/backend/press/batches/new">
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.press.new', 'New batch')}
                  </Link>
                </Button>
              ) : null}
            </div>
          </header>

          {items ? (
            <div className="grid grid-cols-3 gap-3">
              {(
                [
                  [t('cc_production.press.batchesMonth', 'Batches'), String(items.length)],
                  [t('cc_production.press.sheetsMonth', 'Sheets pressed'), String(posted.reduce((sum, item) => sum + item.totalSheets, 0))],
                  [t('cc_production.press.kgMonth', 'kg pressed'), kg(posted.reduce((sum, item) => sum + item.totalKg, 0))],
                ] as Array<[string, string]>
              ).map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border bg-card p-4 shadow-xs">
                  <p className="text-2xl font-bold tabular-nums">{value}</p>
                  <p className="text-sm text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          ) : null}

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {!items ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : !items.length ? (
              <EmptyState className="py-14" variant="subtle" icon={<ClipboardList className="h-5 w-5" aria-hidden="true" />} title={t('cc_production.press.empty', 'No press batches this month')} />
            ) : (
              <ul className="divide-y divide-border">
                {items.map((row) => (
                  <li key={row.id}>
                    <Link href={`/backend/press/batches/${row.id}`} className="group grid grid-cols-1 items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/40 md:grid-cols-12">
                      <div className="md:col-span-3">
                        <p className="font-mono text-sm font-semibold">{row.batchNo}</p>
                        <p className="text-xs text-muted-foreground">
                          {day(row.batchDate)} · {t('cc_production.press.pressShort', 'Press {no}', { no: row.pressNumber })}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground md:col-span-5">{row.sizeLines.map((line, index) => `${line.grade} ${row.paperLines[index]}`).join(' · ')}</p>
                      <p className="text-sm font-semibold tabular-nums md:col-span-2">{kg(row.totalKg)} kg</p>
                      <div className="flex items-center justify-between gap-2 md:col-span-2 md:justify-end">
                        {row.warnings ? <span className="text-xs text-status-warning-text">{row.warnings} ⚠</span> : null}
                        <StatusBadge variant={PRESS_STATUS[row.status].variant} dot>
                          {PRESS_STATUS[row.status].label}
                        </StatusBadge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </PageBody>
    </Page>
  )
}

export function DailyReportPage() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const [date, setDate] = React.useState(params?.get('date') ?? todayIso())
  const [items, setItems] = React.useState<PressBatchRow[] | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setItems(null)
    router.replace(`/backend/press/daily-report?date=${date}`)
    void apiCall<{ items: PressBatchRow[] }>(`/api/cc_production/press/batches?date=${date}`, undefined, { fallback: { items: [] } }).then((call) => {
      if (!cancelled) setItems([...(call.result?.items ?? [])].sort((left, right) => left.seq - right.seq))
    })
    return () => {
      cancelled = true
    }
  }, [date, router])

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">Doc: CCCPL/F/PRP/02</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.press.dailyTitle', 'Daily production batch report')}</h1>
            </div>
            <div className="flex gap-2 print:hidden">
              <Input type="date" className="w-44" value={date} onChange={(event) => setDate(event.target.value)} aria-label={t('cc_production.resin.date', 'Date')} />
              <Button type="button" variant="outline" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.resin.print', 'Print')}
              </Button>
            </div>
          </header>
          <section className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            {!items ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-border bg-muted/50 text-left text-xs uppercase tracking-wide">
                    <th className="px-3 py-2">No.</th>
                    <th className="px-3 py-2">{t('cc_production.resin.date', 'Date')}</th>
                    <th className="px-3 py-2">{t('cc_production.press.batchNo', 'Batch No.')}</th>
                    <th className="px-3 py-2 text-right">{t('cc_production.press.item', 'Item description')}</th>
                    <th className="px-3 py-2">{t('cc_production.press.size', 'Size & total weight')}</th>
                    <th className="px-3 py-2">{t('cc_production.press.checkedBy', 'Checked by')}</th>
                    <th className="px-3 py-2">{t('cc_production.press.remark', 'Remark')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.map((row, index) => (
                    <tr key={row.id} className="align-top">
                      <td className="px-3 py-2">{index + 1}.</td>
                      <td className="px-3 py-2">{index === 0 ? shortDate(row.batchDate) : '"'}</td>
                      <td className="px-3 py-2 font-mono">
                        <Link className="underline-offset-2 hover:underline" href={`/backend/press/batches/${row.id}`}>
                          {row.batchNo}
                        </Link>
                        {row.status !== 'posted' ? <span className="block font-sans text-xs text-muted-foreground">{PRESS_STATUS[row.status].label}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {row.sizeLines.map((line, lineIndex) => (
                          <span key={`${line.grade}-${line.thicknessMm}`} className="block">
                            {lineIndex > 0 && row.sizeLines[lineIndex - 1].grade === line.grade ? '"' : line.grade}
                          </span>
                        ))}
                      </td>
                      <td className="px-3 py-2 font-mono tabular-nums">
                        {row.paperLines.map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                        <span className="block font-semibold">{row.totalKg.toFixed(3)}</span>
                      </td>
                      <td className="px-3 py-2">{row.checkedBy ?? ''}</td>
                      <td className="px-3 py-2">{row.remark ?? ''}</td>
                    </tr>
                  ))}
                  {!items.length ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                        {t('cc_production.press.noneDay', 'No press batches on this day.')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            )}
          </section>
          <p className="text-sm text-muted-foreground">
            {t('cc_production.press.reviewed', 'Reviewed / approved by:')} {(items ?? []).map((row) => row.reviewedBy).filter(Boolean).join(', ') || '—'}
          </p>
        </div>
      </PageBody>
    </Page>
  )
}

export function LoadingRegisterPage() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const [setup, setSetup] = React.useState<PressSetup | null>(null)
  const [pressId, setPressId] = React.useState(params?.get('press') ?? '')
  const [date, setDate] = React.useState(params?.get('date') ?? todayIso())
  const [batches, setBatches] = React.useState<PressBatchView[] | null>(null)

  React.useEffect(() => {
    void apiCall<PressSetup>('/api/cc_production/press/setup').then((call) => {
      if (!call.result) return
      setSetup(call.result)
      setPressId((current) => current || call.result!.presses[0]?.id || '')
    })
  }, [])

  React.useEffect(() => {
    if (!pressId) return
    let cancelled = false
    setBatches(null)
    router.replace(`/backend/press/loading?press=${pressId}&date=${date}`)
    void (async () => {
      const list = await apiCall<{ items: PressBatchRow[] }>(`/api/cc_production/press/batches?date=${date}&pressId=${pressId}`, undefined, { fallback: { items: [] } })
      const views = await Promise.all((list.result?.items ?? []).sort((left, right) => left.seq - right.seq).map(async (row) => (await apiCall<PressBatchView>(`/api/cc_production/press/batches?id=${row.id}`)).result))
      if (!cancelled) setBatches(views.filter((view): view is PressBatchView => Boolean(view)))
    })()
    return () => {
      cancelled = true
    }
  }, [pressId, date, router])

  const press = setup?.presses.find((entry) => entry.id === pressId)
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-4xl flex-col gap-5 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('cc_production.press.loadingRegister', 'Press loading register')}</p>
              <h1 className="text-2xl font-bold tracking-tight">
                {t('cc_production.press.pressShort', 'Press {no}', { no: press?.number ?? '—' })} · {shortDate(date)}
              </h1>
            </div>
            <div className="flex gap-2 print:hidden">
              <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={pressId} onChange={(event) => setPressId(event.target.value)} aria-label={t('cc_production.press.press', 'Press No.')}>
                {(setup?.presses ?? []).map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {t('cc_production.press.pressShort', 'Press {no}', { no: entry.number })}
                  </option>
                ))}
              </select>
              <Input type="date" className="w-44" value={date} onChange={(event) => setDate(event.target.value)} aria-label={t('cc_production.resin.date', 'Date')} />
              <Button type="button" variant="outline" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.resin.print', 'Print')}
              </Button>
            </div>
          </header>
          {!batches ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : !batches.length ? (
            <EmptyState className="py-14" variant="subtle" icon={<ClipboardList className="h-5 w-5" aria-hidden="true" />} title={t('cc_production.press.noneLoad', 'No loads on this press on this day')} />
          ) : (
            batches.map((batch) => {
              const ranges = new Map<number, { minKg: number; maxKg: number }>()
              for (const daylight of batch.daylights) for (const sheet of daylight.sheets) if (sheet.tolerance) ranges.set(sheet.thicknessMm, sheet.tolerance)
              return (
                <section key={batch.id} className="rounded-xl border border-border bg-card p-5 font-mono shadow-sm">
                  <p className="mb-3 font-sans text-sm">
                    <span className="text-muted-foreground">{t('cc_production.press.load', 'Load / batch number')}: </span>
                    <Link className="font-mono font-semibold underline-offset-2 hover:underline" href={`/backend/press/batches/${batch.id}`}>
                      {batch.batchNo}
                    </Link>
                  </p>
                  <ol className="space-y-1.5 text-sm">
                    {batch.daylights.map((daylight) => (
                      <li key={daylight.no} className="flex items-baseline justify-between gap-4 border-b border-dashed border-border pb-1.5">
                        <span className="flex flex-wrap gap-6">
                          <span className="w-6 text-muted-foreground">{daylight.no})</span>
                          {daylight.sheets.map((sheet, index) => (
                            <span key={index} className={sheet.toleranceOk === false ? 'text-status-warning-text' : undefined}>
                              {sheet.thicknessMm} mm{sheet.count > 1 ? ` × ${sheet.count}` : ''} [{weightText(sheet)}]
                            </span>
                          ))}
                        </span>
                        <span className="font-sans text-xs">{[...new Set(daylight.sheets.map((sheet) => sheet.grade))].join(', ')}</span>
                      </li>
                    ))}
                  </ol>
                  {ranges.size ? (
                    <div className="mt-3 text-xs text-muted-foreground">
                      <p className="font-sans font-semibold">{t('cc_production.press.specified', 'Specified range')}</p>
                      {[...ranges.entries()]
                        .sort((left, right) => right[0] - left[0])
                        .map(([thickness, range]) => (
                          <p key={thickness}>
                            × {thickness} = {range.minKg.toFixed(3)} / {range.maxKg.toFixed(3)}
                          </p>
                        ))}
                    </div>
                  ) : null}
                </section>
              )
            })
          )}
        </div>
      </PageBody>
    </Page>
  )
}
