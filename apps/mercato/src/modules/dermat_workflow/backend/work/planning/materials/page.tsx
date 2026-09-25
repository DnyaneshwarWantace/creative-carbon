"use client"

import * as React from 'react'
import Link from 'next/link'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MaterialPlanningGrid } from '../../../../components/MaterialPlanningGrid'
import { stripInternal } from '../../../../components/types'

type CandidateOrder = {
  orderId: string
  orderNumber: string | null
  stageCode: string | null
  stageName: string | null
  reservedQuantity: number
}

export default function MaterialPlanningPage() {
  const t = useT()
  const [orders, setOrders] = React.useState<CandidateOrder[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [selected, setSelected] = React.useState<string[]>([])
  const [reloadToken, setReloadToken] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    void (async () => {
      const call = await apiCall<{ items: CandidateOrder[]; error?: string }>('/api/dermat_workflow/planning/orders')
      if (cancelled) return
      if (!call.ok || !call.result) {
        setError(stripInternal(call.result?.error, t('dermat_workflow.planning.ordersError', 'Could not load orders.')))
      } else {
        setError(null)
        setOrders(call.result.items)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [reloadToken, t])

  const visible = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    return term ? orders.filter((order) => (order.orderNumber ?? '').toLowerCase().includes(term) || (order.stageName ?? '').toLowerCase().includes(term)) : orders
  }, [orders, search])

  const toggle = React.useCallback((orderId: string, checked: boolean) => {
    setSelected((current) => (checked ? [...current.filter((id) => id !== orderId), orderId] : current.filter((id) => id !== orderId)))
  }, [])

  const columns = React.useMemo<ColumnDef<CandidateOrder>[]>(
    () => [
      {
        id: 'select',
        header: '',
        cell: ({ row }) => (
          <Checkbox
            checked={selected.includes(row.original.orderId)}
            onCheckedChange={(checked) => toggle(row.original.orderId, checked === true)}
            onClick={(event) => event.stopPropagation()}
            aria-label={t('dermat_workflow.planning.selectOrder', 'Select order')}
          />
        ),
      },
      {
        id: 'order',
        header: t('dermat_workflow.queue.order', 'Order'),
        cell: ({ row }) => (
          <Link
            href={`/backend/sales/order-book/${row.original.orderId}`}
            className="font-medium text-primary hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.original.orderNumber ?? '—'}
          </Link>
        ),
      },
      {
        id: 'stage',
        header: t('dermat_workflow.queue.stage', 'Stage'),
        cell: ({ row }) => row.original.stageName ?? '—',
      },
      {
        id: 'reserved',
        header: t('dermat_workflow.planning.hasReservation', 'Stock reserved'),
        cell: ({ row }) =>
          row.original.reservedQuantity > 0
            ? t('dermat_workflow.planning.yesReserved', 'Yes')
            : <span className="text-muted-foreground">{t('dermat_workflow.planning.noReservation', 'No')}</span>,
      },
    ],
    [selected, t, toggle],
  )

  return (
    <Page>
      <PageBody>
        <div className="mb-4">
          <h1 className="text-lg font-semibold">{t('dermat_workflow.reservation.pageTitle', 'Stock Reservation')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('dermat_workflow.reservation.pageSubtitle', 'Hold stock for an order so no other order or plan can use it. Tick orders to see what their BOMs need and what is already reserved elsewhere. Reserving does not deduct stock — the store deducts it when it issues material.')}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-1">
            <DataTable<CandidateOrder>
              title={t('dermat_workflow.planning.openOrders', 'Open orders')}
              columns={columns}
              data={visible}
              isLoading={loading}
              error={error}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder={t('dermat_workflow.planning.searchOrders', 'Search order number or stage…')}
              onRowClick={(row) => toggle(row.orderId, !selected.includes(row.orderId))}
              emptyState={t('dermat_workflow.planning.noOrders', 'No open orders.')}
            />
          </div>
          <div className="xl:col-span-2">
            <MaterialPlanningGrid orderIds={selected} onChanged={() => setReloadToken((value) => value + 1)} />
          </div>
        </div>
      </PageBody>
    </Page>
  )
}
