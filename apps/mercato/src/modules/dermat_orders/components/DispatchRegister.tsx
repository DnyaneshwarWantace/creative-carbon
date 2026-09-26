"use client"

import * as React from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ExportButton } from '../../dermat_products/components/ExportButton'
import { downloadCsv } from '../../dermat_products/lib/csvExport'
import { formatDate, formatQty } from './format'

type Row = {
  orderId: string
  orderNo: string
  customer: string | null
  shippingAddress: string | null
  priority: string
  status: string
  pieces: number
  value: number
  invoices: string[]
  dispatchDate: string | null
  transporter: string | null
  lrNumber: string | null
  vehicleNo: string | null
  ewayBillNo: string | null
  packages: string | null
  deliveredOn: string | null
  ewayNeeded: boolean
  waitingSince: string | null
}

type View = 'ready' | 'done' | 'all'

export function DispatchRegister() {
  const t = useT()
  const [view, setView] = React.useState<View>('all')
  const [search, setSearch] = React.useState('')
  const [rows, setRows] = React.useState<Row[] | null>(null)
  const [summary, setSummary] = React.useState<{ ready: number; dispatched: number; awaitingDelivery: number } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const handle = window.setTimeout(async () => {
      const query = new URLSearchParams({ view })
      if (search.trim()) query.set('q', search.trim())
      const call = await apiCall<{ items?: Row[]; summary?: { ready: number; dispatched: number; awaitingDelivery: number }; error?: string }>(`/api/dermat_orders/dispatches?${query.toString()}`)
      if (!call.ok) setError(call.result?.error ?? t('dermat_orders.dispatches.loadError', 'Could not load dispatches.'))
      else {
        setError(null)
        setRows(call.result?.items ?? [])
        if (view === 'all' && !search.trim()) setSummary(call.result?.summary ?? null)
      }
    }, search ? 250 : 0)
    return () => window.clearTimeout(handle)
  }, [view, search, t])

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_orders.dispatches.title', 'Dispatch register')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('dermat_orders.dispatches.lede', 'Orders ready to go and every dispatch: invoice, transporter, LR, vehicle, e-way bill, boxes and delivery.')}</p>
            </div>
            <ExportButton
              size="sm"
              label={t('dermat_orders.dispatches.export', 'Export')}
              disabled={!rows?.length}
              onExport={() =>
                downloadCsv('dispatch-register', [
                  { header: 'Order', value: (row: Row) => row.orderNo },
                  { header: 'Customer', value: (row) => row.customer },
                  { header: 'Ship to', value: (row) => row.shippingAddress },
                  { header: 'Invoice', value: (row) => row.invoices.join(', ') },
                  { header: 'Pieces', value: (row) => row.pieces },
                  { header: 'Value', value: (row) => row.value },
                  { header: 'Dispatch date', value: (row) => row.dispatchDate },
                  { header: 'Transporter', value: (row) => row.transporter },
                  { header: 'LR no.', value: (row) => row.lrNumber },
                  { header: 'Vehicle', value: (row) => row.vehicleNo },
                  { header: 'E-way bill', value: (row) => row.ewayBillNo },
                  { header: 'Boxes', value: (row) => row.packages },
                  { header: 'Delivered on', value: (row) => row.deliveredOn },
                ], rows ?? [])
              }
            />
          </header>

          {summary ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                { label: t('dermat_orders.dispatches.ready', 'Ready to dispatch'), value: summary.ready },
                { label: t('dermat_orders.dispatches.dispatched', 'Dispatched'), value: summary.dispatched },
                { label: t('dermat_orders.dispatches.awaiting', 'Delivery not confirmed'), value: summary.awaitingDelivery },
              ].map((tile) => (
                <div key={tile.label} className="rounded-lg border bg-card p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tile.label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{tile.value}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SegmentedControl value={view} onValueChange={(value) => setView(value as View)} aria-label={t('dermat_orders.dispatches.show', 'Show')}>
              <SegmentedControlItem value="all">{t('dermat_orders.dispatches.all', 'All')}</SegmentedControlItem>
              <SegmentedControlItem value="ready">{t('dermat_orders.dispatches.readyTab', 'Ready to dispatch')}</SegmentedControlItem>
              <SegmentedControlItem value="done">{t('dermat_orders.dispatches.doneTab', 'Dispatched')}</SegmentedControlItem>
            </SegmentedControl>
            <div className="relative sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('dermat_orders.dispatches.search', 'Order, customer, LR, vehicle, invoice')} className="pl-9" aria-label={t('dermat_orders.dispatches.search', 'Order, customer, LR, vehicle, invoice')} />
            </div>
          </div>

          {error ? <ErrorMessage label={error} /> : null}
          {!rows && !error ? <LoadingMessage label={t('dermat_orders.dispatches.loading', 'Loading…')} /> : null}
          {rows ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.dispatches.colOrder', 'Order / customer')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.dispatches.colInvoice', 'Invoice')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('dermat_orders.dispatches.colPieces', 'Pieces / boxes')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.dispatches.colTransport', 'Transport')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.dispatches.colEway', 'E-way bill')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.dispatches.colStatus', 'Status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((row) => (
                    <tr key={row.orderId} className="align-top hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link href={`/backend/orders/${row.orderId}?stage=dispatch`} className="font-mono font-medium hover:underline">
                          {row.orderNo}
                        </Link>
                        {row.priority === 'urgent' ? <span className="ml-2 rounded-sm bg-status-error-bg px-1.5 py-0.5 text-xs text-status-error-text">{t('dermat_orders.priority.urgent', 'Urgent')}</span> : null}
                        <span className="block">{row.customer ?? '—'}</span>
                        {row.shippingAddress ? <span className="block max-w-xs truncate text-xs text-muted-foreground">{row.shippingAddress}</span> : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{row.invoices.length ? row.invoices.join(', ') : <span className="font-sans text-status-warning-text">{t('dermat_orders.dispatches.noInvoice', 'No invoice yet')}</span>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatQty(row.pieces, 0)}
                        <span className="block text-xs text-muted-foreground">{row.packages ? t('dermat_orders.dispatches.boxes', '{count} boxes', { count: row.packages }) : '—'}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="block">{row.transporter ?? '—'}</span>
                        <span className="block font-mono text-muted-foreground">{[row.lrNumber ? `LR ${row.lrNumber}` : null, row.vehicleNo].filter(Boolean).join(' · ') || '—'}</span>
                        {row.dispatchDate ? <span className="block text-muted-foreground">{formatDate(row.dispatchDate)}</span> : null}
                      </td>
                      <td className={cn('px-3 py-2 text-xs', row.ewayNeeded && !row.ewayBillNo && 'text-status-warning-text')}>
                        {row.ewayBillNo ? <span className="font-mono">{row.ewayBillNo}</span> : row.ewayNeeded ? t('dermat_orders.dispatches.ewayNeeded', 'Needed (above ₹50,000)') : t('dermat_orders.dispatches.ewayNotNeeded', 'Not needed')}
                      </td>
                      <td className="px-3 py-2">
                        {row.status === 'done' ? (
                          row.deliveredOn ? (
                            <StatusBadge variant="success">{t('dermat_orders.dispatches.delivered', 'Delivered {date}', { date: formatDate(row.deliveredOn) })}</StatusBadge>
                          ) : (
                            <StatusBadge variant="info">{t('dermat_orders.dispatches.inTransit', 'Dispatched')}</StatusBadge>
                          )
                        ) : (
                          <StatusBadge variant={row.status === 'on_hold' ? 'error' : 'warning'}>{row.status === 'on_hold' ? t('dermat_orders.dispatches.onHold', 'On hold') : t('dermat_orders.dispatches.readyBadge', 'Ready to dispatch')}</StatusBadge>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!rows.length ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        {t('dermat_orders.dispatches.empty', 'Nothing here yet.')}
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

export default DispatchRegister
