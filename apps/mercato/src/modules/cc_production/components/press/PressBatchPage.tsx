"use client"

import * as React from 'react'
import Link from 'next/link'
import { Ban, CheckCheck, Flame, Layers, Pencil, Printer, RotateCcw, Send, TriangleAlert, Waypoints } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { HISTORY_LABEL, day, kg, when } from '../resin/shared'
import { HEATING_FIELDS, PRESS_STATUS, weightText, type PressBatchView } from './shared'
import { FieldList, LinkRows, Panel, PanelEmpty, RecordColumns, RecordPage, RecordState, RegisterGrid, type Fact } from '../../../cc_ui/components/RecordPage'
import { PlantChain } from '../../../cc_ui/components/PlantChain'
import { recordHref } from '../../../cc_ui/lib/links'
import { Timeline } from '../../../cc_ui/components/Timeline'

type Action = 'post' | 'reopen' | 'cancel' | 'review'

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

  if (error || !batch) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />

  const status = PRESS_STATUS[batch.status]
  const heating = HEATING_FIELDS.filter((field) => batch.heating?.[field.key])
  const sheetRows = batch.daylights.flatMap((daylight) => daylight.sheets.map((sheet, index) => ({ key: `${daylight.no}-${index}`, daylight: index === 0 ? String(daylight.no) : '', sheet })))
  const outOfRange = sheetRows.filter((row) => row.sheet.toleranceOk === false).length
  const facts: Fact[] = [
    { label: t('cc_production.resin.date', 'Date'), value: day(batch.batchDate) },
    {
      label: t('cc_production.press.press', 'Press No.'),
      value: (
        <Link className="underline-offset-2 hover:underline" href={recordHref.machine('press', batch.pressId)}>
          {batch.pressNumber}
        </Link>
      ),
    },
    { label: t('cc_production.press.cycle', 'Cycle no.'), value: batch.cycleNo != null ? String(batch.cycleNo) : '—' },
    { label: t('cc_production.press.sheets', 'Sheets'), value: String(batch.figures.totalSheets), hint: batch.figures.paperLines.join(' · ') },
    { label: t('cc_production.press.total', 'Total kg'), value: kg(batch.figures.totalKg) },
    { label: t('cc_production.press.outOfRange', 'Outside range'), value: String(outOfRange), tone: outOfRange ? 'warn' : 'good' },
  ]

  return (
    <>
      <RecordPage
        back={{ href: '/backend/press/batches', label: t('cc_production.press.title', 'Press batches') }}
        overline={`CCCPL/F/PRP/02 · ${batch.figures.sizeLines.map((line) => line.grade).filter((grade, index, all) => all.indexOf(grade) === index).join(', ')}`}
        title={batch.batchNo}
        badges={
          <>
            <StatusBadge variant={status.variant} dot>
              {status.label}
            </StatusBadge>
            {batch.reviewedBy ? <StatusBadge variant="info">{t('cc_production.press.reviewedShort', 'Reviewed')}</StatusBadge> : null}
          </>
        }
        meta={[
          batch.postedAt ? t('cc_production.resin.postedBy', 'by {name} · {at}', { name: batch.postedByName ?? '—', at: when(batch.postedAt) }) : null,
          batch.reviewedBy ? t('cc_production.press.reviewedBy', 'Reviewed by {name} · {at}', { name: batch.reviewedBy, at: when(batch.reviewedAt) }) : null,
          batch.cancelReason,
        ]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.resin.print', 'Print')}
            </Button>
            {granted.has('cc_production.press.review') && !batch.reviewedBy && batch.status === 'posted' ? (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act('review')}>
                <CheckCheck className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.press.review', 'Mark reviewed')}
              </Button>
            ) : null}
            {canEnter && batch.status === 'draft' ? (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/backend/press/batches/${batch.id}/edit`}>
                    <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                    {t('cc_production.resin.edit', 'Edit')}
                  </Link>
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setCancelling(true)}>
                  <Ban className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.press.cancel', 'Cancel batch')}
                </Button>
                <Button type="button" size="sm" disabled={busy} onClick={() => void act('post')}>
                  <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.resin.post', 'Post')}
                </Button>
              </>
            ) : null}
            {canEnter && batch.status === 'posted' ? (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void act('reopen')}>
                <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.resin.reopen', 'Reopen')}
              </Button>
            ) : null}
          </>
        }
        chain={<PlantChain current="press" hrefs={{ coating: batch.picks[0] ? recordHref.bstageLot(batch.picks[0].lotId) : null, cutting: batch.outputs[0] ? recordHref.lot(batch.outputs[0].lotId) : null }} />}
        facts={facts}
      >
        <RecordColumns
          main={
            <>
              <Panel title={t('cc_production.press.daylights', 'Daylights')} icon={Layers} count={batch.daylights.length} flush>
                <RegisterGrid
                  rows={sheetRows}
                  rowKey={(row) => row.key}
                  empty={t('cc_production.press.noDaylights', 'No daylights entered.')}
                  columns={[
                    { key: 'daylight', label: t('cc_production.press.daylight', 'Daylight'), mono: true, render: (row) => row.daylight },
                    { key: 'grade', label: t('cc_production.press.grade', 'Grade'), render: (row) => row.sheet.grade },
                    { key: 'thickness', label: t('cc_production.press.thickness', 'Thickness mm'), align: 'right', render: (row) => row.sheet.thicknessMm },
                    { key: 'count', label: t('cc_production.press.count', 'Sheets'), align: 'right', render: (row) => row.sheet.count, total: String(batch.figures.totalSheets) },
                    {
                      key: 'range',
                      label: t('cc_production.press.range', 'Specified range'),
                      align: 'right',
                      render: (row) => (row.sheet.tolerance ? `${row.sheet.tolerance.minKg.toFixed(3)} – ${row.sheet.tolerance.maxKg.toFixed(3)}` : '—'),
                    },
                    {
                      key: 'weight',
                      label: t('cc_production.press.weight', 'Loading weight kg'),
                      align: 'right',
                      render: (row) => (
                        <span className={cn(row.sheet.toleranceOk === false && 'font-semibold text-status-warning-text')}>
                          {weightText(row.sheet)}
                          {row.sheet.toleranceOk === false ? ' ⚠' : ''}
                        </span>
                      ),
                      total: kg(batch.figures.totalKg),
                    },
                  ]}
                />
              </Panel>

              <Panel title={t('cc_production.press.heating', 'Press heating slip (optional)')} icon={Flame}>
                {heating.length ? (
                  <FieldList
                    fields={[
                      ...heating.map((field) => [field.label, String(batch.heating?.[field.key])] as [string, React.ReactNode]),
                      [t('cc_production.press.totalInput', 'Total input weight'), `${kg(batch.figures.totalKg)} kg`],
                    ]}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">{t('cc_production.press.noHeating', 'Not filled.')}</p>
                )}
                <p className="mt-3 text-sm">
                  {t('cc_production.press.checkedBy', 'Checked by')}: {batch.checkedBy ?? '—'}
                  {batch.remark ? ` · ${batch.remark}` : ''}
                </p>
              </Panel>
            </>
          }
          side={
            <>
              {batch.warnings.length ? (
                <Panel title={t('cc_production.press.warnings', 'Warnings')} icon={TriangleAlert} count={batch.warnings.length}>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-status-warning-text">
                    {batch.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </Panel>
              ) : null}

              <Panel title={t('cc_production.press.cameFrom', 'B-stage used')} icon={Layers} count={batch.picks.length} flush>
                <LinkRows
                  empty={batch.status === 'draft' ? t('cc_production.press.pickedOnPost', 'Picked when posted, oldest first for each grade.') : '—'}
                  rows={batch.picks.map((pick) => ({
                    key: `${pick.lotId}-${pick.grade}`,
                    href: recordHref.bstageLot(pick.lotId),
                    primary: <span className="font-mono">{pick.lotNumber}</span>,
                    secondary: t('cc_production.press.pickAge', '{grade} · day {age} at use', { grade: pick.grade, age: pick.ageDays }),
                    value: `${kg(pick.kg)} kg`,
                  }))}
                />
                {batch.lotChoices.filter((choice) => choice.reason).map((choice) => (
                  <p key={choice.grade} className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                    {t('cc_production.press.override', '{grade}: lot picked by hand · {reason}', { grade: choice.grade, reason: choice.reason })}
                  </p>
                ))}
              </Panel>

              <Panel title={t('cc_production.press.wentTo', 'Pressed lots')} icon={Waypoints} count={batch.outputs.length} flush>
                {batch.outputs.length ? (
                  <LinkRows
                    empty={null}
                    rows={batch.outputs.map((output) => ({
                      key: output.lotId,
                      href: recordHref.lot(output.lotId),
                      primary: <span className="font-mono">{output.lotNumber}</span>,
                      secondary: `${output.productTitle} · ${output.nos} nos`,
                      value: `${kg(output.kg)} kg`,
                      valueHint: output.leftKg !== null && output.leftKg !== output.kg ? t('cc_production.press.leftShort', '{kg} left', { kg: kg(output.leftKg) }) : undefined,
                    }))}
                  />
                ) : (
                  <PanelEmpty>{t('cc_production.resin.notPostedYet', 'Not posted yet.')}</PanelEmpty>
                )}
                <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{t('cc_production.press.nextLot', 'Open a lot to see the cutting, thickness check and FG lot it went on to.')}</p>
              </Panel>
            </>
          }
        />
        <Timeline type="press_batch" id={batch.id} refreshKey={batch.history.length} />
      </RecordPage>

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
    </>
  )
}

export default PressBatchPage
