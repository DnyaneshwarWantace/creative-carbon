"use client"

import * as React from 'react'
import { useGranted } from '../../dermat_departments/components/useGranted'
import Link from 'next/link'
import { AlertTriangle, ChevronRight, IndianRupee, Receipt, Search, Wallet } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Input } from '@open-mercato/ui/primitives/input'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { WhatsAppMenu } from '../../dermat_products/components/WhatsAppMenu'
import { dateText, rupeeText } from '../../dermat_products/lib/whatsapp'
import { PaymentDialog } from './PaymentDialog'
import { ExportButton } from '../../dermat_products/components/ExportButton'
import { downloadCsv } from '../../dermat_products/lib/csvExport'

type Row = {
  orderId: string
  orderNo: string
  customerId: string
  customerPhone: string | null
  orderDate: string
  deliveryDate: string | null
  status: string
  customerName: string
  paymentTerms: string | null
  total: number
  received: number
  due: number
  priced: boolean
  lastPayment: { amount: number; paidOn: string } | null
}
type Summary = { orders: number; total: number; received: number; due: number; unpriced: number }

const STATUS_VARIANT: Record<string, StatusBadgeVariant> = { booked: 'info', confirmed: 'warning', completed: 'success' }

function rupees(value: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)}`
}

function day(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
}

export function DuesPage() {
  const t = useT()
  const granted = useGranted()
  const [view, setView] = React.useState<'due' | 'all'>('due')
  const [search, setSearch] = React.useState('')
  const [data, setData] = React.useState<{ items: Row[]; summary: Summary } | null>(null)
  const [paying, setPaying] = React.useState<Row | null>(null)
  const [reload, setReload] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setData(null)
    const handle = window.setTimeout(async () => {
      const params = new URLSearchParams({ view })
      if (search.trim()) params.set('search', search.trim())
      const call = await apiCall<{ items: Row[]; summary: Summary }>(`/api/dermat_accounts/dues?${params.toString()}`)
      if (!cancelled) setData(call.result ?? { items: [], summary: { orders: 0, total: 0, received: 0, due: 0, unpriced: 0 } })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [view, search, reload])

  const exportDues = () => {
    downloadCsv(view === 'due' ? 'dues' : 'order-payments', [
      { header: 'Order', value: (row) => row.orderNo },
      { header: 'Order date', value: (row) => row.orderDate },
      { header: 'Delivery', value: (row) => row.deliveryDate ?? '' },
      { header: 'Customer', value: (row) => row.customerName },
      { header: 'Payment terms', value: (row) => row.paymentTerms ?? '' },
      { header: 'Order status', value: (row) => row.status },
      { header: 'Order value (₹)', value: (row) => (row.priced ? row.total : '') },
      { header: 'Received (₹)', value: (row) => row.received },
      { header: 'Due (₹)', value: (row) => (row.priced ? row.due : '') },
      { header: 'Last payment (₹)', value: (row) => row.lastPayment?.amount ?? '' },
      { header: 'Last paid on', value: (row) => row.lastPayment?.paidOn ?? '' },
      { header: 'Rates entered', value: (row) => (row.priced ? 'Yes' : 'No') },
    ], data?.items ?? [])
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-16">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('dermat_accounts.eyebrow', 'Accounts')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_accounts.title', 'Payments and dues')}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t('dermat_accounts.lede', 'What every order is worth (after discount and GST), what has come in and what is still due. Record payments on the order page.')}
              </p>
            </div>
            <ExportButton disabled={!data?.items.length} onExport={exportDues} />
          </header>

          {data ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: t('dermat_accounts.tile.due', 'Still due'), value: rupees(data.summary.due), icon: <Wallet className="h-4 w-4" />, tone: data.summary.due > 0 ? 'bg-status-warning-bg text-status-warning-icon' : 'bg-muted text-muted-foreground' },
                { label: t('dermat_accounts.tile.received', 'Received'), value: rupees(data.summary.received), icon: <IndianRupee className="h-4 w-4" />, tone: 'bg-status-success-bg text-status-success-icon' },
                { label: t('dermat_accounts.tile.orders', 'Orders listed'), value: String(data.summary.orders), icon: <Receipt className="h-4 w-4" />, tone: 'bg-status-info-bg text-status-info-icon' },
                { label: t('dermat_accounts.tile.unpriced', 'Orders without rates'), value: String(data.summary.unpriced), icon: <AlertTriangle className="h-4 w-4" />, tone: data.summary.unpriced ? 'bg-status-error-bg text-status-error-icon' : 'bg-muted text-muted-foreground' },
              ].map((tile) => (
                <div key={tile.label} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-xs">
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tile.tone)} aria-hidden="true">
                    {tile.icon}
                  </span>
                  <span>
                    <span className="block text-xl font-bold leading-none tabular-nums">{tile.value}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">{tile.label}</span>
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <SegmentedControl value={view} onValueChange={(value) => setView(value as typeof view)} aria-label={t('dermat_accounts.view', 'Show')}>
              <SegmentedControlItem value="due">{t('dermat_accounts.onlyDue', 'Money due')}</SegmentedControlItem>
              <SegmentedControlItem value="all">{t('dermat_accounts.all', 'All orders')}</SegmentedControlItem>
            </SegmentedControl>
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="dues-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('dermat_accounts.search', 'Order no. or customer')} />
            </div>
          </div>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {!data ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : !data.items.length ? (
              <EmptyState className="py-14" variant="subtle" icon={<Wallet className="h-5 w-5" aria-hidden="true" />} title={view === 'due' ? t('dermat_accounts.emptyDue', 'Nothing is due') : t('dermat_accounts.empty', 'No orders')} />
            ) : (
              <ul className="divide-y divide-border">
                {data.items.map((row) => {
                  const percent = row.total > 0 ? Math.min(100, Math.round((row.received / row.total) * 100)) : 0
                  return (
                    <li key={row.orderId}>
                      <Link href={`/backend/orders/${row.orderId}`} className="group grid grid-cols-1 items-center gap-3 px-5 py-4 transition-colors hover:bg-muted/40 md:grid-cols-12">
                        <div className="min-w-0 md:col-span-4">
                          <p className="font-mono text-sm font-semibold">{row.orderNo}</p>
                          <p className="truncate text-sm">{row.customerName}</p>
                          <p className="text-xs text-muted-foreground">
                            {day(row.orderDate)}
                            {row.paymentTerms ? ` · ${row.paymentTerms}` : ''}
                          </p>
                        </div>
                        <div className="md:col-span-4">
                          {row.priced ? (
                            <>
                              <div className="flex justify-between text-xs tabular-nums">
                                <span>
                                  {rupees(row.received)} {t('dermat_accounts.of', 'of')} {rupees(row.total)}
                                </span>
                                <span className="text-muted-foreground">{percent}%</span>
                              </div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-input" aria-hidden="true">
                                <div className={cn('h-full rounded-full', percent >= 100 ? 'bg-status-success-icon' : 'bg-accent-indigo')} style={{ width: `${percent}%` }} />
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {row.lastPayment ? t('dermat_accounts.last', 'Last {amount} on {date}', { amount: rupees(row.lastPayment.amount), date: day(row.lastPayment.paidOn) }) : t('dermat_accounts.noPayment', 'No payment yet')}
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-status-error-text">{t('dermat_accounts.noRates', 'No rates on this order')}</p>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-3 md:col-span-4 md:justify-end">
                          <div className="text-right">
                            <p className={cn('text-base font-bold tabular-nums', row.due > 0.5 ? 'text-status-warning-text' : 'text-status-success-text')}>{row.due > 0.5 ? rupees(row.due) : t('dermat_accounts.paid', 'Paid')}</p>
                            <StatusBadge variant={STATUS_VARIANT[row.status] ?? 'neutral'}>{row.status}</StatusBadge>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                        </div>
                      </Link>
                      {row.priced && row.due > 0.5 && row.status !== 'cancelled' ? (
                        <div className="flex flex-wrap items-center gap-2 px-5 pb-3">
                          {granted.has('dermat_accounts.record') ? (
                          <Button type="button" size="sm" variant="outline" onClick={() => setPaying(row)}>
                            <IndianRupee className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                            {t('dermat_accounts.recordPayment', 'Record payment')}
                          </Button>
                          ) : null}
                          <WhatsAppMenu
                            phone={row.customerPhone}
                            recipient={row.customerName}
                            messages={[
                              {
                                key: 'reminder',
                                label: t('dermat_accounts.reminder', 'Payment reminder'),
                                hint: `${rupeeText(row.due)} due on ${row.orderNo}`,
                                text: [
                                  `Dear ${row.customerName},`,
                                  '',
                                  `A balance of ${rupeeText(row.due)} is due on our order ${row.orderNo} dated ${dateText(row.orderDate)}.`,
                                  `Order value: ${rupeeText(row.total)} · Received: ${rupeeText(row.received)}`,
                                  'Please arrange the payment and share the UTR.',
                                  '',
                                  'Thank you,',
                                  'Dermat India – Accounts',
                                ].join('\n'),
                              },
                            ]}
                          />
                          <Button asChild type="button" size="sm" variant="ghost">
                            <Link href={`/backend/customers/companies/${row.customerId}`}>{t('dermat_accounts.statement', 'Customer statement')}</Link>
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
        <PaymentDialog
          open={Boolean(paying)}
          onOpenChange={(open) => (open ? null : setPaying(null))}
          order={paying ? { id: paying.orderId, orderNo: paying.orderNo, customerName: paying.customerName, due: paying.due } : null}
          onSaved={() => setReload((value) => value + 1)}
        />
      </PageBody>
    </Page>
  )
}

export default DuesPage
