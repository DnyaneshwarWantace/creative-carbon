"use client"

import * as React from 'react'
import Link from 'next/link'
import { Boxes, Building2, CheckCircle2, CircleSlash, FileStack, PackageOpen, Pencil, Printer, Send } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
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
import { GRN_STATUS, HISTORY_LABEL, PO_STATUS, day, money, qty, when, type PoView } from './shared'
import { printPurchaseOrder } from './printPo'
import { WhatsAppMenu, type WhatsAppMessage } from '../../cc_products/components/WhatsAppMenu'
import { dateText, rupeeText } from '../../cc_products/lib/whatsapp'
import { EmailPoButton } from './EmailPoDialog'
import { useGranted } from '../../cc_departments/components/useGranted'
import { FieldList, LinkRows, Panel, RecordColumns, RecordPage, RecordState, type Fact } from '../../cc_ui/components/RecordPage'
import { recordHref } from '../../cc_ui/lib/links'
import { Timeline } from '../../cc_ui/components/Timeline'
import { Comments } from '../../cc_ui/components/Comments'
import { Attachments } from '../../cc_ui/components/Attachments'

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
        'Creative Carbon Composites – Purchase',
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
        'Creative Carbon Composites – Purchase',
      ].join('\n'),
    })
  }
  if (po.status === 'draft' || po.status === 'pending_approval') {
    messages.push({
      key: 'rates',
      label: 'Confirm rates and availability',
      hint: `${po.lines.length} items before we place the order`,
      text: [greeting, '', 'Please confirm the rate and stock for:', ...itemLines, '', 'Thank you,', 'Creative Carbon Composites – Purchase'].join('\n'),
    })
  }
  return messages
}

export function PurchaseOrderPage({ poId }: { poId: string }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: `cc-po-${poId}` })
  const [po, setPo] = React.useState<PoView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const granted = useGranted()
  const [dialog, setDialog] = React.useState<'approve' | 'cancel' | null>(null)
  const [note, setNote] = React.useState('')

  const load = React.useCallback(async () => {
    const call = await apiCall<PoView>(`/api/cc_purchase/orders?id=${encodeURIComponent(poId)}`)
    if (!call.ok || !call.result) {
      setError(t('cc_purchase.detail.loadError', 'Could not load this purchase order.'))
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
        flash(call.status === 409 && (!call.result?.error || call.result?.error === 'record_modified') ? t('cc_purchase.detail.conflict', 'Someone else changed this PO. It has been reloaded.') : call.result?.error ?? t('cc_purchase.detail.error', 'That did not work.'), 'error')
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

  if (error || !po) return <RecordState error={error} loadingLabel={t('cc_purchase.detail.loading', 'Loading purchase order…')} />

  const editable = po.status === 'draft' || po.status === 'pending_approval'
  const receivable = po.status === 'approved' || po.status === 'partly_received'
  const nothingReceived = po.lines.every((line) => line.received <= 0)
  const ordered = po.lines.reduce((sum, line) => sum + line.quantity, 0)
  const received = po.lines.reduce((sum, line) => sum + Math.min(line.received, line.quantity), 0)
  const banner =
    po.status === 'pending_approval'
      ? { status: 'warning' as const, title: t('cc_purchase.banner.pending', 'Waiting for approval'), body: t('cc_purchase.banner.pendingBody', 'Check the rates and quantities. Goods can be received only after approval.') }
      : po.status === 'approved' || po.status === 'partly_received'
        ? { status: 'information' as const, title: t('cc_purchase.banner.open', 'Open with the vendor'), body: t('cc_purchase.banner.openBody', 'When the material arrives, press "Receive goods". It goes into the store as "under QC test" until QC approves each batch.') }
        : po.status === 'draft'
          ? { status: 'information' as const, title: t('cc_purchase.banner.draft', 'Draft'), body: t('cc_purchase.banner.draftBody', 'Send it for approval when the rates are final.') }
          : null

  const late = po.expectedDate && receivable && po.expectedDate < new Date().toISOString().slice(0, 10)
  const facts: Fact[] = [
    { label: t('cc_purchase.detail.poDate', 'PO date'), value: day(po.poDate) },
    { label: t('cc_purchase.detail.expected', 'Expected'), value: day(po.expectedDate), tone: late ? 'bad' : undefined, hint: late ? t('cc_purchase.detail.lateShort', 'late') : undefined },
    { label: t('cc_purchase.detail.lines', 'Materials'), value: String(po.lines.length) },
    { label: t('cc_purchase.detail.receivedPct', 'Received'), value: ordered ? `${Math.min(100, Math.round((received / ordered) * 100))}%` : '—', tone: ordered && received >= ordered ? 'good' : undefined },
    { label: t('cc_purchase.detail.grnCount', 'GRNs'), value: String(po.grns.length) },
    { label: t('cc_purchase.form.total', 'Total'), value: money(po.total) },
  ]

  return (
    <>
      <RecordPage
        back={{ href: '/backend/purchase/orders', label: t('cc_purchase.list.title', 'Purchase orders') }}
        overline={t('cc_purchase.detail.overline', 'Purchase order')}
        title={po.code}
        badges={
          <StatusBadge variant={PO_STATUS[po.status].variant} dot>
            {PO_STATUS[po.status].label}
          </StatusBadge>
        }
        meta={
          <>
            <Link className="underline-offset-2 hover:underline" href={recordHref.vendor(po.vendorId)}>
              {po.vendorName}
            </Link>
            {po.expectedDate ? ` · ${t('cc_purchase.detail.due', 'due {date}', { date: day(po.expectedDate) })}` : ''}
          </>
        }
        actions={
          <>
            <WhatsAppMenu phone={po.vendorPhone} recipient={po.vendorContact ? `${po.vendorContact} (${po.vendorName})` : po.vendorName} messages={vendorMessages(po)} />
            {(po.status === 'approved' || po.status === 'partly_received') && granted.has('cc_purchase.manage') ? <EmailPoButton po={po} onSent={() => void load()} /> : null}
            <Button type="button" variant="outline" size="sm" onClick={() => printPurchaseOrder(po)}>
              <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_purchase.detail.print', 'Print PO')}
            </Button>
            {nothingReceived && po.status !== 'cancelled' ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setDialog('cancel')} disabled={busy}>
                <CircleSlash className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_purchase.detail.cancel', 'Cancel')}
              </Button>
            ) : null}
            {editable ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/backend/purchase/orders/${po.id}/edit`}>
                  <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_purchase.detail.edit', 'Edit')}
                </Link>
              </Button>
            ) : null}
            {po.status === 'draft' ? (
              <Button type="button" size="sm" onClick={() => act('/api/cc_purchase/orders/submit', {}, t('cc_purchase.detail.submitted', 'Sent for approval.'))} disabled={busy}>
                <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_purchase.detail.submit', 'Send for approval')}
              </Button>
            ) : null}
            {po.status === 'pending_approval' ? (
              <Button type="button" size="sm" onClick={() => setDialog('approve')} disabled={busy}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_purchase.detail.approve', 'Approve')}
              </Button>
            ) : null}
            {receivable ? (
              <Button asChild size="sm">
                <Link href={`/backend/purchase/grns/new?poId=${po.id}`}>
                  <PackageOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_purchase.detail.receive', 'Receive goods')}
                </Link>
              </Button>
            ) : null}
          </>
        }
        alert={
          banner ? (
            <Alert status={banner.status} style="lighter" className="rounded-md">
              <AlertTitle>{banner.title}</AlertTitle>
              <AlertDescription>{banner.body}</AlertDescription>
            </Alert>
          ) : null
        }
        chain={
          <section className="rounded-md border border-border bg-card p-3 shadow-sm print:hidden">
            <StepIndicator steps={steps(po)} className="overflow-x-auto" />
          </section>
        }
        facts={facts}
      >
        <RecordColumns
          main={
            <>
              <Panel
                title={t('cc_purchase.detail.materials', 'Materials')}
                icon={Boxes}
                count={po.lines.length}
                flush
                action={<span className="font-mono tabular-nums text-muted-foreground">{t('cc_purchase.detail.receivedOf', '{received} of {ordered} received', { received: qty(received), ordered: qty(ordered) })}</span>}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted text-left font-mono text-overline font-semibold uppercase tracking-widest text-muted-foreground">
                      <tr>
                        <th className="border-b-2 border-foreground/70 px-3 py-2">{t('cc_purchase.form.material', 'Material')}</th>
                        <th className="border-b-2 border-foreground/70 px-3 py-2 text-right">{t('cc_purchase.form.qty', 'Quantity')}</th>
                        <th className="border-b-2 border-foreground/70 px-3 py-2 text-right">{t('cc_purchase.form.rate', 'Rate (₹)')}</th>
                        <th className="border-b-2 border-foreground/70 px-3 py-2 text-right">GST</th>
                        <th className="border-b-2 border-foreground/70 px-3 py-2 text-right">{t('cc_purchase.form.amount', 'Amount')}</th>
                        <th className="w-40 border-b-2 border-foreground/70 px-3 py-2">{t('cc_purchase.detail.receivedCol', 'Received')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {po.lines.map((line) => {
                        const percent = line.quantity > 0 ? Math.min(100, Math.round((line.received / line.quantity) * 100)) : 0
                        return (
                          <tr key={line.id} className="even:bg-muted/30">
                            <td className="px-3 py-2.5">
                              <Link href={recordHref.product(line.productId)} className="font-medium hover:underline">
                                {line.title}
                              </Link>
                              <p className="font-mono text-xs text-muted-foreground">{line.code ?? '—'}</p>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums">{qty(line.quantity, line.unit)}</td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums">{money(line.rate)}</td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums text-muted-foreground">{line.gstPercent}%</td>
                            <td className="px-3 py-2.5 text-right font-mono tabular-nums">{money(line.amount)}</td>
                            <td className="px-3 py-2.5">
                              <div className="flex justify-between font-mono text-xs tabular-nums">
                                <span>{qty(line.received)}</span>
                                {line.open > 0 ? <span className="text-status-warning-text">{qty(line.open)} {t('cc_purchase.detail.toCome', 'to come')}</span> : <span className="text-status-success-text">{t('cc_purchase.detail.done', 'done')}</span>}
                              </div>
                              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-input">
                                <div className={cn('h-full rounded-full', percent >= 100 ? 'bg-status-success-icon' : 'bg-accent-indigo')} style={{ width: `${percent}%` }} />
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot className="border-t-4 border-double border-foreground/70 bg-muted font-mono text-sm">
                      <tr>
                        <td className="px-3 py-1.5 text-muted-foreground" colSpan={4}>
                          {t('cc_purchase.form.subtotal', 'Before GST')}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{money(po.subtotal)}</td>
                        <td />
                      </tr>
                      <tr>
                        <td className="px-3 py-1.5 text-muted-foreground" colSpan={4}>
                          GST
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{money(po.gst)}</td>
                        <td />
                      </tr>
                      <tr className="font-semibold">
                        <td className="px-3 py-1.5" colSpan={4}>
                          Σ {t('cc_purchase.form.total', 'Total')}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{money(po.total)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Panel>

              <Panel title={t('cc_purchase.detail.grns', 'Goods received (GRN)')} icon={FileStack} count={po.grns.length} flush>
                <LinkRows
                  empty={t('cc_purchase.detail.noGrn', 'Nothing received yet.')}
                  rows={po.grns.map((grn) => ({
                    key: grn.id,
                    href: recordHref.grn(grn.id),
                    primary: <span className="font-mono">{grn.code}</span>,
                    secondary: [day(grn.grnDate), grn.invoiceNo ? t('cc_purchase.detail.invoiceNo', 'invoice {no}', { no: grn.invoiceNo }) : null].filter(Boolean).join(' · '),
                    badge: <StatusBadge variant={GRN_STATUS[grn.status].variant}>{GRN_STATUS[grn.status].label}</StatusBadge>,
                  }))}
                />
              </Panel>
            </>
          }
          side={
            <>
              <Panel title={t('cc_purchase.detail.vendor', 'Vendor')} icon={Building2}>
                <Link className="font-semibold hover:underline" href={recordHref.vendor(po.vendorId)}>
                  {po.vendorName}
                </Link>
                <p className="mb-2 font-mono text-xs text-muted-foreground">GSTIN {po.vendorGstin ?? '—'}</p>
                <FieldList
                  columns={1}
                  fields={[
                    [t('cc_purchase.detail.raisedBy', 'Raised by'), po.createdByName],
                    [t('cc_purchase.detail.approvedBy', 'Approved by'), po.approvedByName ? `${po.approvedByName} · ${when(po.approvedAt)}` : null],
                    [t('cc_purchase.form.terms', 'Payment terms'), po.terms],
                  ]}
                />
                {po.notes ? <p className="mt-3 rounded-md bg-muted/50 p-3 text-sm">{po.notes}</p> : null}
              </Panel>
              {po.orderRefs.length ? (
                <Panel title={t('cc_purchase.form.forOrders', 'For customer orders')} icon={FileStack} count={po.orderRefs.length} flush>
                  <LinkRows empty={null} rows={po.orderRefs.map((ref) => ({ key: ref.orderId, href: recordHref.order(ref.orderId), primary: <span className="font-mono">{ref.orderNo}</span> }))} />
                </Panel>
              ) : null}
            </>
          }
        />
        <Attachments type="po" id={po.id} />
        <Comments type="po" id={po.id} />
        <Timeline type="po" id={po.id} refreshKey={po.history.length} />
      </RecordPage>

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
              <DialogTitle>{dialog === 'approve' ? t('cc_purchase.detail.approveTitle', 'Approve {code}', { code: po.code }) : t('cc_purchase.detail.cancelTitle', 'Cancel {code}', { code: po.code })}</DialogTitle>
              <DialogDescription>
                {dialog === 'approve'
                  ? t('cc_purchase.detail.approveHint', '{vendor} · {total}. After approval the store can receive goods against it.', { vendor: po.vendorName, total: money(po.total) })
                  : t('cc_purchase.detail.cancelHint', 'Only possible while nothing has been received.')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="po-dialog-note">{dialog === 'approve' ? t('cc_purchase.detail.approveNote', 'Note (optional)') : t('cc_purchase.detail.reason', 'Reason *')}</Label>
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
                      ? await act('/api/cc_purchase/orders/approve', { note: note.trim() || null }, t('cc_purchase.detail.approved', 'Approved.'))
                      : await act('/api/cc_purchase/orders/cancel', { note: note.trim() }, t('cc_purchase.detail.cancelled', 'PO cancelled.'))
                  if (ok) {
                    setDialog(null)
                    setNote('')
                  }
                }}
              >
                {dialog === 'approve' ? t('cc_purchase.detail.approve', 'Approve') : t('cc_purchase.detail.cancelConfirm', 'Cancel PO')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </>
  )
}

export default PurchaseOrderPage
