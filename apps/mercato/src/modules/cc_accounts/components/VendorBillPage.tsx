"use client"

import * as React from 'react'
import Link from 'next/link'
import { Ban, Banknote, FileMinus, FileStack, Receipt } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../cc_departments/components/useGranted'
import { LinkRows, Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, formatDay, type Fact } from '../../cc_ui/components/RecordPage'
import { recordHref } from '../../cc_ui/lib/links'
import { Timeline } from '../../cc_ui/components/Timeline'
import { Comments } from '../../cc_ui/components/Comments'
import { Attachments } from '../../cc_ui/components/Attachments'
import { CorrectDialog, MIN_REASON } from '../../cc_ui/components/CorrectDialog'
import { PrintButton, rupees } from './AccountRecords'

type HistoryItem = { action: string; by: string | null; at: string; note: string | null }
type BillPayment = { id: string; amount: number; paidOn: string; mode: string | null; reference: string | null; by: string | null; at: string; voidedAt?: string | null; voidReason?: string | null; voidedBy?: string | null }
type DebitNoteRow = { id: string; code: string; noteDate: string; reason: string; total: number; status: 'issued' | 'cancelled' }

export type BillView = {
  id: string
  code: string
  vendorId: string
  vendorName: string
  billNo: string
  billDate: string
  dueDate: string | null
  poId: string | null
  poCode: string | null
  grnIds: string[]
  grnCodes: string[]
  taxable: number
  gst: number
  total: number
  paid: number
  debited: number
  balance: number
  status: 'open' | 'partly_paid' | 'paid' | 'cancelled'
  overdueDays: number
  notes: string | null
  payments: BillPayment[]
  debitNotes?: DebitNoteRow[]
  history: HistoryItem[]
  createdByName: string | null
  updatedAt: string
}

const BILL_STATUS: Record<BillView['status'], { label: string; variant: StatusBadgeVariant }> = {
  open: { label: 'To pay', variant: 'warning' },
  partly_paid: { label: 'Part paid', variant: 'info' },
  paid: { label: 'Settled', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
}

export function VendorBillPage({ billId }: { billId: string }) {
  const t = useT()
  const granted = useGranted()
  const canRecord = !granted.ready || granted.has('cc_accounts.record')
  const { runMutation } = useGuardedMutation({ contextId: `cc-bill-${billId}` })
  const [bill, setBill] = React.useState<BillView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [voiding, setVoiding] = React.useState<BillPayment | null>(null)
  const [debitOpen, setDebitOpen] = React.useState(false)
  const [debit, setDebit] = React.useState({ taxable: '', gst: '', reason: '' })
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<BillView>(`/api/cc_accounts/vendor-bills?id=${encodeURIComponent(billId)}`)
    if (!call.ok || !call.result) setError(t('cc_accounts.bills.loadError', 'Could not load this bill.'))
    else setBill(call.result)
  }, [billId, t])

  React.useEffect(() => {
    void load()
  }, [load])

  if (error || !bill) return <RecordState error={error} loadingLabel={t('cc_accounts.loading', 'Loading…')} />

  const act = async (body: Record<string, unknown>, success: string): Promise<boolean> => {
    setBusy(true)
    try {
      const call = await runMutation({
        context: { billId: bill.id, action: body.action },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(bill.updatedAt), () =>
            apiCall<BillView & { error?: string }>('/api/cc_accounts/vendor-bills/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: bill.id, ...body }) }),
          ),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_accounts.bills.actError', 'Could not save.'), 'error')
        if (call.status === 409) await load()
        return false
      }
      await load()
      flash(success, 'success')
      return true
    } finally {
      setBusy(false)
    }
  }

  const status = BILL_STATUS[bill.status]
  const facts: Fact[] = [
    { label: t('cc_accounts.bills.billDate', 'Bill date'), value: formatDay(bill.billDate) },
    { label: t('cc_accounts.bills.due', 'Due'), value: formatDay(bill.dueDate), tone: bill.overdueDays ? 'bad' : undefined, hint: bill.overdueDays ? t('cc_accounts.bills.overdueDays', '{days} days overdue', { days: bill.overdueDays }) : undefined },
    { label: t('cc_accounts.bills.taxable', 'Taxable'), value: rupees(bill.taxable) },
    { label: 'GST', value: rupees(bill.gst) },
    { label: t('cc_accounts.bills.total', 'Total'), value: rupees(bill.total), hint: bill.debited ? t('cc_accounts.bills.debitedHint', '{amount} debited', { amount: rupees(bill.debited) }) : undefined },
    { label: t('cc_accounts.bills.balance', 'Still to pay'), value: rupees(bill.balance), tone: bill.balance > 0.5 ? 'warn' : 'good' },
  ]
  const debitTotal = Math.round((Number(debit.taxable || 0) + Number(debit.gst || 0)) * 100) / 100
  const notes = bill.debitNotes ?? []

  return (
    <RecordPage
      back={{ href: '/backend/accounts/vendor-bills', label: t('cc_accounts.nav.vendorBills', 'Vendor bills & payments') }}
      overline={[t('cc_accounts.bills.overline', 'Vendor bill'), bill.code].join(' · ')}
      title={bill.billNo}
      badges={<StatusBadge variant={status.variant} dot>{t(`cc_accounts.bills.status.${bill.status}`, status.label)}</StatusBadge>}
      meta={
        <>
          <Link className="underline-offset-2 hover:underline" href={recordHref.vendor(bill.vendorId)}>
            {bill.vendorName}
          </Link>
          {bill.createdByName ? ` · ${t('cc_accounts.bills.enteredBy', 'entered by {name}', { name: bill.createdByName })}` : ''}
        </>
      }
      actions={
        <>
          <PrintButton />
          {canRecord && bill.status !== 'cancelled' ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setDebitOpen(true)} disabled={busy}>
              <FileMinus className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_accounts.bills.debitNote', 'Debit note')}
            </Button>
          ) : null}
        </>
      }
      facts={facts}
    >
      <RecordColumns
        main={
          <>
            <Panel title={t('cc_accounts.bills.payments', 'Payments made')} icon={Banknote} count={bill.payments.length} flush>
              <RegisterGrid
                rows={bill.payments}
                rowKey={(row) => row.id}
                empty={t('cc_accounts.bills.noPayments', 'Nothing paid on this bill yet.')}
                columns={[
                  { key: 'on', label: t('cc_accounts.pay.paidOn', 'Paid on'), render: (row) => formatDay(row.paidOn) },
                  { key: 'mode', label: t('cc_accounts.pay.mode', 'Mode'), render: (row) => row.mode ?? '—' },
                  { key: 'ref', label: t('cc_accounts.pay.reference', 'Reference'), mono: true, render: (row) => row.reference ?? '—' },
                  { key: 'by', label: t('cc_accounts.pay.by', 'Entered by'), render: (row) => (row.voidedAt ? t('cc_accounts.bills.voidedBy', 'Voided: {reason}', { reason: row.voidReason ?? '' }) : (row.by ?? '—')) },
                  { key: 'amount', label: t('cc_accounts.pay.amount', 'Amount'), align: 'right', render: (row) => (row.voidedAt ? <s className="text-muted-foreground">{rupees(row.amount)}</s> : rupees(row.amount)), total: rupees(bill.paid) },
                  {
                    key: 'void',
                    label: '',
                    render: (row) =>
                      canRecord && !row.voidedAt ? (
                        <Button type="button" variant="ghost" size="sm" onClick={() => setVoiding(row)} disabled={busy} aria-label={t('cc_accounts.bills.voidPayment', 'Void payment')}>
                          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      ) : null,
                  },
                ]}
              />
            </Panel>
            {bill.notes ? (
              <Panel title={t('cc_accounts.bills.notes', 'Notes')} icon={Receipt}>
                <p className="whitespace-pre-wrap text-sm">{bill.notes}</p>
              </Panel>
            ) : null}
          </>
        }
        side={
          <>
            <Panel title={t('cc_accounts.bills.cameFrom', 'Came from')} icon={FileStack} flush>
              <LinkRows
                empty={t('cc_accounts.bills.noSource', 'Entered without a PO or GRN.')}
                rows={[
                  { key: 'vendor', href: recordHref.vendor(bill.vendorId), primary: bill.vendorName, secondary: t('cc_accounts.bills.vendor', 'Vendor') },
                  ...(bill.poId ? [{ key: 'po', href: recordHref.purchaseOrder(bill.poId), primary: <span className="font-mono">{bill.poCode ?? '—'}</span>, secondary: t('cc_accounts.bills.po', 'Purchase order') }] : []),
                  ...bill.grnIds.map((grnId, index) => ({ key: grnId, href: recordHref.grn(grnId), primary: <span className="font-mono">{bill.grnCodes[index] ?? '—'}</span>, secondary: t('cc_accounts.bills.grn', 'Goods received') })),
                ]}
              />
            </Panel>
            <Panel title={t('cc_accounts.bills.debitNotes', 'Debit notes')} icon={FileMinus} count={notes.length} flush>
              <LinkRows
                empty={t('cc_accounts.bills.noDebitNotes', 'No debit notes.')}
                rows={notes.map((note) => ({
                  key: note.id,
                  href: `/backend/accounts/notes/${note.id}`,
                  primary: <span className="font-mono">{note.code}</span>,
                  secondary: [formatDay(note.noteDate), note.reason].join(' · '),
                  value: rupees(note.total),
                  badge: note.status === 'cancelled' ? <StatusBadge variant="neutral">{t('cc_accounts.notes.cancelled', 'Cancelled')}</StatusBadge> : undefined,
                }))}
              />
            </Panel>
          </>
        }
      />
      <Attachments type="vendor_bill" id={bill.id} hint={t('cc_accounts.bills.filesHint', 'Bill scan and anything else for this bill.')} />
      <Comments type="vendor_bill" id={bill.id} />
      <Timeline type="vendor_bill" id={bill.id} refreshKey={bill.updatedAt} />

      <CorrectDialog
        open={Boolean(voiding)}
        onOpenChange={(next) => !next && setVoiding(null)}
        title={t('cc_accounts.bills.voidTitle', 'Void payment of {amount}?', { amount: voiding ? rupees(voiding.amount) : '' })}
        undo={[t('cc_accounts.bills.voidUndo', 'The amount is back as still to pay on this bill'), t('cc_accounts.bills.voidKeep', 'The payment stays listed, struck out, with your reason')]}
        confirmLabel={t('cc_accounts.bills.voidConfirm', 'Void payment')}
        onConfirm={(reason) => (voiding ? act({ action: 'void_payment', paymentId: voiding.id, note: reason }, t('cc_accounts.bills.voided', 'Payment voided')) : Promise.resolve(false))}
      />

      <Dialog open={debitOpen} onOpenChange={(next) => !busy && setDebitOpen(next)}>
        <DialogContent
          className="sm:max-w-md"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              document.getElementById('dn-save')?.click()
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t('cc_accounts.bills.debitTitle', 'Debit note on bill {bill}', { bill: bill.billNo })}</DialogTitle>
            <DialogDescription>{t('cc_accounts.bills.debitHint', 'For short supply, rejection or a rate difference. It reduces what is still to pay and goes to Tally as a debit note.')}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="dn-taxable">{t('cc_accounts.bills.taxable', 'Taxable')}</Label>
              <Input id="dn-taxable" type="number" min={0} step="any" value={debit.taxable} onChange={(event) => setDebit((prev) => ({ ...prev, taxable: event.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dn-gst">GST</Label>
              <Input id="dn-gst" type="number" min={0} step="any" value={debit.gst} onChange={(event) => setDebit((prev) => ({ ...prev, gst: event.target.value }))} />
            </div>
          </div>
          <p className="text-sm">{t('cc_accounts.bills.debitTotal', 'Debit note total: {amount}', { amount: rupees(debitTotal) })}</p>
          <div className="space-y-1">
            <Label htmlFor="dn-reason">{t('cc_ui.correct.reason', 'Why? (kept in the history)')} *</Label>
            <Textarea id="dn-reason" rows={3} value={debit.reason} onChange={(event) => setDebit((prev) => ({ ...prev, reason: event.target.value }))} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setDebitOpen(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              id="dn-save"
              type="button"
              disabled={busy || !(debitTotal > 0) || debit.reason.trim().length < MIN_REASON}
              onClick={async () => {
                if (await act({ action: 'debit_note', taxable: Number(debit.taxable || 0), gst: Number(debit.gst || 0), note: debit.reason.trim() }, t('cc_accounts.bills.debited', 'Debit note made'))) {
                  setDebitOpen(false)
                  setDebit({ taxable: '', gst: '', reason: '' })
                }
              }}
            >
              {t('cc_accounts.bills.debitConfirm', 'Make debit note')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </RecordPage>
  )
}

export default VendorBillPage
