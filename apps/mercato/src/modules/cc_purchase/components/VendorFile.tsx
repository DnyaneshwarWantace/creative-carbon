"use client"

import * as React from 'react'
import { useGranted } from '../../cc_departments/components/useGranted'
import Link from 'next/link'
import { Boxes, FileStack, Mail, MapPin, Package, Pencil, Phone, Plus, Receipt, Truck } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { GSTIN_PATTERN, stateFromGstin } from '../../cc_accounts/lib/gstStates'
import { GRN_STATUS, PO_STATUS, day, money, qty, type GrnStatus, type PoStatus } from './shared'
import { Panel, PanelEmpty, RecordColumns, RecordPage, RecordState, RegisterGrid, formatKg, type Fact } from '../../cc_ui/components/RecordPage'
import { recordHref } from '../../cc_ui/lib/links'
import { VENDOR_CATEGORY_LABEL } from '../../cc_vendors/lib/categories'

type VendorView = {
  id: string
  name: string
  code: string | null
  gstNumber: string | null
  contactPerson: string | null
  contactPhone: string | null
  contactEmail: string | null
  address: string | null
  paymentTerms: string | null
  category: string | null
  isActive: boolean
  updatedAt: string
}

type Summary = {
  vendor: VendorView
  summary: {
    poCount: number
    openPoCount: number
    openValue: number
    totalValue: number
    latePos: number
    onTimePercent: number | null
    deliveriesMeasured: number
    qcPassPercent: number | null
    batchesTested: number
    batchesRejected: number
    lastPoDate: string | null
  }
  pos: Array<{ id: string; code: string; poDate: string; expectedDate: string | null; status: PoStatus; value: number; receivedPercent: number; firstReceipt: string | null; late: boolean; orderRefs: Array<{ orderId: string; orderNo: string }> }>
  grns: Array<{ id: string; code: string; poId: string | null; poCode: string | null; grnDate: string; invoiceNo: string | null; status: GrnStatus; lines: number; passed: number; failed: number }>
  materials: Array<{ productId: string; title: string; code: string | null; unit: string; orderedQty: number; receivedQty: number; lastRate: number; lastPoDate: string; poCount: number }>
  lots: Array<{ id: string; lotId: string | null; lotNumber: string; productId: string; title: string; quantity: number; unit: string; store: string; qcStatus: 'pending' | 'passed' | 'failed' | 'returned'; grnId: string; grnCode: string; grnDate: string }>
  bills: Array<{ id: string; code: string; billNo: string; billDate: string; dueDate: string | null; total: number; paid: number; status: string; poCode: string | null; grnCodes: string[] }> | null
}


const CATEGORY_LABEL: Record<string, string> = VENDOR_CATEGORY_LABEL
const QC_VARIANT = { pending: 'warning', passed: 'success', failed: 'error', returned: 'neutral' } as const
const BILL_VARIANT: Record<string, 'success' | 'warning' | 'error' | 'neutral' | 'info'> = { open: 'warning', partly_paid: 'info', paid: 'success', cancelled: 'neutral' }

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'warning' | 'error' | 'success' }) {
  const toneClass = tone === 'error' ? 'text-status-error-text' : tone === 'warning' ? 'text-status-warning-text' : tone === 'success' ? 'text-status-success-text' : ''
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function EditVendorDialog({ vendor, open, onOpenChange, onSaved }: { vendor: VendorView; open: boolean; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  const t = useT()
  const { runMutation, retryLastMutation } = useGuardedMutation({ contextId: `cc-vendor-file-${vendor.id}` })
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState(vendor)
  React.useEffect(() => {
    if (open) setForm(vendor)
  }, [open, vendor])

  const save = async () => {
    if (!form.name.trim()) {
      flash(t('cc_purchase.vendor.errName', 'Enter the vendor name'), 'error')
      return
    }
    const payload = {
      id: vendor.id,
      name: form.name.trim(),
      code: form.code ?? '',
      gstNumber: (form.gstNumber ?? '').toUpperCase(),
      category: form.category ?? undefined,
      contactPerson: form.contactPerson ?? '',
      contactPhone: form.contactPhone ?? '',
      contactEmail: form.contactEmail ?? '',
      address: form.address ?? '',
      paymentTerms: form.paymentTerms ?? '',
    }
    setSaving(true)
    try {
      await runMutation({
        operation: async () => {
          const call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(vendor.updatedAt), () =>
            apiCall('/api/cc_vendors/vendors', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
          )
          if (!call.ok) throw Object.assign(new Error('[internal] cc_vendors.update failed'), { status: call.status, ...((call.result as Record<string, unknown> | null) ?? {}) })
          return call
        },
        context: { formId: `cc-vendor-file-${vendor.id}`, resourceKind: 'cc_vendors.vendor', resourceId: vendor.id, retryLastMutation },
        mutationPayload: payload,
      })
      flash(t('cc_purchase.vendor.saved', 'Vendor saved'), 'success')
      onOpenChange(false)
      onSaved()
    } catch (error) {
      if (surfaceRecordConflict(error, t, { onRefresh: onSaved })) return
      const message = (error as { error?: string }).error
      flash(message ?? t('cc_purchase.vendor.saveError', 'Could not save the vendor. Check the phone and email.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const text = (key: keyof VendorView, label: string, wide = false) => (
    <div className={wide ? 'space-y-1 sm:col-span-2' : 'space-y-1'}>
      <Label htmlFor={`vendor-${key}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={`vendor-${key}`} value={(form[key] as string | null) ?? ''} onChange={(event) => setForm((prev) => ({ ...prev, [key]: event.target.value }))} />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void save()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('cc_purchase.vendor.editTitle', 'Edit vendor')}</DialogTitle>
          <DialogDescription>{t('cc_purchase.vendor.editHint', 'GST number and payment terms are printed on every purchase order.')}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {text('name', t('cc_purchase.vendor.name', 'Vendor name *'))}
          {text('code', t('cc_purchase.vendor.code', 'Vendor code'))}
          <div className="space-y-1">
            {text('gstNumber', t('cc_purchase.vendor.gst', 'GST number'))}
            {(() => {
              const gst = (form.gstNumber ?? '').trim().toUpperCase()
              if (!gst) return null
              if (!GSTIN_PATTERN.test(gst)) return <p className="text-xs text-status-error-text">{t('cc_purchase.vendor.gstBad', 'Not a valid GSTIN (15 characters, e.g. 27AAACT1234A1Z5)')}</p>
              return <p className="text-xs text-muted-foreground">{t('cc_purchase.vendor.gstInfo', 'State: {state} · PAN: {pan}', { state: stateFromGstin(gst)?.name ?? '—', pan: gst.slice(2, 12) })}</p>
            })()}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t('cc_purchase.vendor.category', 'Supplies')}</Label>
            <Select value={form.category ?? 'both'} onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {t(`cc_purchase.vendor.category.${value}`, label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {text('contactPerson', t('cc_purchase.vendor.contact', 'Contact person'))}
          {text('contactPhone', t('cc_purchase.vendor.phone', 'Phone'))}
          {text('contactEmail', t('cc_purchase.vendor.email', 'Email'))}
          {text('paymentTerms', t('cc_purchase.vendor.terms', 'Payment terms'))}
          {text('address', t('cc_purchase.vendor.address', 'Address'), true)}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? t('cc_purchase.vendor.saving', 'Saving…') : t('cc_purchase.vendor.save', 'Save vendor')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function VendorFile({ vendorId }: { vendorId: string }) {
  const t = useT()
  const granted = useGranted()
  const canChange = !granted.ready || granted.has('cc_vendors.manage')
  const [data, setData] = React.useState<Summary | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [editOpen, setEditOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<Summary & { error?: string }>(`/api/cc_purchase/vendors/summary?id=${encodeURIComponent(vendorId)}`)
    if (!call.ok || !call.result) {
      setError(call.result?.error ?? t('cc_purchase.vendor.loadError', 'Could not load this vendor.'))
      return
    }
    setError(null)
    setData(call.result)
  }, [t, vendorId])

  React.useEffect(() => {
    void load()
  }, [load])

  if (error || !data) return <RecordState error={error} loadingLabel={t('cc_purchase.vendor.loading', 'Loading vendor…')} />

  const { vendor, summary } = data
  const category = vendor.category ? t(`cc_purchase.vendor.category.${vendor.category}`, CATEGORY_LABEL[vendor.category] ?? vendor.category) : null
  const held = data.lots.filter((lot) => lot.qcStatus === 'pending' || lot.qcStatus === 'failed').length
  const billsDue = data.bills ? data.bills.filter((bill) => bill.status !== 'paid' && bill.status !== 'cancelled').reduce((sum, bill) => sum + Math.max(bill.total - bill.paid, 0), 0) : null
  const facts: Fact[] = [
    { label: t('cc_purchase.vendor.open', 'Open POs'), value: String(summary.openPoCount), hint: t('cc_purchase.vendor.openHint', '{value} still to receive', { value: money(summary.openValue) }) },
    { label: t('cc_purchase.vendor.late', 'Late deliveries'), value: String(summary.latePos), tone: summary.latePos ? 'bad' : undefined },
    {
      label: t('cc_purchase.vendor.onTime', 'On-time delivery'),
      value: summary.onTimePercent == null ? '—' : `${summary.onTimePercent}%`,
      hint: t('cc_purchase.vendor.onTimeShort', '{count} POs measured', { count: summary.deliveriesMeasured }),
      tone: summary.onTimePercent == null ? undefined : summary.onTimePercent >= 80 ? 'good' : 'warn',
    },
    {
      label: t('cc_purchase.vendor.qc', 'QC pass rate'),
      value: summary.qcPassPercent == null ? '—' : `${summary.qcPassPercent}%`,
      hint: t('cc_purchase.vendor.qcShort', '{rejected} of {tested} rejected', { tested: summary.batchesTested, rejected: summary.batchesRejected }),
      tone: summary.qcPassPercent == null ? undefined : summary.batchesRejected ? 'warn' : 'good',
    },
    { label: t('cc_purchase.vendor.held', 'Lots to check / held'), value: String(held), tone: held ? 'warn' : undefined },
    billsDue === null
      ? { label: t('cc_purchase.vendor.lastPo', 'Last PO'), value: day(summary.lastPoDate) }
      : { label: t('cc_purchase.vendor.billsDue', 'Bills unpaid'), value: money(billsDue), tone: billsDue ? 'warn' : undefined },
  ]

  return (
    <>
      <RecordPage
        back={{ href: '/backend/cc_vendors', label: t('cc_purchase.vendor.vendors', 'Vendors') }}
        overline={[t('cc_purchase.vendor.overline', 'Vendor'), vendor.code, category].filter(Boolean).join(' · ')}
        title={vendor.name}
        mono={false}
        badges={<StatusBadge variant={vendor.isActive ? 'success' : 'neutral'}>{vendor.isActive ? t('cc_purchase.vendor.active', 'Active') : t('cc_purchase.vendor.inactive', 'Inactive')}</StatusBadge>}
        meta={[vendor.gstNumber ? `GST ${vendor.gstNumber}${stateFromGstin(vendor.gstNumber) ? ` (${stateFromGstin(vendor.gstNumber)?.name})` : ''}` : t('cc_purchase.vendor.noGst', 'No GST number'), vendor.paymentTerms ? t('cc_purchase.vendor.termsText', 'Terms: {terms}', { terms: vendor.paymentTerms }) : null]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            {canChange ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_purchase.vendor.edit', 'Edit vendor')}
              </Button>
            ) : null}
            <Button asChild size="sm">
              <Link href={`/backend/purchase/orders/new?vendorId=${vendor.id}`}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_purchase.vendor.newPo', 'New purchase order')}
              </Link>
            </Button>
          </>
        }
        facts={facts}
      >
        <RecordColumns
          main={
            <>
              <Panel title={t('cc_purchase.vendor.tabPosTitle', 'Purchase orders')} icon={FileStack} count={data.pos.length} flush>
                <RegisterGrid
                  rows={data.pos}
                  rowKey={(po) => po.id}
                  rowHref={(po) => recordHref.purchaseOrder(po.id)}
                  empty={t('cc_purchase.vendor.noPos', 'No purchase orders to this vendor yet.')}
                  columns={[
                    { key: 'po', label: t('cc_purchase.vendor.colPo', 'PO'), mono: true, render: (po) => po.code },
                    { key: 'date', label: t('cc_purchase.vendor.colDate', 'Date'), render: (po) => day(po.poDate) },
                    {
                      key: 'expected',
                      label: t('cc_purchase.vendor.colExpected', 'Expected'),
                      render: (po) => <span className={po.late ? 'font-medium text-status-error-text' : undefined}>{day(po.expectedDate)}{po.late ? ` · ${t('cc_purchase.vendor.lateTag', 'late')}` : ''}</span>,
                    },
                    {
                      key: 'for',
                      label: t('cc_purchase.vendor.colFor', 'For orders'),
                      render: (po) =>
                        po.orderRefs.length ? (
                          po.orderRefs.map((ref, index) => (
                            <React.Fragment key={ref.orderId}>
                              {index ? ', ' : ''}
                              <Link className="font-mono text-xs hover:underline" href={recordHref.order(ref.orderId)}>
                                {ref.orderNo}
                              </Link>
                            </React.Fragment>
                          ))
                        ) : (
                          <span className="text-muted-foreground">{t('cc_purchase.vendor.stock', 'Stock')}</span>
                        ),
                    },
                    { key: 'status', label: t('cc_purchase.vendor.colStatus', 'Status'), render: (po) => <StatusBadge variant={PO_STATUS[po.status].variant}>{PO_STATUS[po.status].label}</StatusBadge> },
                    { key: 'received', label: t('cc_purchase.vendor.colReceived', 'Received'), align: 'right', render: (po) => `${po.receivedPercent}%` },
                    { key: 'value', label: t('cc_purchase.vendor.colValue', 'Value'), align: 'right', render: (po) => money(po.value), total: money(summary.totalValue) },
                  ]}
                />
              </Panel>

              <Panel title={t('cc_purchase.vendor.lots', 'Lots received')} icon={Boxes} count={data.lots.length} flush>
                <RegisterGrid
                  rows={data.lots}
                  rowKey={(lot) => lot.id}
                  rowHref={(lot) => (lot.lotId ? recordHref.lot(lot.lotId) : null)}
                  empty={t('cc_purchase.vendor.noGrns', 'Nothing received from this vendor yet.')}
                  columns={[
                    { key: 'lot', label: t('cc_purchase.vendor.colLot', 'Lot No.'), mono: true, render: (lot) => lot.lotNumber },
                    {
                      key: 'item',
                      label: t('cc_purchase.vendor.colMaterial', 'Material'),
                      render: (lot) => (
                        <Link className="hover:underline" href={recordHref.product(lot.productId)}>
                          {lot.title || '—'}
                        </Link>
                      ),
                    },
                    {
                      key: 'grn',
                      label: t('cc_purchase.vendor.colGrn', 'GRN'),
                      render: (lot) => (
                        <Link className="font-mono text-xs hover:underline" href={recordHref.grn(lot.grnId)}>
                          {lot.grnCode}
                        </Link>
                      ),
                    },
                    { key: 'date', label: t('cc_purchase.vendor.colDate', 'Date'), render: (lot) => day(lot.grnDate) },
                    { key: 'qc', label: t('cc_purchase.vendor.colQcShort', 'QC'), render: (lot) => <StatusBadge variant={QC_VARIANT[lot.qcStatus]}>{t(`cc_purchase.qc.${lot.qcStatus}`, lot.qcStatus)}</StatusBadge> },
                    { key: 'qty', label: t('cc_purchase.vendor.colQty', 'Qty'), align: 'right', render: (lot) => (lot.unit === 'kg' ? `${formatKg(lot.quantity)} kg` : qty(lot.quantity, lot.unit)) },
                  ]}
                />
              </Panel>

              <Panel title={t('cc_purchase.vendor.tabMaterialsTitle', 'Materials supplied')} icon={Package} count={data.materials.length} flush>
                <RegisterGrid
                  rows={data.materials}
                  rowKey={(material) => material.productId}
                  rowHref={(material) => recordHref.product(material.productId)}
                  empty={t('cc_purchase.vendor.noMaterials', 'No materials bought from this vendor yet.')}
                  columns={[
                    { key: 'material', label: t('cc_purchase.vendor.colMaterial', 'Material'), render: (material) => material.title },
                    { key: 'code', label: t('cc_purchase.vendor.colCode', 'Code'), mono: true, render: (material) => material.code ?? '—' },
                    { key: 'last', label: t('cc_purchase.vendor.colLast', 'Last PO'), render: (material) => `${day(material.lastPoDate)} · ${t('cc_purchase.vendor.poCount', '{count} POs', { count: material.poCount })}` },
                    { key: 'ordered', label: t('cc_purchase.vendor.colOrdered', 'Ordered'), align: 'right', render: (material) => qty(material.orderedQty, material.unit) },
                    { key: 'received', label: t('cc_purchase.vendor.colReceivedQty', 'Received'), align: 'right', render: (material) => qty(material.receivedQty, material.unit) },
                    { key: 'rate', label: t('cc_purchase.vendor.colRate', 'Last rate'), align: 'right', render: (material) => `${money(material.lastRate)}/${material.unit}` },
                  ]}
                />
              </Panel>
            </>
          }
          side={
            <>
              <Panel title={t('cc_purchase.vendor.contactTitle', 'Contact')} icon={Truck}>
                <dl className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <dd>{vendor.contactPerson || <span className="text-muted-foreground">{t('cc_purchase.vendor.noContact', 'No contact person')}</span>}</dd>
                  </div>
                  <div className="flex items-start gap-2">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <dd>{vendor.contactPhone ? <a className="hover:underline" href={`tel:${vendor.contactPhone}`}>{vendor.contactPhone}</a> : <span className="text-muted-foreground">—</span>}</dd>
                  </div>
                  <div className="flex items-start gap-2">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <dd className="break-all">{vendor.contactEmail ? <a className="hover:underline" href={`mailto:${vendor.contactEmail}`}>{vendor.contactEmail}</a> : <span className="text-muted-foreground">—</span>}</dd>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <dd className="whitespace-pre-line">{vendor.address || <span className="text-muted-foreground">{t('cc_purchase.vendor.noAddress', 'No address')}</span>}</dd>
                  </div>
                </dl>
                <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                  {t('cc_purchase.vendor.totals', '{count} purchase orders worth {value}. Last PO {date}.', { count: summary.poCount, value: money(summary.totalValue), date: day(summary.lastPoDate) })}
                </p>
              </Panel>

              <Panel title={t('cc_purchase.vendor.grnsTitle', 'Goods received (GRN)')} icon={Boxes} count={data.grns.length} flush>
                {data.grns.length ? (
                  <ul className="divide-y divide-border text-sm">
                    {data.grns.map((grn) => (
                      <li key={grn.id} className="even:bg-muted/30">
                        <Link href={recordHref.grn(grn.id)} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/60">
                          <span className="min-w-0">
                            <span className="block font-mono text-xs font-semibold">{grn.code}</span>
                            <span className="block truncate text-xs text-muted-foreground">{[day(grn.grnDate), grn.poCode ?? t('cc_purchase.grn.withoutPo', 'Without PO'), grn.invoiceNo].filter(Boolean).join(' · ')}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="font-mono text-xs tabular-nums">
                              {grn.passed}/<span className={grn.failed ? 'text-status-error-text' : undefined}>{grn.failed}</span>
                              <span className="text-muted-foreground"> · {grn.lines}</span>
                            </span>
                            <StatusBadge variant={GRN_STATUS[grn.status].variant}>{GRN_STATUS[grn.status].label}</StatusBadge>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <PanelEmpty>{t('cc_purchase.vendor.noGrns', 'Nothing received from this vendor yet.')}</PanelEmpty>
                )}
              </Panel>

              {data.bills ? (
                <Panel
                  title={t('cc_purchase.vendor.bills', 'Vendor bills')}
                  icon={Receipt}
                  count={data.bills.length}
                  flush
                  action={
                    <Link className="text-primary hover:underline" href="/backend/accounts/vendor-bills">
                      {t('cc_purchase.vendor.allBills', 'All bills')}
                    </Link>
                  }
                >
                  {data.bills.length ? (
                    <ul className="divide-y divide-border text-sm">
                      {data.bills.map((bill) => (
                        <li key={bill.id} className="flex items-center justify-between gap-3 px-3 py-2 even:bg-muted/30">
                          <span className="min-w-0">
                            <Link className="block font-mono text-xs font-semibold underline-offset-2 hover:underline" href={recordHref.vendorBill(bill.id)}>
                              {bill.billNo}
                            </Link>
                            <span className="block truncate text-xs text-muted-foreground">{[day(bill.billDate), bill.poCode, bill.grnCodes.join(', ') || null].filter(Boolean).join(' · ')}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="text-right font-mono text-xs tabular-nums">
                              {money(bill.total)}
                              {bill.paid ? <span className="block text-muted-foreground">{t('cc_purchase.vendor.paid', 'paid {value}', { value: money(bill.paid) })}</span> : null}
                            </span>
                            <StatusBadge variant={BILL_VARIANT[bill.status] ?? 'neutral'}>{t(`cc_accounts.vendorBill.status.${bill.status}`, bill.status.replace(/_/g, ' '))}</StatusBadge>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <PanelEmpty>{t('cc_purchase.vendor.noBills', 'No bill entered for this vendor.')}</PanelEmpty>
                  )}
                </Panel>
              ) : null}
            </>
          }
        />
      </RecordPage>
      <EditVendorDialog vendor={vendor} open={editOpen} onOpenChange={setEditOpen} onSaved={() => void load()} />
    </>
  )
}

export default VendorFile
