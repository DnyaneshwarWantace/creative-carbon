"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, Pencil, Printer, RotateCcw, Send, ShoppingCart, XCircle } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type { DocCompany } from '../../cc_orders/components/printDocs'
import { formatDate, formatDateTime, formatQty, todayIso } from '../../cc_orders/components/format'
import { useGranted } from '../../cc_departments/components/useGranted'
import { useSend } from '../../cc_production/components/finishing/shared'
import { printQuotation } from './printQuotation'
import { QUOTE_LABEL, QUOTE_VARIANT, type Quotation } from './types'

export function QuotationPage({ quotationId }: { quotationId: string }) {
  const t = useT()
  const router = useRouter()
  const granted = useGranted()
  const canManage = granted.has('cc_crm.manage')
  const canConvert = granted.has('cc_crm.convert') && granted.has('cc_orders.manage')
  const send = useSend(`cc-quotation-${quotationId}`)
  const [quote, setQuote] = React.useState<Quotation | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [company, setCompany] = React.useState<DocCompany | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [convert, setConvert] = React.useState({ orderDate: todayIso(), customerPoRef: '' })

  const load = React.useCallback(async () => {
    const call = await apiCall<Quotation>(`/api/cc_crm/quotations?id=${encodeURIComponent(quotationId)}`)
    if (call.ok && call.result) setQuote(call.result)
    else setError(t('cc_crm.errors.loadQuote', 'Could not load the quotation.'))
  }, [quotationId, t])

  React.useEffect(() => {
    void load()
    apiCall<DocCompany>('/api/cc_accounts/company').then((call) => setCompany(call.ok ? (call.result ?? null) : null))
  }, [load])

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    if (!quote) return
    setBusy(true)
    const result = await send<{ ok: boolean; status: string; order: { id: string; orderNo: string } | null }>('/api/cc_crm/quotations/action', 'POST', { id: quote.id, action, ...extra }, quote.updatedAt)
    setBusy(false)
    if (!result) return
    if (result.order) {
      flash(t('cc_crm.flash.converted', 'Order {no} booked from this quotation', { no: result.order.orderNo }), 'success')
      router.push(`/backend/orders/${result.order.id}`)
      return
    }
    flash(t('cc_crm.flash.quoteStatus', 'Quotation updated'), 'success')
    await load()
  }

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!quote) return <Page><PageBody><LoadingMessage label={t('cc_crm.loading', 'Loading…')} /></PageBody></Page>

  const symbol = quote.currency === 'INR' ? '₹' : `${quote.currency} `
  const exportTerms = quote.market === 'export'
  const totals = quote.totals ?? { gross: 0, discount: 0, taxable: 0, gst: 0, total: 0 }
  const converted = quote.status === 'converted'

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-6xl space-y-5 pb-16">
          <div className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <Button asChild variant="ghost" size="icon" aria-label={t('common.back', 'Back')}>
                <Link href={quote.enquiryId ? `/backend/crm/enquiries/${quote.enquiryId}` : '/backend/crm/quotations'}>
                  <ArrowLeft className="h-4 w-4" />
                </Link>
              </Button>
              <div>
                <h1 className="flex flex-wrap items-center gap-2 text-xl font-bold">
                  <span className="font-mono">{quote.quoteNo}</span>
                  <StatusBadge variant={QUOTE_VARIANT[quote.status]}>{t(`cc_crm.quote.${quote.status}`, QUOTE_LABEL[quote.status])}</StatusBadge>
                  {quote.expired ? <StatusBadge variant="error">{t('cc_crm.quotations.expired', 'expired')}</StatusBadge> : null}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {quote.customer?.name ?? '—'} · {formatDate(quote.quoteDate)} · {t('cc_crm.form.validUntil', 'Valid until')} {formatDate(quote.validUntil)}
                  {quote.enquiryNo ? (
                    <>
                      {' · '}
                      <Link className="text-primary hover:underline" href={`/backend/crm/enquiries/${quote.enquiryId}`}>
                        {quote.enquiryNo}
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => { if (!printQuotation(quote, company)) flash(t('cc_crm.errors.popup', 'Allow pop-ups to print.'), 'error') }}>
                <Printer className="mr-1.5 h-4 w-4" />
                {t('cc_crm.actions.print', 'Print / PDF')}
              </Button>
              {canManage && !converted ? (
                <>
                  <Button asChild variant="outline">
                    <Link href={`/backend/crm/quotations/${quote.id}/edit`}>
                      <Pencil className="mr-1.5 h-4 w-4" />
                      {t('cc_crm.actions.edit', 'Edit')}
                    </Link>
                  </Button>
                  {quote.status === 'draft' ? (
                    <Button type="button" variant="outline" disabled={busy} onClick={() => act('sent')}>
                      <Send className="mr-1.5 h-4 w-4" />
                      {t('cc_crm.actions.sent', 'Mark sent')}
                    </Button>
                  ) : null}
                  {quote.status === 'draft' || quote.status === 'sent' ? (
                    <>
                      <Button type="button" variant="outline" disabled={busy} onClick={() => act('accepted')}>
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        {t('cc_crm.actions.accepted', 'Accepted')}
                      </Button>
                      <Button type="button" variant="outline" disabled={busy} onClick={() => act('rejected')}>
                        <XCircle className="mr-1.5 h-4 w-4" />
                        {t('cc_crm.actions.rejected', 'Rejected')}
                      </Button>
                    </>
                  ) : (
                    <Button type="button" variant="outline" disabled={busy} onClick={() => act('reopen')}>
                      <RotateCcw className="mr-1.5 h-4 w-4" />
                      {t('cc_crm.actions.reopen', 'Reopen')}
                    </Button>
                  )}
                </>
              ) : null}
              {converted && quote.convertedOrderId ? (
                <Button asChild>
                  <Link href={`/backend/orders/${quote.convertedOrderId}`}>
                    <ShoppingCart className="mr-1.5 h-4 w-4" />
                    {t('cc_crm.actions.openOrder', 'Open order {no}', { no: quote.convertedOrderNo ?? '' })}
                  </Link>
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <section className="overflow-x-auto rounded-xl border bg-card shadow-xs">
                <table className="w-full min-w-max text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground">
                    <tr className="border-b">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">{t('cc_orders.form.product', 'Item')}</th>
                      <th className="px-3 py-2 text-right">{t('cc_orders.form.quantity', 'Qty (kg)')}</th>
                      <th className="px-3 py-2 text-right">{t('cc_crm.quotations.rate', 'Rate / kg')}</th>
                      <th className="px-3 py-2 text-right">{t('cc_orders.form.discount', 'Disc. %')}</th>
                      <th className="px-3 py-2 text-right">{t('cc_crm.quotations.amount', 'Amount')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quote.lines.map((line, index) => {
                      const spec = line.specs?.material ?? {}
                      const detail = [spec.grade, spec.weave, spec.sheet_size, spec.thickness_mm ? `${spec.thickness_mm} mm` : null, spec.pieces ? `${spec.pieces} pcs` : null].filter(Boolean).join(' · ')
                      return (
                        <tr key={line.id} className="border-b align-top last:border-0">
                          <td className="px-3 py-2 text-xs text-muted-foreground">{index + 1}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium">{line.product?.title ?? '—'}</div>
                            {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatQty(line.quantity, 3)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{line.rate == null ? '—' : `${symbol}${formatQty(line.rate, 2)}`}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{line.discountPercent ? `${line.discountPercent}%` : '—'}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{symbol}{formatQty(exportTerms ? (line.price?.taxable ?? 0) : (line.price?.total ?? 0), 2)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <dl className="ml-auto w-full max-w-xs space-y-1 border-t p-4 text-sm">
                  {exportTerms ? null : (
                    <>
                      <div className="flex justify-between"><dt className="text-muted-foreground">{t('cc_orders.form.taxable', 'Taxable')}</dt><dd className="tabular-nums">{symbol}{formatQty(totals.taxable, 2)}</dd></div>
                      <div className="flex justify-between"><dt className="text-muted-foreground">GST</dt><dd className="tabular-nums">{symbol}{formatQty(totals.gst, 2)}</dd></div>
                    </>
                  )}
                  <div className="flex justify-between border-t pt-1 font-bold"><dt>{t('cc_crm.quotations.total', 'Value')}</dt><dd className="tabular-nums">{symbol}{formatQty(exportTerms ? totals.taxable : totals.total, 2)}</dd></div>
                </dl>
              </section>

              <section className="rounded-xl border bg-card p-5 shadow-xs">
                <h2 className="mb-3 text-sm font-semibold">{t('cc_crm.history', 'History')}</h2>
                <ol className="space-y-2 text-sm">
                  {[...quote.history].reverse().map((item, index) => (
                    <li key={`${item.at}-${index}`} className="flex gap-3">
                      <span className="w-32 shrink-0 text-xs text-muted-foreground">{formatDateTime(item.at)}</span>
                      <span>
                        <span className="font-medium">{item.action}</span>
                        {item.note ? <span className="text-muted-foreground"> · {item.note}</span> : null}
                        {item.by ? <span className="text-xs text-muted-foreground"> — {item.by}</span> : null}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-xl border bg-card p-5 text-sm shadow-xs">
                <h2 className="mb-2 text-sm font-semibold">{t('cc_crm.quotations.terms', 'Terms')}</h2>
                <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5">
                  <dt className="text-muted-foreground">{t('cc_orders.form.market', 'Domestic / export')}</dt>
                  <dd className="text-right">{exportTerms ? t('cc_orders.form.export', 'Export') : t('cc_orders.form.domestic', 'Domestic')}</dd>
                  <dt className="text-muted-foreground">{t('cc_orders.form.currency', 'Currency')}</dt>
                  <dd className="text-right">{quote.currency}</dd>
                  {exportTerms ? (
                    <>
                      <dt className="text-muted-foreground">{t('cc_orders.form.incoterm', 'Incoterm')}</dt>
                      <dd className="text-right">{quote.incoterm ?? '—'}</dd>
                      <dt className="text-muted-foreground">{t('cc_orders.form.port', 'Port of loading')}</dt>
                      <dd className="text-right">{quote.portOfLoading ?? '—'}</dd>
                      <dt className="text-muted-foreground">{t('cc_orders.form.country', 'Country')}</dt>
                      <dd className="text-right">{quote.country ?? '—'}</dd>
                    </>
                  ) : null}
                  <dt className="text-muted-foreground">{t('cc_orders.form.paymentTerms', 'Payment terms')}</dt>
                  <dd className="text-right">{quote.paymentRemarks ?? quote.paymentTerms ?? '—'}</dd>
                  <dt className="text-muted-foreground">{t('cc_orders.form.deliveryDate', 'Delivery date')}</dt>
                  <dd className="text-right">{formatDate(quote.deliveryDate)}</dd>
                  <dt className="text-muted-foreground">{t('cc_crm.quotations.by', 'Made by')}</dt>
                  <dd className="text-right">{quote.byName ?? '—'}</dd>
                </dl>
              </section>

              {canConvert && !converted && quote.status !== 'rejected' ? (
                <section className="space-y-3 rounded-xl border border-primary/40 bg-card p-5 shadow-xs">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                    {t('cc_crm.actions.convert', 'Convert to order')}
                  </h2>
                  <p className="text-xs text-muted-foreground">{t('cc_crm.quotations.convertHint', 'Books an order with these lines, rates, specs and terms. The enquiry is marked won.')}</p>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('cc_orders.form.orderDate', 'Order date')}</Label>
                    <Input type="date" value={convert.orderDate} onChange={(event) => setConvert((prev) => ({ ...prev, orderDate: event.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{t('cc_orders.form.poRef', 'Customer PO / reference')}</Label>
                    <Input value={convert.customerPoRef} onChange={(event) => setConvert((prev) => ({ ...prev, customerPoRef: event.target.value }))} />
                  </div>
                  <Button type="button" className="w-full" disabled={busy} onClick={() => act('convert', { orderDate: convert.orderDate, customerPoRef: convert.customerPoRef || null })}>
                    {t('cc_crm.actions.convert', 'Convert to order')}
                  </Button>
                </section>
              ) : null}
            </aside>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}

export default QuotationPage
