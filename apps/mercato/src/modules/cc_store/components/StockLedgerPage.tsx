"use client"

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ExportButton } from '../../cc_products/components/ExportButton'
import { downloadCsv } from '../../cc_products/lib/csvExport'
import { STORES, type StockPlace } from '../../cc_products/lib/stock'
import { PageLoading } from '../../cc_ui/components/PageLoading'

type Place = StockPlace | 'all'
type Movement = { id: string; at: string; type: string; quantity: number; unit: string | null; from: string | null; to: string | null; productId: string | null; title: string; code: string | null; lotNumber: string | null; reason: string | null; reasonCode: string | null; by: string | null; orderNo: string | null; orderId: string | null }

const PLACES: Array<{ value: Place; label: string }> = [{ value: 'all', label: 'All stores' }, ...STORES.map((store) => ({ value: store.key, label: store.label }))]

const KIND_LABEL: Record<string, string> = {
  receipt: 'Received',
  store_issue: 'Issued to production',
  production_use: 'Used in production',
  production_reject: 'Written off (rejected batch)',
  store_adjust_out: 'Removed by hand',
  store_transfer: 'Moved',
}

function kindOf(entry: Movement): string {
  if (entry.reasonCode && KIND_LABEL[entry.reasonCode]) return KIND_LABEL[entry.reasonCode]
  if (entry.type === 'receipt') return KIND_LABEL.receipt
  if (entry.type === 'transfer') return KIND_LABEL.store_transfer
  if (entry.type === 'adjust') return entry.quantity < 0 ? 'Taken out' : 'Added'
  return entry.type
}

const PAGE_SIZE = 50

export function StockLedgerPage() {
  const t = useT()
  const params = useSearchParams()
  const initial = (params?.get('place') as Place | null) ?? 'all'
  const productId = params?.get('productId') ?? null
  const [place, setPlace] = React.useState<Place>(PLACES.some((entry) => entry.value === initial) ? initial : 'all')
  const [items, setItems] = React.useState<Movement[] | null>(null)
  const [page, setPage] = React.useState(1)
  const [hasMore, setHasMore] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [loadingMore, setLoadingMore] = React.useState(false)

  const fetchPage = React.useCallback(
    async (pageNumber: number) => {
      const query = new URLSearchParams({ page: String(pageNumber), pageSize: String(PAGE_SIZE) })
      if (place !== 'all') query.set('place', place)
      if (productId) query.set('productId', productId)
      const call = await apiCall<{ items?: Movement[]; hasMore?: boolean; error?: string }>(`/api/cc_store/stock/ledger?${query.toString()}`)
      if (!call.ok) {
        setError(call.result?.error ?? t('cc_store.ledger.loadError', 'Could not load the stock ledger.'))
        return null
      }
      setError(null)
      setHasMore(Boolean(call.result?.hasMore))
      return call.result?.items ?? []
    },
    [place, productId, t],
  )

  React.useEffect(() => {
    setItems(null)
    setPage(1)
    void fetchPage(1).then((rows) => rows && setItems(rows))
  }, [fetchPage])

  const more = async () => {
    setLoadingMore(true)
    const rows = await fetchPage(page + 1)
    if (rows) {
      setItems((prev) => [...(prev ?? []), ...rows])
      setPage(page + 1)
    }
    setLoadingMore(false)
  }

  const productTitle = productId && items?.[0]?.productId === productId ? items[0].title : null

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <Link href={`/backend/store/stock?place=${place === 'all' ? 'wh_a' : place}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                {t('cc_store.ledger.back', 'Stock')}
              </Link>
              <h1 className="text-2xl font-bold tracking-tight">{productTitle ? t('cc_store.ledger.titleFor', 'Stock ledger: {name}', { name: productTitle }) : t('cc_store.ledger.title', 'Stock ledger')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('cc_store.ledger.lede', 'Every movement of stock, newest first: what came in, what went to production, what was used, moved or written off, and who did it.')}</p>
            </div>
            <ExportButton
              size="sm"
              label={t('cc_store.ledger.export', 'Export')}
              disabled={!items?.length}
              onExport={() =>
                downloadCsv(`stock-ledger-${place}`, [
                  { header: 'Date', value: (row: Movement) => row.at },
                  { header: 'Movement', value: kindOf },
                  { header: 'Code', value: (row) => row.code },
                  { header: 'Material', value: (row) => row.title },
                  { header: 'Batch', value: (row) => row.lotNumber },
                  { header: 'Quantity', value: (row) => row.quantity },
                  { header: 'Unit', value: (row) => row.unit },
                  { header: 'From', value: (row) => row.from },
                  { header: 'To', value: (row) => row.to },
                  { header: 'Order', value: (row) => row.orderNo },
                  { header: 'Details', value: (row) => row.reason },
                  { header: 'By', value: (row) => row.by },
                ], items ?? [])
              }
            />
          </header>

          <SegmentedControl value={place} onValueChange={(value) => setPlace(value as Place)} aria-label={t('cc_store.ledger.place', 'Store')}>
            {PLACES.map((entry) => (
              <SegmentedControlItem key={entry.value} value={entry.value}>
                {entry.label}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>

          {error ? <ErrorMessage label={error} /> : null}
          {!items && !error ? <PageLoading label={t('cc_store.ledger.loading', 'Loading movements…')} /> : null}
          {items ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_store.ledger.when', 'When')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_store.ledger.movement', 'Movement')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_store.ledger.material', 'Material / batch')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('cc_store.ledger.qty', 'Quantity')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_store.ledger.route', 'From → to')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_store.ledger.details', 'Details')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((row) => (
                    <tr key={row.id} className="align-top hover:bg-muted/30">
                      <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-muted-foreground">
                        {new Date(row.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {row.by ? <span className="block">{row.by}</span> : null}
                      </td>
                      <td className="px-3 py-2 font-medium">{kindOf(row)}</td>
                      <td className="px-3 py-2">
                        {row.productId ? (
                          <Link href={`/backend/store/ledger?productId=${row.productId}`} className="hover:underline">
                            {row.title}
                          </Link>
                        ) : (
                          row.title
                        )}
                        <span className="block text-xs text-muted-foreground">
                          <span className="font-mono">{row.code ?? '—'}</span>
                          {row.lotNumber ? ` · ${t('cc_store.ledger.batch', 'batch {lot}', { lot: row.lotNumber })}` : ''}
                        </span>
                      </td>
                      <td className={cn('whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums', place !== 'all' && (row.quantity < 0 ? 'text-status-error-text' : 'text-status-success-text'))}>
                        {place !== 'all' && row.quantity > 0 ? '+' : ''}
                        {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(row.quantity)} {row.unit ?? ''}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">{[row.from ?? (row.type === 'receipt' ? t('cc_store.ledger.outside', 'Vendor / outside') : null), row.to ?? (row.type === 'adjust' ? null : t('cc_store.ledger.gone', 'Out'))].filter(Boolean).join(' → ') || '—'}</td>
                      <td className="max-w-md px-3 py-2 text-xs">
                        {row.orderId ? (
                          <Link href={`/backend/orders/${row.orderId}`} className="mr-1 font-mono font-medium hover:underline">
                            {row.orderNo}
                          </Link>
                        ) : null}
                        <span className="text-muted-foreground">{row.reason ?? ''}</span>
                      </td>
                    </tr>
                  ))}
                  {!items.length ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        {t('cc_store.ledger.empty', 'No stock movements yet.')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
          {hasMore ? (
            <div className="flex justify-center">
              <Button type="button" variant="outline" onClick={() => void more()} disabled={loadingMore}>
                {loadingMore ? t('cc_store.ledger.loadingMore', 'Loading…') : t('cc_store.ledger.more', 'Show older movements')}
              </Button>
            </div>
          ) : null}
        </div>
      </PageBody>
    </Page>
  )
}

export default StockLedgerPage
