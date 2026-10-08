"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronDown, Copy, CopyPlus, Globe2, History, Lock, MapPin, Package, Plus, Trash2, UserRound, Zap } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Notice } from '@open-mercato/ui/primitives/Notice'
import { Popover, PopoverContent, PopoverTrigger } from '@open-mercato/ui/primitives/popover'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { PageLoading } from '../../cc_ui/components/PageLoading'
import { Dropdown } from '../../cc_lists/components/Dropdown'
import { useListOptions } from '../../cc_lists/components/useListOptions'
import { usePaymentTerms } from '../../cc_lists/components/usePaymentTerms'
import { priceOrder } from '../lib/pricing'
import { SearchPicker, type PickerOption } from './SearchPicker'
import { formatDate, formatQty, todayIso } from './format'
import { loadAddresses, loadCustomer, loadCustomerOrders, loadProductSpecs, searchCustomers, searchFinishedGoods, type CustomerAddress } from './loaders'
import type { Customer, Order, OrderListItem, ProductInfo } from './types'

type Specs = { material: Record<string, string>; packing: Record<string, string> }

type LineDraft = {
  key: string
  product: ProductInfo | null
  quantity: string
  rate: string
  gstPercent: string
  discountPercent: string
  specs: Specs
  showPacking: boolean
}

type Header = {
  orderDate: string
  deliveryDate: string
  validUntil: string
  customerPoRef: string
  orderType: 'new' | 'repeat' | 'revision'
  sourceOrderId: string | null
  salesManager: string
  paymentTerms: string
  paymentRemarks: string
  market: 'domestic' | 'export'
  incoterm: string
  portOfLoading: string
  country: string
  currency: string
  productRemarks: string
  packingRemarks: string
  billingRemarks: string
  pricesIncludeGst: boolean
  priority: 'normal' | 'urgent'
  billingAddress: string
  shippingAddress: string
  revisionNote: string
}

type SourceRecord = Order & { validUntil?: string | null; enquiryId?: string | null }

const MOULDED_FORMS = ['Moulded part']
const GST_RATES = ['0', '5', '12', '18', '28']

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function emptyHeader(): Header {
  return {
    orderDate: todayIso(),
    deliveryDate: '',
    validUntil: '',
    customerPoRef: '',
    orderType: 'new',
    sourceOrderId: null,
    salesManager: '',
    paymentTerms: '',
    paymentRemarks: '',
    market: 'domestic',
    incoterm: '',
    portOfLoading: '',
    country: '',
    currency: '',
    productRemarks: '',
    packingRemarks: '',
    billingRemarks: '',
    pricesIncludeGst: false,
    priority: 'normal',
    billingAddress: '',
    shippingAddress: '',
    revisionNote: '',
  }
}

let lineSeq = 0
function newLine(partial?: Partial<LineDraft>): LineDraft {
  lineSeq += 1
  return { key: `l${lineSeq}`, product: null, quantity: '', rate: '', gstPercent: '18', discountPercent: '', specs: { material: {}, packing: {} }, showPacking: false, ...partial }
}

function toNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function linesFrom(order: SourceRecord): LineDraft[] {
  return order.lines.map((line) =>
    newLine({
      product: line.product,
      quantity: String(line.quantity),
      rate: line.rate == null ? '' : String(line.rate),
      gstPercent: String(line.gstPercent ?? 18),
      discountPercent: line.discountPercent ? String(line.discountPercent) : '',
      specs: { material: { ...(line.specs?.material ?? {}) }, packing: { ...(line.specs?.packing ?? {}) } },
      showPacking: Object.values(line.specs?.packing ?? {}).some((value) => value),
    }),
  )
}

function headerFrom(order: SourceRecord, keepIdentity: boolean): Header {
  return {
    ...emptyHeader(),
    ...(keepIdentity
      ? { orderDate: order.orderDate, deliveryDate: order.deliveryDate ?? '', validUntil: order.validUntil ?? '', customerPoRef: order.customerPoRef ?? '', orderType: order.orderType, sourceOrderId: order.sourceOrderId }
      : { orderType: 'repeat' as const, sourceOrderId: order.id }),
    salesManager: order.salesManager ?? '',
    paymentTerms: order.paymentTerms ?? '',
    paymentRemarks: order.paymentRemarks ?? '',
    market: order.market ?? 'domestic',
    incoterm: order.incoterm ?? '',
    portOfLoading: order.portOfLoading ?? '',
    country: order.country ?? '',
    currency: order.market === 'export' ? (order.currency ?? '') : '',
    productRemarks: order.productRemarks ?? '',
    packingRemarks: order.packingRemarks ?? '',
    billingRemarks: order.billingRemarks ?? '',
    pricesIncludeGst: order.pricesIncludeGst ?? false,
    priority: order.priority ?? 'normal',
    billingAddress: order.billingAddress ?? '',
    shippingAddress: order.shippingAddress ?? '',
  }
}

function Section({ icon, title, hint, actions, children }: { icon: React.ReactNode; title: string; hint?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card shadow-xs">
      <header className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 text-primary">{icon}</span>
          <div>
            <h2 className="text-sm font-semibold">{title}</h2>
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          </div>
        </div>
        {actions}
      </header>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  )
}

function Field({ label, required, hint, error, children, className, htmlFor }: { label: string; required?: boolean; hint?: string; error?: string; children: React.ReactNode; className?: string; htmlFor?: string }) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="text-status-error-text"> *</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-status-error-text">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

function ListDropdown({ listKey, value, onChange, placeholder, id }: { listKey: string; value: string; onChange: (value: string) => void; placeholder?: string; id?: string }) {
  const options = useListOptions(listKey, value)
  return (
    <Dropdown id={id} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}>
      <option value="">—</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </Dropdown>
  )
}

function Segmented<T extends string>({ value, options, onChange, ariaLabel }: { value: T; options: Array<{ value: T; label: string; icon?: React.ReactNode }>; onChange: (value: T) => void; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex w-full rounded-lg border bg-muted/40 p-0.5 sm:w-auto">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn('inline-flex min-h-8 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm transition-colors sm:flex-none', value === option.value ? 'bg-background font-medium text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground')}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}

type RateOption = { id: string; sizeClass: string; grade: string; ratePerKg: number; currency: string }

function RateSuggestions({ grade, thickness, currency, onPick }: { grade: string; thickness: string; currency: string; onPick: (rate: string) => void }) {
  const t = useT()
  const [rates, setRates] = React.useState<RateOption[] | null>(null)
  React.useEffect(() => {
    if (!grade.trim()) {
      setRates(null)
      return
    }
    let cancelled = false
    const params = new URLSearchParams({ grade: grade.trim(), currency: currency || 'INR' })
    if (thickness.trim() && Number.isFinite(Number(thickness))) params.set('thickness', thickness.trim())
    apiCall<{ items: RateOption[] }>(`/api/cc_crm/rates?${params.toString()}`).then((call) => {
      if (!cancelled) setRates(call.ok ? (call.result?.items ?? []) : null)
    })
    return () => {
      cancelled = true
    }
  }, [grade, thickness, currency])
  if (!rates) return null
  if (!rates.length) return <p className="text-xs text-muted-foreground">{t('cc_orders.form.noRate', 'No price-list rate for this grade')}</p>
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-xs text-muted-foreground">{t('cc_orders.form.priceList', 'Price list:')}</span>
      {rates.slice(0, 3).map((rate) => (
        <button key={rate.id} type="button" onClick={() => onPick(String(rate.ratePerKg))} className="rounded-full border bg-background px-2 py-0.5 text-xs hover:border-primary hover:text-primary">
          {rate.sizeClass === 'big' ? t('cc_orders.form.big', 'Big') : t('cc_orders.form.small', 'Small')} {rate.ratePerKg}
        </button>
      ))}
    </div>
  )
}

function money(value: number, currency: string): string {
  const symbol = currency === 'INR' ? '₹' : `${currency} `
  return `${symbol}${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
}

export function CcOrderForm({ orderId, copyFrom, customerId, quotationId, quotation, enquiryId }: { orderId?: string; copyFrom?: string; customerId?: string; quotationId?: string; quotation?: boolean; enquiryId?: string }) {
  const t = useT()
  const router = useRouter()
  const isQuote = Boolean(quotation || quotationId)
  const { runMutation } = useGuardedMutation({ contextId: isQuote ? `cc-quotation-${quotationId ?? 'new'}` : `cc-order-${orderId ?? 'new'}` })
  const [customer, setCustomer] = React.useState<Customer | null>(null)
  const [header, setHeader] = React.useState<Header>(emptyHeader)
  const [lines, setLines] = React.useState<LineDraft[]>(() => [newLine()])
  const [existing, setExisting] = React.useState<SourceRecord | null>(null)
  const [linkedEnquiryId, setLinkedEnquiryId] = React.useState<string | null>(enquiryId ?? null)
  const [loading, setLoading] = React.useState(Boolean(orderId || copyFrom || quotationId))
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [errors, setErrors] = React.useState<{ customer?: string; header: Record<string, string>; rows: Record<string, string> }>({ header: {}, rows: {} })
  const [previous, setPrevious] = React.useState<OrderListItem[]>([])
  const [addresses, setAddresses] = React.useState<CustomerAddress[]>([])
  const [sameShipping, setSameShipping] = React.useState(true)
  const termOptions = usePaymentTerms(header.paymentTerms)

  const patchHeader = (patch: Partial<Header>) => setHeader((prev) => ({ ...prev, ...patch }))
  const patchLine = (key: string, patch: Partial<LineDraft>) => setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  const setSpec = (key: string, section: keyof Specs, field: string, value: string) =>
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, specs: { ...line.specs, [section]: { ...line.specs[section], [field]: value } } } : line)))

  React.useEffect(() => {
    const sourceId = quotationId ?? orderId ?? copyFrom
    if (!sourceId) return
    let cancelled = false
    const url = quotationId ? `/api/cc_crm/quotations?id=${encodeURIComponent(sourceId)}` : `/api/cc_orders/orders?id=${encodeURIComponent(sourceId)}`
    apiCall<SourceRecord>(url).then(async (call) => {
      if (cancelled) return
      if (!call.ok || !call.result) {
        setLoadError(isQuote ? t('cc_crm.errors.loadQuote', 'Could not load the quotation.') : t('cc_orders.errors.load', 'Could not load the order.'))
        setLoading(false)
        return
      }
      const source = call.result
      const fresh = source.customer ?? (await loadCustomer(source.customerId))
      if (cancelled) return
      setCustomer(fresh)
      const keep = Boolean(orderId || quotationId)
      if (keep) setExisting(source)
      if (quotationId) setLinkedEnquiryId(source.enquiryId ?? null)
      const nextHeader = headerFrom(source, keep)
      setHeader(nextHeader)
      setSameShipping(!nextHeader.shippingAddress || nextHeader.shippingAddress === nextHeader.billingAddress)
      setLines(linesFrom(source))
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [orderId, copyFrom, quotationId, isQuote, t])

  React.useEffect(() => {
    if (isQuote && !quotationId) setHeader((prev) => (prev.validUntil ? prev : { ...prev, validUntil: addDays(prev.orderDate, 30) }))
  }, [isQuote, quotationId])

  const applyCustomer = React.useCallback((value: Customer) => {
    setCustomer(value)
    setErrors((prev) => ({ ...prev, customer: undefined }))
    setHeader((prev) => ({ ...prev, salesManager: prev.salesManager || value.salesManager || '', paymentTerms: prev.paymentTerms || value.paymentTerms || '', paymentRemarks: prev.paymentRemarks || value.paymentRemarks || '' }))
  }, [])

  React.useEffect(() => {
    if (!customerId || orderId || copyFrom || quotationId) return
    let cancelled = false
    loadCustomer(customerId).then((value) => {
      if (!cancelled && value) applyCustomer(value)
    })
    return () => {
      cancelled = true
    }
  }, [customerId, orderId, copyFrom, quotationId, applyCustomer])

  React.useEffect(() => {
    if (!customer) {
      setAddresses([])
      setPrevious([])
      return
    }
    let cancelled = false
    loadAddresses(customer.id).then((list) => {
      if (cancelled) return
      setAddresses(list)
      const billing = list.find((entry) => entry.purpose === 'billing') ?? list[0]
      const shipping = list.find((entry) => entry.purpose === 'shipping')
      setHeader((prev) => ({ ...prev, billingAddress: prev.billingAddress || billing?.text || '', shippingAddress: prev.shippingAddress || shipping?.text || '' }))
      if (shipping && shipping.text !== billing?.text) setSameShipping(false)
    })
    if (!orderId && !quotationId) {
      loadCustomerOrders(customer.id).then((items) => {
        if (!cancelled) setPrevious(items.filter((item) => item.status !== 'cancelled'))
      })
    }
    return () => {
      cancelled = true
    }
  }, [customer, orderId, quotationId])

  const pickProduct = async (key: string, option: PickerOption<ProductInfo>) => {
    patchLine(key, { product: option.value })
    setErrors((prev) => ({ ...prev, rows: Object.fromEntries(Object.entries(prev.rows).filter(([row]) => row !== key)) }))
    const details = await loadProductSpecs(option.id)
    const { __test_standard: standard, ...material } = details.specs
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line
        const mergedMaterial = { ...material, ...Object.fromEntries(Object.entries(line.specs.material).filter(([, value]) => value)) }
        const mergedPacking = standard && !line.specs.packing.test_standard ? { ...line.specs.packing, test_standard: standard } : line.specs.packing
        return { ...line, specs: { material: mergedMaterial, packing: mergedPacking } }
      }),
    )
  }

  const locked = existing?.linesLocked ?? false
  const currency = header.market === 'export' ? header.currency || 'USD' : 'INR'
  const priced = (line: LineDraft) => ({ quantity: toNumber(line.quantity) ?? 0, rate: toNumber(line.rate), gstPercent: header.market === 'export' ? 0 : (toNumber(line.gstPercent) ?? 18), discountPercent: toNumber(line.discountPercent) ?? 0 })
  const filled = lines.filter((line) => line.product || line.quantity.trim())
  const totals = priceOrder(filled.filter((line) => line.product).map(priced), header.pricesIncludeGst)
  const unitOf = (line: LineDraft) => (line.product?.unit === 'nos' ? 'pcs' : 'kg')
  const totalKg = filled.filter((line) => unitOf(line) === 'kg').reduce((sum, line) => sum + (toNumber(line.quantity) ?? 0), 0)
  const totalPcs = filled.filter((line) => unitOf(line) === 'pcs').reduce((sum, line) => sum + (toNumber(line.quantity) ?? 0), 0)

  const backHref = isQuote
    ? existing
      ? `/backend/crm/quotations/${existing.id}`
      : linkedEnquiryId
        ? `/backend/crm/enquiries/${linkedEnquiryId}`
        : '/backend/crm/quotations'
    : existing
      ? `/backend/orders/${existing.id}`
      : '/backend/orders'

  const validate = (): boolean => {
    const headerErrors: Record<string, string> = {}
    const rowErrors: Record<string, string> = {}
    if (!header.orderDate) headerErrors.orderDate = t('cc_orders.errors.orderDate', 'Enter the date.')
    if (header.deliveryDate && header.deliveryDate < header.orderDate) headerErrors.deliveryDate = t('cc_orders.errors.delivery', 'Delivery date is before the order date.')
    if (isQuote && header.validUntil && header.validUntil < header.orderDate) headerErrors.validUntil = t('cc_crm.errors.validUntil', '"Valid until" is before the quotation date.')
    if (header.market === 'export' && !header.currency) headerErrors.currency = t('cc_orders.errors.currency', 'Pick the currency for an export order.')
    if (header.market === 'export' && !header.incoterm) headerErrors.incoterm = t('cc_orders.errors.incoterm', 'Pick the incoterm.')
    if (existing && !isQuote && !header.revisionNote.trim()) headerErrors.revisionNote = t('cc_orders.errors.revisionNote', 'Write what changed and why.')
    for (const line of filled) {
      if (!line.product) rowErrors[line.key] = t('cc_orders.errors.product', 'Pick the item')
      else if (!((toNumber(line.quantity) ?? 0) > 0)) rowErrors[line.key] = t('cc_orders.errors.quantityPositive', 'Enter the quantity')
      else if (line.rate.trim() && (toNumber(line.rate) ?? -1) < 0) rowErrors[line.key] = t('cc_orders.errors.rate', 'Rate cannot be negative')
      else if ((toNumber(line.discountPercent) ?? 0) > 100) rowErrors[line.key] = t('cc_orders.errors.discount', 'Discount is more than 100%')
    }
    const customerError = customer ? undefined : t('cc_orders.errors.customer', 'Pick the customer')
    setErrors({ customer: customerError, header: headerErrors, rows: rowErrors })
    if (!filled.length) {
      flash(t('cc_orders.errors.noLines', 'Add at least one item.'), 'error')
      return false
    }
    if (customerError || Object.keys(headerErrors).length || Object.keys(rowErrors).length) {
      flash(t('cc_orders.errors.fix', 'Some fields need fixing.'), 'error')
      return false
    }
    return true
  }

  const save = async () => {
    if (saving || !validate() || !customer) return
    const { revisionNote, validUntil, ...headerFields } = header
    const body = {
      ...headerFields,
      ...(existing && !isQuote ? { revisionNote: revisionNote.trim() || null } : {}),
      ...(isQuote ? { validUntil: validUntil || null, enquiryId: linkedEnquiryId } : {}),
      currency: header.market === 'export' ? header.currency : 'INR',
      incoterm: header.market === 'export' ? header.incoterm || null : null,
      portOfLoading: header.market === 'export' ? header.portOfLoading || null : null,
      country: header.market === 'export' ? header.country || null : null,
      deliveryDate: header.deliveryDate || null,
      billingAddress: header.billingAddress || null,
      shippingAddress: (sameShipping ? header.billingAddress : header.shippingAddress) || null,
      customerId: customer.id,
      lines: filled.map((line) => ({
        productId: line.product!.id,
        quantity: toNumber(line.quantity),
        rate: toNumber(line.rate),
        gstPercent: header.market === 'export' ? 0 : (toNumber(line.gstPercent) ?? 18),
        discountPercent: toNumber(line.discountPercent) ?? 0,
        specs: line.specs,
      })),
    }
    setSaving(true)
    try {
      const payload = existing ? { ...body, id: existing.id } : body
      const call = await runMutation({
        context: { recordId: existing?.id ?? null },
        mutationPayload: payload,
        operation: () => {
          const request = () =>
            apiCall<{ id?: string; orderNo?: string; quoteNo?: string; error?: string; rows?: Record<string, string> }>(isQuote ? '/api/cc_crm/quotations' : '/api/cc_orders/orders', {
              method: existing ? 'PUT' : 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            })
          return existing ? withScopedApiRequestHeaders(buildOptimisticLockHeader(existing.updatedAt), request) : request()
        },
      })
      if (!call.ok) {
        const rows = call.result?.rows ?? {}
        if (Object.keys(rows).length) setErrors((prev) => ({ ...prev, rows: Object.fromEntries(Object.entries(rows).map(([index, message]) => [filled[Number(index) - 1]?.key ?? index, message])) }))
        flash(call.status === 409 && (!call.result?.error || call.result.error === 'record_modified') ? t('cc_orders.errors.conflict', 'Someone else changed this. Reload to see the latest.') : (call.result?.error ?? t('cc_orders.errors.save', 'Could not save.')), 'error')
        return
      }
      if (isQuote) {
        flash(existing ? t('cc_crm.flash.quoteSaved', 'Quotation saved') : t('cc_crm.flash.quoteCreated', 'Quotation {no} made', { no: call.result?.quoteNo ?? '' }), 'success')
        router.push(`/backend/crm/quotations/${existing?.id ?? call.result?.id}`)
      } else {
        flash(existing ? t('cc_orders.flash.saved', 'Order saved') : t('cc_orders.flash.created', 'Order {no} booked', { no: call.result?.orderNo ?? '' }), 'success')
        router.push(`/backend/orders/${existing?.id ?? call.result?.id}`)
      }
    } catch {
      flash(t('cc_orders.errors.save', 'Could not save.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loadError) return <Page><PageBody><ErrorMessage label={loadError} /></PageBody></Page>
  if (loading) return <Page><PageBody><PageLoading label={isQuote ? t('cc_crm.loadingQuote', 'Loading quotation…') : t('cc_orders.loading', 'Loading order…')} /></PageBody></Page>

  const title = isQuote
    ? existing
      ? t('cc_crm.form.editTitle', 'Edit quotation {no}', { no: existing.orderNo })
      : t('cc_crm.form.newTitle', 'New quotation')
    : existing
      ? t('cc_orders.form.editTitle', 'Edit order {no}', { no: existing.orderNo })
      : header.orderType === 'repeat'
        ? t('cc_orders.form.repeatTitle', 'Repeat order')
        : t('cc_orders.form.newTitle', 'Book a new order')
  const saveLabel = isQuote ? t('cc_crm.form.save', 'Save quotation') : existing ? t('cc_orders.form.save', 'Save order') : t('cc_orders.form.book', 'Book order')

  return (
    <Page>
      <PageBody>
        <form
          className="mx-auto max-w-7xl pb-28 lg:pb-10"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void save()
            }
            if (event.key === 'Escape' && !(event.target instanceof HTMLElement && event.target.closest('[role="listbox"],[role="dialog"]'))) router.push(backHref)
          }}
        >
          <div className="mb-5 flex items-start gap-3">
            <Button asChild variant="ghost" size="icon" className="mt-0.5 shrink-0" aria-label={t('common.back', 'Back')}>
              <Link href={backHref}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{isQuote ? t('cc_crm.form.eyebrow', 'Quotation') : t('cc_orders.form.eyebrow', 'Sales order')}</p>
              <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {isQuote
                  ? t('cc_crm.form.subtitle', 'The number is given when you save. "Convert to order" later carries everything across.')
                  : t('cc_orders.form.subtitleCc', 'The order number is given when you save. It then waits at "Advance / LC" until Accounts confirms.')}
              </p>
            </div>
          </div>

          {locked ? (
            <div className="mb-5">
              <Notice variant="warning" title={t('cc_orders.form.lockedTitle', 'Items are locked')} message={t('cc_orders.form.lockedBody', 'Stock is allocated to this order, so items and quantities cannot change. Terms, dates and remarks still can.')} />
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="space-y-5 lg:col-span-2">
              <Section icon={<UserRound className="h-4 w-4" />} title={t('cc_orders.form.customerTitle', 'Customer & terms')}>
                <Field label={t('cc_orders.form.customer', 'Customer')} required error={errors.customer}>
                  <SearchPicker
                    value={customer ? { id: customer.id, primary: customer.name, value: customer } : null}
                    placeholder={t('cc_orders.form.customerPick', 'Search customer by name')}
                    searchPlaceholder={t('cc_orders.form.customerSearch', 'Type a customer name')}
                    load={searchCustomers}
                    onSelect={(option) => applyCustomer(option.value)}
                    invalid={Boolean(errors.customer)}
                    disabled={Boolean(existing) && !isQuote}
                    footer={
                      <Link href="/backend/customers/companies/create" target="_blank" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <Plus className="h-3 w-3" />
                        {t('cc_orders.form.newCustomer', 'Add a new customer (opens in a new tab)')}
                      </Link>
                    }
                  />
                  {customer ? (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{customer.gstin ? `GSTIN ${customer.gstin}` : t('cc_orders.form.noGst', 'No GSTIN')}</span>
                      {customer.phone ? <span className="rounded-md bg-muted px-2 py-0.5 text-xs">{customer.phone}</span> : null}
                      <Link href={`/backend/customers/companies/${customer.id}`} target="_blank" className="text-xs text-primary hover:underline">
                        {t('cc_orders.form.openCustomer', 'Open customer')}
                      </Link>
                    </div>
                  ) : null}
                </Field>

                {customer && !existing && previous.length ? (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="w-full justify-start sm:w-auto">
                        <History className="mr-1.5 h-4 w-4" />
                        {t('cc_orders.form.repeatPick', 'Copy a previous order ({count})', { count: previous.length })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-80 p-0 sm:w-96">
                      <ul className="max-h-72 divide-y overflow-auto text-sm">
                        {previous.map((item) => (
                          <li key={item.id}>
                            <button type="button" className="w-full px-3 py-2 text-left hover:bg-muted" onClick={() => router.push(`/backend/orders/new?copyFrom=${item.id}`)}>
                              <span className="font-mono text-xs">{item.orderNo}</span>
                              <span className="ml-2 text-xs text-muted-foreground">{formatDate(item.orderDate)}</span>
                              <span className="block truncate text-xs">{item.products.map((product) => `${product.title} × ${formatQty(product.quantity, 0)}`).join(', ')}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </PopoverContent>
                  </Popover>
                ) : null}

                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <Field label={isQuote ? t('cc_crm.form.quoteDate', 'Quotation date') : t('cc_orders.form.orderDate', 'Order date')} required error={errors.header.orderDate} htmlFor="o-date">
                    <Input id="o-date" type="date" value={header.orderDate} onChange={(event) => patchHeader({ orderDate: event.target.value })} />
                  </Field>
                  {isQuote ? (
                    <Field label={t('cc_crm.form.validUntil', 'Valid until')} error={errors.header.validUntil} htmlFor="o-valid">
                      <Input id="o-valid" type="date" value={header.validUntil} onChange={(event) => patchHeader({ validUntil: event.target.value })} />
                    </Field>
                  ) : null}
                  <Field label={t('cc_orders.form.deliveryDate', 'Delivery by')} error={errors.header.deliveryDate} htmlFor="o-delivery">
                    <Input id="o-delivery" type="date" value={header.deliveryDate} onChange={(event) => patchHeader({ deliveryDate: event.target.value })} />
                  </Field>
                  <Field label={t('cc_orders.form.poRef', 'Customer PO / ref')} htmlFor="o-po">
                    <Input id="o-po" value={header.customerPoRef} onChange={(event) => patchHeader({ customerPoRef: event.target.value })} placeholder="PO-2291" />
                  </Field>
                  <Field label={t('cc_orders.form.salesManager', 'Sales person')} htmlFor="o-sales">
                    <Input id="o-sales" value={header.salesManager} onChange={(event) => patchHeader({ salesManager: event.target.value })} />
                  </Field>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                  <Field label={t('cc_orders.form.market', 'Market')}>
                    <Segmented
                      value={header.market}
                      ariaLabel={t('cc_orders.form.market', 'Market')}
                      onChange={(value) => patchHeader({ market: value })}
                      options={[
                        { value: 'domestic', label: t('cc_orders.form.domestic', 'Domestic'), icon: <MapPin className="h-3.5 w-3.5" /> },
                        { value: 'export', label: t('cc_orders.form.export', 'Export'), icon: <Globe2 className="h-3.5 w-3.5" /> },
                      ]}
                    />
                  </Field>
                  {!isQuote ? (
                    <Field label={t('cc_orders.form.priority', 'Priority')}>
                      <Segmented
                        value={header.priority}
                        ariaLabel={t('cc_orders.form.priority', 'Priority')}
                        onChange={(value) => patchHeader({ priority: value })}
                        options={[
                          { value: 'normal', label: t('cc_orders.priority.normal', 'Normal') },
                          { value: 'urgent', label: t('cc_orders.priority.urgent', 'Urgent'), icon: <Zap className="h-3.5 w-3.5" /> },
                        ]}
                      />
                    </Field>
                  ) : null}
                </div>

                {header.market === 'export' ? (
                  <div className="grid grid-cols-2 gap-4 rounded-lg border border-dashed p-3 md:grid-cols-4">
                    <Field label={t('cc_orders.form.incoterm', 'Incoterm')} required error={errors.header.incoterm}>
                      <ListDropdown listKey="incoterms" value={header.incoterm} onChange={(value) => patchHeader({ incoterm: value })} />
                    </Field>
                    <Field label={t('cc_orders.form.currency', 'Currency')} required error={errors.header.currency}>
                      <ListDropdown listKey="currencies" value={header.currency} onChange={(value) => patchHeader({ currency: value })} />
                    </Field>
                    <Field label={t('cc_orders.form.port', 'Port of loading')}>
                      <ListDropdown listKey="ports" value={header.portOfLoading} onChange={(value) => patchHeader({ portOfLoading: value })} />
                    </Field>
                    <Field label={t('cc_orders.form.country', 'Country')} htmlFor="o-country">
                      <Input id="o-country" value={header.country} onChange={(event) => patchHeader({ country: event.target.value })} />
                    </Field>
                  </div>
                ) : null}

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label={t('cc_orders.form.paymentTerms', 'Payment terms')}>
                    <Dropdown value={header.paymentTerms} onChange={(event) => patchHeader({ paymentTerms: event.target.value })}>
                      <option value="">—</option>
                      {termOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Dropdown>
                  </Field>
                  <Field label={t('cc_orders.form.paymentRemarks', 'Payment remarks')} htmlFor="o-payrem">
                    <Input id="o-payrem" value={header.paymentRemarks} onChange={(event) => patchHeader({ paymentRemarks: event.target.value })} placeholder={t('cc_orders.form.paymentRemarksHint', 'e.g. 40% advance, balance before despatch')} />
                  </Field>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {(['billingAddress', 'shippingAddress'] as const).map((key) => {
                    const isShipping = key === 'shippingAddress'
                    if (isShipping && sameShipping) {
                      return (
                        <Field key={key} label={t('cc_orders.form.shippingAddress', 'Ship to')}>
                          <label className="flex min-h-9 items-center gap-2 rounded-md border border-dashed px-3 text-sm text-muted-foreground">
                            <input type="checkbox" className="h-4 w-4 rounded-sm border-input" checked onChange={() => setSameShipping(false)} />
                            {t('cc_orders.form.sameAsBilling', 'Same as bill-to address')}
                          </label>
                        </Field>
                      )
                    }
                    return (
                      <Field key={key} label={isShipping ? t('cc_orders.form.shippingAddress', 'Ship to') : t('cc_orders.form.billingAddress', 'Bill to')}>
                        {addresses.length ? (
                          <Dropdown value={header[key]} onChange={(event) => patchHeader({ [key]: event.target.value } as Partial<Header>)} placeholder={t('cc_orders.form.pickAddress', 'Pick an address')}>
                            <option value="">—</option>
                            {addresses.map((entry) => (
                              <option key={entry.id} value={entry.text}>
                                {entry.text}
                              </option>
                            ))}
                            {header[key] && !addresses.some((entry) => entry.text === header[key]) ? <option value={header[key]}>{header[key]}</option> : null}
                          </Dropdown>
                        ) : (
                          <Textarea rows={2} value={header[key]} onChange={(event) => patchHeader({ [key]: event.target.value } as Partial<Header>)} placeholder={customer ? t('cc_orders.form.noAddresses', 'No saved address. Type it here.') : t('cc_orders.form.pickCustomerFirst', 'Pick the customer first')} />
                        )}
                        {isShipping ? (
                          <button type="button" className="text-xs text-primary hover:underline" onClick={() => setSameShipping(true)}>
                            {t('cc_orders.form.useBilling', 'Same as bill-to address')}
                          </button>
                        ) : null}
                      </Field>
                    )
                  })}
                </div>
              </Section>

              <Section
                icon={<Package className="h-4 w-4" />}
                title={t('cc_orders.form.itemsTitle', 'Items ({count})', { count: filled.length })}
                hint={t('cc_orders.form.itemsHint', 'Picking an item fills its grade, weave, size and thickness. Rates are per kg (per piece for moulded parts).')}
                actions={
                  header.market === 'domestic' ? (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                      <input type="checkbox" className="h-3.5 w-3.5 rounded-sm border-input" checked={header.pricesIncludeGst} onChange={(event) => patchHeader({ pricesIncludeGst: event.target.checked })} />
                      {t('cc_orders.form.includesGst', 'Rates include GST')}
                    </label>
                  ) : null
                }
              >
                {lines.map((line, index) => {
                  const material = line.specs.material
                  const unit = unitOf(line)
                  const lineTotal = priceOrder([priced(line)], header.pricesIncludeGst)
                  const isMoulded = MOULDED_FORMS.includes(material.form ?? '') || line.product?.kind === 'moulded' || Boolean(material.die_no)
                  const error = errors.rows[line.key]
                  return (
                    <article key={line.key} className={cn('rounded-lg border', error ? 'border-status-error-border' : 'border-border')}>
                      <div className="flex items-start gap-2 border-b bg-muted/30 px-3 py-2.5">
                        <span className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-background text-xs font-semibold tabular-nums">{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <SearchPicker
                            value={line.product ? { id: line.product.id, primary: line.product.title, tag: line.product.code, value: line.product } : null}
                            placeholder={t('cc_orders.form.productPick', 'Search item by name or code')}
                            searchPlaceholder={t('cc_orders.form.productSearch', 'e.g. F2F3 10x10, Fabric sheet, Bush 1155')}
                            load={searchFinishedGoods}
                            onSelect={(option) => void pickProduct(line.key, option)}
                            disabled={locked}
                            invalid={Boolean(error && !line.product)}
                            footer={
                              <Link href="/backend/products" target="_blank" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                <Plus className="h-3 w-3" />
                                {t('cc_orders.form.newProduct', 'Add a new item (opens in a new tab)')}
                              </Link>
                            }
                          />
                          {error ? <p className="mt-1 text-xs text-status-error-text">{error}</p> : null}
                        </div>
                        {!locked ? (
                          <div className="flex shrink-0">
                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={t('cc_orders.form.duplicateLine', 'Duplicate item')} onClick={() => setLines((prev) => [...prev.slice(0, index + 1), newLine({ ...line, key: undefined, specs: { material: { ...line.specs.material }, packing: { ...line.specs.packing } } }), ...prev.slice(index + 1)])}>
                              <CopyPlus className="h-4 w-4" />
                            </Button>
                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label={t('cc_orders.form.removeLine', 'Remove item')} disabled={lines.length === 1} onClick={() => setLines((prev) => prev.filter((entry) => entry.key !== line.key))}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Lock className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" aria-label={t('cc_orders.form.locked', 'Locked')} />
                        )}
                      </div>

                      <div className="space-y-4 p-3 sm:p-4">
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                          <Field label={t('cc_orders.spec.form', 'Form')}>
                            <ListDropdown listKey="product_forms" value={material.form ?? ''} onChange={(value) => setSpec(line.key, 'material', 'form', value)} />
                          </Field>
                          <Field label={t('cc_orders.spec.grade', 'Grade')}>
                            <ListDropdown listKey="laminate_grades" value={material.grade ?? ''} onChange={(value) => setSpec(line.key, 'material', 'grade', value)} />
                          </Field>
                          <Field label={t('cc_orders.spec.weave', 'Weave / paper')}>
                            <ListDropdown listKey="weaves" value={material.weave ?? ''} onChange={(value) => setSpec(line.key, 'material', 'weave', value)} />
                          </Field>
                          <Field label={t('cc_orders.spec.size', 'Sheet size')}>
                            <ListDropdown listKey="sheet_sizes" value={material.sheet_size ?? ''} onChange={(value) => setSpec(line.key, 'material', 'sheet_size', value)} />
                          </Field>
                          <Field label={t('cc_orders.spec.thickness', 'Thickness (mm)')} htmlFor={`${line.key}-th`}>
                            <Input id={`${line.key}-th`} inputMode="decimal" value={material.thickness_mm ?? ''} onChange={(event) => setSpec(line.key, 'material', 'thickness_mm', event.target.value)} placeholder="25" />
                          </Field>
                          <Field label={isMoulded ? t('cc_orders.spec.dieNo', 'Die No.') : t('cc_orders.spec.pieces', 'Sheets / pieces')} htmlFor={`${line.key}-pc`}>
                            {isMoulded ? (
                              <Input id={`${line.key}-pc`} value={material.die_no ?? ''} onChange={(event) => setSpec(line.key, 'material', 'die_no', event.target.value)} placeholder="1155" />
                            ) : (
                              <Input id={`${line.key}-pc`} inputMode="numeric" value={material.pieces ?? ''} onChange={(event) => setSpec(line.key, 'material', 'pieces', event.target.value)} />
                            )}
                          </Field>
                        </div>

                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
                          <Field label={unit === 'pcs' ? t('cc_orders.form.qtyPcs', 'Quantity (pcs)') : t('cc_orders.form.qtyKg', 'Quantity (kg)')} required htmlFor={`${line.key}-qty`}>
                            <Input id={`${line.key}-qty`} inputMode="decimal" className="text-right font-mono" value={line.quantity} disabled={locked} onChange={(event) => patchLine(line.key, { quantity: event.target.value })} />
                          </Field>
                          <Field label={unit === 'pcs' ? t('cc_orders.form.ratePc', 'Rate / pc') : t('cc_orders.form.rateKg', 'Rate / kg')} htmlFor={`${line.key}-rate`}>
                            <Input id={`${line.key}-rate`} inputMode="decimal" className="text-right font-mono" value={line.rate} onChange={(event) => patchLine(line.key, { rate: event.target.value })} />
                          </Field>
                          {header.market === 'domestic' ? (
                            <Field label={t('cc_orders.form.gst', 'GST %')}>
                              <Dropdown value={line.gstPercent} onChange={(event) => patchLine(line.key, { gstPercent: event.target.value })}>
                                {GST_RATES.map((rate) => (
                                  <option key={rate} value={rate}>
                                    {rate}%
                                  </option>
                                ))}
                              </Dropdown>
                            </Field>
                          ) : null}
                          <Field label={t('cc_orders.form.discount', 'Discount %')} htmlFor={`${line.key}-disc`}>
                            <Input id={`${line.key}-disc`} inputMode="decimal" className="text-right font-mono" value={line.discountPercent} onChange={(event) => patchLine(line.key, { discountPercent: event.target.value })} placeholder="0" />
                          </Field>
                          <div className="col-span-2 flex flex-col justify-end rounded-md bg-muted/50 px-3 py-2 text-right sm:col-span-4 lg:col-span-1">
                            <span className="text-xs text-muted-foreground">{t('cc_orders.form.lineTotal', 'Line total')}</span>
                            <span className="font-mono text-base font-semibold tabular-nums">{money(header.market === 'export' ? lineTotal.taxable : lineTotal.total, currency)}</span>
                          </div>
                        </div>
                        <RateSuggestions grade={material.grade ?? ''} thickness={material.thickness_mm ?? ''} currency={currency} onPick={(rate) => patchLine(line.key, { rate })} />

                        <div className="border-t pt-3">
                          <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground" aria-expanded={line.showPacking} onClick={() => patchLine(line.key, { showPacking: !line.showPacking })}>
                            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', line.showPacking && 'rotate-180')} />
                            {t('cc_orders.form.packingTesting', 'Packing, marking & testing')}
                            {line.specs.packing.test_standard ? <span className="ml-1 rounded bg-muted px-1.5 py-0.5 font-normal">{line.specs.packing.test_standard}</span> : null}
                          </button>
                          {line.showPacking ? (
                            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                              <Field label={t('cc_orders.spec.packing', 'Packing')}>
                                <ListDropdown listKey="pack_types" value={line.specs.packing.pack_type ?? ''} onChange={(value) => setSpec(line.key, 'packing', 'pack_type', value)} />
                              </Field>
                              <Field label={t('cc_orders.spec.marking', 'Marking')} htmlFor={`${line.key}-mark`}>
                                <Input id={`${line.key}-mark`} value={line.specs.packing.marking ?? ''} onChange={(event) => setSpec(line.key, 'packing', 'marking', event.target.value)} />
                              </Field>
                              <Field label={t('cc_orders.spec.standard', 'Test standard')}>
                                <ListDropdown listKey="test_standards" value={line.specs.packing.test_standard ?? ''} onChange={(value) => setSpec(line.key, 'packing', 'test_standard', value)} />
                              </Field>
                              <Field label={t('cc_orders.spec.remarks', 'Line remarks')} htmlFor={`${line.key}-rem`}>
                                <Input id={`${line.key}-rem`} value={line.specs.packing.remarks ?? ''} onChange={(event) => setSpec(line.key, 'packing', 'remarks', event.target.value)} />
                              </Field>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  )
                })}
                {!locked ? (
                  <Button type="button" variant="outline" className="w-full border-dashed" onClick={() => setLines((prev) => [...prev, newLine()])}>
                    <Plus className="mr-1.5 h-4 w-4" />
                    {t('cc_orders.form.addLine', 'Add another item')}
                  </Button>
                ) : null}
              </Section>

              <Section icon={<Copy className="h-4 w-4" />} title={t('cc_orders.form.remarksTitle', 'Remarks')}>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Field label={t('cc_orders.form.productRemarks', 'Product remarks')} htmlFor="o-prem">
                    <Textarea id="o-prem" rows={3} value={header.productRemarks} onChange={(event) => patchHeader({ productRemarks: event.target.value })} />
                  </Field>
                  <Field label={t('cc_orders.form.packingRemarks', 'Packing remarks')} htmlFor="o-pkrem">
                    <Textarea id="o-pkrem" rows={3} value={header.packingRemarks} onChange={(event) => patchHeader({ packingRemarks: event.target.value })} />
                  </Field>
                  <Field label={t('cc_orders.form.billingRemarks', 'Billing remarks')} htmlFor="o-brem">
                    <Textarea id="o-brem" rows={3} value={header.billingRemarks} onChange={(event) => patchHeader({ billingRemarks: event.target.value })} />
                  </Field>
                </div>
                {existing && !isQuote ? (
                  <Field label={t('cc_orders.form.revisionNote', 'What changed and why')} required error={errors.header.revisionNote} htmlFor="o-rev">
                    <Input id="o-rev" value={header.revisionNote} onChange={(event) => patchHeader({ revisionNote: event.target.value })} placeholder={t('cc_orders.form.revisionPlaceholder', 'e.g. customer increased quantity by phone')} />
                  </Field>
                ) : null}
              </Section>
            </div>

            <aside className="hidden lg:block">
              <div className="sticky top-4 space-y-4">
                <section className="rounded-xl border bg-card p-5 shadow-xs">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('cc_orders.form.summary', 'Summary')}</h2>
                  <p className="mt-2 truncate text-base font-semibold">{customer?.name ?? t('cc_orders.form.noCustomer', 'No customer yet')}</p>
                  <p className="text-xs text-muted-foreground">
                    {header.market === 'export' ? `${t('cc_orders.form.export', 'Export')} · ${header.incoterm || '—'} · ${currency}` : t('cc_orders.form.domestic', 'Domestic')}
                    {header.priority === 'urgent' && !isQuote ? ` · ${t('cc_orders.priority.urgent', 'Urgent')}` : ''}
                  </p>
                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t('cc_orders.form.itemsCount', 'Items')}</dt>
                      <dd className="tabular-nums">{filled.length}</dd>
                    </div>
                    {totalKg ? (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">{t('cc_orders.form.totalKg', 'Total kg')}</dt>
                        <dd className="font-mono tabular-nums">{formatQty(totalKg, 3)}</dd>
                      </div>
                    ) : null}
                    {totalPcs ? (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">{t('cc_orders.form.totalPcs', 'Total pieces')}</dt>
                        <dd className="font-mono tabular-nums">{formatQty(totalPcs, 0)}</dd>
                      </div>
                    ) : null}
                    {totals.discount ? (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">{t('cc_orders.form.discountTotal', 'Discount')}</dt>
                        <dd className="font-mono tabular-nums">− {money(totals.discount, currency)}</dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t('cc_orders.form.taxable', 'Taxable value')}</dt>
                      <dd className="font-mono tabular-nums">{money(totals.taxable, currency)}</dd>
                    </div>
                    {header.market === 'domestic' ? (
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">GST</dt>
                        <dd className="font-mono tabular-nums">{money(totals.gst, currency)}</dd>
                      </div>
                    ) : null}
                    <div className="flex items-baseline justify-between border-t pt-2">
                      <dt className="font-semibold">{isQuote ? t('cc_crm.form.quoteValue', 'Quotation value') : t('cc_orders.form.total', 'Order value')}</dt>
                      <dd className="font-mono text-lg font-semibold tabular-nums">{money(header.market === 'export' ? totals.taxable : totals.total, currency)}</dd>
                    </div>
                  </dl>
                  <Button type="submit" className="mt-5 w-full" disabled={saving}>
                    {saving ? t('cc_orders.form.saving', 'Saving…') : saveLabel}
                  </Button>
                  <Button asChild type="button" variant="ghost" className="mt-2 w-full">
                    <Link href={backHref}>{t('common.cancel', 'Cancel')}</Link>
                  </Button>
                  <p className="mt-3 text-center text-xs text-muted-foreground">{t('cc_orders.form.keysShort', 'Ctrl/⌘ + Enter saves · Esc goes back')}</p>
                </section>
                {!isQuote && !existing ? (
                  <section className="rounded-xl border bg-card p-5 text-xs shadow-xs">
                    <h2 className="mb-2 font-semibold uppercase tracking-wider text-muted-foreground">{t('cc_orders.form.next', 'What happens next')}</h2>
                    <ol className="space-y-1.5 text-muted-foreground">
                      <li>1. {t('cc_orders.form.next1Cc', 'Order is booked and numbered')}</li>
                      <li>2. {t('cc_orders.form.next2Cc', 'Accounts confirms the advance or LC')}</li>
                      <li>3. {t('cc_orders.form.next3Cc', 'FG store allocates lots, QC tests, packing, invoice, despatch')}</li>
                    </ol>
                  </section>
                ) : null}
              </div>
            </aside>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{t('cc_orders.form.itemsTotal', '{count} items', { count: filled.length })}</p>
                <p className="truncate font-mono text-base font-semibold tabular-nums">{money(header.market === 'export' ? totals.taxable : totals.total, currency)}</p>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? t('cc_orders.form.saving', 'Saving…') : saveLabel}
              </Button>
            </div>
          </div>
        </form>
      </PageBody>
    </Page>
  )
}

export default CcOrderForm
