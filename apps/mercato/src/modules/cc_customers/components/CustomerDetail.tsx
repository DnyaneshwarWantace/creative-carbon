"use client"

import * as React from 'react'
import { useGranted } from '../../cc_departments/components/useGranted'
import { useListOptions } from '../../cc_lists/components/useListOptions'
import Link from 'next/link'
import { Building2, ClipboardList, Copy, FileText, FlaskConical, MapPin, MessageSquare, Package, Pencil, Plus, Receipt, Shapes, Wallet } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
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
import { CustomerStatement } from '../../cc_accounts/components/CustomerStatement'
import { usePaymentTerms } from '../../cc_lists/components/usePaymentTerms'
import { paymentTermLabel } from '../../cc_lists/lib/paymentTerms'
import { FieldList, LinkRows, Panel, PanelEmpty, RecordColumns, RecordPage, RecordState, formatCount, formatDay, formatKg, type Fact } from '../../cc_ui/components/RecordPage'
import { recordHref } from '../../cc_ui/lib/links'

type Row = Record<string, unknown> & { id: string }
type Address = { id: string; name: string | null; purpose: string | null; address_line1: string | null; address_line2: string | null; city: string | null; region: string | null; postal_code: string | null; country: string | null; is_primary: boolean | null }
type OrderRow = {
  id: string
  orderNo: string
  orderDate: string
  deliveryDate: string | null
  status: 'booked' | 'confirmed' | 'completed' | 'cancelled'
  orderType: string
  products: Array<{ id: string; title: string; code: string | null; quantity: number; unit?: string | null }>
  current: Array<{ key: string; label: string; status: string; responsibleName: string | null; days: number | null; holdParty: string | null }>
  doneCount: number
  stageCount: number
}

type OrderTab = 'open' | 'on_hold' | 'completed' | 'cancelled' | 'all'

type Connections = {
  enquiries: Array<{ id: string; no: string; date: string | null; subject: string | null; stage: string; nextActionOn: string | null; ownerName: string | null }> | null
  quotations: Array<{ id: string; no: string; date: string; status: string; total: number; orderId: string | null; orderNo: string | null }> | null
  proformas: Array<{ id: string; no: string; date: string; status: string; total: number; orderId: string | null; orderNo: string | null }> | null
  invoices: Array<{ id: string; no: string; kind: string; date: string; dueDate: string | null; status: string; total: number; orderId: string | null; orderNo: string | null }> | null
  dies: Array<{ id: string; dieNo: string; description: string | null; customerMouldNo: string | null; isActive: boolean }> | null
  labTests: Array<{ id: string; date: string; reportNo: string | null; itemTitle: string | null; testType: string | null; result: string; orderId: string | null; orderNo: string | null }> | null
}

const EMPTY_CONNECTIONS: Connections = { enquiries: null, quotations: null, proformas: null, invoices: null, dies: null, labTests: null }
const DOC_VARIANT: Record<string, StatusBadgeVariant> = { draft: 'neutral', sent: 'info', issued: 'success', accepted: 'success', converted: 'success', rejected: 'error', cancelled: 'neutral', expired: 'warning', won: 'success', lost: 'error', new: 'info', quoted: 'info', negotiating: 'warning', pass: 'success', fail: 'error', pending: 'warning' }
const COUNTED_UNITS = new Set(['nos', 'pcs', 'pc'])
const isCounted = (unit: string | null | undefined) => COUNTED_UNITS.has(String(unit ?? '').toLowerCase())

function money(value: number): string {
  return `₹ ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`
}

const UNREADABLE_RE = /^[A-Za-z0-9+/=]{8,}:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:v\d+$/
const ORDER_VARIANT: Record<string, StatusBadgeVariant> = { booked: 'info', confirmed: 'warning', completed: 'success', cancelled: 'neutral' }
const STAGE_VARIANT: Record<string, StatusBadgeVariant> = { open: 'warning', on_hold: 'error', done: 'success', skipped: 'neutral', waiting: 'neutral' }

const GST_TYPES = ['registered', 'unregistered', 'composition', 'overseas']
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

function daysUntil(value: string | null): number | null {
  if (!value) return null
  const target = new Date(`${value}T00:00:00`).getTime()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today.getTime()) / 86400000)
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
  const { runMutation } = useGuardedMutation({ contextId: `cc-customer-${company.id}` })
  const [values, setValues] = React.useState<EditValues | null>(null)
  const [saving, setSaving] = React.useState(false)
  const remarkOptions = useListOptions('payment_remarks', field(company, 'payment_remarks'))
  const termOptions = usePaymentTerms(field(company, 'payment_terms'))

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
      flash(t('cc_customers.errors.name', 'Enter the customer name.'), 'error')
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
        flash(call.result?.error ?? t('cc_customers.errors.save', 'Could not save the customer.'), 'error')
        return
      }
      flash(t('cc_customers.flash.saved', 'Customer saved'), 'success')
      onOpenChange(false)
      await onSaved()
    } catch {
      flash(t('cc_customers.errors.save', 'Could not save the customer.'), 'error')
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
          <SheetTitle>{t('cc_customers.edit.title', 'Customer details')}</SheetTitle>
          <SheetDescription className="text-xs">{t('cc_customers.edit.hint', 'GST, payment terms and sales manager are filled into every new order for this customer.')}</SheetDescription>
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
          {input('displayName', t('cc_customers.edit.name', 'Customer name *'))}
          {input('legalName', t('cc_customers.edit.legal', 'Legal / trade name'))}
          <div className="grid grid-cols-2 gap-3">
            {select('category', t('cc_customers.edit.category', 'Customer category'), [
              ['business', 'Business'],
              ['individual', 'Individual'],
            ])}
            {select(
              'gstType',
              t('cc_customers.edit.gstType', 'GST type'),
              GST_TYPES.map((value) => [value, value.charAt(0).toUpperCase() + value.slice(1)]),
            )}
          </div>
          {input('gstin', t('cc_customers.edit.gstin', 'GSTIN'), '27AAACR1234A1Z5')}
          {select('paymentTerms', t('cc_customers.edit.terms', 'Payment terms'), termOptions.map((option): [string, string] => [option.value, option.label]))}
          {select(
            'paymentRemarks',
            t('cc_customers.edit.remarks', 'Payment remarks'),
            remarkOptions.map((value) => [value, value]),
          )}
          {input('salesManager', t('cc_customers.edit.manager', 'Sales manager'))}
          <div className="grid grid-cols-2 gap-3">
            {input('phone', t('cc_customers.edit.phone', 'Phone'))}
            {input('email', t('cc_customers.edit.email', 'Email'))}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t p-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? t('cc_customers.edit.saving', 'Saving…') : t('cc_customers.edit.save', 'Save')}
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
  const [links, setLinks] = React.useState<Connections>(EMPTY_CONNECTIONS)

  const load = React.useCallback(async () => {
    const [companyCall, addressCall, orderCall, linksCall] = await Promise.all([
      apiCall<{ items?: Row[] }>(`/api/customers/companies?id=${encodeURIComponent(customerId)}&pageSize=1`, undefined, { fallback: { items: [] } }),
      apiCall<{ items?: Address[] }>(`/api/customers/addresses?entityId=${encodeURIComponent(customerId)}&pageSize=20`, undefined, { fallback: { items: [] } }),
      apiCall<{ items?: OrderRow[] }>(`/api/cc_orders/orders?customerId=${encodeURIComponent(customerId)}&pageSize=100`, undefined, { fallback: { items: [] } }),
      apiCall<Connections>(`/api/cc_customers/connections?id=${encodeURIComponent(customerId)}`, undefined, { fallback: EMPTY_CONNECTIONS }),
    ])
    const row = companyCall.result?.items?.[0]
    if (!row) {
      setLoadError(t('cc_customers.errors.load', 'Could not load this customer.'))
      return
    }
    setCompany(row)
    setAddresses(addressCall.result?.items ?? [])
    setOrders(orderCall.result?.items ?? [])
    setLinks(linksCall.result ?? EMPTY_CONNECTIONS)
  }, [customerId, t])

  React.useEffect(() => {
    load()
  }, [load])

  if (loadError || !company || !orders) {
    return <RecordState error={loadError} loadingLabel={t('cc_customers.loading', 'Loading customer…')} />
  }

  const name = readable(company.display_name) ?? field(company, 'legal_trade_name') ?? t('cc_customers.noName', '(no name)')
  const nameBroken = !readable(company.display_name)
  const live = orders.filter((order) => order.status !== 'cancelled')
  const open = orders.filter((order) => order.status === 'booked' || order.status === 'confirmed')
  const onHold = orders.filter((order) => order.current.some((stage) => stage.status === 'on_hold'))
  const late = open.filter((order) => (daysUntil(order.deliveryDate) ?? 0) < 0)
  const orderedKg = live.reduce((sum, order) => sum + order.products.filter((product) => !isCounted(product.unit)).reduce((inner, product) => inner + product.quantity, 0), 0)
  const orderedPcs = live.reduce((sum, order) => sum + order.products.filter((product) => isCounted(product.unit)).reduce((inner, product) => inner + product.quantity, 0), 0)
  const lastOrder = orders.length ? orders.reduce((latest, order) => (order.orderDate > latest.orderDate ? order : latest)) : null
  const amountOf = (quantity: number, unit: string | null | undefined) => (isCounted(unit) ? `${formatCount(quantity)} ${t('cc_ui.pcs', 'pcs')}` : `${formatKg(quantity)} kg`)

  const products = new Map<string, { id: string; title: string; code: string | null; quantity: number; unit: string | null; orders: number; last: string }>()
  for (const order of live) {
    for (const product of order.products) {
      const current = products.get(product.id)
      products.set(product.id, {
        id: product.id,
        title: product.title,
        code: product.code,
        quantity: (current?.quantity ?? 0) + product.quantity,
        unit: product.unit ?? null,
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

  const details: Array<[string, React.ReactNode]> = [
    [t('cc_customers.detail.legal', 'Legal / trade name'), field(company, 'legal_trade_name')],
    [t('cc_customers.detail.category', 'Category'), field(company, 'customer_type_category')],
    [t('cc_customers.detail.gstType', 'GST type'), field(company, 'gst_registration_type')],
    [t('cc_customers.detail.gstin', 'GSTIN'), field(company, 'gstin') ?? field(company, 'gst_number')],
    [t('cc_customers.detail.terms', 'Payment terms'), paymentTermLabel(field(company, 'payment_terms')) || null],
    [t('cc_customers.detail.remarks', 'Payment remarks'), field(company, 'payment_remarks')],
    [t('cc_customers.detail.manager', 'Sales manager'), field(company, 'sales_manager')],
    [t('cc_customers.detail.phone', 'Phone'), readable(company.primary_phone)],
    [t('cc_customers.detail.email', 'Email'), readable(company.primary_email)],
  ]

  const facts: Fact[] = [
    { label: t('cc_customers.detail.orders', 'Orders'), value: formatCount(live.length) },
    { label: t('cc_customers.detail.open', 'Open'), value: formatCount(open.length) },
    { label: t('cc_customers.detail.hold', 'On hold'), value: formatCount(onHold.length), tone: onHold.length ? 'bad' : undefined },
    { label: t('cc_customers.detail.late', 'Late'), value: formatCount(late.length), tone: late.length ? 'bad' : undefined },
    { label: t('cc_customers.detail.orderedKg', 'Ordered (kg)'), value: formatKg(orderedKg), hint: orderedPcs ? `+ ${formatCount(orderedPcs)} ${t('cc_ui.pcs', 'pcs')}` : undefined },
    { label: t('cc_customers.detail.last', 'Last order'), value: lastOrder ? formatDay(lastOrder.orderDate) : '—' },
  ]

  const docBadge = (status: string) => <StatusBadge variant={DOC_VARIANT[status] ?? 'neutral'}>{t(`cc_customers.docStatus.${status}`, status.replace(/_/g, ' '))}</StatusBadge>

  return (
    <>
      <RecordPage
        back={{ href: '/backend/customers/companies', label: t('cc_customers.nav.customer', 'Customer') }}
        overline={[t('cc_customers.detail.overline', 'Customer'), field(company, 'gstin') ? `GSTIN ${field(company, 'gstin')}` : null].filter(Boolean).join(' · ')}
        title={name}
        mono={false}
        badges={field(company, 'gst_registration_type') ? <StatusBadge variant="info">{field(company, 'gst_registration_type')}</StatusBadge> : null}
        meta={field(company, 'sales_manager') ? t('cc_customers.detail.managedBy', 'Sales manager {name}', { name: field(company, 'sales_manager') ?? '' }) : undefined}
        alert={nameBroken ? <p className="rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-sm text-status-warning-text">{t('cc_customers.detail.broken', 'The saved name could not be read. Open "Edit details" and save once to store it again.')}</p> : null}
        actions={
          <>
            {lastOrder && granted.has('cc_orders.manage') ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/backend/orders/new?copyFrom=${lastOrder.id}`}>
                  <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_customers.detail.repeat', 'Repeat last order')}
                </Link>
              </Button>
            ) : null}
            {granted.has('customers.companies.manage') ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/backend/customers/edit/${customerId}`}>
                  <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_customers.detail.edit', 'Edit details')}
                </Link>
              </Button>
            ) : null}
            {granted.has('cc_orders.manage') ? (
              <Button asChild size="sm">
                <Link href={`/backend/orders/new?customerId=${customerId}`}>
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_customers.detail.newOrder', 'New order')}
                </Link>
              </Button>
            ) : null}
          </>
        }
        facts={facts}
      >
        <RecordColumns
          main={
            <>
              <Panel title={t('cc_customers.detail.ordersTitle', 'Orders')} icon={ClipboardList} count={live.length} flush>
                <div className="border-b border-border px-3 pt-1">
                  <Tabs value={tab} onValueChange={(value) => setTab(value as OrderTab)} variant="underline">
                    <TabsList aria-label={t('cc_customers.detail.orderTabs', 'Order status')}>
                      <TabsTrigger value="open">{t('cc_orders.list.tab.open', 'Open')} ({open.length})</TabsTrigger>
                      <TabsTrigger value="on_hold">{t('cc_orders.list.tab.hold', 'On hold')} ({onHold.length})</TabsTrigger>
                      <TabsTrigger value="completed">{t('cc_orders.list.tab.completed', 'Completed')}</TabsTrigger>
                      <TabsTrigger value="cancelled">{t('cc_orders.list.tab.cancelled', 'Cancelled')}</TabsTrigger>
                      <TabsTrigger value="all">{t('cc_orders.list.tab.all', 'All')}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
                {visible.length ? (
                  <ul className="divide-y divide-border">
                    {visible.map((order) => {
                      const left = daysUntil(order.deliveryDate)
                      const isLate = left !== null && left < 0 && (order.status === 'booked' || order.status === 'confirmed')
                      return (
                        <li key={order.id} className="even:bg-muted/30">
                          <Link href={recordHref.order(order.id)} className="grid grid-cols-1 gap-2 px-3 py-2.5 hover:bg-muted/60 md:grid-cols-12 md:items-center">
                            <span className="md:col-span-3">
                              <span className="font-mono text-xs font-semibold">{order.orderNo}</span>
                              <span className="block text-xs text-muted-foreground">
                                {formatDay(order.orderDate)}
                                {order.orderType !== 'new' ? ` · ${order.orderType}` : ''}
                              </span>
                            </span>
                            <span className="min-w-0 text-sm md:col-span-4">
                              {order.products.map((product) => (
                                <span key={product.id} className="block truncate">
                                  {product.title} <span className="font-mono text-muted-foreground">{amountOf(product.quantity, product.unit)}</span>
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
                                  {order.doneCount}/{order.stageCount} {t('cc_customers.detail.stagesDone', 'stages done')}
                                </span>
                              )}
                            </span>
                            <span className="flex items-center justify-between gap-2 md:col-span-2 md:flex-col md:items-end">
                              <StatusBadge variant={ORDER_VARIANT[order.status] ?? 'neutral'}>{t(`cc_orders.status.${order.status}`, order.status)}</StatusBadge>
                              <span className={cn('text-xs', isLate ? 'font-semibold text-status-error-text' : 'text-muted-foreground')}>
                                {order.deliveryDate ? `${t('cc_customers.detail.due', 'Due')} ${formatDay(order.deliveryDate)}` : ''}
                              </span>
                            </span>
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <PanelEmpty>{t('cc_customers.detail.noOrders', 'No orders here.')}</PanelEmpty>
                )}
              </Panel>

              {links.invoices || links.proformas ? (
                <Panel title={t('cc_customers.detail.documents', 'Proformas and invoices')} icon={Receipt} count={(links.invoices?.length ?? 0) + (links.proformas?.length ?? 0)} flush>
                  <LinkRows
                    empty={t('cc_customers.detail.noDocuments', 'No proforma or invoice yet.')}
                    rows={[
                      ...(links.invoices ?? []).map((doc) => ({
                        sortKey: doc.date,
                        row: {
                        key: `inv-${doc.id}`,
                        href: recordHref.invoice(doc.id),
                        primary: <span className="font-mono">{doc.no}</span>,
                        secondary: [doc.kind === 'credit_note' ? t('cc_customers.detail.creditNote', 'Credit note') : t('cc_customers.detail.taxInvoice', 'Tax invoice'), doc.orderNo, doc.dueDate ? `${t('cc_customers.detail.due', 'Due')} ${formatDay(doc.dueDate)}` : null].filter(Boolean).join(' · '),
                        value: money(doc.total),
                        valueHint: formatDay(doc.date),
                        badge: docBadge(doc.status),
                        },
                      })),
                      ...(links.proformas ?? []).map((doc) => ({
                        sortKey: doc.date,
                        row: {
                        key: `pi-${doc.id}`,
                        href: recordHref.proforma(doc.id),
                        primary: <span className="font-mono">{doc.no}</span>,
                        secondary: [t('cc_customers.detail.proforma', 'Proforma'), doc.orderNo].filter(Boolean).join(' · '),
                        value: money(doc.total),
                        valueHint: formatDay(doc.date),
                        badge: docBadge(doc.status),
                        },
                      })),
                    ]
                      .sort((left, right) => right.sortKey.localeCompare(left.sortKey))
                      .map((entry) => entry.row)}
                  />
                </Panel>
              ) : null}

              {granted.has('cc_accounts.view') ? (
                <Panel title={t('cc_customers.detail.statement', 'Account statement')} icon={Wallet}>
                  <CustomerStatement customerId={customerId} customerName={name} />
                </Panel>
              ) : null}
            </>
          }
          side={
            <>
              <Panel
                title={t('cc_customers.detail.details', 'Details')}
                icon={Building2}
                action={
                  granted.has('customers.companies.manage') ? (
                    <button type="button" className="text-primary hover:underline" onClick={() => setEditOpen(true)}>
                      {t('cc_customers.detail.editShort', 'Edit')}
                    </button>
                  ) : null
                }
              >
                <FieldList columns={1} fields={details} />
              </Panel>

              <Panel title={t('cc_customers.detail.addresses', 'Addresses')} icon={MapPin} count={addresses.length}>
                {addresses.length ? (
                  <ul className="space-y-3 text-sm">
                    {addresses.map((address) => (
                      <li key={address.id}>
                        <span className="font-mono text-overline font-semibold uppercase tracking-widest text-muted-foreground">
                          {address.purpose || address.name || t('cc_customers.detail.address', 'Address')}
                          {address.is_primary ? ` · ${t('cc_customers.detail.primary', 'primary')}` : ''}
                        </span>
                        <span className="block">{[address.address_line1, address.address_line2, address.city, address.region, address.postal_code, address.country].filter(Boolean).join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('cc_customers.detail.noAddress', 'No address saved.')}</p>
                )}
              </Panel>

              <Panel title={t('cc_customers.detail.products', 'Products made for this customer')} icon={Package} count={products.size} flush>
                <LinkRows
                  empty={t('cc_customers.detail.noProducts', 'No products ordered yet.')}
                  rows={Array.from(products.values()).map((product) => ({
                    key: product.id,
                    href: recordHref.product(product.id),
                    primary: (
                      <>
                        {product.code ? <span className="mr-1 font-mono text-xs text-muted-foreground">{product.code}</span> : null}
                        {product.title}
                      </>
                    ),
                    secondary: t('cc_customers.detail.productOrders', '{count} orders · last {date}', { count: product.orders, date: formatDay(product.last) }),
                    value: amountOf(product.quantity, product.unit),
                  }))}
                />
              </Panel>

              {links.enquiries ? (
                <Panel title={t('cc_customers.detail.enquiries', 'Enquiries')} icon={MessageSquare} count={links.enquiries.length} flush>
                  <LinkRows
                    empty={t('cc_customers.detail.noEnquiries', 'No enquiry logged for this customer.')}
                    rows={links.enquiries.map((row) => ({
                      key: row.id,
                      href: recordHref.enquiry(row.id),
                      primary: <span className="font-mono">{row.no}</span>,
                      secondary: [row.subject, row.ownerName].filter(Boolean).join(' · '),
                      valueHint: row.nextActionOn ? t('cc_customers.detail.followUp', 'follow up {date}', { date: formatDay(row.nextActionOn) }) : formatDay(row.date),
                      value: '',
                      badge: docBadge(row.stage),
                    }))}
                  />
                </Panel>
              ) : null}

              {links.quotations ? (
                <Panel title={t('cc_customers.detail.quotations', 'Quotations')} icon={FileText} count={links.quotations.length} flush>
                  <LinkRows
                    empty={t('cc_customers.detail.noQuotations', 'No quotation yet.')}
                    rows={links.quotations.map((row) => ({
                      key: row.id,
                      href: recordHref.quotation(row.id),
                      primary: <span className="font-mono">{row.no}</span>,
                      secondary: [formatDay(row.date), row.orderNo ? t('cc_customers.detail.becameOrder', 'order {no}', { no: row.orderNo }) : null].filter(Boolean).join(' · '),
                      value: money(row.total),
                      badge: docBadge(row.status),
                    }))}
                  />
                </Panel>
              ) : null}

              {links.dies ? (
                <Panel title={t('cc_customers.detail.dies', 'Dies owned')} icon={Shapes} count={links.dies.length} flush>
                  <LinkRows
                    empty={t('cc_customers.detail.noDies', 'No die is marked as this customer’s.')}
                    rows={links.dies.map((row) => ({
                      key: row.id,
                      href: recordHref.die(row.id),
                      primary: <span className="font-mono">{row.dieNo}</span>,
                      secondary: [row.description, row.customerMouldNo ? t('cc_customers.detail.theirNo', 'their No. {no}', { no: row.customerMouldNo }) : null].filter(Boolean).join(' · '),
                      badge: row.isActive ? null : <StatusBadge variant="neutral">{t('cc_customers.detail.dieInactive', 'Not in use')}</StatusBadge>,
                    }))}
                  />
                </Panel>
              ) : null}

              {links.labTests ? (
                <Panel title={t('cc_customers.detail.labTests', 'Lab test reports')} icon={FlaskConical} count={links.labTests.length} flush>
                  <LinkRows
                    empty={t('cc_customers.detail.noLab', 'No lab report for this customer.')}
                    rows={links.labTests.map((row) => ({
                      key: row.id,
                      href: recordHref.labTest(row.id),
                      primary: <span className="font-mono">{row.reportNo ?? formatDay(row.date)}</span>,
                      secondary: [row.itemTitle, row.testType, row.orderNo].filter(Boolean).join(' · '),
                      valueHint: formatDay(row.date),
                      value: '',
                      badge: docBadge(row.result),
                    }))}
                  />
                </Panel>
              ) : null}
            </>
          }
        />
      </RecordPage>
      <EditSheet open={editOpen} onOpenChange={setEditOpen} company={company} onSaved={load} />
    </>
  )
}

export function CustomerDetailPage({ params }: { params?: { id?: string } }) {
  return <CustomerDetail key={params?.id} customerId={params?.id ?? ''} />
}

export default CustomerDetailPage
