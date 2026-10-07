"use client"

import * as React from 'react'
import { ListSelectItems } from '../../cc_lists/components/ListSelectItems'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { SearchPicker, type PickerOption } from '../../cc_orders/components/SearchPicker'
import { rupeeText } from '../../cc_products/lib/whatsapp'

export type PaymentRow = {
  id: string
  kind: 'advance' | 'balance' | 'other'
  amount: number
  paidOn: string
  mode: string | null
  reference: string | null
  note: string | null
  byName: string | null
  voided: boolean
  voidReason: string | null
  orderId: string
  orderNo: string
  invoiceId: string | null
  invoiceCode: string | null
  history: Array<{ action: string; by: string | null; at: string; note: string | null }>
  updatedAt: string
  customerName?: string
}

type OrderHit = { id: string; orderNo: string; customerName: string }
type InvoiceHit = { id: string; code: string; totals: { payable: number } }

const NONE = '__none'

function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  order?: { id: string; orderNo: string; customerName?: string; due?: number } | null
  payment?: PaymentRow | null
  onSaved: () => void
}

export function PaymentDialog({ open, onOpenChange, order, payment, onSaved }: Props) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'cc-payment-dialog' })
  const [picked, setPicked] = React.useState<PickerOption<OrderHit> | null>(null)
  const [invoices, setInvoices] = React.useState<InvoiceHit[]>([])
  const [busy, setBusy] = React.useState(false)
  const [form, setForm] = React.useState({ kind: 'balance', amount: '', paidOn: today(), mode: 'NEFT / RTGS', reference: '', note: '', invoiceId: '', reason: '' })
  const orderId = payment?.orderId ?? order?.id ?? picked?.id ?? null

  React.useEffect(() => {
    if (!open) return
    setPicked(null)
    setForm(
      payment
        ? { kind: payment.kind, amount: String(payment.amount), paidOn: payment.paidOn, mode: payment.mode ?? 'NEFT / RTGS', reference: payment.reference ?? '', note: payment.note ?? '', invoiceId: payment.invoiceId ?? '', reason: '' }
        : { kind: 'balance', amount: order?.due && order.due > 0 ? String(Math.round(order.due * 100) / 100) : '', paidOn: today(), mode: 'NEFT / RTGS', reference: '', note: '', invoiceId: '', reason: '' },
    )
  }, [open, payment, order])

  React.useEffect(() => {
    if (!orderId) {
      setInvoices([])
      return
    }
    apiCall<{ items?: InvoiceHit[] }>(`/api/cc_accounts/invoices?orderId=${encodeURIComponent(orderId)}&kind=invoice&status=issued`, undefined, { fallback: { items: [] } }).then((call) => setInvoices(call.result?.items ?? []))
  }, [orderId])

  const loadOrders = async (term: string): Promise<PickerOption<OrderHit>[]> => {
    const params = new URLSearchParams({ pageSize: '20' })
    if (term.trim()) params.set('search', term.trim())
    const call = await apiCall<{ items?: OrderHit[] }>(`/api/cc_orders/orders?${params.toString()}`, undefined, { fallback: { items: [] } })
    return (call.result?.items ?? []).map((row) => ({ id: row.id, primary: row.orderNo, secondary: row.customerName, value: row }))
  }

  const save = async () => {
    if (!orderId) {
      flash(t('cc_accounts.pay.pickOrder', 'Pick the order'), 'error')
      return
    }
    const amount = Number(form.amount)
    if (!(amount > 0)) {
      flash(t('cc_accounts.pay.amount', 'Enter the amount'), 'error')
      return
    }
    if (payment && !form.reason.trim()) {
      flash(t('cc_accounts.pay.reasonNeeded', 'Write why the payment is changed'), 'error')
      return
    }
    setBusy(true)
    try {
      const body = payment
        ? { id: payment.id, kind: form.kind, amount, paidOn: form.paidOn, mode: form.mode, reference: form.reference, note: form.note, invoiceId: form.invoiceId || null, reason: form.reason }
        : { orderId, kind: form.kind, amount, paidOn: form.paidOn, mode: form.mode, reference: form.reference || null, note: form.note || null, invoiceId: form.invoiceId || null }
      const request = () => apiCall<{ error?: string }>('/api/cc_accounts/payments', { method: payment ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const call = await runMutation({
        context: { orderId, paymentId: payment?.id ?? null },
        mutationPayload: body,
        operation: () => (payment ? withScopedApiRequestHeaders(buildOptimisticLockHeader(payment.updatedAt), request) : request()),
      })
      if (!call.ok) {
        flash(
          call.status === 409 && (!call.result?.error || call.result?.error === 'record_modified')
            ? t('cc_accounts.pay.conflict', 'Someone else changed this payment. Close and open it again.')
            : (call.result?.error ?? t('cc_accounts.pay.error', 'Could not save the payment.')),
          'error',
        )
        return
      }
      flash(payment ? t('cc_accounts.pay.updated', 'Payment corrected') : t('cc_accounts.pay.recorded', 'Payment recorded'), 'success')
      onOpenChange(false)
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void save()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{payment ? t('cc_accounts.pay.editTitle', 'Correct payment') : t('cc_accounts.pay.newTitle', 'Record payment')}</DialogTitle>
          <DialogDescription>
            {payment
              ? t('cc_accounts.pay.editHint', '{order} · the change and your reason are kept in the payment history.', { order: payment.orderNo })
              : order
                ? t('cc_accounts.pay.forOrder', 'For {order}{customer}', { order: order.orderNo, customer: order.customerName ? ` · ${order.customerName}` : '' })
                : t('cc_accounts.pay.pickHint', 'Pick the order the money is for.')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {!payment && !order ? (
            <div className="col-span-2 space-y-1">
              <Label className="text-xs text-muted-foreground">{t('cc_accounts.pay.order', 'Order *')}</Label>
              <SearchPicker value={picked} placeholder={t('cc_accounts.pay.orderPick', 'Search order no. or customer')} searchPlaceholder={t('cc_accounts.pay.orderSearch', 'Order no. or customer')} load={loadOrders} onSelect={setPicked} />
            </div>
          ) : null}
          <div className="space-y-1">
            <Label htmlFor="pay-kind" className="text-xs text-muted-foreground">{t('cc_accounts.pay.kind', 'Type')}</Label>
            <Select value={form.kind} onValueChange={(value) => set('kind', value)}>
              <SelectTrigger id="pay-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="advance">{t('cc_accounts.pay.advance', 'Advance')}</SelectItem>
                <SelectItem value="balance">{t('cc_accounts.pay.balance', 'Balance')}</SelectItem>
                <SelectItem value="other">{t('cc_accounts.pay.other', 'Other')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pay-amount" className="text-xs text-muted-foreground">{t('cc_accounts.pay.amountLabel', 'Amount (₹) *')}</Label>
            <Input id="pay-amount" type="number" min={0} step="any" className="text-right" value={form.amount} onChange={(event) => set('amount', event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pay-date" className="text-xs text-muted-foreground">{t('cc_accounts.pay.date', 'Received on *')}</Label>
            <Input id="pay-date" type="date" value={form.paidOn} onChange={(event) => set('paidOn', event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pay-mode" className="text-xs text-muted-foreground">{t('cc_accounts.pay.mode', 'Mode')}</Label>
            <Select value={form.mode} onValueChange={(value) => set('mode', value)}>
              <SelectTrigger id="pay-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <ListSelectItems listKey="payment_modes" current={form.mode} />
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pay-ref" className="text-xs text-muted-foreground">{t('cc_accounts.pay.ref', 'UTR / cheque no.')}</Label>
            <Input id="pay-ref" value={form.reference} onChange={(event) => set('reference', event.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pay-invoice" className="text-xs text-muted-foreground">{t('cc_accounts.pay.invoice', 'For invoice')}</Label>
            <Select value={form.invoiceId || NONE} onValueChange={(value) => set('invoiceId', value === NONE ? '' : value)} disabled={!invoices.length}>
              <SelectTrigger id="pay-invoice">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{invoices.length ? t('cc_accounts.pay.noInvoice', 'On account (oldest first)') : t('cc_accounts.pay.noneIssued', 'No issued invoice yet')}</SelectItem>
                {invoices.map((invoice) => (
                  <SelectItem key={invoice.id} value={invoice.id}>
                    {invoice.code} · {rupeeText(invoice.totals.payable)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label htmlFor="pay-note" className="text-xs text-muted-foreground">{t('cc_accounts.pay.note', 'Note')}</Label>
            <Input id="pay-note" value={form.note} onChange={(event) => set('note', event.target.value)} />
          </div>
          {payment ? (
            <div className="col-span-2 space-y-1">
              <Label htmlFor="pay-reason" className="text-xs text-muted-foreground">{t('cc_accounts.pay.reason', 'Why is it changed? *')}</Label>
              <Textarea id="pay-reason" rows={2} value={form.reason} onChange={(event) => set('reason', event.target.value)} />
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={busy}>
            {payment ? t('cc_accounts.pay.saveEdit', 'Save correction') : t('cc_accounts.pay.save', 'Record payment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default PaymentDialog
