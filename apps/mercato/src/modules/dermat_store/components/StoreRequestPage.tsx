"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, CircleSlash, ExternalLink, PackageOpen, Send, Undo2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { StepIndicator } from '@open-mercato/ui/primitives/step-indicator'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import {
  HISTORY_LABEL,
  Meter,
  STATUS_LABEL,
  STATUS_VARIANT,
  StageIcon,
  StockRoute,
  journey,
  qty,
  when,
  type LineView,
  type RequestView,
} from './shared'

type IssueDraft = Record<string, { lotId: string; quantity: string }>
type Dialogs = 'return' | 'cancel' | null

const ANY_LOT = '__any__'

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function openQty(line: LineView): number {
  return round(Math.max(0, line.required - line.issued))
}

function availableFor(line: LineView): number {
  return round(Math.max(0, line.free))
}

export function StoreRequestPage({ requestId }: { requestId: string }) {
  const t = useT()
  const { runMutation } = useGuardedMutation({ contextId: `dermat-store-request-${requestId}` })
  const [request, setRequest] = React.useState<RequestView | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [issuing, setIssuing] = React.useState(false)
  const [draft, setDraft] = React.useState<IssueDraft>({})
  const [returns, setReturns] = React.useState<Record<string, string>>({})
  const [note, setNote] = React.useState('')
  const [dialog, setDialog] = React.useState<Dialogs>(null)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<RequestView>(`/api/dermat_store/requests?id=${encodeURIComponent(requestId)}`)
    if (!call.ok || !call.result) {
      setLoadError(t('dermat_store.detail.loadError', 'Could not load this store request.'))
      return
    }
    setRequest(call.result)
  }, [requestId, t])

  React.useEffect(() => {
    load()
  }, [load])

  const startIssue = () => {
    if (!request) return
    const next: IssueDraft = {}
    for (const line of request.lines) {
      const open = openQty(line)
      if (open <= 0) continue
      next[line.id] = { lotId: ANY_LOT, quantity: String(round(Math.min(open, availableFor(line)))) }
    }
    setDraft(next)
    setIssuing(true)
  }

  const act = async (path: string, body: Record<string, unknown>, done: string): Promise<boolean> => {
    if (!request) return false
    setBusy(true)
    try {
      const call = await runMutation({
        context: { requestId: request.id, path },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(request.updatedAt), () =>
            apiCall<RequestView & { error?: string }>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: request.id, ...body }) }),
          ),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(
          call.status === 409 && !call.result?.error
            ? t('dermat_store.detail.conflict', 'Someone else changed this request. It has been reloaded.')
            : call.result?.error ?? t('dermat_store.detail.actionError', 'That did not work. Try again.'),
          'error',
        )
        await load()
        return false
      }
      setRequest(call.result)
      flash(done, 'success')
      return true
    } catch {
      flash(t('dermat_store.detail.actionError', 'That did not work. Try again.'), 'error')
      return false
    } finally {
      setBusy(false)
    }
  }

  const submitIssue = async () => {
    const lines = Object.entries(draft)
      .map(([lineId, entry]) => ({ lineId, quantity: Number(entry.quantity), ...(entry.lotId !== ANY_LOT ? { lotId: entry.lotId } : {}) }))
      .filter((entry) => Number.isFinite(entry.quantity) && entry.quantity > 0)
    if (!lines.length) {
      flash(t('dermat_store.detail.nothingToIssue', 'Enter a quantity on at least one line.'), 'error')
      return
    }
    if (await act('/api/dermat_store/requests/issue', { lines, note: note.trim() || null }, t('dermat_store.detail.issued', 'Issued. Stock moved to PRODUCTION.'))) {
      setIssuing(false)
      setNote('')
    }
  }

  const submitReturn = async () => {
    const lines = Object.entries(returns)
      .map(([lineId, value]) => ({ lineId, quantity: Number(value) }))
      .filter((entry) => Number.isFinite(entry.quantity) && entry.quantity > 0)
    if (!lines.length || !note.trim()) {
      flash(t('dermat_store.detail.returnNeeds', 'Enter what goes back and why.'), 'error')
      return
    }
    if (await act('/api/dermat_store/requests/return', { lines, note: note.trim() }, t('dermat_store.detail.returned', 'Returned to the store.'))) {
      setDialog(null)
      setReturns({})
      setNote('')
    }
  }

  const submitCancel = async () => {
    if (!note.trim()) {
      flash(t('dermat_store.detail.cancelNeeds', 'Write why it is cancelled.'), 'error')
      return
    }
    if (await act('/api/dermat_store/requests/cancel', { note: note.trim() }, t('dermat_store.detail.cancelled', 'Request cancelled.'))) {
      setDialog(null)
      setNote('')
    }
  }

  if (loadError) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={loadError} />
        </PageBody>
      </Page>
    )
  }
  if (!request) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dermat_store.detail.loading', 'Loading store request…')} />
        </PageBody>
      </Page>
    )
  }

  const closed = request.status === 'used' || request.status === 'cancelled'
  const canIssue = !closed && request.lines.some((line) => openQty(line) > 0)
  const withProduction = request.lines.some((line) => line.withProduction > 0)
  const nothingIssued = request.lines.every((line) => line.issued <= 0)
  const totalRequired = request.lines.length
  const fullyIssued = request.lines.filter((line) => openQty(line) <= 0).length

  const banner = (() => {
    if (request.status === 'cancelled')
      return { status: 'error' as const, title: t('dermat_store.banner.cancelled', 'Cancelled'), body: request.history.at(-1)?.note ?? '' }
    if (request.status === 'used')
      return {
        status: 'success' as const,
        title: t('dermat_store.banner.used', 'Used in production'),
        body: t('dermat_store.banner.usedBody', 'Recorded when {stage} was completed on {date}. Production stock was reduced by what was used.', { stage: request.stageLabel, date: when(request.usedAt) }),
      }
    if (request.awaitingReceipt)
      return {
        status: 'information' as const,
        title: t('dermat_store.banner.awaiting', 'Sent by the store: production must confirm'),
        body: t('dermat_store.banner.awaitingBody', 'Check the material that arrived and press "Confirm received". {stage} cannot be completed until then.', { stage: request.stageLabel }),
      }
    if (request.status === 'received')
      return {
        status: 'success' as const,
        title: t('dermat_store.banner.received', 'Production has the material'),
        body: t('dermat_store.banner.receivedBody', 'It is marked as used automatically when {stage} is completed. Return anything left over before that.', { stage: request.stageLabel }),
      }
    if (request.status === 'partly_issued')
      return {
        status: 'warning' as const,
        title: t('dermat_store.banner.partly', 'Partly issued'),
        body: t('dermat_store.banner.partlyBody', 'Production has confirmed what was sent. The rest stays open until the store issues it.'),
      }
    return {
      status: 'warning' as const,
      title: t('dermat_store.banner.waiting', 'Waiting for the {store}', { store: request.storeLabel }),
      body: t('dermat_store.banner.waitingBody', 'Pick a batch and issue. Stock leaves the store the moment you issue it.'),
    }
  })()

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-16">
          <div className="space-y-4">
            <Link href="/backend/store/requests" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              {t('dermat_store.nav.requests', 'Store requests')}
            </Link>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-card shadow-xs">
                  <StageIcon stageKey={request.stageKey} className="h-5 w-5 text-muted-foreground" />
                </span>
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="font-mono text-2xl font-bold tracking-tight">{request.code}</h1>
                    <StatusBadge variant={STATUS_VARIANT[request.status]} dot>
                      {request.awaitingReceipt && request.status !== 'requested' ? t('dermat_store.status.awaiting', 'Sent · not received') : STATUS_LABEL[request.status]}
                    </StatusBadge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {t('dermat_store.detail.for', 'For')}{' '}
                    <Link href={`/backend/orders/${request.orderId}`} className="font-medium text-foreground hover:underline">
                      {request.orderNo}
                    </Link>{' '}
                    · {request.stageLabel} · {request.storeLabel}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {nothingIssued && !closed ? (
                  <Button type="button" variant="ghost" onClick={() => setDialog('cancel')} disabled={busy}>
                    <CircleSlash className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('dermat_store.detail.cancel', 'Cancel request')}
                  </Button>
                ) : null}
                {withProduction && !closed ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setReturns({})
                      setDialog('return')
                    }}
                    disabled={busy}
                  >
                    <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('dermat_store.detail.return', 'Return leftover')}
                  </Button>
                ) : null}
                {canIssue && !issuing ? (
                  <Button type="button" variant={request.awaitingReceipt ? 'outline' : 'default'} onClick={startIssue} disabled={busy}>
                    <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('dermat_store.detail.issue', 'Issue material')}
                  </Button>
                ) : null}
                {request.awaitingReceipt && !closed ? (
                  <Button type="button" onClick={() => act('/api/dermat_store/requests/receive', {}, t('dermat_store.detail.receivedFlash', 'Marked as received.'))} disabled={busy}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('dermat_store.detail.receive', 'Confirm received')}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>

          <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <StepIndicator steps={journey(request.status, request.awaitingReceipt)} className="min-w-0 flex-1 overflow-x-auto" />
            <div className="flex shrink-0 flex-col gap-1 lg:items-end">
              <span className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('dermat_store.detail.stockMove', 'Stock moves')}</span>
              <StockRoute store={request.store} />
            </div>
          </section>

          <Alert status={banner.status} style="lighter" className="rounded-lg">
            <AlertTitle>{banner.title}</AlertTitle>
            {banner.body ? <AlertDescription>{banner.body}</AlertDescription> : null}
          </Alert>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
                <div>
                  <h2 className="text-sm font-semibold">{t('dermat_store.detail.materials', 'Materials')}</h2>
                  <p className="text-xs text-muted-foreground">
                    {t('dermat_store.detail.linesDone', '{done} of {total} lines fully issued', { done: fullyIssued, total: totalRequired })}
                  </p>
                </div>
                <Meter className="w-40" value={fullyIssued} max={totalRequired} tone={fullyIssued === totalRequired ? 'success' : 'accent'} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-left text-overline font-semibold uppercase tracking-widest text-muted-foreground">
                    <tr>
                      <th className="px-5 py-2.5">{t('dermat_store.detail.material', 'Material')}</th>
                      <th className="px-3 py-2.5 text-right">{t('dermat_store.detail.needed', 'Needed')}</th>
                      <th className="w-40 px-3 py-2.5">{t('dermat_store.detail.issuedCol', 'Issued')}</th>
                      {issuing ? (
                        <>
                          <th className="w-48 px-3 py-2.5">{t('dermat_store.detail.batch', 'Batch')}</th>
                          <th className="w-32 px-5 py-2.5">{t('dermat_store.detail.issueNow', 'Issue now')}</th>
                        </>
                      ) : (
                        <>
                          <th className="px-3 py-2.5 text-right">{t('dermat_store.detail.withProduction', 'With production')}</th>
                          <th className="px-5 py-2.5 text-right">{t('dermat_store.detail.inStore', 'In store')}</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {request.lines.map((line) => {
                      const open = openQty(line)
                      const entry = draft[line.id]
                      return (
                        <tr key={line.id} className="align-top">
                          <td className="px-5 py-3.5">
                            <p className="font-medium">{line.title}</p>
                            <p className="font-mono text-xs text-muted-foreground">{line.code ?? '—'}</p>
                            {line.issues.length ? (
                              <ul className="mt-1.5 space-y-0.5">
                                {line.issues.map((issue, index) => (
                                  <li key={`${issue.at}-${index}`} className="text-xs text-muted-foreground">
                                    {qty(issue.quantity, line.unit)} · {t('dermat_store.detail.batchShort', 'batch')} {issue.lotNumber ?? '—'} · {when(issue.at)}
                                    {issue.returned ? ` · ${qty(issue.returned, line.unit)} ${t('dermat_store.detail.back', 'back')}` : ''}
                                    {issue.used ? ` · ${qty(issue.used, line.unit)} ${t('dermat_store.detail.usedShort', 'used')}` : ''}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </td>
                          <td className="px-3 py-3.5 text-right tabular-nums">{qty(line.required, line.unit)}</td>
                          <td className="px-3 py-3.5">
                            <div className="flex items-center justify-between text-xs tabular-nums">
                              <span>{qty(line.issued)}</span>
                              {open > 0 ? (
                                <span className="text-status-warning-text">
                                  {qty(open)} {t('dermat_store.detail.open', 'open')}
                                </span>
                              ) : (
                                <span className="text-status-success-text">{t('dermat_store.detail.full', 'full')}</span>
                              )}
                            </div>
                            <Meter className="mt-1.5" value={line.issued} max={line.required} tone={open > 0 ? 'accent' : 'success'} />
                          </td>
                          {issuing ? (
                            <>
                              <td className="px-3 py-3">
                                {open > 0 && entry ? (
                                  <Select value={entry.lotId} onValueChange={(value) => setDraft((prev) => ({ ...prev, [line.id]: { ...prev[line.id], lotId: value } }))}>
                                    <SelectTrigger className="h-9" aria-label={t('dermat_store.detail.batch', 'Batch')}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value={ANY_LOT}>{t('dermat_store.detail.anyBatch', 'Oldest batch first')}</SelectItem>
                                      {line.lots.map((lot) =>
                                        lot.lotId ? (
                                          <SelectItem key={lot.lotId} value={lot.lotId}>
                                            {lot.lotNumber ?? '—'} · {qty(lot.onHand, line.unit)}
                                          </SelectItem>
                                        ) : null,
                                      )}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <span className="text-xs text-muted-foreground">{t('dermat_store.detail.nothingOpen', 'Nothing open')}</span>
                                )}
                              </td>
                              <td className="px-5 py-3">
                                {open > 0 && entry ? (
                                  <div className="space-y-1">
                                    <Input
                                      id={`issue-${line.id}`}
                                      aria-label={t('dermat_store.detail.issueNow', 'Issue now')}
                                      className="h-9 text-right tabular-nums"
                                      inputMode="decimal"
                                      value={entry.quantity}
                                      onChange={(event) => setDraft((prev) => ({ ...prev, [line.id]: { ...prev[line.id], quantity: event.target.value } }))}
                                    />
                                    <p className="text-right text-xs text-muted-foreground">
                                      {t('dermat_store.detail.canGive', 'can give {qty}', { qty: qty(availableFor(line), line.unit) })}
                                    </p>
                                  </div>
                                ) : null}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="px-3 py-3.5 text-right tabular-nums">
                                {qty(line.withProduction, line.unit)}
                                {line.used ? <p className="text-xs text-muted-foreground">{qty(line.used)} {t('dermat_store.detail.usedShort', 'used')}</p> : null}
                                {line.returned ? <p className="text-xs text-muted-foreground">{qty(line.returned)} {t('dermat_store.detail.back', 'back')}</p> : null}
                              </td>
                              <td className="px-5 py-3.5 text-right tabular-nums">
                                <span className={cn(line.inStore < open && 'text-status-error-text')}>{qty(line.inStore, line.unit)}</span>
                                {line.reservedForOrder > 0 ? (
                                  <p className="text-xs text-muted-foreground">
                                    {qty(line.reservedForOrder)} {t('dermat_store.detail.reserved', 'reserved for this order')}
                                  </p>
                                ) : null}
                                {line.heldByOthers.length ? (
                                  <p className="text-xs text-status-warning-text">
                                    {t('dermat_store.detail.heldBy', '{qty} held for {orders}', {
                                      qty: qty(line.heldByOthers.reduce((sum, holder) => sum + holder.quantity, 0)),
                                      orders: line.heldByOthers.map((holder) => holder.orderNo).join(', '),
                                    })}
                                  </p>
                                ) : null}
                              </td>
                            </>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              {issuing ? (
                <div
                  className="flex flex-col gap-3 border-t border-border bg-muted/30 px-5 py-4 sm:flex-row sm:items-end"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submitIssue()
                    if (event.key === 'Escape') setIssuing(false)
                  }}
                >
                  <div className="flex-1 space-y-1.5">
                    <Label htmlFor="issue-note" className="text-xs text-muted-foreground">
                      {t('dermat_store.detail.issueNote', 'Note for production (optional)')}
                    </Label>
                    <Input id="issue-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('dermat_store.detail.issueNotePlaceholder', 'e.g. 2 kg short, rest on Monday')} />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setIssuing(false)} disabled={busy}>
                      {t('common.cancel', 'Cancel')}
                    </Button>
                    <Button type="button" onClick={submitIssue} disabled={busy}>
                      <PackageOpen className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {busy ? t('dermat_store.detail.issuing', 'Issuing…') : t('dermat_store.detail.issueConfirm', 'Issue and move stock')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>

            <aside className="flex flex-col gap-6">
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-semibold">{t('dermat_store.detail.order', 'Order')}</h2>
                <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">{t('dermat_store.detail.orderNo', 'Order')}</dt>
                  <dd className="text-right">
                    <Link href={`/backend/orders/${request.orderId}`} className="font-medium hover:underline">
                      {request.orderNo}
                    </Link>
                  </dd>
                  <dt className="text-muted-foreground">{t('dermat_store.detail.stage', 'Stage')}</dt>
                  <dd className="text-right">
                    <Link href={`/backend/orders/${request.orderId}/stages/${request.stageKey}`} className="inline-flex items-center gap-1 font-medium hover:underline">
                      {request.stageLabel}
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  </dd>
                  <dt className="text-muted-foreground">{t('dermat_store.detail.askedBy', 'Asked by')}</dt>
                  <dd className="text-right">{request.requestedByName ?? '—'}</dd>
                  <dt className="text-muted-foreground">{t('dermat_store.detail.askedOn', 'Asked on')}</dt>
                  <dd className="text-right tabular-nums">{when(request.createdAt)}</dd>
                  <dt className="text-muted-foreground">{t('dermat_store.detail.receivedBy', 'Received by')}</dt>
                  <dd className="text-right">{request.receivedByName ? `${request.receivedByName}` : '—'}</dd>
                </dl>
                {request.notes ? <p className="mt-4 rounded-md bg-muted/50 p-3 text-sm">{request.notes}</p> : null}
              </section>

              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-semibold">{t('dermat_store.detail.history', 'History')}</h2>
                <ol className="relative mt-4 space-y-4 border-l border-border pl-5">
                  {request.history
                    .slice()
                    .reverse()
                    .map((entry, index) => (
                      <li key={`${entry.at}-${index}`} className="relative">
                        <span
                          className={cn(
                            'absolute -left-6 top-1 h-2.5 w-2.5 rounded-full ring-4 ring-card',
                            entry.action === 'cancelled' ? 'bg-status-error-icon' : entry.action === 'received' || entry.action === 'used' ? 'bg-status-success-icon' : 'bg-accent-indigo',
                          )}
                          aria-hidden="true"
                        />
                        <p className="text-sm font-medium">{HISTORY_LABEL[entry.action] ?? entry.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.by ?? t('dermat_store.detail.system', 'System')} · {when(entry.at)}
                        </p>
                        {entry.note ? <p className="mt-1 text-xs">{entry.note}</p> : null}
                      </li>
                    ))}
                </ol>
              </section>
            </aside>
          </div>
        </div>

        <Dialog open={dialog !== null} onOpenChange={(open) => (!open ? setDialog(null) : undefined)}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                if (dialog === 'return') submitReturn()
                if (dialog === 'cancel') submitCancel()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{dialog === 'return' ? t('dermat_store.detail.returnTitle', 'Return leftover to the store') : t('dermat_store.detail.cancelTitle', 'Cancel this request')}</DialogTitle>
              <DialogDescription>
                {dialog === 'return'
                  ? t('dermat_store.detail.returnHint', 'Stock moves back from PRODUCTION to the {store}, to the same batch.', { store: request.storeLabel })
                  : t('dermat_store.detail.cancelHint', 'Only possible while the store has issued nothing.')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {dialog === 'return'
                ? request.lines
                    .filter((line) => line.withProduction > 0)
                    .map((line) => (
                      <div key={line.id} className="flex items-center justify-between gap-4">
                        <Label htmlFor={`return-${line.id}`} className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{line.title}</span>
                          <span className="block text-xs text-muted-foreground">
                            {t('dermat_store.detail.holds', 'Production holds {qty}', { qty: qty(line.withProduction, line.unit) })}
                          </span>
                        </Label>
                        <Input
                          id={`return-${line.id}`}
                          className="w-28 text-right tabular-nums"
                          inputMode="decimal"
                          value={returns[line.id] ?? ''}
                          placeholder="0"
                          onChange={(event) => setReturns((prev) => ({ ...prev, [line.id]: event.target.value }))}
                        />
                      </div>
                    ))
                : null}
              <div className="space-y-1.5">
                <Label htmlFor="store-dialog-note">{t('dermat_store.detail.reason', 'Reason *')}</Label>
                <Textarea id="store-dialog-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)} disabled={busy}>
                {t('common.cancel', 'Cancel')}
              </Button>
              {dialog === 'return' ? (
                <Button type="button" onClick={submitReturn} disabled={busy}>
                  {t('dermat_store.detail.returnConfirm', 'Return to store')}
                </Button>
              ) : (
                <Button type="button" variant="destructive-solid" onClick={submitCancel} disabled={busy}>
                  {t('dermat_store.detail.cancelConfirm', 'Cancel request')}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}

export default StoreRequestPage
