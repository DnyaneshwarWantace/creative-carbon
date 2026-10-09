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
import { PlantTable } from '../PlantTable'
import { Dropdown } from '../../../cc_lists/components/Dropdown'

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
  const [grades, setGrades] = React.useState<string[]>([])

  React.useEffect(() => {
    void apiCall<{ grades: string[] }>('/api/cc_production/resin/setup').then((call) => setGrades(call.result?.grades ?? []))
  }, [])

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
            <div className="w-full sm:w-48">
              <Dropdown className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={grade} onChange={(event) => setGrade(event.target.value)} aria-label={t('cc_production.resin.grade', 'Grade')}>
                <option value="">{t('cc_production.resin.allGrades', 'All grades')}</option>
                {grades.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Dropdown>
            </div>
            <Input type="month" className="w-44" value={month} onChange={(event) => setMonth(event.target.value)} aria-label={t('cc_production.resin.month', 'Month')} />
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('cc_production.resin.search', 'Batch No.')} />
            </div>
          </div>

          {!items ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <PlantTable
              tableId="cc_production.resin_batches"
              rows={items}
              rowKey={(row) => row.id}
              rowHref={(row) => `/backend/resin/batches/${row.id}`}
              empty={<EmptyState className="py-14" variant="subtle" icon={<FlaskConical className="h-5 w-5" aria-hidden="true" />} title={t('cc_production.resin.empty', 'No resin batches here')} description={t('cc_production.resin.emptyHint', 'Enter the batch report from the resin plant.')} />}
              columns={[
                { key: 'batchNo', label: t('cc_production.resin.batchNo', 'Batch No.'), alwaysVisible: true, render: (row) => <span className="font-mono font-semibold">{row.batchNo}</span> },
                { key: 'date', label: t('cc_production.resin.date', 'Date'), render: (row) => day(row.batchDate) },
                { key: 'vessel', label: t('cc_production.resin.vessel', 'Vessel'), render: (row) => row.reactorCode },
                { key: 'grade', label: t('cc_production.resin.grade', 'Grade'), render: (row) => row.grade },
                { key: 'input', label: t('cc_production.resin.totalInput', 'Total input'), align: 'right', render: (row) => `${kg(row.totalInputKg)} kg` },
                { key: 'yield', label: t('cc_production.resin.yield', 'Resin yield (kg)'), align: 'right', render: (row) => kg(row.yieldKg) },
                { key: 'yieldPct', label: t('cc_production.resin.yieldPct', 'Yield'), align: 'right', render: (row) => (row.yieldPct === null ? '—' : `${row.yieldPct}%`) },
                { key: 'signed', label: t('cc_production.resin.signoff', 'Sign-off'), render: (row) => (row.chemistSigned && row.inchargeSigned ? '✓ both' : row.chemistSigned || row.inchargeSigned ? 'one of two' : '—') },
                { key: 'failReason', label: t('cc_production.resin.failReason', 'What happened'), hidden: true, render: (row) => row.failReason ?? '' },
                { key: 'status', label: t('cc_production.resin.status', 'Status'), render: (row) => <StatusBadge variant={RESIN_STATUS[row.status].variant} dot>{RESIN_STATUS[row.status].label}</StatusBadge> },
              ]}
            />
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default ResinBatchesPage
