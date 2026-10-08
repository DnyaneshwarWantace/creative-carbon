"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, FlaskConical, PackageCheck, Plus, Search, Trash2, X } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { money, todayIso } from './shared'
import { PLACE_LABEL, receivingStoreFor } from '../../cc_products/lib/stock'

type VendorOption = { id: string; name: string; code: string | null; gstNumber: string | null }
type ProductOption = { id: string; title: string; code: string | null; kind: string; unit: string | null }
type Line = { key: string; productId: string; title: string; code: string | null; kind: string; unit: string | null; quantity: string; rate: string; gstPercent: string; lotNumber: string; mfgDate: string; expiryDate: string }

function useDebouncedSearch<T>(term: string, url: (value: string) => string): T[] {
  const [items, setItems] = React.useState<T[]>([])
  React.useEffect(() => {
    if (!term.trim()) {
      setItems([])
      return
    }
    let cancelled = false
    const handle = window.setTimeout(async () => {
      const call = await apiCall<{ items: T[] }>(url(term.trim()), undefined, { fallback: { items: [] } })
      if (!cancelled) setItems(call.result?.items ?? [])
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [term, url])
  return items
}

const vendorUrl = (value: string) => `/api/cc_purchase/vendors?q=${encodeURIComponent(value)}`
const productUrl = (value: string) => `/api/cc_products/search?kinds=chemical,reinforcement,chindi,bstage,bought_in&limit=8&q=${encodeURIComponent(value)}`

export function DirectGrnPage() {
  const t = useT()
  const router = useRouter()
  const { runMutation } = useGuardedMutation({ contextId: 'cc-grn-direct' })
  const [vendor, setVendor] = React.useState<VendorOption | null>(null)
  const [vendorSearch, setVendorSearch] = React.useState('')
  const [productSearch, setProductSearch] = React.useState('')
  const [lines, setLines] = React.useState<Line[]>([])
  const [grnDate, setGrnDate] = React.useState(todayIso())
  const [invoiceNo, setInvoiceNo] = React.useState('')
  const [invoiceDate, setInvoiceDate] = React.useState('')
  const [vehicleNo, setVehicleNo] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [notes, setNotes] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const vendorOptions = useDebouncedSearch<VendorOption>(vendorSearch, vendorUrl)
  const productOptions = useDebouncedSearch<ProductOption>(productSearch, productUrl)

  const patch = (key: string, value: Partial<Line>) => setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...value } : line)))
  const amount = (line: Line) => (Number(line.quantity) || 0) * (Number(line.rate) || 0)
  const taxable = lines.reduce((sum, line) => sum + amount(line), 0)
  const gst = lines.reduce((sum, line) => sum + (amount(line) * (Number(line.gstPercent) || 0)) / 100, 0)

  const submit = async () => {
    if (!vendor) {
      flash(t('cc_purchase.form.needVendor', 'Pick the vendor.'), 'error')
      return
    }
    if (reason.trim().length < 3) {
      flash(t('cc_purchase.direct.needReason', 'Write why the goods came without a PO.'), 'error')
      document.getElementById('direct-reason')?.focus()
      return
    }
    if (!lines.length) {
      flash(t('cc_purchase.direct.needLines', 'Add at least one material.'), 'error')
      return
    }
    const bad = lines.find((line) => !(Number(line.quantity) > 0) || !line.lotNumber.trim())
    if (bad) {
      flash(t('cc_purchase.direct.needQtyBatch', 'Enter the quantity and the vendor batch no. for every material.'), 'error')
      document.getElementById(`direct-qty-${bad.key}`)?.focus()
      return
    }
    const body = {
      vendorId: vendor.id,
      grnDate,
      invoiceNo: invoiceNo.trim() || null,
      invoiceDate: invoiceDate || null,
      vehicleNo: vehicleNo.trim() || null,
      reason: reason.trim(),
      notes: notes.trim() || null,
      lines: lines.map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        rate: Number(line.rate) || 0,
        gstPercent: Number(line.gstPercent) || 0,
        lotNumber: line.lotNumber.trim(),
        mfgDate: line.mfgDate || null,
        expiryDate: line.expiryDate || null,
      })),
    }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { vendorId: vendor.id },
        mutationPayload: body,
        operation: () => apiCall<{ id?: string; code?: string; error?: string }>('/api/cc_purchase/grns', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result?.id) {
        flash(call.result?.error ?? t('cc_purchase.grn.error', 'Could not save the GRN.'), 'error')
        return
      }
      flash(t('cc_purchase.grn.saved', '{code} saved. Material is in the store, waiting to be checked.', { code: call.result.code ?? '' }), 'success')
      router.push(`/backend/purchase/grns/${call.result.id}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Page>
      <PageBody>
        <form
          className="mx-auto flex max-w-6xl flex-col gap-6 pb-16"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void submit()
            }
            if (event.key === 'Escape') router.push('/backend/purchase/grns')
          }}
        >
          <div className="space-y-3">
            <Link href="/backend/purchase/grns" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              {t('cc_purchase.direct.back', 'Goods receiving')}
            </Link>
            <div className="space-y-1">
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_purchase.direct.title', 'Receive goods without a PO')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">{t('cc_purchase.direct.lede', 'For material that arrived without a purchase order: free samples, replacements, urgent local buys. The reason is saved on the GRN and the stock still goes through inward QC.')}</p>
            </div>
          </div>

          <Alert status="information" style="lighter" className="rounded-lg">
            <AlertTitle>{t('cc_purchase.grn.howTitle', 'Material goes into the store as "waiting for check"')}</AlertTitle>
            <AlertDescription>{t('cc_purchase.grn.howBody', 'It is counted in the store but cannot be reserved or issued until QC approves the batch. A QC check is created for every line.')}</AlertDescription>
          </Alert>

          <section className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="direct-vendor">{t('cc_purchase.form.vendor', 'Vendor')} *</Label>
              {vendor ? (
                <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div>
                    <p className="text-sm font-medium">{vendor.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">{[vendor.code, vendor.gstNumber].filter(Boolean).join(' · ') || '—'}</p>
                  </div>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setVendor(null)} aria-label={t('cc_purchase.direct.changeVendor', 'Change vendor')}>
                    <X className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input id="direct-vendor" className="pl-9" value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} placeholder={t('cc_purchase.direct.vendorSearch', 'Search vendor by name or GSTIN')} />
                  {vendorOptions.length ? (
                    <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                      {vendorOptions.map((item) => (
                        <li key={item.id}>
                          <button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => { setVendor(item); setVendorSearch('') }}>
                            <span className="truncate">{item.name}</span>
                            {item.gstNumber ? <span className="font-mono text-xs text-muted-foreground">{item.gstNumber}</span> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="direct-reason">{t('cc_purchase.direct.reason', 'Why is there no PO?')} *</Label>
              <Input id="direct-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('cc_purchase.direct.reasonPlaceholder', 'e.g. Free sample from vendor, replacement for rejected batch')} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4 md:col-span-2">
              <div className="space-y-1.5">
                <Label htmlFor="direct-date">{t('cc_purchase.grn.date', 'Received on')}</Label>
                <Input id="direct-date" type="date" value={grnDate} onChange={(event) => setGrnDate(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="direct-invoice">{t('cc_purchase.grn.invoice', 'Vendor invoice no.')}</Label>
                <Input id="direct-invoice" value={invoiceNo} onChange={(event) => setInvoiceNo(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="direct-invoice-date">{t('cc_purchase.grn.invoiceDate', 'Invoice date')}</Label>
                <Input id="direct-invoice-date" type="date" value={invoiceDate} onChange={(event) => setInvoiceDate(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="direct-vehicle">{t('cc_purchase.grn.vehicle', 'Vehicle / container no.')}</Label>
                <Input id="direct-vehicle" value={vehicleNo} onChange={(event) => setVehicleNo(event.target.value)} placeholder="GJ-07-AB-1234 / MSKU1234567" />
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold">{t('cc_purchase.grn.lines', 'What arrived')}</h2>
            </div>
            {lines.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-overline font-semibold uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="px-5 py-2.5">{t('cc_purchase.form.material', 'Material')}</th>
                      <th className="w-32 px-3 py-2.5">{t('cc_purchase.grn.qty', 'Received')}</th>
                      <th className="w-28 px-3 py-2.5">{t('cc_purchase.form.rate', 'Rate (₹)')}</th>
                      <th className="w-20 px-3 py-2.5">{t('cc_purchase.form.gst', 'GST %')}</th>
                      <th className="w-36 px-3 py-2.5">{t('cc_purchase.grn.batch', 'Vendor batch no. *')}</th>
                      <th className="w-36 px-3 py-2.5">{t('cc_purchase.grn.mfg', 'Mfg. date')}</th>
                      <th className="w-36 px-3 py-2.5">{t('cc_purchase.grn.expiry', 'Expiry')}</th>
                      <th className="w-10 px-3 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lines.map((line) => (
                      <tr key={line.key}>
                        <td className="px-5 py-3">
                          <p className="font-medium">{line.title}</p>
                          <p className="font-mono text-xs text-muted-foreground">{line.code ?? '—'} · {PLACE_LABEL[receivingStoreFor(line.kind ?? null)]}</p>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <Input id={`direct-qty-${line.key}`} aria-label={t('cc_purchase.grn.qty', 'Received')} className="h-9 text-right tabular-nums" inputMode="decimal" value={line.quantity} onChange={(event) => patch(line.key, { quantity: event.target.value })} />
                            <span className="text-xs text-muted-foreground">{line.unit ?? ''}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3"><Input aria-label={t('cc_purchase.form.rate', 'Rate (₹)')} className="h-9 text-right tabular-nums" inputMode="decimal" value={line.rate} onChange={(event) => patch(line.key, { rate: event.target.value })} /></td>
                        <td className="px-3 py-3"><Input aria-label={t('cc_purchase.form.gst', 'GST %')} className="h-9 text-right tabular-nums" inputMode="decimal" value={line.gstPercent} onChange={(event) => patch(line.key, { gstPercent: event.target.value })} /></td>
                        <td className="px-3 py-3"><Input aria-label={t('cc_purchase.grn.batch', 'Vendor batch no. *')} className="h-9 font-mono" value={line.lotNumber} onChange={(event) => patch(line.key, { lotNumber: event.target.value })} /></td>
                        <td className="px-3 py-3"><Input aria-label={t('cc_purchase.grn.mfg', 'Mfg. date')} type="date" className="h-9" value={line.mfgDate} onChange={(event) => patch(line.key, { mfgDate: event.target.value })} /></td>
                        <td className="px-3 py-3"><Input aria-label={t('cc_purchase.grn.expiry', 'Expiry')} type="date" className="h-9" value={line.expiryDate} onChange={(event) => patch(line.key, { expiryDate: event.target.value })} /></td>
                        <td className="px-3 py-3">
                          <Button type="button" variant="ghost" size="sm" onClick={() => setLines((prev) => prev.filter((entry) => entry.key !== line.key))} aria-label={t('cc_purchase.form.removeLine', 'Remove')}>
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState className="py-10" variant="subtle" title={t('cc_purchase.form.noLines', 'No materials yet')} description={t('cc_purchase.form.noLinesHint', 'Search below by internal ID or name.')} />
            )}
            <div className="border-t border-border bg-muted/30 px-5 py-4">
              <div className="relative sm:w-96">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="direct-add-material" className="pl-9" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder={t('cc_purchase.form.addMaterial', 'Add material: internal ID or name')} />
                {productOptions.length ? (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                    {productOptions.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setLines((prev) => [...prev, { key: `${item.id}-${Date.now()}`, productId: item.id, title: item.title, code: item.code, kind: item.kind, unit: item.unit, quantity: '', rate: '', gstPercent: '18', lotNumber: '', mfgDate: '', expiryDate: '' }])
                            setProductSearch('')
                          }}
                        >
                          <Plus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                          {item.code ? <span className="font-mono text-xs text-muted-foreground">{item.code}</span> : null}
                          <span className="truncate">{item.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <Label htmlFor="direct-notes">{t('cc_purchase.grn.notes', 'Notes (damage, short)')}</Label>
            <Textarea id="direct-notes" className="mt-1.5" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </section>

          <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 p-4 shadow-lg backdrop-blur">
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <FlaskConical className="h-4 w-4" aria-hidden="true" />
              {t('cc_purchase.direct.footer', '{count} batches to QC · value {value}', { count: lines.length, value: money(taxable + gst) })}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => router.push('/backend/purchase/grns')} disabled={busy}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={busy || !lines.length || !vendor}>
                <PackageCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {busy ? t('cc_purchase.grn.saving', 'Saving…') : t('cc_purchase.grn.save', 'Save GRN')}
              </Button>
            </div>
          </div>
        </form>
      </PageBody>
    </Page>
  )
}
