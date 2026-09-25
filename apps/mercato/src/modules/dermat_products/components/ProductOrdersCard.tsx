"use client"

import * as React from 'react'
import Link from 'next/link'
import { ClipboardList, Plus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

type OrderRow = {
  id: string
  orderNo: string
  orderDate: string
  customerName: string
  status: string
  products: Array<{ id: string; quantity: number }>
  current: Array<{ label: string; status: string }>
}

const STATUS_VARIANT: Record<string, StatusBadgeVariant> = { booked: 'info', confirmed: 'warning', completed: 'success', cancelled: 'neutral' }

export function ProductOrdersCard({ productId }: { productId: string }) {
  const t = useT()
  const [rows, setRows] = React.useState<OrderRow[] | null>(null)

  React.useEffect(() => {
    let cancelled = false
    apiCall<{ items?: OrderRow[] }>(`/api/dermat_orders/orders?productId=${encodeURIComponent(productId)}&pageSize=10`, undefined, {
      fallback: { items: [] },
    }).then((call) => {
      if (!cancelled) setRows(call.ok ? (call.result?.items ?? []) : [])
    })
    return () => {
      cancelled = true
    }
  }, [productId])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <ClipboardList className="h-4 w-4 text-primary" />
          {t('dermat_products.orders.title', 'Orders for this product')}
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href="/backend/orders/new">
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t('dermat_products.orders.new', 'New order')}
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {rows && !rows.length ? <p className="p-4 text-sm text-muted-foreground">{t('dermat_products.orders.none', 'No orders yet.')}</p> : null}
        <ul className="divide-y text-sm">
          {(rows ?? []).map((row) => {
            const qty = row.products.filter((product) => product.id === productId).reduce((sum, product) => sum + product.quantity, 0)
            return (
              <li key={row.id}>
                <Link href={`/backend/orders/${row.id}`} className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-muted/30">
                  <span className="min-w-0">
                    <span className="font-mono text-xs font-semibold">{row.orderNo}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {row.customerName} · {new Intl.NumberFormat('en-IN').format(qty)} pcs
                      {row.current.length ? ` · ${row.current.map((entry) => entry.label).join(', ')}` : ''}
                    </span>
                  </span>
                  <StatusBadge variant={STATUS_VARIANT[row.status] ?? 'neutral'}>{t(`dermat_orders.status.${row.status}`, row.status)}</StatusBadge>
                </Link>
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

export default ProductOrdersCard
