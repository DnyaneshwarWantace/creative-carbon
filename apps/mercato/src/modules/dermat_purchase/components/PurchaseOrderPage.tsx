"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Building2, CheckCircle2, CircleSlash, PackageOpen, Pencil, Printer, Send } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { StepIndicator, type StepIndicatorStep } from '@open-mercato/ui/primitives/step-indicator'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { GRN_STATUS, HISTORY_LABEL, PO_STATUS, day, money, qty, when, type PoView } from './shared'
import { printPurchaseOrder } from './printPo'
import { WhatsAppMenu, type WhatsAppMessage } from '../../dermat_products/components/WhatsAppMenu'
import { dateText, rupeeText } from '../../dermat_products/lib/whatsapp'

function steps(po: PoView): StepIndicatorStep[] {
  const order = ['draft', 'pending_approval', 'approved', 'partly_received', 'received']
  const reached = po.status === 'cancelled' ? -1 : order.indexOf(po.status)
  const labels = ['Draft', 'Approval', 'Approved', 'Receiving', 'Received']
  return labels.map((label, index) => ({
    id: order[index],
    label,
    status: po.status === 'cancelled' ? (index === 0 ? 'complete' : index === 1 ? 'error' : 'pending') : index < reached || (index === reached && po.status === 'received') ? 'complete' : index === reached ? 'current' : 'pending',
  }))
}

function vendorMessages(po: PoView): WhatsAppMessage[] {
  const greeting = `Dear ${po.vendorContact ?? po.vendorName},`
  const itemLines = po.lines.map((line, index) => `${index + 1}. ${line.code ? `${line.code} ` : ''}${line.title}: ${qty(line.quantity)} ${line.unit} @ ${rupeeText(line.rate)}`)
  const open = po.lines.filter((line) => line.open > 0)
  const messages: WhatsAppMessage[] = []
  if (po.status === 'approved' || po.status === 'partly_received') {
    messages.push({
      key: 'send',
      label: 'Send the purchase order',
      hint: `${po.code} · ${po.lines.length} items · ${rupeeText(po.total)}`,
      text: [
        greeting,
        '',
        `Please supply the following against our PO ${po.code} dated ${dateText(po.poDate)}:`,
        ...itemLines,
        '',
        `Total with GST: ${rupeeText(po.total)}`,
        po.expectedDate ? `Needed by: ${dateText(po.expectedDate)}` : null,
        po.terms ? `Terms: ${po.terms}` : null,
        '',
        'Please send the COA and invoice with the material and mention the PO number on the invoice.',
        '',
        'Thank you,',
        'Dermat India – Purchase',
      ]
        .filter((line): line is string => line !== null)
        .join('\n'),
    })
  }
  if (open.length && (po.status === 'approved' || po.status === 'partly_received')) {
    messages.push({
      key: 'follow',
      label: 'Ask when the pending material will come',
      hint: `${open.length} items still to come`,
      text: [
        greeting,
        '',
        `Against PO ${po.code}, the following is still pending:`,
        ...open.map((line) => `• ${line.title}: ${qty(line.open)} ${line.unit}`),
        '',
        'Please confirm the dispatch date.',
        '',
        'Thank you,',
        'Dermat India – Purchase',
      ].join('\n'),
    })
  }
  if (po.status === 'draft' || po.status === 'pending_approval') {
    messages.push({
      key: 'rates',
      label: 'Confirm rates and availability',
      hint: `${po.lines.length} items before we place the order`,
      text: [greeting, '', 'Please confirm the rate and stock for:', ...itemLines, '', 'Thank you,', 'Dermat India – Purchase'].join('\n'),
    })
  }
  return messages
}

export function PurchaseOrderPage({ poId }: { poId: string }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: `dermat-po-${poId}` })
  const [po, setPo] = React.useState<PoView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [dialog, setDialog] = React.useState<'approve' | 'cancel' | null>(null)
  const [note, setNote] = React.useState('')

  const load = React.useCallback(async () => {
    const call = await apiCall<PoView>(`/api/dermat_purchase/orders?id=${encodeURIComponent(poId)}`)
    if (!call.ok || !call.result) {
      setError(t('dermat_purchase.detail.loadError', 'Could not load this purchase order.'))
      return
    }
    setPo(call.result)
  }, [poId, t])

  React.useEffect(() => {
    load()
  }, [load])

  const act = async (path: string, body: Record<string, unknown>, done: string) => {
    if (!po) return false
    setBusy(true)
    try {
      const call = await runMutation({
        context: { poId: po.id, path },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(po.updatedAt), () =>
            apiCall<PoView & { error?: string }>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: po.id, ...body }) }),
          ),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.status === 409 && (!call.result?.error || call.result?.error === 'record_modified') ? t('dermat_purchase.detail.conflict', 'Someone else changed this PO. It has been reloaded.') : call.result?.error ?? t('dermat_purchase.detail.error', 'That did not work.'), 'error')
        await load()
        return false
      }
      setPo(call.result)
      flash(done, 'success')
      return true
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={error} />
        </PageBody>
      </Page>
    )
  }
  if (!po) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dermat_purchase.detail.loading', 'Loading purchase order…')} />
        </PageBody>
      </Page>
    )
  }

  const editable = po.status === 'draft' || po.status === 'pending_approval'
  const receivable = po.status === 'approved' || po.status === 'partly_received'
  const nothingReceived = po.lines.every((line) => line.received <= 0)
  const ordered = po.lines.reduce((sum, line) => sum + line.quantity, 0)
  const received = po.lines.reduce((sum, line) => sum + Math.min(line.received, line.quantity), 0)
  const banner =
    po.status === 'pending_approval'
      ? { status: 'warning' as const, title: t('dermat_purchase.banner.pending', 'Waiting for approval'), body: t('dermat_purchase.banner.pendingBody', 'Check the rates and quantities. Goods can be received only after approval.') }
      : po.status === 'approved' || po.status === 'partly_received'
        ? { status: 'information' as const, title: t('dermat_purchase.banner.open', 'Open with the vendor'), body: t('dermat_purchase.banner.openBody', 'When the material arrives, press "Receive goods". It goes into the store as "under QC test" until QC approves each batch.') }
        : po.status === 'draft'
          ? { status: 'information' as const, title: t('dermat_purchase.banner.draft', 'Draft'), body: t('dermat_purchase.banner.draftBody', 'Send it for approval when the rates are final.') }
          : null

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-16">
          <div className="space-y-4">
            <Link href="/backend/purchase/orders" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              {t('dermat_purchase.list.title', 'Purchase orders')}
            </Link>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-mono text-2xl font-bold tracking-tight">{po.code}</h1>
                  <StatusBadge variant={PO_STATUS[po.status].variant} dot>
                    {PO_STATUS[po.status].label}
                  </StatusBadge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {po.vendorName} · {day(po.poDate)}
                  {po.expectedDate ? ` · ${t('dermat_purchase.detail.due', 'due {date}', { date: day(po.expectedDate) })}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <WhatsAppMenu phone={po.vendorPhone} recipient={po.vendorContact ? `${po.vendorContact} (${po.vendorName})` : po.vendorName} messages={vendorMessages(po)} />
                <Button type="button" variant="ghost" onClick={() => printPurchaseOrder(po)}>
                  <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('dermat_purchase.detail.print', 'Print PO')}
                </Button>
                {nothingReceived && po.status !== 'cancelled' ? (
                  <Button type="button" variant="ghost" onClick={() => setDialog('cancel')} disabled={busy}>
                    <CircleSlash className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('dermat_purchase.detail.cancel', 'Cancel')}
                  </Button>
                ) : null}
                {editable ? (
                  <Link href={`/backend/purchase/orders/${po.id}/edit`}>
                    <Button type="button" variant="outline">
                      <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('dermat_purchase.detail.edit', 'Edit')}
                    </Button>
                  </Link>
                ) : null}
                {po.status === 'draft' ? (
                  <Button type="button" onClick={() => act('/api/dermat_purchase/orders/submit', {}, t('dermat_purchase.detail.submitted', 'Sent for approval.'))} disabled={busy}>
                    <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('dermat_purchase.detail.submit', 'Send for approval')}
                  </Button>
                ) : null}
                {po.status === 'pending_approval' ? (
                  <Button type="button" onClick={() => setDialog('approve')} disabled={busy}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('dermat_purchase.detail.approve', 'Approve')}
                  </Button>
                ) : null}
                {receivable ? (
                  <Link href={`/backend/purchase/grns/new?poId=${po.id}`}>
                    <Button type="button">
                      <PackageOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('dermat_purchase.detail.receive', 'Receive goods')}
                    </Button>
                  </Link>
                ) : null}
              </div>
            </div>
          </div>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <StepIndicator steps={steps(po)} className="overflow-x-auto" />
          </section>

          {banner ? (
            <Alert status={banner.status} style="lighter" className="rounded-lg">
              <AlertTitle>{banner.title}</AlertTitle>
              <AlertDescription>{banner.body}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-6 lg:col-span-2">
              <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
                  <h2 className="text-sm font-semibold">{t('dermat_purchase.detail.materials', 'Materials')}</h2>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {t('dermat_purchase.detail.receivedOf', '{received} of {ordered} received', { received: qty(received), ordered: qty(ordered) })}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-left text-overline font-semibold uppercase tracking-widest text-muted-foreground">
                      <tr>
                        <th className="px-5 py-2.5">{t('dermat_purchase.form.material', 'Material')}</th>
                        <th className="px-3 py-2.5 text-right">{t('dermat_purchase.form.qty', 'Quantity')}</th>
                        <th className="px-3 py-2.5 text-right">{t('dermat_purchase.form.rate', 'Rate (₹)')}</th>
                        <th className="px-3 py-2.5 text-right">GST</th>
                        <th className="px-3 py-2.5 text-right">{t('dermat_purchase.form.amount', 'Amount')}</th>
                        <th className="w-40 px-5 py-2.5">{t('dermat_purchase.detail.receivedCol', 'Received')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {po.lines.map((line) => {
                        const percent = line.quantity > 0 ? Math.min(100, Math.round((line.received / line.quantity) * 100)) : 0
                        return (
                          <tr key={line.id}>
                            <td className="px-5 py-3">
                              <Link href={`/backend/products/${line.productId}`} className="font-medium hover:underline">
                                {line.title}
                              </Link>
                              <p className="font-mono text-xs text-muted-foreground">{line.code ?? '—'}</p>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">{qty(line.quantity, line.unit)}</td>
                            <td className="px-3 py-3 text-right tabular-nums">{money(line.rate)}</td>
                            <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{line.gstPercent}%</td>
                            <td className="px-3 py-3 text-right tabular-nums">{money(line.amount)}</td>
                            <td className="px-5 py-3">
                              <div className="flex justify-between text-xs tabular-nums">
                                <span>{qty(line.received)}</span>
                                {line.open > 0 ? <span className="text-status-warning-text">{qty(line.open)} {t('dermat_purchase.detail.toCome', 'to come')}</span> : <span className="text-status-success-text">{t('dermat_purchase.detail.done', 'done')}</span>}
                              </div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-input">
                                <div className={cn('h-full rounded-full', percent >= 100 ? 'bg-status-success-icon' : 'bg-accent-indigo')} style={{ width: `${percent}%` }} />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                <dl className="ml-auto w-full max-w-xs space-y-1.5 border-t border-border px-5 py-4 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t('dermat_purchase.form.subtotal', 'Before GST')}</dt>
                    <dd className="tabular-nums">{money(po.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">GST</dt>
                    <dd className="tabular-nums">{money(po.gst)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5 text-base font-semibold">
                    <dt>{t('dermat_purchase.form.total', 'Total')}</dt>
                    <dd className="tabular-nums">{money(po.total)}</dd>
                  </div>
                </dl>
              </section>

              <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="border-b border-border px-5 py-4">
                  <h2 className="text-sm font-semibold">{t('dermat_purchase.detail.grns', 'Goods received (GRN)')}</h2>
                </div>
                {po.grns.length ? (
                  <ul className="divide-y divide-border">
                    {po.grns.map((grn) => (
                      <li key={grn.id}>
                        <Link href={`/backend/purchase/grns/${grn.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                          <span>
                            <span className="block font-mono text-sm font-semibold">{grn.code}</span>
                            <span className="block text-xs text-muted-foreground">
                              {day(grn.grnDate)}
                              {grn.invoiceNo ? ` · invoice ${grn.invoiceNo}` : ''}
                            </span>
                          </span>
                          <StatusBadge variant={GRN_STATUS[grn.status].variant}>{GRN_STATUS[grn.status].label}</StatusBadge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-5 py-6 text-sm text-muted-foreground">{t('dermat_purchase.detail.noGrn', 'Nothing received yet.')}</p>
                )}
              </section>
            </div>

            <aside className="flex flex-col gap-6">
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">{po.vendorName}</p>
                    <p className="font-mono text-xs text-muted-foreground">GSTIN {po.vendorGstin ?? '—'}</p>
                  </div>
                </div>
                <dl className="mt-4 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">{t('dermat_purchase.detail.raisedBy', 'Raised by')}</dt>
                  <dd className="text-right">{po.createdByName ?? '—'}</dd>
                  <dt className="text-muted-foreground">{t('dermat_purchase.detail.approvedBy', 'Approved by')}</dt>
                  <dd className="text-right">{po.approvedByName ? `${po.approvedByName} · ${when(po.approvedAt)}` : '—'}</dd>
                  <dt className="text-muted-foreground">{t('dermat_purchase.form.terms', 'Payment terms')}</dt>
                  <dd className="text-right">{po.terms ?? '—'}</dd>
                </dl>
                {po.orderRefs.length ? (
                  <div className="mt-4 border-t border-border pt-3">
                    <p className="text-xs text-muted-foreground">{t('dermat_purchase.form.forOrders', 'For customer orders')}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {po.orderRefs.map((ref) => (
                        <Link key={ref.orderId} href={`/backend/orders/${ref.orderId}`} className="rounded-md border border-border bg-muted/40 px-2 py-0.5 font-mono text-xs hover:bg-muted">
                          {ref.orderNo}
                        </Link>
                      ))}
                    </div>
                  </div>
                ) : null}
                {po.notes ? <p className="mt-4 rounded-md bg-muted/50 p-3 text-sm">{po.notes}</p> : null}
              </section>

              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-semibold">{t('dermat_purchase.detail.history', 'History')}</h2>
                <ol className="relative mt-4 space-y-4 border-l border-border pl-5">
                  {po.history
                    .slice()
                    .reverse()
                    .map((entry, index) => (
                      <li key={`${entry.at}-${index}`} className="relative">
                        <span
                          className={cn('absolute -left-6 top-1 h-2.5 w-2.5 rounded-full ring-4 ring-card', entry.action === 'cancelled' || entry.action === 'returned' ? 'bg-status-error-icon' : entry.action === 'approved' ? 'bg-status-success-icon' : 'bg-accent-indigo')}
                          aria-hidden="true"
                        />
                        <p className="text-sm font-medium">{HISTORY_LABEL[entry.action] ?? entry.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.by ?? '—'} · {when(entry.at)}
                        </p>
                        {entry.note ? <p className="mt-0.5 text-xs">{entry.note}</p> : null}
                      </li>
                    ))}
                </ol>
              </section>
            </aside>
          </div>
        </div>

        <Dialog open={dialog !== null} onOpenChange={(value) => (!value ? setDialog(null) : undefined)}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                document.getElementById('po-dialog-submit')?.click()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{dialog === 'approve' ? t('dermat_purchase.detail.approveTitle', 'Approve {code}', { code: po.code }) : t('dermat_purchase.detail.cancelTitle', 'Cancel {code}', { code: po.code })}</DialogTitle>
              <DialogDescription>
                {dialog === 'approve'
                  ? t('dermat_purchase.detail.approveHint', '{vendor} · {total}. After approval the store can receive goods against it.', { vendor: po.vendorName, total: money(po.total) })
                  : t('dermat_purchase.detail.cancelHint', 'Only possible while nothing has been received.')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="po-dialog-note">{dialog === 'approve' ? t('dermat_purchase.detail.approveNote', 'Note (optional)') : t('dermat_purchase.detail.reason', 'Reason *')}</Label>
              <Textarea id="po-dialog-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                id="po-dialog-submit"
                type="button"
                variant={dialog === 'cancel' ? 'destructive-solid' : 'default'}
                disabled={busy || (dialog === 'cancel' && !note.trim())}
                onClick={async () => {
                  const ok =
                    dialog === 'approve'
                      ? await act('/api/dermat_purchase/orders/approve', { note: note.trim() || null }, t('dermat_purchase.detail.approved', 'Approved.'))
                      : await act('/api/dermat_purchase/orders/cancel', { note: note.trim() }, t('dermat_purchase.detail.cancelled', 'PO cancelled.'))
                  if (ok) {
                    setDialog(null)
                    setNote('')
                  }
                }}
              >
                {dialog === 'approve' ? t('dermat_purchase.detail.approve', 'Approve') : t('dermat_purchase.detail.cancelConfirm', 'Cancel PO')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}

export default PurchaseOrderPage
