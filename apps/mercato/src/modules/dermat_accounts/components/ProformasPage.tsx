"use client"

import * as React from 'react'
import { useGranted } from '../../dermat_departments/components/useGranted'
import { ViewOnlyNote } from '../../dermat_departments/components/ViewOnlyNote'
import { useRouter } from 'next/navigation'
import { FileText, Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Input } from '@open-mercato/ui/primitives/input'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { ExportButton } from '../../dermat_products/components/ExportButton'
import { downloadCsv, fetchAllPages } from '../../dermat_products/lib/csvExport'
import { rupeeText } from '../../dermat_products/lib/whatsapp'
import { SearchPicker, type PickerOption } from '../../dermat_orders/components/SearchPicker'
import { PI_STATUS, type PiView } from './types'

type Filter = 'all' | 'draft' | 'sent' | 'cancelled'
type OrderHit = { id: string; orderNo: string; customerName: string }

function day(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function ProformasPage() {
  const t = useT()
  const granted = useGranted()
  const canRecord = !granted.ready || granted.has('dermat_accounts.record')
  const router = useRouter()
  const { runMutation } = useGuardedMutation({ contextId: 'dermat-pi-new' })
  const [filter, setFilter] = React.useState<Filter>('all')
  const [search, setSearch] = React.useState('')
  const [items, setItems] = React.useState<PiView[] | null>(null)
  const [creating, setCreating] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setItems(null)
    const handle = window.setTimeout(async () => {
      const params = new URLSearchParams({ pageSize: '100' })
      if (filter !== 'all') params.set('status', filter)
      if (search.trim()) params.set('search', search.trim())
      const call = await apiCall<{ items: PiView[] }>(`/api/dermat_accounts/proformas?${params.toString()}`, undefined, { fallback: { items: [] } })
      if (!cancelled) setItems(call.result?.items ?? [])
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [filter, search])

  const loadOrders = async (term: string): Promise<PickerOption<OrderHit>[]> => {
    const params = new URLSearchParams({ pageSize: '20', status: 'open' })
    if (term.trim()) params.set('search', term.trim())
    const call = await apiCall<{ items?: OrderHit[] }>(`/api/dermat_orders/orders?${params.toString()}`, undefined, { fallback: { items: [] } })
    return (call.result?.items ?? []).map((order) => ({ id: order.id, primary: order.orderNo, secondary: order.customerName, value: order }))
  }

  const create = async (option: PickerOption<OrderHit>) => {
    setCreating(true)
    try {
      const body = { orderId: option.id }
      const call = await runMutation({
        context: { orderId: option.id },
        mutationPayload: body,
        operation: () => apiCall<PiView & { error?: string }>('/api/dermat_accounts/proformas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result?.id) {
        flash(call.result?.error ?? t('dermat_accounts.pi.createError', 'Could not make the proforma invoice.'), 'error')
        return
      }
      router.push(`/backend/accounts/proformas/${call.result.id}`)
    } finally {
      setCreating(false)
    }
  }

  const exportAll = async () => {
    const params = new URLSearchParams()
    if (filter !== 'all') params.set('status', filter)
    if (search.trim()) params.set('search', search.trim())
    const rows = await fetchAllPages<PiView>(`/api/dermat_accounts/proformas?${params.toString()}`)
    downloadCsv('proforma-invoices', [
      { header: 'PI no.', value: (row) => row.code },
      { header: 'PI date', value: (row) => row.piDate },
      { header: 'Valid until', value: (row) => row.validUntil ?? '' },
      { header: 'Customer', value: (row) => row.customerName },
      { header: 'Customer GSTIN', value: (row) => row.customerGstin ?? '' },
      { header: 'Order', value: (row) => row.orderNo },
      { header: 'Taxable (₹)', value: (row) => row.totals.taxable },
      { header: 'GST (₹)', value: (row) => row.totals.gst },
      { header: 'Total (₹)', value: (row) => row.totals.total },
      { header: 'Advance %', value: (row) => row.advancePercent ?? '' },
      { header: 'Advance (₹)', value: (row) => row.advanceAmount ?? '' },
      { header: 'Status', value: (row) => PI_STATUS[row.status].label },
      { header: 'Sent on', value: (row) => (row.sentAt ? row.sentAt.slice(0, 10) : '') },
    ], rows)
  }

  const counts = (items ?? []).reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {})

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-16">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('dermat_accounts.eyebrow', 'Accounts')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_accounts.pi.title', 'Proforma invoices')}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t('dermat_accounts.pi.lede', 'Made from an order with the rates on it. Send it to the customer for the advance; the order’s Advance stage gets the PI no. when you mark it sent.')}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <ExportButton onExport={exportAll} />
              {canRecord ? (
              <div className="w-72">
                <SearchPicker
                  value={null}
                  placeholder={creating ? t('dermat_accounts.pi.creating', 'Making the proforma…') : t('dermat_accounts.pi.new', 'New proforma from an order…')}
                  searchPlaceholder={t('dermat_accounts.pi.orderSearch', 'Order no. or customer')}
                  load={loadOrders}
                  onSelect={create}
                  disabled={creating}
                />
              </div>
              ) : null}
            </div>
          </header>
          {!canRecord ? <ViewOnlyNote>{t('dermat_accounts.viewOnly', 'View only: making, issuing and cancelling documents is done by Accounts.')}</ViewOnlyNote> : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl value={filter} onValueChange={(value) => setFilter(value as Filter)} aria-label={t('dermat_accounts.pi.filter', 'Status')}>
              <SegmentedControlItem value="all">{t('dermat_accounts.pi.all', 'All')}</SegmentedControlItem>
              <SegmentedControlItem value="draft">{t('dermat_accounts.pi.drafts', 'Drafts')}</SegmentedControlItem>
              <SegmentedControlItem value="sent">{t('dermat_accounts.pi.sent', 'Sent')}</SegmentedControlItem>
              <SegmentedControlItem value="cancelled">{t('dermat_accounts.pi.cancelledTab', 'Cancelled')}</SegmentedControlItem>
            </SegmentedControl>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="pi-search" className="h-9 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('dermat_accounts.pi.search', 'PI no., order no. or customer')} />
            </div>
          </div>

          {!items ? (
            <div className="flex justify-center py-20">
              <Spinner />
            </div>
          ) : !items.length ? (
            <EmptyState
              className="py-20"
              icon={<FileText className="h-5 w-5" aria-hidden="true" />}
              title={t('dermat_accounts.pi.empty', 'No proforma invoices here')}
              description={t('dermat_accounts.pi.emptyHint', 'Pick an order above to make one, or use the Proforma button on the order page.')}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2.5 text-left font-semibold">{t('dermat_accounts.pi.no', 'PI no.')}</th>
                    <th className="px-4 py-2.5 text-left font-semibold">{t('dermat_accounts.pi.customer', 'Customer')}</th>
                    <th className="px-4 py-2.5 text-left font-semibold">{t('dermat_accounts.pi.order', 'Order')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{t('dermat_accounts.pi.total', 'Total')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{t('dermat_accounts.pi.advanceCol', 'Advance')}</th>
                    <th className="px-4 py-2.5 text-left font-semibold">{t('dermat_accounts.pi.validCol', 'Valid until')}</th>
                    <th className="px-4 py-2.5 text-left font-semibold">{t('dermat_accounts.pi.statusCol', 'Status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((row) => (
                    <tr key={row.id} onClick={() => router.push(`/backend/accounts/proformas/${row.id}`)} className={cn('cursor-pointer hover:bg-muted/30', row.status === 'cancelled' && 'opacity-60')}>
                      <td className="px-4 py-3">
                        <span className="block font-mono text-xs font-semibold">{row.code}</span>
                        <span className="block text-xs text-muted-foreground">{day(row.piDate)}</span>
                      </td>
                      <td className="px-4 py-3 font-medium">{row.customerName}</td>
                      <td className="px-4 py-3 font-mono text-xs">{row.orderNo}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{rupeeText(row.totals.total)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.advancePercent ? `${row.advancePercent}% · ${rupeeText(row.advanceAmount ?? 0)}` : '—'}</td>
                      <td className="px-4 py-3 text-xs">{day(row.validUntil)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge variant={PI_STATUS[row.status].variant} dot>
                          {PI_STATUS[row.status].label}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                {t('dermat_accounts.pi.counts', '{drafts} drafts · {sent} sent · {cancelled} cancelled', { drafts: counts.draft ?? 0, sent: counts.sent ?? 0, cancelled: counts.cancelled ?? 0 })}
              </p>
            </div>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default ProformasPage
