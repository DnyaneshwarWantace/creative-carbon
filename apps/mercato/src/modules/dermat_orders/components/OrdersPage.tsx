"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import type { LegacyColumnDef as ColumnDef } from '@tanstack/react-table/legacy'
import { Plus } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { Button } from '@open-mercato/ui/primitives/button'
import { Tabs, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { STAGES } from '../lib/stages'
import { ORDER_VARIANT, STAGE_VARIANT, daysUntil, formatDate, formatQty } from './format'
import type { OrderListItem } from './types'

const PAGE_SIZE = 50
const TABS = ['open', 'on_hold', 'completed', 'cancelled', 'all'] as const
type Tab = (typeof TABS)[number]

export function OrdersPage() {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get('tab') as Tab | null
  const tab: Tab = tabParam && (TABS as readonly string[]).includes(tabParam) ? tabParam : 'open'
  const [stage, setStage] = React.useState<string>('all')
  const [rows, setRows] = React.useState<OrderListItem[]>([])
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [total, setTotal] = React.useState(0)
  const [totalPages, setTotalPages] = React.useState(1)
  const [isLoading, setIsLoading] = React.useState(true)

  React.useEffect(() => setPage(1), [tab, stage])

  React.useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
    if (tab !== 'all') params.set('status', tab)
    if (stage !== 'all') params.set('stage', stage)
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
  }, [tab, stage, page, search, t])

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
      {
        id: 'customer',
        header: t('dermat_orders.list.customer', 'Customer'),
        cell: ({ row }) => <span className="font-medium">{row.original.customerName || '—'}</span>,
      },
      {
        id: 'products',
        header: t('dermat_orders.list.products', 'Products'),
        cell: ({ row }) => {
          const [first, ...rest] = row.original.products
          if (!first) return '—'
          return (
            <span className="block max-w-72">
              <span className="block truncate">
                {first.code ? <span className="mr-1.5 font-mono text-xs text-muted-foreground">{first.code}</span> : null}
                {first.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatQty(first.quantity, 0)} pcs{rest.length ? ` · +${rest.length} ${t('dermat_orders.list.more', 'more')}` : ''}
              </span>
            </span>
          )
        },
      },
      {
        id: 'stage',
        header: t('dermat_orders.list.stage', 'Current stage'),
        cell: ({ row }) =>
          row.original.current.length ? (
            <span className="flex flex-col gap-1">
              {row.original.current.map((entry) => (
                <span key={entry.key} className="flex flex-wrap items-center gap-1.5 text-xs">
                  <StatusBadge variant={STAGE_VARIANT[entry.status] ?? 'neutral'} dot>
                    {entry.label}
                  </StatusBadge>
                  <span className="text-muted-foreground">
                    {[entry.status === 'on_hold' ? entry.holdParty : null, entry.responsibleName, entry.days != null ? `${formatQty(entry.days, 1)} d` : null]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          ),
      },
      {
        id: 'progress',
        header: t('dermat_orders.list.progress', 'Progress'),
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
              <span className="block h-full bg-primary" style={{ width: `${Math.round((row.original.doneCount / Math.max(1, row.original.stageCount)) * 100)}%` }} />
            </span>
            <span className="text-xs text-muted-foreground">
              {row.original.doneCount}/{row.original.stageCount}
            </span>
          </span>
        ),
      },
      {
        id: 'delivery',
        header: t('dermat_orders.list.delivery', 'Delivery'),
        cell: ({ row }) => {
          const left = daysUntil(row.original.deliveryDate)
          const late = left !== null && left < 0 && row.original.status !== 'completed' && row.original.status !== 'cancelled'
          return <span className={cn('text-xs', late && 'font-semibold text-status-error-text')}>{formatDate(row.original.deliveryDate)}</span>
        },
      },
      {
        id: 'status',
        header: t('dermat_orders.list.status', 'Status'),
        cell: ({ row }) => (
          <StatusBadge variant={ORDER_VARIANT[row.original.status] ?? 'neutral'}>{t(`dermat_orders.status.${row.original.status}`, row.original.status)}</StatusBadge>
        ),
      },
    ],
    [t],
  )

  return (
    <Page>
      <PageBody>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <Tabs value={tab} onValueChange={(value) => router.replace(`/backend/orders?tab=${value}`)} variant="underline">
            <TabsList aria-label={t('dermat_orders.list.tabs', 'Order status')}>
              <TabsTrigger value="open">{t('dermat_orders.list.tab.open', 'Open')}</TabsTrigger>
              <TabsTrigger value="on_hold">{t('dermat_orders.list.tab.hold', 'On hold')}</TabsTrigger>
              <TabsTrigger value="completed">{t('dermat_orders.list.tab.completed', 'Completed')}</TabsTrigger>
              <TabsTrigger value="cancelled">{t('dermat_orders.list.tab.cancelled', 'Cancelled')}</TabsTrigger>
              <TabsTrigger value="all">{t('dermat_orders.list.tab.all', 'All')}</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="w-56">
            <Select value={stage} onValueChange={setStage}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('dermat_orders.list.anyStage', 'Any stage')}</SelectItem>
                {STAGES.filter((entry) => entry.key !== 'order').map((entry) => (
                  <SelectItem key={entry.key} value={entry.key}>
                    {t('dermat_orders.list.atStage', 'At: {stage}', { stage: entry.label })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DataTable
          title={t('dermat_orders.list.title', 'Order book')}
          columns={columns}
          data={rows}
          onRowClick={(row) => router.push(`/backend/orders/${row.id}`)}
          searchValue={search}
          onSearchChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          searchPlaceholder={t('dermat_orders.list.search', 'Search order no., customer, product ID or batch no.')}
          actions={
            <Button asChild>
              <Link href="/backend/orders/new">
                <Plus className="mr-2 h-4 w-4" />
                {t('dermat_orders.list.new', 'New order')}
              </Link>
            </Button>
          }
          pagination={{ page, pageSize: PAGE_SIZE, total, totalPages, onPageChange: setPage }}
          isLoading={isLoading}
        />
      </PageBody>
    </Page>
  )
}

export default OrdersPage
