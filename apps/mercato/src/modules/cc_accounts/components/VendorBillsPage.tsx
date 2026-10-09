"use client"

import * as React from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../cc_departments/components/useGranted'
import { ListSelectItems } from '../../cc_lists/components/ListSelectItems'
import { ExportButton } from '../../cc_products/components/ExportButton'
import { downloadCsv } from '../../cc_products/lib/csvExport'
import { PageLoading } from '../../cc_ui/components/PageLoading'

type Bill = {
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
  payments: Array<{ id: string; amount: number; paidOn: string; mode: string | null; reference: string | null; by: string | null }>
  updatedAt: string
}
type Grn = { grnId: string; code: string; grnDate: string; poCode: string | null; invoiceNo: string | null; taxable: number; gst: number; total: number }
type Vendor = { id: string; name: string; code: string | null; paymentTerms: string | null }
type View = 'to_pay' | 'overdue' | 'paid' | 'all'

const STATUS: Record<Bill['status'], { label: string; variant: StatusBadgeVariant }> = {
  open: { label: 'To pay', variant: 'warning' },
  partly_paid: { label: 'Part paid', variant: 'info' },
  paid: { label: 'Paid', variant: 'success' },
  cancelled: { label: 'Cancelled', variant: 'neutral' },
}

function rupees(value: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
}

function day(value: string | null): string {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function VendorBillsPage() {
  const t = useT()
  const granted = useGranted()
  const { runMutation } = useGuardedMutation({ contextId: 'cc-vendor-bills' })
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
  const [view, setView] = React.useState<View>('to_pay')
  const [bills, setBills] = React.useState<Bill[] | null>(null)
  const [summary, setSummary] = React.useState<{ toPay: number; overdue: number; overdueBills: number; openBills: number } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [newOpen, setNewOpen] = React.useState(false)
  const [vendorSearch, setVendorSearch] = React.useState('')
  const [vendors, setVendors] = React.useState<Vendor[]>([])
  const [vendor, setVendor] = React.useState<Vendor | null>(null)
  const [grns, setGrns] = React.useState<Grn[]>([])
  const [picked, setPicked] = React.useState<Set<string>>(new Set())
  const [billForm, setBillForm] = React.useState({ billNo: '', billDate: today, taxable: '', gst: '', notes: '' })
  const [paying, setPaying] = React.useState<Bill | null>(null)
  const [payForm, setPayForm] = React.useState({ amount: '', paidOn: today, mode: '', reference: '' })
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<{ items?: Bill[]; summary?: { toPay: number; overdue: number; overdueBills: number; openBills: number }; error?: string }>(`/api/cc_accounts/vendor-bills?view=${view}`)
    if (!call.ok) {
      setError(call.result?.error ?? t('cc_accounts.bills.loadError', 'Could not load vendor bills.'))
      return
    }
    setError(null)
    setBills(call.result?.items ?? [])
    setSummary(call.result?.summary ?? null)
  }, [view, t])

  React.useEffect(() => {
    void load()
  }, [load])

  React.useEffect(() => {
    if (!vendorSearch.trim() || vendor) {
      setVendors([])
      return
    }
    const handle = window.setTimeout(async () => {
      const call = await apiCall<{ items?: Vendor[] }>(`/api/cc_purchase/vendors?q=${encodeURIComponent(vendorSearch.trim())}`, undefined, { fallback: { items: [] } })
      setVendors(call.result?.items ?? [])
    }, 200)
    return () => window.clearTimeout(handle)
  }, [vendorSearch, vendor])

  React.useEffect(() => {
    if (!vendor) {
      setGrns([])
      setPicked(new Set())
      return
    }
    apiCall<{ items?: Grn[] }>(`/api/cc_accounts/vendor-bills?unbilledFor=${vendor.id}`, undefined, { fallback: { items: [] } }).then((call) => setGrns(call.result?.items ?? []))
  }, [vendor])

  const pickedGrns = grns.filter((grn) => picked.has(grn.grnId))
  const suggestedTaxable = pickedGrns.reduce((sum, grn) => sum + grn.taxable, 0)
  const suggestedGst = pickedGrns.reduce((sum, grn) => sum + grn.gst, 0)

  const mutate = async (url: string, body: Record<string, unknown>, version: string | null, success: string) => {
    setBusy(true)
    try {
      const request = () => apiCall<{ error?: string; code?: string }>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const call = await runMutation({ context: { resourceKind: 'cc_accounts.vendor_bill', resourceId: String(body.id ?? 'new') }, mutationPayload: body, operation: () => (version ? withScopedApiRequestHeaders(buildOptimisticLockHeader(version), request) : request()) })
      if (!call.ok) {
        flash(call.result?.error ?? t('cc_accounts.bills.saveError', 'Could not save.'), 'error')
        return false
      }
      flash(success.replace('{code}', call.result?.code ?? ''), 'success')
      await load()
      return true
    } finally {
      setBusy(false)
    }
  }

  const saveBill = async () => {
    if (!vendor) return flash(t('cc_accounts.bills.pickVendor', 'Pick the vendor'), 'error')
    if (!billForm.billNo.trim()) return flash(t('cc_accounts.bills.billNoNeeded', "Enter the vendor's bill number"), 'error')
    const body = {
      vendorId: vendor.id,
      billNo: billForm.billNo,
      billDate: billForm.billDate,
      grnIds: [...picked],
      taxable: billForm.taxable ? Number(billForm.taxable) : null,
      gst: billForm.gst ? Number(billForm.gst) : null,
      notes: billForm.notes || null,
    }
    const ok = await mutate('/api/cc_accounts/vendor-bills', body, null, t('cc_accounts.bills.created', 'Bill {code} entered'))
    if (ok) setNewOpen(false)
  }

  const pay = async () => {
    if (!paying) return
    const ok = await mutate('/api/cc_accounts/vendor-bills/action', { id: paying.id, action: 'pay', amount: Number(payForm.amount), paidOn: payForm.paidOn, mode: payForm.mode || null, reference: payForm.reference || null }, paying.updatedAt, t('cc_accounts.bills.paid', 'Payment recorded'))
    if (ok) setPaying(null)
  }

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_accounts.bills.title', 'Vendor bills & payments')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('cc_accounts.bills.lede', 'What we owe suppliers: bills entered against goods received, what is paid and what is due.')}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <ExportButton
                size="sm"
                disabled={!bills?.length}
                onExport={() =>
                  downloadCsv('vendor-bills', [
                    { header: 'Bill', value: (row: Bill) => row.code },
                    { header: 'Vendor', value: (row) => row.vendorName },
                    { header: 'Vendor bill no.', value: (row) => row.billNo },
                    { header: 'Bill date', value: (row) => row.billDate },
                    { header: 'Due date', value: (row) => row.dueDate },
                    { header: 'GRNs', value: (row) => row.grnCodes.join(', ') },
                    { header: 'Taxable', value: (row) => row.taxable },
                    { header: 'GST', value: (row) => row.gst },
                    { header: 'Total', value: (row) => row.total },
                    { header: 'Paid', value: (row) => row.paid },
                    { header: 'Balance', value: (row) => row.balance },
                    { header: 'Status', value: (row) => STATUS[row.status].label },
                  ], bills ?? [])
                }
              />
              {granted.has('cc_accounts.record') ? (
                <Button
                  type="button"
                  onClick={() => {
                    setVendor(null)
                    setVendorSearch('')
                    setBillForm({ billNo: '', billDate: today, taxable: '', gst: '', notes: '' })
                    setNewOpen(true)
                  }}
                >
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_accounts.bills.new', 'Enter vendor bill')}
                </Button>
              ) : null}
            </div>
          </header>

          {summary ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('cc_accounts.bills.toPay', 'To pay')}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{rupees(summary.toPay)}</p>
                <p className="text-xs text-muted-foreground">{t('cc_accounts.bills.openBills', '{count} open bills', { count: summary.openBills })}</p>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('cc_accounts.bills.overdue', 'Overdue')}</p>
                <p className={cn('mt-1 text-xl font-semibold tabular-nums', summary.overdue > 0 && 'text-status-error-text')}>{rupees(summary.overdue)}</p>
                <p className="text-xs text-muted-foreground">{t('cc_accounts.bills.overdueBills', '{count} bills past due date', { count: summary.overdueBills })}</p>
              </div>
            </div>
          ) : null}

          <SegmentedControl value={view} onValueChange={(value) => setView(value as View)} aria-label={t('cc_accounts.bills.show', 'Show')}>
            <SegmentedControlItem value="to_pay">{t('cc_accounts.bills.viewToPay', 'To pay')}</SegmentedControlItem>
            <SegmentedControlItem value="overdue">{t('cc_accounts.bills.viewOverdue', 'Overdue')}</SegmentedControlItem>
            <SegmentedControlItem value="paid">{t('cc_accounts.bills.viewPaid', 'Paid')}</SegmentedControlItem>
            <SegmentedControlItem value="all">{t('cc_accounts.bills.viewAll', 'All')}</SegmentedControlItem>
          </SegmentedControl>

          {error ? <ErrorMessage label={error} /> : null}
          {!bills && !error ? <PageLoading label={t('cc_accounts.bills.loading', 'Loading…')} /> : null}
          {bills ? (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.bills.colBill', 'Bill / vendor')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.bills.colAgainst', 'Against')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.bills.colDue', 'Due')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('cc_accounts.bills.colTotal', 'Total')}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t('cc_accounts.bills.colBalance', 'Balance')}</th>
                    <th className="px-3 py-2 text-left font-semibold">{t('cc_accounts.bills.colStatus', 'Status')}</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {bills.map((bill) => (
                    <tr key={bill.id} className="align-top hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <Link href={`/backend/accounts/vendor-bills/${bill.id}`} className="font-mono text-xs text-primary hover:underline">
                          {bill.code}
                        </Link>
                        <span className="block font-medium">
                          <Link href={`/backend/cc_vendors/${bill.vendorId}`} className="hover:underline">
                            {bill.vendorName}
                          </Link>
                        </span>
                        <span className="block text-xs text-muted-foreground">{t('cc_accounts.bills.theirBill', 'Bill {no} · {date}', { no: bill.billNo, date: day(bill.billDate) })}</span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {bill.poId ? (
                          <Link href={`/backend/purchase/orders/${bill.poId}`} className="font-mono hover:underline">
                            {bill.poCode}
                          </Link>
                        ) : null}
                        <span className="block font-mono text-muted-foreground">{bill.grnCodes.join(', ') || '—'}</span>
                      </td>
                      <td className={cn('px-3 py-2 text-xs tabular-nums', bill.overdueDays > 0 && 'font-medium text-status-error-text')}>
                        {day(bill.dueDate)}
                        {bill.overdueDays > 0 ? <span className="block">{t('cc_accounts.bills.lateBy', '{days} d overdue', { days: bill.overdueDays })}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {rupees(bill.total)}
                        <span className="block text-xs text-muted-foreground">{t('cc_accounts.bills.gstPart', 'incl. GST {gst}', { gst: rupees(bill.gst) })}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{rupees(bill.balance)}</td>
                      <td className="px-3 py-2">
                        <StatusBadge variant={STATUS[bill.status].variant}>{STATUS[bill.status].label}</StatusBadge>
                        {bill.payments.length ? <span className="mt-1 block text-xs text-muted-foreground">{bill.payments.map((payment) => `${rupees(payment.amount)} ${day(payment.paidOn)}${payment.reference ? ` (${payment.reference})` : ''}`).join(', ')}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {granted.has('cc_accounts.record') && (bill.status === 'open' || bill.status === 'partly_paid') ? (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              setPayForm({ amount: String(bill.balance), paidOn: today, mode: '', reference: '' })
                              setPaying(bill)
                            }}
                          >
                            {t('cc_accounts.bills.pay', 'Pay')}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                  {!bills.length ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-sm text-muted-foreground">
                        {t('cc_accounts.bills.empty', 'No vendor bills here.')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogContent
            className="max-h-screen overflow-y-auto sm:max-w-2xl"
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void saveBill()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('cc_accounts.bills.newTitle', 'Enter a vendor bill')}</DialogTitle>
              <DialogDescription>{t('cc_accounts.bills.newHint', 'Pick the goods receipts the bill covers; the amount is worked out from what was received at the PO rate. Change it if the bill differs.')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="bill-vendor">{t('cc_accounts.bills.vendor', 'Vendor *')}</Label>
                {vendor ? (
                  <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                    <span className="font-medium">{vendor.name}</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setVendor(null)}>
                      {t('cc_accounts.bills.change', 'Change')}
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input id="bill-vendor" value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} placeholder={t('cc_accounts.bills.searchVendor', 'Search vendor by name, code or GST')} />
                    {vendors.length ? (
                      <ul className="max-h-40 overflow-auto rounded-md border">
                        {vendors.map((entry) => (
                          <li key={entry.id}>
                            <button type="button" className="w-full px-3 py-1.5 text-left text-sm hover:bg-muted" onClick={() => setVendor(entry)}>
                              {entry.name} <span className="font-mono text-xs text-muted-foreground">{entry.code ?? ''}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </>
                )}
              </div>
              {vendor ? (
                <fieldset className="space-y-1">
                  <legend className="text-sm font-medium">{t('cc_accounts.bills.grns', 'Goods received, not billed yet')}</legend>
                  {grns.length ? (
                    <ul className="divide-y rounded-md border">
                      {grns.map((grn) => (
                        <li key={grn.grnId} className="flex items-center gap-3 px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded-sm border-input"
                            aria-label={grn.code}
                            checked={picked.has(grn.grnId)}
                            onChange={(event) =>
                              setPicked((prev) => {
                                const next = new Set(prev)
                                if (event.target.checked) next.add(grn.grnId)
                                else next.delete(grn.grnId)
                                return next
                              })
                            }
                          />
                          <span className="min-w-0 flex-1">
                            <span className="font-mono text-xs">{grn.code}</span> · {day(grn.grnDate)} · <span className="font-mono text-xs">{grn.poCode ?? t('cc_accounts.bills.withoutPo', 'Without PO')}</span>
                            {grn.invoiceNo ? <span className="block text-xs text-muted-foreground">{t('cc_accounts.bills.theirInvoice', 'Their invoice {no}', { no: grn.invoiceNo })}</span> : null}
                          </span>
                          <span className="tabular-nums">{rupees(grn.total)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t('cc_accounts.bills.noGrns', 'Every goods receipt of this vendor is already billed. You can still enter a bill with an amount.')}</p>
                  )}
                </fieldset>
              ) : null}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="bill-no">{t('cc_accounts.bills.billNo', "Vendor's bill no. *")}</Label>
                  <Input id="bill-no" value={billForm.billNo} onChange={(event) => setBillForm({ ...billForm, billNo: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bill-date">{t('cc_accounts.bills.billDate', 'Bill date *')}</Label>
                  <Input id="bill-date" type="date" value={billForm.billDate} onChange={(event) => setBillForm({ ...billForm, billDate: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bill-taxable">{t('cc_accounts.bills.taxable', 'Taxable (₹)')}</Label>
                  <Input id="bill-taxable" type="number" min="0" step="0.01" value={billForm.taxable} placeholder={suggestedTaxable ? suggestedTaxable.toFixed(2) : ''} onChange={(event) => setBillForm({ ...billForm, taxable: event.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bill-gst">{t('cc_accounts.bills.gst', 'GST (₹)')}</Label>
                  <Input id="bill-gst" type="number" min="0" step="0.01" value={billForm.gst} placeholder={suggestedGst ? suggestedGst.toFixed(2) : ''} onChange={(event) => setBillForm({ ...billForm, gst: event.target.value })} />
                </div>
              </div>
              <p className="text-sm">
                {t('cc_accounts.bills.totalLine', 'Bill total: {total}', { total: rupees((billForm.taxable ? Number(billForm.taxable) : suggestedTaxable) + (billForm.gst ? Number(billForm.gst) : suggestedGst)) })}
              </p>
              <div className="space-y-1">
                <Label htmlFor="bill-notes">{t('cc_accounts.bills.notes', 'Notes')}</Label>
                <Textarea id="bill-notes" rows={2} value={billForm.notes} onChange={(event) => setBillForm({ ...billForm, notes: event.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewOpen(false)} disabled={busy}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" onClick={() => void saveBill()} disabled={busy}>
                {t('cc_accounts.bills.save', 'Save bill')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={Boolean(paying)} onOpenChange={(value) => (value ? undefined : setPaying(null))}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                void pay()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('cc_accounts.bills.payTitle', 'Pay {vendor}', { vendor: paying?.vendorName ?? '' })}</DialogTitle>
              <DialogDescription>{t('cc_accounts.bills.payHint', 'Bill {no}: {balance} left to pay.', { no: paying?.billNo ?? '', balance: rupees(paying?.balance ?? 0) })}</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="pay-amount">{t('cc_accounts.bills.amount', 'Amount (₹) *')}</Label>
                <Input id="pay-amount" type="number" min="0" step="0.01" value={payForm.amount} onChange={(event) => setPayForm({ ...payForm, amount: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pay-on">{t('cc_accounts.bills.paidOn', 'Paid on')}</Label>
                <Input id="pay-on" type="date" value={payForm.paidOn} onChange={(event) => setPayForm({ ...payForm, paidOn: event.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t('cc_accounts.bills.mode', 'Mode')}</Label>
                <Select value={payForm.mode || undefined} onValueChange={(value) => setPayForm({ ...payForm, mode: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <ListSelectItems listKey="payment_modes" current={payForm.mode || null} />
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pay-ref">{t('cc_accounts.bills.reference', 'UTR / cheque no.')}</Label>
                <Input id="pay-ref" value={payForm.reference} onChange={(event) => setPayForm({ ...payForm, reference: event.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPaying(null)} disabled={busy}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" onClick={() => void pay()} disabled={busy || !(Number(payForm.amount) > 0)}>
                {t('cc_accounts.bills.record', 'Record payment')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}

export default VendorBillsPage
