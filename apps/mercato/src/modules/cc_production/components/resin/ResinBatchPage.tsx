"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Beaker, FlaskConical, Pencil, Printer, RotateCcw, Send, Signature, Trash2, TrendingUp, TriangleAlert, Waypoints } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
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
import { PLACE_LABEL, type StockPlace } from '../../../cc_products/lib/stock'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { HISTORY_LABEL, READINGS, RESIN_STATUS, STEP_LABELS, day, kg, when, type BatchView } from './shared'
import { Panel, PanelEmpty, RecordColumns, RecordPage, RecordState, RegisterGrid, type Fact } from '../../../cc_ui/components/RecordPage'
import { PlantChain } from '../../../cc_ui/components/PlantChain'
import { recordHref } from '../../../cc_ui/lib/links'
import { Timeline } from '../../../cc_ui/components/Timeline'

type Action = 'post' | 'fail' | 'reopen' | 'sign_chemist' | 'sign_incharge' | 'delete'

export function ResinBatchPage({ batchId }: { batchId: string }) {
  const t = useT()
  const router = useRouter()
  const granted = useGranted()
  const canEnter = granted.has('cc_production.resin.enter')
  const canSign = granted.has('cc_production.resin.sign')
  const { runMutation } = useGuardedMutation({ contextId: `cc-resin-${batchId}` })
  const [batch, setBatch] = React.useState<BatchView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [failing, setFailing] = React.useState(false)
  const [reason, setReason] = React.useState('')
  const [failReasons, setFailReasons] = React.useState<string[]>([])

  React.useEffect(() => {
    void apiCall<{ failReasons?: string[] }>('/api/cc_production/resin/setup').then((call) => setFailReasons(call.result?.failReasons ?? []))
  }, [])

  const load = React.useCallback(async () => {
    const call = await apiCall<BatchView>(`/api/cc_production/resin/batches?id=${encodeURIComponent(batchId)}`)
    if (!call.ok || !call.result) {
      setError(t('cc_production.resin.loadError', 'Could not load this batch.'))
      return
    }
    setBatch(call.result)
  }, [batchId, t])

  React.useEffect(() => {
    void load()
  }, [load])

  const act = async (action: Action, note?: string) => {
    if (!batch) return
    const body = { id: batch.id, action, ...(note ? { reason: note } : {}) }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { batchId: batch.id },
        mutationPayload: body,
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(batch.updatedAt), () =>
            apiCall<BatchView & { error?: string; ok?: boolean }>('/api/cc_production/resin/batches/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
          ),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_production.resin.actionError', 'Could not do that.'), 'error')
        await load()
        return
      }
      if (action === 'delete') {
        flash(t('cc_production.resin.deleted', 'Draft batch deleted.'), 'success')
        router.push('/backend/resin/batches')
        return
      }
      setBatch(call.result)
      setFailing(false)
      setReason('')
      const messages: Record<Exclude<Action, 'delete'>, string> = {
        post: t('cc_production.resin.posted', 'Posted. Chemicals are out of stock and the resin is in the resin tank.'),
        fail: t('cc_production.resin.failedDone', 'Marked failed. The chemicals are written off as scrap.'),
        reopen: t('cc_production.resin.reopened', 'Reopened. The stock movements are reversed; correct and post again.'),
        sign_chemist: t('cc_production.resin.signedChemist', 'Signed as chemist.'),
        sign_incharge: t('cc_production.resin.signedIncharge', 'Signed as in-charge.'),
      }
      flash(messages[action], 'success')
    } finally {
      setBusy(false)
    }
  }

  if (error || !batch) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />

  const status = RESIN_STATUS[batch.status]
  const delta = batch.yieldPct !== null && batch.compare.averagePct !== null ? Math.round((batch.yieldPct - batch.compare.averagePct) * 10) / 10 : null
  const facts: Fact[] = [
    { label: t('cc_production.resin.date', 'Date'), value: day(batch.batchDate) },
    {
      label: t('cc_production.resin.vessel', 'Vessel'),
      value: (
        <Link className="underline-offset-2 hover:underline" href={recordHref.machine('reactor', batch.reactorId)}>
          {batch.reactorCode}
        </Link>
      ),
    },
    { label: t('cc_production.resin.totalInput', 'Total input'), value: `${kg(batch.totalInputKg)} kg` },
    { label: t('cc_production.resin.yield', 'Resin yield (kg)'), value: `${kg(batch.yieldKg)} kg` },
    {
      label: t('cc_production.resin.yieldPct', 'Yield'),
      value: batch.yieldPct === null ? '—' : `${batch.yieldPct}%`,
      hint: delta !== null ? t('cc_production.resin.vsAverage', '{delta} pts vs average', { delta: delta >= 0 ? `+${delta}` : String(delta) }) : undefined,
      tone: delta === null ? undefined : delta < -2 ? 'bad' : delta < 0 ? 'warn' : 'good',
    },
    { label: t('cc_production.resin.water', 'Water removed (kg)'), value: kg(batch.waterRemovedKg) },
  ]
  const signoffs: Array<[Action, string, string | null, string | null]> = [
    ['sign_chemist', t('cc_production.resin.chemist', 'Chemist'), batch.chemistSign, batch.chemistSignedAt],
    ['sign_incharge', t('cc_production.resin.incharge', 'In-charge'), batch.inchargeSign, batch.inchargeSignedAt],
  ]

  return (
    <>
      <RecordPage
        back={{ href: '/backend/resin/batches', label: t('cc_production.resin.title', 'Resin batches') }}
        overline={`CCCPL/F/QC/03 · ${batch.grade}`}
        title={batch.batchNo}
        badges={
          <StatusBadge variant={status.variant} dot>
            {status.label}
          </StatusBadge>
        }
        meta={batch.postedAt ? t('cc_production.resin.postedBy', 'by {name} · {at}', { name: batch.postedByName ?? '—', at: when(batch.postedAt) }) : undefined}
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.resin.print', 'Print')}
            </Button>
            {canEnter && batch.status === 'draft' ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/backend/resin/batches/${batch.id}/edit`}>
                    <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.resin.edit', 'Edit')}
                  </Link>
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act('delete')}>
                  <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.resin.delete', 'Delete draft')}
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setFailing(true)}>
                  <TriangleAlert className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.resin.fail', 'Batch failed')}
                </Button>
                <Button type="button" size="sm" disabled={busy} onClick={() => void act('post')}>
                  <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.resin.post', 'Post')}
                </Button>
              </>
            ) : null}
            {canEnter && batch.canReopen ? (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act('reopen')}>
                <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.resin.reopen', 'Reopen')}
              </Button>
            ) : null}
          </>
        }
        alert={
          batch.status === 'failed' ? (
            <Alert variant="destructive">
              <AlertTitle>{t('cc_production.resin.failedTitle', 'Failed batch')}</AlertTitle>
              <AlertDescription>{batch.failReason}</AlertDescription>
            </Alert>
          ) : null
        }
        chain={<PlantChain current="resin" hrefs={{ coating: batch.wentTo[0] ? recordHref.coatingSheet(batch.wentTo[0].id) : null }} />}
        facts={facts}
      >
        <RecordColumns
          main={
            <>
              <Panel title={t('cc_production.resin.cameFrom', 'Materials · came from')} icon={Beaker} count={batch.materials.length} flush>
                <RegisterGrid
                  rows={batch.materials}
                  rowKey={(line) => line.productId}
                  rowHref={(line) => recordHref.product(line.productId)}
                  empty={t('cc_production.resin.noMaterials', 'No materials on this batch.')}
                  columns={[
                    { key: 'material', label: t('cc_production.resin.material', 'Material'), render: (line) => line.title },
                    {
                      key: 'lots',
                      label: t('cc_production.resin.lots', 'Lots used'),
                      render: (line) =>
                        line.lots.length ? (
                          <span className="flex flex-col gap-0.5 text-xs">
                            {line.lots.map((lot) => (
                              <span key={lot.lotId}>
                                <Link className="font-mono underline-offset-2 hover:underline" href={recordHref.lot(lot.lotId)}>
                                  {lot.lotNumber ?? '—'}
                                </Link>
                                {' · '}
                                {kg(lot.kg)} kg · {PLACE_LABEL[lot.place as StockPlace] ?? lot.place}
                                {lot.grnId ? (
                                  <>
                                    {' · '}
                                    <Link className="font-mono underline-offset-2 hover:underline" href={recordHref.grn(lot.grnId)}>
                                      {lot.grnCode}
                                    </Link>
                                  </>
                                ) : null}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">{batch.status === 'draft' ? t('cc_production.resin.pickedOnPost', 'Picked when posted (oldest lot first)') : '—'}</span>
                        ),
                    },
                    { key: 'kg', label: 'kg', align: 'right', render: (line) => kg(line.kg), total: kg(batch.totalInputKg) },
                  ]}
                />
              </Panel>

              <Panel title={t('cc_production.resin.process', 'Process')} icon={FlaskConical}>
                <dl className="grid grid-cols-1 gap-x-8 text-sm md:grid-cols-2">
                  {STEP_LABELS.map((step) => (
                    <div key={step.key} className="flex justify-between gap-3 border-b border-dashed border-border py-1.5">
                      <dt className="text-muted-foreground">
                        {step.no}. {step.label}
                      </dt>
                      <dd className="font-mono">
                        {batch.process.steps[step.key]?.done ? '✓' : '—'}
                        {batch.process.steps[step.key]?.ph !== null && batch.process.steps[step.key]?.ph !== undefined ? ` · pH ${batch.process.steps[step.key].ph}` : ''}
                      </dd>
                    </div>
                  ))}
                  {READINGS.map((reading) => (
                    <div key={reading.key} className="flex justify-between gap-3 border-b border-dashed border-border py-1.5">
                      <dt className="text-muted-foreground">
                        {reading.no}. {reading.label}
                      </dt>
                      <dd className="font-mono tabular-nums">
                        {batch.process[reading.key].tempC ?? '—'} °C {batch.process[reading.key].time ? `at ${batch.process[reading.key].time}` : ''}
                      </dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3 border-b border-dashed border-border py-1.5">
                    <dt className="text-muted-foreground">11. {t('cc_production.resin.gelChecked', 'Gel time checked on hot plate')}</dt>
                    <dd className="font-mono">{batch.process.gelChecked ? '✓' : '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-b border-dashed border-border py-1.5">
                    <dt className="text-muted-foreground">12. {t('cc_production.resin.vacuum', 'Water removal under vacuum starts at')}</dt>
                    <dd className="font-mono">{batch.process.vacuumStart ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-b border-dashed border-border py-1.5">
                    <dt className="text-muted-foreground">13. {t('cc_production.resin.coolingShort', 'Cooling time to 35–45 °C')}</dt>
                    <dd className="font-mono">{batch.process.coolingDuration ?? '—'}</dd>
                  </div>
                  <div className="flex justify-between gap-3 border-b border-dashed border-border py-1.5 md:col-span-2">
                    <dt className="text-muted-foreground">14. {t('cc_production.resin.tests', 'Tests')}</dt>
                    <dd className="font-mono tabular-nums">
                      pH {batch.tests.ph ?? '—'} · {t('cc_production.resin.gel', 'gel')} {batch.tests.gelTimeSec ?? '—'} s · {t('cc_production.resin.visc', 'visc.')} {batch.tests.viscositySec ?? '—'} s · {t('cc_production.resin.solidShort', 'solids')} {batch.tests.solidPct ?? '—'}%
                    </dd>
                  </div>
                </dl>
                {batch.notes ? <p className="mt-3 text-sm text-muted-foreground">{batch.notes}</p> : null}
              </Panel>
            </>
          }
          side={
            <>
              <Panel title={t('cc_production.resin.signoffs', 'Sign-offs')} icon={Signature} flush>
                <ul className="divide-y divide-border">
                  {signoffs.map(([action, label, name, at]) => (
                    <li key={action} className="flex items-center justify-between gap-3 px-3 py-2">
                      <span>
                        <span className="block font-mono text-overline uppercase tracking-widest text-muted-foreground">{label}</span>
                        <span className="text-sm font-medium">{name ? `${name} · ${when(at)}` : t('cc_production.resin.notSigned', 'Not signed')}</span>
                      </span>
                      {canSign && !name ? (
                        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act(action)}>
                          <Signature className="mr-1.5 h-4 w-4" aria-hidden="true" />
                          {t('cc_production.resin.sign', 'Sign')}
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Panel>

              <Panel title={t('cc_production.resin.wentTo', 'Went to')} icon={Waypoints} flush>
                {batch.resin ? (
                  <p className="border-b border-border px-3 py-2 text-sm">
                    <Link className="font-mono underline-offset-2 hover:underline" href={recordHref.lot(batch.resin.lotId)}>
                      {batch.resin.lotNumber ?? '—'}
                    </Link>{' '}
                    {t('cc_production.resin.inTankShort', 'in the resin tank: {left} kg left of {made} kg', { left: kg(batch.resin.leftKg), made: kg(batch.yieldKg) })}
                  </p>
                ) : (
                  <PanelEmpty>{batch.status === 'failed' ? t('cc_production.resin.noResin', 'No resin came out of this batch.') : t('cc_production.resin.notPostedYet', 'Not posted yet.')}</PanelEmpty>
                )}
                {batch.wentTo.length ? (
                  <ul className="divide-y divide-border text-sm">
                    {batch.wentTo.map((entry) => (
                      <li key={`${entry.id}-${entry.label}`} className="even:bg-muted/30">
                        <Link className="flex justify-between gap-3 px-3 py-2 hover:bg-muted/60" href={recordHref.coatingSheet(entry.id)}>
                          <span>{entry.label}</span>
                          <span className="font-mono tabular-nums">{kg(entry.kg)} kg</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : batch.resin ? (
                  <PanelEmpty>{t('cc_production.resin.noCoating', 'No coating run has used it yet.')}</PanelEmpty>
                ) : null}
              </Panel>

              <Panel title={t('cc_production.resin.compare', 'Yield against the last 10 {grade} batches', { grade: batch.grade })} icon={TrendingUp} flush>
                {batch.compare.batches.length ? (
                  <>
                    <p className="border-b border-border px-3 py-2 text-sm">
                      {t('cc_production.resin.average', 'Average {avg}%', { avg: batch.compare.averagePct ?? '—' })}
                      {delta !== null ? <span className="ml-2 font-mono font-semibold">{delta >= 0 ? `+${delta}` : delta} pts</span> : null}
                    </p>
                    <ul className="divide-y divide-border text-xs">
                      {batch.compare.batches.map((entry) => (
                        <li key={entry.id} className="even:bg-muted/30">
                          <Link className="flex justify-between px-3 py-1.5 hover:bg-muted/60" href={recordHref.resinBatch(entry.id)}>
                            <span className="font-mono">{entry.batchNo}</span>
                            <span className="font-mono tabular-nums">{entry.yieldPct === null ? '—' : `${entry.yieldPct}%`}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <PanelEmpty>{t('cc_production.resin.noCompare', 'No earlier posted batches of this grade.')}</PanelEmpty>
                )}
              </Panel>
            </>
          }
        />
        <Timeline type="resin_batch" id={batch.id} refreshKey={batch.history.length} footer={batch.reopenUntil && batch.canReopen ? t('cc_production.resin.reopenUntil', 'Can be reopened until {at}.', { at: when(batch.reopenUntil) }) : undefined} />
      </RecordPage>

        <Dialog open={failing} onOpenChange={(open) => !open && setFailing(false)}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && reason.trim()) void act('fail', reason.trim())
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('cc_production.resin.failTitle', 'Mark this batch failed?')}</DialogTitle>
              <DialogDescription>{t('cc_production.resin.failHint', 'All chemicals charged are taken out of stock as scrap. No resin goes into the tank.')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="resin-fail-reason">{t('cc_production.resin.failReason', 'What happened')}</Label>
              <div className="flex flex-wrap gap-1.5">
                {failReasons.map((option) => (
                  <Button key={option} type="button" size="sm" variant={reason === option ? 'default' : 'outline'} onClick={() => setReason(option)}>
                    {option}
                  </Button>
                ))}
              </div>
              <Textarea id="resin-fail-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('cc_production.resin.failPlaceholder', 'e.g. Reactor jammed')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setFailing(false)}>
                {t('cc_production.resin.cancel', 'Cancel')}
              </Button>
              <Button type="button" variant="destructive" disabled={busy || !reason.trim()} onClick={() => void act('fail', reason.trim())}>
                {t('cc_production.resin.confirmFail', 'Mark failed')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </>
  )
}

export default ResinBatchPage
