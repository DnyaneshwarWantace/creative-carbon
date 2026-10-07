"use client"

import * as React from 'react'
import { useGranted } from '../../cc_departments/components/useGranted'
import { ViewOnlyNote } from '../../cc_departments/components/ViewOnlyNote'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Ban, CheckCircle2, FileMinus, History, Printer, Save } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { WhatsAppMenu } from '../../cc_products/components/WhatsAppMenu'
import { dateText, rupeeText } from '../../cc_products/lib/whatsapp'
import { buildInvoiceHtml, printInvoice } from './invoicePrint'
import { INVOICE_STATUS, type CompanyView, type InvoiceView } from './types'

const HISTORY: Record<string, string> = { created: 'Drafted', edited: 'Edited', quantities: 'Quantities changed', issued: 'Issued', credited: 'Credit note made', cancelled: 'Cancelled' }

function when(value: string): string {
  return new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export function InvoicePage({ id }: { id: string }) {
  const t = useT()
  const granted = useGranted()
  const canRecord = !granted.ready || granted.has('cc_accounts.record')
  const router = useRouter()
  const { runMutation } = useGuardedMutation({ contextId: `cc-invoice-${id}` })
  const [doc, setDoc] = React.useState<InvoiceView | null>(null)
  const [company, setCompany] = React.useState<CompanyView | null>(null)
  const [phone, setPhone] = React.useState<string | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [form, setForm] = React.useState<Record<string, string>>({})
  const [qty, setQty] = React.useState<Record<string, string>>({})
  const [mode, setMode] = React.useState<'cancel' | 'credit' | null>(null)
  const [reason, setReason] = React.useState('')
  const [creditQty, setCreditQty] = React.useState<Record<string, string>>({})

  const apply = (next: InvoiceView) => {
    setDoc(next)
    setForm({
      invoiceDate: next.invoiceDate,
      dueDate: next.dueDate ?? '',
      transporter: next.transporter ?? '',
      vehicleNo: next.vehicleNo ?? '',
      lrNo: next.lrNo ?? '',
      ewayBillNo: next.ewayBillNo ?? '',
      terms: next.terms ?? '',
      bankDetails: next.bankDetails ?? '',
      notes: next.notes ?? '',
    })
    setQty(Object.fromEntries(next.lines.map((line) => [line.orderLineId, String(line.quantity)])))
    setCreditQty({})
  }

  const load = React.useCallback(async () => {
    const [call, companyCall] = await Promise.all([apiCall<InvoiceView>(`/api/cc_accounts/invoices?id=${encodeURIComponent(id)}`), apiCall<CompanyView>('/api/cc_accounts/company')])
    if (!call.ok || !call.result) {
      setLoadError(call.status === 404 ? t('cc_accounts.inv.notFound', 'This invoice does not exist.') : t('cc_accounts.inv.loadError', 'Could not load the invoice.'))
      return
    }
    apply(call.result)
    setCompany(companyCall.result ?? null)
    const order = await apiCall<{ customer?: { phone?: string | null } | null }>(`/api/cc_orders/orders?id=${encodeURIComponent(call.result.orderId)}`)
    setPhone(order.result?.customer?.phone ?? null)
  }, [id, t])

  React.useEffect(() => {
    load()
  }, [load])

  const send = async (url: string, body: Record<string, unknown>, success: string, onDone?: (result: InvoiceView) => void) => {
    if (!doc) return false
    setBusy(true)
    try {
      const call = await runMutation({
        context: { invoiceId: doc.id, url },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(doc.updatedAt), () =>
            apiCall<InvoiceView & { error?: string }>(url, { method: url.endsWith('/action') ? 'POST' : 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
          ),
      })
      if (!call.ok || !call.result) {
        flash(
          call.status === 409 && (!call.result?.error || call.result?.error === 'record_modified')
            ? t('cc_accounts.inv.conflict', 'Someone else changed this invoice. Reloaded the latest.')
            : (call.result?.error ?? t('cc_accounts.inv.saveError', 'Could not save.')),
          'error',
        )
        if (call.status === 409) await load()
        return false
      }
      if (onDone) onDone(call.result)
      else apply(call.result)
      flash(success, 'success')
      return true
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <Page>
        <PageBody>
          <div className="mx-auto max-w-xl space-y-4 py-16 text-center">
            <ErrorMessage label={loadError} />
            <Button asChild variant="outline">
              <Link href="/backend/accounts/invoices">{t('cc_accounts.inv.back', 'All invoices')}</Link>
            </Button>
          </div>
        </PageBody>
      </Page>
    )
  }
  if (!doc || !company) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('cc_accounts.inv.loading', 'Loading invoice…')} />
        </PageBody>
      </Page>
    )
  }

  const draft = doc.status === 'draft'
  const credit = doc.kind === 'credit_note'
  const status = INVOICE_STATUS[doc.status]
  const save = () =>
    send(
      '/api/cc_accounts/invoices',
      {
        id,
        ...(draft ? { invoiceDate: form.invoiceDate, lines: doc.lines.map((line) => ({ orderLineId: line.orderLineId, quantity: Number(qty[line.orderLineId] || 0) })) } : {}),
        dueDate: form.dueDate || null,
        transporter: form.transporter,
        vehicleNo: form.vehicleNo,
        lrNo: form.lrNo,
        ewayBillNo: form.ewayBillNo,
        terms: form.terms,
        bankDetails: form.bankDetails,
        notes: form.notes,
      },
      t('cc_accounts.inv.saved', 'Invoice saved'),
    )
  const message = [
    `Dear ${doc.customerName},`,
    '',
    `${credit ? 'Credit note' : 'Tax invoice'} ${doc.code} dated ${dateText(doc.invoiceDate)} for order ${doc.orderNo}${credit && doc.againstCode ? ` (against ${doc.againstCode})` : ''}.`,
    ...doc.lines.map((line, index) => `${index + 1}. ${line.brandName ? `${line.brandName} ` : ''}${line.title}: ${line.quantity} pcs`),
    '',
    `${credit ? 'Credit amount' : 'Amount payable'}: ${rupeeText(doc.totals.payable)}`,
    !credit && doc.dueDate ? `Due by ${dateText(doc.dueDate)}` : null,
    doc.lrNo || doc.vehicleNo ? `Transport: ${[doc.transporter, doc.vehicleNo, doc.lrNo ? `LR ${doc.lrNo}` : null].filter(Boolean).join(' · ')}` : null,
    '',
    `Thank you,\n${company.name}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')
  const field = (key: string, label: string, props: { type?: string; disabled?: boolean; upper?: boolean } = {}) => (
    <div className="space-y-1">
      <Label htmlFor={`inv-${key}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input
        id={`inv-${key}`}
        type={props.type ?? 'text'}
        value={form[key] ?? ''}
        disabled={doc.status === 'cancelled' || !canRecord || props.disabled}
        className={props.upper ? 'uppercase' : undefined}
        onChange={(event) => setForm((prev) => ({ ...prev, [key]: props.upper ? event.target.value.toUpperCase() : event.target.value }))}
      />
    </div>
  )

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-7xl flex-col gap-5 pb-16">
          <header className="flex flex-col gap-4 border-b pb-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 space-y-1">
              <Link href="/backend/accounts/invoices" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                {t('cc_accounts.inv.back', 'All invoices')}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-mono text-xl font-bold">{doc.code}</h1>
                <StatusBadge variant={status.variant} dot>
                  {status.label}
                </StatusBadge>
                <StatusBadge variant={credit ? 'info' : 'neutral'}>{credit ? t('cc_accounts.inv.creditNote', 'Credit note') : t('cc_accounts.inv.taxInvoice', 'Tax invoice')}</StatusBadge>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{doc.customerName}</span> ·{' '}
                <Link href={`/backend/orders/${doc.orderId}`} className="font-mono text-primary hover:underline">
                  {doc.orderNo}
                </Link>{' '}
                · {rupeeText(doc.totals.payable)} · {doc.interState ? 'IGST' : 'CGST + SGST'}
                {credit && doc.againstId ? (
                  <>
                    {' · '}
                    <Link href={`/backend/accounts/invoices/${doc.againstId}`} className="font-mono text-primary hover:underline">
                      {doc.againstCode}
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
              <WhatsAppMenu phone={phone} recipient={doc.customerName} messages={[{ key: 'inv', label: credit ? t('cc_accounts.inv.waCredit', 'Send the credit note details') : t('cc_accounts.inv.wa', 'Send the invoice details'), hint: `${doc.code} · ${rupeeText(doc.totals.payable)}`, text: message }]} size="default" />
              <Button type="button" variant="outline" onClick={() => (printInvoice(doc, company) ? null : flash(t('cc_accounts.inv.popup', 'Allow pop-ups to print'), 'error'))}>
                <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_accounts.inv.print', 'Print / PDF')}
              </Button>
              {draft && canRecord ? (
                <Button type="button" onClick={() => send('/api/cc_accounts/invoices/action', { id, action: 'issue' }, t('cc_accounts.inv.issued', 'Invoice issued; the order Billing stage has the invoice no.'))} disabled={busy}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_accounts.inv.issue', 'Issue invoice')}
                </Button>
              ) : null}
              {canRecord && !credit && doc.status === 'issued' ? (
                <Button type="button" variant="outline" onClick={() => setMode('credit')} disabled={busy}>
                  <FileMinus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_accounts.inv.credit', 'Credit note')}
                </Button>
              ) : null}
              {canRecord && doc.status !== 'cancelled' ? (
                <Button type="button" variant="destructive-ghost" onClick={() => setMode('cancel')} disabled={busy}>
                  <Ban className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_accounts.inv.cancel', 'Cancel')}
                </Button>
              ) : null}
            </div>
          </header>
          {!canRecord ? <ViewOnlyNote>{t('cc_accounts.viewOnly', 'View only: making, issuing and cancelling documents is done by Accounts.')}</ViewOnlyNote> : null}

          {doc.status === 'cancelled' ? <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">{t('cc_accounts.inv.cancelledNote', 'Cancelled: {reason}', { reason: doc.cancelReason ?? '—' })}</p> : null}
          {mode ? (
            <div className={mode === 'cancel' ? 'space-y-3 rounded-lg border border-status-error-border bg-status-error-bg p-3' : 'space-y-3 rounded-lg border p-3'}>
              {mode === 'credit' ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{t('cc_accounts.inv.creditWhat', 'Pieces to credit (returned, damaged or over-billed)')}</p>
                  {doc.lines.map((line) => (
                    <div key={line.orderLineId} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        {line.brandName ?? line.title} · {t('cc_accounts.inv.billed', 'billed {qty}', { qty: line.quantity })}
                      </span>
                      <Input
                        aria-label={`${line.title} credit quantity`}
                        type="number"
                        min={0}
                        max={line.quantity}
                        className="h-8 w-28 text-right"
                        value={creditQty[line.orderLineId] ?? ''}
                        onChange={(event) => setCreditQty((prev) => ({ ...prev, [line.orderLineId]: event.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
              <Label htmlFor="inv-reason" className="text-sm">
                {mode === 'cancel' ? t('cc_accounts.inv.cancelWhy', 'Why is it cancelled?') : t('cc_accounts.inv.creditWhy', 'Reason for the credit note')}
              </Label>
              <Textarea id="inv-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setMode(null)}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={mode === 'cancel' ? 'destructive' : 'default'}
                  disabled={busy || !reason.trim()}
                  onClick={async () => {
                    const ok =
                      mode === 'cancel'
                        ? await send('/api/cc_accounts/invoices/action', { id, action: 'cancel', reason }, t('cc_accounts.inv.cancelled', 'Invoice cancelled'))
                        : await send(
                            '/api/cc_accounts/invoices/action',
                            { id, action: 'credit_note', reason, lines: Object.entries(creditQty).map(([orderLineId, value]) => ({ orderLineId, quantity: Number(value || 0) })) },
                            t('cc_accounts.inv.credited', 'Credit note made'),
                            (note) => {
                              router.push(`/backend/accounts/invoices/${note.id}`)
                            },
                          )
                    if (ok) {
                      setMode(null)
                      setReason('')
                    }
                  }}
                >
                  {mode === 'cancel' ? t('cc_accounts.inv.confirmCancel', 'Cancel the invoice') : t('cc_accounts.inv.makeCredit', 'Make credit note')}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="overflow-hidden rounded-lg border bg-card shadow-xs lg:col-span-2">
              <iframe title={doc.code} srcDoc={buildInvoiceHtml(doc, company, false)} className="h-screen w-full bg-background" />
            </div>
            <div className="flex flex-col gap-4">
              <section className="space-y-3 rounded-lg border bg-card p-4 shadow-xs">
                <h2 className="text-sm font-semibold">{t('cc_accounts.inv.details', 'Invoice details')}</h2>
                <div className="grid grid-cols-2 gap-3">
                  {field('invoiceDate', t('cc_accounts.inv.date', 'Invoice date'), { type: 'date', disabled: !draft })}
                  {credit ? null : field('dueDate', t('cc_accounts.inv.due', 'Due date'), { type: 'date' })}
                </div>
                {draft && !credit ? (
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">{t('cc_accounts.inv.qty', 'Pieces on this invoice (partial billing)')}</Label>
                    {doc.lines.map((line) => (
                      <div key={line.orderLineId} className="flex items-center justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate">{line.brandName ?? line.title}</span>
                        <Input aria-label={`${line.title} quantity`} type="number" min={0} className="h-8 w-28 text-right" value={qty[line.orderLineId] ?? ''} onChange={(event) => setQty((prev) => ({ ...prev, [line.orderLineId]: event.target.value }))} />
                      </div>
                    ))}
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  {field('transporter', t('cc_accounts.inv.transporter', 'Transporter'))}
                  {field('vehicleNo', t('cc_accounts.inv.vehicle', 'Vehicle no.'), { upper: true })}
                  {field('lrNo', t('cc_accounts.inv.lr', 'LR / docket no.'))}
                  {field('ewayBillNo', t('cc_accounts.inv.eway', 'E-way bill no.'))}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inv-bank" className="text-xs text-muted-foreground">{t('cc_accounts.inv.bank', 'Bank details')}</Label>
                  <Textarea id="inv-bank" rows={3} value={form.bankDetails ?? ''} disabled={doc.status === 'cancelled' || !canRecord} onChange={(event) => setForm((prev) => ({ ...prev, bankDetails: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inv-terms" className="text-xs text-muted-foreground">{t('cc_accounts.inv.terms', 'Terms')}</Label>
                  <Textarea id="inv-terms" rows={4} value={form.terms ?? ''} disabled={doc.status === 'cancelled' || !canRecord} onChange={(event) => setForm((prev) => ({ ...prev, terms: event.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inv-notes" className="text-xs text-muted-foreground">{t('cc_accounts.inv.notes', 'Note')}</Label>
                  <Textarea id="inv-notes" rows={2} value={form.notes ?? ''} disabled={doc.status === 'cancelled' || !canRecord} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} />
                </div>
                {canRecord && doc.status !== 'cancelled' ? (
                  <div className="flex justify-end">
                    <Button type="button" size="sm" onClick={save} disabled={busy}>
                      <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('cc_accounts.inv.save', 'Save')}
                    </Button>
                  </div>
                ) : null}
              </section>
              <section className="space-y-2 rounded-lg border bg-card p-4 shadow-xs">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  <History className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {t('cc_accounts.inv.history', 'History')}
                </h2>
                <ol className="space-y-2 border-l pl-3 text-xs">
                  {[...doc.history].reverse().map((entry, index) => (
                    <li key={`${entry.at}-${index}`}>
                      <span className="font-medium">{HISTORY[entry.action] ?? entry.action}</span>
                      <span className="text-muted-foreground"> · {entry.by ?? '—'}, {when(entry.at)}</span>
                      {entry.note ? <p className="text-muted-foreground">{entry.note}</p> : null}
                    </li>
                  ))}
                </ol>
              </section>
            </div>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}

export default InvoicePage
