"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Ban, CheckCheck, Pencil, Printer, RotateCcw, Send } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { HISTORY_LABEL, day, kg, when } from '../resin/shared'
import { HEATING_FIELDS, PRESS_STATUS, weightText, type PressBatchView } from './shared'

type Action = 'post' | 'reopen' | 'cancel' | 'review'

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card shadow-sm">
      <h2 className="border-b border-border px-5 py-3 text-sm font-semibold uppercase tracking-wide">{title}</h2>
      <div className="p-5">{children}</div>
    </section>
  )
}

export function PressBatchPage({ batchId }: { batchId: string }) {
  const t = useT()
  const granted = useGranted()
  const canEnter = granted.has('cc_production.press.enter')
  const { runMutation } = useGuardedMutation({ contextId: `cc-press-${batchId}` })
  const [batch, setBatch] = React.useState<PressBatchView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
  const [reason, setReason] = React.useState('')

  const load = React.useCallback(async () => {
    const call = await apiCall<PressBatchView>(`/api/cc_production/press/batches?id=${encodeURIComponent(batchId)}`)
    if (!call.ok || !call.result) setError(t('cc_production.press.loadError', 'Could not load this batch.'))
    else setBatch(call.result)
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
            apiCall<PressBatchView & { error?: string }>('/api/cc_production/press/batches/action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
          ),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_production.resin.actionError', 'Could not do that.'), 'error')
        await load()
        return
      }
      setBatch(call.result)
      setCancelling(false)
      setReason('')
      const messages: Record<Action, string> = {
        post: t('cc_production.press.posted', 'Posted. B-stage is out of stock and the pressed lots are on the shop floor.'),
        reopen: t('cc_production.press.reopened', 'Reopened. The stock movements are reversed.'),
        cancel: t('cc_production.press.cancelled', 'Cancelled. The number stays in the book as cancelled.'),
        review: t('cc_production.press.reviewedDone', 'Marked reviewed.'),
      }
      flash(messages[action], 'success')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!batch) return <Page><PageBody><LoadingMessage label={t('cc_production.resin.loading', 'Loading…')} /></PageBody></Page>

  const status = PRESS_STATUS[batch.status]
  const heating = HEATING_FIELDS.filter((field) => batch.heating?.[field.key])
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-12">
          <Link href="/backend/press/batches" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('cc_production.press.title', 'Press batches')}
          </Link>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">CCCPL/F/PRP/02</p>
              <h1 className="font-mono text-2xl font-bold tracking-tight">{batch.batchNo}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge variant={status.variant} dot>
                  {status.label}
                </StatusBadge>
                {batch.cancelReason ? <span className="text-xs text-muted-foreground">{batch.cancelReason}</span> : null}
                {batch.reviewedBy ? <span className="text-xs text-muted-foreground">{t('cc_production.press.reviewedBy', 'Reviewed by {name} · {at}', { name: batch.reviewedBy, at: when(batch.reviewedAt) })}</span> : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Button type="button" variant="outline" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.resin.print', 'Print')}
              </Button>
              {granted.has('cc_production.press.review') && !batch.reviewedBy && batch.status === 'posted' ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void act('review')}>
                  <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.press.review', 'Mark reviewed')}
                </Button>
              ) : null}
              {canEnter && batch.status === 'draft' ? (
                <>
                  <Button asChild variant="outline">
                    <Link href={`/backend/press/batches/${batch.id}/edit`}>
                      <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                      {t('cc_production.resin.edit', 'Edit')}
                    </Link>
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setCancelling(true)}>
                    <Ban className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.press.cancel', 'Cancel batch')}
                  </Button>
                  <Button type="button" disabled={busy} onClick={() => void act('post')}>
                    <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.resin.post', 'Post')}
                  </Button>
                </>
              ) : null}
              {canEnter && batch.status === 'posted' ? (
                <Button type="button" variant="outline" disabled={busy} onClick={() => void act('reopen')}>
                  <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.resin.reopen', 'Reopen')}
                </Button>
              ) : null}
            </div>
          </header>

          <section className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm md:grid-cols-5">
            {(
              [
                [t('cc_production.resin.date', 'Date'), day(batch.batchDate)],
                [t('cc_production.press.press', 'Press No.'), String(batch.pressNumber)],
                [t('cc_production.press.cycle', 'Cycle no.'), batch.cycleNo != null ? String(batch.cycleNo) : '—'],
                [t('cc_production.press.sheets', 'Sheets'), String(batch.figures.totalSheets)],
                [t('cc_production.press.total', 'Total kg'), kg(batch.figures.totalKg)],
              ] as Array<[string, string]>
            ).map(([label, value]) => (
              <div key={label}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums">{value}</p>
              </div>
            ))}
            <div className="col-span-2 md:col-span-5">
              <p className="font-mono text-sm">{batch.figures.sizeLines.map((line, index) => `${line.grade} ${batch.figures.paperLines[index]}`).join(' · ')}</p>
            </div>
          </section>

          {batch.warnings.length ? (
            <ul className="list-disc rounded-lg border border-status-warning-border bg-status-warning-bg px-8 py-3 text-sm text-status-warning-text">
              {batch.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <Card title={t('cc_production.press.daylights', 'Daylights')}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">{t('cc_production.press.daylight', 'Daylight')}</th>
                  <th className="py-2 pr-3">{t('cc_production.press.thickness', 'Thickness mm')}</th>
                  <th className="py-2 pr-3 text-right">{t('cc_production.press.count', 'Sheets')}</th>
                  <th className="py-2 pr-3 text-right">{t('cc_production.press.weight', 'Loading weight kg')}</th>
                  <th className="py-2 pr-3">{t('cc_production.press.grade', 'Grade')}</th>
                  <th className="py-2">{t('cc_production.press.range', 'Specified range')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batch.daylights.flatMap((daylight) =>
                  daylight.sheets.map((sheet, index) => (
                    <tr key={`${daylight.no}-${index}`}>
                      <td className="py-1.5 pr-3 font-mono text-xs">{index === 0 ? daylight.no : ''}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{sheet.thicknessMm}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{sheet.count}</td>
                      <td className={cn('py-1.5 pr-3 text-right font-mono tabular-nums', sheet.toleranceOk === false && 'text-status-warning-text')}>{weightText(sheet)}</td>
                      <td className="py-1.5 pr-3">{sheet.grade}</td>
                      <td className="py-1.5 text-xs text-muted-foreground">{sheet.tolerance ? `${sheet.tolerance.minKg.toFixed(3)} / ${sheet.tolerance.maxKg.toFixed(3)}${sheet.toleranceOk === false ? ' ⚠' : ' ✓'}` : '—'}</td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </Card>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Card title={t('cc_production.press.cameFrom', 'B-stage used')}>
              {batch.picks.length ? (
                <ul className="space-y-1 text-sm">
                  {batch.picks.map((pick) => (
                    <li key={`${pick.lotId}-${pick.grade}`} className="flex justify-between gap-3">
                      <Link className="font-mono text-xs underline-offset-2 hover:underline" href={`/backend/bstage/lots/${pick.lotId}`}>
                        {pick.lotNumber}
                      </Link>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {pick.grade} · {kg(pick.kg)} kg · day {pick.ageDays}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{batch.status === 'draft' ? t('cc_production.press.pickedOnPost', 'Picked when posted, oldest first for each grade.') : '—'}</p>
              )}
              {batch.lotChoices.filter((choice) => choice.reason).map((choice) => (
                <p key={choice.grade} className="mt-2 text-xs text-muted-foreground">
                  {t('cc_production.press.override', '{grade}: lot picked by hand · {reason}', { grade: choice.grade, reason: choice.reason })}
                </p>
              ))}
            </Card>
            <Card title={t('cc_production.press.wentTo', 'Pressed lots')}>
              {batch.outputs.length ? (
                <ul className="space-y-1 text-sm">
                  {batch.outputs.map((output) => (
                    <li key={output.lotId} className="flex justify-between gap-3">
                      <span>
                        <span className="font-mono text-xs">{output.lotNumber}</span>
                        <span className="block text-xs text-muted-foreground">{output.productTitle}</span>
                      </span>
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {output.nos} nos · {kg(output.kg)} kg{output.leftKg !== null && output.leftKg !== output.kg ? ` · ${kg(output.leftKg)} left` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t('cc_production.resin.notPostedYet', 'Not posted yet.')}</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">{t('cc_production.press.next', 'Cutting and thickness inspection (Stage 7) take these lots.')}</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Card title={t('cc_production.press.heating', 'Press heating slip (optional)')}>
              {heating.length ? (
                <dl className="space-y-1 text-sm">
                  {heating.map((field) => (
                    <div key={field.key} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{field.label}</dt>
                      <dd>{String(batch.heating?.[field.key])}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{t('cc_production.press.totalInput', 'Total input weight')}</dt>
                    <dd>{kg(batch.figures.totalKg)} kg</dd>
                  </div>
                </dl>
              ) : (
                <p className="text-sm text-muted-foreground">{t('cc_production.press.noHeating', 'Not filled.')}</p>
              )}
            </Card>
            <Card title={t('cc_production.resin.history', 'History')}>
              <p className="mb-2 text-sm">
                {t('cc_production.press.checkedBy', 'Checked by')}: {batch.checkedBy ?? '—'}
                {batch.remark ? ` · ${batch.remark}` : ''}
              </p>
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
            </Card>
          </div>
        </div>

        <Dialog open={cancelling} onOpenChange={(open) => !open && setCancelling(false)}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && reason.trim()) void act('cancel', reason.trim())
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('cc_production.press.cancelTitle', 'Cancel {no}?', { no: batch.batchNo })}</DialogTitle>
              <DialogDescription>{t('cc_production.press.cancelHint', 'The number is not reused; it stays in the book marked cancelled.')}</DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="press-cancel-reason">{t('cc_production.issues.why', 'Why')}</Label>
              <Textarea id="press-cancel-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCancelling(false)}>
                {t('cc_production.resin.cancel', 'Cancel')}
              </Button>
              <Button type="button" variant="destructive" disabled={busy || !reason.trim()} onClick={() => void act('cancel', reason.trim())}>
                {t('cc_production.press.cancel', 'Cancel batch')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}

export default PressBatchPage
