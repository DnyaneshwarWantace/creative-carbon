"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, FileText, IndianRupee, Receipt } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Timeline } from '../../cc_ui/components/Timeline'
import { PageLoading } from '../../cc_ui/components/PageLoading'
import { recordHref } from '../../cc_ui/lib/links'
import { paymentTermLabel } from '../../cc_lists/lib/paymentTerms'
import { ORDER_VARIANT, formatDate, formatQty } from './format'
import { OrderMoneyCard } from './OrderMoneyCard'
import type { Order } from './types'

type Doc = { id: string; code: string; status: string; kind?: string; invoiceDate?: string; piDate?: string; totals?: { payable?: number; total?: number } }

export function OrderAccountPage({ orderId }: { orderId: string }) {
  const t = useT()
  const [order, setOrder] = React.useState<Order | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [docs, setDocs] = React.useState<{ invoices: Doc[]; proformas: Doc[] }>({ invoices: [], proformas: [] })

  const load = React.useCallback(async () => {
    const call = await apiCall<Order>(`/api/cc_orders/orders?id=${encodeURIComponent(orderId)}`)
    if (!call.ok || !call.result) {
      setError(t('cc_orders.errors.load', 'Could not load the order.'))
      return
    }
    setOrder(call.result)
    const [invoices, proformas] = await Promise.all([
      apiCall<{ items?: Doc[] }>(`/api/cc_accounts/invoices?orderId=${encodeURIComponent(orderId)}`, undefined, { fallback: { items: [] } }),
      apiCall<{ items?: Doc[] }>(`/api/cc_accounts/proformas?orderId=${encodeURIComponent(orderId)}`, undefined, { fallback: { items: [] } }),
    ])
    setDocs({ invoices: invoices.result?.items ?? [], proformas: proformas.result?.items ?? [] })
  }, [orderId, t])

  React.useEffect(() => {
    void load()
  }, [load])

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!order) return <Page><PageBody><PageLoading label={t('cc_orders.loading', 'Loading…')} /></PageBody></Page>
  if (!order.canSeeMoney || !order.totals || !order.payments) {
    return <Page><PageBody><ErrorMessage label={t('cc_orders.account.noAccess', 'You cannot see the money on this order.')} /></PageBody></Page>
  }

  const total = order.totals.total
  const received = order.payments.received
  const due = Math.max(0, order.payments.due)
  const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0
  const documents = [
    ...docs.proformas.map((doc) => ({ ...doc, label: t('cc_orders.account.pi', 'Proforma'), href: recordHref.proforma(doc.id), date: doc.piDate })),
    ...docs.invoices.map((doc) => ({ ...doc, label: doc.kind === 'credit_note' ? t('cc_orders.account.cn', 'Credit note') : t('cc_orders.account.invoice', 'Tax invoice'), href: recordHref.invoice(doc.id), date: doc.invoiceDate })),
  ]

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-6xl space-y-5 pb-16">
          <header className="cc-band overflow-hidden">
            <div className="flex flex-col gap-3 px-5 pt-5 pb-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-1.5">
                <div className="flex items-center gap-3">
                  <Link href="/backend/accounts/dues" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                    <ArrowLeft className="h-3 w-3" />
                    {t('cc_orders.account.back', 'Payments & dues')}
                  </Link>
                  <span className="cc-overline">{t('cc_orders.account.overline', 'Order account')}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-mono text-2xl font-bold tracking-tight">{order.orderNo}</h1>
                  <StatusBadge variant={ORDER_VARIANT[order.status] ?? 'neutral'} dot>
                    {t(`cc_orders.status.${order.status}`, order.status)}
                  </StatusBadge>
                  <StatusBadge variant={due > 0.5 ? 'warning' : 'success'}>{due > 0.5 ? t('cc_orders.account.dueBadge', 'Payment due') : t('cc_orders.account.paidBadge', 'Fully paid')}</StatusBadge>
                </div>
                <p className="text-sm">
                  <Link href={recordHref.customer(order.customerId)} className="font-semibold text-primary hover:underline">
                    {order.customer?.name ?? t('cc_orders.view.customer', 'Customer')}
                  </Link>
                  <span className="text-muted-foreground">
                    {' · '}
                    {formatDate(order.orderDate)}
                    {order.paymentTerms ? ` · ${paymentTermLabel(order.paymentTerms)}` : ''}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href={recordHref.order(order.id)}>
                    <Receipt className="mr-1.5 h-4 w-4" />
                    {t('cc_orders.account.openOrder', 'Open the order')}
                  </Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link href={recordHref.customer(order.customerId)}>{t('cc_accounts.statement', 'Customer statement')}</Link>
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 px-5 pb-5 sm:grid-cols-4 sm:px-6">
              <div className="cc-tile">
                <div className="text-xs text-muted-foreground">{t('cc_orders.view.orderValue', 'Order value')}</div>
                <div className="cc-figure text-base">₹ {formatQty(total, 0)}</div>
              </div>
              <div className="cc-tile">
                <div className="text-xs text-muted-foreground">{t('cc_orders.view.received', 'Received')}</div>
                <div className="cc-figure text-base text-status-success-icon">₹ {formatQty(received, 0)}</div>
              </div>
              <div className="cc-tile">
                <div className="text-xs text-muted-foreground">{t('cc_orders.view.due', 'Due')}</div>
                <div className={cn('cc-figure text-base', due > 0.5 && 'cc-text-accent')}>₹ {formatQty(due, 0)}</div>
              </div>
              <div className="cc-tile">
                <div className="text-xs text-muted-foreground">{t('cc_orders.account.paidShare', 'Paid')}</div>
                <div className="cc-figure text-base">{percent}%</div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                  <div className="h-full bg-status-success-solid" style={{ width: `${percent}%` }} />
                </div>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="min-w-0 space-y-4 lg:col-span-8">
              <OrderMoneyCard order={order} onChanged={load} />
            </div>
            <aside className="space-y-4 lg:col-span-4">
              <section className="space-y-3 rounded-lg border bg-card p-4" aria-labelledby="account-docs">
                <h2 id="account-docs" className="flex items-center gap-2 text-sm font-semibold">
                  <FileText className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {t('cc_orders.account.documents', 'Bills on this order')}
                </h2>
                {documents.length ? (
                  <ul className="divide-y text-sm">
                    {documents.map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between gap-2 py-2">
                        <Link href={doc.href} className="min-w-0">
                          <span className="block font-mono text-xs text-primary hover:underline">{doc.code}</span>
                          <span className="text-xs text-muted-foreground">{[doc.label, doc.date ? formatDate(doc.date) : null].filter(Boolean).join(' · ')}</span>
                        </Link>
                        <span className="text-right">
                          <span className="block text-xs font-semibold tabular-nums">₹ {formatQty(doc.totals?.payable ?? doc.totals?.total ?? 0, 0)}</span>
                          <StatusBadge variant={doc.status === 'cancelled' ? 'neutral' : doc.status === 'issued' ? 'success' : 'info'}>{doc.status}</StatusBadge>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('cc_orders.account.noDocs', 'No proforma or invoice yet. Make them from the money panel.')}</p>
                )}
              </section>
              <section className="space-y-2 rounded-lg border bg-card p-4" aria-labelledby="account-payments">
                <h2 id="account-payments" className="flex items-center gap-2 text-sm font-semibold">
                  <IndianRupee className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {t('cc_orders.account.receipts', 'Receipts')}
                </h2>
                {order.payments.items.length ? (
                  <ul className="space-y-1 text-sm">
                    {order.payments.items.map((payment) => (
                      <li key={payment.id} className={cn('flex justify-between gap-2', payment.voided && 'text-muted-foreground line-through')}>
                        <Link href={recordHref.payment(payment.id)} className="hover:underline">
                          {formatDate(payment.paidOn)} · {payment.mode ?? '—'}
                        </Link>
                        <span className="tabular-nums">₹ {formatQty(payment.amount, 0)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('cc_accounts.noPayment', 'No payment yet')}</p>
                )}
              </section>
              <Timeline type="order" id={order.id} refreshKey={order.updatedAt} />
            </aside>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}

export default OrderAccountPage
