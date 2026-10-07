"use client"

import * as React from 'react'
import { useGranted } from '../../cc_departments/components/useGranted'
import Link from 'next/link'
import { ArrowLeft, Undo2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { GRN_STATUS, HISTORY_LABEL, LINE_QC, day, qty, when, type GrnLineView, type GrnView } from './shared'

export function GrnPage({ grnId }: { grnId: string }) {
  const t = useT()
  const granted = useGranted()
  const canChange = !granted.ready || granted.has('cc_purchase.receive')
  const { runMutation } = useGuardedMutation({ contextId: `cc-grn-${grnId}` })
  const [grn, setGrn] = React.useState<GrnView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [returning, setReturning] = React.useState<GrnLineView | null>(null)
  const [holding, setHolding] = React.useState<GrnLineView | null>(null)
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<GrnView>(`/api/cc_purchase/grns?id=${encodeURIComponent(grnId)}`)
    if (!call.ok || !call.result) {
      setError(t('cc_purchase.grnDetail.loadError', 'Could not load this GRN.'))
      return
    }
    setGrn(call.result)
  }, [grnId, t])

  React.useEffect(() => {
    load()
  }, [load])

  const decide = async (line: GrnLineView, decision: 'passed' | 'failed', reason: string | null) => {
    if (!grn) return
    const body = { id: grn.id, lineId: line.id, decision, note: reason }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { grnId: grn.id },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(grn.updatedAt), () =>
            apiCall<GrnView & { error?: string }>('/api/cc_purchase/grns/decide', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
          ),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_purchase.grnDetail.decideError', 'Could not save the decision.'), 'error')
        await load()
        return
      }
      setGrn(call.result)
      setHolding(null)
      setNote('')
      flash(decision === 'passed' ? t('cc_purchase.grnDetail.passed', 'Passed. The batch is now usable stock.') : t('cc_purchase.grnDetail.held', 'On hold. It stays out of usable stock.'), 'success')
    } finally {
      setBusy(false)
    }
  }

  const submitReturn = async () => {
    if (!grn || !returning || !note.trim()) return
    const body = { id: grn.id, lineId: returning.id, note: note.trim() }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { grnId: grn.id },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(grn.updatedAt), () =>
            apiCall<GrnView & { error?: string }>('/api/cc_purchase/grns/return', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
          ),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_purchase.grnDetail.returnError', 'Could not return it.'), 'error')
        await load()
        return
      }
      setGrn(call.result)
      setReturning(null)
      setNote('')
      flash(t('cc_purchase.grnDetail.returned', 'Taken out of the store. The quantity is open again on the PO.'), 'success')
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={error} />
        </PageBody>
      </Page>
    )
  }
  if (!grn) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('cc_purchase.grnDetail.loading', 'Loading GRN…')} />
        </PageBody>
      </Page>
    )
  }

  const pending = grn.lines.filter((line) => line.qcStatus === 'pending').length
  const failed = grn.lines.filter((line) => line.qcStatus === 'failed').length

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-6 pb-16">
          <div className="space-y-3">
            <Link href="/backend/purchase/grns" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              {t('cc_purchase.grns.title', 'Goods receiving (GRN)')}
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-mono text-2xl font-bold tracking-tight">{grn.code}</h1>
              <StatusBadge variant={GRN_STATUS[grn.status].variant} dot>
                {GRN_STATUS[grn.status].label}
              </StatusBadge>
            </div>
            <p className="text-sm text-muted-foreground">
              {grn.vendorName} ·{' '}
              {grn.poId ? (
                <>
                  {t('cc_purchase.grnDetail.against', 'against')}{' '}
                  <Link href={`/backend/purchase/orders/${grn.poId}`} className="font-mono font-medium text-foreground hover:underline">
                    {grn.poCode}
                  </Link>
                </>
              ) : (
                <span className="font-medium text-foreground">{t('cc_purchase.grn.withoutPo', 'Without PO')}</span>
              )}{' '}
              · {day(grn.grnDate)}
            </p>
          </div>

          {pending ? (
            <Alert status="warning" style="lighter" className="rounded-lg">
              <AlertTitle>{t('cc_purchase.grnDetail.pendingTitle', '{count} batches under QC test', { count: pending })}</AlertTitle>
              <AlertDescription>{t('cc_purchase.grnDetail.pendingBody', 'They are in the store but cannot be reserved or issued until QC approves them.')}</AlertDescription>
            </Alert>
          ) : failed ? (
            <Alert status="error" style="lighter" className="rounded-lg">
              <AlertTitle>{t('cc_purchase.grnDetail.failedTitle', '{count} batches rejected by QC', { count: failed })}</AlertTitle>
              <AlertDescription>{t('cc_purchase.grnDetail.failedBody', 'They are on hold in the store. Return them to the vendor; the quantity opens again on the PO.')}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm lg:col-span-2">
              <div className="border-b border-border px-5 py-4">
                <h2 className="text-sm font-semibold">{t('cc_purchase.grnDetail.batches', 'Batches received')}</h2>
              </div>
              <ul className="divide-y divide-border">
                {grn.lines.map((line) => (
                  <li key={line.id} className="grid grid-cols-1 gap-3 px-5 py-4 md:grid-cols-12 md:items-center">
                    <div className="min-w-0 md:col-span-5">
                      <Link href={`/backend/products/${line.productId}`} className="font-medium hover:underline">
                        {line.title}
                      </Link>
                      <p className="font-mono text-xs text-muted-foreground">
                        {line.code ?? '—'} · {line.store === 'rm' ? 'RM-STORE' : 'PM-STORE'}
                      </p>
                    </div>
                    <div className="md:col-span-3">
                      <p className="text-sm font-semibold tabular-nums">{qty(line.quantity, line.unit)}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {t('cc_purchase.grnDetail.batch', 'Batch')} {line.lotNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {line.mfgDate ? `Mfg ${day(line.mfgDate)}` : ''}
                        {line.expiryDate ? ` · Exp ${day(line.expiryDate)}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 md:col-span-4 md:justify-end">
                      <div className="text-right">
                        <StatusBadge variant={LINE_QC[line.qcStatus].variant}>{LINE_QC[line.qcStatus].label}</StatusBadge>
                      </div>
                      {line.qcStatus === 'pending' && canChange ? (
                        <div className="flex gap-2">
                          <Button type="button" size="sm" disabled={busy} onClick={() => decide(line, 'passed', null)}>
                            {t('cc_purchase.grnDetail.pass', 'Pass')}
                          </Button>
                          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setHolding(line)}>
                            {t('cc_purchase.grnDetail.hold', 'Hold')}
                          </Button>
                        </div>
                      ) : null}
                      {line.qcStatus === 'failed' && canChange ? (
                        <Button type="button" size="sm" variant="outline" onClick={() => setReturning(line)}>
                          <Undo2 className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                          {t('cc_purchase.grnDetail.return', 'Return to vendor')}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <aside className="flex flex-col gap-6">
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">{t('cc_purchase.grn.invoice', 'Vendor invoice no.')}</dt>
                  <dd className="text-right font-mono">{grn.invoiceNo ?? '—'}</dd>
                  <dt className="text-muted-foreground">{t('cc_purchase.grn.invoiceDate', 'Invoice date')}</dt>
                  <dd className="text-right">{day(grn.invoiceDate)}</dd>
                  <dt className="text-muted-foreground">{t('cc_purchase.grnDetail.receivedBy', 'Received by')}</dt>
                  <dd className="text-right">{grn.receivedByName ?? '—'}</dd>
                </dl>
                {grn.notes ? <p className="mt-4 rounded-md bg-muted/50 p-3 text-sm">{grn.notes}</p> : null}
              </section>
              <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-semibold">{t('cc_purchase.detail.history', 'History')}</h2>
                <ol className="relative mt-4 space-y-4 border-l border-border pl-5">
                  {grn.history
                    .slice()
                    .reverse()
                    .map((entry, index) => (
                      <li key={`${entry.at}-${index}`} className="relative">
                        <span
                          className={cn('absolute -left-6 top-1 h-2.5 w-2.5 rounded-full ring-4 ring-card', entry.action === 'qc_failed' || entry.action === 'returned' ? 'bg-status-error-icon' : entry.action === 'qc_passed' ? 'bg-status-success-icon' : 'bg-accent-indigo')}
                          aria-hidden="true"
                        />
                        <p className="text-sm font-medium">{HISTORY_LABEL[entry.action] ?? entry.action}</p>
                        <p className="text-xs text-muted-foreground">
                          {entry.by ?? '—'} · {when(entry.at)}
                        </p>
                        {entry.note ? <p className="mt-0.5 text-xs">{entry.note}</p> : null}
                      </li>
                    ))}
                </ol>
              </section>
            </aside>
          </div>
        </div>

        <Dialog open={returning !== null} onOpenChange={(value) => (!value ? setReturning(null) : undefined)}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault()
                submitReturn()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('cc_purchase.grnDetail.returnTitle', 'Return to {vendor}', { vendor: grn.vendorName })}</DialogTitle>
              <DialogDescription>
                {returning ? t('cc_purchase.grnDetail.returnHint', '{qty} of {material}, batch {batch}, leaves the store. The PO shows it as still to come.', { qty: qty(returning.quantity, returning.unit), material: returning.title, batch: returning.lotNumber }) : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="grn-return-note">{t('cc_purchase.detail.reason', 'Reason *')}</Label>
              <Textarea id="grn-return-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('cc_purchase.grnDetail.returnPlaceholder', 'e.g. GSM below spec')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReturning(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" variant="destructive-solid" disabled={busy || !note.trim()} onClick={submitReturn}>
                {t('cc_purchase.grnDetail.returnConfirm', 'Return to vendor')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={holding !== null} onOpenChange={(value) => (!value ? setHolding(null) : undefined)}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && holding && note.trim()) {
                event.preventDefault()
                decide(holding, 'failed', note.trim())
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('cc_purchase.grnDetail.holdTitle', 'Put this batch on hold')}</DialogTitle>
              <DialogDescription>
                {holding ? t('cc_purchase.grnDetail.holdHint', '{qty} of {material}, batch {batch}, stays out of usable stock until it is passed or returned.', { qty: qty(holding.quantity, holding.unit), material: holding.title, batch: holding.lotNumber }) : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="grn-hold-note">{t('cc_purchase.detail.reason', 'Reason *')}</Label>
              <Textarea id="grn-hold-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('cc_purchase.grnDetail.holdPlaceholder', 'e.g. Phenol drum leaking, GSM below spec')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setHolding(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" variant="destructive-solid" disabled={busy || !note.trim()} onClick={() => holding && decide(holding, 'failed', note.trim())}>
                {t('cc_purchase.grnDetail.holdConfirm', 'Put on hold')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}

export default GrnPage
