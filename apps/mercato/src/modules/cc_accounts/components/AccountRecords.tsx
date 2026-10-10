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
import { Comments } from '../../cc_ui/components/Comments'
import { Attachments } from '../../cc_ui/components/Attachments'

type HistoryItem = { action: string; by: string | null; at: string; note: string | null }

export function rupees(value: number): string {
  return `₹ ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
}

export function PrintButton() {
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
      <Comments type="payment" id={payment.id} />
      <Timeline type="payment" id={payment.id} refreshKey={payment.history.length} />
    </RecordPage>
  )
}
