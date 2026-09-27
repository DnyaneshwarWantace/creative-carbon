"use client"

import * as React from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ExportButton } from '../../dermat_products/components/ExportButton'
import { downloadCsv } from '../../dermat_products/lib/csvExport'

type Report = 'overview' | 'ageing' | 'consumption'
type Base = { productId: string; code: string | null; title: string; kind: string | null; unit: string | null }
type OverviewRow = Base & { rm: number; pm: number; production: number; fg: number; underTest: number; onHold: number; total: number; reserved: number; free: number }
type AgeingRow = Base & { d30: number; d90: number; d180: number; older: number; total: number; oldestDays: number; expired: number; expiring90: number }
type UseRow = Base & { used: number; rejected: number; byMonth: Record<string, number> }

const KIND: Record<string, string> = { raw_material: 'RM', packing_material: 'PM', bulk: 'Bulk', finished_goods: 'FG' }

function qty(value: number): string {
  return value ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value) : '—'
}

function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
}

export function InventoryReports() {
  const t = useT()
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const [report, setReport] = React.useState<Report>('overview')
  const [search, setSearch] = React.useState('')
  const [kind, setKind] = React.useState<string>('all')
  const [from, setFrom] = React.useState(`${today.slice(0, 5)}${String(Math.max(1, Number(today.slice(5, 7)) - 2)).padStart(2, '0')}-01`)
  const [to, setTo] = React.useState(today)
  const [data, setData] = React.useState<{ items: Array<OverviewRow | AgeingRow | UseRow>; months?: string[] } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setData(null)
    const query = new URLSearchParams({ type: report })
    if (report === 'consumption') {
      query.set('from', from)
      query.set('to', to)
    }
    apiCall<{ items?: Array<OverviewRow | AgeingRow | UseRow>; months?: string[]; error?: string }>(`/api/dermat_store/reports?${query.toString()}`).then((call) => {
      if (!call.ok) setError(call.result?.error ?? t('dermat_store.reports.loadError', 'Could not load the report.'))
      else {
        setError(null)
        setData({ items: call.result?.items ?? [], months: call.result?.months })
      }
    })
  }, [report, from, to, t])

  const term = search.trim().toLowerCase()
  const rows = (data?.items ?? []).filter((row) => (kind === 'all' || row.kind === kind) && (!term || row.title.toLowerCase().includes(term) || (row.code ?? '').toLowerCase().includes(term)))

  const nameCell = (row: Base) => (
    <td className="px-3 py-2">
      <Link href={`/backend/store/ledger?productId=${row.productId}`} className="font-medium hover:underline">
        {row.title}
      </Link>
      <span className="block text-xs text-muted-foreground">
        <span className="font-mono">{row.code ?? '—'}</span> · {KIND[row.kind ?? ''] ?? row.kind} · {row.unit ?? ''}
      </span>
    </td>
  )

  const exportCsv = () => {
    if (report === 'overview') {
      downloadCsv('stock-overview', [
        { header: 'Code', value: (row: OverviewRow) => row.code },
        { header: 'Material', value: (row) => row.title },
        { header: 'Type', value: (row) => KIND[row.kind ?? ''] ?? row.kind },
        { header: 'Unit', value: (row) => row.unit },
        { header: 'RM store', value: (row) => row.rm },
        { header: 'PM store', value: (row) => row.pm },
        { header: 'Production floor', value: (row) => row.production },
        { header: 'FG store', value: (row) => row.fg },
        { header: 'Under QC test', value: (row) => row.underTest },
        { header: 'Rejected / on hold', value: (row) => row.onHold },
        { header: 'Reserved', value: (row) => row.reserved },
        { header: 'Free in stores', value: (row) => row.free },
      ], rows as OverviewRow[])
    } else if (report === 'ageing') {
      downloadCsv('stock-ageing', [
        { header: 'Code', value: (row: AgeingRow) => row.code },
        { header: 'Material', value: (row) => row.title },
        { header: 'Unit', value: (row) => row.unit },
        { header: '0-30 days', value: (row) => row.d30 },
        { header: '31-90 days', value: (row) => row.d90 },
        { header: '91-180 days', value: (row) => row.d180 },
        { header: 'Over 180 days', value: (row) => row.older },
        { header: 'Oldest (days)', value: (row) => row.oldestDays },
        { header: 'Expired', value: (row) => row.expired },
        { header: 'Expiring in 90 days', value: (row) => row.expiring90 },
      ], rows as AgeingRow[])
    } else {
      const months = data?.months ?? []
      downloadCsv(`consumption-${from}-${to}`, [
        { header: 'Code', value: (row: UseRow) => row.code },
        { header: 'Material', value: (row) => row.title },
        { header: 'Unit', value: (row) => row.unit },
        ...months.map((month) => ({ header: month, value: (row: UseRow) => row.byMonth[month] ?? 0 })),
        { header: 'Used', value: (row) => row.used },
        { header: 'Written off (rejected)', value: (row) => row.rejected },
      ], rows as UseRow[])
    }
  }

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_store.reports.title', 'Inventory reports')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('dermat_store.reports.lede', 'Where every material sits, how long it has been in store, and how much production used.')}</p>
            </div>
            <ExportButton size="sm" disabled={!rows.length} onExport={exportCsv} />
          </header>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <SegmentedControl value={report} onValueChange={(value) => setReport(value as Report)} aria-label={t('dermat_store.reports.which', 'Report')}>
              <SegmentedControlItem value="overview">{t('dermat_store.reports.overview', 'Stock overview')}</SegmentedControlItem>
              <SegmentedControlItem value="ageing">{t('dermat_store.reports.ageing', 'Stock ageing')}</SegmentedControlItem>
              <SegmentedControlItem value="consumption">{t('dermat_store.reports.consumption', 'Consumption')}</SegmentedControlItem>
            </SegmentedControl>
            <div className="flex flex-wrap items-end gap-2">
              {report === 'consumption' ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="rep-from" className="text-xs text-muted-foreground">{t('dermat_store.reports.from', 'From')}</Label>
                    <Input id="rep-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="w-40" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="rep-to" className="text-xs text-muted-foreground">{t('dermat_store.reports.to', 'To')}</Label>
                    <Input id="rep-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} className="w-40" />
                  </div>
                </>
              ) : null}
              <SegmentedControl value={kind} onValueChange={setKind} aria-label={t('dermat_store.reports.kind', 'Material type')}>
                <SegmentedControlItem value="all">{t('dermat_store.reports.all', 'All')}</SegmentedControlItem>
                <SegmentedControlItem value="raw_material">RM</SegmentedControlItem>
                <SegmentedControlItem value="packing_material">PM</SegmentedControlItem>
                <SegmentedControlItem value="bulk">{t('dermat_store.reports.bulk', 'Bulk')}</SegmentedControlItem>
                <SegmentedControlItem value="finished_goods">FG</SegmentedControlItem>
              </SegmentedControl>
              <div className="relative w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('dermat_store.reports.search', 'Code or name')} className="pl-9" aria-label={t('dermat_store.reports.search', 'Code or name')} />
              </div>
            </div>
          </div>

          {error ? <ErrorMessage label={error} /> : null}
          {!data && !error ? <LoadingMessage label={t('dermat_store.reports.loading', 'Loading…')} /> : null}
          {data ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  {report === 'overview' ? (
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">{t('dermat_store.reports.material', 'Material')}</th>
                      {['RM store', 'PM store', 'Production floor', 'FG store', 'Under QC test', 'Rejected / hold', 'Reserved', 'Free in stores'].map((label) => (
                        <th key={label} className="px-3 py-2 text-right font-semibold">{label}</th>
                      ))}
                    </tr>
                  ) : report === 'ageing' ? (
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">{t('dermat_store.reports.material', 'Material')}</th>
                      {['0–30 d', '31–90 d', '91–180 d', 'Over 180 d', 'Oldest', 'Expired', 'Expiring ≤ 90 d'].map((label) => (
                        <th key={label} className="px-3 py-2 text-right font-semibold">{label}</th>
                      ))}
                    </tr>
                  ) : (
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">{t('dermat_store.reports.material', 'Material')}</th>
                      {(data.months ?? []).map((month) => (
                        <th key={month} className="px-3 py-2 text-right font-semibold">{monthLabel(month)}</th>
                      ))}
                      <th className="px-3 py-2 text-right font-semibold">{t('dermat_store.reports.used', 'Used')}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t('dermat_store.reports.rejected', 'Written off')}</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.productId} className="hover:bg-muted/30">
                      {nameCell(row)}
                      {report === 'overview'
                        ? (() => {
                            const r = row as OverviewRow
                            return [r.rm, r.pm, r.production, r.fg].map((value, index) => <td key={index} className="px-3 py-2 text-right tabular-nums">{qty(value)}</td>).concat([
                              <td key="test" className={cn('px-3 py-2 text-right tabular-nums', r.underTest && 'text-status-warning-text')}>{qty(r.underTest)}</td>,
                              <td key="hold" className={cn('px-3 py-2 text-right tabular-nums', r.onHold && 'text-status-error-text')}>{qty(r.onHold)}</td>,
                              <td key="res" className="px-3 py-2 text-right tabular-nums text-muted-foreground">{qty(r.reserved)}</td>,
                              <td key="free" className="px-3 py-2 text-right font-semibold tabular-nums">{qty(r.free)}</td>,
                            ])
                          })()
                        : report === 'ageing'
                          ? (() => {
                              const r = row as AgeingRow
                              return [
                                ...[r.d30, r.d90, r.d180].map((value, index) => <td key={index} className="px-3 py-2 text-right tabular-nums">{qty(value)}</td>),
                                <td key="older" className={cn('px-3 py-2 text-right tabular-nums', r.older && 'font-medium text-status-warning-text')}>{qty(r.older)}</td>,
                                <td key="oldest" className="px-3 py-2 text-right tabular-nums text-muted-foreground">{t('dermat_store.reports.days', '{days} d', { days: r.oldestDays })}</td>,
                                <td key="expired" className={cn('px-3 py-2 text-right tabular-nums', r.expired && 'font-medium text-status-error-text')}>{qty(r.expired)}</td>,
                                <td key="soon" className={cn('px-3 py-2 text-right tabular-nums', r.expiring90 && 'text-status-warning-text')}>{qty(r.expiring90)}</td>,
                              ]
                            })()
                          : (() => {
                              const r = row as UseRow
                              return [
                                ...(data.months ?? []).map((month) => <td key={month} className="px-3 py-2 text-right tabular-nums">{qty(r.byMonth[month] ?? 0)}</td>),
                                <td key="used" className="px-3 py-2 text-right font-semibold tabular-nums">{qty(r.used)}</td>,
                                <td key="rej" className={cn('px-3 py-2 text-right tabular-nums', r.rejected && 'text-status-error-text')}>{qty(r.rejected)}</td>,
                              ]
                            })()}
                    </tr>
                  ))}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={12} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        {report === 'consumption' ? t('dermat_store.reports.noUse', 'Nothing was used in production in these dates.') : t('dermat_store.reports.empty', 'No stock matches.')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      </PageBody>
    </Page>
  )
}

export default InventoryReports
