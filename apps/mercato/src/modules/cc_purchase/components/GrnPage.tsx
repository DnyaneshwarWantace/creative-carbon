"use client"

import * as React from 'react'
import { useGranted } from '../../cc_departments/components/useGranted'
import Link from 'next/link'
import { Boxes, FileText, Printer, Undo2, Waypoints } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
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
import { GRN_STATUS, HISTORY_LABEL, LINE_QC, day, qty, when, type GrnLineView, type GrnView } from './shared'
import { PLACE_LABEL } from '../../cc_products/lib/stock'
import { DocLink, FieldList, LinkRows, Panel, RecordColumns, RecordPage, RecordState, type Fact } from '../../cc_ui/components/RecordPage'
import { recordHref, type DocumentLink } from '../../cc_ui/lib/links'
import { Timeline } from '../../cc_ui/components/Timeline'

type LotTrace = { lotId: string; lotNumber: string | null; usedBy: Array<{ document: DocumentLink; kg: number; at: string }> }

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
  const [traces, setTraces] = React.useState<LotTrace[] | null>(null)

  const load = React.useCallback(async () => {
    const call = await apiCall<GrnView>(`/api/cc_purchase/grns?id=${encodeURIComponent(grnId)}`)
    if (!call.ok || !call.result) {
      setError(t('cc_purchase.grnDetail.loadError', 'Could not load this GRN.'))
      return
    }
    setGrn(call.result)
    const lotIds = call.result.lines.map((line) => line.lotId).filter((id): id is string => Boolean(id))
    if (lotIds.length && granted.has('cc_store.view')) {
      const traceCall = await apiCall<{ items?: LotTrace[] }>(`/api/cc_production/records/trace?ids=${lotIds.join(',')}`, undefined, { fallback: { items: [] } })
      setTraces(traceCall.result?.items ?? [])
    } else setTraces([])
  }, [grnId, t, granted])

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

  if (error || !grn) return <RecordState error={error} loadingLabel={t('cc_purchase.grnDetail.loading', 'Loading GRN…')} />

  const pending = grn.lines.filter((line) => line.qcStatus === 'pending').length
  const failed = grn.lines.filter((line) => line.qcStatus === 'failed').length
  const passed = grn.lines.filter((line) => line.qcStatus === 'passed').length
  const used = (traces ?? []).flatMap((trace) => trace.usedBy.map((entry, index) => ({ key: `${trace.lotId}-${index}`, lotNumber: trace.lotNumber, ...entry })))
  const facts: Fact[] = [
    { label: t('cc_purchase.grnDetail.date', 'GRN date'), value: day(grn.grnDate) },
    { label: t('cc_purchase.grnDetail.lines', 'Batches'), value: String(grn.lines.length) },
    { label: t('cc_purchase.grnDetail.passedShort', 'Passed'), value: String(passed), tone: passed ? 'good' : undefined },
    { label: t('cc_purchase.grnDetail.underTest', 'Under QC test'), value: String(pending), tone: pending ? 'warn' : undefined },
    { label: t('cc_purchase.grnDetail.heldShort', 'On hold'), value: String(failed), tone: failed ? 'bad' : undefined },
    { label: t('cc_purchase.grn.vehicle', 'Vehicle / container no.'), value: grn.vehicleNo ?? '—' },
  ]

  return (
    <>
      <RecordPage
        back={{ href: '/backend/purchase/grns', label: t('cc_purchase.grns.title', 'Goods receiving (GRN)') }}
        overline={[t('cc_purchase.grnDetail.overline', 'Goods received'), grn.poCode ? t('cc_purchase.grnDetail.againstPo', 'against {po}', { po: grn.poCode }) : t('cc_purchase.grn.withoutPo', 'Without PO')].join(' · ')}
        title={grn.code}
        badges={
          <StatusBadge variant={GRN_STATUS[grn.status].variant} dot>
            {GRN_STATUS[grn.status].label}
          </StatusBadge>
        }
        meta={
          <>
            <Link className="underline-offset-2 hover:underline" href={recordHref.vendor(grn.vendorId)}>
              {grn.vendorName}
            </Link>
            {grn.receivedByName ? ` · ${t('cc_purchase.grnDetail.receivedByName', 'received by {name}', { name: grn.receivedByName })}` : ''}
          </>
        }
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('cc_purchase.grnDetail.print', 'Print')}
          </Button>
        }
        alert={
          pending ? (
            <Alert status="warning" style="lighter" className="rounded-md">
              <AlertTitle>{t('cc_purchase.grnDetail.pendingTitle', '{count} batches under QC test', { count: pending })}</AlertTitle>
              <AlertDescription>{t('cc_purchase.grnDetail.pendingBody', 'They are in the store but cannot be reserved or issued until QC approves them.')}</AlertDescription>
            </Alert>
          ) : failed ? (
            <Alert status="error" style="lighter" className="rounded-md">
              <AlertTitle>{t('cc_purchase.grnDetail.failedTitle', '{count} batches rejected by QC', { count: failed })}</AlertTitle>
              <AlertDescription>{t('cc_purchase.grnDetail.failedBody', 'They are on hold in the store. Return them to the vendor; the quantity opens again on the PO.')}</AlertDescription>
            </Alert>
          ) : null
        }
        facts={facts}
      >
        <RecordColumns
          main={
            <Panel title={t('cc_purchase.grnDetail.batches', 'Batches received')} icon={Boxes} count={grn.lines.length} flush>
              <ul className="divide-y divide-border">
                {grn.lines.map((line) => (
                  <li key={line.id} className="grid grid-cols-1 gap-3 px-3 py-3 even:bg-muted/30 md:grid-cols-12 md:items-center">
                    <div className="min-w-0 md:col-span-5">
                      <Link href={recordHref.product(line.productId)} className="font-medium hover:underline">
                        {line.title}
                      </Link>
                      <p className="font-mono text-xs text-muted-foreground">
                        {line.code ?? '—'} · {PLACE_LABEL[line.store]}
                      </p>
                    </div>
                    <div className="md:col-span-3">
                      <p className="font-mono text-sm font-semibold tabular-nums">{qty(line.quantity, line.unit)}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {t('cc_purchase.grnDetail.batch', 'Batch')}{' '}
                        {line.lotId ? (
                          <Link className="underline-offset-2 hover:underline" href={recordHref.lot(line.lotId)}>
                            {line.lotNumber}
                          </Link>
                        ) : (
                          line.lotNumber
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {line.mfgDate ? `Mfg ${day(line.mfgDate)}` : ''}
                        {line.expiryDate ? ` · Exp ${day(line.expiryDate)}` : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 md:col-span-4 md:justify-end">
                      <StatusBadge variant={LINE_QC[line.qcStatus].variant}>{LINE_QC[line.qcStatus].label}</StatusBadge>
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
            </Panel>
          }
          side={
            <>
              <Panel title={t('cc_purchase.grnDetail.paper', 'Vendor paperwork')} icon={FileText}>
                <FieldList
                  columns={1}
                  fields={[
                    [t('cc_purchase.grn.invoice', 'Vendor invoice no.'), grn.invoiceNo],
                    [t('cc_purchase.grn.invoiceDate', 'Invoice date'), grn.invoiceDate ? day(grn.invoiceDate) : null],
                    [t('cc_purchase.grn.vehicle', 'Vehicle / container no.'), grn.vehicleNo],
                    [
                      t('cc_purchase.grnDetail.po', 'Purchase order'),
                      grn.poId ? (
                        <Link key="po" className="underline-offset-2 hover:underline" href={recordHref.purchaseOrder(grn.poId)}>
                          {grn.poCode}
                        </Link>
                      ) : (
                        t('cc_purchase.grn.withoutPo', 'Without PO')
                      ),
                    ],
                  ]}
                />
                {grn.notes ? <p className="mt-3 rounded-md bg-muted/50 p-3 text-sm">{grn.notes}</p> : null}
              </Panel>
              <Panel title={t('cc_purchase.grnDetail.wentTo', 'Where these lots went')} icon={Waypoints} count={traces ? used.length : null} flush>
                <LinkRows
                  empty={traces ? t('cc_purchase.grnDetail.notUsed', 'Nothing taken from these lots yet.') : t('cc_purchase.grnDetail.loadingTrace', 'Loading…')}
                  rows={used.map((entry) => ({ key: entry.key, href: entry.document.href, primary: <DocLink doc={entry.document} />, secondary: `${entry.lotNumber ?? ''} · ${day(entry.at)}`, value: qty(entry.kg, '') }))}
                />
              </Panel>
            </>
          }
        />
        <Timeline type="grn" id={grn.id} refreshKey={grn.history.length} />
      </RecordPage>

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
    </>
  )
}

export default GrnPage
