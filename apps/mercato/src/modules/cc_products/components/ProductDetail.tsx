"use client"

import * as React from 'react'
import { useGranted } from '../../cc_departments/components/useGranted'
import Link from 'next/link'
import { ArrowLeft, Boxes, ClipboardList, FileStack, History, Pencil, Plus, Users, Warehouse } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { KIND_CONFIG } from '../lib/kindConfig'
import type { ProductKind } from '../lib/kinds'
import { COMMON_FIELD_KEYS, fieldsForKind, loadProductFieldDefs, type ProductFieldDef } from '../lib/fieldDefs'

type Row = Record<string, unknown> & { id: string }
type StockDetail = {
  stores: Array<{ code: string; onHand: number; reserved: number; available: number }>
  batches: Array<{ lotNumber: string; store: string | null; onHand: number; expiresAt: string | null; manufacturedAt: string | null; status: string | null }>
  movements: Array<{ at: string; type: string; quantity: number; from: string | null; to: string | null; lotNumber: string | null; reason: string | null }>
}
type OrderRow = {
  id: string
  orderNo: string
  orderDate: string
  customerId: string
  customerName: string
  status: string
  products: Array<{ id: string; title: string; quantity: number }>
  current: Array<{ label: string; status: string; responsibleName: string | null }>
}
type Packing = { id: string; title: string; type: string; sku: string | null }
type PurchaseRow = { id: string; code: string; vendorName: string; poDate: string; expectedDate: string | null; status: string; product: { quantity: number; received: number; rate: number; unit: string } | null }
const PO_VARIANT: Record<string, StatusBadgeVariant> = { draft: 'neutral', pending_approval: 'warning', approved: 'info', partly_received: 'info', received: 'success', cancelled: 'error' }
const PO_LABEL: Record<string, string> = { draft: 'Draft', pending_approval: 'Waiting approval', approved: 'Approved', partly_received: 'Partly received', received: 'Received', cancelled: 'Cancelled' }

const ORDER_VARIANT: Record<string, StatusBadgeVariant> = { booked: 'info', confirmed: 'warning', completed: 'success', cancelled: 'neutral' }
const KIND_SHORT: Record<string, string> = { raw_material: 'RM', packing_material: 'PM', bulk: 'Bulk', finished_goods: 'FG', rnd: 'R&D' }

function read(row: Row | null, key: string): unknown {
  if (!row) return undefined
  const direct = row[key] ?? row[`cf_${key}`]
  if (direct !== undefined && direct !== null) return direct
  const custom = row.customFields
  return custom && typeof custom === 'object' ? (custom as Row)[key] : undefined
}

function text(value: unknown): string {
  return value === undefined || value === null || value === '' ? '—' : String(value)
}

function qty(value: number, digits = 3): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(value)
}

function date(value: string | null): string {
  return value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'bad' | 'ok' }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn('text-lg font-semibold', tone === 'bad' && 'text-status-error-text', tone === 'ok' && 'text-status-success-text')}>{value}</div>
    </div>
  )
}

function Section({ icon: Icon, title, description, action, children, flush }: {
  icon: typeof Boxes
  title: string
  description?: string
  action?: React.ReactNode
  children: React.ReactNode
  flush?: boolean
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-2 border-b bg-muted/20 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-bold">
            <Icon className="h-4 w-4 text-primary" />
            {title}
          </CardTitle>
          {description ? <CardDescription className="text-xs">{description}</CardDescription> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className={flush ? 'p-0' : 'pt-3'}>{children}</CardContent>
    </Card>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="p-4 text-sm text-muted-foreground">{children}</p>
}

export function ProductDetail({ productId }: { productId: string }) {
  const t = useT()
  const granted = useGranted()
  const [product, setProduct] = React.useState<Row | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [defs, setDefs] = React.useState<ProductFieldDef[]>([])
  const [profile, setProfile] = React.useState<Row | null>(null)
  const [stock, setStock] = React.useState<StockDetail | null>(null)
  const [orders, setOrders] = React.useState<OrderRow[] | null>(null)
  const [packing, setPacking] = React.useState<Packing[]>([])
  const [purchases, setPurchases] = React.useState<PurchaseRow[] | null>(null)
  const [parent, setParent] = React.useState<{ id: string; title: string } | null>(null)

  const kind = (text(read(product, 'custom_fieldset_code')) as ProductKind) || null
  const config = kind && KIND_CONFIG[kind] ? KIND_CONFIG[kind] : null

  React.useEffect(() => {
    if (!granted.ready) return
    let cancelled = false
    const may = (feature: string) => granted.has(feature)
    ;(async () => {
      const call = await apiCall<{ items?: Row[] }>(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`, undefined, { fallback: { items: [] } })
      const item = call.result?.items?.[0]
      if (cancelled) return
      if (!item) {
        setLoadError(t('cc_products.errors.load', 'Could not load this product.'))
        return
      }
      setProduct(item)
      const itemKind = String(read(item, 'custom_fieldset_code') ?? '')
      const [allDefs, profileCall, stockCall] = await Promise.all([
        loadProductFieldDefs(),
        may('wms.view')
          ? apiCall<{ items?: Row[] }>(`/api/wms/inventory-profiles?catalogProductId=${encodeURIComponent(productId)}&pageSize=1`, undefined, { fallback: { items: [] } })
          : Promise.resolve({ result: { items: [] as Row[] } }),
        apiCall<StockDetail>(`/api/cc_products/stock-detail?productId=${encodeURIComponent(productId)}`, undefined, { fallback: { stores: [], batches: [], movements: [] } }),
      ])
      if (cancelled) return
      const kindConfig = KIND_CONFIG[itemKind as ProductKind]
      setDefs(kindConfig ? fieldsForKind(allDefs, itemKind as ProductKind, kindConfig.fields.map((field) => field.key)) : [])
      setProfile(profileCall.result?.items?.[0] ?? null)
      setStock(stockCall.result ?? { stores: [], batches: [], movements: [] })
      if (itemKind === 'raw_material' || itemKind === 'packing_material') {
        if (may('cc_purchase.view')) {
          apiCall<{ items?: PurchaseRow[] }>(`/api/cc_purchase/orders?productId=${encodeURIComponent(productId)}&pageSize=20`, undefined, { fallback: { items: [] } }).then((call) => {
            if (!cancelled) setPurchases(call.result?.items ?? [])
          })
        } else setPurchases([])
      }

      let fgIds: string[] = []
      if (itemKind === 'finished_goods') {
        fgIds = [productId]
        const packCall = await apiCall<{ items?: Packing[] }>(`/api/cc_products/packing?productId=${encodeURIComponent(productId)}`, undefined, { fallback: { items: [] } })
        if (!cancelled) setPacking(packCall.result?.items ?? [])
      }
      const parentId = String(read(item, 'parent_product_id') ?? '')
      if (parentId) {
        const parentCall = await apiCall<{ items?: Row[] }>(`/api/catalog/products?id=${encodeURIComponent(parentId)}&pageSize=1`, undefined, { fallback: { items: [] } })
        const parentRow = parentCall.result?.items?.[0]
        if (!cancelled && parentRow) setParent({ id: parentRow.id, title: String(parentRow.title ?? '') })
      }
      const orderLists = await Promise.all(
        (may('cc_orders.view') ? fgIds.slice(0, 20) : []).map((id) =>
          apiCall<{ items?: OrderRow[] }>(
            `/api/cc_orders/orders?productId=${encodeURIComponent(id)}&pageSize=20${itemKind === 'finished_goods' ? '' : '&status=open'}`,
            undefined,
            { fallback: { items: [] } },
          ),
        ),
      )
      if (cancelled) return
      const merged = new Map<string, OrderRow>()
      for (const list of orderLists) for (const order of list.result?.items ?? []) merged.set(order.id, order)
      setOrders(Array.from(merged.values()).sort((a, b) => b.orderDate.localeCompare(a.orderDate)))
    })()
    return () => {
      cancelled = true
    }
  }, [productId, t, granted])

  if (loadError) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={loadError} />
        </PageBody>
      </Page>
    )
  }
  if (!product || !config || !kind) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('cc_products.detail.loading', 'Loading product…')} />
        </PageBody>
      </Page>
    )
  }

  const unit = text(read(product, 'default_unit'))
  const onHand = stock?.stores.reduce((sum, row) => sum + row.onHand, 0) ?? 0
  const available = stock?.stores.reduce((sum, row) => sum + row.available, 0) ?? 0
  const minStock = Number(read(profile, 'reorder_point') ?? read(profile, 'reorderPoint') ?? 0)
  const code = text(read(product, 'item_code'))
  const customers = new Map<string, { id: string; name: string; pieces: number; last: string }>()
  if (kind === 'finished_goods') {
    for (const order of orders ?? []) {
      if (order.status === 'cancelled') continue
      const pieces = order.products.filter((entry) => entry.id === productId).reduce((sum, entry) => sum + entry.quantity, 0)
      const current = customers.get(order.customerId)
      customers.set(order.customerId, {
        id: order.customerId,
        name: order.customerName,
        pieces: (current?.pieces ?? 0) + pieces,
        last: current && current.last > order.orderDate ? current.last : order.orderDate,
      })
    }
  }

  const liquid = ['l', 'ml'].includes(unit.toLowerCase())
  const showField = (key: string) => !COMMON_FIELD_KEYS.has(key) && (key !== 'specific_gravity' || kind !== 'raw_material' || liquid)
  const details: Array<[string, string]> = [
    [config.codeLabel, code],
    [t('cc_products.form.unit', 'Unit'), unit],
    [t('cc_products.detail.hsn', 'HSN code'), text(read(product, 'hsn_code'))],
    ...defs.filter((def) => showField(def.key)).map((def) => [def.label, text(read(product, def.key))] as [string, string]),
    [t('cc_products.detail.cost', 'Cost price'), read(product, 'cost_price') ? `₹ ${text(read(product, 'cost_price'))}` : '—'],
    ...(kind === 'finished_goods'
      ? [[t('cc_products.detail.selling', 'Selling price'), read(product, 'selling_price') ? `₹ ${text(read(product, 'selling_price'))}` : '—'] as [string, string]]
      : []),
  ]

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-5 pb-16">
          <div className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-1">
              <Link href={`/backend/products?tab=${config.slug}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" />
                {config.title}
              </Link>
              <div className="flex flex-wrap items-center gap-2">
                {code !== '—' ? <span className="font-mono text-lg font-semibold text-muted-foreground">{code}</span> : null}
                <h1 className="text-xl font-bold">{text(product.title)}</h1>
                <StatusBadge variant="info">{config.singular}</StatusBadge>
                {read(product, 'is_active') === false ? <StatusBadge variant="neutral">{t('cc_products.detail.inactive', 'Inactive')}</StatusBadge> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {[`SKU ${text(read(product, 'sku'))}`, unit !== '—' ? `${t('cc_products.detail.countedIn', 'Counted in')} ${unit}` : null].filter(Boolean).join(' · ')}
                {parent ? (
                  <>
                    {' · '}
                    {t('cc_products.packing.madeFor', 'Packing item of')}{' '}
                    <Link href={`/backend/products/${parent.id}`} className="text-primary hover:underline">
                      {parent.title}
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {kind === 'finished_goods' && granted.has('cc_orders.manage') ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/backend/orders/new">
                    <Plus className="mr-1.5 h-4 w-4" />
                    {t('cc_products.orders.new', 'New order')}
                  </Link>
                </Button>
              ) : null}
              <Button asChild size="sm">
                <Link href={`/backend/products/${productId}/edit`}>
                  <Pencil className="mr-1.5 h-4 w-4" />
                  {t('cc_products.detail.edit', 'Edit')}
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Tile label={t('cc_products.stock.onHand', 'On hand')} value={`${qty(onHand)} ${unit}`} />
            <Tile label={t('cc_products.stock.available', 'Free to use')} value={`${qty(available)} ${unit}`} tone={minStock && available < minStock ? 'bad' : undefined} />
            <Tile label={t('cc_products.stock.minStock', 'Min stock')} value={minStock ? `${qty(minStock)} ${unit}` : '—'} tone={minStock ? (available < minStock ? 'bad' : 'ok') : undefined} />
          </div>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
            <div className="space-y-5 lg:col-span-7">
              <Section icon={Boxes} title={t('cc_products.detail.details', 'Details')}>
                <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                  {details.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3 border-b py-1.5 text-sm last:border-b-0">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-right">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Section>

              <Section icon={Warehouse} title={t('cc_products.detail.stock', 'Stock by store and batch')} flush>
                {!stock ? (
                  <Empty>{t('cc_products.detail.loadingStock', 'Loading stock…')}</Empty>
                ) : !stock.stores.length ? (
                  <Empty>{t('cc_products.detail.noStock', 'No stock yet.')}</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="p-3 text-left">{t('cc_products.detail.store', 'Store')}</th>
                          <th className="p-3 text-right">{t('cc_products.stock.onHand', 'On hand')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {stock.stores.map((row) => (
                          <tr key={row.code}>
                            <td className="p-3 font-mono text-xs">{row.code}</td>
                            <td className="p-3 text-right font-mono">{qty(row.onHand)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {stock.batches.length ? (
                      <table className="w-full border-t text-sm">
                        <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="p-3 text-left">{t('cc_products.detail.batch', 'Batch')}</th>
                            <th className="p-3 text-left">{t('cc_products.detail.store', 'Store')}</th>
                            <th className="p-3 text-right">{t('cc_products.stock.onHand', 'On hand')}</th>
                            <th className="p-3 text-left">{t('cc_products.detail.expiry', 'Expiry')}</th>
                            <th className="p-3 text-left">{t('cc_products.detail.status', 'Status')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {stock.batches.map((row) => {
                            const expired = row.expiresAt ? new Date(row.expiresAt).getTime() < Date.now() : false
                            return (
                              <tr key={`${row.lotNumber}-${row.store}`}>
                                <td className="p-3 font-mono text-xs">{row.lotNumber}</td>
                                <td className="p-3 font-mono text-xs">{row.store ?? '—'}</td>
                                <td className="p-3 text-right font-mono">{qty(row.onHand)}</td>
                                <td className={cn('p-3 text-xs', expired && 'font-semibold text-status-error-text')}>{date(row.expiresAt)}</td>
                                <td className="p-3 text-xs">{row.status ?? '—'}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    ) : null}
                  </div>
                )}
              </Section>

              <Section icon={History} title={t('cc_products.detail.movements', 'Recent stock movements')} flush>
                {stock && stock.movements.length ? (
                  <ol className="divide-y text-sm">
                    {stock.movements.map((move, index) => (
                      <li key={`${move.at}-${index}`} className="flex items-center justify-between gap-3 px-4 py-2">
                        <span className="min-w-0">
                          <span className="font-medium capitalize">{move.type.replace(/_/g, ' ')}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[move.from && move.to ? `${move.from} → ${move.to}` : (move.to ?? move.from), move.lotNumber ? `Batch ${move.lotNumber}` : null, move.reason].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-mono">
                            {qty(move.quantity)} {unit}
                          </span>
                          <span className="text-xs text-muted-foreground">{date(move.at)}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <Empty>{t('cc_products.detail.noMovements', 'No stock movements yet.')}</Empty>
                )}
              </Section>

              {purchases ? (
                <Section
                  icon={FileStack}
                  title={t('cc_products.detail.purchases', 'Purchase orders')}
                  description={t('cc_products.detail.purchasesHint', 'Ordered from vendors, and how much has arrived')}
                  action={
                    <Link href={`/backend/purchase/orders/new?items=${productId}:0`} className="text-xs font-medium text-primary hover:underline">
                      {t('cc_products.detail.raisePo', 'Raise PO')}
                    </Link>
                  }
                  flush
                >
                  {purchases.length ? (
                    <ul className="divide-y text-sm">
                      {purchases.map((po) => (
                        <li key={po.id}>
                          <Link href={`/backend/purchase/orders/${po.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40">
                            <span className="min-w-0">
                              <span className="block font-mono text-xs font-semibold">{po.code}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {po.vendorName} · {date(po.poDate)}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-3">
                              {po.product ? (
                                <span className="text-right text-xs tabular-nums text-muted-foreground">
                                  <span className="block font-mono text-foreground">
                                    {qty(po.product.received)} / {qty(po.product.quantity)} {po.product.unit}
                                  </span>
                                  ₹{qty(po.product.rate, 2)} / {po.product.unit}
                                </span>
                              ) : null}
                              <StatusBadge variant={PO_VARIANT[po.status] ?? 'neutral'}>{PO_LABEL[po.status] ?? po.status}</StatusBadge>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>{t('cc_products.detail.noPurchases', 'Never ordered from a vendor yet.')}</Empty>
                  )}
                </Section>
              ) : null}

            </div>

            <div className="space-y-5 lg:col-span-5">
              {kind === 'finished_goods' ? (
                <Section
                  icon={Boxes}
                  title={t('cc_products.packing.title', 'Packing for this product')}
                  action={
                    <Link href={`/backend/products/${productId}/edit`} className="text-xs text-primary hover:underline">
                      {t('cc_products.detail.change', 'Change')}
                    </Link>
                  }
                  flush
                >
                  {packing.length ? (
                    <ul className="divide-y text-sm">
                      {packing.map((item) => (
                        <li key={item.id}>
                          <Link href={`/backend/products/${item.id}`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-muted/30">
                            <span className="truncate">{item.title}</span>
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">{item.sku}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>{t('cc_products.detail.noPacking', 'No packing items yet. Tick them on the edit page.')}</Empty>
                  )}
                </Section>
              ) : null}

              {kind === 'finished_goods' ? (
                <Section
                  icon={ClipboardList}
                  title={t('cc_products.orders.title', 'Orders for this product')}
                  flush
                >
                  {orders === null ? (
                    <Empty>{t('cc_products.detail.loadingOrders', 'Loading orders…')}</Empty>
                  ) : !orders.length ? (
                    <Empty>{t('cc_products.orders.none', 'No orders yet.')}</Empty>
                  ) : (
                    <ul className="divide-y text-sm">
                      {orders.map((order) => (
                        <li key={order.id}>
                          <Link href={`/backend/orders/${order.id}`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-muted/30">
                            <span className="min-w-0">
                              <span className="font-mono text-xs font-semibold">{order.orderNo}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {order.customerName}
                                {' · '}
                                {order.products.map((entry) => `${entry.title} × ${qty(entry.quantity, 0)}`).join(', ')}
                              </span>
                              {order.current.length ? (
                                <span className="block truncate text-xs">
                                  {order.current.map((entry) => `${entry.label}${entry.responsibleName ? ` (${entry.responsibleName})` : ''}`).join(' · ')}
                                </span>
                              ) : null}
                            </span>
                            <StatusBadge variant={ORDER_VARIANT[order.status] ?? 'neutral'}>{t(`cc_orders.status.${order.status}`, order.status)}</StatusBadge>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              ) : null}

              {kind === 'finished_goods' && customers.size ? (
                <Section icon={Users} title={t('cc_products.detail.customers', 'Customers who order it')} flush>
                  <ul className="divide-y text-sm">
                    {Array.from(customers.values()).map((entry) => (
                      <li key={entry.id}>
                        <Link href={`/backend/customers/companies/${entry.id}`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-muted/30">
                          <span className="truncate">{entry.name || '—'}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {qty(entry.pieces, 0)} pcs · {t('cc_products.detail.last', 'last {date}', { date: date(entry.last) })}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
            </div>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}

export default ProductDetail
