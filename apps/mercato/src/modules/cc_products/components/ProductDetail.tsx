"use client"

import * as React from 'react'
import { useGranted } from '../../cc_departments/components/useGranted'
import Link from 'next/link'
import { Boxes, ClipboardList, FileStack, History, Pencil, Plus, Printer, Users, Warehouse } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { KIND_CONFIG } from '../lib/kindConfig'
import { PURCHASED_KINDS, SELLABLE_KINDS, type ProductKind } from '../lib/kinds'
import { COMMON_FIELD_KEYS, fieldsForKind, loadProductFieldDefs, type ProductFieldDef } from '../lib/fieldDefs'
import { PRODUCT_KINDS } from '../lib/kinds'
import { FieldList, LinkRows, Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, DocLink, formatCount, formatDay, formatKg, type Fact } from '../../cc_ui/components/RecordPage'
import { recordHref, type DocumentLink } from '../../cc_ui/lib/links'

type Row = Record<string, unknown> & { id: string }
type StockDetail = {
  stores: Array<{ code: string; onHand: number; reserved: number; available: number }>
  batches: Array<{ lotId: string; lotNumber: string; store: string | null; onHand: number; expiresAt: string | null; manufacturedAt: string | null; status: string | null }>
  movements: Array<{ at: string; type: string; quantity: number; from: string | null; to: string | null; lotId: string | null; lotNumber: string | null; reason: string | null; document: DocumentLink | null }>
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
type PurchaseRow = { id: string; code: string; vendorName: string; poDate: string; expectedDate: string | null; status: string; product: { quantity: number; received: number; rate: number; unit: string } | null }
const PO_VARIANT: Record<string, StatusBadgeVariant> = { draft: 'neutral', pending_approval: 'warning', approved: 'info', partly_received: 'info', received: 'success', cancelled: 'error' }
const PO_LABEL: Record<string, string> = { draft: 'Draft', pending_approval: 'Waiting approval', approved: 'Approved', partly_received: 'Partly received', received: 'Received', cancelled: 'Cancelled' }

const ORDER_VARIANT: Record<string, StatusBadgeVariant> = { booked: 'info', confirmed: 'warning', completed: 'success', cancelled: 'neutral' }
const KIND_SHORT: Record<string, string> = Object.fromEntries(PRODUCT_KINDS.map((kind) => [kind.code, kind.label]))

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

const COUNTED_UNITS = new Set(['nos', 'pcs', 'pc', 'piece', 'pieces'])

export function ProductDetail({ productId }: { productId: string }) {
  const t = useT()
  const granted = useGranted()
  const [product, setProduct] = React.useState<Row | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [defs, setDefs] = React.useState<ProductFieldDef[]>([])
  const [profile, setProfile] = React.useState<Row | null>(null)
  const [stock, setStock] = React.useState<StockDetail | null>(null)
  const [orders, setOrders] = React.useState<OrderRow[] | null>(null)
  const [purchases, setPurchases] = React.useState<PurchaseRow[] | null>(null)

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
      if (PURCHASED_KINDS.has(itemKind as ProductKind)) {
        if (may('cc_purchase.view')) {
          apiCall<{ items?: PurchaseRow[] }>(`/api/cc_purchase/orders?productId=${encodeURIComponent(productId)}&pageSize=20`, undefined, { fallback: { items: [] } }).then((call) => {
            if (!cancelled) setPurchases(call.result?.items ?? [])
          })
        } else setPurchases([])
      }

      const fgIds = SELLABLE_KINDS.has(itemKind as ProductKind) ? [productId] : []
      const orderLists = await Promise.all(
        (may('cc_orders.view') ? fgIds.slice(0, 20) : []).map((id) =>
          apiCall<{ items?: OrderRow[] }>(
            `/api/cc_orders/orders?productId=${encodeURIComponent(id)}&pageSize=20`,
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

  if (loadError || !product || !config || !kind) {
    return <RecordState error={loadError} loadingLabel={t('cc_products.detail.loading', 'Loading product…')} />
  }

  const unit = text(read(product, 'default_unit'))
  const counted = COUNTED_UNITS.has(unit.toLowerCase())
  const amount = (value: number) => (counted ? `${formatCount(value)} ${t('cc_ui.pcs', 'pcs')}` : `${formatKg(value)} kg`)
  const onHand = stock?.stores.reduce((sum, row) => sum + row.onHand, 0) ?? 0
  const available = stock?.stores.reduce((sum, row) => sum + row.available, 0) ?? 0
  const minStock = Number(read(profile, 'reorder_point') ?? read(profile, 'reorderPoint') ?? 0)
  const code = text(read(product, 'item_code'))
  const sellable = SELLABLE_KINDS.has(kind)
  const openPos = (purchases ?? []).filter((po) => !['received', 'cancelled', 'draft'].includes(po.status))
  const onOrder = openPos.reduce((sum, po) => sum + (po.product ? Math.max(po.product.quantity - po.product.received, 0) : 0), 0)
  const customers = new Map<string, { id: string; name: string; quantity: number; last: string }>()
  if (sellable) {
    for (const order of orders ?? []) {
      if (order.status === 'cancelled') continue
      const quantity = order.products.filter((entry) => entry.id === productId).reduce((sum, entry) => sum + entry.quantity, 0)
      const current = customers.get(order.customerId)
      customers.set(order.customerId, {
        id: order.customerId,
        name: order.customerName,
        quantity: (current?.quantity ?? 0) + quantity,
        last: current && current.last > order.orderDate ? current.last : order.orderDate,
      })
    }
  }

  const details: Array<[string, React.ReactNode]> = [
    [config.codeLabel, code],
    [t('cc_products.form.unit', 'Unit'), unit],
    [t('cc_products.detail.hsn', 'HSN code'), text(read(product, 'hsn_code'))],
    ...defs.filter((def) => !COMMON_FIELD_KEYS.has(def.key)).map((def) => [def.label, text(read(product, def.key))] as [string, React.ReactNode]),
    [t('cc_products.detail.cost', 'Cost price'), read(product, 'cost_price') ? `₹ ${text(read(product, 'cost_price'))}` : '—'],
    ...(sellable ? [[t('cc_products.detail.selling', 'Selling price'), read(product, 'selling_price') ? `₹ ${text(read(product, 'selling_price'))}` : '—'] as [string, React.ReactNode]] : []),
  ]

  const facts: Fact[] = [
    { label: t('cc_products.stock.onHand', 'On hand'), value: amount(onHand) },
    { label: t('cc_products.stock.available', 'Free to use'), value: amount(available), tone: minStock && available < minStock ? 'bad' : undefined },
    { label: t('cc_products.stock.minStock', 'Min stock'), value: minStock ? amount(minStock) : '—', tone: minStock ? (available < minStock ? 'bad' : 'good') : undefined },
    { label: t('cc_products.detail.lotCount', 'Lots in stock'), value: formatCount(stock?.batches.length ?? 0) },
    ...(purchases ? [{ label: t('cc_products.detail.onOrder', 'On order from vendors'), value: amount(onOrder), hint: t('cc_products.detail.openPos', '{count} open POs', { count: openPos.length }) }] : []),
    { label: t('cc_products.detail.lastMove', 'Last movement'), value: stock?.movements[0] ? formatDay(stock.movements[0].at) : '—' },
  ]

  return (
    <RecordPage
      back={{ href: `/backend/products?tab=${config.slug}`, label: config.title }}
      overline={`${config.singular}${code !== '—' ? ` · ${code}` : ''}`}
      title={text(product.title)}
      mono={false}
      badges={
        <>
          <StatusBadge variant="info">{config.singular}</StatusBadge>
          {read(product, 'is_active') === false ? <StatusBadge variant="neutral">{t('cc_products.detail.inactive', 'Inactive')}</StatusBadge> : null}
        </>
      }
      meta={[`SKU ${text(read(product, 'sku'))}`, unit !== '—' ? `${t('cc_products.detail.countedIn', 'Counted in')} ${unit}` : null].filter(Boolean).join(' · ')}
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('cc_products.detail.print', 'Print')}
          </Button>
          {purchases && granted.has('cc_purchase.manage') ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/backend/purchase/orders/new?items=${productId}:0`}>
                <FileStack className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_products.detail.raisePo', 'Raise PO')}
              </Link>
            </Button>
          ) : null}
          {sellable && granted.has('cc_orders.manage') ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/backend/orders/new">
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_products.orders.new', 'New order')}
              </Link>
            </Button>
          ) : null}
          <Button asChild size="sm">
            <Link href={`/backend/products/${productId}/edit`}>
              <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_products.detail.edit', 'Edit')}
            </Link>
          </Button>
        </>
      }
      facts={facts}
    >
      <RecordColumns
        main={
          <>
            <Panel title={t('cc_products.detail.details', 'Details')} icon={Boxes}>
              <FieldList fields={details} />
            </Panel>

            <Panel title={t('cc_products.detail.lots', 'Lots in stock')} icon={Warehouse} count={stock?.batches.length ?? null} flush>
              <RegisterGrid
                rows={stock?.batches ?? []}
                rowKey={(row) => `${row.lotId}-${row.store ?? ''}`}
                rowHref={(row) => recordHref.lot(row.lotId)}
                empty={stock ? t('cc_products.detail.noStock', 'No stock yet.') : t('cc_products.detail.loadingStock', 'Loading stock…')}
                columns={[
                  { key: 'lot', label: t('cc_products.detail.lot', 'Lot No.'), mono: true, render: (row) => row.lotNumber },
                  { key: 'store', label: t('cc_products.detail.store', 'Store'), render: (row) => row.store ?? '—' },
                  { key: 'made', label: t('cc_products.detail.made', 'Made / received'), render: (row) => formatDay(row.manufacturedAt) },
                  {
                    key: 'expiry',
                    label: t('cc_products.detail.expiry', 'Expiry'),
                    render: (row) => {
                      const expired = row.expiresAt ? new Date(row.expiresAt).getTime() < Date.now() : false
                      return <span className={expired ? 'font-semibold text-status-error-text' : undefined}>{formatDay(row.expiresAt)}</span>
                    },
                  },
                  { key: 'status', label: t('cc_products.detail.status', 'Status'), render: (row) => row.status ?? '—' },
                  { key: 'qty', label: counted ? t('cc_ui.pcs', 'pcs') : 'kg', align: 'right', render: (row) => (counted ? formatCount(row.onHand) : formatKg(row.onHand)), total: counted ? formatCount(onHand) : formatKg(onHand) },
                ]}
              />
            </Panel>

            <Panel title={t('cc_products.detail.movements', 'Stock movements')} icon={History} count={stock?.movements.length ?? null} flush>
              <RegisterGrid
                rows={stock?.movements ?? []}
                rowKey={(row) => `${row.at}-${row.lotId ?? ''}-${row.quantity}-${row.type}`}
                empty={t('cc_products.detail.noMovements', 'No stock movements yet.')}
                columns={[
                  { key: 'at', label: t('cc_products.detail.date', 'Date'), render: (row) => formatDay(row.at) },
                  { key: 'doc', label: t('cc_products.detail.document', 'Document'), render: (row) => (row.document ? <DocLink doc={row.document} /> : <span className="capitalize">{row.type.replace(/_/g, ' ')}</span>) },
                  {
                    key: 'lot',
                    label: t('cc_products.detail.lot', 'Lot No.'),
                    mono: true,
                    render: (row) =>
                      row.lotId ? (
                        <Link className="underline-offset-2 hover:underline" href={recordHref.lot(row.lotId)}>
                          {row.lotNumber ?? '—'}
                        </Link>
                      ) : (
                        row.lotNumber ?? '—'
                      ),
                  },
                  { key: 'where', label: t('cc_products.detail.where', 'From → to'), render: (row) => (row.from && row.to ? `${row.from} → ${row.to}` : (row.to ?? row.from ?? '—')) },
                  { key: 'qty', label: counted ? t('cc_ui.pcs', 'pcs') : 'kg', align: 'right', render: (row) => (counted ? formatCount(row.quantity) : formatKg(row.quantity)) },
                ]}
              />
            </Panel>
          </>
        }
        side={
          <>
            {sellable ? (
              <Panel title={t('cc_products.orders.title', 'Orders for this product')} icon={ClipboardList} count={orders?.length ?? null} flush>
                <LinkRows
                  empty={orders === null ? t('cc_products.detail.loadingOrders', 'Loading orders…') : t('cc_products.orders.none', 'No orders yet.')}
                  rows={(orders ?? []).map((order) => {
                    const quantity = order.products.filter((entry) => entry.id === productId).reduce((sum, entry) => sum + entry.quantity, 0)
                    return {
                      key: order.id,
                      href: recordHref.order(order.id),
                      primary: <span className="font-mono">{order.orderNo}</span>,
                      secondary: [order.customerName, order.current.map((entry) => entry.label).join(' · ')].filter(Boolean).join(' · '),
                      value: amount(quantity),
                      valueHint: formatDay(order.orderDate),
                      badge: <StatusBadge variant={ORDER_VARIANT[order.status] ?? 'neutral'}>{t(`cc_orders.status.${order.status}`, order.status)}</StatusBadge>,
                    }
                  })}
                />
              </Panel>
            ) : null}

            {sellable && customers.size ? (
              <Panel title={t('cc_products.detail.customers', 'Customers who order it')} icon={Users} count={customers.size} flush>
                <LinkRows
                  empty={null}
                  rows={Array.from(customers.values()).map((entry) => ({
                    key: entry.id,
                    href: recordHref.customer(entry.id),
                    primary: entry.name || '—',
                    secondary: t('cc_products.detail.last', 'last {date}', { date: formatDay(entry.last) }),
                    value: amount(entry.quantity),
                  }))}
                />
              </Panel>
            ) : null}

            {purchases ? (
              <Panel title={t('cc_products.detail.purchases', 'Purchase orders')} icon={FileStack} count={purchases.length} flush>
                <LinkRows
                  empty={t('cc_products.detail.noPurchases', 'Never ordered from a vendor yet.')}
                  rows={purchases.map((po) => ({
                    key: po.id,
                    href: recordHref.purchaseOrder(po.id),
                    primary: <span className="font-mono">{po.code}</span>,
                    secondary: `${po.vendorName} · ${formatDay(po.poDate)}`,
                    value: po.product ? `${counted ? formatCount(po.product.received) : formatKg(po.product.received)} / ${counted ? formatCount(po.product.quantity) : formatKg(po.product.quantity)}` : undefined,
                    valueHint: po.product ? t('cc_products.detail.receivedOfOrdered', 'received / ordered') : undefined,
                    badge: <StatusBadge variant={PO_VARIANT[po.status] ?? 'neutral'}>{t(`cc_purchase.status.${po.status}`, PO_LABEL[po.status] ?? po.status)}</StatusBadge>,
                  }))}
                />
              </Panel>
            ) : null}
          </>
        }
      />
    </RecordPage>
  )
}

export default ProductDetail
