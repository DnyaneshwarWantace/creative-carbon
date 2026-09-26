"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Building2, Link2, Plus, Search, Send, Trash2, X } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { money, qty, todayIso, type PoView } from './shared'

type VendorOption = { id: string; name: string; code: string | null; gstNumber: string | null; contactPerson: string | null; contactPhone: string | null; address: string | null; paymentTerms: string | null }
type ProductOption = { id: string; title: string; code: string | null; kind: string; unit: string | null }
type Line = { key: string; productId: string; title: string; code: string | null; unit: string | null; quantity: string; rate: string; gstPercent: string }

const GST_RATES = ['0', '5', '12', '18', '28']

function lineAmount(line: Line): number {
  return (Number(line.quantity) || 0) * (Number(line.rate) || 0)
}

export function PurchaseOrderForm({ poId }: { poId?: string }) {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const { runMutation } = useGuardedMutation({ contextId: `dermat-po-form-${poId ?? 'new'}` })
  const [existing, setExisting] = React.useState<PoView | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [ready, setReady] = React.useState(!poId)
  const [vendor, setVendor] = React.useState<VendorOption | null>(null)
  const [vendorSearch, setVendorSearch] = React.useState('')
  const [vendorOptions, setVendorOptions] = React.useState<VendorOption[]>([])
  const [poDate, setPoDate] = React.useState(todayIso())
  const [expectedDate, setExpectedDate] = React.useState('')
  const [lines, setLines] = React.useState<Line[]>([])
  const [productSearch, setProductSearch] = React.useState('')
  const [productOptions, setProductOptions] = React.useState<ProductOption[]>([])
  const [orderRefs, setOrderRefs] = React.useState<Array<{ orderId: string; orderNo: string }>>([])
  const [notes, setNotes] = React.useState('')
  const [terms, setTerms] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    if (poId) {
      ;(async () => {
        const call = await apiCall<PoView>(`/api/dermat_purchase/orders?id=${encodeURIComponent(poId)}`)
        if (!call.ok || !call.result) {
          setLoadError(t('dermat_purchase.form.loadError', 'Could not load this purchase order.'))
          return
        }
        const po = call.result
        setExisting(po)
        const vendorCall = await apiCall<{ items: VendorOption[] }>(`/api/dermat_purchase/vendors?id=${po.vendorId}`, undefined, { fallback: { items: [] } })
        setVendor(vendorCall.result?.items?.[0] ?? { id: po.vendorId, name: po.vendorName, code: null, gstNumber: po.vendorGstin, contactPerson: null, contactPhone: null, address: null, paymentTerms: po.terms })
        setPoDate(po.poDate)
        setExpectedDate(po.expectedDate ?? '')
        setNotes(po.notes ?? '')
        setTerms(po.terms ?? '')
        setOrderRefs(po.orderRefs)
        setLines(po.lines.map((line) => ({ key: line.id, productId: line.productId, title: line.title, code: line.code, unit: line.unit, quantity: String(line.quantity), rate: String(line.rate), gstPercent: String(line.gstPercent) })))
        setReady(true)
      })()
      return
    }
    const wanted = (params?.get('items') ?? '')
      .split(',')
      .map((entry) => entry.split(':'))
      .filter(([id]) => /^[0-9a-f-]{36}$/i.test(id ?? ''))
    const refs = (params?.get('orders') ?? '')
      .split(',')
      .map((entry) => entry.split(':'))
      .filter(([id, no]) => /^[0-9a-f-]{36}$/i.test(id ?? '') && no)
      .map(([orderId, orderNo]) => ({ orderId, orderNo: decodeURIComponent(orderNo) }))
    setOrderRefs(refs)
    const presetVendor = params?.get('vendorId') ?? ''
    if (/^[0-9a-f-]{36}$/i.test(presetVendor)) {
      ;(async () => {
        const vendorCall = await apiCall<{ items: VendorOption[] }>(`/api/dermat_purchase/vendors?id=${presetVendor}`, undefined, { fallback: { items: [] } })
        const found = vendorCall.result?.items?.[0]
        if (!found) return
        setVendor(found)
        if (found.paymentTerms) setTerms((current) => current || found.paymentTerms || '')
      })()
    }
    if (!wanted.length) return
    ;(async () => {
      const call = await apiCall<{ items: ProductOption[] }>(`/api/dermat_products/search?kinds=raw_material,packing_material&limit=100&ids=${wanted.map(([id]) => id).join(',')}`, undefined, { fallback: { items: [] } })
      const found = call.result?.items ?? []
      setLines(
        wanted
          .map(([id, amount]) => {
            const product = found.find((item) => item.id === id)
            if (!product) return null
            return { key: id, productId: id, title: product.title, code: product.code, unit: product.unit, quantity: String(Math.ceil(Number(amount) || 0)), rate: '', gstPercent: '18' }
          })
          .filter((line): line is Line => Boolean(line)),
      )
    })()
  }, [poId, params, t])

  React.useEffect(() => {
    if (!vendorSearch.trim()) {
      setVendorOptions([])
      return
    }
    let cancelled = false
    const handle = window.setTimeout(async () => {
      const call = await apiCall<{ items: VendorOption[] }>(`/api/dermat_purchase/vendors?q=${encodeURIComponent(vendorSearch.trim())}`, undefined, { fallback: { items: [] } })
      if (!cancelled) setVendorOptions(call.result?.items ?? [])
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [vendorSearch])

  React.useEffect(() => {
    if (!productSearch.trim()) {
      setProductOptions([])
      return
    }
    let cancelled = false
    const handle = window.setTimeout(async () => {
      const call = await apiCall<{ items: ProductOption[] }>(`/api/dermat_products/search?kinds=raw_material,packing_material&limit=8&q=${encodeURIComponent(productSearch.trim())}`, undefined, { fallback: { items: [] } })
      if (!cancelled) setProductOptions(call.result?.items ?? [])
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [productSearch])

  const patch = (key: string, value: Partial<Line>) => setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...value } : line)))
  const subtotal = lines.reduce((sum, line) => sum + lineAmount(line), 0)
  const gst = lines.reduce((sum, line) => sum + (lineAmount(line) * (Number(line.gstPercent) || 0)) / 100, 0)

  const save = async (submit: boolean) => {
    if (!vendor) {
      flash(t('dermat_purchase.form.needVendor', 'Pick the vendor.'), 'error')
      return
    }
    const valid = lines.filter((line) => Number(line.quantity) > 0)
    if (!valid.length || valid.some((line) => line.rate === '' || Number(line.rate) < 0)) {
      flash(t('dermat_purchase.form.needLines', 'Every line needs a quantity and a rate.'), 'error')
      return
    }
    const body = {
      ...(existing ? { id: existing.id } : {}),
      vendorId: vendor.id,
      poDate,
      expectedDate: expectedDate || null,
      notes: notes.trim() || null,
      terms: terms.trim() || null,
      orderRefs,
      indentIds: existing ? [] : (params?.get('indents') ?? '').split(',').filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
      submit,
      lines: valid.map((line) => ({ productId: line.productId, quantity: Number(line.quantity), rate: Number(line.rate), gstPercent: Number(line.gstPercent) })),
    }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { poId: existing?.id ?? null },
        mutationPayload: body,
        operation: () => {
          const request = () =>
            apiCall<{ id?: string; code?: string; error?: string }>('/api/dermat_purchase/orders', {
              method: existing ? 'PUT' : 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            })
          return existing ? withScopedApiRequestHeaders(buildOptimisticLockHeader(existing.updatedAt), request) : request()
        },
      })
      if (!call.ok || !call.result?.id) {
        flash(call.result?.error ?? t('dermat_purchase.form.saveError', 'Could not save the purchase order.'), 'error')
        return
      }
      flash(submit ? t('dermat_purchase.form.sent', 'Sent for approval.') : t('dermat_purchase.form.saved', 'Saved as draft.'), 'success')
      router.push(`/backend/purchase/orders/${call.result.id}`)
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={loadError} />
        </PageBody>
      </Page>
    )
  }
  if (!ready) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dermat_purchase.form.loading', 'Loading purchase order…')} />
        </PageBody>
      </Page>
    )
  }

  const back = existing ? `/backend/purchase/orders/${existing.id}` : '/backend/purchase/orders'

  return (
    <Page>
      <PageBody>
        <form
          className="mx-auto flex max-w-6xl flex-col gap-6 pb-16"
          onSubmit={(event) => {
            event.preventDefault()
            save(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              save(true)
            }
            if (event.key === 'Escape') router.push(back)
          }}
        >
          <div className="space-y-3">
            <Link href={back} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              {existing ? existing.code : t('dermat_purchase.list.title', 'Purchase orders')}
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">{existing ? t('dermat_purchase.form.editTitle', 'Edit {code}', { code: existing.code }) : t('dermat_purchase.form.newTitle', 'New purchase order')}</h1>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-6 lg:col-span-2">
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-semibold">{t('dermat_purchase.form.vendor', 'Vendor')}</h2>
                {vendor ? (
                  <div className="mt-3 flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-4">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-card text-muted-foreground shadow-xs">
                        <Building2 className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold">{vendor.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">GSTIN {vendor.gstNumber ?? '—'}</p>
                        <p className="text-xs text-muted-foreground">{[vendor.contactPerson, vendor.contactPhone, vendor.address].filter(Boolean).join(' · ') || '—'}</p>
                      </div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setVendor(null)}>
                      {t('dermat_purchase.form.change', 'Change')}
                    </Button>
                  </div>
                ) : (
                  <div className="relative mt-3">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input id="po-vendor" className="pl-9" value={vendorSearch} onChange={(event) => setVendorSearch(event.target.value)} placeholder={t('dermat_purchase.form.vendorSearch', 'Vendor name, code or GST number')} autoFocus />
                    {vendorOptions.length ? (
                      <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                        {vendorOptions.map((option) => (
                          <li key={option.id}>
                            <button
                              type="button"
                              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
                              onClick={() => {
                                setVendor(option)
                                if (!terms && option.paymentTerms) setTerms(option.paymentTerms)
                                setVendorSearch('')
                                setVendorOptions([])
                              }}
                            >
                              <span className="truncate font-medium">{option.name}</span>
                              <span className="shrink-0 font-mono text-xs text-muted-foreground">{option.gstNumber ?? ''}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                )}
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="po-date">{t('dermat_purchase.form.poDate', 'PO date')}</Label>
                    <Input id="po-date" type="date" value={poDate} onChange={(event) => setPoDate(event.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="po-expected">{t('dermat_purchase.form.expected', 'Expected delivery')}</Label>
                    <Input id="po-expected" type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)} />
                  </div>
                </div>
              </section>

              <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <h2 className="text-sm font-semibold">{t('dermat_purchase.form.materials', 'Materials')}</h2>
                  <span className="text-xs text-muted-foreground">{t('dermat_purchase.form.materialsHint', 'Raw and packing materials only')}</span>
                </div>
                {lines.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left text-overline font-semibold uppercase tracking-widest text-muted-foreground">
                        <tr>
                          <th className="px-5 py-2.5">{t('dermat_purchase.form.material', 'Material')}</th>
                          <th className="w-32 px-3 py-2.5 text-right">{t('dermat_purchase.form.qty', 'Quantity')}</th>
                          <th className="w-32 px-3 py-2.5 text-right">{t('dermat_purchase.form.rate', 'Rate (₹)')}</th>
                          <th className="w-24 px-3 py-2.5">GST</th>
                          <th className="px-3 py-2.5 text-right">{t('dermat_purchase.form.amount', 'Amount')}</th>
                          <th className="w-10 px-3 py-2.5" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {lines.map((line) => (
                          <tr key={line.key}>
                            <td className="px-5 py-3">
                              <p className="font-medium">{line.title}</p>
                              <p className="font-mono text-xs text-muted-foreground">{line.code ?? '—'}</p>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center justify-end gap-1.5">
                                <Input id={`qty-${line.key}`} aria-label={t('dermat_purchase.form.qty', 'Quantity')} className="h-9 w-24 text-right tabular-nums" inputMode="decimal" value={line.quantity} onChange={(event) => patch(line.key, { quantity: event.target.value })} />
                                <span className="w-6 text-xs text-muted-foreground">{line.unit}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3">
                              <Input id={`rate-${line.key}`} aria-label={t('dermat_purchase.form.rate', 'Rate (₹)')} className="h-9 text-right tabular-nums" inputMode="decimal" value={line.rate} onChange={(event) => patch(line.key, { rate: event.target.value })} placeholder="0.00" />
                            </td>
                            <td className="px-3 py-3">
                              <Select value={line.gstPercent} onValueChange={(value) => patch(line.key, { gstPercent: value })}>
                                <SelectTrigger className="h-9" aria-label="GST">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {GST_RATES.map((rate) => (
                                    <SelectItem key={rate} value={rate}>
                                      {rate}%
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-3 text-right tabular-nums">{money(lineAmount(line))}</td>
                            <td className="px-3 py-3">
                              <button type="button" aria-label={t('dermat_purchase.form.remove', 'Remove')} className="text-muted-foreground hover:text-destructive" onClick={() => setLines((prev) => prev.filter((entry) => entry.key !== line.key))}>
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState className="py-10" variant="subtle" title={t('dermat_purchase.form.noLines', 'No materials yet')} description={t('dermat_purchase.form.noLinesHint', 'Search below by internal ID or name.')} />
                )}
                <div className="border-t border-border bg-muted/30 px-5 py-4">
                  <div className="relative sm:w-96">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input id="po-add-material" className="pl-9" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder={t('dermat_purchase.form.addMaterial', 'Add material: internal ID or name')} />
                    {productOptions.length ? (
                      <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                        {productOptions.map((item) => (
                          <li key={item.id}>
                            <button
                              type="button"
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                              onClick={() => {
                                setLines((prev) =>
                                  prev.some((line) => line.productId === item.id)
                                    ? prev
                                    : [...prev, { key: `${item.id}-${Date.now()}`, productId: item.id, title: item.title, code: item.code, unit: item.unit, quantity: '', rate: '', gstPercent: '18' }],
                                )
                                setProductSearch('')
                                setProductOptions([])
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

              <section className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="po-terms">{t('dermat_purchase.form.terms', 'Payment terms')}</Label>
                  <Textarea id="po-terms" rows={3} value={terms} onChange={(event) => setTerms(event.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="po-notes">{t('dermat_purchase.form.notes', 'Notes for the vendor')}</Label>
                  <Textarea id="po-notes" rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
                </div>
              </section>
            </div>

            <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-semibold">{t('dermat_purchase.form.summary', 'Summary')}</h2>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t('dermat_purchase.form.lines', 'Lines')}</dt>
                    <dd className="tabular-nums">{lines.length}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t('dermat_purchase.form.subtotal', 'Before GST')}</dt>
                    <dd className="tabular-nums">{money(subtotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">GST</dt>
                    <dd className="tabular-nums">{money(gst)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
                    <dt>{t('dermat_purchase.form.total', 'Total')}</dt>
                    <dd className="tabular-nums">{money(subtotal + gst)}</dd>
                  </div>
                </dl>
                <div className="mt-5 flex flex-col gap-2">
                  <Button type="submit" disabled={busy}>
                    <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {existing?.status === 'pending_approval' ? t('dermat_purchase.form.saveSent', 'Save (stays with approver)') : t('dermat_purchase.form.submit', 'Send for approval')}
                  </Button>
                  {existing?.status !== 'pending_approval' ? (
                    <Button type="button" variant="outline" disabled={busy} onClick={() => save(false)}>
                      {t('dermat_purchase.form.draft', 'Save as draft')}
                    </Button>
                  ) : null}
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="flex items-center gap-2 text-sm font-semibold">
                  <Link2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {t('dermat_purchase.form.forOrders', 'For customer orders')}
                </h2>
                {orderRefs.length ? (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {orderRefs.map((ref) => (
                      <li key={ref.orderId} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1 font-mono text-xs">
                        {ref.orderNo}
                        <button type="button" aria-label={t('dermat_purchase.form.remove', 'Remove')} onClick={() => setOrderRefs((prev) => prev.filter((entry) => entry.orderId !== ref.orderId))} className="text-muted-foreground hover:text-foreground">
                          <X className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">{t('dermat_purchase.form.noOrders', 'Stock purchase (not tied to an order). POs raised from the planning board link their orders here.')}</p>
                )}
              </section>
              {lines.length ? (
                <p className="px-1 text-xs text-muted-foreground">
                  {t('dermat_purchase.form.footer', '{count} lines · {qty} total quantity', { count: lines.length, qty: qty(lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)) })}
                </p>
              ) : null}
            </aside>
          </div>
        </form>
      </PageBody>
    </Page>
  )
}

export default PurchaseOrderForm
