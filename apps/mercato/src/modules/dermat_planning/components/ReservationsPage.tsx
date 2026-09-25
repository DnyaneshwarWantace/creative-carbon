"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowRightLeft, Clock, History, Lock, PackageSearch, Search, X } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { age, ageDays, qty, type PlanningOrder } from './shared'

type Reservation = {
  id: string
  orderId: string
  orderNo: string
  productId: string
  title: string
  code: string | null
  kind: string | null
  unit: string | null
  quantity: number
  inStore: number
  since: string
  byName: string | null
  note: string | null
}
type LogEntry = { id: string; action: string; orderId: string; orderNo: string; toOrderNo: string | null; title: string; quantity: number; note: string | null; byName: string | null; at: string }
type Dialogs = { kind: 'move' | 'clear'; row: Reservation; toOrderId: string; quantity: string; note: string } | null

const ACTION_LABEL: Record<string, string> = { reserve: 'Reserved', clear: 'Cleared', move: 'Moved', issued: 'Issued by store' }

export function ReservationsPage() {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: 'dermat-planning-reservations' })
  const [items, setItems] = React.useState<Reservation[] | null>(null)
  const [history, setHistory] = React.useState<LogEntry[]>([])
  const [orders, setOrders] = React.useState<PlanningOrder[]>([])
  const [groupBy, setGroupBy] = React.useState<'order' | 'material'>('order')
  const [search, setSearch] = React.useState('')
  const [oldOnly, setOldOnly] = React.useState(false)
  const [dialog, setDialog] = React.useState<Dialogs>(null)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const [list, open] = await Promise.all([
      apiCall<{ items: Reservation[]; history: LogEntry[] }>('/api/dermat_planning/reservations', undefined, { fallback: { items: [], history: [] } }),
      apiCall<{ items: PlanningOrder[] }>('/api/dermat_planning/orders', undefined, { fallback: { items: [] } }),
    ])
    setItems(list.result?.items ?? [])
    setHistory(list.result?.history ?? [])
    setOrders(open.result?.items ?? [])
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  const submit = async () => {
    if (!dialog) return
    const body =
      dialog.kind === 'move'
        ? { action: 'move', orderId: dialog.row.orderId, toOrderId: dialog.toOrderId, productId: dialog.row.productId, quantity: Number(dialog.quantity), note: dialog.note.trim() }
        : { action: 'clear', orderId: dialog.row.orderId, productId: dialog.row.productId, note: dialog.note.trim() || null }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { action: body.action },
        mutationPayload: body,
        operation: () => apiCall<{ ok?: boolean; error?: string }>('/api/dermat_planning/reservations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result?.ok) {
        flash(call.result?.error ?? t('dermat_planning.res.error', 'That did not work. Try again.'), 'error')
        return
      }
      flash(dialog.kind === 'move' ? t('dermat_planning.res.moved', 'Reservation moved.') : t('dermat_planning.res.cleared', 'Reservation cleared.'), 'success')
      setDialog(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const term = search.trim().toLowerCase()
  const visible = (items ?? []).filter((row) => {
    if (oldOnly && ageDays(row.since) < 90) return false
    return !term || `${row.orderNo} ${row.title} ${row.code ?? ''}`.toLowerCase().includes(term)
  })
  const groups = new Map<string, { key: string; title: string; subtitle: string; href: string | null; rows: Reservation[] }>()
  for (const row of visible) {
    const key = groupBy === 'order' ? row.orderId : row.productId
    const group = groups.get(key) ?? {
      key,
      title: groupBy === 'order' ? row.orderNo : row.title,
      subtitle: groupBy === 'order' ? (orders.find((order) => order.id === row.orderId)?.customerName ?? '') : `${row.code ?? ''} · ${qty(row.inStore, row.unit)} ${t('dermat_planning.res.inStore', 'in store')}`,
      href: groupBy === 'order' ? `/backend/orders/${row.orderId}` : `/backend/products/${row.productId}`,
      rows: [],
    }
    group.rows.push(row)
    groups.set(key, group)
  }
  const oldest = (items ?? []).reduce<string | null>((current, row) => (!current || row.since < current ? row.since : current), null)

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-16">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('dermat_planning.res.eyebrow', 'Production planning')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('dermat_planning.res.title', 'Reserved stock')}</h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                {t('dermat_planning.res.lede', 'Stock held for an order stays in the store and is not deducted. Other orders cannot use it until you clear it or move it to them. Reservations never expire.')}
              </p>
            </div>
            <Link href="/backend/planning" className="text-sm font-medium text-primary hover:underline">
              {t('dermat_planning.res.toBoard', 'Open the planning board →')}
            </Link>
          </header>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: t('dermat_planning.res.tileHeld', 'Materials held'), value: String(items?.length ?? '–'), icon: <Lock className="h-4 w-4" />, tone: 'bg-status-success-bg text-status-success-icon' },
              { label: t('dermat_planning.res.tileOrders', 'Orders holding stock'), value: String(new Set((items ?? []).map((row) => row.orderId)).size), icon: <PackageSearch className="h-4 w-4" />, tone: 'bg-status-info-bg text-status-info-icon' },
              { label: t('dermat_planning.res.tileOldest', 'Oldest reservation'), value: oldest ? age(oldest) : '—', icon: <Clock className="h-4 w-4" />, tone: 'bg-muted text-muted-foreground' },
              { label: t('dermat_planning.res.tileOld', 'Held over 3 months'), value: String((items ?? []).filter((row) => ageDays(row.since) >= 90).length), icon: <History className="h-4 w-4" />, tone: 'bg-status-warning-bg text-status-warning-icon' },
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

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="flex flex-col gap-4 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <SegmentedControl value={groupBy} onValueChange={(value) => setGroupBy(value as typeof groupBy)} size="sm" aria-label={t('dermat_planning.res.groupBy', 'Group by')}>
                    <SegmentedControlItem value="order">{t('dermat_planning.res.byOrder', 'By order')}</SegmentedControlItem>
                    <SegmentedControlItem value="material">{t('dermat_planning.res.byMaterial', 'By material')}</SegmentedControlItem>
                  </SegmentedControl>
                  <Button type="button" size="sm" variant={oldOnly ? 'default' : 'outline'} onClick={() => setOldOnly((value) => !value)}>
                    {t('dermat_planning.res.oldOnly', 'Over 3 months')}
                  </Button>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input id="reservation-search" className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('dermat_planning.res.search', 'Order no. or material')} />
                </div>
              </div>

              {!items ? (
                <div className="flex justify-center py-16">
                  <Spinner />
                </div>
              ) : !groups.size ? (
                <EmptyState
                  className="py-16"
                  icon={<Lock className="h-5 w-5" aria-hidden="true" />}
                  title={t('dermat_planning.res.empty', 'Nothing is reserved')}
                  description={t('dermat_planning.res.emptyHint', 'Reserve stock for orders on the planning board.')}
                />
              ) : (
                Array.from(groups.values()).map((group) => (
                  <article key={group.key} className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                      <div className="min-w-0">
                        {group.href ? (
                          <Link href={group.href} className={cn('text-sm font-semibold hover:underline', groupBy === 'order' && 'font-mono')}>
                            {group.title}
                          </Link>
                        ) : (
                          <span className="text-sm font-semibold">{group.title}</span>
                        )}
                        {group.subtitle ? <p className="truncate text-xs text-muted-foreground">{group.subtitle}</p> : null}
                      </div>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums">{group.rows.length}</span>
                    </header>
                    <ul className="divide-y divide-border">
                      {group.rows.map((row) => {
                        const days = ageDays(row.since)
                        return (
                          <li key={row.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                            <div className="min-w-0 flex-1">
                              {groupBy === 'order' ? (
                                <>
                                  <p className="truncate text-sm font-medium">{row.title}</p>
                                  <p className="font-mono text-xs text-muted-foreground">{row.code ?? '—'}</p>
                                </>
                              ) : (
                                <Link href={`/backend/orders/${row.orderId}`} className="font-mono text-sm font-semibold hover:underline">
                                  {row.orderNo}
                                </Link>
                              )}
                              {row.note ? <p className="mt-0.5 truncate text-xs text-muted-foreground">“{row.note}”</p> : null}
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold tabular-nums">{qty(row.quantity, row.unit)}</p>
                              <p className={cn('text-xs', days >= 90 ? 'text-status-warning-text' : 'text-muted-foreground')}>
                                {t('dermat_planning.res.heldFor', 'held {age}', { age: age(row.since) })}
                                {row.byName ? ` · ${row.byName}` : ''}
                              </p>
                            </div>
                            <div className="flex gap-1">
                              <Button type="button" size="sm" variant="ghost" onClick={() => setDialog({ kind: 'move', row, toOrderId: '', quantity: String(row.quantity), note: '' })}>
                                <ArrowRightLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                                {t('dermat_planning.res.move', 'Move')}
                              </Button>
                              <Button type="button" size="sm" variant="ghost" onClick={() => setDialog({ kind: 'clear', row, toOrderId: '', quantity: '', note: '' })}>
                                <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                                {t('dermat_planning.res.clear', 'Clear')}
                              </Button>
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </article>
                ))
              )}
            </section>

            <aside className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-sm font-semibold">{t('dermat_planning.res.history', 'Recent changes')}</h2>
              {history.length ? (
                <ol className="relative mt-4 space-y-4 border-l border-border pl-5">
                  {history.map((entry) => (
                    <li key={entry.id} className="relative">
                      <span
                        className={cn(
                          'absolute -left-6 top-1 h-2.5 w-2.5 rounded-full ring-4 ring-card',
                          entry.action === 'clear' ? 'bg-muted-foreground' : entry.action === 'move' ? 'bg-status-warning-icon' : entry.action === 'issued' ? 'bg-accent-indigo' : 'bg-status-success-icon',
                        )}
                        aria-hidden="true"
                      />
                      <p className="text-sm">
                        <span className="font-medium">{ACTION_LABEL[entry.action] ?? entry.action}</span> {qty(entry.quantity)} · {entry.title}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.orderNo}
                        {entry.toOrderNo ? ` → ${entry.toOrderNo}` : ''} · {entry.byName ?? t('dermat_planning.res.system', 'System')} · {age(entry.at)} {t('dermat_planning.res.ago', 'ago')}
                      </p>
                      {entry.note ? <p className="mt-0.5 text-xs">{entry.note}</p> : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">{t('dermat_planning.res.noHistory', 'No changes yet.')}</p>
              )}
            </aside>
          </div>
        </div>

        <Dialog open={dialog !== null} onOpenChange={(value) => (!value ? setDialog(null) : undefined)}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                submit()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{dialog?.kind === 'move' ? t('dermat_planning.res.moveTitle', 'Move to another order') : t('dermat_planning.res.clearTitle', 'Clear this reservation')}</DialogTitle>
              <DialogDescription>
                {dialog
                  ? t('dermat_planning.res.dialogHint', '{qty} of {material}, held for {order}.', { qty: qty(dialog.row.quantity, dialog.row.unit), material: dialog.row.title, order: dialog.row.orderNo })
                  : ''}
              </DialogDescription>
            </DialogHeader>
            {dialog ? (
              <div className="space-y-4">
                {dialog.kind === 'move' ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="res-move-to">{t('dermat_planning.res.to', 'To order')}</Label>
                      <Select value={dialog.toOrderId} onValueChange={(value) => setDialog({ ...dialog, toOrderId: value })}>
                        <SelectTrigger id="res-move-to">
                          <SelectValue placeholder={t('dermat_planning.res.pickOrder', 'Pick an order')} />
                        </SelectTrigger>
                        <SelectContent>
                          {orders
                            .filter((order) => order.id !== dialog.row.orderId)
                            .map((order) => (
                              <SelectItem key={order.id} value={order.id}>
                                {order.orderNo} · {order.customerName}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="res-move-qty">{t('dermat_planning.res.qty', 'Quantity')}</Label>
                      <Input id="res-move-qty" inputMode="decimal" className="tabular-nums" value={dialog.quantity} onChange={(event) => setDialog({ ...dialog, quantity: event.target.value })} />
                    </div>
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="res-note">{dialog.kind === 'move' ? t('dermat_planning.res.reasonReq', 'Reason *') : t('dermat_planning.res.reason', 'Reason')}</Label>
                  <Textarea id="res-note" rows={2} value={dialog.note} onChange={(event) => setDialog({ ...dialog, note: event.target.value })} />
                </div>
              </div>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                type="button"
                variant={dialog?.kind === 'clear' ? 'destructive-solid' : 'default'}
                disabled={busy || (dialog?.kind === 'move' && (!dialog.toOrderId || !dialog.note.trim() || !(Number(dialog.quantity) > 0)))}
                onClick={submit}
              >
                {dialog?.kind === 'move' ? t('dermat_planning.res.moveConfirm', 'Move reservation') : t('dermat_planning.res.clearConfirm', 'Clear reservation')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}

export default ReservationsPage
