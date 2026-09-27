"use client"

import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { ClipboardList, PackageCheck, Printer, Timer } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../dermat_departments/components/useGranted'

type Plan = { id: string; code: string; name: string; notes: string | null; storeStatus: 'sent' | 'preparing' | 'ready' | null; sentAt: string | null; sentByName: string | null; prepareBy: string | null; storeNote: string | null; storeUpdatedAt: string | null; storeByName: string | null; updatedAt: string }
type PickRow = { productId: string; code: string | null; title: string; kind: string | null; unit: string | null; store: string; required: number; reserved: number; short: number; underTest: number; onOrder: number; pick: Array<{ lotNumber: string | null; store: string; quantity: number; expiresAt: string | null }>; notInStore: number; heldForOthers: number; orders: Array<{ orderNo: string | null; required: number }> }
type Pick = { plan: Plan; orders: Array<{ id: string; orderNo: string; deliveryDate: string | null }>; rows: PickRow[]; missingBoms: string[] }

export const STORE_STATUS: Record<string, { label: string; variant: StatusBadgeVariant }> = {
  sent: { label: 'Sent to store', variant: 'warning' },
  preparing: { label: 'Store preparing', variant: 'info' },
  ready: { label: 'Ready', variant: 'success' },
}

function qty(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 3 })
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function printPick(pick: Pick) {
  const popup = window.open('', '_blank', 'width=960,height=1100')
  if (!popup) return false
  const rows = pick.rows
    .map((row) => {
      const batches = row.pick.length ? row.pick.map((lot) => `${escapeHtml(lot.lotNumber ?? '—')}: ${qty(lot.quantity)} ${escapeHtml(row.unit ?? '')}${lot.expiresAt ? ` (exp ${lot.expiresAt.slice(0, 10)})` : ''}`).join('<br>') : '—'
      return `<tr><td>${escapeHtml(row.store)}</td><td class="mono">${escapeHtml(row.code ?? '')}</td><td>${escapeHtml(row.title)}</td><td class="num">${qty(row.required)} ${escapeHtml(row.unit ?? '')}</td><td>${batches}</td><td class="num">${row.notInStore ? `${qty(row.notInStore)} short${row.heldForOthers ? ` (${qty(row.heldForOthers)} held for other orders)` : ''}` : ''}</td><td class="tick"></td></tr>`
    })
    .join('')
  popup.document.open()
  popup.document.write(`<!doctype html><html><head><title>Pick list ${escapeHtml(pick.plan.code)}</title><style>
    body{font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#1c1917;margin:24px}h1{font-size:20px;margin:0}p{margin:4px 0;font-size:12px;color:#57534e}
    table{width:100%;border-collapse:collapse;margin-top:14px;font-size:12px}th,td{border:1px solid #d6d3d1;padding:6px;vertical-align:top;text-align:left}th{background:#f5f5f4}
    .num{text-align:right;white-space:nowrap}.mono{font-family:ui-monospace,Menlo,monospace}.tick{width:48px}.sign{margin-top:28px;display:flex;gap:48px;font-size:12px}
    @media print{button{display:none}}
  </style></head><body>
  <h1>Pick list · ${escapeHtml(pick.plan.code)} · ${escapeHtml(pick.plan.name)}</h1>
  <p>Orders: ${pick.orders.map((order) => `${escapeHtml(order.orderNo)}${order.deliveryDate ? ` (deliver ${order.deliveryDate})` : ''}`).join(', ') || '—'}</p>
  <p>${pick.plan.prepareBy ? `Prepare by ${escapeHtml(pick.plan.prepareBy)} · ` : ''}Sent by ${escapeHtml(pick.plan.sentByName ?? '—')}${pick.plan.storeNote ? ` · ${escapeHtml(pick.plan.storeNote)}` : ''}</p>
  <table><thead><tr><th>Store</th><th>Code</th><th>Material</th><th>Needed</th><th>Take from batch (oldest expiry first)</th><th>Short</th><th>Done</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="sign"><span>Prepared by: ____________________</span><span>Checked by: ____________________</span><span>Date: __________</span></div>
  <button onclick="window.print()">Print</button></body></html>`)
  popup.document.close()
  return true
}

export function StorePlansPage() {
  const t = useT()
  const params = useSearchParams()
  const granted = useGranted()
  const { runMutation } = useGuardedMutation({ contextId: 'dermat-store-plans' })
  const [plans, setPlans] = React.useState<Plan[] | null>(null)
  const [selected, setSelected] = React.useState<string | null>(params?.get('id') ?? null)
  const [pick, setPick] = React.useState<Pick | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const loadPlans = React.useCallback(async () => {
    const call = await apiCall<{ items?: Plan[]; error?: string }>('/api/dermat_planning/plans/pick')
    if (!call.ok) {
      setError(call.result?.error ?? t('dermat_planning.store.loadError', 'Could not load plans.'))
      return
    }
    const items = call.result?.items ?? []
    setPlans(items)
    setSelected((current) => current ?? items.find((plan) => plan.storeStatus !== 'ready')?.id ?? items[0]?.id ?? null)
  }, [t])

  React.useEffect(() => {
    void loadPlans()
  }, [loadPlans])

  React.useEffect(() => {
    if (!selected) return
    setPick(null)
    void apiCall<Pick & { error?: string }>(`/api/dermat_planning/plans/pick?id=${encodeURIComponent(selected)}`).then((call) => {
      if (call.ok && call.result) setPick(call.result)
      else flash(call.result?.error ?? t('dermat_planning.store.pickError', 'Could not build the pick list.'), 'error')
    })
  }, [selected, t])

  const setStatus = async (status: 'preparing' | 'ready') => {
    if (!pick) return
    const body = { id: pick.plan.id, status }
    setBusy(true)
    try {
      const request = () => apiCall<Plan & { error?: string }>('/api/dermat_planning/plans/store', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const call = await runMutation({ context: { resourceKind: 'dermat_planning.plan', resourceId: pick.plan.id }, mutationPayload: body, operation: () => withScopedApiRequestHeaders(buildOptimisticLockHeader(pick.plan.updatedAt), request) })
      if (!call.ok || !call.result?.id) {
        flash(call.result?.error ?? t('dermat_planning.store.saveError', 'Could not update the plan.'), 'error')
        return
      }
      setPick((prev) => (prev ? { ...prev, plan: call.result as Plan } : prev))
      flash(status === 'ready' ? t('dermat_planning.store.readyDone', 'Marked ready. Planning has been told.') : t('dermat_planning.store.preparingDone', 'Marked as preparing.'), 'success')
      void loadPlans()
    } finally {
      setBusy(false)
    }
  }

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!plans) return <Page><PageBody><LoadingMessage label={t('dermat_planning.store.loading', 'Loading plans…')} /></PageBody></Page>

  const canAct = granted.has('dermat_store.issue')

  return (
    <Page>
      <PageBody>
        <div className="flex flex-col gap-5">
          <header className="space-y-1 border-b pb-4">
            <h1 className="text-2xl font-bold tracking-tight">{t('dermat_planning.store.title', 'Plans to prepare')}</h1>
            <p className="max-w-3xl text-sm text-muted-foreground">{t('dermat_planning.store.lede', 'Material plans sent by Planning. Each one is a pick list: what to take out, from which store and which batch (oldest expiry first). Only stock that is free or reserved for these orders is picked; stock held for other orders is never touched. Mark it Preparing, then Ready; Planning is told when it is ready. Stock only leaves the store when production raises its request and you issue it.')}</p>
          </header>
          {!plans.length ? (
            <p className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">{t('dermat_planning.store.none', 'No plans have been sent to the store yet.')}</p>
          ) : (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
              <nav aria-label={t('dermat_planning.store.plans', 'Plans')} className="flex flex-col gap-1 rounded-lg border bg-card p-2">
                {plans.map((plan) => {
                  const status = STORE_STATUS[plan.storeStatus ?? 'sent']
                  return (
                    <button key={plan.id} type="button" onClick={() => setSelected(plan.id)} className={cn('space-y-1 rounded-md px-3 py-2 text-left text-sm hover:bg-muted', selected === plan.id && 'bg-muted')}>
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-semibold">{plan.code}</span>
                        <StatusBadge variant={status.variant}>{status.label}</StatusBadge>
                      </span>
                      <span className="block truncate">{plan.name}</span>
                      {plan.prepareBy ? <span className="block text-xs text-muted-foreground">{t('dermat_planning.store.by', 'ready by {date}', { date: plan.prepareBy })}</span> : null}
                    </button>
                  )
                })}
              </nav>
              <section className="space-y-4 lg:col-span-3">
                {!pick ? (
                  <LoadingMessage label={t('dermat_planning.store.building', 'Building the pick list…')} />
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4">
                      <div className="space-y-1">
                        <p className="flex items-center gap-2 font-semibold">
                          <ClipboardList className="h-4 w-4 text-primary" aria-hidden="true" />
                          {pick.plan.code} · {pick.plan.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t('dermat_planning.store.from', 'Sent by {name}', { name: pick.plan.sentByName ?? '—' })}
                          {pick.plan.prepareBy ? ` · ${t('dermat_planning.store.by', 'ready by {date}', { date: pick.plan.prepareBy })}` : ''}
                          {pick.plan.storeByName ? ` · ${STORE_STATUS[pick.plan.storeStatus ?? 'sent'].label} (${pick.plan.storeByName})` : ''}
                        </p>
                        {pick.plan.storeNote ? <p className="text-sm">{pick.plan.storeNote}</p> : null}
                        <p className="flex flex-wrap gap-1.5 text-xs">
                          {pick.orders.map((order) => (
                            <Link key={order.id} href={`/backend/orders/${order.id}`} className="rounded border px-1.5 py-0.5 font-mono hover:bg-muted">
                              {order.orderNo}{order.deliveryDate ? ` · ${order.deliveryDate}` : ''}
                            </Link>
                          ))}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="outline" onClick={() => printPick(pick)}>
                          <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          {t('dermat_planning.store.print', 'Print pick list')}
                        </Button>
                        {canAct && pick.plan.storeStatus === 'sent' ? (
                          <Button type="button" variant="outline" onClick={() => void setStatus('preparing')} disabled={busy}>
                            <Timer className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {t('dermat_planning.store.preparing', 'Start preparing')}
                          </Button>
                        ) : null}
                        {canAct && pick.plan.storeStatus !== 'ready' ? (
                          <Button type="button" onClick={() => void setStatus('ready')} disabled={busy}>
                            <PackageCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                            {t('dermat_planning.store.ready', 'Mark ready')}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {pick.missingBoms.length ? <p className="text-xs text-status-warning-text">{t('dermat_planning.store.noBom', 'No approved BOM for: {list}', { list: pick.missingBoms.join(', ') })}</p> : null}
                    <div className="overflow-x-auto rounded-lg border bg-card">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="p-3 text-left">{t('dermat_planning.store.store', 'Store')}</th>
                            <th className="p-3 text-left">{t('dermat_planning.store.material', 'Material')}</th>
                            <th className="p-3 text-right">{t('dermat_planning.store.needed', 'Needed')}</th>
                            <th className="p-3 text-right">{t('dermat_planning.store.reserved', 'Reserved')}</th>
                            <th className="p-3 text-left">{t('dermat_planning.store.batches', 'Take from batch')}</th>
                            <th className="p-3 text-left">{t('dermat_planning.store.gap', 'Not in store')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {pick.rows.map((row) => (
                            <tr key={row.productId} className={cn(row.notInStore > 0 && 'bg-status-error-bg/40')}>
                              <td className="p-3 text-xs">{row.store}</td>
                              <td className="p-3">
                                <span className="font-medium">{row.title}</span>
                                <div className="font-mono text-xs text-muted-foreground">{row.code ?? '—'} · {row.orders.map((order) => `${order.orderNo}: ${qty(order.required)}`).join(', ')}</div>
                              </td>
                              <td className="p-3 text-right font-mono tabular-nums">{qty(row.required)} <span className="text-xs text-muted-foreground">{row.unit}</span></td>
                              <td className="p-3 text-right font-mono tabular-nums">{row.reserved ? qty(row.reserved) : '—'}</td>
                              <td className="p-3 text-xs tabular-nums">
                                {row.pick.length ? row.pick.map((lot, index) => (
                                  <div key={`${lot.lotNumber}-${index}`}>
                                    <span className="font-mono">{lot.lotNumber ?? '—'}</span> · {qty(lot.quantity)} {row.unit}
                                    {lot.expiresAt ? <span className="text-muted-foreground"> · exp {lot.expiresAt.slice(0, 10)}</span> : null}
                                  </div>
                                )) : '—'}
                              </td>
                              <td className="p-3 text-xs">
                                {row.notInStore ? (
                                  <span className="text-status-error-text">
                                    {qty(row.notInStore)} {row.unit}
                                    {row.underTest || row.onOrder ? ` · ${qty(row.underTest)} in QC, ${qty(row.onOrder)} on PO` : ''}
                                    {row.heldForOthers ? ` · ${qty(row.heldForOthers)} in store but held for other orders` : ''}
                                  </span>
                                ) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </section>
            </div>
          )}
        </div>
      </PageBody>
    </Page>
  )
}
