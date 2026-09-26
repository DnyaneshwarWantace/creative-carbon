"use client"

import * as React from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ExportButton } from '../../dermat_products/components/ExportButton'
import { downloadCsv } from '../../dermat_products/lib/csvExport'
import { formatDate, formatQty } from './format'

export type BatchStatus = 'manufacturing' | 'filling' | 'packing' | 'qa' | 'released' | 'rework' | 'rejected' | 'dispatched'

export const BATCH_STATUS: Record<BatchStatus, { label: string; variant: StatusBadgeVariant }> = {
  manufacturing: { label: 'In manufacturing', variant: 'info' },
  filling: { label: 'Filling', variant: 'info' },
  packing: { label: 'Packing', variant: 'info' },
  qa: { label: 'Waiting for QA', variant: 'warning' },
  released: { label: 'Released', variant: 'success' },
  rework: { label: 'Rework', variant: 'warning' },
  rejected: { label: 'Rejected', variant: 'error' },
  dispatched: { label: 'Dispatched', variant: 'neutral' },
}

export type BatchRow = {
  batchNo: string
  status: BatchStatus
  orders: Array<{ id: string; orderNo: string; customer: string | null }>
  products: Array<{ productId: string; title: string; code: string | null; quantity: number }>
  bulkSource: string | null
  mfgDate: string | null
  bulkKg: number | null
  wastageKg: number | null
  shift: string | null
  vessel: string | null
  operator: string | null
  ordered: number
  filled: number | null
  rejectedUnits: number | null
  packed: number | null
  packedYield: number | null
  qa: { result: string | null; releasedOn: string | null; coaNo: string | null; retentionQty: number | null; retentionLocation: string | null }
  qc: { total: number; open: number; failed: number; passed: number }
  reworkRounds: number
}

const ORDER: BatchStatus[] = ['manufacturing', 'filling', 'packing', 'qa', 'rework', 'released', 'rejected', 'dispatched']

export function BatchRegister() {
  const t = useT()
  const [items, setItems] = React.useState<BatchRow[] | null>(null)
  const [counts, setCounts] = React.useState<Record<string, number>>({})
  const [status, setStatus] = React.useState<BatchStatus | null>(null)
  const [search, setSearch] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const handle = window.setTimeout(async () => {
      const query = new URLSearchParams()
      if (status) query.set('status', status)
      if (search.trim()) query.set('q', search.trim())
      const call = await apiCall<{ items?: BatchRow[]; counts?: Record<string, number>; error?: string }>(`/api/dermat_orders/batches?${query.toString()}`)
      if (!call.ok) {
        setError(call.result?.error ?? t('dermat_orders.batches.loadError', 'Could not load batches.'))
        return
      }
      setError(null)
      setItems(call.result?.items ?? [])
      if (!status && !search.trim()) setCounts(call.result?.counts ?? {})
    }, search ? 250 : 0)
    return () => window.clearTimeout(handle)
  }, [status, search, t])

  const total = Object.values(counts).reduce((sum, value) => sum + value, 0)

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_orders.batches.title', 'Batch register')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('dermat_orders.batches.lede', 'Every production batch: bulk made (kg), units filled, pieces packed, QC and QA state. Open a batch to trace the materials and lots that went into it.')}</p>
            </div>
            <ExportButton
              size="sm"
              label={t('dermat_orders.batches.export', 'Export')}
              disabled={!items?.length}
              onExport={() =>
                downloadCsv('batch-register', [
                  { header: 'Batch no.', value: (row: BatchRow) => row.batchNo },
                  { header: 'Status', value: (row) => BATCH_STATUS[row.status].label },
                  { header: 'Orders', value: (row) => row.orders.map((order) => order.orderNo).join(', ') },
                  { header: 'Customer', value: (row) => row.orders.map((order) => order.customer).filter(Boolean).join(', ') },
                  { header: 'Products', value: (row) => row.products.map((product) => product.title).join(', ') },
                  { header: 'Mfg date', value: (row) => row.mfgDate },
                  { header: 'Bulk (kg)', value: (row) => row.bulkKg },
                  { header: 'Wastage (kg)', value: (row) => row.wastageKg },
                  { header: 'Vessel', value: (row) => row.vessel },
                  { header: 'Operator', value: (row) => row.operator },
                  { header: 'Ordered (pcs)', value: (row) => row.ordered },
                  { header: 'Filled', value: (row) => row.filled },
                  { header: 'Rejected units', value: (row) => row.rejectedUnits },
                  { header: 'Packed (pcs)', value: (row) => row.packed },
                  { header: 'QA decision', value: (row) => row.qa.result },
                  { header: 'COA no.', value: (row) => row.qa.coaNo },
                ], items ?? [])
              }
            />
          </header>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('dermat_orders.batches.filter', 'Filter by status')}>
              <button type="button" onClick={() => setStatus(null)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', !status ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                {t('dermat_orders.batches.all', 'All')} <span className="tabular-nums">{total}</span>
              </button>
              {ORDER.filter((key) => counts[key]).map((key) => (
                <button key={key} type="button" onClick={() => setStatus(key)} className={cn('rounded-full border px-3 py-1 text-xs font-medium', status === key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                  {BATCH_STATUS[key].label} <span className="tabular-nums">{counts[key]}</span>
                </button>
              ))}
            </div>
            <div className="relative lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('dermat_orders.batches.search', 'Batch, order, customer or product')} className="pl-9" aria-label={t('dermat_orders.batches.search', 'Batch, order, customer or product')} />
            </div>
          </div>

          {error ? <ErrorMessage label={error} /> : null}
          {!items && !error ? <LoadingMessage label={t('dermat_orders.batches.loading', 'Loading batches…')} /> : null}
          {items ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.batches.colBatch', 'Batch')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.batches.colProduct', 'Product / order')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('dermat_orders.batches.colBulk', 'Bulk (kg)')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('dermat_orders.batches.colFilled', 'Filled')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('dermat_orders.batches.colPacked', 'Packed / ordered')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.batches.colQc', 'QC')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.batches.colStatus', 'Status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((row) => (
                    <tr key={row.batchNo} className="align-top hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link href={`/backend/production/batches/${encodeURIComponent(row.batchNo)}`} className="font-mono font-semibold hover:underline">
                          {row.batchNo}
                        </Link>
                        <span className="block text-xs text-muted-foreground">{formatDate(row.mfgDate)}</span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-medium">{row.products.map((product) => product.title).join(', ')}</span>
                        <span className="block text-xs text-muted-foreground">
                          {row.orders.map((order, index) => (
                            <React.Fragment key={order.id}>
                              {index ? ', ' : ''}
                              <Link href={`/backend/orders/${order.id}`} className="font-mono hover:underline">
                                {order.orderNo}
                              </Link>
                              {order.customer ? ` · ${order.customer}` : ''}
                            </React.Fragment>
                          ))}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.bulkKg !== null ? formatQty(row.bulkKg, 2) : '—'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.filled !== null ? formatQty(row.filled, 0) : '—'}
                        {row.rejectedUnits ? <span className="block text-xs text-status-error-text">{t('dermat_orders.batches.rejected', '{count} rejected', { count: formatQty(row.rejectedUnits, 0) })}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {row.packed !== null ? formatQty(row.packed, 0) : '—'} / {formatQty(row.ordered, 0)}
                        {row.packedYield !== null ? <span className={cn('block text-xs', row.packedYield < 100 ? 'text-status-warning-text' : 'text-muted-foreground')}>{row.packedYield}%</span> : null}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {row.qc.total ? (
                          <span className={cn(row.qc.failed ? 'text-status-error-text' : row.qc.open ? 'text-status-warning-text' : 'text-status-success-text')}>
                            {t('dermat_orders.batches.qcSummary', '{passed} passed · {open} open · {failed} failed', row.qc)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                        {row.reworkRounds ? <span className="block text-status-warning-text">{t('dermat_orders.batches.rework', '{count} rework round(s)', { count: row.reworkRounds })}</span> : null}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge variant={BATCH_STATUS[row.status].variant}>{BATCH_STATUS[row.status].label}</StatusBadge>
                      </td>
                    </tr>
                  ))}
                  {!items.length ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        {search || status ? t('dermat_orders.batches.noMatch', 'No batch matches.') : t('dermat_orders.batches.empty', 'No batches yet. A batch appears when Manufacturing records its batch number.')}
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

export default BatchRegister
