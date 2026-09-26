"use client"

import * as React from 'react'
import { FileText, IndianRupee, Plus, Printer, Truck, X } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { useRouter } from 'next/navigation'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { formatDate, todayIso } from './format'
import { printCoa, printDoc, type CoaCheck } from './printDocs'
import type { Order, OrderPayment } from './types'

const MODES = ['NEFT / RTGS', 'UPI', 'Cheque', 'Cash', 'Other']
const KIND_LABEL: Record<OrderPayment['kind'], string> = { advance: 'Advance', balance: 'Balance', other: 'Other' }

function rupees(value: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)}`
}

export function OrderMoneyCard({ order, onChanged }: { order: Order; onChanged: () => void }) {
  const router = useRouter()
  const [piBusy, setPiBusy] = React.useState(false)
  const openProforma = async () => {
    setPiBusy(true)
    try {
      const list = await apiCall<{ items?: Array<{ id: string; status: string }> }>(`/api/dermat_accounts/proformas?orderId=${encodeURIComponent(order.id)}`, undefined, { fallback: { items: [] } })
      const current = (list.result?.items ?? []).find((pi) => pi.status !== 'cancelled')
      if (current) {
        router.push(`/backend/accounts/proformas/${current.id}`)
        return
      }
      const body = { orderId: order.id }
      const call = await runMutation({
        context: { orderId: order.id, document: 'proforma' },
        mutationPayload: body,
        operation: () => apiCall<{ id?: string; error?: string }>('/api/dermat_accounts/proformas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result?.id) {
        flash(call.result?.error ?? t('dermat_orders.money.piError', 'Could not make the proforma invoice.'), 'error')
        return
      }
      router.push(`/backend/accounts/proformas/${call.result.id}`)
    } finally {
      setPiBusy(false)
    }
  }
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: `dermat-order-money-${order.id}` })
  const [open, setOpen] = React.useState(false)
  const [voiding, setVoiding] = React.useState<OrderPayment | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [form, setForm] = React.useState({ kind: 'balance' as OrderPayment['kind'], amount: '', paidOn: todayIso(), mode: 'NEFT / RTGS', reference: '', note: '' })
  const [reason, setReason] = React.useState('')

  const total = order.totals.total
  const paid = order.payments.received
  const due = Math.max(0, order.payments.due)
  const percent = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0
  const priced = total > 0

  const post = async (path: string, body: Record<string, unknown>, done: string) => {
    setBusy(true)
    try {
      const call = await runMutation({
        context: { orderId: order.id, path },
        mutationPayload: body,
        operation: () => apiCall<{ id?: string; error?: string }>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || call.result?.error) {
        flash(call.result?.error ?? t('dermat_orders.money.error', 'That did not work.'), 'error')
        return false
      }
      flash(done, 'success')
      onChanged()
      return true
    } finally {
      setBusy(false)
    }
  }

  const record = async () => {
    const amount = Number(form.amount)
    if (!(amount > 0)) {
      flash(t('dermat_orders.money.needAmount', 'Enter the amount.'), 'error')
      return
    }
    const ok = await post(
      '/api/dermat_accounts/payments',
      { orderId: order.id, kind: form.kind, amount, paidOn: form.paidOn, mode: form.mode, reference: form.reference.trim() || null, note: form.note.trim() || null },
      t('dermat_orders.money.recorded', 'Payment recorded.'),
    )
    if (ok) {
      setOpen(false)
      setForm((prev) => ({ ...prev, amount: '', reference: '', note: '' }))
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-muted/20 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <IndianRupee className="h-4 w-4 text-primary" aria-hidden="true" />
          {t('dermat_orders.money.title', 'Money & documents')}
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void openProforma()} disabled={piBusy}>
            <FileText className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t('dermat_orders.money.pi', 'Proforma invoice')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => printDoc(order, 'invoice')} disabled={!order.stages.find((stage) => stage.key === 'billing')?.data?.invoice_number}>
            <Printer className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t('dermat_orders.money.invoice', 'Tax invoice')}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!Object.values(order.qc ?? {}).some((list) => list.length)}
            onClick={() => printCoa(order, async (id) => (await apiCall<CoaCheck>(`/api/dermat_quality/checks?id=${encodeURIComponent(id)}`)).result ?? null)}
          >
            <FileText className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t('dermat_orders.money.coa', 'COA')}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => printDoc(order, 'challan')}>
            <Truck className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
            {t('dermat_orders.money.challan', 'Delivery challan')}
          </Button>
          {order.status !== 'cancelled' ? (
            <Button type="button" size="sm" onClick={() => setOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t('dermat_orders.money.record', 'Record payment')}
            </Button>
          ) : null}
        </div>
      </header>
      <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-5">
        <div className="space-y-3 md:col-span-2">
          {priced ? (
            <>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">{t('dermat_orders.money.received', 'Received')}</p>
                  <p className="text-xl font-bold tabular-nums">{rupees(paid)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{t('dermat_orders.money.due', 'Due')}</p>
                  <p className={cn('text-xl font-bold tabular-nums', due > 0 ? 'text-status-warning-text' : 'text-status-success-text')}>{rupees(due)}</p>
                </div>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-input" aria-hidden="true">
                <div className={cn('h-full rounded-full', percent >= 100 ? 'bg-status-success-icon' : 'bg-accent-indigo')} style={{ width: `${percent}%` }} />
              </div>
              <dl className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">{t('dermat_orders.money.taxable', 'Taxable value')}</dt>
                  <dd className="tabular-nums">{rupees(order.totals.taxable)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">GST</dt>
                  <dd className="tabular-nums">{rupees(order.totals.gst)}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>{t('dermat_orders.money.total', 'Order total')}</dt>
                  <dd className="tabular-nums">{rupees(total)}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              {t('dermat_orders.money.unpriced', 'No rates on this order yet. Add the rate per piece on the order to see the total and what is due.')}
            </p>
          )}
        </div>
        <div className="md:col-span-3">
          {order.payments.items.length ? (
            <ul className="divide-y rounded-md border text-sm">
              {order.payments.items.map((payment) => (
                <li key={payment.id} className={cn('flex items-center justify-between gap-3 px-3 py-2', payment.voided && 'opacity-50')}>
                  <span className="min-w-0">
                    <span className={cn('font-semibold tabular-nums', payment.voided && 'line-through')}>{rupees(payment.amount)}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {KIND_LABEL[payment.kind]} · {formatDate(payment.paidOn)}
                      {payment.mode ? ` · ${payment.mode}` : ''}
                      {payment.reference ? ` · ${payment.reference}` : ''}
                    </span>
                    {payment.voided ? <span className="block text-xs text-status-error-text">{t('dermat_orders.money.voided', 'Voided: {reason}', { reason: payment.voidReason ?? '' })}</span> : null}
                  </span>
                  {!payment.voided ? (
                    <button type="button" className="text-muted-foreground hover:text-destructive" aria-label={t('dermat_orders.money.void', 'Void payment')} onClick={() => setVoiding(payment)}>
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              {t('dermat_orders.money.none', 'No payment yet. The advance is recorded here automatically when the Advance stage is done.')}
            </p>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              record()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('dermat_orders.money.recordTitle', 'Record a payment for {order}', { order: order.orderNo })}</DialogTitle>
            <DialogDescription>{priced ? t('dermat_orders.money.recordHint', '{due} is due.', { due: rupees(due) }) : ''}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pay-amount">{t('dermat_orders.money.amount', 'Amount (₹) *')}</Label>
              <div className="flex gap-1.5">
                <Input id="pay-amount" inputMode="decimal" className="tabular-nums" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} autoFocus />
                {due > 0 ? (
                  <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => setForm({ ...form, amount: String(due), kind: 'balance' })}>
                    {t('dermat_orders.money.fullDue', 'Full due')}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-date">{t('dermat_orders.money.date', 'Received on *')}</Label>
              <Input id="pay-date" type="date" value={form.paidOn} onChange={(event) => setForm({ ...form, paidOn: event.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-kind">{t('dermat_orders.money.kind', 'For')}</Label>
              <Select value={form.kind} onValueChange={(value) => setForm({ ...form, kind: value as OrderPayment['kind'] })}>
                <SelectTrigger id="pay-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['advance', 'balance', 'other'] as const).map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {KIND_LABEL[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-mode">{t('dermat_orders.money.mode', 'Mode')}</Label>
              <Select value={form.mode} onValueChange={(value) => setForm({ ...form, mode: value })}>
                <SelectTrigger id="pay-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODES.map((mode) => (
                    <SelectItem key={mode} value={mode}>
                      {mode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="pay-ref">{t('dermat_orders.money.reference', 'UTR / cheque no.')}</Label>
              <Input id="pay-ref" value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="button" onClick={record} disabled={busy}>
              {t('dermat_orders.money.save', 'Record payment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={voiding !== null} onOpenChange={(value) => (!value ? setVoiding(null) : undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('dermat_orders.money.voidTitle', 'Void this payment')}</DialogTitle>
            <DialogDescription>{voiding ? `${rupees(voiding.amount)} · ${formatDate(voiding.paidOn)}` : ''}</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="void-reason">{t('dermat_orders.money.reason', 'Reason *')}</Label>
            <Textarea id="void-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setVoiding(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              variant="destructive-solid"
              disabled={busy || !reason.trim()}
              onClick={async () => {
                if (!voiding) return
                if (await post('/api/dermat_accounts/payments/void', { id: voiding.id, reason: reason.trim() }, t('dermat_orders.money.voidedFlash', 'Payment voided.'))) {
                  setVoiding(null)
                  setReason('')
                }
              }}
            >
              {t('dermat_orders.money.voidConfirm', 'Void payment')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
