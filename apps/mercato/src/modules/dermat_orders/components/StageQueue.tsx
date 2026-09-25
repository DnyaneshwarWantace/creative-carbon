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
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { stageDef } from '../lib/stages'
import { STAGE_VARIANT, daysUntil, formatDate, formatQty } from './format'
import { StageSheet, type StageActionRequest } from './StageSheet'
import { useStageAction } from './useStageAction'
import type { Order, OrderListItem, Stage } from './types'

type QueueTab = 'active' | 'waiting' | 'done'

const PAGE_SIZE = 50

export function StageQueue({ stageKey }: { stageKey: string }) {
  const t = useT()
  const def = stageDef(stageKey)
  const [tab, setTab] = React.useState<QueueTab>('active')
  const [rows, setRows] = React.useState<OrderListItem[]>([])
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [isLoading, setIsLoading] = React.useState(true)
  const [reload, setReload] = React.useState(0)
  const [order, setOrder] = React.useState<Order | null>(null)
  const [people, setPeople] = React.useState<Array<{ id: string; name: string }>>([])
  const runner = useStageAction(`dermat-stage-queue-${stageKey}`)

  React.useEffect(() => {
    apiCall<{ items?: Array<{ id: string; name: string }> }>('/api/dermat_orders/people', undefined, { fallback: { items: [] } }).then((call) =>
      setPeople(call.result?.items ?? []),
    )
  }, [])

  React.useEffect(() => setPage(1), [tab])

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    const params = new URLSearchParams({ stage: stageKey, stageStatus: tab, page: String(page), pageSize: String(PAGE_SIZE) })
    if (tab !== 'done') params.set('status', 'open')
    if (search.trim()) params.set('search', search.trim())
    apiCall<{ items?: OrderListItem[]; total?: number; totalPages?: number }>(`/api/dermat_orders/orders?${params.toString()}`, undefined, {
      fallback: { items: [] },
    }).then((call) => {
      if (cancelled) return
      if (!call.ok) flash(t('dermat_orders.list.loadError', 'Failed to load orders'), 'error')
      setRows(call.result?.items ?? [])
      setTotal(call.result?.total ?? 0)
      setTotalPages(call.result?.totalPages ?? 1)
      setIsLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [stageKey, tab, page, search, reload, t])

  const openOrder = async (id: string) => {
    const call = await apiCall<Order>(`/api/dermat_orders/orders?id=${encodeURIComponent(id)}`)
    if (!call.ok || !call.result) {
      flash(t('dermat_orders.errors.load', 'Could not load the order.'), 'error')
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

  const columns = React.useMemo<ColumnDef<OrderListItem>[]>(
    () => [
      {
        id: 'order',
        header: t('dermat_orders.list.order', 'Order'),
        cell: ({ row }) => (
          <span>
            <span className="font-mono text-xs font-semibold">{row.original.orderNo}</span>
            <span className="block text-xs text-muted-foreground">{formatDate(row.original.orderDate)}</span>
          </span>
        ),
      },
      { id: 'customer', header: t('dermat_orders.list.customer', 'Customer'), cell: ({ row }) => <span className="font-medium">{row.original.customerName || '—'}</span> },
      {
        id: 'products',
        header: t('dermat_orders.list.products', 'Products'),
        cell: ({ row }) => (
          <span className="block max-w-80 text-xs">
            {row.original.products.map((product) => (
              <span key={product.id} className="block truncate">
                {product.code ? <span className="mr-1.5 font-mono text-muted-foreground">{product.code}</span> : null}
                {product.title} · {formatQty(product.quantity, 0)} pcs
              </span>
            ))}
          </span>
        ),
      },
      {
        id: 'stage',
        header: t('dermat_orders.queue.here', 'This stage'),
        cell: ({ row }) => {
          const here = row.original.current.find((entry) => entry.key === stageKey)
          if (!here) return <span className="text-xs text-muted-foreground">{tab === 'waiting' ? t('dermat_orders.queue.coming', 'Coming') : t('dermat_orders.queue.done', 'Done')}</span>
          return (
            <span className="flex flex-col gap-0.5 text-xs">
              <StatusBadge variant={STAGE_VARIANT[here.status] ?? 'neutral'} dot>
                {here.status === 'on_hold' ? `${t('dermat_orders.status.on_hold', 'On hold')}${here.holdParty ? ` · ${here.holdParty}` : ''}` : t('dermat_orders.queue.todo', 'To do')}
              </StatusBadge>
              <span className="text-muted-foreground">
                {[here.responsibleName ?? t('dermat_orders.rail.unassigned', 'Not assigned'), here.days != null ? `${formatQty(here.days, 1)} d` : null].filter(Boolean).join(' · ')}
              </span>
            </span>
          )
        },
      },
      {
        id: 'other',
        header: t('dermat_orders.queue.alsoAt', 'Order is at'),
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
        header: t('dermat_orders.list.delivery', 'Delivery'),
        cell: ({ row }) => {
          const left = daysUntil(row.original.deliveryDate)
          return <span className={cn('text-xs', left !== null && left < 0 && 'font-semibold text-status-error-text')}>{formatDate(row.original.deliveryDate)}</span>
        },
      },
      {
        id: 'open',
        header: '',
        cell: ({ row }) => (
          <Link
            href={`/backend/orders/${row.original.id}`}
            onClick={(event) => event.stopPropagation()}
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            {t('dermat_orders.queue.openOrder', 'Order page')}
            <ExternalLink className="h-3 w-3" />
          </Link>
        ),
      },
    ],
    [stageKey, tab, t],
  )

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
            <TabsList aria-label={t('dermat_orders.queue.tabs', 'Orders at this stage')}>
              <TabsTrigger value="active">{t('dermat_orders.queue.tab.todo', 'To do')}</TabsTrigger>
              <TabsTrigger value="waiting">{t('dermat_orders.queue.tab.coming', 'Coming next')}</TabsTrigger>
              <TabsTrigger value="done">{t('dermat_orders.queue.tab.done', 'Done')}</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <DataTable
          title={
            tab === 'active'
              ? t('dermat_orders.queue.titleTodo', '{count} orders to work on', { count: total })
              : tab === 'waiting'
                ? t('dermat_orders.queue.titleComing', '{count} orders coming to this stage', { count: total })
                : t('dermat_orders.queue.titleDone', '{count} orders done here', { count: total })
          }
          columns={columns}
          data={rows}
          onRowClick={(row) => openOrder(row.id)}
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          searchPlaceholder={t('dermat_orders.list.search', 'Search order no., customer, product ID or batch no.')}
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
            shortCount={null}
            onClose={() => setOrder(null)}
            onAction={onAction}
          />
        ) : null}
      </PageBody>
    </Page>
  )
}

export default StageQueue
