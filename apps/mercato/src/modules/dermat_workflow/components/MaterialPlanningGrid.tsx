"use client"

import * as React from 'react'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { Button } from '@open-mercato/ui/primitives/button'
import { Notice } from '@open-mercato/ui/primitives/Notice'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tag } from '@open-mercato/ui/primitives/tag'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { stripInternal } from './types'

export type PlanningMaterial = {
  key: string
  materialKind: 'raw_material' | 'packaging_material'
  materialId: string
  code: string | null
  name: string
  unit: string | null
  required: number
  stock: number
  reservedForSelected: number
  reservedByOthers: number
  reservedByOthersOrders: Array<{ orderId: string; orderNumber: string | null; quantity: number }>
  available: number
  pendingFromVendor: number
  toBeOrdered: number
  perOrder: Array<{ orderId: string; orderNumber: string | null; required: number; reserved: number }>
}

type PlanningOrder = {
  orderId: string
  orderNumber: string | null
  customerName: string | null
  lines: Array<{
    lineId: string
    productName: string | null
    quantity: number
    bulkKg: number | null
    packSizeLabel: string | null
    boms: string[]
    warning: string | null
  }>
}

type PlanningResult = { orders: PlanningOrder[]; materials: PlanningMaterial[]; warnings: string[] }

type MaterialPlanningGridProps = {
  orderIds: string[]
  canReserve?: boolean
  onChanged?: () => void
}

const format = (value: number) => (Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: 3 }) : '—')

export function MaterialPlanningGrid({ orderIds, canReserve = true, onChanged }: MaterialPlanningGridProps) {
  const t = useT()
  const [data, setData] = React.useState<PlanningResult | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<'reserve' | 'clear' | null>(null)
  const [reloadToken, setReloadToken] = React.useState(0)
  const mutationContextId = 'dermat_workflow.material-planning'
  const { runMutation, retryLastMutation } = useGuardedMutation<{
    formId: string
    resourceKind: string
    resourceId: string
    retryLastMutation: () => Promise<boolean>
  }>({ contextId: mutationContextId })
  const idsKey = orderIds.join(',')

  React.useEffect(() => {
    if (!idsKey) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    void (async () => {
      const call = await apiCall<PlanningResult & { error?: string }>(`/api/dermat_workflow/planning?orderIds=${idsKey}`)
      if (cancelled) return
      if (!call.ok || !call.result) {
        setError(stripInternal(call.result?.error, t('dermat_workflow.planning.loadError', 'Could not calculate the material requirement.')))
        setData(null)
      } else {
        setData(call.result)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [idsKey, reloadToken, t])

  const perform = async (action: 'reserve' | 'clear') => {
    const payload = { action, orderIds }
    setBusy(action)
    try {
      const call = await runMutation({
        operation: async () =>
          apiCall<{ reservedLines?: number; shortMaterials?: number; released?: number; error?: string }>(
            '/api/dermat_workflow/reservations',
            { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
          ),
        context: { formId: mutationContextId, resourceKind: 'dermat_workflow.stock_reservation', resourceId: orderIds[0] ?? '', retryLastMutation },
        mutationPayload: payload,
      })
      if (!call.ok) {
        flash(stripInternal(call.result?.error, t('dermat_workflow.planning.actionError', 'Could not update the reservation.')), 'error')
        return
      }
      if (action === 'clear') {
        flash(t('dermat_workflow.planning.cleared', 'Reservation cleared — the stock is free again.'), 'success')
      } else if ((call.result?.shortMaterials ?? 0) > 0) {
        flash(
          t('dermat_workflow.planning.reservedShort', 'Stock reserved. {count} material(s) do not have enough free stock — see "To be ordered".', {
            count: call.result?.shortMaterials ?? 0,
          }),
          'warning',
        )
      } else {
        flash(t('dermat_workflow.planning.reserved', 'Stock reserved. It is held for this order and not deducted until the store issues it.'), 'success')
      }
      setReloadToken((value) => value + 1)
      onChanged?.()
    } finally {
      setBusy(null)
    }
  }

  const columns = React.useMemo<ColumnDef<PlanningMaterial>[]>(
    () => [
      {
        id: 'material',
        header: t('dermat_workflow.planning.material', 'Material'),
        meta: { maxWidth: '260px' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{row.original.name}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{row.original.code ?? ''}</span>
              <Tag variant="neutral">
                {row.original.materialKind === 'raw_material'
                  ? t('dermat_workflow.planning.rm', 'RM')
                  : t('dermat_workflow.planning.pm', 'PM')}
              </Tag>
            </div>
          </div>
        ),
      },
      {
        id: 'required',
        header: t('dermat_workflow.planning.required', 'Required'),
        cell: ({ row }) => `${format(row.original.required)} ${row.original.unit ?? ''}`,
      },
      {
        id: 'stock',
        header: t('dermat_workflow.planning.stock', 'In stock'),
        cell: ({ row }) => format(row.original.stock),
      },
      {
        id: 'reserved',
        header: orderIds.length > 1
          ? t('dermat_workflow.planning.reservedSelected', 'Reserved for these orders')
          : t('dermat_workflow.planning.reservedThis', 'Reserved for this order'),
        cell: ({ row }) => format(row.original.reservedForSelected),
      },
      {
        id: 'reservedOthers',
        header: t('dermat_workflow.planning.reservedOthers', 'Reserved by other orders'),
        meta: { maxWidth: '220px' },
        cell: ({ row }) =>
          row.original.reservedByOthers > 0 ? (
            <div className="min-w-0">
              <div className="font-medium">{format(row.original.reservedByOthers)}</div>
              <div className="truncate text-xs text-muted-foreground">
                {row.original.reservedByOthersOrders
                  .map((entry) => `${entry.orderNumber ?? '—'}: ${format(entry.quantity)}`)
                  .join(' · ')}
              </div>
            </div>
          ) : (
            <span className="text-muted-foreground">0</span>
          ),
      },
      {
        id: 'available',
        header: t('dermat_workflow.planning.available', 'Available (free)'),
        cell: ({ row }) =>
          row.original.available < 0 ? (
            <StatusBadge variant="error">{format(row.original.available)}</StatusBadge>
          ) : (
            format(row.original.available)
          ),
      },
      {
        id: 'pending',
        header: t('dermat_workflow.planning.pending', 'Pending from vendor'),
        cell: ({ row }) => format(row.original.pendingFromVendor),
      },
      {
        id: 'toBeOrdered',
        header: t('dermat_workflow.planning.toBeOrdered', 'To be ordered'),
        cell: ({ row }) =>
          row.original.toBeOrdered > 0 ? (
            <StatusBadge variant="warning">{`${format(row.original.toBeOrdered)} ${row.original.unit ?? ''}`}</StatusBadge>
          ) : (
            <StatusBadge variant="success">{t('dermat_workflow.planning.covered', 'Covered')}</StatusBadge>
          ),
      },
    ],
    [orderIds.length, t],
  )

  if (!orderIds.length) {
    return <Notice compact message={t('dermat_workflow.planning.pickOrders', 'Select one or more orders to see their material requirement.')} />
  }

  const lineWarnings = (data?.orders ?? []).flatMap((order) =>
    order.lines.filter((line) => line.warning).map((line) => `${order.orderNumber ?? ''} · ${line.productName ?? ''}: ${line.warning}`),
  )
  const hasReservation = (data?.materials ?? []).some((material) => material.reservedForSelected > 0)

  return (
    <div className="space-y-3">
      {data ? (
        <div className="space-y-1 text-sm">
          {data.orders.map((order) => (
            <div key={order.orderId} className="text-muted-foreground">
              <span className="font-medium text-foreground">{order.orderNumber}</span>
              {order.customerName ? ` · ${order.customerName}` : ''}
              {' — '}
              {order.lines
                .map((line) =>
                  `${line.productName ?? ''} × ${format(line.quantity)}${line.bulkKg != null ? ` (${format(line.bulkKg)} kg bulk${line.packSizeLabel ? `, ${line.packSizeLabel} each` : ''})` : ''}${line.boms.length ? ` · BOM: ${line.boms.join(', ')}` : ''}`,
                )
                .join('; ')}
            </div>
          ))}
        </div>
      ) : null}
      {lineWarnings.length ? (
        <Notice variant="warning" title={t('dermat_workflow.planning.warningsTitle', 'Check these products')} message={lineWarnings.join('\n')} />
      ) : null}
      {error ? <Notice variant="error" message={error} /> : null}
      {canReserve ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void perform('reserve')} disabled={Boolean(busy) || loading || !data?.materials.length}>
            {busy === 'reserve' ? <Spinner /> : null}
            {t('dermat_workflow.planning.reserve', 'Reserve stock')}
          </Button>
          <Button type="button" variant="outline" onClick={() => void perform('clear')} disabled={Boolean(busy) || loading || !hasReservation}>
            {busy === 'clear' ? <Spinner /> : null}
            {t('dermat_workflow.planning.clear', 'Clear reservation')}
          </Button>
        </div>
      ) : null}
      <DataTable<PlanningMaterial>
        columns={columns}
        data={data?.materials ?? []}
        isLoading={loading}
        emptyState={t('dermat_workflow.planning.empty', 'No BOM materials found for the selected orders.')}
        refreshButton={{
          onRefresh: () => setReloadToken((value) => value + 1),
          label: t('dermat_workflow.planning.refresh', 'Recalculate'),
          isRefreshing: loading,
        }}
      />
    </div>
  )
}

export default MaterialPlanningGrid
