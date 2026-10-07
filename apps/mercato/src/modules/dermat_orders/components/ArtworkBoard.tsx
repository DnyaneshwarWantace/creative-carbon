"use client"

import * as React from 'react'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { HorizontalScroll } from '@open-mercato/ui/primitives/drag-scroll'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ExportButton } from '../../dermat_products/components/ExportButton'
import { downloadCsv } from '../../dermat_products/lib/csvExport'
import { formatDate, formatQty } from './format'

type Job = {
  orderId: string
  orderNo: string
  customer: string | null
  priority: string
  deliveryDate: string | null
  status: string
  designerStatus: string | null
  note: string | null
  steps: Array<{ key: string; label: string; done: boolean; at: string | null }>
  progress: string
  next: string | null
  responsibleName: string | null
  days: number | null
  itemsReady: number
  itemsTotal: number
}
type Item = { orderId: string; orderNo: string; customer: string | null; priority: string; productId: string; title: string; code: string | null; unit: string; quantity: number; status: string | null; note: string | null; at: string | null; by: string | null }

const STATUS_TONE: Record<string, string> = {
  'PM OK': 'bg-status-success-bg text-status-success-text',
  'Half PM OK': 'bg-status-info-bg text-status-info-text',
  'Client Side': 'bg-status-warning-bg text-status-warning-text',
  Hold: 'bg-status-error-bg text-status-error-text',
  'Need to Order PM': 'bg-status-error-bg text-status-error-text',
}

export function ArtworkBoard() {
  const t = useT()
  const [tab, setTab] = React.useState<'jobs' | 'pm'>('jobs')
  const [data, setData] = React.useState<{ jobs: Job[]; items: Item[] } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [statusFilter, setStatusFilter] = React.useState<string | null>(null)

  React.useEffect(() => {
    apiCall<{ jobs?: Job[]; items?: Item[]; error?: string }>('/api/dermat_orders/artwork-board').then((call) => {
      if (!call.ok) setError(call.result?.error ?? t('dermat_orders.artworkBoard.loadError', 'Could not load the artwork board.'))
      else setData({ jobs: call.result?.jobs ?? [], items: call.result?.items ?? [] })
    })
  }, [t])

  const counts = React.useMemo(() => {
    const map = new Map<string, number>()
    for (const item of data?.items ?? []) map.set(item.status ?? 'No status', (map.get(item.status ?? 'No status') ?? 0) + 1)
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [data])
  const items = (data?.items ?? []).filter((item) => !statusFilter || (item.status ?? 'No status') === statusFilter)

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_orders.artworkBoard.title', 'Artwork & PM board')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('dermat_orders.artworkBoard.lede', 'Every open artwork job and the status of every packing item across all orders.')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl value={tab} onValueChange={(value) => setTab(value as 'jobs' | 'pm')} aria-label={t('dermat_orders.artworkBoard.view', 'View')}>
                <SegmentedControlItem value="jobs">{t('dermat_orders.artworkBoard.jobs', 'Artwork jobs ({count})', { count: data?.jobs.length ?? 0 })}</SegmentedControlItem>
                <SegmentedControlItem value="pm">{t('dermat_orders.artworkBoard.pm', 'Packing items ({count})', { count: data?.items.length ?? 0 })}</SegmentedControlItem>
              </SegmentedControl>
              <ExportButton
                size="sm"
                disabled={!data}
                onExport={() =>
                  tab === 'jobs'
                    ? downloadCsv('artwork-jobs', [
                        { header: 'Order', value: (row: Job) => row.orderNo },
                        { header: 'Customer', value: (row) => row.customer },
                        { header: 'Designer status', value: (row) => row.designerStatus },
                        { header: 'Progress', value: (row) => row.progress },
                        { header: 'Next step', value: (row) => row.next },
                        { header: 'Packing items ready', value: (row) => `${row.itemsReady}/${row.itemsTotal}` },
                        { header: 'Days open', value: (row) => row.days },
                        { header: 'Note', value: (row) => row.note },
                      ], data?.jobs ?? [])
                    : downloadCsv('pm-status', [
                        { header: 'Order', value: (row: Item) => row.orderNo },
                        { header: 'Customer', value: (row) => row.customer },
                        { header: 'Code', value: (row) => row.code },
                        { header: 'Packing item', value: (row) => row.title },
                        { header: 'Quantity', value: (row) => row.quantity },
                        { header: 'Status', value: (row) => row.status },
                        { header: 'Note', value: (row) => row.note },
                        { header: 'Updated', value: (row) => row.at },
                      ], items)
                }
              />
            </div>
          </header>

          {error ? <ErrorMessage label={error} /> : null}
          {!data && !error ? <LoadingMessage label={t('dermat_orders.artworkBoard.loading', 'Loading…')} /> : null}

          {data && tab === 'jobs' ? (
            <HorizontalScroll showButtons showGradients step={300} className="rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.artworkBoard.colOrder', 'Order')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.artworkBoard.colSteps', 'Design → client → QA → PM ordered → PM OK')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.artworkBoard.colStatus', 'Designer status')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('dermat_orders.artworkBoard.colItems', 'Items ready')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('dermat_orders.artworkBoard.colDays', 'Days')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.jobs.map((job) => (
                    <tr key={job.orderId} className="align-top hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link href={`/backend/orders/${job.orderId}?stage=artwork`} className="font-mono font-medium hover:underline">
                          {job.orderNo}
                        </Link>
                        {job.priority === 'urgent' ? <span className="ml-2 rounded-sm bg-status-error-bg px-1.5 py-0.5 text-xs text-status-error-text">{t('dermat_orders.priority.urgent', 'Urgent')}</span> : null}
                        <span className="block">{job.customer ?? '—'}</span>
                        {job.deliveryDate ? <span className="block text-xs text-muted-foreground">{t('dermat_orders.artworkBoard.due', 'Delivery {date}', { date: formatDate(job.deliveryDate) })}</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <ol className="flex flex-wrap items-center gap-1" aria-label={job.progress}>
                          {job.steps.map((step) => (
                            <li key={step.key} title={step.label} className={cn('flex h-6 items-center gap-1 rounded-full border px-2 text-xs', step.done ? 'border-status-success-border bg-status-success-bg text-status-success-text' : step.label === job.next ? 'border-status-warning-border text-status-warning-text' : 'text-muted-foreground')}>
                              {step.done ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                              {step.label.split(' ')[0]}
                            </li>
                          ))}
                        </ol>
                        {job.next ? <p className="mt-1 text-xs text-muted-foreground">{t('dermat_orders.artworkBoard.next', 'Next: {step}', { step: job.next })}</p> : null}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {job.designerStatus ? <span className={cn('rounded-sm px-1.5 py-0.5 font-medium', STATUS_TONE[job.designerStatus] ?? 'bg-muted')}>{job.designerStatus}</span> : '—'}
                        {job.note ? <span className="mt-1 block text-muted-foreground">{job.note}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {job.itemsReady}/{job.itemsTotal}
                      </td>
                      <td className={cn('px-3 py-2 text-right tabular-nums', (job.days ?? 0) > 10 && 'font-medium text-status-error-text')}>{job.days ?? '—'}</td>
                    </tr>
                  ))}
                  {!data.jobs.length ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        {t('dermat_orders.artworkBoard.noJobs', 'No artwork job is open.')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </HorizontalScroll>
          ) : null}

          {data && tab === 'pm' ? (
            <>
              <div className="flex flex-wrap gap-2" role="group" aria-label={t('dermat_orders.artworkBoard.filter', 'Filter by status')}>
                <button type="button" onClick={() => setStatusFilter(null)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', !statusFilter ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                  {t('dermat_orders.artworkBoard.all', 'All')} {data.items.length}
                </button>
                {counts.map(([status, count]) => (
                  <button key={status} type="button" onClick={() => setStatusFilter(status)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', statusFilter === status ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                    {status} {count}
                  </button>
                ))}
              </div>
              <HorizontalScroll showButtons showGradients step={300} className="rounded-lg border bg-card">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.artworkBoard.colOrder', 'Order')}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.artworkBoard.colItem', 'Packing item')}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t('dermat_orders.artworkBoard.colQty', 'Quantity')}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.artworkBoard.colStatus', 'Designer status')}</th>
                      <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.artworkBoard.colUpdated', 'Updated')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item) => (
                      <tr key={`${item.orderId}-${item.productId}`} className="hover:bg-muted/30">
                        <td className="px-3 py-2">
                          <Link href={`/backend/orders/${item.orderId}?stage=artwork`} className="font-mono hover:underline">
                            {item.orderNo}
                          </Link>
                          <span className="block text-xs text-muted-foreground">{item.customer ?? ''}</span>
                        </td>
                        <td className="px-3 py-2">
                          {item.title}
                          <span className="block font-mono text-xs text-muted-foreground">{item.code ?? '—'}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatQty(item.quantity, 0)} {item.unit}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span className={cn('rounded-sm px-1.5 py-0.5 font-medium', item.status ? STATUS_TONE[item.status] ?? 'bg-muted' : 'bg-muted text-muted-foreground')}>{item.status ?? t('dermat_orders.artworkBoard.noStatus', 'No status')}</span>
                          {item.note ? <span className="mt-1 block text-muted-foreground">{item.note}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {item.at ? new Date(item.at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
                          {item.by ? ` · ${item.by}` : ''}
                        </td>
                      </tr>
                    ))}
                    {!items.length ? (
                      <tr>
                        <td colSpan={5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                          {t('dermat_orders.artworkBoard.noItems', 'No packing items on open artwork jobs.')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </HorizontalScroll>
            </>
          ) : null}
        </div>
      </PageBody>
    </Page>
  )
}

export default ArtworkBoard
