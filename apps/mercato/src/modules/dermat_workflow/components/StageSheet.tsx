"use client"

import * as React from 'react'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Label } from '@open-mercato/ui/primitives/label'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Notice } from '@open-mercato/ui/primitives/Notice'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StageForm, buildQcRows } from './StageForm'
import { MaterialPlanningGrid } from './MaterialPlanningGrid'
import {
  DEPARTMENT_LABELS,
  stripInternal,
  type FlowLine,
  type FlowStage,
  type OrderFlow,
  type StageDefinitionView,
  type StageTarget,
} from './types'

type StageSheetProps = {
  target: StageTarget | null
  onOpenChange: (open: boolean) => void
  onChanged?: () => void
}

type Action = 'save' | 'complete' | 'skip' | 'revert'

type ActionError = { message: string; fields: string[] }

function formatDateTime(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export function StageSheet({ target, onOpenChange, onChanged }: StageSheetProps) {
  const t = useT()
  const [flow, setFlow] = React.useState<OrderFlow | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [values, setValues] = React.useState<Record<string, unknown>>({})
  const [busy, setBusy] = React.useState<Action | null>(null)
  const [actionError, setActionError] = React.useState<ActionError | null>(null)
  const [revertOpen, setRevertOpen] = React.useState(false)
  const [revertReason, setRevertReason] = React.useState('')
  const mutationContextId = 'dermat_workflow.stage-sheet'
  const { runMutation, retryLastMutation } = useGuardedMutation<{
    formId: string
    resourceKind: string
    resourceId: string
    retryLastMutation: () => Promise<boolean>
  }>({ contextId: mutationContextId })

  const load = React.useCallback(async () => {
    if (!target) return
    setLoading(true)
    setLoadError(null)
    const call = await apiCall<OrderFlow & { error?: string }>(`/api/dermat_workflow/orders/${target.orderId}/flow`)
    if (!call.ok || !call.result) {
      setLoadError(stripInternal(call.result?.error, t('dermat_workflow.sheet.loadError', 'Could not load this stage.')))
      setLoading(false)
      return
    }
    setFlow(call.result)
    setLoading(false)
  }, [target, t])

  React.useEffect(() => {
    setFlow(null)
    setValues({})
    setActionError(null)
    setRevertOpen(false)
    setRevertReason('')
    if (target) void load()
  }, [target, load])

  const definition: StageDefinitionView | null = React.useMemo(() => {
    if (!flow || !target) return null
    return flow.definitions.find((item) => item.code === target.stageCode && item.subjectType === target.subjectType) ?? null
  }, [flow, target])

  const line: FlowLine | null = React.useMemo(() => {
    if (!flow || !target || target.subjectType !== 'order_line') return null
    return flow.lines.find((item) => item.lineId === target.subjectId) ?? null
  }, [flow, target])

  const stage: FlowStage | null = React.useMemo(() => {
    if (!flow || !target) return null
    const stages = target.subjectType === 'order' ? flow.stages : line?.stages ?? []
    return stages.find((item) => item.code === target.stageCode) ?? null
  }, [flow, target, line])

  const isCurrent = stage?.state === 'current'
  const isMaterialPlanning = target?.subjectType === 'order' && target.stageCode === 'procurement_material'
  const readOnly = !isCurrent || Boolean(definition?.isAutomatic)

  React.useEffect(() => {
    if (!stage || !definition) return
    const saved = stage.run?.data ?? {}
    setValues(definition.kind === 'qc_test' ? { ...saved, qc_rows: buildQcRows(definition, saved) } : { ...saved })
  }, [stage, definition])

  const phaseStages = React.useMemo(() => {
    if (!line || !definition?.phase) return []
    return line.stages.filter((item) => item.phase === definition.phase)
  }, [line, definition])

  const perform = React.useCallback(
    async (action: Action) => {
      if (!target || !definition) return
      if (action === 'revert' && !revertReason.trim()) {
        setActionError({ message: t('dermat_workflow.sheet.reasonRequired', 'Enter a reason for reverting.'), fields: [] })
        return
      }
      setBusy(action)
      setActionError(null)
      const payload = {
        action,
        orderId: target.orderId,
        subjectType: target.subjectType,
        subjectId: target.subjectId,
        stageCode: target.stageCode,
        data: action === 'revert' ? undefined : values,
        reason: action === 'revert' ? revertReason.trim() : undefined,
      }
      try {
        const call = await runMutation({
          operation: async () =>
            apiCall<{ ok?: boolean; stageCode?: string | null; error?: string; fields?: string[] }>(
              '/api/dermat_workflow/stage-action',
              { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
            ),
          context: {
            formId: mutationContextId,
            resourceKind: 'dermat_workflow.stage_run',
            resourceId: target.subjectId,
            retryLastMutation,
          },
          mutationPayload: payload,
        })
        if (!call.ok) {
          setActionError({
            message: stripInternal(call.result?.error, t('dermat_workflow.sheet.actionError', 'The action could not be completed.')),
            fields: Array.isArray(call.result?.fields) ? call.result.fields : [],
          })
          return
        }
        if (action === 'save') {
          flash(t('dermat_workflow.sheet.saved', 'Saved. You can complete the stage later.'), 'success')
          await load()
          onChanged?.()
          return
        }
        const message =
          action === 'revert'
            ? t('dermat_workflow.sheet.reverted', 'Sent back to the previous stage.')
            : action === 'skip'
              ? t('dermat_workflow.sheet.skipped', 'Stage skipped. Work moved to the next stage.')
              : t('dermat_workflow.sheet.completed', '{stage} completed. Work moved to the next stage.', { stage: definition.name })
        flash(message, 'success')
        onChanged?.()
        onOpenChange(false)
      } catch (err) {
        setActionError({
          message: stripInternal(err instanceof Error ? err.message : null, t('dermat_workflow.sheet.actionError', 'The action could not be completed.')),
          fields: [],
        })
      } finally {
        setBusy(null)
      }
    },
    [target, definition, values, revertReason, runMutation, retryLastMutation, t, load, onChanged, onOpenChange],
  )

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && isCurrent && !readOnly && !busy) {
      event.preventDefault()
      void perform(revertOpen ? 'revert' : 'complete')
    }
  }

  const statusLabel = (() => {
    if (!stage) return null
    if (stage.state === 'current') return <StatusBadge variant="info">{t('dermat_workflow.state.current', 'In progress')}</StatusBadge>
    if (stage.state === 'done') return <StatusBadge variant="success">{t('dermat_workflow.state.done', 'Completed')}</StatusBadge>
    if (stage.state === 'skipped') return <StatusBadge variant="neutral">{t('dermat_workflow.state.skipped', 'Skipped')}</StatusBadge>
    return <StatusBadge variant="neutral">{t('dermat_workflow.state.upcoming', 'Not started')}</StatusBadge>
  })()

  const revertHistory = (stage?.history ?? []).filter((run) => run.status === 'reverted' && run.revertReason)
  const completedRun = stage?.history.find((run) => run.status === 'completed' || run.status === 'skipped') ?? null

  return (
    <Sheet open={Boolean(target)} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={`${isMaterialPlanning ? 'sm:max-w-6xl' : 'sm:max-w-2xl'} w-full overflow-y-auto`}
        onKeyDown={onKeyDown}
      >
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {definition?.name ?? t('dermat_workflow.sheet.title', 'Stage')}
            {statusLabel}
          </SheetTitle>
          <SheetDescription>
            {flow?.order.orderNumber ?? ''}
            {flow?.order.customerName ? ` · ${flow.order.customerName}` : ''}
            {definition ? ` · ${DEPARTMENT_LABELS[definition.department] ?? definition.department}` : ''}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> {t('dermat_workflow.sheet.loading', 'Loading…')}
          </div>
        ) : null}
        {loadError ? <Notice variant="error" message={loadError} /> : null}

        {definition && stage ? (
          <div className="flex-1 space-y-5 px-1">
            {line ? (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm space-y-1">
                <div className="font-medium">{line.productName ?? t('dermat_workflow.sheet.product', 'Product')}</div>
                <div className="text-muted-foreground">
                  {[line.productCode, line.batchNumber ? `${t('dermat_workflow.batch', 'Batch')} ${line.batchNumber}` : null, line.quantity ? `${t('dermat_workflow.qty', 'Qty')} ${Number(line.quantity)}${line.quantityUnit ? ` ${line.quantityUnit}` : ''}` : null]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {definition.phaseLabel ? (
                  <div className="text-muted-foreground">
                    {t('dermat_workflow.sheet.phaseStep', '{phase} · Stage {index} of {total}', {
                      phase: definition.phaseLabel,
                      index: phaseStages.findIndex((item) => item.code === definition.code) + 1,
                      total: phaseStages.length,
                    })}
                    {definition.unit ? ` · ${t('dermat_workflow.unit', 'Unit')}: ${definition.unit}` : ''}
                  </div>
                ) : null}
              </div>
            ) : null}

            {isMaterialPlanning && target ? (
              <div className="space-y-2">
                <div className="text-sm font-semibold">{t('dermat_workflow.planning.title', 'Material requirement & reserved stock')}</div>
                <MaterialPlanningGrid orderIds={[target.orderId]} canReserve={isCurrent} />
              </div>
            ) : null}

            {definition.isAutomatic ? (
              <Notice
                compact
                message={t('dermat_workflow.sheet.automatic', 'Production is tracked per product below. This stage completes automatically when every product finishes Packing.')}
              />
            ) : null}

            {!isCurrent && stage.state === 'upcoming' ? (
              <Notice compact message={t('dermat_workflow.sheet.notYet', 'This stage has not started yet. Earlier stages must be completed first.')} />
            ) : null}

            {completedRun && stage.state !== 'current' ? (
              <p className="text-xs text-muted-foreground">
                {t('dermat_workflow.sheet.completedBy', 'Completed by {user} on {date}', {
                  user: completedRun.completedBy ?? '—',
                  date: formatDateTime(completedRun.completedAt),
                })}
              </p>
            ) : null}

            {revertHistory.length ? (
              <Notice
                variant="warning"
                title={t('dermat_workflow.sheet.sentBack', 'Sent back earlier')}
                message={revertHistory
                  .map((run) => `${formatDateTime(run.revertedAt)} — ${run.revertedBy ?? ''}: ${run.revertReason}`)
                  .join('\n')}
              />
            ) : null}

            {!definition.isAutomatic ? (
              <StageForm
                definition={definition}
                values={values}
                onChange={setValues}
                readOnly={readOnly}
                missing={actionError?.fields ?? []}
              />
            ) : null}

            {actionError ? <Notice variant="error" message={actionError.message} /> : null}

            {revertOpen && isCurrent ? (
              <div className="space-y-1.5">
                <Label htmlFor="stage-revert-reason">{t('dermat_workflow.sheet.revertReason', 'Reason for sending back *')}</Label>
                <Textarea
                  id="stage-revert-reason"
                  value={revertReason}
                  onChange={(event) => setRevertReason(event.target.value)}
                  autoFocus
                />
              </div>
            ) : null}
          </div>
        ) : null}

        {definition && isCurrent ? (
          <SheetFooter className="flex flex-wrap gap-2 sm:justify-between">
            {revertOpen ? (
              <>
                <Button type="button" variant="outline" onClick={() => setRevertOpen(false)} disabled={Boolean(busy)}>
                  {t('dermat_workflow.sheet.cancel', 'Cancel')}
                </Button>
                <Button type="button" variant="destructive" onClick={() => void perform('revert')} disabled={Boolean(busy)}>
                  {busy === 'revert' ? <Spinner /> : null}
                  {t('dermat_workflow.sheet.confirmRevert', 'Send back to previous stage')}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setRevertOpen(true)} disabled={Boolean(busy)}>
                  {t('dermat_workflow.sheet.revert', 'Revert')}
                </Button>
                {!definition.isAutomatic ? (
                  <div className="flex flex-wrap gap-2">
                    {definition.isOptional ? (
                      <Button type="button" variant="outline" onClick={() => void perform('skip')} disabled={Boolean(busy)}>
                        {busy === 'skip' ? <Spinner /> : null}
                        {t('dermat_workflow.sheet.skip', 'Not required — skip')}
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" onClick={() => void perform('save')} disabled={Boolean(busy)}>
                      {busy === 'save' ? <Spinner /> : null}
                      {t('dermat_workflow.sheet.save', 'Save draft')}
                    </Button>
                    <Button type="button" onClick={() => void perform('complete')} disabled={Boolean(busy)}>
                      {busy === 'complete' ? <Spinner /> : null}
                      {t('dermat_workflow.sheet.complete', 'Complete & send to next stage')}
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </SheetFooter>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
