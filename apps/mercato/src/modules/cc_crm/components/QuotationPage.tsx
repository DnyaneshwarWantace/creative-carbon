"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle2, FileText, Pencil, Printer, RotateCcw, Scale, Send, ShoppingCart, Waypoints, XCircle } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import type { DocCompany } from '../../cc_orders/components/printDocs'
import { formatDate, formatQty, todayIso } from '../../cc_orders/components/format'
import { useGranted } from '../../cc_departments/components/useGranted'
import { useSend } from '../../cc_production/components/finishing/shared'
import { printQuotation } from './printQuotation'
import { QUOTE_LABEL, QUOTE_VARIANT, type Quotation } from './types'
import { FieldList, LinkRows, Panel, RecordColumns, RecordPage, RecordState, type Fact } from '../../cc_ui/components/RecordPage'
import { recordHref } from '../../cc_ui/lib/links'
import { Timeline } from '../../cc_ui/components/Timeline'
import { CorrectDialog } from '../../cc_ui/components/CorrectDialog'

export function QuotationPage({ quotationId }: { quotationId: string }) {
  const t = useT()
  const router = useRouter()
  const granted = useGranted()
  const canManage = granted.has('cc_crm.manage')
  const canConvert = granted.has('cc_crm.convert') && granted.has('cc_orders.manage')
  const send = useSend(`cc-quotation-${quotationId}`)
  const [reopening, setReopening] = React.useState(false)
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

  if (error || !quote) return <RecordState error={error} loadingLabel={t('cc_crm.loading', 'Loading…')} />

  const symbol = quote.currency === 'INR' ? '₹' : `${quote.currency} `
  const exportTerms = quote.market === 'export'
  const totals = quote.totals ?? { gross: 0, discount: 0, taxable: 0, gst: 0, total: 0 }
  const converted = quote.status === 'converted'
  const value = exportTerms ? totals.taxable : totals.total
  const totalKg = quote.lines.filter((line) => line.product?.unit !== 'nos').reduce((sum, line) => sum + line.quantity, 0)
  const facts: Fact[] = [
    { label: t('cc_crm.quotations.date', 'Date'), value: formatDate(quote.quoteDate) },
    { label: t('cc_crm.form.validUntil', 'Valid until'), value: formatDate(quote.validUntil), tone: quote.expired ? 'bad' : undefined },
    { label: t('cc_crm.quotations.lines', 'Lines'), value: String(quote.lines.length) },
    { label: t('cc_crm.quotations.kg', 'Quantity'), value: `${formatQty(totalKg, 3)} kg` },
    { label: t('cc_crm.quotations.total', 'Value'), value: `${symbol}${formatQty(value, 2)}` },
    { label: t('cc_orders.form.market', 'Domestic / export'), value: exportTerms ? `${t('cc_orders.form.export', 'Export')} · ${quote.incoterm ?? '—'}` : t('cc_orders.form.domestic', 'Domestic') },
  ]

  return (
    <RecordPage
      back={{ href: '/backend/crm/quotations', label: t('cc_crm.nav.quotations', 'Quotations') }}
      overline={[t('cc_crm.quotations.overline', 'Quotation'), quote.customer?.name].filter(Boolean).join(' · ')}
      title={quote.quoteNo}
      badges={
        <>
          <StatusBadge variant={QUOTE_VARIANT[quote.status]}>{t(`cc_crm.quote.${quote.status}`, QUOTE_LABEL[quote.status])}</StatusBadge>
          {quote.expired ? <StatusBadge variant="error">{t('cc_crm.quotations.expired', 'expired')}</StatusBadge> : null}
        </>
      }
      meta={quote.byName ? t('cc_crm.quotations.madeBy', 'Made by {name}', { name: quote.byName }) : undefined}
      actions={
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (!printQuotation(quote, company)) flash(t('cc_crm.errors.popup', 'Allow pop-ups to print.'), 'error')
            }}
          >
            <Printer className="mr-1.5 h-4 w-4" />
            {t('cc_crm.actions.print', 'Print / PDF')}
          </Button>
          {canManage && !converted ? (
            <>
              <Button asChild variant="outline" size="sm">
                <Link href={`/backend/crm/quotations/${quote.id}/edit`}>
                  <Pencil className="mr-1.5 h-4 w-4" />
                  {t('cc_crm.actions.edit', 'Edit')}
                </Link>
              </Button>
              {quote.status === 'draft' ? (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => act('sent')}>
                  <Send className="mr-1.5 h-4 w-4" />
                  {t('cc_crm.actions.sent', 'Mark sent')}
                </Button>
              ) : null}
              {quote.status === 'draft' || quote.status === 'sent' ? (
                <>
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => act('accepted')}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    {t('cc_crm.actions.accepted', 'Accepted')}
                  </Button>
                  <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => act('rejected')}>
                    <XCircle className="mr-1.5 h-4 w-4" />
                    {t('cc_crm.actions.rejected', 'Rejected')}
                  </Button>
                </>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setReopening(true)}>
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  {t('cc_crm.actions.reopen', 'Reopen')}
                </Button>
              )}
            </>
          ) : null}
          {converted && quote.convertedOrderId ? (
            <Button asChild size="sm">
              <Link href={recordHref.order(quote.convertedOrderId)}>
                <ShoppingCart className="mr-1.5 h-4 w-4" />
                {t('cc_crm.actions.openOrder', 'Open order {no}', { no: quote.convertedOrderNo ?? '' })}
              </Link>
            </Button>
          ) : null}
        </>
      }
      facts={facts}
    >
      <RecordColumns
        main={
          <Panel title={t('cc_crm.quotations.linesTitle', 'Lines')} icon={FileText} count={quote.lines.length} flush>
            <div className="overflow-x-auto">
              <table className="w-full min-w-max text-sm">
                <thead className="bg-muted font-mono text-overline uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="border-b-2 border-foreground/70 px-3 py-2 text-left">#</th>
                    <th className="border-b-2 border-foreground/70 px-3 py-2 text-left">{t('cc_orders.form.product', 'Item')}</th>
                    <th className="border-b-2 border-foreground/70 px-3 py-2 text-right">{t('cc_crm.quotations.qty', 'Qty')}</th>
                    <th className="border-b-2 border-foreground/70 px-3 py-2 text-right">{t('cc_crm.quotations.rateShort', 'Rate')}</th>
                    <th className="border-b-2 border-foreground/70 px-3 py-2 text-right">{t('cc_orders.form.discount', 'Disc. %')}</th>
                    <th className="border-b-2 border-foreground/70 px-3 py-2 text-right">{t('cc_crm.quotations.amount', 'Amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {quote.lines.map((line, index) => {
                    const spec = line.specs?.material ?? {}
                    const unit = line.product?.unit === 'nos' ? t('cc_ui.pcs', 'pcs') : 'kg'
                    const detail = [spec.grade, spec.weave, spec.sheet_size, spec.thickness_mm ? `${spec.thickness_mm} mm` : null, spec.pieces ? t('cc_crm.quotations.sheets', '{n} sheets', { n: spec.pieces }) : null].filter(Boolean).join(' · ')
                    return (
                      <tr key={line.id} className="align-top even:bg-muted/30">
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{index + 1}</td>
                        <td className="px-3 py-2">
                          {line.product ? (
                            <Link className="font-medium underline-offset-2 hover:underline" href={recordHref.product(line.product.id)}>
                              {line.product.title}
                            </Link>
                          ) : (
                            '—'
                          )}
                          {detail ? <div className="text-xs text-muted-foreground">{detail}</div> : null}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {formatQty(line.quantity, unit === 'kg' ? 3 : 0)} {unit}
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{line.rate == null ? '—' : `${symbol}${formatQty(line.rate, 2)} / ${unit}`}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{line.discountPercent ? `${line.discountPercent}%` : '—'}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">
                          {symbol}
                          {formatQty(exportTerms ? (line.price?.taxable ?? 0) : (line.price?.total ?? 0), 2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot className="border-t-4 border-double border-foreground/70 bg-muted font-mono">
                  {exportTerms ? null : (
                    <>
                      <tr>
                        <td className="px-3 py-1.5 text-muted-foreground" colSpan={5}>
                          {t('cc_orders.form.taxable', 'Taxable')}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {symbol}
                          {formatQty(totals.taxable, 2)}
                        </td>
                      </tr>
                      <tr>
                        <td className="px-3 py-1.5 text-muted-foreground" colSpan={5}>
                          GST
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">
                          {symbol}
                          {formatQty(totals.gst, 2)}
                        </td>
                      </tr>
                    </>
                  )}
                  <tr className="font-semibold">
                    <td className="px-3 py-1.5" colSpan={5}>
                      Σ {t('cc_crm.quotations.total', 'Value')}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {symbol}
                      {formatQty(value, 2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Panel>
        }
        side={
          <>
            <Panel title={t('cc_crm.quotations.links', 'Came from · went to')} icon={Waypoints} flush>
              <LinkRows
                empty={t('cc_crm.quotations.noLinks', 'Not linked to an enquiry or order.')}
                rows={[
                  ...(quote.customer ? [{ key: 'customer', href: recordHref.customer(quote.customer.id), primary: quote.customer.name, secondary: t('cc_crm.quotations.customer', 'Customer') }] : []),
                  ...(quote.enquiryId ? [{ key: 'enquiry', href: recordHref.enquiry(quote.enquiryId), primary: <span className="font-mono">{quote.enquiryNo ?? '—'}</span>, secondary: t('cc_crm.quotations.fromEnquiry', 'Enquiry it answers') }] : []),
                  ...(quote.convertedOrderId ? [{ key: 'order', href: recordHref.order(quote.convertedOrderId), primary: <span className="font-mono">{quote.convertedOrderNo ?? '—'}</span>, secondary: t('cc_crm.quotations.becameOrder', 'Order booked from it') }] : []),
                ]}
              />
            </Panel>

            <Panel title={t('cc_crm.quotations.terms', 'Terms')} icon={Scale}>
              <FieldList
                columns={1}
                fields={[
                  [t('cc_orders.form.market', 'Domestic / export'), exportTerms ? t('cc_orders.form.export', 'Export') : t('cc_orders.form.domestic', 'Domestic')],
                  [t('cc_orders.form.currency', 'Currency'), quote.currency],
                  ...(exportTerms
                    ? ([
                        [t('cc_orders.form.incoterm', 'Incoterm'), quote.incoterm],
                        [t('cc_orders.form.port', 'Port of loading'), quote.portOfLoading],
                        [t('cc_orders.form.country', 'Country'), quote.country],
                      ] as Array<[string, React.ReactNode]>)
                    : []),
                  [t('cc_orders.form.paymentTerms', 'Payment terms'), quote.paymentRemarks ?? quote.paymentTerms],
                  [t('cc_orders.form.deliveryDate', 'Delivery date'), quote.deliveryDate ? formatDate(quote.deliveryDate) : null],
                  [t('cc_crm.quotations.by', 'Made by'), quote.byName],
                ]}
              />
            </Panel>

            {canConvert && !converted && quote.status !== 'rejected' ? (
              <Panel title={t('cc_crm.actions.convert', 'Convert to order')} icon={ShoppingCart}>
                <div className="space-y-3">
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
                </div>
              </Panel>
            ) : null}
          </>
        }
      />
      <Timeline type="quotation" id={quote.id} refreshKey={quote.history.length} />
      <CorrectDialog
        open={reopening}
        onOpenChange={setReopening}
        destructive={false}
        title={t('cc_crm.quote.reopenTitle', 'Reopen this quotation')}
        confirmLabel={t('cc_crm.quote.reopen', 'Reopen')}
        undo={[t('cc_crm.quote.undoStatus', 'Takes it back to draft so it can be changed and sent again')]}
        onConfirm={(reason) => act('reopen', { note: reason })}
      />
    </RecordPage>
  )
}

export default QuotationPage
