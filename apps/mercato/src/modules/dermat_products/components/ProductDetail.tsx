"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Boxes, ClipboardList, FileStack, History, Layers, Pencil, Plus, Users, Warehouse } from 'lucide-react'
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
  reservations?: Array<{ orderId: string; orderNo: string; quantity: number; since: string; byName: string | null }>
  movements: Array<{ at: string; type: string; quantity: number; from: string | null; to: string | null; lotNumber: string | null; reason: string | null }>
}
type Usage = {
  usedIn: Array<{
    bomId: string
    version: number
    status: string
    productId: string
    productName: string
    productCode: string | null
    productKind: string | null
    percent: number | null
    perPiece: number | null
    fillQty: number | null
    fillUnit: string | null
    unit: string
  }>
  finishedGoods: Array<{ id: string; title: string; code: string | null }>
}
type BomLine = { id: string; code: string | null; name: string; componentKind: string; value: number; unit: string; fillQty: number | null; fillUnit: string | null; componentProductId: string }
type BomView = { id: string; version: number; status: string; kind: 'formula' | 'pack'; batchSize: number; batchUnit: string; totalPercent: number | null; items: BomLine[] }
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
type StoreRequestRow = {
  id: string
  code: string
  orderId: string
  orderNo: string
  stageLabel: string
  status: 'requested' | 'partly_issued' | 'issued' | 'received' | 'used' | 'cancelled'
  awaitingReceipt: boolean
  createdAt: string
  product: { required: number; issued: number; received: number; used: number; returned: number; unit: string } | null
}

type PurchaseRow = { id: string; code: string; vendorName: string; poDate: string; expectedDate: string | null; status: string; product: { quantity: number; received: number; rate: number; unit: string } | null }
const PO_VARIANT: Record<string, StatusBadgeVariant> = { draft: 'neutral', pending_approval: 'warning', approved: 'info', partly_received: 'info', received: 'success', cancelled: 'error' }
const PO_LABEL: Record<string, string> = { draft: 'Draft', pending_approval: 'Waiting approval', approved: 'Approved', partly_received: 'Partly received', received: 'Received', cancelled: 'Cancelled' }

const REQUEST_VARIANT: Record<StoreRequestRow['status'], StatusBadgeVariant> = { requested: 'warning', partly_issued: 'info', issued: 'info', received: 'success', used: 'neutral', cancelled: 'error' }
const REQUEST_LABEL: Record<StoreRequestRow['status'], string> = { requested: 'Requested', partly_issued: 'Partly issued', issued: 'Issued', received: 'Received', used: 'Used', cancelled: 'Cancelled' }

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
  const [product, setProduct] = React.useState<Row | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [defs, setDefs] = React.useState<ProductFieldDef[]>([])
  const [profile, setProfile] = React.useState<Row | null>(null)
  const [stock, setStock] = React.useState<StockDetail | null>(null)
  const [usage, setUsage] = React.useState<Usage | null>(null)
  const [bom, setBom] = React.useState<BomView | null | undefined>(undefined)
  const [orders, setOrders] = React.useState<OrderRow[] | null>(null)
  const [packing, setPacking] = React.useState<Packing[]>([])
  const [requests, setRequests] = React.useState<StoreRequestRow[] | null>(null)
  const [purchases, setPurchases] = React.useState<PurchaseRow[] | null>(null)
  const [parent, setParent] = React.useState<{ id: string; title: string } | null>(null)

  const kind = (text(read(product, 'custom_fieldset_code')) as ProductKind) || null
  const config = kind && KIND_CONFIG[kind] ? KIND_CONFIG[kind] : null

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      const call = await apiCall<{ items?: Row[] }>(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`, undefined, { fallback: { items: [] } })
      const item = call.result?.items?.[0]
      if (cancelled) return
      if (!item) {
        setLoadError(t('dermat_products.errors.load', 'Could not load this product.'))
        return
      }
      setProduct(item)
      const itemKind = String(read(item, 'custom_fieldset_code') ?? '')
      const [allDefs, profileCall, stockCall] = await Promise.all([
        loadProductFieldDefs(),
        apiCall<{ items?: Row[] }>(`/api/wms/inventory-profiles?catalogProductId=${encodeURIComponent(productId)}&pageSize=1`, undefined, { fallback: { items: [] } }),
        apiCall<StockDetail>(`/api/dermat_products/stock-detail?productId=${encodeURIComponent(productId)}`, undefined, { fallback: { stores: [], batches: [], movements: [] } }),
      ])
      if (cancelled) return
      const kindConfig = KIND_CONFIG[itemKind as ProductKind]
      setDefs(kindConfig ? fieldsForKind(allDefs, itemKind as ProductKind, kindConfig.fields.map((field) => field.key)) : [])
      setProfile(profileCall.result?.items?.[0] ?? null)
      setStock(stockCall.result ?? { stores: [], batches: [], movements: [] })
      if (itemKind === 'raw_material' || itemKind === 'packing_material') {
        apiCall<{ items?: StoreRequestRow[] }>(`/api/dermat_store/requests?productId=${encodeURIComponent(productId)}&pageSize=20`, undefined, { fallback: { items: [] } }).then((call) => {
          if (!cancelled) setRequests(call.result?.items ?? [])
        })
        apiCall<{ items?: PurchaseRow[] }>(`/api/dermat_purchase/orders?productId=${encodeURIComponent(productId)}&pageSize=20`, undefined, { fallback: { items: [] } }).then((call) => {
          if (!cancelled) setPurchases(call.result?.items ?? [])
        })
      }

      if (itemKind === 'bulk' || itemKind === 'rnd' || itemKind === 'finished_goods') {
        const list = await apiCall<{ items?: Array<{ id: string; status: string }> }>(`/api/dermat_boms/boms?productId=${encodeURIComponent(productId)}&pageSize=20`, undefined, { fallback: { items: [] } })
        const live = (list.result?.items ?? []).filter((entry) => entry.status !== 'superseded')
        const current = live.find((entry) => entry.status === 'approved') ?? live[0]
        if (current) {
          const detail = await apiCall<BomView>(`/api/dermat_boms/boms?id=${encodeURIComponent(current.id)}`)
          if (!cancelled) setBom(detail.result ?? null)
        } else if (!cancelled) setBom(null)
      }

      let fgIds: string[] = []
      if (itemKind === 'finished_goods') {
        fgIds = [productId]
        const packCall = await apiCall<{ items?: Packing[] }>(`/api/dermat_products/packing?productId=${encodeURIComponent(productId)}`, undefined, { fallback: { items: [] } })
        if (!cancelled) setPacking(packCall.result?.items ?? [])
      } else {
        const usageCall = await apiCall<Usage>(`/api/dermat_boms/where-used?productId=${encodeURIComponent(productId)}`, undefined, { fallback: { usedIn: [], finishedGoods: [] } })
        if (cancelled) return
        setUsage(usageCall.result ?? { usedIn: [], finishedGoods: [] })
        fgIds = (usageCall.result?.finishedGoods ?? []).map((fg) => fg.id)
      }
      const parentId = String(read(item, 'parent_product_id') ?? '')
      if (parentId) {
        const parentCall = await apiCall<{ items?: Row[] }>(`/api/catalog/products?id=${encodeURIComponent(parentId)}&pageSize=1`, undefined, { fallback: { items: [] } })
        const parentRow = parentCall.result?.items?.[0]
        if (!cancelled && parentRow) setParent({ id: parentRow.id, title: String(parentRow.title ?? '') })
      }
      const orderLists = await Promise.all(
        fgIds.slice(0, 20).map((id) =>
          apiCall<{ items?: OrderRow[] }>(
            `/api/dermat_orders/orders?productId=${encodeURIComponent(id)}&pageSize=20${itemKind === 'finished_goods' ? '' : '&status=open'}`,
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
  }, [productId, t])

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
          <LoadingMessage label={t('dermat_products.detail.loading', 'Loading product…')} />
        </PageBody>
      </Page>
    )
  }

  const unit = text(read(product, 'default_unit'))
  const onHand = stock?.stores.reduce((sum, row) => sum + row.onHand, 0) ?? 0
  const reserved = stock?.stores.reduce((sum, row) => sum + row.reserved, 0) ?? 0
  const available = stock?.stores.reduce((sum, row) => sum + row.available, 0) ?? 0
  const minStock = Number(read(profile, 'reorder_point') ?? read(profile, 'reorderPoint') ?? 0)
  const code = text(read(product, 'item_code'))
  const strategy = text(read(profile, 'default_strategy') ?? read(profile, 'defaultStrategy')).toUpperCase()
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
  const hasBom = kind === 'bulk' || kind === 'rnd' || kind === 'finished_goods'

  const details: Array<[string, string]> = [
    [config.codeLabel, code],
    [t('dermat_products.detail.sku', 'SKU'), text(read(product, 'sku'))],
    [t('dermat_products.form.unit', 'Unit'), unit],
    [t('dermat_products.detail.productType', 'Product type'), text(read(product, 'product_type'))],
    [t('dermat_products.detail.batchMethod', 'Batch consumption'), strategy === '—' ? '—' : strategy],
    [t('dermat_products.detail.hsn', 'HSN code'), text(read(product, 'hsn_code'))],
    ...defs.filter((def) => !COMMON_FIELD_KEYS.has(def.key)).map((def) => [def.label, text(read(product, def.key))] as [string, string]),
    [t('dermat_products.detail.cost', 'Cost price'), read(product, 'cost_price') ? `₹ ${text(read(product, 'cost_price'))}` : '—'],
    [t('dermat_products.detail.selling', 'Selling price'), read(product, 'selling_price') ? `₹ ${text(read(product, 'selling_price'))}` : '—'],
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
                {read(product, 'is_active') === false ? <StatusBadge variant="neutral">{t('dermat_products.detail.inactive', 'Inactive')}</StatusBadge> : null}
              </div>
              <p className="text-xs text-muted-foreground">
                {[`SKU ${text(read(product, 'sku'))}`, unit !== '—' ? `${t('dermat_products.detail.countedIn', 'Counted in')} ${unit}` : null].filter(Boolean).join(' · ')}
                {parent ? (
                  <>
                    {' · '}
                    {t('dermat_products.packing.madeFor', 'Packing item of')}{' '}
                    <Link href={`/backend/products/${parent.id}`} className="text-primary hover:underline">
                      {parent.title}
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {kind === 'finished_goods' ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/backend/orders/new">
                    <Plus className="mr-1.5 h-4 w-4" />
                    {t('dermat_products.orders.new', 'New order')}
                  </Link>
                </Button>
              ) : null}
              {hasBom ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={bom ? `/backend/boms/${bom.id}` : `/backend/boms/new?productId=${productId}`}>
                    <FileStack className="mr-1.5 h-4 w-4" />
                    {bom ? t('dermat_products.detail.openBom', 'Open BOM') : t('dermat_products.detail.makeBom', 'Make BOM')}
                  </Link>
                </Button>
              ) : null}
              <Button asChild size="sm">
                <Link href={`/backend/products/${productId}/edit`}>
                  <Pencil className="mr-1.5 h-4 w-4" />
                  {t('dermat_products.detail.edit', 'Edit')}
                </Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label={t('dermat_products.stock.onHand', 'On hand')} value={`${qty(onHand)} ${unit}`} />
            <Tile label={t('dermat_products.stock.reserved', 'Reserved for orders')} value={`${qty(reserved)} ${unit}`} />
            <Tile label={t('dermat_products.stock.available', 'Free to use')} value={`${qty(available)} ${unit}`} tone={minStock && available < minStock ? 'bad' : undefined} />
            <Tile label={t('dermat_products.stock.minStock', 'Min stock')} value={minStock ? `${qty(minStock)} ${unit}` : '—'} tone={minStock ? (available < minStock ? 'bad' : 'ok') : undefined} />
          </div>

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-12">
            <div className="space-y-5 lg:col-span-7">
              <Section icon={Boxes} title={t('dermat_products.detail.details', 'Details')}>
                <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                  {details.map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-3 border-b py-1.5 text-sm last:border-b-0">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-right">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Section>

              <Section icon={Warehouse} title={t('dermat_products.detail.stock', 'Stock by store and batch')} flush>
                {!stock ? (
                  <Empty>{t('dermat_products.detail.loadingStock', 'Loading stock…')}</Empty>
                ) : !stock.stores.length ? (
                  <Empty>{t('dermat_products.detail.noStock', 'No stock yet.')}</Empty>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="p-3 text-left">{t('dermat_products.detail.store', 'Store')}</th>
                          <th className="p-3 text-right">{t('dermat_products.stock.onHand', 'On hand')}</th>
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
                    {(() => {
                      const inStores = stock.stores.filter((row) => row.code === 'RM-STORE' || row.code === 'PM-STORE').reduce((sum, row) => sum + row.onHand, 0)
                      const reserved = (stock.reservations ?? []).reduce((sum, row) => sum + row.quantity, 0)
                      return (
                        <div className="border-t bg-muted/20 px-3 py-3">
                          <div className="grid grid-cols-3 gap-3 text-center">
                            <div>
                              <p className="text-xs text-muted-foreground">{t('dermat_products.stock.inStores', 'In RM / PM store')}</p>
                              <p className="font-mono text-sm font-semibold">{qty(inStores)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">{t('dermat_products.stock.reservedOrders', 'Reserved for orders')}</p>
                              <p className="font-mono text-sm font-semibold">{qty(reserved)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">{t('dermat_products.stock.available', 'Free')}</p>
                              <p className={cn('font-mono text-sm font-semibold', inStores - reserved <= 0 && reserved > 0 && 'text-status-warning-text')}>{qty(Math.max(0, inStores - reserved))}</p>
                            </div>
                          </div>
                          {(stock.reservations ?? []).length ? (
                            <ul className="mt-3 space-y-1 text-xs">
                              {(stock.reservations ?? []).map((row) => (
                                <li key={row.orderId} className="flex items-center justify-between gap-2">
                                  <Link href={`/backend/orders/${row.orderId}`} className="font-medium hover:underline">
                                    {row.orderNo}
                                  </Link>
                                  <span className="text-muted-foreground">
                                    {qty(row.quantity)} {unit} · {t('dermat_products.stock.since', 'since {date}', { date: date(row.since) })}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </div>
                      )
                    })()}
                    {stock.batches.length ? (
                      <table className="w-full border-t text-sm">
                        <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="p-3 text-left">{t('dermat_products.detail.batch', 'Batch')}</th>
                            <th className="p-3 text-left">{t('dermat_products.detail.store', 'Store')}</th>
                            <th className="p-3 text-right">{t('dermat_products.stock.onHand', 'On hand')}</th>
                            <th className="p-3 text-left">{t('dermat_products.detail.expiry', 'Expiry')}</th>
                            <th className="p-3 text-left">{t('dermat_products.detail.status', 'Status')}</th>
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

              <Section icon={History} title={t('dermat_products.detail.movements', 'Recent stock movements')} flush>
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
                  <Empty>{t('dermat_products.detail.noMovements', 'No stock movements yet.')}</Empty>
                )}
              </Section>

              {purchases ? (
                <Section
                  icon={FileStack}
                  title={t('dermat_products.detail.purchases', 'Purchase orders')}
                  description={t('dermat_products.detail.purchasesHint', 'Ordered from vendors, and how much has arrived')}
                  action={
                    <Link href={`/backend/purchase/orders/new?items=${productId}:0`} className="text-xs font-medium text-primary hover:underline">
                      {t('dermat_products.detail.raisePo', 'Raise PO')}
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
                    <Empty>{t('dermat_products.detail.noPurchases', 'Never ordered from a vendor yet.')}</Empty>
                  )}
                </Section>
              ) : null}

              {requests ? (
                <Section
                  icon={ClipboardList}
                  title={t('dermat_products.detail.storeRequests', 'Store requests')}
                  description={t('dermat_products.detail.storeRequestsHint', 'Asked by production, issued by the store, received and used')}
                  flush
                >
                  {requests.length ? (
                    <ul className="divide-y text-sm">
                      {requests.map((request) => (
                        <li key={request.id}>
                          <Link href={`/backend/store/requests/${request.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40">
                            <span className="min-w-0">
                              <span className="block font-mono text-xs font-semibold">{request.code}</span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {request.orderNo} · {request.stageLabel} · {date(request.createdAt)}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-3">
                              {request.product ? (
                                <span className="text-right text-xs tabular-nums text-muted-foreground">
                                  <span className="block font-mono text-foreground">
                                    {qty(request.product.issued)} / {qty(request.product.required)} {request.product.unit}
                                  </span>
                                  {request.product.used ? `${qty(request.product.used)} used` : request.product.received ? `${qty(request.product.received)} received` : t('dermat_products.detail.issuedOfNeeded', 'issued of needed')}
                                </span>
                              ) : null}
                              <StatusBadge variant={REQUEST_VARIANT[request.status]}>
                                {request.awaitingReceipt && request.status !== 'requested' ? t('dermat_products.detail.sentNotReceived', 'Sent · not received') : REQUEST_LABEL[request.status]}
                              </StatusBadge>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <Empty>{t('dermat_products.detail.noStoreRequests', 'Production has not asked the store for this yet.')}</Empty>
                  )}
                </Section>
              ) : null}
            </div>

            <div className="space-y-5 lg:col-span-5">
              {hasBom ? (
                <Section
                  icon={FileStack}
                  title={kind === 'finished_goods' ? t('dermat_products.detail.packBom', 'Pack BOM') : t('dermat_products.detail.formula', 'Formula')}
                  description={
                    bom
                      ? `v${bom.version} · ${bom.status}${bom.totalPercent != null ? ` · ${qty(bom.totalPercent, 4)} %` : ''} · ${t('dermat_products.detail.perBatch', 'batch {size} {unit}', { size: qty(bom.batchSize), unit: bom.batchUnit })}`
                      : undefined
                  }
                  action={
                    bom ? (
                      <Link href={`/backend/boms/${bom.id}`} className="text-xs text-primary hover:underline">
                        {t('dermat_products.detail.open', 'Open')}
                      </Link>
                    ) : null
                  }
                  flush
                >
                  {bom === undefined ? (
                    <Empty>{t('dermat_products.detail.loadingBom', 'Loading BOM…')}</Empty>
                  ) : !bom ? (
                    <Empty>
                      {t('dermat_products.detail.noBom', 'No BOM yet.')}{' '}
                      <Link href={`/backend/boms/new?productId=${productId}`} className="text-primary hover:underline">
                        {t('dermat_products.detail.makeBom', 'Make BOM')}
                      </Link>
                    </Empty>
                  ) : (
                    <ul className="divide-y text-sm">
                      {bom.items.map((line) => (
                        <li key={line.id} className="flex items-center justify-between gap-3 px-4 py-2">
                          <Link href={`/backend/products/${line.componentProductId}`} className="min-w-0 truncate hover:underline">
                            <span className="mr-1.5 rounded border px-1 text-xs">{KIND_SHORT[line.componentKind] ?? line.componentKind}</span>
                            {line.code ? <span className="mr-1 font-mono text-xs text-muted-foreground">{line.code}</span> : null}
                            {line.name}
                          </Link>
                          <span className="shrink-0 font-mono text-xs">
                            {bom.kind === 'formula' ? `${qty(line.value, 4)} %` : line.fillQty != null ? `${qty(line.fillQty)} ${line.fillUnit}/pc` : `${qty(line.value, 5)} ${line.unit}/pc`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              ) : null}

              {kind === 'finished_goods' ? (
                <Section
                  icon={Boxes}
                  title={t('dermat_products.packing.title', 'Packing for this product')}
                  action={
                    <Link href={`/backend/products/${productId}/edit`} className="text-xs text-primary hover:underline">
                      {t('dermat_products.detail.change', 'Change')}
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
                    <Empty>{t('dermat_products.detail.noPacking', 'No packing items yet. Tick them on the edit page.')}</Empty>
                  )}
                </Section>
              ) : null}

              {kind !== 'finished_goods' ? (
                <Section
                  icon={Layers}
                  title={
                    kind === 'raw_material'
                      ? t('dermat_products.detail.usedInFormulas', 'Used in formulas')
                      : kind === 'packing_material'
                        ? t('dermat_products.detail.usedInPack', 'Used in pack BOMs')
                        : t('dermat_products.detail.filledInto', 'Filled into')
                  }
                  description={
                    usage?.finishedGoods.length
                      ? t('dermat_products.detail.endsIn', 'Ends up in {count} Finished Goods', { count: usage.finishedGoods.length })
                      : undefined
                  }
                  flush
                >
                  {!usage ? (
                    <Empty>{t('dermat_products.detail.loadingUsage', 'Loading…')}</Empty>
                  ) : !usage.usedIn.length ? (
                    <Empty>{t('dermat_products.detail.notUsed', 'Not used in any BOM yet.')}</Empty>
                  ) : (
                    <ul className="divide-y text-sm">
                      {usage.usedIn.map((entry) => (
                        <li key={entry.bomId} className="flex items-center justify-between gap-3 px-4 py-2">
                          <span className="min-w-0">
                            <Link href={`/backend/products/${entry.productId}`} className="block truncate hover:underline">
                              {entry.productCode ? <span className="mr-1 font-mono text-xs text-muted-foreground">{entry.productCode}</span> : null}
                              {entry.productName}
                            </Link>
                            <Link href={`/backend/boms/${entry.bomId}`} className="text-xs text-muted-foreground hover:underline">
                              BOM v{entry.version} · {entry.status}
                            </Link>
                          </span>
                          <span className="shrink-0 font-mono text-xs">
                            {entry.percent != null
                              ? `${qty(entry.percent, 4)} %`
                              : entry.fillQty != null
                                ? `${qty(entry.fillQty)} ${entry.fillUnit}/pc`
                                : `${qty(entry.perPiece ?? 0, 5)} ${entry.unit}/pc`}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              ) : null}

              <Section
                icon={ClipboardList}
                title={kind === 'finished_goods' ? t('dermat_products.orders.title', 'Orders for this product') : t('dermat_products.detail.openOrders', 'Open orders that need it')}
                flush
              >
                {orders === null ? (
                  <Empty>{t('dermat_products.detail.loadingOrders', 'Loading orders…')}</Empty>
                ) : !orders.length ? (
                  <Empty>{t('dermat_products.orders.none', 'No orders yet.')}</Empty>
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
                          <StatusBadge variant={ORDER_VARIANT[order.status] ?? 'neutral'}>{t(`dermat_orders.status.${order.status}`, order.status)}</StatusBadge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              {kind === 'finished_goods' && customers.size ? (
                <Section icon={Users} title={t('dermat_products.detail.customers', 'Customers who order it')} flush>
                  <ul className="divide-y text-sm">
                    {Array.from(customers.values()).map((entry) => (
                      <li key={entry.id}>
                        <Link href={`/backend/customers/companies/${entry.id}`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-muted/30">
                          <span className="truncate">{entry.name || '—'}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {qty(entry.pieces, 0)} pcs · {t('dermat_products.detail.last', 'last {date}', { date: date(entry.last) })}
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
