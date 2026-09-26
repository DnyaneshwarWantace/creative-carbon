"use client"

import * as React from 'react'
import { useGranted } from '../../dermat_departments/components/useGranted'
import { useListOptions } from '../../dermat_lists/components/useListOptions'
import Link from 'next/link'
import { ArrowLeft, Building2, ClipboardList, Copy, MapPin, Package, Pencil, Plus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Tabs, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { CustomerStatement } from '../../dermat_accounts/components/CustomerStatement'

type Row = Record<string, unknown> & { id: string }
type Address = { id: string; name: string | null; purpose: string | null; address_line1: string | null; address_line2: string | null; city: string | null; region: string | null; postal_code: string | null; country: string | null; is_primary: boolean | null }
type OrderRow = {
  id: string
  orderNo: string
  orderDate: string
  deliveryDate: string | null
  status: 'booked' | 'confirmed' | 'completed' | 'cancelled'
  orderType: string
  products: Array<{ id: string; title: string; code: string | null; quantity: number }>
  current: Array<{ key: string; label: string; status: string; responsibleName: string | null; days: number | null; holdParty: string | null }>
  doneCount: number
  stageCount: number
}

type OrderTab = 'open' | 'on_hold' | 'completed' | 'cancelled' | 'all'

const UNREADABLE_RE = /^[A-Za-z0-9+/=]{8,}:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:v\d+$/
const ORDER_VARIANT: Record<string, StatusBadgeVariant> = { booked: 'info', confirmed: 'warning', completed: 'success', cancelled: 'neutral' }
const STAGE_VARIANT: Record<string, StatusBadgeVariant> = { open: 'warning', on_hold: 'error', done: 'success', skipped: 'neutral', waiting: 'neutral' }

const GST_TYPES = ['registered', 'unregistered', 'composition', 'overseas']
const PAYMENT_TERMS: Record<string, string> = {
  due_on_delivery: 'Due on delivery',
  '15_days': '15 days',
  '30_days': '30 days',
  '45_days': '45 days',
  '60_days': '60 days',
  '90_days': '90 days',
}
function readable(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed && !UNREADABLE_RE.test(trimmed) ? trimmed : null
}

function field(row: Row | null, key: string): string | null {
  if (!row) return null
  const value = row[`cf_${key}`] ?? (row.customFields as Row | undefined)?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function qty(value: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)
}

function date(value: string | null): string {
  if (!value) return '—'
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

function daysUntil(value: string | null): number | null {
  if (!value) return null
  const target = new Date(`${value}T00:00:00`).getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today.getTime()) / 86400000)
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-semibold', tone === 'bad' && 'text-status-error-text')}>{value}</div>
    </div>
  )
}

type EditValues = {
  displayName: string
  legalName: string
  category: string
  gstType: string
  gstin: string
  paymentTerms: string
  paymentRemarks: string
  salesManager: string
  email: string
  phone: string
}

function EditSheet({ open, onOpenChange, company, onSaved }: { open: boolean; onOpenChange: (open: boolean) => void; company: Row; onSaved: () => Promise<void> }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: `dermat-customer-${company.id}` })
  const [values, setValues] = React.useState<EditValues | null>(null)
  const [saving, setSaving] = React.useState(false)
  const remarkOptions = useListOptions('payment_remarks', field(company, 'payment_remarks'))

  React.useEffect(() => {
    if (!open) return
    setValues({
      displayName: readable(company.display_name) ?? field(company, 'legal_trade_name') ?? '',
      legalName: field(company, 'legal_trade_name') ?? '',
      category: field(company, 'customer_type_category') ?? 'business',
      gstType: field(company, 'gst_registration_type') ?? 'unregistered',
      gstin: field(company, 'gstin') ?? '',
      paymentTerms: field(company, 'payment_terms') ?? '',
      paymentRemarks: field(company, 'payment_remarks') ?? '',
      salesManager: field(company, 'sales_manager') ?? '',
      email: readable(company.primary_email) ?? '',
      phone: readable(company.primary_phone) ?? '',
    })
  }, [open, company])

  if (!values) return null
  const set = (patch: Partial<EditValues>) => setValues((prev) => (prev ? { ...prev, ...patch } : prev))

  const save = async () => {
    if (!values.displayName.trim()) {
      flash(t('dermat_customers.errors.name', 'Enter the customer name.'), 'error')
      return
    }
    setSaving(true)
    try {
      const body = {
        id: company.id,
        displayName: values.displayName.trim(),
        primaryEmail: values.email.trim() || null,
        primaryPhone: values.phone.trim() || null,
        cf_legal_trade_name: values.legalName.trim() || null,
        cf_customer_type_category: values.category,
        cf_gst_registration_type: values.gstType,
        cf_gstin: values.gstin.trim().toUpperCase() || null,
        cf_payment_terms: values.paymentTerms || null,
        cf_payment_remarks: values.paymentRemarks || null,
        cf_sales_manager: values.salesManager.trim() || null,
      }
      const call = await runMutation({
        context: { customerId: company.id },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(String(company.updated_at ?? '')), () =>
            apiCall<{ error?: string }>('/api/customers/companies', {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            }),
          ),
      })
      if (!call.ok) {
        flash(call.result?.error ?? t('dermat_customers.errors.save', 'Could not save the customer.'), 'error')
        return
      }
      flash(t('dermat_customers.flash.saved', 'Customer saved'), 'success')
      onOpenChange(false)
      await onSaved()
    } catch {
      flash(t('dermat_customers.errors.save', 'Could not save the customer.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const input = (id: keyof EditValues, label: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`customer-${id}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={`customer-${id}`} value={values[id]} placeholder={placeholder} onChange={(event) => set({ [id]: event.target.value } as Partial<EditValues>)} />
    </div>
  )

  const select = (id: keyof EditValues, label: string, options: Array<[string, string]>) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={values[id] || '__none'} onValueChange={(next) => set({ [id]: next === '__none' ? '' : next } as Partial<EditValues>)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">—</SelectItem>
          {options.map(([value, text]) => (
            <SelectItem key={value} value={value}>
              {text}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{t('dermat_customers.edit.title', 'Customer details')}</SheetTitle>
          <SheetDescription className="text-xs">{t('dermat_customers.edit.hint', 'GST, payment terms and sales manager are filled into every new order for this customer.')}</SheetDescription>
        </SheetHeader>
        <div
          className="flex-1 space-y-4 overflow-auto p-4"
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              save()
            }
          }}
        >
          {input('displayName', t('dermat_customers.edit.name', 'Customer name *'))}
          {input('legalName', t('dermat_customers.edit.legal', 'Legal / trade name'))}
          <div className="grid grid-cols-2 gap-3">
            {select('category', t('dermat_customers.edit.category', 'Customer category'), [
              ['business', 'Business'],
              ['individual', 'Individual'],
            ])}
            {select(
              'gstType',
              t('dermat_customers.edit.gstType', 'GST type'),
              GST_TYPES.map((value) => [value, value.charAt(0).toUpperCase() + value.slice(1)]),
            )}
          </div>
          {input('gstin', t('dermat_customers.edit.gstin', 'GSTIN'), '27AAACR1234A1Z5')}
          {select('paymentTerms', t('dermat_customers.edit.terms', 'Payment terms'), Object.entries(PAYMENT_TERMS))}
          {select(
            'paymentRemarks',
            t('dermat_customers.edit.remarks', 'Payment remarks'),
            remarkOptions.map((value) => [value, value]),
          )}
          {input('salesManager', t('dermat_customers.edit.manager', 'Sales manager'))}
          <div className="grid grid-cols-2 gap-3">
            {input('phone', t('dermat_customers.edit.phone', 'Phone'))}
            {input('email', t('dermat_customers.edit.email', 'Email'))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? t('dermat_customers.edit.saving', 'Saving…') : t('dermat_customers.edit.save', 'Save')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function CustomerDetail({ customerId }: { customerId: string }) {
  const t = useT()
  const granted = useGranted()
  const [company, setCompany] = React.useState<Row | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [addresses, setAddresses] = React.useState<Address[]>([])
  const [orders, setOrders] = React.useState<OrderRow[] | null>(null)
  const [tab, setTab] = React.useState<OrderTab>('open')
  const [editOpen, setEditOpen] = React.useState(false)

  const load = React.useCallback(async () => {
    const [companyCall, addressCall, orderCall] = await Promise.all([
      apiCall<{ items?: Row[] }>(`/api/customers/companies?id=${encodeURIComponent(customerId)}&pageSize=1`, undefined, { fallback: { items: [] } }),
      apiCall<{ items?: Address[] }>(`/api/customers/addresses?entityId=${encodeURIComponent(customerId)}&pageSize=20`, undefined, { fallback: { items: [] } }),
      apiCall<{ items?: OrderRow[] }>(`/api/dermat_orders/orders?customerId=${encodeURIComponent(customerId)}&pageSize=100`, undefined, { fallback: { items: [] } }),
    ])
    const row = companyCall.result?.items?.[0]
    if (!row) {
      setLoadError(t('dermat_customers.errors.load', 'Could not load this customer.'))
      return
    }
    setCompany(row)
    setAddresses(addressCall.result?.items ?? [])
    setOrders(orderCall.result?.items ?? [])
  }, [customerId, t])

  React.useEffect(() => {
    load()
  }, [load])

  if (loadError) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={loadError} />
        </PageBody>
      </Page>
    )
  }
  if (!company || !orders) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dermat_customers.loading', 'Loading customer…')} />
        </PageBody>
      </Page>
    )
  }

  const name = readable(company.display_name) ?? field(company, 'legal_trade_name') ?? t('dermat_customers.noName', '(no name)')
  const nameBroken = !readable(company.display_name)
  const live = orders.filter((order) => order.status !== 'cancelled')
  const open = orders.filter((order) => order.status === 'booked' || order.status === 'confirmed')
  const onHold = orders.filter((order) => order.current.some((stage) => stage.status === 'on_hold'))
  const late = open.filter((order) => (daysUntil(order.deliveryDate) ?? 0) < 0)
  const pieces = live.reduce((sum, order) => sum + order.products.reduce((inner, product) => inner + product.quantity, 0), 0)
  const lastOrder = orders.length ? orders.reduce((latest, order) => (order.orderDate > latest.orderDate ? order : latest)) : null

  const products = new Map<string, { id: string; title: string; code: string | null; pieces: number; orders: number; last: string }>()
  for (const order of live) {
    for (const product of order.products) {
      const current = products.get(product.id)
      products.set(product.id, {
        id: product.id,
        title: product.title,
        code: product.code,
        pieces: (current?.pieces ?? 0) + product.quantity,
        orders: (current?.orders ?? 0) + 1,
        last: current && current.last > order.orderDate ? current.last : order.orderDate,
      })
    }
  }

  const visible = orders.filter((order) => {
    if (tab === 'all') return true
    if (tab === 'on_hold') return order.current.some((stage) => stage.status === 'on_hold')
    if (tab === 'open') return order.status === 'booked' || order.status === 'confirmed'
    return order.status === tab
  })

  const details: Array<[string, string]> = [
    [t('dermat_customers.detail.legal', 'Legal / trade name'), field(company, 'legal_trade_name') ?? '—'],
    [t('dermat_customers.detail.category', 'Category'), field(company, 'customer_type_category') ?? '—'],
    [t('dermat_customers.detail.gstType', 'GST type'), field(company, 'gst_registration_type') ?? '—'],
    [t('dermat_customers.detail.gstin', 'GSTIN'), field(company, 'gstin') ?? field(company, 'gst_number') ?? '—'],
    [t('dermat_customers.detail.terms', 'Payment terms'), PAYMENT_TERMS[field(company, 'payment_terms') ?? ''] ?? field(company, 'payment_terms') ?? '—'],
    [t('dermat_customers.detail.remarks', 'Payment remarks'), field(company, 'payment_remarks') ?? '—'],
    [t('dermat_customers.detail.manager', 'Sales manager'), field(company, 'sales_manager') ?? '—'],
    [t('dermat_customers.detail.phone', 'Phone'), readable(company.primary_phone) ?? '—'],
    [t('dermat_customers.detail.email', 'Email'), readable(company.primary_email) ?? '—'],
  ]

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-5 pb-16">
          <div className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <Link href="/backend/customers/companies" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" />
                {t('dermat_customers.nav.customer', 'Customer')}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                <h1 className="text-xl font-bold">{name}</h1>
                {field(company, 'gst_registration_type') ? <StatusBadge variant="info">{field(company, 'gst_registration_type')}</StatusBadge> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {[field(company, 'gstin') ? `GSTIN ${field(company, 'gstin')}` : null, field(company, 'sales_manager') ? `Sales manager ${field(company, 'sales_manager')}` : null]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              {nameBroken ? (
                <p className="text-xs text-status-warning-text">
                  {t('dermat_customers.detail.broken', 'The saved name could not be read. Open "Edit details" and save once to store it again.')}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {lastOrder && granted.has('dermat_orders.manage') ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/backend/orders/new?copyFrom=${lastOrder.id}`}>
                    <Copy className="mr-1.5 h-4 w-4" />
                    {t('dermat_customers.detail.repeat', 'Repeat last order')}
                  </Link>
                </Button>
              ) : null}
              {granted.has('customers.companies.manage') ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/backend/customers/edit/${customerId}`}>
                  <Pencil className="mr-1.5 h-4 w-4" />
                  {t('dermat_customers.detail.edit', 'Edit details')}
                </Link>
              </Button>
              ) : null}
              {granted.has('dermat_orders.manage') ? (
              <Button asChild size="sm">
                <Link href={`/backend/orders/new?customerId=${customerId}`}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {t('dermat_customers.detail.newOrder', 'New order')}
                </Link>
              </Button>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Tile label={t('dermat_customers.detail.orders', 'Orders')} value={qty(live.length)} />
            <Tile label={t('dermat_customers.detail.open', 'Open')} value={qty(open.length)} />
            <Tile label={t('dermat_customers.detail.hold', 'On hold')} value={qty(onHold.length)} tone={onHold.length ? 'bad' : undefined} />
            <Tile label={t('dermat_customers.detail.late', 'Late')} value={qty(late.length)} tone={late.length ? 'bad' : undefined} />
            <Tile label={t('dermat_customers.detail.pieces', 'Pieces ordered')} value={qty(pieces)} />
            <Tile label={t('dermat_customers.detail.last', 'Last order')} value={lastOrder ? date(lastOrder.orderDate) : '—'} />
          </div>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
            <Card className="overflow-hidden lg:col-span-8">
              <CardHeader className="border-b bg-muted/20 pb-0">
                <CardTitle className="flex items-center gap-2 pb-2 text-sm font-bold">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  {t('dermat_customers.detail.ordersTitle', 'Orders')}
                </CardTitle>
                <Tabs value={tab} onValueChange={(value) => setTab(value as OrderTab)} variant="underline">
                  <TabsList aria-label={t('dermat_customers.detail.orderTabs', 'Order status')}>
                    <TabsTrigger value="open">{t('dermat_orders.list.tab.open', 'Open')} ({open.length})</TabsTrigger>
                    <TabsTrigger value="on_hold">{t('dermat_orders.list.tab.hold', 'On hold')} ({onHold.length})</TabsTrigger>
                    <TabsTrigger value="completed">{t('dermat_orders.list.tab.completed', 'Completed')}</TabsTrigger>
                    <TabsTrigger value="cancelled">{t('dermat_orders.list.tab.cancelled', 'Cancelled')}</TabsTrigger>
                    <TabsTrigger value="all">{t('dermat_orders.list.tab.all', 'All')}</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="p-0">
                {visible.length ? (
                  <ul className="divide-y">
                    {visible.map((order) => {
                      const left = daysUntil(order.deliveryDate)
                      const isLate = left !== null && left < 0 && (order.status === 'booked' || order.status === 'confirmed')
                      return (
                        <li key={order.id}>
                          <Link href={`/backend/orders/${order.id}`} className="grid grid-cols-1 gap-2 px-4 py-3 hover:bg-muted/30 md:grid-cols-12 md:items-center">
                            <span className="md:col-span-3">
                              <span className="font-mono text-xs font-semibold">{order.orderNo}</span>
                              <span className="block text-xs text-muted-foreground">
                                {date(order.orderDate)}
                                {order.orderType !== 'new' ? ` · ${order.orderType}` : ''}
                              </span>
                            </span>
                            <span className="min-w-0 text-sm md:col-span-4">
                              {order.products.map((product) => (
                                <span key={product.id} className="block truncate">
                                  {product.title} <span className="text-muted-foreground">× {qty(product.quantity)}</span>
                                </span>
                              ))}
                            </span>
                            <span className="flex flex-col gap-1 md:col-span-3">
                              {order.current.length ? (
                                order.current.map((stage) => (
                                  <span key={stage.key} className="flex flex-wrap items-center gap-1.5 text-xs">
                                    <StatusBadge variant={STAGE_VARIANT[stage.status] ?? 'neutral'} dot>
                                      {stage.label}
                                    </StatusBadge>
                                    <span className="text-muted-foreground">{[stage.status === 'on_hold' ? stage.holdParty : null, stage.responsibleName].filter(Boolean).join(' · ')}</span>
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  {order.doneCount}/{order.stageCount} {t('dermat_customers.detail.stagesDone', 'stages done')}
                                </span>
                              )}
                            </span>
                            <span className="flex items-center justify-between gap-2 md:col-span-2 md:flex-col md:items-end">
                              <StatusBadge variant={ORDER_VARIANT[order.status] ?? 'neutral'}>{t(`dermat_orders.status.${order.status}`, order.status)}</StatusBadge>
                              <span className={cn('text-xs', isLate ? 'font-semibold text-status-error-text' : 'text-muted-foreground')}>
                                {order.deliveryDate ? `${t('dermat_customers.detail.due', 'Due')} ${date(order.deliveryDate)}` : ''}
                              </span>
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="p-6 text-center text-sm text-muted-foreground">{t('dermat_customers.detail.noOrders', 'No orders here.')}</p>
                )}
              </CardContent>
            </Card>

            <Card className="lg:col-span-8 lg:row-start-2">
              <CardContent className="pt-4">
                <CustomerStatement customerId={customerId} customerName={name} />
              </CardContent>
            </Card>

            <div className="space-y-5 lg:col-span-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    <Building2 className="h-4 w-4 text-primary" />
                    {t('dermat_customers.detail.details', 'Details')}
                  </CardTitle>
                  <button type="button" className="text-xs text-primary hover:underline" onClick={() => setEditOpen(true)}>
                    {t('dermat_customers.detail.editShort', 'Edit')}
                  </button>
                </CardHeader>
                <CardContent className="pt-2">
                  <dl>
                    {details.map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-3 border-b py-1.5 text-sm last:border-b-0">
                        <dt className="text-muted-foreground">{label}</dt>
                        <dd className="text-right">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    <MapPin className="h-4 w-4 text-primary" />
                    {t('dermat_customers.detail.addresses', 'Addresses')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-3">
                  {addresses.length ? (
                    <ul className="space-y-3 text-sm">
                      {addresses.map((address) => (
                        <li key={address.id}>
                          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {address.purpose || address.name || t('dermat_customers.detail.address', 'Address')}
                            {address.is_primary ? ` · ${t('dermat_customers.detail.primary', 'primary')}` : ''}
                          </span>
                          <span className="block">
                            {[address.address_line1, address.address_line2, address.city, address.region, address.postal_code, address.country].filter(Boolean).join(', ')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('dermat_customers.detail.noAddress', 'No address saved.')}</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    <Package className="h-4 w-4 text-primary" />
                    {t('dermat_customers.detail.products', 'Products made for this customer')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {products.size ? (
                    <ul className="divide-y text-sm">
                      {Array.from(products.values()).map((product) => (
                        <li key={product.id}>
                          <Link href={`/backend/products/${product.id}`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-muted/30">
                            <span className="min-w-0">
                              <span className="block truncate">
                                {product.code ? <span className="mr-1 font-mono text-xs text-muted-foreground">{product.code}</span> : null}
                                {product.title}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {qty(product.pieces)} pcs · {product.orders} {t('dermat_customers.detail.ordersWord', 'orders')}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">{date(product.last)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="p-4 text-sm text-muted-foreground">{t('dermat_customers.detail.noProducts', 'No products ordered yet.')}</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
        <EditSheet open={editOpen} onOpenChange={setEditOpen} company={company} onSaved={load} />
      </PageBody>
    </Page>
  )
}

export function CustomerDetailPage({ params }: { params?: { id?: string } }) {
  return <CustomerDetail key={params?.id} customerId={params?.id ?? ''} />
}

export default CustomerDetailPage
