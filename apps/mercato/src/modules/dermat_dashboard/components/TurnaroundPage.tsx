"use client"

import * as React from 'react'
import Link from 'next/link'
import { Timer } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ExportButton } from '../../dermat_products/components/ExportButton'
import { downloadCsv } from '../../dermat_products/lib/csvExport'

type Data = {
  days: number
  completedSteps: number
  averageDays: number | null
  stages: Array<{ key: string; label: string; department: string; completed: number; averageDays: number; slowestDays: number }>
  people: Array<{ name: string; completed: number; averageDays: number | null; openNow: number; oldestOpenDays: number }>
  slowest: Array<{ orderId: string; orderNo: string; stageKey: string; stageLabel: string; person: string; days: number; completedAt: string }>
}

function d(value: number | null): string {
  return value === null ? '—' : `${value} d`
}

export function TurnaroundPage() {
  const t = useT()
  const [days, setDays] = React.useState('90')
  const [data, setData] = React.useState<Data | null>(null)

  React.useEffect(() => {
    setData(null)
    apiCall<Data>(`/api/dermat_dashboard/turnaround?days=${days}`).then((call) => setData(call.result ?? null))
  }, [days])

  const maxStage = Math.max(1, ...(data?.stages ?? []).map((row) => row.averageDays))
  const maxPerson = Math.max(1, ...(data?.people ?? []).map((row) => row.averageDays ?? 0))

  const exportTurnaround = () => {
    if (!data) return
    type Line = { section: string; name: string; department: string; order: string; completed: number | string; average: number | string; slowest: number | string; openNow: number | string; oldestOpen: number | string }
    const lines: Line[] = [
      ...data.stages.map((row) => ({ section: 'Stage', name: row.label, department: row.department, order: '', completed: row.completed, average: row.averageDays, slowest: row.slowestDays, openNow: '', oldestOpen: '' })),
      ...data.people.map((row) => ({ section: 'Person', name: row.name, department: '', order: '', completed: row.completed, average: row.averageDays ?? '', slowest: '', openNow: row.openNow, oldestOpen: row.oldestOpenDays })),
      ...data.slowest.map((row) => ({ section: 'Slowest step', name: row.person, department: row.stageLabel, order: row.orderNo, completed: row.completedAt.slice(0, 10), average: row.days, slowest: '', openNow: '', oldestOpen: '' })),
    ]
    downloadCsv(`turnaround-${days}-days`, [
      { header: 'Section', value: (row) => row.section },
      { header: 'Stage / person', value: (row) => row.name },
      { header: 'Department / stage', value: (row) => row.department },
      { header: 'Order', value: (row) => row.order },
      { header: 'Steps finished / done on', value: (row) => row.completed },
      { header: 'Average days / days taken', value: (row) => row.average },
      { header: 'Slowest days', value: (row) => row.slowest },
      { header: 'Open now', value: (row) => row.openNow },
      { header: 'Oldest open (days)', value: (row) => row.oldestOpen },
    ], lines)
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-16">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('dermat_dashboard.eyebrow', 'Overview')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_dashboard.tat.title', 'Turnaround')}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">{t('dermat_dashboard.tat.lede', 'How many days each stage and each person takes to clear a step, from finished steps.')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl value={days} onValueChange={setDays} aria-label={t('dermat_dashboard.tat.period', 'Period')}>
                <SegmentedControlItem value="30">30 d</SegmentedControlItem>
                <SegmentedControlItem value="90">90 d</SegmentedControlItem>
                <SegmentedControlItem value="180">180 d</SegmentedControlItem>
              </SegmentedControl>
              <ExportButton disabled={!data?.completedSteps} onExport={exportTurnaround} />
            </div>
          </header>

          {!data ? (
            <div className="flex justify-center py-20">
              <Spinner />
            </div>
          ) : !data.completedSteps ? (
            <EmptyState className="py-20" icon={<Timer className="h-5 w-5" aria-hidden="true" />} title={t('dermat_dashboard.tat.empty', 'No finished steps in this period')} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                <div className="rounded-lg border bg-card p-4 shadow-xs">
                  <p className="text-2xl font-bold tabular-nums">{data.completedSteps}</p>
                  <p className="text-xs text-muted-foreground">{t('dermat_dashboard.tat.steps', 'Steps finished')}</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-xs">
                  <p className="text-2xl font-bold tabular-nums">{d(data.averageDays)}</p>
                  <p className="text-xs text-muted-foreground">{t('dermat_dashboard.tat.avg', 'Average per step')}</p>
                </div>
                <div className="rounded-lg border bg-card p-4 shadow-xs">
                  <p className="text-2xl font-bold tabular-nums">{data.stages[0]?.label ?? '—'}</p>
                  <p className="text-xs text-muted-foreground">{t('dermat_dashboard.tat.slowStage', 'Slowest stage on average')}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                  <h2 className="border-b px-5 py-4 text-sm font-semibold">{t('dermat_dashboard.tat.byStage', 'By stage')}</h2>
                  <ul className="divide-y">
                    {data.stages.map((row) => (
                      <li key={row.key} className="grid grid-cols-12 items-center gap-3 px-5 py-3">
                        <span className="col-span-4 min-w-0">
                          <span className="block truncate text-sm font-medium">{row.label}</span>
                          <span className="block truncate text-xs text-muted-foreground">{row.department}</span>
                        </span>
                        <span className="col-span-5 h-2 overflow-hidden rounded-full bg-input" aria-hidden="true">
                          <span className="block h-full rounded-full bg-accent-indigo" style={{ width: `${(row.averageDays / maxStage) * 100}%` }} />
                        </span>
                        <span className="col-span-3 text-right text-xs tabular-nums">
                          <span className="block text-sm font-semibold">{d(row.averageDays)}</span>
                          <span className="text-muted-foreground">
                            {row.completed} · {t('dermat_dashboard.tat.max', 'max {days}', { days: d(row.slowestDays) })}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>

                <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                  <h2 className="border-b px-5 py-4 text-sm font-semibold">{t('dermat_dashboard.tat.byPerson', 'By person')}</h2>
                  <ul className="divide-y">
                    {data.people.map((row) => (
                      <li key={row.name} className="grid grid-cols-12 items-center gap-3 px-5 py-3">
                        <span className={cn('col-span-4 truncate text-sm font-medium', row.name === 'Not assigned' && 'italic text-muted-foreground')}>{row.name}</span>
                        <span className="col-span-4 h-2 overflow-hidden rounded-full bg-input" aria-hidden="true">
                          <span className="block h-full rounded-full bg-accent-indigo" style={{ width: `${((row.averageDays ?? 0) / maxPerson) * 100}%` }} />
                        </span>
                        <span className="col-span-4 text-right text-xs tabular-nums">
                          <span className="block text-sm font-semibold">{d(row.averageDays)}</span>
                          <span className={cn('text-muted-foreground', row.oldestOpenDays >= 8 && 'font-semibold text-status-error-text')}>
                            {row.completed} {t('dermat_dashboard.tat.done', 'done')} · {row.openNow} {t('dermat_dashboard.tat.open', 'open')}
                            {row.openNow ? ` · ${t('dermat_dashboard.tat.oldest', 'oldest {days}', { days: d(row.oldestOpenDays) })}` : ''}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </div>

              <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
                <h2 className="border-b px-5 py-4 text-sm font-semibold">{t('dermat_dashboard.tat.slowest', 'Slowest finished steps')}</h2>
                <ul className="divide-y">
                  {data.slowest.map((row) => (
                    <li key={`${row.orderId}-${row.stageKey}`}>
                      <Link href={`/backend/orders/${row.orderId}/stages/${row.stageKey}`} className="grid grid-cols-12 items-center gap-3 px-5 py-3 hover:bg-muted/40">
                        <span className="col-span-3 font-mono text-sm font-semibold">{row.orderNo}</span>
                        <span className="col-span-4 truncate text-sm">{row.stageLabel}</span>
                        <span className="col-span-3 truncate text-xs text-muted-foreground">{row.person}</span>
                        <span className="col-span-2 text-right text-sm font-semibold tabular-nums">{d(row.days)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default TurnaroundPage
