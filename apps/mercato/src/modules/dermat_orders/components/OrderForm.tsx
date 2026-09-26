"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, Copy, FileStack, Package, Plus, StickyNote, Trash2, UserRound } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Popover, PopoverContent, PopoverTrigger } from '@open-mercato/ui/primitives/popover'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { StepIndicator } from '@open-mercato/ui/primitives/step-indicator'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { LINE_SPEC_SECTIONS, PARTY_SIDE } from '../lib/specs'
import { priceOrder } from '../lib/pricing'
import { SearchPicker, type PickerOption } from './SearchPicker'
import { formatDate, formatQty, todayIso, PAYMENT_TERMS_LABEL } from './format'
import { loadBomStatus, loadCustomer, loadCustomerOrders, loadProductDetails, searchCustomers, searchFinishedGoods } from './loaders'
import type { BomRef, Customer, Order, OrderListItem, ProductInfo } from './types'

type LineDraft = {
  key: string
  product: ProductInfo | null
  bom: BomRef | undefined
  brandName: string
  packSize: string
  mrp: string
  quantity: string
  rate: string
  gstPercent: string
  discountPercent: string
  batchNo: string
  specs: Record<string, Record<string, string>>
}

type Header = {
  orderDate: string
  deliveryDate: string
  customerPoRef: string
  orderType: 'new' | 'repeat' | 'revision'
  sourceOrderId: string | null
  salesManager: string
  paymentTerms: string
  paymentRemarks: string
  productRemarks: string
  billingRemarks: string
  packingRemarks: string
  pricesIncludeGst: boolean
}

const EMPTY_HEADER: Header = {
  orderDate: todayIso(),
  deliveryDate: '',
  customerPoRef: '',
  orderType: 'new',
  sourceOrderId: null,
  salesManager: '',
  paymentTerms: '',
  paymentRemarks: '',
  productRemarks: '',
  billingRemarks: '',
  packingRemarks: '',
  pricesIncludeGst: false,
}

let lineCounter = 0

function newLine(): LineDraft {
  lineCounter += 1
  return { key: `line-${lineCounter}`, product: null, bom: undefined, brandName: '', packSize: '', mrp: '', quantity: '', rate: '', gstPercent: '18', discountPercent: '', batchNo: '', specs: {} }
}

function linesFromOrder(order: Order, keepBatch: boolean): LineDraft[] {
  return order.lines.map((line) => ({
    ...newLine(),
    product: line.product,
    bom: line.bom,
    brandName: line.brandName ?? '',
    packSize: line.packSize ?? '',
    mrp: line.mrp == null ? '' : String(line.mrp),
    quantity: String(line.quantity),
    rate: line.rate == null ? '' : String(line.rate),
    gstPercent: String(line.gstPercent ?? 18),
    discountPercent: line.discountPercent ? String(line.discountPercent) : '',
    batchNo: keepBatch ? (line.batchNo ?? '') : '',
    specs: line.specs ?? {},
  }))
}

function toNumber(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function filledCount(values: Record<string, string> | undefined): number {
  return Object.values(values ?? {}).filter((value) => value.trim()).length
}

function Field({ label, required, children, className }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label className="text-xs text-muted-foreground">
        {label}
        {required ? ' *' : ''}
      </Label>
      {children}
    </div>
  )
}

function BomChip({ bom, productId }: { bom: BomRef | undefined; productId: string }) {
  const t = useT()
  if (bom === undefined) return null
  if (!bom) {
    return (
      <Link href={`/backend/boms/new?productId=${productId}`} className="inline-flex items-center gap-1 text-xs text-status-warning-text hover:underline">
        <FileStack className="h-3.5 w-3.5" />
        {t('dermat_orders.form.noBom', 'No BOM yet — create')}
      </Link>
    )
  }
  return (
    <Link href={`/backend/boms/${bom.id}`} className="inline-flex items-center gap-1.5 text-xs hover:underline">
      <FileStack className="h-3.5 w-3.5 text-muted-foreground" />
      <StatusBadge variant={bom.status === 'approved' ? 'success' : 'warning'}>
        {bom.status === 'approved' ? t('dermat_orders.form.bomApproved', 'BOM v{version} approved', { version: bom.version }) : t('dermat_orders.form.bomDraft', 'BOM v{version} draft', { version: bom.version })}
      </StatusBadge>
    </Link>
  )
}

export function OrderForm({ orderId, copyFrom, customerId }: { orderId?: string; copyFrom?: string; customerId?: string }) {
  const t = useT()
  const router = useRouter()
  const { runMutation } = useGuardedMutation({ contextId: `dermat-order-${orderId ?? 'new'}` })
  const [customer, setCustomer] = React.useState<Customer | null>(null)
  const [header, setHeader] = React.useState<Header>(EMPTY_HEADER)
  const [lines, setLines] = React.useState<LineDraft[]>([newLine()])
  const [existing, setExisting] = React.useState<Order | null>(null)
  const [loading, setLoading] = React.useState(Boolean(orderId || copyFrom))
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [errors, setErrors] = React.useState<{ customer?: string; rows: Record<string, string> }>({ rows: {} })
  const [previous, setPrevious] = React.useState<OrderListItem[]>([])
  const [step, setStep] = React.useState(0)

  React.useEffect(() => {
    const sourceId = orderId ?? copyFrom
    if (!sourceId) return
    let cancelled = false
    apiCall<Order>(`/api/dermat_orders/orders?id=${encodeURIComponent(sourceId)}`).then(async (call) => {
      if (cancelled) return
      if (!call.ok || !call.result) {
        setLoadError(t('dermat_orders.errors.load', 'Could not load the order.'))
        setLoading(false)
        return
      }
      const order = call.result
      const fresh = order.customer ?? (await loadCustomer(order.customerId))
      if (cancelled) return
      setCustomer(fresh)
      if (orderId) {
        setExisting(order)
        setHeader({
          orderDate: order.orderDate,
          deliveryDate: order.deliveryDate ?? '',
          customerPoRef: order.customerPoRef ?? '',
          orderType: order.orderType,
          sourceOrderId: order.sourceOrderId,
          salesManager: order.salesManager ?? '',
          paymentTerms: order.paymentTerms ?? '',
          paymentRemarks: order.paymentRemarks ?? '',
          productRemarks: order.productRemarks ?? '',
          billingRemarks: order.billingRemarks ?? '',
          packingRemarks: order.packingRemarks ?? '',
          pricesIncludeGst: order.pricesIncludeGst ?? false,
        })
        setLines(linesFromOrder(order, true))
      } else {
        setHeader({
          ...EMPTY_HEADER,
          orderType: 'repeat',
          sourceOrderId: order.id,
          salesManager: order.salesManager ?? '',
          paymentTerms: order.paymentTerms ?? '',
          paymentRemarks: order.paymentRemarks ?? '',
          productRemarks: order.productRemarks ?? '',
          billingRemarks: order.billingRemarks ?? '',
          packingRemarks: order.packingRemarks ?? '',
          pricesIncludeGst: order.pricesIncludeGst ?? false,
        })
        setLines(linesFromOrder(order, false))
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [orderId, copyFrom, t])

  React.useEffect(() => {
    if (!customerId || orderId || copyFrom) return
    let cancelled = false
    loadCustomer(customerId).then((value) => {
      if (cancelled || !value) return
      setCustomer(value)
      setHeader((prev) => ({
        ...prev,
        salesManager: prev.salesManager || value.salesManager || '',
        paymentTerms: value.paymentTerms || prev.paymentTerms,
        paymentRemarks: value.paymentRemarks || prev.paymentRemarks,
      }))
    })
    return () => {
      cancelled = true
    }
  }, [customerId, orderId, copyFrom])

  React.useEffect(() => {
    if (!customer || orderId) {
      setPrevious([])
      return
    }
    let cancelled = false
    loadCustomerOrders(customer.id).then((items) => {
      if (!cancelled) setPrevious(items.filter((item) => item.status !== 'cancelled'))
    })
    return () => {
      cancelled = true
    }
  }, [customer, orderId])

  const patchHeader = (patch: Partial<Header>) => setHeader((prev) => ({ ...prev, ...patch }))
  const patchLine = (key: string, patch: Partial<LineDraft>) => setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))

  const selectCustomer = (option: PickerOption<Customer>) => {
    const value = option.value
    setCustomer(value)
    setErrors((prev) => ({ ...prev, customer: undefined }))
    setHeader((prev) => ({
      ...prev,
      salesManager: prev.salesManager || value.salesManager || '',
      paymentTerms: value.paymentTerms || prev.paymentTerms,
      paymentRemarks: value.paymentRemarks || prev.paymentRemarks,
    }))
  }

  const selectProduct = async (key: string, option: PickerOption<ProductInfo>) => {
    patchLine(key, { product: option.value, bom: undefined })
    const [details, bom] = await Promise.all([loadProductDetails(option.id), loadBomStatus(option.id)])
    setLines((prev) =>
      prev.map((line) =>
        line.key === key
          ? {
              ...line,
              product: { ...option.value, ...details },
              bom,
              packSize: line.packSize || details.packSize || '',
              brandName: line.brandName || details.brandName || '',
              mrp: line.mrp || (details.mrp == null ? '' : String(details.mrp)),
            }
          : line,
      ),
    )
  }

  const copyOrder = (item: OrderListItem) => router.push(`/backend/orders/new?copyFrom=${item.id}`)

  const setSpec = (key: string, section: string, field: string, value: string) =>
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, specs: { ...line.specs, [section]: { ...(line.specs[section] ?? {}), [field]: value } } } : line)),
    )

  const markPartySide = (key: string, section: string) => {
    const def = LINE_SPEC_SECTIONS.find((entry) => entry.key === section)
    if (!def) return
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line
        const current = { ...(line.specs[section] ?? {}) }
        for (const field of def.fields) if (!field.options && !current[field.key]?.trim()) current[field.key] = PARTY_SIDE
        return { ...line, specs: { ...line.specs, [section]: current } }
      }),
    )
  }

  const totalPieces = lines.reduce((sum, line) => sum + (toNumber(line.quantity) ?? 0), 0)
  const orderTotals = priceOrder(
    lines.filter((line) => line.product).map((line) => ({ quantity: toNumber(line.quantity) ?? 0, rate: toNumber(line.rate), gstPercent: toNumber(line.gstPercent) ?? 18, discountPercent: toNumber(line.discountPercent) ?? 0 })),
    header.pricesIncludeGst,
  )
  const locked = existing?.linesLocked ?? false

  const save = async () => {
    const rowErrors: Record<string, string> = {}
    const filled = lines.filter((line) => line.product || line.quantity.trim())
    filled.forEach((line, index) => {
      if (!line.product) rowErrors[String(index + 1)] = t('dermat_orders.errors.product', 'Pick a product')
      else if (!((toNumber(line.quantity) ?? 0) > 0)) rowErrors[String(index + 1)] = t('dermat_orders.errors.quantity', 'Enter the quantity in pieces')
    })
    const customerError = customer ? undefined : t('dermat_orders.errors.customer', 'Pick the customer')
    setErrors({ customer: customerError, rows: rowErrors })
    if (customerError) setStep(0)
    else if (Object.keys(rowErrors).length) setStep(1)
    if (customerError || Object.keys(rowErrors).length) {
      flash(t('dermat_orders.errors.fix', 'Some fields need fixing.'), 'error')
      return
    }
    if (!filled.length) {
      flash(t('dermat_orders.errors.noLines', 'Add at least one product.'), 'error')
      return
    }
    if (header.deliveryDate && header.deliveryDate < header.orderDate) {
      flash(t('dermat_orders.errors.delivery', 'Delivery date is before the order date.'), 'error')
      return
    }
    const body = {
      ...header,
      deliveryDate: header.deliveryDate || null,
      customerId: customer!.id,
      lines: filled.map((line) => ({
        productId: line.product!.id,
        brandName: line.brandName || null,
        packSize: line.packSize || null,
        mrp: toNumber(line.mrp),
        quantity: toNumber(line.quantity),
        rate: toNumber(line.rate),
        gstPercent: toNumber(line.gstPercent) ?? 18,
        discountPercent: toNumber(line.discountPercent) ?? 0,
        batchNo: line.batchNo || null,
        specs: line.specs,
      })),
    }
    setSaving(true)
    try {
      const payload = existing ? { ...body, id: existing.id } : body
      const call = await runMutation({
        context: { orderId: existing?.id ?? null },
        mutationPayload: payload,
        operation: () => {
          const request = () =>
            apiCall<{ id?: string; orderNo?: string; error?: string; rows?: Record<string, string> }>('/api/dermat_orders/orders', {
              method: existing ? 'PUT' : 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            })
          return existing ? withScopedApiRequestHeaders(buildOptimisticLockHeader(existing.updatedAt), request) : request()
        },
      })
      if (!call.ok) {
        if (call.result?.rows) setErrors((prev) => ({ ...prev, rows: call.result?.rows ?? {} }))
        flash(
          call.status === 409 && (!call.result?.error || call.result?.error === 'record_modified')
            ? t('dermat_orders.errors.conflict', 'Someone else changed this order. Reload to see the latest.')
            : (call.result?.error ?? t('dermat_orders.errors.save', 'Could not save the order.')),
          'error',
        )
        return
      }
      flash(
        existing ? t('dermat_orders.flash.saved', 'Order saved') : t('dermat_orders.flash.created', 'Order {no} created', { no: call.result?.orderNo ?? '' }),
        'success',
      )
      router.push(`/backend/orders/${existing?.id ?? call.result?.id}`)
    } catch {
      flash(t('dermat_orders.errors.save', 'Could not save the order.'), 'error')
    } finally {
      setSaving(false)
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
  if (loading) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dermat_orders.loading', 'Loading order…')} />
        </PageBody>
      </Page>
    )
  }

  const backHref = existing ? `/backend/orders/${existing.id}` : '/backend/orders'
  const steps = [
    { id: 'customer', label: t('dermat_orders.wizard.customer', '1. Customer & header'), description: t('dermat_orders.wizard.customerHint', 'Who, when, terms') },
    { id: 'products', label: t('dermat_orders.wizard.products', '2. Products & items'), description: t('dermat_orders.wizard.productsHint', 'Brand, pack, MRP, qty, rate') },
    { id: 'specs', label: t('dermat_orders.wizard.specs', '3. Production & packing specs'), description: t('dermat_orders.wizard.specsHint', 'The client’s order form') },
    { id: 'review', label: t('dermat_orders.wizard.review', '4. Review & book'), description: t('dermat_orders.wizard.reviewHint', 'Check and save') },
  ]
  const filledLines = lines.filter((line) => line.product || line.quantity.trim())

  const checkStep = (index: number): boolean => {
    if (index === 0) {
      const customerError = customer ? undefined : t('dermat_orders.errors.customer', 'Pick the customer')
      setErrors((prev) => ({ ...prev, customer: customerError }))
      if (customerError) {
        flash(customerError, 'error')
        return false
      }
      if (!header.orderDate) {
        flash(t('dermat_orders.errors.orderDate', 'Enter the order date.'), 'error')
        return false
      }
      if (header.deliveryDate && header.deliveryDate < header.orderDate) {
        flash(t('dermat_orders.errors.delivery', 'Delivery date is before the order date.'), 'error')
        return false
      }
      return true
    }
    if (index === 1) {
      const rowErrors: Record<string, string> = {}
      lines.forEach((line, row) => {
        if (!line.product && !line.quantity.trim()) return
        if (!line.product) rowErrors[String(row + 1)] = t('dermat_orders.errors.product', 'Pick a product')
        else if (!((toNumber(line.quantity) ?? 0) > 0)) rowErrors[String(row + 1)] = t('dermat_orders.errors.quantity', 'Enter the quantity in pieces')
      })
      setErrors((prev) => ({ ...prev, rows: rowErrors }))
      if (Object.keys(rowErrors).length) {
        flash(t('dermat_orders.errors.fix', 'Some fields need fixing.'), 'error')
        return false
      }
      if (!filledLines.length) {
        flash(t('dermat_orders.errors.noLines', 'Add at least one product.'), 'error')
        return false
      }
      return true
    }
    return true
  }

  const goTo = (target: number) => {
    if (target <= step || existing) {
      setStep(target)
      return
    }
    for (let index = step; index < target; index += 1) {
      if (!checkStep(index)) {
        setStep(index)
        return
      }
    }
    setStep(target)
  }

  const lineMoney = (line: LineDraft) =>
    priceOrder([{ quantity: toNumber(line.quantity) ?? 0, rate: toNumber(line.rate), gstPercent: toNumber(line.gstPercent) ?? 18, discountPercent: toNumber(line.discountPercent) ?? 0 }], header.pricesIncludeGst)

  const specSummary = (line: LineDraft) => LINE_SPEC_SECTIONS.map((section) => `${filledCount(line.specs[section.key])}/${section.fields.length}`).join(' · ')

  return (
    <Page>
      <PageBody>
        <form
          className="mx-auto max-w-7xl space-y-5 pb-16"
          onSubmit={(event) => {
            event.preventDefault()
            if (step < steps.length - 1 && !existing) goTo(step + 1)
            else save()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              if (step < steps.length - 1 && !existing) goTo(step + 1)
              else save()
            }
            if (event.key === 'Escape') router.push(backHref)
          }}
        >
          <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Button type="button" variant="ghost" size="icon" onClick={() => router.push(backHref)} aria-label={t('common.back', 'Back')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold">
                  {existing
                    ? t('dermat_orders.form.editTitle', 'Edit order {no}', { no: existing.orderNo })
                    : header.orderType === 'repeat'
                      ? t('dermat_orders.form.repeatTitle', 'Book a repeat order')
                      : t('dermat_orders.form.newTitle', 'Book a new order')}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {t('dermat_orders.form.subtitle', 'The order number is given when you save. It then waits at "Advance received" until Accounts verifies the advance.')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={saving}>
                {t('common.cancel', 'Cancel')}
              </Button>
              {existing ? (
                <Button type="button" onClick={() => save()} disabled={saving}>
                  {saving ? t('dermat_orders.form.saving', 'Saving…') : t('dermat_orders.form.save', 'Save order')}
                </Button>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border bg-card p-4 shadow-xs">
            <StepIndicator
              steps={steps.map((entry, index) => ({ ...entry, status: index < step ? 'complete' : index === step ? 'current' : 'pending' }))}
              onStepClick={(id) => goTo(steps.findIndex((entry) => entry.id === id))}
            />
          </div>

          {step === 0 ? (
            <Card>
              <CardHeader className="border-b bg-muted/20 pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-bold">
                  <UserRound className="h-4 w-4 text-primary" />
                  {t('dermat_orders.form.customerTitle', 'Customer & order header')}
                </CardTitle>
                <CardDescription className="text-xs">{t('dermat_orders.form.customerDesc', 'Pick the company. Payment terms and sales person come from the customer and can be changed for this order.')}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-12">
                <Field label={t('dermat_orders.form.customer', 'Customer (company)')} required className="md:col-span-6">
                  <SearchPicker
                    value={customer ? { id: customer.id, primary: customer.name, value: customer } : null}
                    placeholder={t('dermat_orders.form.customerPick', 'Search customer by name')}
                    searchPlaceholder={t('dermat_orders.form.customerSearch', 'Type a customer name')}
                    load={searchCustomers}
                    onSelect={selectCustomer}
                    invalid={Boolean(errors.customer)}
                    disabled={Boolean(existing)}
                    footer={
                      <Link href="/backend/customers/companies/create" target="_blank" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                        <Plus className="h-3 w-3" />
                        {t('dermat_orders.form.newCustomer', 'Add a new customer (opens in a new tab)')}
                      </Link>
                    }
                  />
                  {errors.customer ? <p className="text-xs text-status-error-text">{errors.customer}</p> : null}
                  {customer ? (
                    <p className="text-xs text-muted-foreground">
                      {[customer.gstin ? `GSTIN ${customer.gstin}` : t('dermat_orders.form.noGst', 'No GSTIN on file'), customer.phone, customer.email].filter(Boolean).join(' · ')}{' '}
                      <Link href={`/backend/customers/companies/${customer.id}`} target="_blank" className="text-primary hover:underline">
                        {t('dermat_orders.form.openCustomer', 'Open customer')}
                      </Link>
                    </p>
                  ) : null}
                </Field>
                <Field label={t('dermat_orders.form.orderDate', 'Order date')} required className="md:col-span-3">
                  <Input type="date" value={header.orderDate} onChange={(event) => patchHeader({ orderDate: event.target.value })} />
                </Field>
                <Field label={t('dermat_orders.form.deliveryDate', 'Delivery date')} className="md:col-span-3">
                  <Input type="date" value={header.deliveryDate} onChange={(event) => patchHeader({ deliveryDate: event.target.value })} />
                </Field>
                <Field label={t('dermat_orders.form.orderType', 'Order type')} className="md:col-span-3">
                  <Select value={header.orderType} onValueChange={(value) => patchHeader({ orderType: value as Header['orderType'] })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">{t('dermat_orders.type.new', 'New (first batch)')}</SelectItem>
                      <SelectItem value="repeat">{t('dermat_orders.type.repeat', 'Repeat')}</SelectItem>
                      <SelectItem value="revision">{t('dermat_orders.type.revision', 'Revision')}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('dermat_orders.form.poRef', 'Customer PO / reference')} className="md:col-span-3">
                  <Input value={header.customerPoRef} onChange={(event) => patchHeader({ customerPoRef: event.target.value })} placeholder="e.g. PO-2291" />
                </Field>
                <Field label={t('dermat_orders.form.salesManager', 'Sales POC')} className="md:col-span-3">
                  <Input value={header.salesManager} onChange={(event) => patchHeader({ salesManager: event.target.value })} />
                </Field>
                <Field label={t('dermat_orders.form.paymentTerms', 'Payment terms')} className="md:col-span-3">
                  <Select value={header.paymentTerms || '__none'} onValueChange={(value) => patchHeader({ paymentTerms: value === '__none' ? '' : value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">—</SelectItem>
                      {Object.entries(PAYMENT_TERMS_LABEL).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                      {header.paymentTerms && !PAYMENT_TERMS_LABEL[header.paymentTerms] ? <SelectItem value={header.paymentTerms}>{header.paymentTerms}</SelectItem> : null}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label={t('dermat_orders.form.paymentRemarks', 'Payment remarks')} className="md:col-span-6">
                  <Input value={header.paymentRemarks} onChange={(event) => patchHeader({ paymentRemarks: event.target.value })} placeholder="e.g. 40% advance 60% before dispatch" />
                </Field>
                {customer && !existing && previous.length ? (
                  <div className="md:col-span-6 md:self-end">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" className="w-full justify-start">
                          <Copy className="mr-2 h-4 w-4" />
                          {t('dermat_orders.form.repeatPick', 'Repeat a previous order of this customer ({count})', { count: previous.length })}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-96 p-0">
                        <ul className="max-h-72 divide-y overflow-auto text-sm">
                          {previous.map((item) => (
                            <li key={item.id}>
                              <button type="button" className="w-full px-3 py-2 text-left hover:bg-muted" onClick={() => copyOrder(item)}>
                                <span className="font-mono text-xs">{item.orderNo}</span>
                                <span className="ml-2 text-xs text-muted-foreground">{formatDate(item.orderDate)}</span>
                                <span className="block truncate">
                                  {item.products.map((product) => `${product.title} × ${formatQty(product.quantity, 0)}`).join(', ')}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </PopoverContent>
                    </Popover>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {step === 1 ? (
            <Card>
              <CardHeader className="flex flex-col gap-2 border-b bg-muted/20 pb-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    <Package className="h-4 w-4 text-primary" />
                    {t('dermat_orders.form.productsTitle', 'Ordered products ({count})', { count: filledLines.length })}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {locked
                      ? t('dermat_orders.form.locked', 'Manufacturing is done — products and quantities are locked.')
                      : t('dermat_orders.form.productsHint', 'One row per product, like the order sheet. Search the Finished Good by ID or name; quantity is in pieces.')}
                  </CardDescription>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                  <input type="checkbox" className="h-3.5 w-3.5 rounded-sm border-input" checked={header.pricesIncludeGst} onChange={(event) => patchHeader({ pricesIncludeGst: event.target.checked })} />
                  {t('dermat_orders.form.includesGst', 'Rates include GST')}
                </label>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-max border-collapse text-sm">
                    <thead className="bg-muted/40 text-xs text-muted-foreground">
                      <tr className="border-b">
                        <th className="px-2 py-2 text-left font-semibold">#</th>
                        <th className="min-w-72 px-2 py-2 text-left font-semibold">{t('dermat_orders.form.product', 'Finished Good')} *</th>
                        <th className="min-w-44 px-2 py-2 text-left font-semibold">{t('dermat_orders.form.brand', 'Brand name')}</th>
                        <th className="w-28 px-2 py-2 text-left font-semibold">{t('dermat_orders.form.packSize', 'Pack size')}</th>
                        <th className="w-24 px-2 py-2 text-right font-semibold">{t('dermat_orders.form.mrp', 'MRP (₹)')}</th>
                        <th className="w-28 px-2 py-2 text-right font-semibold">{t('dermat_orders.form.quantity', 'Qty (pcs)')} *</th>
                        <th className="w-24 px-2 py-2 text-right font-semibold">{t('dermat_orders.form.rate', 'Rate (₹/pc)')}</th>
                        <th className="w-24 px-2 py-2 text-left font-semibold">{t('dermat_orders.form.gst', 'GST %')}</th>
                        <th className="w-20 px-2 py-2 text-right font-semibold">{t('dermat_orders.form.discount', 'Disc. %')}</th>
                        <th className="w-28 px-2 py-2 text-left font-semibold">{t('dermat_orders.form.batchNo', 'Batch no.')}</th>
                        <th className="w-28 px-2 py-2 text-right font-semibold">{t('dermat_orders.form.lineTotal', 'Total (₹)')}</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((line, index) => {
                        const error = errors.rows[String(index + 1)]
                        const total = lineMoney(line).total
                        return (
                          <React.Fragment key={line.key}>
                            <tr className={cn('align-top', !error && 'border-b')}>
                              <td className="px-2 py-2 pt-4 text-xs text-muted-foreground tabular-nums">{index + 1}</td>
                              <td className="px-2 py-2">
                                <SearchPicker
                                  value={line.product ? { id: line.product.id, primary: line.product.title, tag: line.product.code, value: line.product } : null}
                                  placeholder={t('dermat_orders.form.productPick', 'Internal ID or name')}
                                  searchPlaceholder={t('dermat_orders.form.productSearch', 'e.g. FG-0142 or Night Serum')}
                                  load={searchFinishedGoods}
                                  onSelect={(option) => selectProduct(line.key, option)}
                                  disabled={locked}
                                  invalid={Boolean(error)}
                                  footer={
                                    <Link href="/backend/products/new/finished-goods" target="_blank" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                                      <Plus className="h-3 w-3" />
                                      {t('dermat_orders.form.newProduct', 'Add a new Finished Good (opens in a new tab)')}
                                    </Link>
                                  }
                                />
                                {line.product ? (
                                  <div className="mt-1">
                                    <BomChip bom={line.bom} productId={line.product.id} />
                                  </div>
                                ) : null}
                              </td>
                              <td className="px-2 py-2">
                                <Input value={line.brandName} onChange={(event) => patchLine(line.key, { brandName: event.target.value })} placeholder="e.g. Orange Skin" />
                              </td>
                              <td className="px-2 py-2">
                                <Input value={line.packSize} onChange={(event) => patchLine(line.key, { packSize: event.target.value })} placeholder="30 ml" />
                              </td>
                              <td className="px-2 py-2">
                                <Input type="number" min={0} step="any" className="text-right" value={line.mrp} onChange={(event) => patchLine(line.key, { mrp: event.target.value })} />
                              </td>
                              <td className="px-2 py-2">
                                <Input type="number" min={0} step="1" className="text-right font-mono" value={line.quantity} disabled={locked} onChange={(event) => patchLine(line.key, { quantity: event.target.value })} />
                              </td>
                              <td className="px-2 py-2">
                                <Input type="number" min={0} step="any" className="text-right" value={line.rate} onChange={(event) => patchLine(line.key, { rate: event.target.value })} />
                              </td>
                              <td className="px-2 py-2">
                                <Select value={line.gstPercent} onValueChange={(value) => patchLine(line.key, { gstPercent: value })}>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {['0', '5', '12', '18', '28'].map((rate) => (
                                      <SelectItem key={rate} value={rate}>
                                        {rate}%
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                              <td className="px-2 py-2">
                                <Input type="number" min={0} max={100} step="any" className="text-right" value={line.discountPercent} onChange={(event) => patchLine(line.key, { discountPercent: event.target.value })} placeholder="0" />
                              </td>
                              <td className="px-2 py-2">
                                <Input value={line.batchNo} onChange={(event) => patchLine(line.key, { batchNo: event.target.value })} placeholder="57001" />
                              </td>
                              <td className="px-2 py-2 pt-4 text-right font-medium tabular-nums">{total > 0 ? `₹${formatQty(total, 2)}` : '—'}</td>
                              <td className="px-2 py-2">
                                {!locked && lines.length > 1 ? (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="text-muted-foreground"
                                    aria-label={t('dermat_orders.form.removeLine', 'Remove')}
                                    onClick={() => setLines((prev) => prev.filter((entry) => entry.key !== line.key))}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                ) : null}
                              </td>
                            </tr>
                            {error ? (
                              <tr className="border-b">
                                <td />
                                <td colSpan={11} className="px-2 pb-2 text-xs text-status-error-text">
                                  {error}
                                </td>
                              </tr>
                            ) : null}
                          </React.Fragment>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/20 text-sm">
                        <td colSpan={5} className="px-2 py-3">
                          {!locked ? (
                            <Button type="button" variant="outline" size="sm" onClick={() => setLines((prev) => [...prev, newLine()])}>
                              <Plus className="mr-1.5 h-4 w-4" />
                              {t('dermat_orders.form.addLine', 'Add product')}
                            </Button>
                          ) : null}
                        </td>
                        <td className="px-2 py-3 text-right font-semibold tabular-nums">{formatQty(totalPieces, 0)}</td>
                        <td colSpan={4} className="px-2 py-3 text-right text-xs text-muted-foreground">
                          {orderTotals.total > 0 ? t('dermat_orders.form.taxBreak', '₹{taxable} + GST ₹{gst}', { taxable: formatQty(orderTotals.taxable, 2), gst: formatQty(orderTotals.gst, 2) }) : null}
                        </td>
                        <td className="px-2 py-3 text-right font-bold tabular-nums">{orderTotals.total > 0 ? `₹${formatQty(orderTotals.total, 2)}` : '—'}</td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              {filledLines.map((line, index) => (
                <Card key={line.key}>
                  <CardHeader className="flex flex-col gap-1 border-b bg-muted/20 pb-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2 text-sm font-bold">
                        <ClipboardList className="h-4 w-4 text-primary" />
                        {index + 1}. {line.brandName || line.product?.title || t('dermat_orders.form.productN', 'Product')}
                        {line.packSize ? <span className="font-normal text-muted-foreground">· {line.packSize}</span> : null}
                        <span className="font-normal text-muted-foreground">· {formatQty(toNumber(line.quantity) ?? 0, 0)} pcs</span>
                      </CardTitle>
                      <CardDescription className="text-xs">{line.product?.title}</CardDescription>
                    </div>
                    <span className="text-xs text-muted-foreground">{t('dermat_orders.form.specFilled', 'Filled {summary}', { summary: specSummary(line) })}</span>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-5 pt-4 lg:grid-cols-3">
                    {LINE_SPEC_SECTIONS.map((section) => (
                      <div key={section.key} className="space-y-2">
                        <div className="flex items-center justify-between gap-2 border-b pb-1.5">
                          <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{section.title}</h4>
                          <button type="button" className="shrink-0 text-xs text-primary hover:underline" onClick={() => markPartySide(line.key, section.key)}>
                            {t('dermat_orders.form.partySide', 'Blanks = Party side')}
                          </button>
                        </div>
                        {section.fields.map((field, fieldIndex) => {
                          const value = line.specs[section.key]?.[field.key] ?? ''
                          return (
                            <div key={field.key} className="grid grid-cols-5 items-center gap-2">
                              <Label className="col-span-2 text-xs">
                                <span className="mr-1 text-muted-foreground tabular-nums">{fieldIndex + 1}.</span>
                                {field.label}
                              </Label>
                              <div className="col-span-3">
                                {field.options ? (
                                  <Select value={value || '__none'} onValueChange={(next) => setSpec(line.key, section.key, field.key, next === '__none' ? '' : next)}>
                                    <SelectTrigger className="h-8">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="__none">—</SelectItem>
                                      {[...field.options, PARTY_SIDE].map((option) => (
                                        <SelectItem key={option} value={option}>
                                          {option}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input className="h-8" value={value} onChange={(event) => setSpec(line.key, section.key, field.key, event.target.value)} />
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
              <Card>
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    <StickyNote className="h-4 w-4 text-primary" />
                    {t('dermat_orders.form.remarksTitle', 'Remarks')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-3">
                  <Field label={t('dermat_orders.form.productRemarks', 'Product remarks')}>
                    <Textarea rows={3} value={header.productRemarks} onChange={(event) => patchHeader({ productRemarks: event.target.value })} />
                  </Field>
                  <Field label={t('dermat_orders.form.packingRemarks', 'Packing remarks')}>
                    <Textarea rows={3} value={header.packingRemarks} onChange={(event) => patchHeader({ packingRemarks: event.target.value })} />
                  </Field>
                  <Field label={t('dermat_orders.form.billingRemarks', 'Billing remarks')}>
                    <Textarea rows={3} value={header.billingRemarks} onChange={(event) => patchHeader({ billingRemarks: event.target.value })} />
                  </Field>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    {t('dermat_orders.form.summaryTitle', 'Order summary')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-3">
                    {[
                      [t('dermat_orders.form.customer', 'Customer (company)'), customer?.name ?? '—'],
                      [t('dermat_orders.form.orderDate', 'Order date'), formatDate(header.orderDate)],
                      [t('dermat_orders.form.deliveryDate', 'Delivery date'), header.deliveryDate ? formatDate(header.deliveryDate) : '—'],
                      [t('dermat_orders.form.orderType', 'Order type'), header.orderType === 'new' ? 'New' : header.orderType === 'repeat' ? 'Repeat' : 'Revision'],
                      [t('dermat_orders.form.poRef', 'Customer PO / reference'), header.customerPoRef || '—'],
                      [t('dermat_orders.form.salesManager', 'Sales POC'), header.salesManager || '—'],
                      [t('dermat_orders.form.paymentTerms', 'Payment terms'), PAYMENT_TERMS_LABEL[header.paymentTerms] ?? (header.paymentTerms || '—')],
                      [t('dermat_orders.form.paymentRemarks', 'Payment remarks'), header.paymentRemarks || '—'],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs text-muted-foreground">{label}</dt>
                        <dd className="font-medium">{value}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="overflow-x-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.form.product', 'Finished Good')}</th>
                          <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.form.packSize', 'Pack size')}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t('dermat_orders.form.quantity', 'Qty (pcs)')}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t('dermat_orders.form.rate', 'Rate (₹/pc)')}</th>
                          <th className="px-3 py-2 text-right font-semibold">{t('dermat_orders.form.lineTotal', 'Total (₹)')}</th>
                          <th className="px-3 py-2 text-left font-semibold">{t('dermat_orders.form.specsShort', 'Specs filled')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filledLines.map((line) => (
                          <tr key={line.key}>
                            <td className="px-3 py-2">
                              <span className="block font-medium">{line.brandName || line.product?.title}</span>
                              <span className="block text-xs text-muted-foreground">
                                {line.product?.code ? `${line.product.code} · ` : ''}
                                {line.product?.title}
                                {line.batchNo ? ` · Batch ${line.batchNo}` : ''}
                              </span>
                            </td>
                            <td className="px-3 py-2">{line.packSize || '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatQty(toNumber(line.quantity) ?? 0, 0)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{line.rate ? `₹${formatQty(toNumber(line.rate) ?? 0, 2)}` : '—'}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{lineMoney(line).total > 0 ? `₹${formatQty(lineMoney(line).total, 2)}` : '—'}</td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{specSummary(line)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <CardTitle className="text-sm font-bold">{t('dermat_orders.form.valueTitle', 'Value & what happens next')}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-4 text-sm">
                  <dl className="space-y-1.5">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t('dermat_orders.form.pieces', 'Pieces')}</dt>
                      <dd className="tabular-nums">{formatQty(totalPieces, 0)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t('dermat_orders.form.taxable', 'Taxable')}</dt>
                      <dd className="tabular-nums">₹{formatQty(orderTotals.taxable, 2)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">GST</dt>
                      <dd className="tabular-nums">₹{formatQty(orderTotals.gst, 2)}</dd>
                    </div>
                    <div className="flex justify-between border-t pt-1.5 font-bold">
                      <dt>{t('dermat_orders.form.total', 'Order value')}</dt>
                      <dd className="tabular-nums">₹{formatQty(orderTotals.total, 2)}</dd>
                    </div>
                  </dl>
                  <ol className="space-y-2 rounded-md bg-muted/30 p-3 text-xs">
                    <li>
                      <span className="font-semibold">1. {t('dermat_orders.form.next1', 'Order booked')}</span>
                      <span className="block text-muted-foreground">{t('dermat_orders.form.next1Hint', 'Order number is given now.')}</span>
                    </li>
                    <li>
                      <span className="font-semibold">2. {t('dermat_orders.form.next2', 'Advance received — Pending with Accounts')}</span>
                      <span className="block text-muted-foreground">{t('dermat_orders.form.next2Hint', 'Accounts verifies the advance; the order becomes official.')}</span>
                    </li>
                    <li>
                      <span className="font-semibold">3. {t('dermat_orders.form.next3', 'Sampling / R&D, then artwork and formula in parallel')}</span>
                      <span className="block text-muted-foreground">{t('dermat_orders.form.next3Hint', 'Each stage appears as a task on its department page and on this order.')}</span>
                    </li>
                  </ol>
                </CardContent>
              </Card>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5" />
              {existing ? t('dermat_orders.form.keysEdit', 'Ctrl/⌘ + Enter saves · Esc goes back') : t('dermat_orders.form.keys', 'Ctrl/⌘ + Enter goes to the next step · Esc goes back')}
            </p>
            <div className="flex items-center gap-2">
              {step > 0 ? (
                <Button type="button" variant="outline" onClick={() => setStep(step - 1)} disabled={saving}>
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  {t('dermat_orders.form.back', 'Back')}
                </Button>
              ) : null}
              {step < steps.length - 1 ? (
                <Button type="button" onClick={() => goTo(step + 1)} disabled={saving}>
                  {t('dermat_orders.form.next', 'Next: {step}', { step: steps[step + 1].label.replace(/^\d+\.\s*/, '') })}
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button type="submit" disabled={saving}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  {saving ? t('dermat_orders.form.saving', 'Saving…') : existing ? t('dermat_orders.form.save', 'Save order') : t('dermat_orders.form.book', 'Book order')}
                </Button>
              )}
            </div>
          </div>
        </form>
      </PageBody>
    </Page>
  )

}

export default OrderForm
