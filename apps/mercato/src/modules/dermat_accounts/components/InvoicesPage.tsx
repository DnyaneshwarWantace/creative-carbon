"use client"

import * as React from 'react'
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
import { INVOICE_STATUS, type InvoiceView } from './types'

type Filter = 'all' | 'draft' | 'issued' | 'cancelled'
type Kind = 'invoice' | 'credit_note'
type OrderHit = { id: string; orderNo: string; customerName: string }

function day(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function InvoicesPage() {
  const t = useT()
  const router = useRouter()
  const { runMutation } = useGuardedMutation({ contextId: 'dermat-invoice-new' })
  const [filter, setFilter] = React.useState<Filter>('all')
  const [kind, setKind] = React.useState<Kind>('invoice')
  const [search, setSearch] = React.useState('')
  const [items, setItems] = React.useState<InvoiceView[] | null>(null)
  const [creating, setCreating] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    setItems(null)
    const handle = window.setTimeout(async () => {
      const params = new URLSearchParams({ pageSize: '100', kind })
      if (filter !== 'all') params.set('status', filter)
      if (search.trim()) params.set('search', search.trim())
      const call = await apiCall<{ items: InvoiceView[] }>(`/api/dermat_accounts/invoices?${params.toString()}`, undefined, { fallback: { items: [] } })
      if (!cancelled) setItems(call.result?.items ?? [])
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [filter, kind, search])

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
        operation: () => apiCall<InvoiceView & { error?: string }>('/api/dermat_accounts/invoices', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result?.id) {
        flash(call.result?.error ?? t('dermat_accounts.inv.createError', 'Could not make the invoice.'), 'error')
        return
      }
      router.push(`/backend/accounts/invoices/${call.result.id}`)
    } finally {
      setCreating(false)
    }
  }

  const exportAll = async () => {
    const params = new URLSearchParams({ kind })
    if (filter !== 'all') params.set('status', filter)
    if (search.trim()) params.set('search', search.trim())
    const rows = await fetchAllPages<InvoiceView>(`/api/dermat_accounts/invoices?${params.toString()}`)
    downloadCsv(kind === 'invoice' ? 'tax-invoices' : 'credit-notes', [
      { header: kind === 'invoice' ? 'Invoice no.' : 'Credit note no.', value: (row) => row.code },
      { header: 'Date', value: (row) => row.invoiceDate },
      { header: 'Due date', value: (row) => row.dueDate ?? '' },
      { header: 'Against invoice', value: (row) => row.againstCode ?? '' },
      { header: 'Place of supply', value: (row) => row.placeOfSupply ?? '' },
      { header: 'Customer', value: (row) => row.customerName },
      { header: 'Customer GSTIN', value: (row) => row.customerGstin ?? '' },
      { header: 'Order', value: (row) => row.orderNo },
      { header: 'Taxable (₹)', value: (row) => row.totals.taxable },
      { header: 'CGST (₹)', value: (row) => row.totals.cgst },
      { header: 'SGST (₹)', value: (row) => row.totals.sgst },
      { header: 'IGST (₹)', value: (row) => row.totals.igst },
      { header: 'Round off (₹)', value: (row) => row.totals.roundOff },
      { header: 'Payable (₹)', value: (row) => row.totals.payable },
      { header: 'E-way bill', value: (row) => row.ewayBillNo ?? '' },
      { header: 'Status', value: (row) => INVOICE_STATUS[row.status].label },
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
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_accounts.inv.title', 'Tax invoices and credit notes')}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t('dermat_accounts.inv.lede', 'Bill all or part of an order. GST splits into CGST + SGST or IGST from the two GSTINs. Issuing puts the invoice no. on the order’s Billing stage; reduce an issued invoice with a credit note.')}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <ExportButton onExport={exportAll} />
              <div className="w-72">
                <SearchPicker
                  value={null}
                  placeholder={creating ? t('dermat_accounts.inv.creating', 'Making the invoice…') : t('dermat_accounts.inv.new', 'New invoice from an order…')}
                  searchPlaceholder={t('dermat_accounts.pi.orderSearch', 'Order no. or customer')}
                  load={loadOrders}
                  onSelect={create}
                  disabled={creating}
                />
              </div>
            </div>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl value={kind} onValueChange={(value) => setKind(value as Kind)} aria-label={t('dermat_accounts.inv.kind', 'Document')}>
              <SegmentedControlItem value="invoice">{t('dermat_accounts.inv.invoices', 'Invoices')}</SegmentedControlItem>
              <SegmentedControlItem value="credit_note">{t('dermat_accounts.inv.creditNotes', 'Credit notes')}</SegmentedControlItem>
            </SegmentedControl>
            <SegmentedControl value={filter} onValueChange={(value) => setFilter(value as Filter)} aria-label={t('dermat_accounts.pi.filter', 'Status')}>
              <SegmentedControlItem value="all">{t('dermat_accounts.pi.all', 'All')}</SegmentedControlItem>
              <SegmentedControlItem value="draft">{t('dermat_accounts.pi.drafts', 'Drafts')}</SegmentedControlItem>
              <SegmentedControlItem value="issued">{t('dermat_accounts.inv.issuedTab', 'Issued')}</SegmentedControlItem>
              <SegmentedControlItem value="cancelled">{t('dermat_accounts.pi.cancelledTab', 'Cancelled')}</SegmentedControlItem>
            </SegmentedControl>
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="invoice-search" className="h-9 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('dermat_accounts.inv.search', 'Invoice no., order no. or customer')} />
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
              title={t('dermat_accounts.inv.empty', 'Nothing here yet')}
              description={t('dermat_accounts.inv.emptyHint', 'Pick an order above to make an invoice, or use the Tax invoice button on the order page. Credit notes are made from an issued invoice.')}
            />
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2.5 text-left font-semibold">{kind === 'invoice' ? t('dermat_accounts.inv.no', 'Invoice no.') : t('dermat_accounts.inv.cnNo', 'Credit note no.')}</th>
                    <th className="px-4 py-2.5 text-left font-semibold">{t('dermat_accounts.pi.customer', 'Customer')}</th>
                    <th className="px-4 py-2.5 text-left font-semibold">{t('dermat_accounts.pi.order', 'Order')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{t('dermat_accounts.pi.total', 'Total')}</th>
                    <th className="px-4 py-2.5 text-left font-semibold">{t('dermat_accounts.inv.tax', 'GST')}</th>
                    <th className="px-4 py-2.5 text-left font-semibold">{kind === 'invoice' ? t('dermat_accounts.inv.dueCol', 'Due') : t('dermat_accounts.inv.againstCol', 'Against')}</th>
                    <th className="px-4 py-2.5 text-left font-semibold">{t('dermat_accounts.pi.statusCol', 'Status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((row) => (
                    <tr key={row.id} onClick={() => router.push(`/backend/accounts/invoices/${row.id}`)} className={cn('cursor-pointer hover:bg-muted/30', row.status === 'cancelled' && 'opacity-60')}>
                      <td className="px-4 py-3">
                        <span className="block font-mono text-xs font-semibold">{row.code}</span>
                        <span className="block text-xs text-muted-foreground">{day(row.invoiceDate)}</span>
                      </td>
                      <td className="px-4 py-3 font-medium">{row.customerName}</td>
                      <td className="px-4 py-3 font-mono text-xs">{row.orderNo}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{rupeeText(row.totals.payable)}</td>
                      <td className="px-4 py-3 text-xs">{row.interState ? `IGST ${rupeeText(row.totals.igst)}` : `CGST+SGST ${rupeeText(row.totals.cgst + row.totals.sgst)}`}</td>
                      <td className="px-4 py-3 text-xs">{kind === 'invoice' ? day(row.dueDate) : row.againstCode ?? '—'}</td>
                      <td className="px-4 py-3">
                        <StatusBadge variant={INVOICE_STATUS[row.status].variant} dot>
                          {INVOICE_STATUS[row.status].label}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">
                {t('dermat_accounts.inv.counts', '{drafts} drafts · {issued} issued · {cancelled} cancelled', { drafts: counts.draft ?? 0, issued: counts.issued ?? 0, cancelled: counts.cancelled ?? 0 })}
              </p>
            </div>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default InvoicesPage
