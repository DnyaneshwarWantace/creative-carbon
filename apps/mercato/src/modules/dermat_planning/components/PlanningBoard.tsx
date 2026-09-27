"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarClock,
  ChevronDown,
  ClipboardCheck,
  Download,
  FlaskConical,
  Layers,
  Lock,
  PackageSearch,
  Plus,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  X,
} from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { PLANNING_STATUS, ROW_STATUS, age, daysUntil, qty, shortDate, type CalcRow, type PlanItem, type PlanningOrder, type SavedPlan } from './shared'
import { ExportButton } from '../../dermat_products/components/ExportButton'
import { downloadCsv } from '../../dermat_products/lib/csvExport'
import { SendPlanButton } from './SendPlanButton'

type Selected = Record<string, { orderId: string; productId: string; quantity: string }>
type Extra = { key: string; productId: string; title: string; unit: string | null; quantity: string }
type SearchItem = { id: string; title: string; code: string | null; kind: string; unit: string | null }
type Filter = 'all' | 'short' | 'open' | 'rm' | 'pm'
type MoveState = { productId: string; title: string; unit: string | null; fromOrderId: string; toOrderId: string; quantity: string; note: string }

export function PlanningBoard() {
  const t = useT()
  const params = useSearchParams()
  const router = useRouter()
  const { runMutation } = useGuardedMutation({ contextId: 'dermat-planning-board' })
  const [orders, setOrders] = React.useState<PlanningOrder[] | null>(null)
  const [scope, setScope] = React.useState<'planning' | 'all'>('planning')
  const [orderSearch, setOrderSearch] = React.useState('')
  const [selected, setSelected] = React.useState<Selected>({})
  const [extras, setExtras] = React.useState<Extra[]>([])
  const [bomSearch, setBomSearch] = React.useState('')
  const [bomOptions, setBomOptions] = React.useState<SearchItem[]>([])
  const [rows, setRows] = React.useState<CalcRow[] | null>(null)
  const [missing, setMissing] = React.useState<string[]>([])
  const [calculating, setCalculating] = React.useState(false)
  const [filter, setFilter] = React.useState<Filter>('all')
  const [materialSearch, setMaterialSearch] = React.useState('')
  const [expanded, setExpanded] = React.useState<string | null>(null)
  const [drafts, setDrafts] = React.useState<Record<string, string>>({})
  const [busy, setBusy] = React.useState(false)
  const [move, setMove] = React.useState<MoveState | null>(null)
  const [plans, setPlans] = React.useState<SavedPlan[]>([])
  const [plan, setPlan] = React.useState<SavedPlan | null>(null)
  const [saving, setSaving] = React.useState<{ name: string; notes: string; asNew: boolean } | null>(null)
  const [refresh, setRefresh] = React.useState(0)

  const loadOrders = React.useCallback(async () => {
    const call = await apiCall<{ items: PlanningOrder[] }>('/api/dermat_planning/orders', undefined, { fallback: { items: [] } })
    setOrders(call.result?.items ?? [])
    return call.result?.items ?? []
  }, [])

  const loadPlans = React.useCallback(async () => {
    const call = await apiCall<{ items: SavedPlan[] }>('/api/dermat_planning/plans', undefined, { fallback: { items: [] } })
    setPlans(call.result?.items ?? [])
  }, [])

  const reloadPlans = async (planId: string) => {
    const call = await apiCall<{ items: SavedPlan[] }>('/api/dermat_planning/plans', undefined, { fallback: { items: [] } })
    const list = call.result?.items ?? []
    setPlans(list)
    const fresh = list.find((entry) => entry.id === planId)
    if (fresh) setPlan(fresh)
  }

  React.useEffect(() => {
    ;(async () => {
      const list = await loadOrders()
      loadPlans()
      const wanted = (params?.get('orders') ?? '').split(',').filter(Boolean)
      if (wanted.length) {
        const next: Selected = {}
        for (const order of list.filter((entry) => wanted.includes(entry.id))) {
          for (const line of order.lines) next[line.id] = { orderId: order.id, productId: line.productId, quantity: String(line.quantity) }
        }
        setSelected(next)
        setScope('all')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const items: PlanItem[] = React.useMemo(
    () => [
      ...Object.entries(selected)
        .filter(([, entry]) => Number(entry.quantity) > 0)
        .map(([lineId, entry]) => ({ key: lineId, orderId: entry.orderId, lineId, productId: entry.productId, quantity: Number(entry.quantity) })),
      ...extras.filter((entry) => Number(entry.quantity) > 0).map((entry) => ({ key: entry.key, orderId: null, lineId: null, productId: entry.productId, quantity: Number(entry.quantity) })),
    ],
    [selected, extras],
  )

  React.useEffect(() => {
    if (!items.length) {
      setRows([])
      setMissing([])
      return
    }
    let cancelled = false
    setCalculating(true)
    const handle = window.setTimeout(async () => {
      const call = await apiCall<{ rows: CalcRow[]; missingBoms: string[] }>('/api/dermat_planning/calculate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items }),
      })
      if (cancelled) return
      setCalculating(false)
      if (!call.ok || !call.result) {
        flash(t('dermat_planning.board.calcError', 'Could not work out the materials.'), 'error')
        return
      }
      setRows(call.result.rows)
      setMissing(call.result.missingBoms)
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [items, refresh, t])

  React.useEffect(() => {
    if (!bomSearch.trim()) {
      setBomOptions([])
      return
    }
    let cancelled = false
    const handle = window.setTimeout(async () => {
      const call = await apiCall<{ items?: SearchItem[] }>(`/api/dermat_products/search?kinds=finished_goods,bulk&limit=8&q=${encodeURIComponent(bomSearch.trim())}`, undefined, { fallback: { items: [] } })
      if (!cancelled) setBomOptions(call.result?.items ?? [])
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [bomSearch])

  const visibleOrders = (orders ?? []).filter((order) => {
    if (scope === 'planning' && order.planningStatus !== 'open' && order.planningStatus !== 'on_hold' && !order.lines.some((line) => selected[line.id])) return false
    const term = orderSearch.trim().toLowerCase()
    if (!term) return true
    return [order.orderNo, order.customerName, ...order.lines.map((line) => `${line.title} ${line.code ?? ''}`)].join(' ').toLowerCase().includes(term)
  })

  const pickedOrderIds = Array.from(new Set(Object.values(selected).map((entry) => entry.orderId)))
  const pickedOrders = (orders ?? []).filter((order) => pickedOrderIds.includes(order.id))

  const toggleOrder = (order: PlanningOrder, on: boolean) =>
    setSelected((prev) => {
      const next = { ...prev }
      for (const line of order.lines) {
        if (on) next[line.id] = next[line.id] ?? { orderId: order.id, productId: line.productId, quantity: String(line.quantity) }
        else delete next[line.id]
      }
      return next
    })

  const reservation = async (body: Record<string, unknown>, done: string): Promise<boolean> => {
    setBusy(true)
    try {
      const call = await runMutation({
        context: { action: body.action },
        mutationPayload: body,
        operation: () =>
          apiCall<{ ok?: boolean; error?: string; results?: Array<{ wanted: number; reserved: number }> }>('/api/dermat_planning/reservations', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          }),
      })
      if (!call.ok || !call.result?.ok) {
        flash(call.result?.error ?? t('dermat_planning.board.reserveError', 'That did not work. Try again.'), 'error')
        return false
      }
      const results = call.result.results
      if (results) {
        const short = results.filter((entry) => entry.reserved < entry.wanted - 0.0001).length
        flash(short ? t('dermat_planning.board.reservedSome', 'Reserved what is free. {count} still short.', { count: short }) : done, short ? 'warning' : 'success')
      } else flash(done, 'success')
      setRefresh((value) => value + 1)
      loadOrders()
      return true
    } catch {
      flash(t('dermat_planning.board.reserveError', 'That did not work. Try again.'), 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const reserveAll = () => {
    const entries = (rows ?? []).flatMap((row) =>
      row.sources.filter((source) => source.orderId && source.reserved < source.required).map((source) => ({ orderId: source.orderId as string, productId: row.productId, quantity: source.required })),
    )
    if (!entries.length) {
      flash(t('dermat_planning.board.nothingToReserve', 'Everything for these orders is already reserved.'), 'info')
      return
    }
    const due = new Map(pickedOrders.map((order) => [order.id, order.deliveryDate ?? '9999']))
    entries.sort((a, b) => (due.get(a.orderId) ?? '').localeCompare(due.get(b.orderId) ?? ''))
    reservation({ action: 'reserve_needed', entries }, t('dermat_planning.board.reservedAll', 'Reserved for every picked order.'))
  }

  const buyTarget = (path: string, extra = '') => {
    const buy = (rows ?? []).filter((row) => row.toOrder > 0)
    if (!buy.length) return
    const itemsParam = buy.map((row) => `${row.productId}:${row.toOrder}`).join(',')
    const ordersParam = pickedOrders.map((order) => `${order.id}:${encodeURIComponent(order.orderNo)}`).join(',')
    router.push(`${path}?items=${itemsParam}${ordersParam ? `&orders=${ordersParam}` : ''}${extra}`)
  }
  const raisePo = () => buyTarget('/backend/purchase/orders/new')
  const raiseIndent = () => buyTarget('/backend/purchase/indents', '&source=planning')

  const savePlan = async () => {
    if (!saving?.name.trim()) {
      flash(t('dermat_planning.board.planName', 'Name the plan.'), 'error')
      return
    }
    const body = { name: saving.name.trim(), notes: saving.notes.trim() || null, items, ...(plan && !saving.asNew ? { id: plan.id } : {}) }
    const updating = Boolean(plan && !saving.asNew)
    const call = await runMutation({
      context: { plan: plan?.id ?? null },
      mutationPayload: body,
      operation: () => {
        const request = () =>
          apiCall<SavedPlan & { error?: string }>('/api/dermat_planning/plans', { method: updating ? 'PUT' : 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        return updating && plan ? withScopedApiRequestHeaders(buildOptimisticLockHeader(plan.updatedAt), request) : request()
      },
    })
    if (!call.ok || !call.result || call.result.error) {
      flash(call.result?.error ?? t('dermat_planning.board.saveError', 'Could not save the plan.'), 'error')
      return
    }
    setPlan(call.result)
    setSaving(null)
    loadPlans()
    flash(t('dermat_planning.board.saved', 'Plan {code} saved.', { code: call.result.code }), 'success')
  }

  const openPlan = (id: string) => {
    const found = plans.find((entry) => entry.id === id)
    if (!found) return
    setPlan(found)
    const next: Selected = {}
    const nextExtras: Extra[] = []
    for (const item of found.items) {
      if (item.orderId && item.lineId) next[item.lineId] = { orderId: item.orderId, productId: item.productId, quantity: String(item.quantity) }
      else nextExtras.push({ key: item.key, productId: item.productId, title: t('dermat_planning.board.savedBom', 'Saved BOM'), unit: null, quantity: String(item.quantity) })
    }
    setSelected(next)
    setExtras(nextExtras)
    setScope('all')
  }

  const exportCsv = () => {
    const header = ['Code', 'Material', 'Unit', 'Needed', 'In store', 'Held by other orders', 'Free', 'Reserved for these', 'Short', 'Status']
    const lines = (rows ?? []).map((row) =>
      [row.code ?? '', row.title, row.unit ?? '', row.required, row.inStore, row.reservedOther, row.free, row.reservedHere, row.short, ROW_STATUS[row.status].label].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','),
    )
    const blob = new Blob([[header.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${plan?.name ?? 'planning'}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const filtered = (rows ?? []).filter((row) => {
    if (filter === 'short' && row.short <= 0) return false
    if (filter === 'open' && row.status === 'reserved') return false
    if (filter === 'rm' && row.kind !== 'raw_material') return false
    if (filter === 'pm' && row.kind !== 'packing_material') return false
    const term = materialSearch.trim().toLowerCase()
    return !term || `${row.title} ${row.code ?? ''}`.toLowerCase().includes(term)
  })
  const counts = {
    materials: rows?.length ?? 0,
    short: (rows ?? []).filter((row) => row.short > 0).length,
    reserved: (rows ?? []).filter((row) => row.status === 'reserved').length,
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 pb-16">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('dermat_planning.board.eyebrow', 'Production planning')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{plan ? plan.name : t('dermat_planning.board.title', 'Planning board')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {t('dermat_planning.board.lede', 'Pick several orders (or add a BOM to see "what if"). Every BOM is exploded and the same material is added into one line. Reserve holds stock for an order without taking it out of the store.')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {plans.length ? (
                <Select value={plan?.id ?? ''} onValueChange={openPlan}>
                  <SelectTrigger className="h-9 w-56" aria-label={t('dermat_planning.board.openPlan', 'Open a saved plan')}>
                    <SelectValue placeholder={t('dermat_planning.board.openPlan', 'Open a saved plan')} />
                  </SelectTrigger>
                  <SelectContent>
                    {plans.map((entry) => (
                      <SelectItem key={entry.id} value={entry.id}>
                        {entry.name} · {entry.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <Button type="button" variant="outline" onClick={exportCsv} disabled={!rows?.length}>
                <Download className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('dermat_planning.board.export', 'Excel (CSV)')}
              </Button>
              <Button type="button" variant="outline" onClick={() => setSaving({ name: plan?.name ?? `Week ${weekNumber()}`, notes: plan?.notes ?? '', asNew: !plan })} disabled={!items.length}>
                <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {plan ? t('dermat_planning.board.savePlan', 'Save plan') : t('dermat_planning.board.saveNew', 'Save as plan')}
              </Button>
              {plan ? <SendPlanButton plan={plan} onSent={() => void reloadPlans(plan.id)} /> : null}
            </div>
          </header>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <aside className="flex flex-col gap-4 xl:col-span-4">
              <section className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="space-y-3 border-b border-border p-4">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-semibold">{t('dermat_planning.board.orders', 'Orders')}</h2>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {t('dermat_planning.board.picked', '{count} picked', { count: pickedOrderIds.length })}
                    </span>
                  </div>
                  <SegmentedControl value={scope} onValueChange={(value) => setScope(value as typeof scope)} size="sm" aria-label={t('dermat_planning.board.scope', 'Which orders')}>
                    <SegmentedControlItem value="planning">{t('dermat_planning.board.inPlanning', 'In planning')}</SegmentedControlItem>
                    <SegmentedControlItem value="all">{t('dermat_planning.board.allOpen', 'All open orders')}</SegmentedControlItem>
                  </SegmentedControl>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input id="planning-order-search" className="pl-9" value={orderSearch} onChange={(event) => setOrderSearch(event.target.value)} placeholder={t('dermat_planning.board.orderSearch', 'Order no., customer or product')} />
                  </div>
                </div>
                <div className="max-h-screen overflow-y-auto">
                  {!orders ? (
                    <div className="flex justify-center py-10">
                      <Spinner />
                    </div>
                  ) : !visibleOrders.length ? (
                    <EmptyState
                      className="py-10"
                      variant="subtle"
                      title={scope === 'planning' ? t('dermat_planning.board.noneInPlanning', 'No orders are in planning') : t('dermat_planning.board.noOrders', 'No open orders')}
                      description={scope === 'planning' ? t('dermat_planning.board.noneInPlanningHint', 'Switch to "All open orders" to plan ahead.') : undefined}
                    />
                  ) : (
                    <ul className="divide-y divide-border">
                      {visibleOrders.map((order) => {
                        const picked = order.lines.some((line) => selected[line.id])
                        const due = daysUntil(order.deliveryDate)
                        const status = PLANNING_STATUS[order.planningStatus] ?? PLANNING_STATUS.waiting
                        return (
                          <li key={order.id} className={cn('p-4 transition-colors', picked && 'bg-accent-indigo/5')}>
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={`pick-${order.id}`}
                                className="mt-0.5"
                                checked={picked}
                                onCheckedChange={(checked) => toggleOrder(order, checked === true)}
                                aria-label={t('dermat_planning.board.pick', 'Plan {order}', { order: order.orderNo })}
                              />
                              <div className="min-w-0 flex-1 space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <label htmlFor={`pick-${order.id}`} className="min-w-0 cursor-pointer">
                                    <span className="block font-mono text-sm font-semibold">{order.orderNo}</span>
                                    <span className="block truncate text-xs text-muted-foreground">{order.customerName}</span>
                                  </label>
                                  {order.deliveryDate ? (
                                    <span
                                      className={cn(
                                        'inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium',
                                        due !== null && due <= 7 ? 'bg-status-error-bg text-status-error-text' : due !== null && due <= 21 ? 'bg-status-warning-bg text-status-warning-text' : 'bg-muted text-muted-foreground',
                                      )}
                                    >
                                      <CalendarClock className="h-3 w-3" aria-hidden="true" />
                                      {shortDate(order.deliveryDate)}
                                    </span>
                                  ) : null}
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
                                  {order.reservedMaterials ? (
                                    <span className="inline-flex items-center gap-1 rounded-sm bg-status-success-bg px-1.5 py-0.5 text-xs text-status-success-text">
                                      <Lock className="h-3 w-3" aria-hidden="true" />
                                      {t('dermat_planning.board.reservedCount', '{count} reserved', { count: order.reservedMaterials })}
                                    </span>
                                  ) : null}
                                </div>
                                {order.planningHold ? <p className="text-xs text-status-error-text">{order.planningHold}</p> : null}
                                <ul className="space-y-1.5 pt-1">
                                  {order.lines.map((line) => {
                                    const entry = selected[line.id]
                                    return (
                                      <li key={line.id} className="flex items-center gap-2">
                                        <span className="min-w-0 flex-1 truncate text-xs">
                                          {line.title}
                                          {!line.bomApproved ? (
                                            <span className="ml-1 text-status-warning-text">· {t('dermat_planning.board.noBom', 'no approved BOM')}</span>
                                          ) : null}
                                        </span>
                                        {entry ? (
                                          <Input
                                            id={`line-qty-${line.id}`}
                                            aria-label={t('dermat_planning.board.planQty', 'Quantity to plan')}
                                            className="h-7 w-24 text-right text-xs tabular-nums"
                                            inputMode="decimal"
                                            value={entry.quantity}
                                            onChange={(event) => setSelected((prev) => ({ ...prev, [line.id]: { ...prev[line.id], quantity: event.target.value } }))}
                                          />
                                        ) : (
                                          <span className="text-xs tabular-nums text-muted-foreground">{qty(line.quantity)} pcs</span>
                                        )}
                                      </li>
                                    )
                                  })}
                                </ul>
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <h2 className="text-sm font-semibold">{t('dermat_planning.board.whatIf', 'Add a BOM (what if)')}</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{t('dermat_planning.board.whatIfHint', 'A finished good or bulk with an approved BOM, before any order exists.')}</p>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input id="planning-bom-search" className="pl-9" value={bomSearch} onChange={(event) => setBomSearch(event.target.value)} placeholder={t('dermat_planning.board.bomSearch', 'Internal ID or name')} />
                  {bomOptions.length ? (
                    <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                      {bomOptions.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                            onClick={() => {
                              setExtras((prev) => [...prev, { key: `bom-${item.id}-${Date.now()}`, productId: item.id, title: item.title, unit: item.unit, quantity: item.kind === 'bulk' ? '100' : '1000' }])
                              setBomSearch('')
                              setBomOptions([])
                            }}
                          >
                            <Plus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                            {item.code ? <span className="font-mono text-xs text-muted-foreground">{item.code}</span> : null}
                            <span className="truncate">{item.title}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
                {extras.length ? (
                  <ul className="mt-3 space-y-2">
                    {extras.map((entry) => (
                      <li key={entry.key} className="flex items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2">
                        <span className="min-w-0 flex-1 truncate text-xs">{entry.title}</span>
                        <Input
                          id={`extra-${entry.key}`}
                          aria-label={t('dermat_planning.board.planQty', 'Quantity to plan')}
                          className="h-7 w-24 text-right text-xs tabular-nums"
                          inputMode="decimal"
                          value={entry.quantity}
                          onChange={(event) => setExtras((prev) => prev.map((item) => (item.key === entry.key ? { ...item, quantity: event.target.value } : item)))}
                        />
                        <span className="w-6 text-xs text-muted-foreground">{entry.unit ?? ''}</span>
                        <button type="button" aria-label={t('dermat_planning.board.remove', 'Remove')} className="text-muted-foreground hover:text-destructive" onClick={() => setExtras((prev) => prev.filter((item) => item.key !== entry.key))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>
            </aside>

            <section className="flex min-w-0 flex-col gap-4 xl:col-span-8">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[
                  { label: t('dermat_planning.board.tileOrders', 'Orders picked'), value: pickedOrderIds.length + extras.length, icon: <ClipboardCheck className="h-4 w-4" />, tone: 'bg-muted text-muted-foreground' },
                  { label: t('dermat_planning.board.tileMaterials', 'Materials'), value: counts.materials, icon: <Layers className="h-4 w-4" />, tone: 'bg-status-info-bg text-status-info-icon' },
                  { label: t('dermat_planning.board.tileShort', 'Short'), value: counts.short, icon: <AlertTriangle className="h-4 w-4" />, tone: 'bg-status-error-bg text-status-error-icon' },
                  { label: t('dermat_planning.board.tileReserved', 'Fully reserved'), value: counts.reserved, icon: <Lock className="h-4 w-4" />, tone: 'bg-status-success-bg text-status-success-icon' },
                ].map((tile) => (
                  <div key={tile.label} className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-xs">
                    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full', tile.tone)} aria-hidden="true">
                      {tile.icon}
                    </span>
                    <span>
                      <span className="block text-2xl font-bold leading-none tabular-nums">{tile.value}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{tile.label}</span>
                    </span>
                  </div>
                ))}
              </div>

              {missing.length ? (
                <Alert status="warning" style="lighter" className="rounded-lg">
                  <AlertTitle>{t('dermat_planning.board.missingTitle', 'Left out: no approved BOM')}</AlertTitle>
                  <AlertDescription>{missing.join(', ')}</AlertDescription>
                </Alert>
              ) : null}

              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <SegmentedControl value={filter} onValueChange={(value) => setFilter(value as Filter)} size="sm" aria-label={t('dermat_planning.board.filter', 'Show')}>
                    <SegmentedControlItem value="all">{t('dermat_planning.board.fAll', 'All')}</SegmentedControlItem>
                    <SegmentedControlItem value="short">{t('dermat_planning.board.fShort', 'Short')}</SegmentedControlItem>
                    <SegmentedControlItem value="open">{t('dermat_planning.board.fOpen', 'Not reserved')}</SegmentedControlItem>
                    <SegmentedControlItem value="rm">RM</SegmentedControlItem>
                    <SegmentedControlItem value="pm">PM</SegmentedControlItem>
                  </SegmentedControl>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-56">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <Input id="planning-material-search" className="h-9 pl-9" value={materialSearch} onChange={(event) => setMaterialSearch(event.target.value)} placeholder={t('dermat_planning.board.materialSearch', 'Find a material')} />
                    </div>
                    <ExportButton
                      disabled={!rows?.length}
                      onExport={() =>
                        downloadCsv('material-plan', [
                          { header: 'Material ID', value: (row) => row.code ?? '' },
                          { header: 'Material', value: (row) => row.title },
                          { header: 'Type', value: (row) => row.kind ?? '' },
                          { header: 'Unit', value: (row) => row.unit ?? '' },
                          { header: 'Needed', value: (row) => row.required },
                          { header: 'In store', value: (row) => row.inStore },
                          { header: 'Reserved for these orders', value: (row) => row.reservedHere },
                          { header: 'Held by other orders', value: (row) => row.reservedOther },
                          { header: 'Free', value: (row) => row.free },
                          { header: 'Short', value: (row) => row.short },
                          { header: 'Under QC test', value: (row) => row.underTest },
                          { header: 'On order (open POs)', value: (row) => row.onOrder },
                          { header: 'To order', value: (row) => row.toOrder },
                          { header: 'Status', value: (row) => ROW_STATUS[row.status].label },
                          { header: 'Needed for', value: (row) => row.sources.map((source) => `${source.orderNo ?? source.label}: ${source.required}`).join('; ') },
                          { header: 'Open POs', value: (row) => row.openPos.map((po) => `${po.code} ${po.vendorName} ${po.open}`).join('; ') },
                        ], rows ?? [])
                      }
                    />
                    <Button type="button" variant="outline" onClick={raiseIndent} disabled={!(rows ?? []).some((row) => row.toOrder > 0)}>
                      {t('dermat_planning.board.raiseIndent', 'Raise indent for what to buy')}
                    </Button>
                    <Button type="button" variant="outline" onClick={raisePo} disabled={!(rows ?? []).some((row) => row.toOrder > 0)}>
                      <ShoppingCart className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('dermat_planning.board.raisePo', 'Raise PO for what to buy')}
                    </Button>
                    <Button type="button" onClick={reserveAll} disabled={busy || !pickedOrderIds.length || !rows?.length}>
                      <Lock className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('dermat_planning.board.reserveAll', 'Reserve all that is free')}
                    </Button>
                  </div>
                </div>

                {!items.length ? (
                  <EmptyState
                    className="py-20"
                    variant="subtle"
                    icon={<PackageSearch className="h-5 w-5" aria-hidden="true" />}
                    title={t('dermat_planning.board.emptyTitle', 'Pick orders to plan')}
                    description={t('dermat_planning.board.emptyHint', 'Tick one or more orders on the left, or add a BOM. The total material list appears here.')}
                  />
                ) : rows === null || (calculating && !rows.length) ? (
                  <div className="flex justify-center py-20">
                    <Spinner />
                  </div>
                ) : (
                  <div className={cn('overflow-x-auto transition-opacity', calculating && 'opacity-60')}>
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 text-left text-overline font-semibold uppercase tracking-widest text-muted-foreground">
                        <tr>
                          <th className="px-4 py-2.5">{t('dermat_planning.board.material', 'Material')}</th>
                          <th className="px-3 py-2.5 text-right">{t('dermat_planning.board.needed', 'Needed')}</th>
                          <th className="px-3 py-2.5 text-right">{t('dermat_planning.board.inStore', 'In store')}</th>
                          <th className="px-3 py-2.5 text-right">{t('dermat_planning.board.heldOther', 'Held for others')}</th>
                          <th className="px-3 py-2.5 text-right">{t('dermat_planning.board.free', 'Free')}</th>
                          <th className="px-3 py-2.5 text-right">{t('dermat_planning.board.reservedHere', 'Reserved here')}</th>
                          <th className="px-3 py-2.5 text-right">{t('dermat_planning.board.short', 'Short')}</th>
                          <th className="px-4 py-2.5 text-right">{t('dermat_planning.board.status', 'Status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((row) => {
                          const open = expanded === row.productId
                          const outside = row.holders.filter((holder) => !row.sources.some((source) => source.orderId === holder.orderId))
                          const coverage = row.required > 0 ? Math.min(100, Math.round(((row.reservedHere + Math.min(row.free, Math.max(0, row.required - row.reservedHere))) / row.required) * 100)) : 100
                          return (
                            <React.Fragment key={row.productId}>
                              <tr
                                className={cn('cursor-pointer border-t border-border transition-colors hover:bg-muted/40', open && 'bg-muted/30')}
                                onClick={() => setExpanded(open ? null : row.productId)}
                              >
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden="true" />
                                    <div className="min-w-0">
                                      <p className="truncate font-medium">{row.title}</p>
                                      <p className="font-mono text-xs text-muted-foreground">
                                        {row.code ?? '—'} · {row.kind === 'raw_material' ? 'RM' : 'PM'}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-input" aria-hidden="true">
                                    <div
                                      className={cn('h-full rounded-full', row.short > 0 ? 'bg-status-error-icon' : row.status === 'reserved' ? 'bg-status-success-icon' : 'bg-accent-indigo')}
                                      style={{ width: `${coverage}%` }}
                                    />
                                  </div>
                                </td>
                                <td className="px-3 py-3 text-right font-medium tabular-nums">{qty(row.required, row.unit)}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{qty(row.inStore)}</td>
                                <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{row.reservedOther ? qty(row.reservedOther) : '—'}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{qty(row.free)}</td>
                                <td className="px-3 py-3 text-right tabular-nums">{row.reservedHere ? qty(row.reservedHere) : '—'}</td>
                                <td className="px-3 py-3 text-right tabular-nums">
                                  <span className={cn('font-semibold', row.short > 0 ? 'text-status-error-text' : 'text-muted-foreground')}>{row.short > 0 ? qty(row.short) : '—'}</span>
                                  {row.short > 0 && (row.onOrder > 0 || row.underTest > 0) ? (
                                    <span className="block text-xs text-muted-foreground">
                                      {[row.underTest > 0 ? `${qty(row.underTest)} in QC` : null, row.onOrder > 0 ? `${qty(row.onOrder)} on PO` : null].filter(Boolean).join(' · ')}
                                    </span>
                                  ) : null}
                                  {row.toOrder > 0 ? <span className="block text-xs font-medium text-status-error-text">{t('dermat_planning.board.toBuy', 'buy {qty}', { qty: qty(row.toOrder) })}</span> : null}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <StatusBadge variant={ROW_STATUS[row.status].variant}>{ROW_STATUS[row.status].label}</StatusBadge>
                                </td>
                              </tr>
                              {open ? (
                                <tr className="bg-muted/20">
                                  <td colSpan={8} className="px-4 pb-4 pt-1">
                                    <div className="rounded-lg border border-border bg-card">
                                      <table className="w-full text-sm">
                                        <thead className="text-left text-xs text-muted-foreground">
                                          <tr className="border-b border-border">
                                            <th className="px-3 py-2 font-medium">{t('dermat_planning.board.forWhom', 'Needed for')}</th>
                                            <th className="px-3 py-2 text-right font-medium">{t('dermat_planning.board.needs', 'Needs')}</th>
                                            <th className="px-3 py-2 text-right font-medium">{t('dermat_planning.board.reserved', 'Reserved')}</th>
                                            <th className="px-3 py-2 font-medium">{t('dermat_planning.board.since', 'Since')}</th>
                                            <th className="px-3 py-2 text-right font-medium">{t('dermat_planning.board.setTo', 'Set reservation')}</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border">
                                          {row.sources.map((source) => {
                                            const key = `${row.productId}:${source.key}`
                                            return (
                                              <tr key={source.key}>
                                                <td className="px-3 py-2.5">
                                                  {source.orderId ? (
                                                    <Link href={`/backend/orders/${source.orderId}`} className="font-mono text-xs font-semibold hover:underline">
                                                      {source.label}
                                                    </Link>
                                                  ) : (
                                                    <span className="text-xs italic text-muted-foreground">{source.label}</span>
                                                  )}
                                                </td>
                                                <td className="px-3 py-2.5 text-right tabular-nums">{qty(source.required, row.unit)}</td>
                                                <td className={cn('px-3 py-2.5 text-right tabular-nums', source.reserved >= source.required - 0.0001 && source.orderId && 'text-status-success-text')}>
                                                  {source.orderId ? qty(source.reserved) : '—'}
                                                </td>
                                                <td className="px-3 py-2.5 text-xs text-muted-foreground">{source.since ? age(source.since) : '—'}</td>
                                                <td className="px-3 py-2">
                                                  {source.orderId ? (
                                                    <div className="flex items-center justify-end gap-1.5" onClick={(event) => event.stopPropagation()}>
                                                      <Input
                                                        id={`reserve-${key}`}
                                                        aria-label={t('dermat_planning.board.setTo', 'Set reservation')}
                                                        className="h-8 w-24 text-right tabular-nums"
                                                        inputMode="decimal"
                                                        value={drafts[key] ?? String(source.reserved || Math.min(source.required, source.reserved + row.free))}
                                                        onChange={(event) => setDrafts((prev) => ({ ...prev, [key]: event.target.value }))}
                                                      />
                                                      <Button
                                                        type="button"
                                                        size="sm"
                                                        disabled={busy}
                                                        onClick={() =>
                                                          reservation(
                                                            { action: 'reserve', orderId: source.orderId, productId: row.productId, quantity: Number(drafts[key] ?? Math.min(source.required, source.reserved + row.free)) },
                                                            t('dermat_planning.board.reservedOne', 'Reserved for {order}.', { order: source.orderNo ?? '' }),
                                                          ).then((ok) => {
                                                            if (!ok) return
                                                            setDrafts((prev) => {
                                                              const next = { ...prev }
                                                              delete next[key]
                                                              return next
                                                            })
                                                          })
                                                        }
                                                      >
                                                        {t('dermat_planning.board.reserve', 'Reserve')}
                                                      </Button>
                                                      {source.reserved > 0 ? (
                                                        <>
                                                          <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            aria-label={t('dermat_planning.board.moveTitle', 'Move to another order')}
                                                            disabled={busy}
                                                            onClick={() => setMove({ productId: row.productId, title: row.title, unit: row.unit, fromOrderId: source.orderId as string, toOrderId: '', quantity: String(source.reserved), note: '' })}
                                                          >
                                                            <ArrowRightLeft className="h-4 w-4" />
                                                          </Button>
                                                          <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="ghost"
                                                            aria-label={t('dermat_planning.board.clear', 'Clear reservation')}
                                                            disabled={busy}
                                                            onClick={() =>
                                                              reservation({ action: 'clear', orderId: source.orderId, productId: row.productId }, t('dermat_planning.board.cleared', 'Reservation cleared.'))
                                                            }
                                                          >
                                                            <X className="h-4 w-4" />
                                                          </Button>
                                                        </>
                                                      ) : null}
                                                    </div>
                                                  ) : (
                                                    <p className="text-right text-xs text-muted-foreground">{t('dermat_planning.board.noReserveWhatIf', 'Book an order to reserve')}</p>
                                                  )}
                                                </td>
                                              </tr>
                                            )
                                          })}
                                        </tbody>
                                      </table>
                                      {row.openPos.length || row.underTest > 0 ? (
                                        <div className="border-t border-border px-3 py-2.5">
                                          <p className="text-xs font-medium">{t('dermat_planning.board.coming', 'Coming in')}</p>
                                          <ul className="mt-1.5 flex flex-wrap gap-2">
                                            {row.underTest > 0 ? (
                                              <li className="inline-flex items-center gap-1.5 rounded-md border border-border bg-status-warning-bg px-2 py-1 text-xs text-status-warning-text">
                                                {t('dermat_planning.board.inQc', '{qty} in the store under QC test', { qty: qty(row.underTest, row.unit) })}
                                              </li>
                                            ) : null}
                                            {row.openPos.map((po) => (
                                              <li key={po.poId}>
                                                <Link href={`/backend/purchase/orders/${po.poId}`} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted">
                                                  <span className="font-mono font-semibold">{po.code}</span>
                                                  <span className="text-muted-foreground">
                                                    {qty(po.open, row.unit)} · {po.vendorName}
                                                    {po.expectedDate ? ` · due ${shortDate(po.expectedDate)}` : ''}
                                                  </span>
                                                </Link>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      ) : null}
                                      {outside.length ? (
                                        <div className="border-t border-border bg-status-warning-bg/40 px-3 py-2.5">
                                          <p className="text-xs font-medium">{t('dermat_planning.board.heldElsewhere', 'Also held for orders outside this plan')}</p>
                                          <ul className="mt-1.5 flex flex-wrap gap-2">
                                            {outside.map((holder) => (
                                              <li key={holder.orderId}>
                                                <button
                                                  type="button"
                                                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs hover:bg-muted"
                                                  onClick={() =>
                                                    setMove({ productId: row.productId, title: row.title, unit: row.unit, fromOrderId: holder.orderId, toOrderId: row.sources.find((source) => source.orderId)?.orderId ?? '', quantity: String(holder.quantity), note: '' })
                                                  }
                                                >
                                                  <span className="font-mono font-semibold">{holder.orderNo}</span>
                                                  <span className="text-muted-foreground">
                                                    {qty(holder.quantity, row.unit)} · {age(holder.since)}
                                                  </span>
                                                  <ArrowRightLeft className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                                                </button>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      ) : null}
                                    </div>
                                  </td>
                                </tr>
                              ) : null}
                            </React.Fragment>
                          )
                        })}
                        {!filtered.length ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted-foreground">
                              {t('dermat_planning.board.noMatch', 'No materials match this filter.')}
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>

        <Dialog open={move !== null} onOpenChange={(value) => (!value ? setMove(null) : undefined)}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && move) {
                event.preventDefault()
                document.getElementById('move-submit')?.click()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('dermat_planning.board.moveTitle', 'Move to another order')}</DialogTitle>
              <DialogDescription>
                {t('dermat_planning.board.moveHint', '{material}: the stock stays in the store; only who it is held for changes.', { material: move?.title ?? '' })}
              </DialogDescription>
            </DialogHeader>
            {move ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t('dermat_planning.board.from', 'From order')}</Label>
                    <p className="rounded-md border border-border bg-muted/40 px-3 py-2 font-mono text-sm">
                      {(orders ?? []).find((order) => order.id === move.fromOrderId)?.orderNo ?? '—'}
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="move-to">{t('dermat_planning.board.to', 'To order')}</Label>
                    <Select value={move.toOrderId} onValueChange={(value) => setMove({ ...move, toOrderId: value })}>
                      <SelectTrigger id="move-to">
                        <SelectValue placeholder={t('dermat_planning.board.pickOrder', 'Pick an order')} />
                      </SelectTrigger>
                      <SelectContent>
                        {(orders ?? [])
                          .filter((order) => order.id !== move.fromOrderId)
                          .map((order) => (
                            <SelectItem key={order.id} value={order.id}>
                              {order.orderNo} · {order.customerName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="move-qty">{t('dermat_planning.board.moveQty', 'Quantity ({unit})', { unit: move.unit ?? '' })}</Label>
                  <Input id="move-qty" inputMode="decimal" className="tabular-nums" value={move.quantity} onChange={(event) => setMove({ ...move, quantity: event.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="move-note">{t('dermat_planning.board.reason', 'Reason *')}</Label>
                  <Textarea id="move-note" rows={2} value={move.note} onChange={(event) => setMove({ ...move, note: event.target.value })} placeholder={t('dermat_planning.board.reasonHint', 'e.g. DER/SO/2627/0003 is made first; the other waits for China material')} />
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMove(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                id="move-submit"
                type="button"
                disabled={busy || !move?.toOrderId || !move?.note.trim() || !(Number(move?.quantity) > 0)}
                onClick={async () => {
                  if (!move) return
                  const ok = await reservation(
                    { action: 'move', orderId: move.fromOrderId, toOrderId: move.toOrderId, productId: move.productId, quantity: Number(move.quantity), note: move.note.trim() },
                    t('dermat_planning.board.moved', 'Reservation moved.'),
                  )
                  if (ok) setMove(null)
                }}
              >
                <ArrowRightLeft className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('dermat_planning.board.moveConfirm', 'Move reservation')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={saving !== null} onOpenChange={(value) => (!value ? setSaving(null) : undefined)}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                savePlan()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{plan && !saving?.asNew ? t('dermat_planning.board.saveTitle', 'Save plan') : t('dermat_planning.board.saveNewTitle', 'Save as a new plan')}</DialogTitle>
              <DialogDescription>{t('dermat_planning.board.saveHint', 'Keeps the picked orders, BOMs and quantities so the plan can be opened again.')}</DialogDescription>
            </DialogHeader>
            {saving ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="plan-name">{t('dermat_planning.board.name', 'Name *')}</Label>
                  <Input id="plan-name" value={saving.name} onChange={(event) => setSaving({ ...saving, name: event.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="plan-notes">{t('dermat_planning.board.notes', 'Notes')}</Label>
                  <Textarea id="plan-notes" rows={2} value={saving.notes} onChange={(event) => setSaving({ ...saving, notes: event.target.value })} />
                </div>
              </div>
            ) : null}
            <DialogFooter>
              {plan && !saving?.asNew ? (
                <Button type="button" variant="ghost" onClick={() => saving && setSaving({ ...saving, asNew: true })}>
                  {t('dermat_planning.board.asNew', 'Save as new instead')}
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => setSaving(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" onClick={savePlan}>
                <Save className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('dermat_planning.board.save', 'Save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}

function weekNumber(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1)
  return Math.ceil(((now.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7)
}

export default PlanningBoard
