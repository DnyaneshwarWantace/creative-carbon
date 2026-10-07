"use client"

import * as React from 'react'
import Link from 'next/link'
import { BookOpen, ChevronRight, FlaskConical, Plus, Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { RESIN_STATUS, day, kg, type BatchRow, type ResinStatus } from './shared'

type View = ResinStatus | 'all'

export function ResinBatchesPage() {
  const t = useT()
  const granted = useGranted()
  const [view, setView] = React.useState<View>('all')
  const [grade, setGrade] = React.useState('')
  const [month, setMonth] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [items, setItems] = React.useState<BatchRow[] | null>(null)
  const [counts, setCounts] = React.useState<Record<string, number>>({})

  React.useEffect(() => {
    let cancelled = false
    setItems(null)
    const handle = window.setTimeout(async () => {
      const params = new URLSearchParams({ status: view, pageSize: '100' })
      if (grade) params.set('grade', grade)
      if (month) params.set('month', month)
      if (search.trim()) params.set('search', search.trim())
      const call = await apiCall<{ items: BatchRow[]; counts: Record<string, number> }>(`/api/cc_production/resin/batches?${params.toString()}`, undefined, { fallback: { items: [], counts: {} } })
      if (cancelled) return
      setItems(call.result?.items ?? [])
      setCounts(call.result?.counts ?? {})
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [view, grade, month, search])

  const tiles: Array<{ view: ResinStatus; label: string; tone: string }> = [
    { view: 'draft', label: t('cc_production.resin.tile.draft', 'Not posted yet'), tone: 'bg-status-warning-bg text-status-warning-icon' },
    { view: 'posted', label: t('cc_production.resin.tile.posted', 'Posted'), tone: 'bg-status-success-bg text-status-success-icon' },
    { view: 'failed', label: t('cc_production.resin.tile.failed', 'Failed'), tone: 'bg-status-error-bg text-status-error-icon' },
  ]

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('cc_production.resin.eyebrow', 'Resin plant · CCCPL/F/QC/03')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.resin.title', 'Resin batches')}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t('cc_production.resin.lede', 'One page per batch, as on the phenol formaldehyde resin batch report. Posting takes the chemicals out of stock, oldest lot first, and puts the resin into the resin tank.')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/backend/resin/chemical-register">
                  <BookOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.resin.register', 'Chemical register')}
                </Link>
              </Button>
              {granted.has('cc_production.resin.enter') ? (
                <Button asChild>
                  <Link href="/backend/resin/batches/new">
                    <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.resin.new', 'New batch')}
                  </Link>
                </Button>
              ) : null}
            </div>
          </header>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {tiles.map((tile) => {
              const active = view === tile.view
              return (
                <button
                  key={tile.view}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setView(active ? 'all' : tile.view)}
                  className={cn('flex items-center gap-3 rounded-lg border bg-card p-4 text-left shadow-xs transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', active ? 'border-primary ring-1 ring-primary' : 'border-border')}
                >
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tile.tone)} aria-hidden="true">
                    <FlaskConical className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-2xl font-bold leading-none tabular-nums">{counts[tile.view] ?? 0}</span>
                    <span className="mt-1 block text-sm font-medium">{tile.label}</span>
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={grade} onChange={(event) => setGrade(event.target.value)} aria-label={t('cc_production.resin.grade', 'Grade')}>
              <option value="">{t('cc_production.resin.allGrades', 'All grades')}</option>
              {['PFC', 'PFA', 'PFAC', 'E-GLASS'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <Input type="month" className="w-44" value={month} onChange={(event) => setMonth(event.target.value)} aria-label={t('cc_production.resin.month', 'Month')} />
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('cc_production.resin.search', 'Batch No.')} />
            </div>
          </div>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {!items ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : !items.length ? (
              <EmptyState className="py-14" variant="subtle" icon={<FlaskConical className="h-5 w-5" aria-hidden="true" />} title={t('cc_production.resin.empty', 'No resin batches here')} description={t('cc_production.resin.emptyHint', 'Enter the batch report from the resin plant.')} />
            ) : (
              <ul className="divide-y divide-border">
                {items.map((row) => (
                  <li key={row.id}>
                    <Link href={`/backend/resin/batches/${row.id}`} className="group grid grid-cols-1 items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/40 md:grid-cols-12">
                      <div className="md:col-span-4">
                        <p className="font-mono text-sm font-semibold">{row.batchNo}</p>
                        <p className="text-xs text-muted-foreground">
                          {day(row.batchDate)} · {row.reactorCode}
                        </p>
                      </div>
                      <p className="text-sm font-medium md:col-span-2">{row.grade}</p>
                      <p className="text-sm tabular-nums md:col-span-3">
                        {kg(row.totalInputKg)} kg → {kg(row.yieldKg)} kg
                        {row.yieldPct !== null ? <span className="ml-1 text-muted-foreground">({row.yieldPct}%)</span> : null}
                      </p>
                      <div className="flex items-center justify-between gap-2 md:col-span-3 md:justify-end">
                        {row.status !== 'draft' && !(row.chemistSigned && row.inchargeSigned) ? <span className="text-xs text-muted-foreground">{t('cc_production.resin.unsigned', 'Sign-off pending')}</span> : null}
                        <StatusBadge variant={RESIN_STATUS[row.status].variant} dot>
                          {RESIN_STATUS[row.status].label}
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

export default ResinBatchesPage
