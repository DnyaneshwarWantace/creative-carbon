"use client"

import * as React from 'react'
import { useGranted } from '../../cc_departments/components/useGranted'
import Link from 'next/link'
import { Building2, ClipboardList, Combine, Copy, FileText, FlaskConical, MapPin, MessageSquare, Package, Pencil, Plus, Power, Receipt, Shapes, Wallet } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Tabs, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { CustomerStatement } from '../../cc_accounts/components/CustomerStatement'
import { paymentTermLabel } from '../../cc_lists/lib/paymentTerms'
import { FieldList, LinkRows, Panel, PanelEmpty, RecordColumns, RecordPage, RecordState, formatCount, formatDay, formatKg, type Fact } from '../../cc_ui/components/RecordPage'
import { recordHref } from '../../cc_ui/lib/links'
import { Timeline } from '../../cc_ui/components/Timeline'
import { Comments } from '../../cc_ui/components/Comments'
import { Attachments } from '../../cc_ui/components/Attachments'
import { CorrectDialog } from '../../cc_ui/components/CorrectDialog'
import { SearchPicker } from '../../cc_orders/components/SearchPicker'
import { searchCustomers } from '../../cc_orders/components/loaders'

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


export function CustomerDetail({ customerId }: { customerId: string }) {
  const t = useT()
  const granted = useGranted()
  const [company, setCompany] = React.useState<Row | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [addresses, setAddresses] = React.useState<Address[]>([])
  const [orders, setOrders] = React.useState<OrderRow[] | null>(null)
  const [tab, setTab] = React.useState<OrderTab>('open')
  const [action, setAction] = React.useState<'deactivate' | 'activate' | 'merge' | null>(null)
  const [mergeWith, setMergeWith] = React.useState<{ id: string; name: string } | null>(null)
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

  const customerStatus = typeof company.status === 'string' ? company.status : null
  const act = async (kind: 'deactivate' | 'activate' | 'merge', reason: string): Promise<boolean> => {
    const body = { id: customerId, action: kind, reason, ...(kind === 'merge' ? { mergeId: mergeWith?.id } : {}) }
    const call = await apiCall<{ ok?: boolean; moved?: string[]; error?: string }>('/api/cc_customers/customers/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (!call.ok) {
      flash(call.result?.error ?? t('cc_customers.errors.action', 'Could not do that.'), 'error')
      return false
    }
    flash(kind === 'merge' ? t('cc_customers.flash.merged', 'Merged. {moved}', { moved: (call.result?.moved ?? []).join(', ') || t('cc_customers.flash.nothingMoved', 'Nothing had to move.') }) : kind === 'activate' ? t('cc_customers.flash.activated', 'Customer is active again') : t('cc_customers.flash.deactivated', 'Customer set inactive'), 'success')
    setMergeWith(null)
    await load()
    return true
  }

  const docBadge = (status: string) => <StatusBadge variant={DOC_VARIANT[status] ?? 'neutral'}>{t(`cc_customers.docStatus.${status}`, status.replace(/_/g, ' '))}</StatusBadge>

  return (
    <>
      <RecordPage
        back={{ href: '/backend/customers/companies', label: t('cc_customers.nav.customer', 'Customer') }}
        overline={[t('cc_customers.detail.overline', 'Customer'), field(company, 'gstin') ? `GSTIN ${field(company, 'gstin')}` : null].filter(Boolean).join(' · ')}
        title={name}
        mono={false}
        badges={
          <>
            {field(company, 'gst_registration_type') ? <StatusBadge variant="info">{field(company, 'gst_registration_type')}</StatusBadge> : null}
            {customerStatus === 'inactive' ? <StatusBadge variant="neutral">{t('cc_customers.detail.inactive', 'Inactive')}</StatusBadge> : null}
            {customerStatus === 'merged' ? <StatusBadge variant="warning">{t('cc_customers.detail.merged', 'Merged into another customer')}</StatusBadge> : null}
          </>
        }
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
            {granted.has('cc_crm.merge') && customerStatus !== 'merged' ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setAction('merge')}>
                <Combine className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_customers.detail.merge', 'Merge a duplicate')}
              </Button>
            ) : null}
            {granted.has('customers.companies.manage') && customerStatus !== 'merged' ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setAction(customerStatus === 'inactive' ? 'activate' : 'deactivate')}>
                <Power className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {customerStatus === 'inactive' ? t('cc_customers.detail.activate', 'Set active') : t('cc_customers.detail.deactivate', 'Set inactive')}
              </Button>
            ) : null}
            {granted.has('cc_orders.manage') && customerStatus !== 'inactive' && customerStatus !== 'merged' ? (
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
                    <Link className="text-primary hover:underline" href={`/backend/customers/edit/${customerId}`}>
                      {t('cc_customers.detail.editShort', 'Edit')}
                    </Link>
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
        <Attachments type="customer" id={customerId} hint={t('cc_customers.detail.filesHint', 'GST certificate, PAN, cancelled cheque, customer PO templates.')} />
        <Comments type="customer" id={customerId} />
        <Timeline type="customer" id={customerId} refreshKey={String(company.updated_at ?? '')} />
      </RecordPage>
      <CorrectDialog
        open={action === 'deactivate' || action === 'activate'}
        onOpenChange={(next) => !next && setAction(null)}
        destructive={action === 'deactivate'}
        title={action === 'activate' ? t('cc_customers.detail.activateTitle', 'Set {name} active again?', { name }) : t('cc_customers.detail.deactivateTitle', 'Set {name} inactive?', { name })}
        undo={action === 'activate' ? [t('cc_customers.detail.activateUndo', 'Shows again when booking orders and quotations')] : [t('cc_customers.detail.deactivateUndo', 'Hidden when booking new orders and quotations'), t('cc_customers.detail.deactivateKeep', 'Old orders, invoices and payments stay as they are')]}
        confirmLabel={action === 'activate' ? t('cc_customers.detail.activate', 'Set active') : t('cc_customers.detail.deactivate', 'Set inactive')}
        onConfirm={(reason) => act(action === 'activate' ? 'activate' : 'deactivate', reason)}
      />
      <CorrectDialog
        open={action === 'merge'}
        onOpenChange={(next) => !next && setAction(null)}
        title={t('cc_customers.detail.mergeTitle', 'Merge a duplicate into {name}', { name })}
        description={
          <span className="mt-2 block space-y-2">
            <span className="block">{t('cc_customers.detail.mergeHint', 'Pick the duplicate. Its enquiries, quotations, orders, proformas, invoices, lab reports and dies move to this customer; the duplicate is kept for history and hidden.')}</span>
            <SearchPicker
              value={mergeWith ? { id: mergeWith.id, primary: mergeWith.name, value: mergeWith } : null}
              placeholder={t('cc_customers.detail.mergePick', 'Pick the duplicate customer')}
              searchPlaceholder={t('cc_customers.detail.mergeSearch', 'Search name or GSTIN')}
              load={async (query) => (await searchCustomers(query)).filter((option) => option.id !== customerId).map((option) => ({ ...option, value: { id: option.id, name: option.primary } }))}
              onSelect={(option) => setMergeWith(option.value)}
            />
          </span>
        }
        undo={mergeWith ? [t('cc_customers.detail.mergeUndo', '{dup} is merged into {name}', { dup: mergeWith.name, name })] : []}
        confirmLabel={t('cc_customers.detail.mergeConfirm', 'Merge')}
        onConfirm={(reason) => (mergeWith ? act('merge', reason) : Promise.resolve(false))}
      />
    </>
  )
}

export function CustomerDetailPage({ params }: { params?: { id?: string } }) {
  return <CustomerDetail key={params?.id} customerId={params?.id ?? ''} />
}

export default CustomerDetailPage
