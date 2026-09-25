"use client"

import * as React from 'react'
import Link from 'next/link'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StageSheet } from './StageSheet'
import { stripInternal, type StageDefinitionView, type StageTarget } from './types'

export type QueueRow = {
  key: string
  orderId: string
  orderNumber: string | null
  customerName: string | null
  subjectType: 'order' | 'order_line'
  subjectId: string
  stageCode: string
  stageName: string
  department: string
  phase: string | null
  phaseLabel: string | null
  productName: string | null
  productCode: string | null
  batchNumber: string | null
  quantity: string | null
  since: string | null
  status: 'in_progress' | 'waiting' | 'completed' | 'reverted' | 'skipped'
}

type WorkQueueProps = {
  department: string
}

type Filter = { kind: 'all' } | { kind: 'phase'; value: string } | { kind: 'stage'; value: string }

function waitingFor(since: string | null): string {
  if (!since) return '—'
  const started = new Date(since).getTime()
  if (Number.isNaN(started)) return '—'
  const hours = Math.max(0, Math.round((Date.now() - started) / 3_600_000))
  if (hours < 24) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

export function WorkQueue({ department }: WorkQueueProps) {
  const t = useT()
  const [rows, setRows] = React.useState<QueueRow[]>([])
  const [definitions, setDefinitions] = React.useState<StageDefinitionView[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [filterKey, setFilterKey] = React.useState('all')
  const [target, setTarget] = React.useState<StageTarget | null>(null)
  const [reloadToken, setReloadToken] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const call = await apiCall<{ items: StageDefinitionView[] }>('/api/dermat_workflow/definitions')
      if (!cancelled && call.ok && call.result) setDefinitions(call.result.items)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const departmentDefs = React.useMemo(
    () => definitions.filter((definition) => definition.department === department && !definition.isAutomatic),
    [definitions, department],
  )

  const filters: Array<{ key: string; label: string; filter: Filter }> = React.useMemo(() => {
    const options: Array<{ key: string; label: string; filter: Filter }> = [
      { key: 'all', label: t('dermat_workflow.queue.all', 'All'), filter: { kind: 'all' } },
    ]
    const phases = new Map<string, string>()
    departmentDefs.forEach((definition) => {
      if (definition.phase) phases.set(definition.phase, definition.phaseLabel ?? definition.phase)
    })
    departmentDefs
      .filter((definition) => !definition.phase)
      .forEach((definition) => options.push({ key: `stage:${definition.code}`, label: definition.name, filter: { kind: 'stage', value: definition.code } }))
    phases.forEach((label, phase) => options.push({ key: `phase:${phase}`, label, filter: { kind: 'phase', value: phase } }))
    return options
  }, [departmentDefs, t])

  const activeFilter = filters.find((option) => option.key === filterKey)?.filter ?? { kind: 'all' as const }

  React.useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({ department })
    if (search.trim()) params.set('search', search.trim())
    if (activeFilter.kind === 'phase') params.set('phase', activeFilter.value)
    if (activeFilter.kind === 'stage') params.set('stageCode', activeFilter.value)
    void (async () => {
      const call = await apiCall<{ items: QueueRow[]; error?: string }>(`/api/dermat_workflow/queue?${params.toString()}`)
      if (cancelled) return
      if (!call.ok || !call.result) {
        setError(stripInternal(call.result?.error, t('dermat_workflow.queue.loadError', 'Could not load the work queue.')))
        setRows([])
      } else {
        setRows(call.result.items)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [department, search, filterKey, reloadToken, activeFilter.kind, t])

  const hasLines = rows.some((row) => row.subjectType === 'order_line')

  const columns = React.useMemo<ColumnDef<QueueRow>[]>(() => {
    const base: ColumnDef<QueueRow>[] = [
      {
        id: 'order',
        header: t('dermat_workflow.queue.order', 'Order'),
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/backend/sales/order-book/${row.original.orderId}`}
              className="font-medium text-primary hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {row.original.orderNumber ?? '—'}
            </Link>
            <div className="truncate text-xs text-muted-foreground">{row.original.customerName ?? ''}</div>
          </div>
        ),
      },
    ]
    if (hasLines) {
      base.push(
        {
          id: 'product',
          header: t('dermat_workflow.queue.product', 'Product'),
          cell: ({ row }) =>
            row.original.productName ? (
              <div className="min-w-0">
                <div className="truncate">{row.original.productName}</div>
                <div className="text-xs text-muted-foreground">{row.original.productCode ?? ''}</div>
              </div>
            ) : (
              <span className="text-muted-foreground">{t('dermat_workflow.queue.wholeOrder', 'Whole order')}</span>
            ),
          meta: { maxWidth: '18rem' },
        },
        {
          id: 'batch',
          header: t('dermat_workflow.batch', 'Batch'),
          cell: ({ row }) => row.original.batchNumber ?? '—',
        },
        {
          id: 'quantity',
          header: t('dermat_workflow.qty', 'Qty'),
          cell: ({ row }) => (row.original.quantity ? Number(row.original.quantity) : '—'),
        },
      )
    }
    base.push(
      {
        id: 'stage',
        header: t('dermat_workflow.queue.stage', 'Stage'),
        cell: ({ row }) => (
          <div>
            <div className="font-medium">{row.original.stageName}</div>
            {row.original.phaseLabel ? <div className="text-xs text-muted-foreground">{row.original.phaseLabel}</div> : null}
          </div>
        ),
      },
      {
        id: 'waiting',
        header: t('dermat_workflow.queue.waiting', 'Waiting'),
        cell: ({ row }) => waitingFor(row.original.since),
      },
      {
        id: 'status',
        header: t('dermat_workflow.queue.status', 'Status'),
        cell: ({ row }) =>
          row.original.status === 'in_progress' ? (
            <StatusBadge variant="info">{t('dermat_workflow.state.current', 'In progress')}</StatusBadge>
          ) : (
            <StatusBadge variant="warning">{t('dermat_workflow.queue.new', 'New')}</StatusBadge>
          ),
      },
    )
    return base
  }, [hasLines, t])

  return (
    <div className="space-y-4">
      {filters.length > 2 ? (
        <SegmentedControl value={filterKey} onValueChange={setFilterKey} aria-label={t('dermat_workflow.queue.filter', 'Filter by stage')}>
          {filters.map((option) => (
            <SegmentedControlItem key={option.key} value={option.key}>
              {option.label}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
      ) : null}
      <DataTable<QueueRow>
        columns={columns}
        data={rows}
        isLoading={loading}
        error={error}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder={t('dermat_workflow.queue.search', 'Search order, customer, product name or code, batch…')}
        onRowClick={(row) =>
          setTarget({ orderId: row.orderId, subjectType: row.subjectType, subjectId: row.subjectId, stageCode: row.stageCode })
        }
        refreshButton={{
          onRefresh: () => setReloadToken((value) => value + 1),
          label: t('dermat_workflow.queue.refresh', 'Refresh'),
          isRefreshing: loading,
        }}
        emptyState={t('dermat_workflow.queue.empty', 'Nothing is waiting here right now.')}
      />
      <StageSheet
        target={target}
        onOpenChange={(open) => {
          if (!open) setTarget(null)
        }}
        onChanged={() => setReloadToken((value) => value + 1)}
      />
    </div>
  )
}

export default WorkQueue
