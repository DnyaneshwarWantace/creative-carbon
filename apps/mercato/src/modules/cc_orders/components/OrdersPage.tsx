"use client"

import * as React from 'react'
import { ViewsButton } from '../../cc_products/components/ViewsPanel'
import { useGranted } from '../../cc_departments/components/useGranted'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertTriangle, ArrowRight, CalendarClock, ChevronLeft, ChevronRight, ClipboardList, Clock, Eye, RotateCcw, Columns3, FileSpreadsheet, IndianRupee, LayoutGrid, List, PauseCircle, Plus, Search, Wallet } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Popover, PopoverContent, PopoverTrigger } from '@open-mercato/ui/primitives/popover'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { EditTableBar } from '../../cc_products/components/EditTableBar'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ExportButton } from '../../cc_products/components/ExportButton'
import { openServerExport } from '../../cc_products/lib/csvExport'
import { STAGES, WORK_STATE_LABEL, reopenBlock, reopenLeftText, stageList, stageWorkFeature } from '../lib/stages'
import { formatDate, formatQty } from './format'
import { ALL_COLUMNS, DEFAULT_VIEW, SHEET_VIEWS, BRAND_COLUMN, StatePill, sheetWorkState, type SheetColumn, type SheetOrder } from './orderBookColumns'
import { StageSheet, type StageActionRequest } from './StageSheet'
import { useStageAction } from './useStageAction'
import { useCellEditor } from './useCellEditor'
import type { Order, Stage } from './types'

const PAGE_SIZE = 50
const STORAGE_KEY = 'cc.orderBook.columns.v1'
const STATUS_TABS = ['open', 'on_hold', 'completed', 'cancelled', 'all'] as const
type StatusTab = (typeof STATUS_TABS)[number]

type Summary = { orders: number; value: number | null; received: number | null; due: number | null; late: number; onHold: number; stageCounts: Record<string, number> }
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


function ReopenClock({ order, onOpen }: { order: SheetOrder; onOpen: (orderId: string, stageKey: string) => void }) {
  const t = useT()
  const granted = useGranted()
  const now = Date.now()
  const choices = stageList()
    .filter((def) => def.key !== 'order')
    .map((def) => ({ def, stage: order.stages[def.key] }))
    .filter(({ def, stage }) => stage && (stage.status === 'done' || stage.status === 'skipped') && stage.reopen && !reopenBlock(stage.reopen, now) && granted.has(stageWorkFeature(def.key)))
  if (!choices.length) return null
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(event) => event.stopPropagation()}
          className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          title={t('cc_orders.book.reopenTitle', 'Reopen a stage sent on by mistake')}
          aria-label={t('cc_orders.book.reopenTitle', 'Reopen a stage sent on by mistake')}
        >
          <Clock className="h-4 w-4" aria-hidden="true" />
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-overline font-semibold text-primary-foreground">{choices.length}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2" onClick={(event) => event.stopPropagation()}>
        <p className="px-2 pb-2 text-xs text-muted-foreground">{t('cc_orders.book.reopenHint', 'Sent on by mistake? These can still be reopened. A reason is asked.')}</p>
        <ul className="flex flex-col gap-1">
          {choices.map(({ def, stage }) => (
            <li key={def.key}>
              <button
                type="button"
                onClick={() => onOpen(order.id, def.key)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <RotateCcw className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{def.label}</span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-status-warning-text">{stage?.reopen ? reopenLeftText(stage.reopen, now) : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

function ActionCell({ order, onOpen, opening }: { order: SheetOrder; onOpen: (orderId: string, stageKey: string) => void; opening: string | null }) {
  const t = useT()
  const view = (
    <Link
      href={`/backend/orders/${order.id}`}
      onClick={(event) => event.stopPropagation()}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={t('cc_orders.book.viewOrder', 'Open the order')}
      aria-label={t('cc_orders.book.viewOrder', 'Open the order')}
    >
      <Eye className="h-4 w-4" aria-hidden="true" />
    </Link>
  )
  if (order.status === 'cancelled') return <span className="flex items-center justify-between gap-1"><StatePill state="skipped" label={t('cc_orders.status.cancelled', 'Cancelled')} />{view}</span>
  if (!order.current.length) return <span className="flex items-center justify-between gap-1"><StatePill state="completed" label={t('cc_orders.book.allDone', 'All stages done')} /><span className="flex items-center gap-1"><ReopenClock order={order} onOpen={onOpen} />{view}</span></span>
  return (
    <span className="flex items-center gap-1">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        {order.current.map((entry) => {
          const state = sheetWorkState(order.stages[entry.key])
          const detail = [entry.responsibleName ?? entry.department, entry.days != null ? `${formatQty(entry.days, 1)} d` : null, entry.status === 'on_hold' ? entry.holdParty : null].filter(Boolean).join(' · ')
          const busy = opening === `${order.id}:${entry.key}`
          return (
            <button
              key={entry.key}
              type="button"
              disabled={busy}
              title={[entry.label, entry.department, entry.responsibleName, detail].filter(Boolean).join(' · ')}
              onClick={(event) => {
                event.stopPropagation()
                onOpen(order.id, entry.key)
              }}
              className={cn('group flex h-7 min-w-0 items-center gap-1.5 rounded-md border bg-card pl-1 pr-1.5 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', busy && 'border-primary bg-primary/5')}
            >
              <span className={cn('h-5 w-1 shrink-0 rounded-full', STATE_BAR[state])} aria-hidden="true" />
              <span className="truncate text-xs font-semibold">{entry.label}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{detail}</span>
              {busy ? <Spinner className="h-3.5 w-3.5 shrink-0" /> : <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden="true" />}
            </button>
          )
        })}
      </span>
      <ReopenClock order={order} onOpen={onOpen} />
      {view}
    </span>
  )
}

const SECTION_LINE = 'border-l-2 border-l-muted-foreground/40'
const PIN_LEFT_LINE = 'border-r-2 border-r-muted-foreground/70'
const PIN_RIGHT_LINE = 'border-l-2 border-l-muted-foreground/70'

const STATE_BAR: Record<string, string> = {
  coming: 'bg-border',
  pending: 'bg-status-warning-icon',
  in_progress: 'bg-status-info-icon',
  on_hold: 'bg-status-error-icon',
  completed: 'bg-status-success-icon',
  skipped: 'bg-muted-foreground',
}

function BoardView({ orders, onOpen, opening }: { orders: SheetOrder[]; onOpen: (orderId: string, stageKey: string) => void; opening: string | null }) {
  const t = useT()
  const columns = STAGES.filter((def) => def.key !== 'order')
  return (
    <div className="overflow-x-auto pb-2" data-drag-scroll>
      <div className="flex gap-3">
        {columns.map((def) => {
          const cards = orders.filter((order) => order.current.some((entry) => entry.key === def.key))
          return (
            <section key={def.key} className="flex w-64 shrink-0 flex-col rounded-lg border bg-muted/30">
              <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{def.label}</span>
                  <span className="block text-xs text-muted-foreground">{def.department}</span>
                </span>
                <span className="rounded-full bg-background px-2 py-0.5 text-xs font-semibold tabular-nums">{cards.length}</span>
              </header>
              <div className="flex flex-col gap-1.5 p-1.5">
                {cards.length ? (
                  cards.map((order) => {
                    const stage = order.stages[def.key]
                    const state = sheetWorkState(stage)
                    const current = order.current.find((entry) => entry.key === def.key)
                    return (
                      <button
                        key={order.id}
                        type="button"
                        disabled={opening === `${order.id}:${def.key}`}
                        title={[WORK_STATE_LABEL[state], current?.responsibleName, order.late ? t('cc_orders.book.wasDue', 'was due {date}', { date: formatDate(order.deliveryDate) }) : null].filter(Boolean).join(' · ')}
                        onClick={() => onOpen(order.id, def.key)}
                        className="flex gap-2 rounded-md border bg-card py-1.5 pl-1.5 pr-2 text-left text-xs transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className={cn('w-1 shrink-0 self-stretch rounded-full', STATE_BAR[state])} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="font-mono font-semibold">{order.orderNo}</span>
                            <span className="flex items-center gap-1 tabular-nums text-muted-foreground">
                              {order.late ? <CalendarClock className="h-3 w-3 text-status-error-icon" aria-hidden="true" /> : null}
                              {opening === `${order.id}:${def.key}` ? <Spinner className="h-3 w-3" /> : stage?.days != null ? `${formatQty(stage.days, 1)} d` : ''}
                            </span>
                          </span>
                          <span className="block truncate font-medium">{order.customerName}</span>
                          <span className="block truncate text-muted-foreground">
                            {[order.lines.map((line) => `${line.brandName ?? line.productTitle} × ${formatQty(line.quantity, 0)}`).join(', '), current?.responsibleName].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </button>
                    )
                  })
                ) : (
                  <p className="px-1 py-6 text-center text-xs text-muted-foreground">{t('cc_orders.book.emptyColumn', 'No orders here')}</p>
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
  const granted = useGranted()
  const canMoney = granted.has('cc_orders.money')
  const shownColumns = React.useMemo(() => ALL_COLUMNS.filter((column) => canMoney || !column.money), [canMoney])
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
  const runner = useStageAction('cc-order-book')
  const silent = React.useRef(false)

  React.useEffect(() => setVisible(readColumns()), [])
  React.useEffect(() => {
    apiCall<{ items?: Array<{ id: string; name: string }> }>('/api/cc_orders/people', undefined, { fallback: { items: [] } }).then((call) => setPeople(call.result?.items ?? []))
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
      const call = await apiCall<SheetResponse>(`/api/cc_orders/orders/sheet?${params.toString()}`)
      if (cancelled) return
      if (!call.ok || !call.result) flash(t('cc_orders.list.loadError', 'Failed to load orders'), 'error')
      setData(call.ok ? (call.ok ? (call.result ?? null) : null) : null)
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
    contextId: 'cc-order-book-cells',
    patchOrder,
    refresh: () => {
      silent.current = true
      setReload((current) => current + 1)
    },
  })

  const renderCell = table.renderCell

  const [opening, setOpening] = React.useState<string | null>(null)
  const openStage = async (orderId: string, stageKey: string) => {
    setOpening(`${orderId}:${stageKey}`)
    const call = await apiCall<Order>(`/api/cc_orders/orders?id=${encodeURIComponent(orderId)}`)
    setOpening(null)
    if (!call.ok || !call.result) {
      flash(t('cc_orders.errors.load', 'Could not load the order.'), 'error')
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

  const columns = visible.map((key) => shownColumns.find((column) => column.key === key)).filter((column): column is SheetColumn => Boolean(column))
  const sections: Array<{ name: string; span: number }> = []
  for (const column of columns) {
    const last = sections[sections.length - 1]
    if (last && last.name === column.section) last.span += 1
    else sections.push({ name: column.section, span: 1 })
  }
  const sectionStarts = new Set(columns.filter((column, index) => index === 0 || columns[index - 1].section !== column.section).map((column) => column.key))
  const columnLine = (key: string) => (sectionStarts.has(key) ? SECTION_LINE : 'border-l')
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
                <h1 className="text-2xl font-bold tracking-tight">{t('cc_orders.book.title', 'Order book & production master sheet')}</h1>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-bold text-primary tabular-nums">{data?.total ?? '–'}</span>
              </div>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t('cc_orders.book.lede', 'Every order, product by product, and where it is now. Edit table changes cells in place; the stage button on the right opens that stage’s form.')}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 xl:justify-end">
              <SegmentedControl className="h-9" value={view} onValueChange={(value) => setView(value as typeof view)} aria-label={t('cc_orders.book.viewMode', 'View')}>
                <SegmentedControlItem value="table" className="h-8">
                  <List className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {t('cc_orders.book.table', 'Table')}
                </SegmentedControlItem>
                <SegmentedControlItem value="board" className="h-8">
                  <LayoutGrid className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {t('cc_orders.book.board', 'Board')}
                </SegmentedControlItem>
              </SegmentedControl>
              {view === 'table' ? (
                <ViewsButton
                  tableId="cc_orders.order_book"
                  columns={shownColumns.map((column) => ({ key: column.key, label: column.label, group: column.section }))}
                  visible={visible}
                  onChange={changeColumns}
                  builtIn={SHEET_VIEWS.map((entry) => ({ id: entry.key, name: entry.label, columns: entry.columns }))}
                />
              ) : null}
              {view === 'table' ? (
                <EditTableBar editing={table.editing} dirtyCount={table.dirtyCount} saving={table.saving} onEdit={table.startEditing} onCancel={table.cancelEditing} onSave={() => void table.saveAll()} />
              ) : null}
              <ExportButton onExport={() => openServerExport(`/api/cc_orders/orders/export?${filterParams().toString()}`)} />
              {granted.has('cc_orders.manage') ? (
              <Button asChild>
                <Link href="/backend/orders/new">
                  <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_orders.book.new', 'Book new order')}
                </Link>
              </Button>
              ) : null}
            </div>
          </header>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { money: false, only: 'noMoney', label: t('cc_orders.book.kpiOrders', 'Orders'), value: summary ? String(summary.orders) : '–', hint: t('cc_orders.book.kpiOrdersHint', 'In this view'), icon: <ClipboardList className="h-4 w-4" aria-hidden="true" />, tone: 'bg-primary/10 text-primary' },
              { money: true, label: t('cc_orders.book.kpiValue', 'Booked value'), value: summary?.value != null ? rupees(summary.value) : '–', hint: t('cc_orders.book.kpiValueHint', '{count} orders', { count: summary?.orders ?? 0 }), icon: <IndianRupee className="h-4 w-4" aria-hidden="true" />, tone: 'bg-primary/10 text-primary' },
              { money: true, label: t('cc_orders.book.kpiReceived', 'Received'), value: summary?.received != null ? rupees(summary.received) : '–', hint: summary?.value && summary.received != null ? t('cc_orders.book.kpiReceivedHint', '{pct}% collected', { pct: Math.round((summary.received / summary.value) * 100) }) : ' ', icon: <Wallet className="h-4 w-4" aria-hidden="true" />, tone: 'bg-status-success-bg text-status-success-icon' },
              { money: true, label: t('cc_orders.book.kpiDue', 'Balance due'), value: summary?.due != null ? rupees(Math.max(0, summary.due)) : '–', hint: t('cc_orders.book.kpiDueHint', 'Before dispatch or on invoice'), icon: <IndianRupee className="h-4 w-4" aria-hidden="true" />, tone: 'bg-status-warning-bg text-status-warning-icon' },
              { label: t('cc_orders.book.kpiLate', 'Late / on hold'), value: summary ? `${summary.late} / ${summary.onHold}` : '–', hint: t('cc_orders.book.kpiLateHint', 'Past delivery date / waiting on someone'), icon: <AlertTriangle className="h-4 w-4" aria-hidden="true" />, tone: summary && (summary.late || summary.onHold) ? 'bg-status-error-bg text-status-error-icon' : 'bg-muted text-muted-foreground' },
            ]
              .filter((tile) => ('only' in tile ? !canMoney : !('money' in tile && tile.money) || canMoney))
              .map((tile) => (
              <div key={tile.label} className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-xs">
                <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tile.tone)}>{tile.icon}</span>
                <span className="min-w-0">
                  <span className="block text-xl font-bold leading-tight tabular-nums">{tile.value}</span>
                  <span className="block text-sm font-medium">{tile.label}</span>
                  <span className="block text-xs leading-snug text-muted-foreground">{tile.hint}</span>
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-3 rounded-lg border bg-card p-3 shadow-xs">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:max-w-md sm:flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input id="order-book-search" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 pl-9" placeholder={t('cc_orders.list.searchOrders', 'Search these orders: no., customer, item or batch')} aria-label={t('cc_orders.list.searchOrdersLabel', 'Search orders')} />
              </div>
              <Select value={statusTab} onValueChange={(value) => router.replace(`/backend/orders?tab=${value}`)}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">{t('cc_orders.list.tab.open', 'Open orders')}</SelectItem>
                  <SelectItem value="on_hold">{t('cc_orders.list.tab.hold', 'On hold')}</SelectItem>
                  <SelectItem value="completed">{t('cc_orders.list.tab.completed', 'Completed')}</SelectItem>
                  <SelectItem value="cancelled">{t('cc_orders.list.tab.cancelled', 'Cancelled')}</SelectItem>
                  <SelectItem value="all">{t('cc_orders.list.tab.all', 'All orders')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-1.5 border-t pt-3">
              <Button type="button" size="sm" variant={stageFilter === 'all' ? 'default' : 'outline'} className="h-8 px-3 text-xs" aria-pressed={stageFilter === 'all'} onClick={() => setStageFilter('all')}>
                {t('cc_orders.book.allStages', 'All stages')}
              </Button>
              {STAGES.filter((def) => def.key !== 'order').map((def) => (
                <Button key={def.key} type="button" size="sm" variant={stageFilter === def.key ? 'default' : 'outline'} className="h-8 gap-1.5 px-3 text-xs" aria-pressed={stageFilter === def.key} onClick={() => setStageFilter(def.key)}>
                  {def.label}
                  <span className={cn('min-w-5 rounded-full px-1.5 py-0.5 text-center text-overline font-semibold tabular-nums', stageFilter === def.key ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground')}>{summary?.stageCounts[def.key] ?? 0}</span>
                </Button>
              ))}
            </div>
          </div>

          {loading && !data ? (
            <div className="flex justify-center py-20">
              <Spinner />
            </div>
          ) : !orders.length ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-16 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileSpreadsheet className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="space-y-1">
                <p className="text-base font-semibold">{t('cc_orders.book.empty', 'No orders here')}</p>
                <p className="max-w-sm text-sm text-muted-foreground">{search.trim() || stageFilter !== 'all' || statusTab !== 'open' ? t('cc_orders.book.emptyFiltered', 'Nothing matches these filters. Clear them to see every order.') : t('cc_orders.book.emptyHint', 'Orders booked from the CRM or here appear in this list.')}</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {search.trim() || stageFilter !== 'all' || statusTab !== 'open' ? (
                  <Button type="button" variant="outline" onClick={() => { setSearch(''); setStageFilter('all'); router.replace('/backend/orders') }}>
                    {t('cc_orders.book.clearFilters', 'Clear filters')}
                  </Button>
                ) : null}
                {granted.has('cc_orders.manage') ? (
                  <Button asChild>
                    <Link href="/backend/orders/new">
                      <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('cc_orders.book.new', 'Book new order')}
                    </Link>
                  </Button>
                ) : null}
              </div>
            </div>
          ) : view === 'board' ? (
            <BoardView orders={orders} onOpen={openStage} opening={opening} />
          ) : (
            <>
            <div className={cn('space-y-2 md:hidden', loading && 'opacity-60')}>
              {orders.map((order) => {
                const now = order.current[0]
                const pct = order.stageCount ? Math.round((order.doneCount / order.stageCount) * 100) : 0
                const kg = order.lines.reduce((sum, line) => sum + line.quantity, 0)
                return (
                  <Link key={order.id} href={`/backend/orders/${order.id}`} className="block rounded-xl border bg-card p-3.5 shadow-xs active:bg-muted/60">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-xs text-muted-foreground">{order.orderNo}</p>
                        <p className="truncate text-sm font-semibold">{order.customerName}</p>
                      </div>
                      {order.late ? (
                        <span className="shrink-0 rounded-full bg-status-error-bg px-2 py-0.5 text-xs font-medium text-status-error-text">{t('cc_orders.book.late', 'Late')}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{order.lines.map((line) => line.productTitle).join(', ')}</p>
                    {now ? (
                      <div className="mt-2.5 flex items-center gap-2 rounded-lg bg-muted/50 px-2.5 py-2">
                        <span className={cn('h-2 w-2 shrink-0 rounded-full', now.status === 'on_hold' ? 'bg-status-error-icon' : 'bg-status-warning-icon')} aria-hidden="true" />
                        <span className="min-w-0 flex-1 truncate text-xs">
                          <span className="font-semibold">{now.label}</span>
                          <span className="text-muted-foreground"> · {now.department}{now.days != null ? ` · ${now.days} d` : ''}</span>
                        </span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </div>
                    ) : null}
                    <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="tabular-nums">
                        {order.doneCount}/{order.stageCount} {t('cc_orders.book.stagesDone', 'stages')} · {formatQty(kg, 0)} kg
                      </span>
                      <span className="tabular-nums">
                        {canMoney ? rupees(order.total) : null}
                        {order.deliveryDate ? `${canMoney ? ' · ' : ''}${formatDate(order.deliveryDate)}` : ''}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
            <div className={cn('isolate hidden overflow-hidden rounded-lg border bg-card shadow-xs transition-opacity md:block', loading && 'opacity-60')}>
              <div className="overflow-auto" style={{ maxHeight: 'calc(100dvh - 9rem)' }}>
                <table data-own-grid className="w-full border-separate border-spacing-0 whitespace-nowrap text-left text-xs">
                  <thead className="sticky top-0 z-20 bg-muted">
                    <tr>
                      <th className={cn('sticky left-0 z-30 border-b bg-muted px-3 py-1.5', PIN_LEFT_LINE)} />
                      <th className="border-b bg-muted px-3 py-1.5" />
                      {sections.map((section, index) => (
                        <th key={`${section.name}-${index}`} colSpan={section.span} className={cn('border-b bg-muted px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-primary', SECTION_LINE)}>
                          {section.name}
                        </th>
                      ))}
                      <th className={cn('sticky right-0 z-30 border-b bg-muted px-3 py-1.5', PIN_RIGHT_LINE)} />
                    </tr>
                    <tr className="text-muted-foreground">
                      <th className={cn('sticky left-0 z-30 border-b bg-muted px-3 py-2 font-semibold', PIN_LEFT_LINE)}>{t('cc_orders.book.order', 'Order')}</th>
                      <th className="border-b bg-muted px-3 py-2 font-semibold text-foreground">{t('cc_orders.book.item', 'Item')}</th>
                      {columns.map((column) => (
                        <th key={column.key} className={cn('border-b bg-muted px-3 py-2 font-semibold', columnLine(column.key), column.align === 'right' && 'text-right', column.align === 'center' && 'text-center')}>
                          {column.label}
                        </th>
                      ))}
                      <th className={cn('sticky right-0 z-30 border-b bg-muted px-3 py-2 font-semibold text-foreground', PIN_RIGHT_LINE)}>{t('cc_orders.book.action', 'Now at · action')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => {
                      const lines = order.lines.length ? order.lines : [null]
                      return lines.map((line, index) => {
                        const span = index === 0 ? lines.length : 0
                        const lineBottom = index === lines.length - 1 && 'border-b'
                        return (
                          <tr
                            key={`${order.id}-${line?.id ?? 'none'}`}
                            className={cn('group/row align-middle hover:bg-muted/30', order.status === 'cancelled' && 'opacity-60')}
                          >
                            {span ? (
                              <td rowSpan={span} className={cn('sticky left-0 z-10 border-b bg-card px-3 py-1.5 group-hover/row:bg-muted', PIN_LEFT_LINE)} title={formatDate(order.orderDate)}>
                                <span className="flex items-center gap-1.5">
                                  <Link href={`/backend/orders/${order.id}`} className="font-mono font-semibold text-primary hover:underline">
                                    {order.orderNo}
                                  </Link>
                                  {order.late ? <span className="rounded-sm bg-status-error-bg px-1 font-semibold text-status-error-text">{t('cc_orders.book.late', 'Late')}</span> : null}
                                </span>
                              </td>
                            ) : null}
                            <td className={cn('px-3 py-1.5', lineBottom)}>
                              <span className="flex max-w-96 items-center gap-1.5" title={[line?.productCode, line?.productTitle].filter(Boolean).join(' · ')}>
                                <span className="min-w-0 max-w-56 shrink">{renderCell(BRAND_COLUMN, { order, line })}</span>
                                <span className="truncate text-muted-foreground">{line?.productCode ?? line?.productTitle ?? '—'}</span>
                              </span>
                            </td>
                            {columns.map((column) =>
                              column.scope === 'order' ? (
                                span ? (
                                  <td key={column.key} rowSpan={span} className={cn('border-b px-3 py-1.5', columnLine(column.key), column.align === 'right' && 'text-right tabular-nums', column.align === 'center' && 'text-center')}>
                                    {renderCell(column, { order, line })}
                                  </td>
                                ) : null
                              ) : (
                                <td key={column.key} className={cn('px-3 py-1.5', columnLine(column.key), lineBottom, column.align === 'right' && 'text-right tabular-nums', column.align === 'center' && 'text-center')}>
                                  {renderCell(column, { order, line })}
                                </td>
                              ),
                            )}
                            {span ? (
                              <td rowSpan={span} className={cn('sticky right-0 z-10 w-80 min-w-72 max-w-80 border-b bg-card px-2 py-1 group-hover/row:bg-muted', PIN_RIGHT_LINE)} onClick={(event) => event.stopPropagation()}>
                                <ActionCell order={order} onOpen={openStage} opening={opening} />
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
                    {t('cc_orders.book.legend', 'Stage colours in "All stages"')}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tabular-nums">{t('cc_orders.book.pageOf', 'Page {page} of {pages}', { page, pages: data?.totalPages ?? 1 })}</span>
                  <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} aria-label={t('cc_orders.book.prev', 'Previous page')}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page >= (data?.totalPages ?? 1)} onClick={() => setPage((value) => value + 1)} aria-label={t('cc_orders.book.next', 'Next page')}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </span>
              </div>
            </div>
            </>
          )}
        </div>
        {working ? (
          <StageSheet
            order={working.order}
            stage={selectedStage}
            people={people}
            canWork
            busy={runner.busy}
            onClose={() => setWorking(null)}
            onPickStage={(stageKey) => setWorking({ order: working.order, stageKey })}
            onAction={onAction}
          />
        ) : null}
      </PageBody>
    </Page>
  )
}

export default OrdersPage
