"use client"

import * as React from 'react'
import Link from 'next/link'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { ExternalLink } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { Tabs, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ExportButton } from '../../cc_products/components/ExportButton'
import { openServerExport } from '../../cc_products/lib/csvExport'
import { stageDef } from '../lib/stages'
import { daysUntil, formatDate, formatQty } from './format'
import { StageSheet, type StageActionRequest } from './StageSheet'
import { useStageAction } from './useStageAction'
import type { Order, Stage } from './types'
import { StatePill, sheetWorkState, stageEdit, type SheetColumn, type SheetOrder } from './orderBookColumns'
import { useCellEditor } from './useCellEditor'
import { EditTableBar } from '../../cc_products/components/EditTableBar'
import { useStageSettings } from './useStageSettings'

type QueueTab = 'active' | 'waiting' | 'done'

const PAGE_SIZE = 50

export function StageQueue({ stageKey }: { stageKey: string }) {
  const t = useT()
  useStageSettings()
  const def = stageDef(stageKey)
  const [tab, setTab] = React.useState<QueueTab>('active')
  const [rows, setRows] = React.useState<SheetOrder[]>([])
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [isLoading, setIsLoading] = React.useState(true)
  const [reload, setReload] = React.useState(0)
  const [order, setOrder] = React.useState<Order | null>(null)
  const [people, setPeople] = React.useState<Array<{ id: string; name: string }>>([])
  const runner = useStageAction(`cc-stage-queue-${stageKey}`)

  React.useEffect(() => {
    apiCall<{ items?: Array<{ id: string; name: string }> }>('/api/cc_orders/people', undefined, { fallback: { items: [] } }).then((call) =>
      setPeople(call.result?.items ?? []),
    )
  }, [])

  React.useEffect(() => setPage(1), [tab])

  const silent = React.useRef(false)
  React.useEffect(() => {
    let cancelled = false
    const quiet = silent.current
    if (!quiet) setIsLoading(true)
    const params = new URLSearchParams({ stage: stageKey, stageStatus: tab, page: String(page), pageSize: String(PAGE_SIZE) })
    if (tab !== 'done') params.set('status', 'open')
    if (search.trim()) params.set('search', search.trim())
    apiCall<{ items?: SheetOrder[]; total?: number; totalPages?: number }>(`/api/cc_orders/orders/sheet?${params.toString()}`, undefined, {
      fallback: { items: [] },
    }).then((call) => {
      if (cancelled) return
      if (!call.ok) flash(t('cc_orders.list.loadError', 'Failed to load orders'), 'error')
      setRows(call.result?.items ?? [])
      setTotal(call.result?.total ?? 0)
      setTotalPages(call.result?.totalPages ?? 1)
      setIsLoading(false)
      silent.current = false
    })
    return () => {
      cancelled = true
    }
  }, [stageKey, tab, page, search, reload, t])

  const table = useCellEditor({
    contextId: `cc-stage-queue-cells-${stageKey}`,
    patchOrder: (orderId, mutate) => setRows((prev) => prev.map((row) => (row.id === orderId ? mutate(row) : row))),
    refresh: () => {
      silent.current = true
      setReload((value) => value + 1)
    },
  })

  const openOrder = async (id: string) => {
    const call = await apiCall<Order>(`/api/cc_orders/orders?id=${encodeURIComponent(id)}`)
    if (!call.ok || !call.result) {
      flash(t('cc_orders.errors.load', 'Could not load the order.'), 'error')
      return
    }
    setOrder(call.result)
  }

  const onAction = async (stage: Stage, request: StageActionRequest): Promise<boolean> => {
    if (!order) return false
    const result = await runner.run(order, stage, request)
    if (result.order) {
      setOrder(result.order)
      if (request.action === 'complete' || request.action === 'skip') {
        setOrder(null)
        setReload((value) => value + 1)
      }
      return true
    }
    if (result.conflict) await openOrder(order.id)
    return false
  }

  const fieldColumns = React.useMemo<SheetColumn[]>(
    () =>
      (def?.fields ?? []).map((field) => ({
        key: field.key,
        label: field.label,
        section: def?.label ?? '',
        scope: 'order' as const,
        align: field.type === 'number' ? ('right' as const) : undefined,
        edit: stageEdit(stageKey, field.key),
        render: ({ order }) => {
          const value = order.stages[stageKey]?.fields[field.key]
          if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>
          if (field.type === 'date') return formatDate(String(value))
          if (field.type === 'number') return formatQty(Number(value), 2)
          return <span className={cn(field.type === 'textarea' && 'block max-w-60 truncate')}>{String(value)}</span>
        },
      })),
    [def, stageKey],
  )

  const columns: ColumnDef<SheetOrder>[] = [
    {
      id: 'order',
      header: t('cc_orders.list.order', 'Order'),
      cell: ({ row }) => (
        <span>
          <span className="font-mono text-xs font-semibold">{row.original.orderNo}</span>
          <span className="block text-xs text-muted-foreground">{formatDate(row.original.orderDate)}</span>
        </span>
      ),
    },
    { id: 'customer', header: t('cc_orders.list.customer', 'Customer'), cell: ({ row }) => <span className="font-medium">{row.original.customerName || '—'}</span> },
    {
      id: 'products',
      header: t('cc_orders.list.products', 'Products'),
      cell: ({ row }) => (
        <span className="block max-w-72 text-xs">
          {row.original.lines.map((line) => (
            <span key={line.id} className="block truncate">
              {line.productCode ? <span className="mr-1.5 font-mono text-muted-foreground">{line.productCode}</span> : null}
              {line.brandName || line.productTitle}
              {line.packSize ? ` ${line.packSize}` : ''} · {formatQty(line.quantity, 0)} pcs
            </span>
          ))}
        </span>
      ),
    },
    {
      id: 'stage',
      header: t('cc_orders.queue.here', 'This stage'),
      cell: ({ row }) => {
        const stage = row.original.stages[stageKey]
        const state = sheetWorkState(stage)
        const current = row.original.current.find((entry) => entry.key === stageKey)
        return (
          <span className="flex flex-col gap-0.5 text-xs">
            <span className="flex items-center gap-1.5">
              <StatePill state={state} />
              {stage?.stepsTotal ? <span className="tabular-nums text-muted-foreground">{t('cc_orders.queue.steps', '{done}/{total} steps', { done: stage.stepsDone, total: stage.stepsTotal })}</span> : null}
            </span>
            <span className="text-muted-foreground">
              {[
                current?.status === 'on_hold' ? current.holdParty : null,
                stage?.responsibleName ?? (tab === 'done' ? stage?.completedByName : t('cc_orders.rail.unassigned', 'Not assigned')),
                stage?.days != null && tab !== 'waiting' ? `${formatQty(stage.days, 1)} d` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </span>
        )
      },
    },
    ...fieldColumns.map<ColumnDef<SheetOrder>>((column) => ({
      id: `field-${column.key}`,
      header: column.label,
      cell: ({ row }) => <span className="block min-w-24 text-xs">{table.renderCell(column, { order: row.original, line: null })}</span>,
    })),
    {
      id: 'other',
      header: t('cc_orders.queue.alsoAt', 'Order is at'),
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.current
            .filter((entry) => entry.key !== stageKey)
            .map((entry) => entry.label)
            .join(', ') || '—'}
        </span>
      ),
    },
    {
      id: 'delivery',
      header: t('cc_orders.list.delivery', 'Delivery'),
      cell: ({ row }) => {
        const left = daysUntil(row.original.deliveryDate)
        return <span className={cn('text-xs', left !== null && left < 0 && 'font-semibold text-status-error-text')}>{formatDate(row.original.deliveryDate)}</span>
      },
    },
    {
      id: 'open',
      header: '',
      cell: ({ row }) => (
        <span className="flex flex-col gap-1 text-xs">
          <button type="button" onClick={(event) => { event.stopPropagation(); void openOrder(row.original.id) }} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
            {tab === 'active' ? t('cc_orders.queue.openForm', 'Open form') : t('cc_orders.queue.view', 'View')}
          </button>
          <Link
            href={`/backend/orders/${row.original.id}/stages/${stageKey}`}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 text-muted-foreground hover:underline"
          >
            {t('cc_orders.queue.stagePage', 'Stage page')}
            <ExternalLink className="h-3 w-3" />
          </Link>
          <Link href={`/backend/orders/${row.original.id}`} onClick={(event) => event.stopPropagation()} className="text-muted-foreground hover:underline">
            {t('cc_orders.queue.openOrder', 'Order page')}
          </Link>
        </span>
      ),
    },
  ]

  const exportStage = () => {
    const params = new URLSearchParams({ stage: stageKey, stageStatus: tab })
    if (tab !== 'done') params.set('status', 'open')
    if (search.trim()) params.set('search', search.trim())
    openServerExport(`/api/cc_orders/orders/export?${params.toString()}`)
  }

  if (!def) return null
  const selected = order?.stages.find((entry) => entry.key === stageKey) ?? null

  return (
    <Page>
      <PageBody>
        <div className="mb-4 space-y-3">
          <div>
            <h1 className="text-xl font-bold">{def.label}</h1>
            <p className="text-sm text-muted-foreground">
              {def.department} · {def.hint}
            </p>
          </div>
          <Tabs value={tab} onValueChange={(value) => setTab(value as QueueTab)} variant="underline">
            <TabsList aria-label={t('cc_orders.queue.tabs', 'Orders at this stage')}>
              <TabsTrigger value="active">{t('cc_orders.queue.tab.todo', 'To do')}</TabsTrigger>
              <TabsTrigger value="waiting">{t('cc_orders.queue.tab.coming', 'Coming next')}</TabsTrigger>
              <TabsTrigger value="done">{t('cc_orders.queue.tab.done', 'Done')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <DataTable
          perspective={{ tableId: `cc_orders.work.${stageKey}` }}
          title={
            tab === 'active'
              ? t('cc_orders.queue.titleTodo', '{count} orders to work on', { count: total })
              : tab === 'waiting'
                ? t('cc_orders.queue.titleComing', '{count} orders coming to this stage', { count: total })
                : t('cc_orders.queue.titleDone', '{count} orders done here', { count: total })
          }
          columns={columns}
          data={rows}
          onRowClick={(row) => (table.editing ? undefined : openOrder(row.id))}
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          searchPlaceholder={t('cc_orders.list.search', 'Search order no., customer, product ID or batch no.')}
          actions={
            <span className="flex flex-wrap items-center gap-2">
              {tab === 'active' ? (
                <EditTableBar editing={table.editing} dirtyCount={table.dirtyCount} saving={table.saving} onEdit={table.startEditing} onCancel={table.cancelEditing} onSave={() => void table.saveAll()} />
              ) : null}
              <ExportButton onExport={exportStage} />
            </span>
          }
          pagination={{ page, pageSize: PAGE_SIZE, total, totalPages, onPageChange: setPage }}
          isLoading={isLoading}
        />
        {order ? (
          <StageSheet
            order={order}
            stage={selected}
            people={people}
            canWork
            busy={runner.busy}
            onClose={() => setOrder(null)}
            onAction={onAction}
          />
        ) : null}
      </PageBody>
    </Page>
  )
}

export default StageQueue
