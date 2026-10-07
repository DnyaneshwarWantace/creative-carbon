"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Pencil, Printer, RotateCcw, Send, Signature, Trash2, TriangleAlert } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { PLACE_LABEL, type StockPlace } from '../../../cc_products/lib/stock'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { HISTORY_LABEL, READINGS, RESIN_STATUS, STEP_LABELS, day, kg, when, type BatchView } from './shared'

type Action = 'post' | 'fail' | 'reopen' | 'sign_chemist' | 'sign_incharge' | 'delete'

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold">{children}</p>
    </div>
  )
}

function Card({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide">{title}</h2>
        {aside}
      </header>
      <div className="p-5">{children}</div>
    </section>
  )
}

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

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!batch) return <Page><PageBody><LoadingMessage label={t('cc_production.resin.loading', 'Loading…')} /></PageBody></Page>

  const status = RESIN_STATUS[batch.status]
  const delta = batch.yieldPct !== null && batch.compare.averagePct !== null ? Math.round((batch.yieldPct - batch.compare.averagePct) * 10) / 10 : null

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-12">
          <div>
            <Link href="/backend/resin/batches" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t('cc_production.resin.title', 'Resin batches')}
            </Link>
          </div>

          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">CCCPL/F/QC/03 · {batch.grade}</p>
              <h1 className="font-mono text-2xl font-bold tracking-tight">{batch.batchNo}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge variant={status.variant} dot>
                  {status.label}
                </StatusBadge>
                {batch.postedAt ? <span className="text-xs text-muted-foreground">{t('cc_production.resin.postedBy', 'by {name} · {at}', { name: batch.postedByName ?? '—', at: when(batch.postedAt) })}</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button type="button" variant="outline" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.resin.print', 'Print')}
              </Button>
              {canEnter && batch.status === 'draft' ? (
                <>
                  <Button asChild variant="outline">
                    <Link href={`/backend/resin/batches/${batch.id}/edit`}>
                      <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('cc_production.resin.edit', 'Edit')}
                    </Link>
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => void act('delete')}>
                    <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.resin.delete', 'Delete draft')}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setFailing(true)}>
                    <TriangleAlert className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.resin.fail', 'Batch failed')}
                  </Button>
                  <Button type="button" disabled={busy} onClick={() => void act('post')}>
                    <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.resin.post', 'Post')}
                  </Button>
                </>
              ) : null}
              {canEnter && batch.canReopen ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void act('reopen')}>
                  <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.resin.reopen', 'Reopen')}
                </Button>
              ) : null}
            </div>
          </header>

          {batch.status === 'failed' ? (
            <Alert variant="destructive">
              <AlertTitle>{t('cc_production.resin.failedTitle', 'Failed batch')}</AlertTitle>
              <AlertDescription>{batch.failReason}</AlertDescription>
            </Alert>
          ) : null}

          <section className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm md:grid-cols-6">
            <Fact label={t('cc_production.resin.date', 'Date')}>{day(batch.batchDate)}</Fact>
            <Fact label={t('cc_production.resin.vessel', 'Vessel')}>{batch.reactorCode}</Fact>
            <Fact label={t('cc_production.resin.totalInput', 'Total input')}>{kg(batch.totalInputKg)} kg</Fact>
            <Fact label={t('cc_production.resin.yield', 'Resin yield (kg)')}>{kg(batch.yieldKg)} kg</Fact>
            <Fact label={t('cc_production.resin.yieldPct', 'Yield')}>{batch.yieldPct === null ? '—' : `${batch.yieldPct}%`}</Fact>
            <Fact label={t('cc_production.resin.water', 'Water removed (kg)')}>{kg(batch.waterRemovedKg)}</Fact>
          </section>

          <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(
              [
                ['sign_chemist', t('cc_production.resin.chemist', 'Chemist'), batch.chemistSign, batch.chemistSignedAt],
                ['sign_incharge', t('cc_production.resin.incharge', 'In-charge'), batch.inchargeSign, batch.inchargeSignedAt],
              ] as Array<[Action, string, string | null, string | null]>
            ).map(([action, label, name, at]) => (
              <div key={action} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="text-sm font-medium">{name ? `${name} · ${when(at)}` : t('cc_production.resin.notSigned', 'Not signed')}</p>
                </div>
                {canSign && !name ? (
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act(action)}>
                    <Signature className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.resin.sign', 'Sign')}
                  </Button>
                ) : null}
              </div>
            ))}
          </section>

          <Card title={t('cc_production.resin.cameFrom', 'Materials · came from')}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">{t('cc_production.resin.material', 'Material')}</th>
                  <th className="py-2 pr-3 text-right">kg</th>
                  <th className="py-2">{t('cc_production.resin.lots', 'Lots used')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batch.materials.map((line) => (
                  <tr key={line.productId}>
                    <td className="py-2 pr-3 font-medium">{line.title}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{kg(line.kg)}</td>
                    <td className="py-2 text-xs text-muted-foreground">
                      {line.lots.length
                        ? line.lots.map((lot) => (
                            <span key={lot.lotId} className="mr-3 inline-block">
                              {lot.lotNumber ?? '—'} · {kg(lot.kg)} kg · {PLACE_LABEL[lot.place as StockPlace] ?? lot.place}
                              {lot.grnId ? (
                                <>
                                  {' · '}
                                  <Link className="underline" href={`/backend/purchase/grns/${lot.grnId}`}>
                                    {lot.grnCode}
                                  </Link>
                                </>
                              ) : null}
                            </span>
                          ))
                        : batch.status === 'draft'
                          ? t('cc_production.resin.pickedOnPost', 'Picked when posted (oldest lot first)')
                          : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>

          <Card title={t('cc_production.resin.process', 'Process')}>
            <dl className="grid grid-cols-1 gap-x-8 gap-y-2 text-sm md:grid-cols-2">
              {STEP_LABELS.map((step) => (
                <div key={step.key} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {step.no}. {step.label}
                  </dt>
                  <dd>
                    {batch.process.steps[step.key]?.done ? '✓' : '—'}
                    {batch.process.steps[step.key]?.ph !== null && batch.process.steps[step.key]?.ph !== undefined ? ` · pH ${batch.process.steps[step.key].ph}` : ''}
                  </dd>
                </div>
              ))}
              {READINGS.map((reading) => (
                <div key={reading.key} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {reading.no}. {reading.label}
                  </dt>
                  <dd className="tabular-nums">
                    {batch.process[reading.key].tempC ?? '—'} °C {batch.process[reading.key].time ? `at ${batch.process[reading.key].time}` : ''}
                  </dd>
                </div>
              ))}
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">11. {t('cc_production.resin.gelChecked', 'Gel time checked on hot plate')}</dt>
                <dd>{batch.process.gelChecked ? '✓' : '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">12. {t('cc_production.resin.vacuum', 'Water removal under vacuum starts at')}</dt>
                <dd>{batch.process.vacuumStart ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">13. {t('cc_production.resin.coolingShort', 'Cooling time to 35–45 °C')}</dt>
                <dd>{batch.process.coolingDuration ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">14. {t('cc_production.resin.tests', 'Tests')}</dt>
                <dd className="tabular-nums">
                  pH {batch.tests.ph ?? '—'} · {t('cc_production.resin.gel', 'gel')} {batch.tests.gelTimeSec ?? '—'} s · {t('cc_production.resin.visc', 'visc.')} {batch.tests.viscositySec ?? '—'} s · {t('cc_production.resin.solidShort', 'solids')} {batch.tests.solidPct ?? '—'}%
                </dd>
              </div>
            </dl>
            {batch.notes ? <p className="mt-4 text-sm text-muted-foreground">{batch.notes}</p> : null}
          </Card>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Card title={t('cc_production.resin.wentTo', 'Went to')}>
              {batch.resin ? (
                <p className="text-sm">
                  {t('cc_production.resin.inTank', '{title} lot {lot} in the resin tank: {left} kg left of {made} kg.', {
                    title: batch.resin.title ?? 'Resin',
                    lot: batch.resin.lotNumber ?? '—',
                    left: kg(batch.resin.leftKg),
                    made: kg(batch.yieldKg),
                  })}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{batch.status === 'failed' ? t('cc_production.resin.noResin', 'No resin came out of this batch.') : t('cc_production.resin.notPostedYet', 'Not posted yet.')}</p>
              )}
              {batch.wentTo.length ? (
                <ul className="mt-3 space-y-1 text-sm">
                  {batch.wentTo.map((entry) => (
                    <li key={entry.id}>
                      {entry.label} · {kg(entry.kg)} kg
                    </li>
                  ))}
                </ul>
              ) : batch.resin ? (
                <p className="mt-2 text-xs text-muted-foreground">{t('cc_production.resin.noCoating', 'No coating run has used it yet.')}</p>
              ) : null}
            </Card>

            <Card title={t('cc_production.resin.compare', 'Yield against the last 10 {grade} batches', { grade: batch.grade })}>
              {batch.compare.batches.length ? (
                <>
                  <p className="text-sm">
                    {t('cc_production.resin.average', 'Average {avg}%', { avg: batch.compare.averagePct ?? '—' })}
                    {delta !== null ? <span className="ml-2 font-semibold">{delta >= 0 ? `+${delta}` : delta} pts</span> : null}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {batch.compare.batches.map((entry) => (
                      <li key={entry.id} className="flex justify-between">
                        <Link className="font-mono underline-offset-2 hover:underline" href={`/backend/resin/batches/${entry.id}`}>
                          {entry.batchNo}
                        </Link>
                        <span className="tabular-nums">{entry.yieldPct === null ? '—' : `${entry.yieldPct}%`}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">{t('cc_production.resin.noCompare', 'No earlier posted batches of this grade.')}</p>
              )}
            </Card>
          </div>

          <Card title={t('cc_production.resin.history', 'History')}>
            <ul className="space-y-1.5 text-sm">
              {[...batch.history].reverse().map((entry, index) => (
                <li key={`${entry.at}-${index}`} className="flex flex-wrap justify-between gap-2">
                  <span>
                    <span className="font-medium">{HISTORY_LABEL[entry.action] ?? entry.action}</span>
                    {entry.note ? <span className="text-muted-foreground"> · {entry.note}</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {entry.by ?? '—'} · {when(entry.at)}
                  </span>
                </li>
              ))}
            </ul>
            {batch.reopenUntil && batch.canReopen ? <p className="mt-3 text-xs text-muted-foreground">{t('cc_production.resin.reopenUntil', 'Can be reopened until {at}.', { at: when(batch.reopenUntil) })}</p> : null}
          </Card>
        </div>

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
      </PageBody>
    </Page>
  )
}

export default ResinBatchPage
