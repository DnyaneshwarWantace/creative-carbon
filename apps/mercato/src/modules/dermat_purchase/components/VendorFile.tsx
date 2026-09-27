"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Mail, MapPin, Pencil, Phone, Plus, ShoppingCart, Truck } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { LoadingMessage, ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { GSTIN_PATTERN, stateFromGstin } from '../../dermat_accounts/lib/gstStates'
import { GRN_STATUS, PO_STATUS, day, money, qty, type GrnStatus, type PoStatus } from './shared'

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
}

type Tab = 'pos' | 'grns' | 'materials'

const CATEGORY_LABEL: Record<string, string> = { rm_supplier: 'Raw material supplier', pm_supplier: 'Packing material supplier', both: 'RM and PM supplier' }

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
  const { runMutation, retryLastMutation } = useGuardedMutation({ contextId: `dermat-vendor-file-${vendor.id}` })
  const [saving, setSaving] = React.useState(false)
  const [form, setForm] = React.useState(vendor)
  React.useEffect(() => {
    if (open) setForm(vendor)
  }, [open, vendor])

  const save = async () => {
    if (!form.name.trim()) {
      flash(t('dermat_purchase.vendor.errName', 'Enter the vendor name'), 'error')
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
            apiCall('/api/dermat_vendors/vendors', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }),
          )
          if (!call.ok) throw Object.assign(new Error('[internal] dermat_vendors.update failed'), { status: call.status, ...((call.result as Record<string, unknown> | null) ?? {}) })
          return call
        },
        context: { formId: `dermat-vendor-file-${vendor.id}`, resourceKind: 'dermat_vendors.vendor', resourceId: vendor.id, retryLastMutation },
        mutationPayload: payload,
      })
      flash(t('dermat_purchase.vendor.saved', 'Vendor saved'), 'success')
      onOpenChange(false)
      onSaved()
    } catch (error) {
      if (surfaceRecordConflict(error, t, { onRefresh: onSaved })) return
      const message = (error as { error?: string }).error
      flash(message ?? t('dermat_purchase.vendor.saveError', 'Could not save the vendor. Check the phone and email.'), 'error')
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
          <DialogTitle>{t('dermat_purchase.vendor.editTitle', 'Edit vendor')}</DialogTitle>
          <DialogDescription>{t('dermat_purchase.vendor.editHint', 'GST number and payment terms are printed on every purchase order.')}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {text('name', t('dermat_purchase.vendor.name', 'Vendor name *'))}
          {text('code', t('dermat_purchase.vendor.code', 'Vendor code'))}
          <div className="space-y-1">
            {text('gstNumber', t('dermat_purchase.vendor.gst', 'GST number'))}
            {(() => {
              const gst = (form.gstNumber ?? '').trim().toUpperCase()
              if (!gst) return null
              if (!GSTIN_PATTERN.test(gst)) return <p className="text-xs text-status-error-text">{t('dermat_purchase.vendor.gstBad', 'Not a valid GSTIN (15 characters, e.g. 27AAACT1234A1Z5)')}</p>
              return <p className="text-xs text-muted-foreground">{t('dermat_purchase.vendor.gstInfo', 'State: {state} · PAN: {pan}', { state: stateFromGstin(gst)?.name ?? '—', pan: gst.slice(2, 12) })}</p>
            })()}
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t('dermat_purchase.vendor.category', 'Supplies')}</Label>
            <Select value={form.category ?? 'both'} onValueChange={(value) => setForm((prev) => ({ ...prev, category: value }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {text('contactPerson', t('dermat_purchase.vendor.contact', 'Contact person'))}
          {text('contactPhone', t('dermat_purchase.vendor.phone', 'Phone'))}
          {text('contactEmail', t('dermat_purchase.vendor.email', 'Email'))}
          {text('paymentTerms', t('dermat_purchase.vendor.terms', 'Payment terms'))}
          {text('address', t('dermat_purchase.vendor.address', 'Address'), true)}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={() => void save()} disabled={saving}>
            {saving ? t('dermat_purchase.vendor.saving', 'Saving…') : t('dermat_purchase.vendor.save', 'Save vendor')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function VendorFile({ vendorId }: { vendorId: string }) {
  const t = useT()
  const [data, setData] = React.useState<Summary | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [tab, setTab] = React.useState<Tab>('pos')
  const [editOpen, setEditOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<Summary & { error?: string }>(`/api/dermat_purchase/vendors/summary?id=${encodeURIComponent(vendorId)}`)
    if (!call.ok || !call.result) {
      setError(call.result?.error ?? t('dermat_purchase.vendor.loadError', 'Could not load this vendor.'))
      return
    }
    setError(null)
    setData(call.result)
  }, [t, vendorId])

  React.useEffect(() => {
    void load()
  }, [load])

  if (error) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={error} />
          <Button asChild variant="outline" className="mt-4">
            <Link href="/backend/dermat_vendors">{t('dermat_purchase.vendor.back', 'Back to vendors')}</Link>
          </Button>
        </PageBody>
      </Page>
    )
  }
  if (!data) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dermat_purchase.vendor.loading', 'Loading vendor…')} />
        </PageBody>
      </Page>
    )
  }

  const { vendor, summary } = data
  const tabs: Array<{ value: Tab; label: string }> = [
    { value: 'pos', label: t('dermat_purchase.vendor.tabPos', 'Purchase orders ({count})', { count: data.pos.length }) },
    { value: 'grns', label: t('dermat_purchase.vendor.tabGrns', 'Goods received ({count})', { count: data.grns.length }) },
    { value: 'materials', label: t('dermat_purchase.vendor.tabMaterials', 'Materials supplied ({count})', { count: data.materials.length }) },
  ]

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 space-y-1">
              <Link href="/backend/dermat_vendors" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                {t('dermat_purchase.vendor.vendors', 'Vendors')}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{vendor.name}</h1>
                {vendor.code ? <span className="rounded-md border px-2 py-0.5 font-mono text-xs text-muted-foreground">{vendor.code}</span> : null}
                <StatusBadge variant={vendor.isActive ? 'success' : 'neutral'}>{vendor.isActive ? t('dermat_purchase.vendor.active', 'Active') : t('dermat_purchase.vendor.inactive', 'Inactive')}</StatusBadge>
              </div>
              <p className="text-sm text-muted-foreground">
                {[vendor.category ? CATEGORY_LABEL[vendor.category] ?? vendor.category : null, vendor.gstNumber ? `GST ${vendor.gstNumber}${stateFromGstin(vendor.gstNumber) ? ` (${stateFromGstin(vendor.gstNumber)?.name})` : ''}` : t('dermat_purchase.vendor.noGst', 'No GST number'), vendor.paymentTerms ? t('dermat_purchase.vendor.termsText', 'Terms: {terms}', { terms: vendor.paymentTerms }) : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('dermat_purchase.vendor.edit', 'Edit vendor')}
              </Button>
              <Button asChild size="sm">
                <Link href={`/backend/purchase/orders/new?vendorId=${vendor.id}`}>
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('dermat_purchase.vendor.newPo', 'New purchase order')}
                </Link>
              </Button>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label={t('dermat_purchase.vendor.open', 'Open POs')} value={String(summary.openPoCount)} hint={t('dermat_purchase.vendor.openHint', '{value} still to receive', { value: money(summary.openValue) })} />
            <Tile
              label={t('dermat_purchase.vendor.late', 'Late deliveries')}
              value={String(summary.latePos)}
              hint={t('dermat_purchase.vendor.lateHint', 'Open POs past expected date')}
              tone={summary.latePos ? 'error' : undefined}
            />
            <Tile
              label={t('dermat_purchase.vendor.onTime', 'On-time delivery')}
              value={summary.onTimePercent == null ? '—' : `${summary.onTimePercent}%`}
              hint={t('dermat_purchase.vendor.onTimeHint', 'First receipt by expected date, {count} POs', { count: summary.deliveriesMeasured })}
              tone={summary.onTimePercent == null ? undefined : summary.onTimePercent >= 80 ? 'success' : 'warning'}
            />
            <Tile
              label={t('dermat_purchase.vendor.qc', 'QC pass rate')}
              value={summary.qcPassPercent == null ? '—' : `${summary.qcPassPercent}%`}
              hint={t('dermat_purchase.vendor.qcHint', '{tested} batches tested, {rejected} rejected', { tested: summary.batchesTested, rejected: summary.batchesRejected })}
              tone={summary.qcPassPercent == null ? undefined : summary.batchesRejected ? 'warning' : 'success'}
            />
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <aside className="space-y-3 rounded-lg border bg-card p-4 text-sm lg:col-span-4 lg:self-start">
              <h2 className="text-sm font-semibold">{t('dermat_purchase.vendor.contactTitle', 'Contact')}</h2>
              <dl className="space-y-2">
                <div className="flex items-start gap-2">
                  <Truck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <dd>{vendor.contactPerson || <span className="text-muted-foreground">{t('dermat_purchase.vendor.noContact', 'No contact person')}</span>}</dd>
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
                  <dd className="whitespace-pre-line">{vendor.address || <span className="text-muted-foreground">{t('dermat_purchase.vendor.noAddress', 'No address')}</span>}</dd>
                </div>
              </dl>
              <div className="border-t pt-3 text-xs text-muted-foreground">
                {t('dermat_purchase.vendor.totals', '{count} purchase orders worth {value}. Last PO {date}.', { count: summary.poCount, value: money(summary.totalValue), date: day(summary.lastPoDate) })}
              </div>
            </aside>

            <section className="space-y-3 lg:col-span-8">
              <SegmentedControl value={tab} onValueChange={(value) => setTab(value as Tab)} aria-label={t('dermat_purchase.vendor.tabs', 'Vendor records')}>
                {tabs.map((entry) => (
                  <SegmentedControlItem key={entry.value} value={entry.value}>
                    {entry.label}
                  </SegmentedControlItem>
                ))}
              </SegmentedControl>
              <div className="overflow-x-auto rounded-lg border bg-card">
                {tab === 'pos' ? (
                  data.pos.length ? (
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">{t('dermat_purchase.vendor.colPo', 'PO')}</th>
                          <th className="px-3 py-2 text-left font-semibold">{t('dermat_purchase.vendor.colDate', 'Date')}</th>
                          <th className="px-3 py-2 text-left font-semibold">{t('dermat_purchase.vendor.colExpected', 'Expected')}</th>
                          <th className="px-3 py-2 text-left font-semibold">{t('dermat_purchase.vendor.colFor', 'For orders')}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t('dermat_purchase.vendor.colValue', 'Value')}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t('dermat_purchase.vendor.colReceived', 'Received')}</th>
                          <th className="px-3 py-2 text-left font-semibold">{t('dermat_purchase.vendor.colStatus', 'Status')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.pos.map((po) => (
                          <tr key={po.id} className="hover:bg-muted/30">
                            <td className="px-3 py-2 font-medium">
                              <Link className="hover:underline" href={`/backend/purchase/orders/${po.id}`}>
                                {po.code}
                              </Link>
                            </td>
                            <td className="px-3 py-2 tabular-nums">{day(po.poDate)}</td>
                            <td className={`px-3 py-2 tabular-nums ${po.late ? 'font-medium text-status-error-text' : ''}`}>
                              {day(po.expectedDate)}
                              {po.late ? ` · ${t('dermat_purchase.vendor.lateTag', 'late')}` : ''}
                            </td>
                            <td className="px-3 py-2">
                              {po.orderRefs.length
                                ? po.orderRefs.map((ref, index) => (
                                    <React.Fragment key={ref.orderId}>
                                      {index ? ', ' : ''}
                                      <Link className="hover:underline" href={`/backend/orders/${ref.orderId}`}>
                                        {ref.orderNo}
                                      </Link>
                                    </React.Fragment>
                                  ))
                                : <span className="text-muted-foreground">{t('dermat_purchase.vendor.stock', 'Stock')}</span>}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{money(po.value)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{po.receivedPercent}%</td>
                            <td className="px-3 py-2">
                              <StatusBadge variant={PO_STATUS[po.status].variant}>{PO_STATUS[po.status].label}</StatusBadge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                      <ShoppingCart className="h-4 w-4" aria-hidden="true" />
                      {t('dermat_purchase.vendor.noPos', 'No purchase orders to this vendor yet.')}
                    </p>
                  )
                ) : null}
                {tab === 'grns' ? (
                  data.grns.length ? (
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">{t('dermat_purchase.vendor.colGrn', 'GRN')}</th>
                          <th className="px-3 py-2 text-left font-semibold">{t('dermat_purchase.vendor.colDate', 'Date')}</th>
                          <th className="px-3 py-2 text-left font-semibold">{t('dermat_purchase.vendor.colPo', 'PO')}</th>
                          <th className="px-3 py-2 text-left font-semibold">{t('dermat_purchase.vendor.colInvoice', 'Vendor invoice')}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t('dermat_purchase.vendor.colQc', 'QC passed / rejected')}</th>
                          <th className="px-3 py-2 text-left font-semibold">{t('dermat_purchase.vendor.colStatus', 'Status')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.grns.map((grn) => (
                          <tr key={grn.id} className="hover:bg-muted/30">
                            <td className="px-3 py-2 font-medium">
                              <Link className="hover:underline" href={`/backend/purchase/grns/${grn.id}`}>
                                {grn.code}
                              </Link>
                            </td>
                            <td className="px-3 py-2 tabular-nums">{day(grn.grnDate)}</td>
                            <td className="px-3 py-2">
                              {grn.poId ? (
                                <Link className="hover:underline" href={`/backend/purchase/orders/${grn.poId}`}>
                                  {grn.poCode}
                                </Link>
                              ) : (
                                <span className="text-muted-foreground">{t('dermat_purchase.grn.withoutPo', 'Without PO')}</span>
                              )}
                            </td>
                            <td className="px-3 py-2">{grn.invoiceNo ?? <span className="text-muted-foreground">—</span>}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {grn.passed} / <span className={grn.failed ? 'font-medium text-status-error-text' : ''}>{grn.failed}</span>
                              <span className="text-muted-foreground"> {t('dermat_purchase.vendor.ofLines', 'of {count}', { count: grn.lines })}</span>
                            </td>
                            <td className="px-3 py-2">
                              <StatusBadge variant={GRN_STATUS[grn.status].variant}>{GRN_STATUS[grn.status].label}</StatusBadge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="p-6 text-sm text-muted-foreground">{t('dermat_purchase.vendor.noGrns', 'Nothing received from this vendor yet.')}</p>
                  )
                ) : null}
                {tab === 'materials' ? (
                  data.materials.length ? (
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">{t('dermat_purchase.vendor.colMaterial', 'Material')}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t('dermat_purchase.vendor.colOrdered', 'Ordered')}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t('dermat_purchase.vendor.colReceivedQty', 'Received')}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t('dermat_purchase.vendor.colRate', 'Last rate')}</th>
                          <th className="px-3 py-2 text-left font-semibold">{t('dermat_purchase.vendor.colLast', 'Last PO')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data.materials.map((material) => (
                          <tr key={material.productId} className="hover:bg-muted/30">
                            <td className="px-3 py-2">
                              <Link className="font-medium hover:underline" href={`/backend/products/${material.productId}`}>
                                {material.title}
                              </Link>
                              {material.code ? <span className="ml-2 font-mono text-xs text-muted-foreground">{material.code}</span> : null}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{qty(material.orderedQty, material.unit)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{qty(material.receivedQty, material.unit)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {money(material.lastRate)}/{material.unit}
                            </td>
                            <td className="px-3 py-2 tabular-nums">
                              {day(material.lastPoDate)}
                              <span className="text-muted-foreground"> · {t('dermat_purchase.vendor.poCount', '{count} POs', { count: material.poCount })}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <p className="p-6 text-sm text-muted-foreground">{t('dermat_purchase.vendor.noMaterials', 'No materials bought from this vendor yet.')}</p>
                  )
                ) : null}
              </div>
            </section>
          </div>
        </div>
        <EditVendorDialog vendor={vendor} open={editOpen} onOpenChange={setEditOpen} onSaved={() => void load()} />
      </PageBody>
    </Page>
  )
}

export default VendorFile
