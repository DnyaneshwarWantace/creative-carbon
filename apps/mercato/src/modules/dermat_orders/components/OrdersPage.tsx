"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowRight, CalendarClock, ChevronLeft, ChevronRight, Columns3, FileSpreadsheet, IndianRupee, LayoutGrid, List, PauseCircle, Plus, Search, Wallet } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Popover, PopoverContent, PopoverTrigger } from '@open-mercato/ui/primitives/popover'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { EditTableBar } from '../../dermat_products/components/EditTableBar'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ExportButton } from '../../dermat_products/components/ExportButton'
import { openServerExport } from '../../dermat_products/lib/csvExport'
import { STAGES, WORK_STATE_LABEL } from '../lib/stages'
import { formatDate, formatQty } from './format'
import { ALL_COLUMNS, DEFAULT_VIEW, SHEET_VIEWS, BRAND_COLUMN, StatePill, sheetWorkState, type SheetColumn, type SheetOrder } from './orderBookColumns'
import { StageSheet, type StageActionRequest } from './StageSheet'
import { useStageAction } from './useStageAction'
import { useCellEditor } from './useCellEditor'
import type { Order, Stage } from './types'

const PAGE_SIZE = 50
const STORAGE_KEY = 'dermat.orderBook.columns.v1'
const STATUS_TABS = ['open', 'on_hold', 'completed', 'cancelled', 'all'] as const
type StatusTab = (typeof STATUS_TABS)[number]

type Summary = { orders: number; value: number; received: number; due: number; late: number; onHold: number; stageCounts: Record<string, number> }
type SheetResponse = { items: SheetOrder[]; total: number; totalPages: number; summary: Summary }

function rupees(value: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value)}`
}

function readColumns(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string')) return parsed.filter((key) => ALL_COLUMNS.some((column) => column.key === key))
  } catch {
    return DEFAULT_VIEW.columns
  }
  return DEFAULT_VIEW.columns
}

function ColumnsMenu({ visible, onChange }: { visible: string[]; onChange: (next: string[]) => void }) {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const [filter, setFilter] = React.useState('')
  const sections = React.useMemo(() => {
    const map = new Map<string, SheetColumn[]>()
    const needle = filter.trim().toLowerCase()
    for (const column of ALL_COLUMNS) {
      if (needle && !column.label.toLowerCase().includes(needle) && !column.section.toLowerCase().includes(needle)) continue
      map.set(column.section, [...(map.get(column.section) ?? []), column])
    }
    return [...map.entries()]
  }, [filter])
  const shown = new Set(visible)
  const toggle = (key: string) => onChange(shown.has(key) ? visible.filter((entry) => entry !== key) : [...visible, key])
  const activeView = SHEET_VIEWS.find((view) => view.columns.length === visible.length && view.columns.every((key, index) => visible[index] === key))
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline">
          <Columns3 className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {t('dermat_orders.book.columns', 'View & columns')}
          <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary tabular-nums">{visible.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-96 flex-col p-0">
        <div className="space-y-2 border-b p-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t('dermat_orders.book.views', 'Views')}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {SHEET_VIEWS.map((view) => (
              <button
                key={view.key}
                type="button"
                onClick={() => onChange(view.columns)}
                className={cn(
                  'rounded-md border px-2.5 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  activeView?.key === view.key ? 'border-primary bg-primary/5' : 'border-border',
                )}
              >
                <span className="block text-xs font-semibold">{view.label}</span>
                <span className="block text-xs text-muted-foreground">{view.hint}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => onChange(ALL_COLUMNS.map((column) => column.key))}
              className="rounded-md border border-border px-2.5 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="block text-xs font-semibold">{t('dermat_orders.book.everything', 'Everything')}</span>
              <span className="block text-xs text-muted-foreground">{t('dermat_orders.book.everythingHint', 'Every field of every stage')}</span>
            </button>
          </div>
        </div>
        <div className="border-b p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input id="order-book-column-filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="h-8 pl-8 text-xs" placeholder={t('dermat_orders.book.findColumn', 'Find a column to add, e.g. fragrance, LR no., shift')} />
          </div>
        </div>
        <div className="max-h-80 space-y-3 overflow-y-auto p-3">
          {sections.map(([section, columns]) => (
            <div key={section} className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{section}</p>
              {columns.map((column) => (
                <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded-sm px-1 py-0.5 text-sm hover:bg-muted/40">
                  <Checkbox checked={shown.has(column.key)} onCheckedChange={() => toggle(column.key)} />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t p-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(DEFAULT_VIEW.columns)}>
            {t('dermat_orders.book.reset', 'Back to master sheet')}
          </Button>
          <Button type="button" size="sm" onClick={() => setOpen(false)}>
            {t('dermat_orders.book.done', 'Done')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ActionCell({ order, onOpen }: { order: SheetOrder; onOpen: (orderId: string, stageKey: string) => void }) {
  const t = useT()
  if (order.status === 'cancelled') return <StatePill state="skipped" label={t('dermat_orders.status.cancelled', 'Cancelled')} />
  if (!order.current.length) return <StatePill state="completed" label={t('dermat_orders.book.allDone', 'All stages done')} />
  return (
    <span className="flex flex-col gap-1">
      {order.current.map((entry) => {
        const state = sheetWorkState(order.stages[entry.key])
        return (
          <button
            key={entry.key}
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onOpen(order.id, entry.key)
            }}
            className="group flex items-center justify-between gap-2 rounded-md border bg-card px-2 py-1.5 text-left shadow-xs transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <StatePill state={state} />
                <span className="truncate text-xs font-semibold">{entry.label}</span>
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {[entry.department, entry.responsibleName, entry.days != null ? `${formatQty(entry.days, 1)} d` : null, entry.status === 'on_hold' ? entry.holdParty : null].filter(Boolean).join(' · ')}
              </span>
            </span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />
          </button>
        )
      })}
    </span>
  )
}

function BoardView({ orders, onOpen }: { orders: SheetOrder[]; onOpen: (orderId: string, stageKey: string) => void }) {
  const t = useT()
  const columns = STAGES.filter((def) => def.key !== 'order')
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3">
        {columns.map((def) => {
          const cards = orders.filter((order) => order.current.some((entry) => entry.key === def.key))
          return (
            <section key={def.key} className="flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30">
              <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{def.label}</span>
                  <span className="block text-xs text-muted-foreground">{def.department}</span>
                </span>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold tabular-nums">{cards.length}</span>
              </header>
              <div className="flex flex-col gap-2 p-2">
                {cards.length ? (
                  cards.map((order) => {
                    const stage = order.stages[def.key]
                    const state = sheetWorkState(stage)
                    const current = order.current.find((entry) => entry.key === def.key)
                    return (
                      <button
                        key={order.id}
                        type="button"
                        onClick={() => onOpen(order.id, def.key)}
                        className="space-y-1.5 rounded-md border bg-card p-2.5 text-left shadow-xs transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-semibold">{order.orderNo}</span>
                          <StatePill state={state} />
                        </span>
                        <span className="block truncate text-sm font-medium">{order.customerName}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {order.lines.map((line) => `${line.brandName ?? line.productTitle} × ${formatQty(line.quantity, 0)}`).join(', ')}
                        </span>
                        <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{current?.responsibleName ?? t('dermat_orders.book.unassigned', 'Not assigned')}</span>
                          <span className="tabular-nums">{stage?.days != null ? `${formatQty(stage.days, 1)} d` : ''}</span>
                        </span>
                        {order.late ? (
                          <span className="flex items-center gap-1 text-xs font-semibold text-status-error-text">
                            <CalendarClock className="h-3 w-3" aria-hidden="true" />
                            {t('dermat_orders.book.wasDue', 'was due {date}', { date: formatDate(order.deliveryDate) })}
                          </span>
                        ) : null}
                      </button>
                    )
                  })
                ) : (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">{t('dermat_orders.book.emptyColumn', 'No orders here')}</p>
                )}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

export function OrdersPage() {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams?.get('tab') as StatusTab | null
  const statusTab: StatusTab = tabParam && (STATUS_TABS as readonly string[]).includes(tabParam) ? tabParam : 'open'
  const [stageFilter, setStageFilter] = React.useState<string>('all')
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [view, setView] = React.useState<'table' | 'board'>('table')
  const [visible, setVisible] = React.useState<string[]>(DEFAULT_VIEW.columns)
  const [data, setData] = React.useState<SheetResponse | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [reload, setReload] = React.useState(0)
  const [people, setPeople] = React.useState<Array<{ id: string; name: string }>>([])
  const [working, setWorking] = React.useState<{ order: Order; stageKey: string } | null>(null)
  const runner = useStageAction('dermat-order-book')
  const silent = React.useRef(false)

  React.useEffect(() => setVisible(readColumns()), [])
  React.useEffect(() => {
    apiCall<{ items?: Array<{ id: string; name: string }> }>('/api/dermat_orders/people', undefined, { fallback: { items: [] } }).then((call) => setPeople(call.result?.items ?? []))
  }, [])
  React.useEffect(() => setPage(1), [statusTab, stageFilter, search])

  const changeColumns = (next: string[]) => {
    setVisible(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      return
    }
  }

  const filterParams = React.useCallback(() => {
    const params = new URLSearchParams()
    if (statusTab !== 'all') params.set('status', statusTab)
    if (stageFilter !== 'all') {
      params.set('stage', stageFilter)
      params.set('stageStatus', 'active')
    }
    if (search.trim()) params.set('search', search.trim())
    return params
  }, [statusTab, stageFilter, search])

  React.useEffect(() => {
    let cancelled = false
    const quiet = silent.current
    if (!quiet) setLoading(true)
    const handle = window.setTimeout(async () => {
      const params = filterParams()
      params.set('page', String(page))
      params.set('pageSize', String(PAGE_SIZE))
      const call = await apiCall<SheetResponse>(`/api/dermat_orders/orders/sheet?${params.toString()}`)
      if (cancelled) return
      if (!call.ok || !call.result) flash(t('dermat_orders.list.loadError', 'Failed to load orders'), 'error')
      setData(call.result ?? null)
      setLoading(false)
      silent.current = false
    }, quiet ? 0 : 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [filterParams, page, reload, t])

  const patchOrder = (orderId: string, mutate: (order: SheetOrder) => SheetOrder) =>
    setData((prev) => (prev ? { ...prev, items: prev.items.map((order) => (order.id === orderId ? mutate(order) : order)) } : prev))

  const table = useCellEditor({
    contextId: 'dermat-order-book-cells',
    patchOrder,
    refresh: () => {
      silent.current = true
      setReload((current) => current + 1)
    },
  })

  const renderCell = table.renderCell

  const openStage = async (orderId: string, stageKey: string) => {
    const call = await apiCall<Order>(`/api/dermat_orders/orders?id=${encodeURIComponent(orderId)}`)
    if (!call.ok || !call.result) {
      flash(t('dermat_orders.errors.load', 'Could not load the order.'), 'error')
      return
    }
    setWorking({ order: call.result, stageKey })
  }

  const onAction = async (stage: Stage, request: StageActionRequest): Promise<boolean> => {
    if (!working) return false
    const result = await runner.run(working.order, stage, request)
    if (result.order) {
      setReload((value) => value + 1)
      if (request.action === 'complete' || request.action === 'skip') {
        const opened = result.order.stages.filter((entry) => entry.status === 'open' && working.order.stages.find((before) => before.key === entry.key)?.status === 'waiting')
        if (opened.length === 1) setWorking({ order: result.order, stageKey: opened[0].key })
        else setWorking(null)
      } else setWorking({ order: result.order, stageKey: working.stageKey })
      return true
    }
    if (result.conflict) await openStage(working.order.id, working.stageKey)
    return false
  }

  const columns = visible.map((key) => ALL_COLUMNS.find((column) => column.key === key)).filter((column): column is SheetColumn => Boolean(column))
  const sections: Array<{ name: string; span: number }> = []
  for (const column of columns) {
    const last = sections[sections.length - 1]
    if (last && last.name === column.section) last.span += 1
    else sections.push({ name: column.section, span: 1 })
  }
  const summary = data?.summary
  const orders = data?.items ?? []
  const selectedStage = working ? (working.order.stages.find((entry) => entry.key === working.stageKey) ?? null) : null

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5 pb-16">
          <header className="flex flex-col gap-4 border-b pb-4 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-6 w-6 text-primary" aria-hidden="true" />
                <h1 className="text-2xl font-bold tracking-tight">{t('dermat_orders.book.title', 'Order book & production master sheet')}</h1>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary tabular-nums">{data?.total ?? '–'}</span>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t('dermat_orders.book.lede', 'Every order, product by product, and where it is now. Edit table changes cells in place; the stage button on the right opens that stage’s form.')}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
              <SegmentedControl value={view} onValueChange={(value) => setView(value as typeof view)} aria-label={t('dermat_orders.book.viewMode', 'View')}>
                <SegmentedControlItem value="table">
                  <List className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {t('dermat_orders.book.table', 'Table')}
                </SegmentedControlItem>
                <SegmentedControlItem value="board">
                  <LayoutGrid className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {t('dermat_orders.book.board', 'Board')}
                </SegmentedControlItem>
              </SegmentedControl>
              {view === 'table' ? <ColumnsMenu visible={visible} onChange={changeColumns} /> : null}
              {view === 'table' ? (
                <EditTableBar editing={table.editing} dirtyCount={table.dirtyCount} saving={table.saving} onEdit={table.startEditing} onCancel={table.cancelEditing} onSave={() => void table.saveAll()} />
              ) : null}
              <ExportButton onExport={() => openServerExport(`/api/dermat_orders/orders/export?${filterParams().toString()}`)} />
              <Button asChild>
                <Link href="/backend/orders/new">
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('dermat_orders.book.new', 'Book new order')}
                </Link>
              </Button>
            </div>
          </header>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: t('dermat_orders.book.kpiValue', 'Booked value'), value: summary ? rupees(summary.value) : '–', hint: t('dermat_orders.book.kpiValueHint', '{count} orders', { count: summary?.orders ?? 0 }), icon: <IndianRupee className="h-4 w-4" aria-hidden="true" />, tone: 'bg-primary/10 text-primary' },
              { label: t('dermat_orders.book.kpiReceived', 'Received'), value: summary ? rupees(summary.received) : '–', hint: summary && summary.value > 0 ? t('dermat_orders.book.kpiReceivedHint', '{pct}% collected', { pct: Math.round((summary.received / summary.value) * 100) }) : ' ', icon: <Wallet className="h-4 w-4" aria-hidden="true" />, tone: 'bg-status-success-bg text-status-success-icon' },
              { label: t('dermat_orders.book.kpiDue', 'Balance due'), value: summary ? rupees(Math.max(0, summary.due)) : '–', hint: t('dermat_orders.book.kpiDueHint', 'Before dispatch or on invoice'), icon: <IndianRupee className="h-4 w-4" aria-hidden="true" />, tone: 'bg-status-warning-bg text-status-warning-icon' },
              { label: t('dermat_orders.book.kpiLate', 'Late / on hold'), value: summary ? `${summary.late} / ${summary.onHold}` : '–', hint: t('dermat_orders.book.kpiLateHint', 'Past delivery date / waiting on someone'), icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />, tone: summary && (summary.late || summary.onHold) ? 'bg-status-error-bg text-status-error-icon' : 'bg-muted text-muted-foreground' },
            ].map((tile) => (
              <div key={tile.label} className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-xs">
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tile.tone)}>{tile.icon}</span>
                <span className="min-w-0">
                  <span className="block text-xl font-bold leading-tight tabular-nums">{tile.value}</span>
                  <span className="block text-sm font-medium">{tile.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">{tile.hint}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-lg border bg-card p-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-60 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="order-book-search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 pl-9" placeholder={t('dermat_orders.list.search', 'Search order no., customer, product ID or batch no.')} />
              </div>
              <Select value={statusTab} onValueChange={(value) => router.replace(`/backend/orders?tab=${value}`)}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{t('dermat_orders.list.tab.open', 'Open orders')}</SelectItem>
                  <SelectItem value="on_hold">{t('dermat_orders.list.tab.hold', 'On hold')}</SelectItem>
                  <SelectItem value="completed">{t('dermat_orders.list.tab.completed', 'Completed')}</SelectItem>
                  <SelectItem value="cancelled">{t('dermat_orders.list.tab.cancelled', 'Cancelled')}</SelectItem>
                  <SelectItem value="all">{t('dermat_orders.list.tab.all', 'All orders')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-1.5 border-t pt-3">
              <Button type="button" size="sm" variant={stageFilter === 'all' ? 'default' : 'outline'} className="h-7 px-2.5 text-xs" onClick={() => setStageFilter('all')}>
                {t('dermat_orders.book.allStages', 'All stages')}
              </Button>
              {STAGES.filter((def) => def.key !== 'order').map((def) => (
                <Button key={def.key} type="button" size="sm" variant={stageFilter === def.key ? 'default' : 'outline'} className="h-7 px-2.5 text-xs" onClick={() => setStageFilter(def.key)}>
                  {def.label}
                  <span className="ml-1.5 tabular-nums opacity-70">{summary?.stageCounts[def.key] ?? 0}</span>
                </Button>
              ))}
            </div>
          </div>

          {loading && !data ? (
            <div className="flex justify-center py-20">
              <Spinner />
            </div>
          ) : !orders.length ? (
            <EmptyState
              className="py-20"
              icon={<FileSpreadsheet className="h-5 w-5" aria-hidden="true" />}
              title={t('dermat_orders.book.empty', 'No orders here')}
              description={t('dermat_orders.book.emptyHint', 'Change the filters, or book a new order.')}
            />
          ) : view === 'board' ? (
            <BoardView orders={orders} onOpen={openStage} />
          ) : (
            <div className={cn('overflow-hidden rounded-lg border bg-card shadow-xs', loading && 'opacity-60')}>
              <div className="max-h-screen overflow-auto">
                <table className="w-full border-collapse whitespace-nowrap text-left text-xs">
                  <thead className="sticky top-0 z-20 bg-muted">
                    <tr className="border-b">
                      <th className="sticky left-0 z-30 bg-muted px-3 py-1.5" />
                      <th className="bg-muted px-3 py-1.5" />
                      {sections.map((section, index) => (
                        <th key={`${section.name}-${index}`} colSpan={section.span} className="border-l px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
                          {section.name}
                        </th>
                      ))}
                      <th className="sticky right-0 z-30 border-l bg-muted px-3 py-1.5" />
                    </tr>
                    <tr className="border-b text-muted-foreground">
                      <th className="sticky left-0 z-30 bg-muted px-3 py-2 font-semibold">{t('dermat_orders.book.order', 'Order')}</th>
                      <th className="bg-muted px-3 py-2 font-semibold text-foreground">{t('dermat_orders.book.brand', 'Brand / product name')}</th>
                      {columns.map((column) => (
                        <th key={column.key} className={cn('px-3 py-2 font-semibold', column.align === 'right' && 'text-right', column.align === 'center' && 'text-center')}>
                          {column.label}
                        </th>
                      ))}
                      <th className="sticky right-0 z-30 border-l bg-muted px-3 py-2 font-semibold text-foreground">{t('dermat_orders.book.action', 'Now at · action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const lines = order.lines.length ? order.lines : [null]
                      return lines.map((line, index) => {
                        const span = index === 0 ? lines.length : 0
                        return (
                          <tr
                            key={`${order.id}-${line?.id ?? 'none'}`}
                            className={cn('align-top hover:bg-muted/30', index === lines.length - 1 && 'border-b', order.status === 'cancelled' && 'opacity-60')}
                          >
                            {span ? (
                              <td rowSpan={span} className="sticky left-0 z-10 border-r bg-card px-3 py-2">
                                <Link href={`/backend/orders/${order.id}`} className="block font-mono font-semibold text-primary hover:underline">
                                  {order.orderNo}
                                </Link>
                                <span className="block text-muted-foreground">{formatDate(order.orderDate)}</span>
                                {order.late ? <span className="mt-0.5 block font-semibold text-status-error-text">{t('dermat_orders.book.late', 'Late')}</span> : null}
                              </td>
                            ) : null}
                            <td className="px-3 py-2">
                              {renderCell(BRAND_COLUMN, { order, line })}
                              <span className="block max-w-72 truncate text-muted-foreground" title={line?.productTitle}>
                                {line?.productCode ? `${line.productCode} · ` : ''}
                                {line?.productTitle ?? '—'}
                              </span>
                            </td>
                            {columns.map((column) =>
                              column.scope === 'order' ? (
                                span ? (
                                  <td key={column.key} rowSpan={span} className={cn('px-3 py-2', column.align === 'right' && 'text-right tabular-nums', column.align === 'center' && 'text-center')}>
                                    {renderCell(column, { order, line })}
                                  </td>
                                ) : null
                              ) : (
                                <td key={column.key} className={cn('px-3 py-2', column.align === 'right' && 'text-right tabular-nums', column.align === 'center' && 'text-center')}>
                                  {renderCell(column, { order, line })}
                                </td>
                              ),
                            )}
                            {span ? (
                              <td rowSpan={span} className="sticky right-0 z-10 min-w-64 border-l bg-card px-2 py-2" onClick={(event) => event.stopPropagation()}>
                                <ActionCell order={order} onOpen={openStage} />
                              </td>
                            ) : null}
                          </tr>
                        )
                      })
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-3">
                  {(['pending', 'in_progress', 'on_hold', 'completed'] as const).map((state) => (
                    <StatePill key={state} state={state} label={WORK_STATE_LABEL[state]} />
                  ))}
                  <span className="hidden items-center gap-1 sm:flex">
                    <PauseCircle className="h-3 w-3" aria-hidden="true" />
                    {t('dermat_orders.book.legend', 'Stage colours in "All stages"')}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{t('dermat_orders.book.pageOf', 'Page {page} of {pages}', { page, pages: data?.totalPages ?? 1 })}</span>
                  <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label={t('dermat_orders.book.prev', 'Previous page')}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)} aria-label={t('dermat_orders.book.next', 'Next page')}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </span>
              </div>
            </div>
          )}
        </div>
        {working ? (
          <StageSheet
            order={working.order}
            stage={selectedStage}
            people={people}
            canWork
            busy={runner.busy}
            shortCount={null}
            onClose={() => setWorking(null)}
            onAction={onAction}
          />
        ) : null}
      </PageBody>
    </Page>
  )
}

export default OrdersPage
