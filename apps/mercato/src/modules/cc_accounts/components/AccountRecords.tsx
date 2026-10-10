"use client"

import * as React from 'react'
import Link from 'next/link'
import { Banknote, FileStack, IndianRupee, Printer, Receipt, Waypoints } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { FieldList, LinkRows, Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, formatDay, formatWhen, type Fact } from '../../cc_ui/components/RecordPage'
import { recordHref } from '../../cc_ui/lib/links'
import { Timeline } from '../../cc_ui/components/Timeline'
import { Attachments } from '../../cc_ui/components/Attachments'

type HistoryItem = { action: string; by: string | null; at: string; note: string | null }

function rupees(value: number): string {
  return `₹ ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
}

function PrintButton() {
  const t = useT()
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
      {t('cc_accounts.print', 'Print')}
    </Button>
  )
}

type PaymentView = {
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
  customerId: string | null
  customerName: string | null
  history: HistoryItem[]
  createdAt: string
}

const KIND_LABEL: Record<PaymentView['kind'], string> = { advance: 'Advance', balance: 'Balance', other: 'Other' }

export function PaymentPage({ paymentId }: { paymentId: string }) {
  const t = useT()
  const [payment, setPayment] = React.useState<PaymentView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    void apiCall<PaymentView>(`/api/cc_accounts/payments?id=${encodeURIComponent(paymentId)}`).then((call) => {
      if (!call.ok || !call.result) setError(t('cc_accounts.pay.loadError', 'Could not load this payment.'))
      else setPayment(call.result)
    })
  }, [paymentId, t])
  if (error || !payment) return <RecordState error={error} loadingLabel={t('cc_accounts.loading', 'Loading…')} />
  const kind = t(`cc_accounts.pay.kind.${payment.kind}`, KIND_LABEL[payment.kind])
  const facts: Fact[] = [
    { label: t('cc_accounts.pay.amount', 'Amount'), value: rupees(payment.amount), tone: payment.voided ? 'bad' : 'good' },
    { label: t('cc_accounts.pay.paidOn', 'Paid on'), value: formatDay(payment.paidOn) },
    { label: t('cc_accounts.pay.kindLabel', 'Type'), value: kind },
    { label: t('cc_accounts.pay.mode', 'Mode'), value: payment.mode ?? '—' },
    { label: t('cc_accounts.pay.reference', 'Reference'), value: payment.reference ?? '—' },
    { label: t('cc_accounts.pay.by', 'Entered by'), value: payment.byName ?? '—' },
  ]
  const links = [
    ...(payment.customerId ? [{ key: 'customer', href: recordHref.customer(payment.customerId), primary: payment.customerName ?? '—', secondary: t('cc_accounts.pay.customer', 'Customer') }] : []),
    { key: 'order', href: recordHref.order(payment.orderId), primary: <span className="font-mono">{payment.orderNo}</span>, secondary: t('cc_accounts.pay.order', 'Order') },
    ...(payment.invoiceId ? [{ key: 'invoice', href: recordHref.invoice(payment.invoiceId), primary: <span className="font-mono">{payment.invoiceCode ?? '—'}</span>, secondary: t('cc_accounts.pay.invoice', 'Against invoice') }] : []),
  ]
  return (
    <RecordPage
      back={{ href: '/backend/accounts/payments', label: t('cc_accounts.nav.payments', 'Payments received') }}
      overline={[t('cc_accounts.pay.overline', 'Payment received'), payment.customerName].filter(Boolean).join(' · ')}
      title={rupees(payment.amount)}
      badges={payment.voided ? <StatusBadge variant="error">{t('cc_accounts.pay.voided', 'Voided')}</StatusBadge> : <StatusBadge variant="success">{kind}</StatusBadge>}
      meta={t('cc_accounts.pay.entered', 'Entered {at}', { at: formatWhen(payment.createdAt) })}
      actions={<PrintButton />}
      alert={payment.voided ? <p className="rounded-md border border-status-error-border bg-status-error-bg px-3 py-2 text-sm text-status-error-text">{t('cc_accounts.pay.voidedNote', 'Voided: {reason}', { reason: payment.voidReason ?? '' })}</p> : null}
      facts={facts}
    >
      <RecordColumns
        main={
          <Panel title={t('cc_accounts.pay.details', 'Payment')} icon={IndianRupee}>
            <FieldList
              fields={[
                [t('cc_accounts.pay.kindLabel', 'Type'), kind],
                [t('cc_accounts.pay.mode', 'Mode'), payment.mode],
                [t('cc_accounts.pay.reference', 'Reference'), payment.reference],
                [t('cc_accounts.pay.note', 'Note'), payment.note],
              ]}
            />
            <p className="mt-3 text-xs text-muted-foreground">{t('cc_accounts.pay.editHint', 'To correct or void a payment, use Payments received or the order’s money tab; every change is kept in the history below.')}</p>
          </Panel>
        }
        side={
          <Panel title={t('cc_accounts.pay.links', 'Linked to')} icon={Waypoints} flush>
            <LinkRows empty={null} rows={links} />
          </Panel>
        }
      />
      <Attachments type="payment" id={payment.id} />
      <Timeline type="payment" id={payment.id} refreshKey={payment.history.length} />
    </RecordPage>
  )
}

type BillView = {
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
  balance: number
  status: 'open' | 'partly_paid' | 'paid' | 'cancelled'
  overdueDays: number
  notes: string | null
  payments: Array<{ id: string; amount: number; paidOn: string; mode: string | null; reference: string | null; by: string | null; at: string }>
  history: HistoryItem[]
  createdByName: string | null
}

const BILL_STATUS: Record<BillView['status'], { label: string; variant: StatusBadgeVariant }> = {
  open: { label: 'To pay', variant: 'warning' },
  partly_paid: { label: 'Part paid', variant: 'info' },
  paid: { label: 'Paid', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
}

export function VendorBillPage({ billId }: { billId: string }) {
  const t = useT()
  const [bill, setBill] = React.useState<BillView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    void apiCall<BillView>(`/api/cc_accounts/vendor-bills?id=${encodeURIComponent(billId)}`).then((call) => {
      if (!call.ok || !call.result) setError(t('cc_accounts.bills.loadError', 'Could not load this bill.'))
      else setBill(call.result)
    })
  }, [billId, t])
  if (error || !bill) return <RecordState error={error} loadingLabel={t('cc_accounts.loading', 'Loading…')} />
  const status = BILL_STATUS[bill.status]
  const facts: Fact[] = [
    { label: t('cc_accounts.bills.billDate', 'Bill date'), value: formatDay(bill.billDate) },
    { label: t('cc_accounts.bills.due', 'Due'), value: formatDay(bill.dueDate), tone: bill.overdueDays ? 'bad' : undefined, hint: bill.overdueDays ? t('cc_accounts.bills.overdueDays', '{days} days overdue', { days: bill.overdueDays }) : undefined },
    { label: t('cc_accounts.bills.taxable', 'Taxable'), value: rupees(bill.taxable) },
    { label: 'GST', value: rupees(bill.gst) },
    { label: t('cc_accounts.bills.total', 'Total'), value: rupees(bill.total) },
    { label: t('cc_accounts.bills.balance', 'Still to pay'), value: rupees(bill.balance), tone: bill.balance > 0.5 ? 'warn' : 'good' },
  ]
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
      actions={<PrintButton />}
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
                  { key: 'by', label: t('cc_accounts.pay.by', 'Entered by'), render: (row) => row.by ?? '—' },
                  { key: 'amount', label: t('cc_accounts.pay.amount', 'Amount'), align: 'right', render: (row) => rupees(row.amount), total: rupees(bill.paid) },
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
        }
      />
      <Attachments type="vendor_bill" id={bill.id} />
      <Timeline type="vendor_bill" id={bill.id} refreshKey={bill.history.length} />
    </RecordPage>
  )
}
