"use client"

import * as React from 'react'
import Link from 'next/link'
import { ClipboardList, Layers } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { formatQty } from './MaterialPicker'

type Usage = {
  usedIn: Array<{ bomId: string; version: number; status: string; productId: string; productName: string; productCode: string | null; fillQty: number | null; fillUnit: string | null; perPiece: number | null; percent: number | null; unit: string }>
  finishedGoods: Array<{ id: string; title: string; code: string | null }>
}
type OrderRow = { id: string; orderNo: string; customerName: string; status: string; products: Array<{ id: string; title: string; quantity: number }>; current: Array<{ label: string }> }

const ORDER_VARIANT: Record<string, StatusBadgeVariant> = { booked: 'info', confirmed: 'warning', completed: 'success', cancelled: 'neutral' }

export function BomLinks({ productId, productKind }: { productId: string; productKind: string | null }) {
  const t = useT()
  const [usage, setUsage] = React.useState<Usage | null>(null)
  const [orders, setOrders] = React.useState<OrderRow[] | null>(null)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      let fgIds: string[] = productKind === 'finished_goods' ? [productId] : []
      if (productKind !== 'finished_goods') {
        const call = await apiCall<Usage>(`/api/dermat_boms/where-used?productId=${encodeURIComponent(productId)}`, undefined, { fallback: { usedIn: [], finishedGoods: [] } })
        if (cancelled) return
        setUsage(call.result ?? { usedIn: [], finishedGoods: [] })
        fgIds = (call.result?.finishedGoods ?? []).map((fg) => fg.id)
      }
      const lists = await Promise.all(
        fgIds.slice(0, 20).map((id) =>
          apiCall<{ items?: OrderRow[] }>(`/api/dermat_orders/orders?productId=${encodeURIComponent(id)}&pageSize=20`, undefined, { fallback: { items: [] } }),
        ),
      )
      if (cancelled) return
      const merged = new Map<string, OrderRow>()
      for (const list of lists) for (const order of list.result?.items ?? []) merged.set(order.id, order)
      setOrders(Array.from(merged.values()))
    })()
    return () => {
      cancelled = true
    }
  }, [productId, productKind])

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      {productKind !== 'finished_goods' ? (
        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-muted/20 pb-3">
            <CardTitle className="flex items-center gap-2 text-sm font-bold">
              <Layers className="h-4 w-4 text-primary" />
              {t('dermat_boms.links.usedIn', 'Used in')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {usage?.usedIn.length ? (
              <ul className="divide-y text-sm">
                {usage.usedIn.map((entry) => (
                  <li key={entry.bomId}>
                    <Link href={`/backend/boms/${entry.bomId}`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-muted/30">
                      <span className="min-w-0 truncate">
                        {entry.productCode ? <span className="mr-1 font-mono text-xs text-muted-foreground">{entry.productCode}</span> : null}
                        {entry.productName}
                        <span className="ml-1 text-xs text-muted-foreground">v{entry.version}</span>
                      </span>
                      <span className="shrink-0 font-mono text-xs">
                        {entry.percent != null
                          ? `${formatQty(entry.percent, 4)} %`
                          : entry.fillQty != null
                            ? `${formatQty(entry.fillQty)} ${entry.fillUnit}/pc`
                            : `${formatQty(entry.perPiece ?? 0, 5)} ${entry.unit}/pc`}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">{usage ? t('dermat_boms.links.notUsed', 'Not used in another BOM yet.') : t('dermat_boms.links.loading', 'Loading…')}</p>
            )}
          </CardContent>
        </Card>
      ) : null}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-bold">
            <ClipboardList className="h-4 w-4 text-primary" />
            {t('dermat_boms.links.orders', 'Orders using this product')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {orders?.length ? (
            <ul className="divide-y text-sm">
              {orders.map((order) => (
                <li key={order.id}>
                  <Link href={`/backend/orders/${order.id}`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-muted/30">
                    <span className="min-w-0">
                      <span className="font-mono text-xs font-semibold">{order.orderNo}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {order.customerName} · {order.products.map((product) => `${product.title} × ${formatQty(product.quantity, 0)}`).join(', ')}
                        {order.current.length ? ` · ${order.current.map((stage) => stage.label).join(', ')}` : ''}
                      </span>
                    </span>
                    <StatusBadge variant={ORDER_VARIANT[order.status] ?? 'neutral'}>{t(`dermat_orders.status.${order.status}`, order.status)}</StatusBadge>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">{orders ? t('dermat_boms.links.noOrders', 'No orders yet.') : t('dermat_boms.links.loading', 'Loading…')}</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default BomLinks
