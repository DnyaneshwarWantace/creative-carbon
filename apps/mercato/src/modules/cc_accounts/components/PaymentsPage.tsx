"use client"

import * as React from 'react'
import { useGranted } from '../../cc_departments/components/useGranted'
import { ListSelectItems } from '../../cc_lists/components/ListSelectItems'
import Link from 'next/link'
import { Ban, IndianRupee, Pencil, Plus, Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ExportButton } from '../../cc_products/components/ExportButton'
import { downloadCsv, fetchAllPages } from '../../cc_products/lib/csvExport'
import { rupeeText } from '../../cc_products/lib/whatsapp'
import { PaymentDialog, type PaymentRow } from './PaymentDialog'

const ALL = '__all'
const KIND_LABEL: Record<string, string> = { advance: 'Advance', balance: 'Balance', other: 'Other' }

function day(value: string): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function monthStart(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export function PaymentsPage() {
  const t = useT()
  const granted = useGranted()
  const { runMutation } = useGuardedMutation({ contextId: 'cc-payments-page' })
  const [from, setFrom] = React.useState(monthStart())
  const [to, setTo] = React.useState('')
  const [mode, setMode] = React.useState(ALL)
  const [search, setSearch] = React.useState('')
  const [showVoided, setShowVoided] = React.useState(false)
  const [data, setData] = React.useState<{ items: PaymentRow[]; total: number; amount: number } | null>(null)
  const [reload, setReload] = React.useState(0)
  const [dialog, setDialog] = React.useState<{ payment: PaymentRow | null } | null>(null)
  const [voiding, setVoiding] = React.useState<PaymentRow | null>(null)
  const [reason, setReason] = React.useState('')

  const params = React.useCallback(() => {
    const query = new URLSearchParams({ includeVoided: showVoided ? '1' : '0' })
    if (from) query.set('from', from)
    if (to) query.set('to', to)
    if (mode !== ALL) query.set('mode', mode)
    if (search.trim()) query.set('search', search.trim())
    return query
  }, [from, to, mode, search, showVoided])

  React.useEffect(() => {
    let cancelled = false
    setData(null)
    const handle = window.setTimeout(async () => {
      const query = params()
      query.set('pageSize', '100')
      const call = await apiCall<{ items: PaymentRow[]; total: number; amount: number }>(`/api/cc_accounts/receipts?${query.toString()}`, undefined, { fallback: { items: [], total: 0, amount: 0 } })
      if (!cancelled) setData(call.result ?? { items: [], total: 0, amount: 0 })
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [params, reload])

  const voidPayment = async () => {
    if (!voiding || !reason.trim()) return
    const body = { id: voiding.id, reason: reason.trim() }
    const call = await runMutation({
      context: { paymentId: voiding.id },
      mutationPayload: body,
      operation: () => apiCall<{ error?: string }>('/api/cc_accounts/payments/void', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    })
    if (!call.ok) {
      flash(call.result?.error ?? t('cc_accounts.pay.voidError', 'Could not void the payment.'), 'error')
      return
    }
    flash(t('cc_accounts.pay.voided', 'Payment voided'), 'success')
    setVoiding(null)
    setReason('')
    setReload((value) => value + 1)
  }

  const exportAll = async () => {
    const rows = await fetchAllPages<PaymentRow>(`/api/cc_accounts/receipts?${params().toString()}`)
    downloadCsv('payments-received', [
      { header: 'Date', value: (row) => row.paidOn },
      { header: 'Customer', value: (row) => row.customerName ?? '' },
      { header: 'Order', value: (row) => row.orderNo },
      { header: 'Type', value: (row) => KIND_LABEL[row.kind] ?? row.kind },
      { header: 'Amount (₹)', value: (row) => row.amount },
      { header: 'Mode', value: (row) => row.mode ?? '' },
      { header: 'UTR / cheque', value: (row) => row.reference ?? '' },
      { header: 'Invoice', value: (row) => row.invoiceCode ?? '' },
      { header: 'Recorded by', value: (row) => row.byName ?? '' },
      { header: 'Voided', value: (row) => (row.voided ? `Yes: ${row.voidReason ?? ''}` : '') },
    ], rows)
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-16">
          <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('cc_accounts.eyebrow', 'Accounts')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_accounts.pay.title', 'Payments received')}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">{t('cc_accounts.pay.lede', 'Every receipt against every order. Record one here or on the order; correct a wrong entry with a reason, it stays in the history.')}</p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <ExportButton onExport={exportAll} />
              {granted.has('cc_accounts.record') ? (
              <Button type="button" onClick={() => setDialog({ payment: null })}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_accounts.pay.new', 'Record payment')}
              </Button>
              ) : null}
            </div>
          </header>

          <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-3 shadow-xs">
            <div className="space-y-1">
              <Label htmlFor="pay-from" className="text-xs text-muted-foreground">{t('cc_accounts.pay.from', 'From')}</Label>
              <Input id="pay-from" type="date" className="h-9 w-40" value={from} onChange={(event) => setFrom(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pay-to" className="text-xs text-muted-foreground">{t('cc_accounts.pay.to', 'To')}</Label>
              <Input id="pay-to" type="date" className="h-9 w-40" value={to} onChange={(event) => setTo(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('cc_accounts.pay.mode', 'Mode')}</Label>
              <Select value={mode} onValueChange={setMode}>
                <SelectTrigger className="h-9 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t('cc_accounts.pay.anyMode', 'Any mode')}</SelectItem>
                  <ListSelectItems listKey="payment_modes" current={mode === ALL ? null : mode} />
                </SelectContent>
              </Select>
            </div>
            <div className="relative min-w-60 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input id="pay-search" className="h-9 pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('cc_accounts.pay.search', 'Order no., UTR or invoice no.')} />
            </div>
            <label className="flex h-9 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" className="h-4 w-4 rounded-sm border-input" checked={showVoided} onChange={(event) => setShowVoided(event.target.checked)} />
              {t('cc_accounts.pay.showVoided', 'Show voided')}
            </label>
          </div>

          {data ? (
            <div className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-xs">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-status-success-bg text-status-success-icon">
                <IndianRupee className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="block text-xl font-bold tabular-nums">{rupeeText(data.amount)}</span>
                <span className="text-sm text-muted-foreground">{t('cc_accounts.pay.sum', '{count} payments in this view', { count: data.total })}</span>
              </span>
            </div>
          ) : null}

          {!data ? (
            <div className="flex justify-center py-20">
              <Spinner />
            </div>
          ) : !data.items.length ? (
            <EmptyState className="py-20" icon={<IndianRupee className="h-5 w-5" aria-hidden="true" />} title={t('cc_accounts.pay.empty', 'No payments in this period')} description={t('cc_accounts.pay.emptyHint', 'Change the dates, or record a payment.')} />
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card shadow-xs">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr className="border-b">
                    <th className="px-4 py-2.5 text-left font-semibold">{t('cc_accounts.pay.dateCol', 'Date')}</th>
                    <th className="px-4 py-2.5 text-left font-semibold">{t('cc_accounts.pay.customerCol', 'Customer · order')}</th>
                    <th className="px-4 py-2.5 text-left font-semibold">{t('cc_accounts.pay.kindCol', 'Type')}</th>
                    <th className="px-4 py-2.5 text-right font-semibold">{t('cc_accounts.pay.amountCol', 'Amount')}</th>
                    <th className="px-4 py-2.5 text-left font-semibold">{t('cc_accounts.pay.refCol', 'Mode · reference')}</th>
                    <th className="px-4 py-2.5 text-left font-semibold">{t('cc_accounts.pay.invoiceCol', 'Invoice')}</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.items.map((row) => (
                    <tr key={row.id} className={cn('align-top', row.voided && 'opacity-50')}>
                      <td className="px-4 py-3 text-xs tabular-nums">
                        <Link href={`/backend/accounts/payments/${row.id}`} className="text-primary hover:underline">
                          {day(row.paidOn)}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block font-medium">{row.customerName}</span>
                        <Link href={`/backend/orders/${row.orderId}`} className="font-mono text-xs text-primary hover:underline">
                          {row.orderNo}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs">{KIND_LABEL[row.kind] ?? row.kind}</td>
                      <td className={cn('px-4 py-3 text-right font-semibold tabular-nums', row.voided && 'line-through')}>{rupeeText(row.amount)}</td>
                      <td className="px-4 py-3 text-xs">
                        <span className="block">{row.mode ?? '—'}</span>
                        <span className="block font-mono text-muted-foreground">{row.reference ?? ''}</span>
                        {row.history.length > 1 ? <span className="block text-muted-foreground">{t('cc_accounts.pay.edited', 'Corrected {count}×', { count: row.history.length - 1 })}</span> : null}
                        {row.voided ? <span className="block text-status-error-text">{t('cc_accounts.pay.voidedNote', 'Voided: {reason}', { reason: row.voidReason ?? '' })}</span> : null}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{row.invoiceId ? <Link href={`/backend/accounts/invoices/${row.invoiceId}`} className="text-primary hover:underline">{row.invoiceCode}</Link> : '—'}</td>
                      <td className="px-4 py-3">
                        {!row.voided ? (
                          <span className="flex justify-end gap-1">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setDialog({ payment: row })} aria-label={t('cc_accounts.pay.edit', 'Correct')}>
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setVoiding(row)} aria-label={t('cc_accounts.pay.void', 'Void')}>
                              <Ban className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <PaymentDialog open={Boolean(dialog)} onOpenChange={(open) => (open ? null : setDialog(null))} payment={dialog?.payment ?? null} onSaved={() => setReload((value) => value + 1)} />
        <Dialog open={Boolean(voiding)} onOpenChange={(open) => (open ? null : setVoiding(null))}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t('cc_accounts.pay.voidTitle', 'Void payment')}</DialogTitle>
              <DialogDescription>{voiding ? `${voiding.orderNo} · ${rupeeText(voiding.amount)} · ${day(voiding.paidOn)}` : ''}</DialogDescription>
            </DialogHeader>
            <Label htmlFor="pay-void-reason" className="text-xs text-muted-foreground">{t('cc_accounts.pay.voidWhy', 'Why is it voided? (bounced cheque, entered twice…)')}</Label>
            <Textarea id="pay-void-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setVoiding(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" variant="destructive" disabled={!reason.trim()} onClick={() => void voidPayment()}>
                {t('cc_accounts.pay.confirmVoid', 'Void payment')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}

export default PaymentsPage
