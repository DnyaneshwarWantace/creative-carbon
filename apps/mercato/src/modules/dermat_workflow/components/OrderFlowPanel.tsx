"use client"

import * as React from 'react'
import { Check, ChevronRight, Factory, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { Notice } from '@open-mercato/ui/primitives/Notice'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { StageSheet } from './StageSheet'
import { DEPARTMENT_LABELS, stripInternal, type FlowLine, type FlowStage, type OrderFlow, type StageTarget } from './types'

type OrderFlowPanelProps = {
  orderId: string
  onChanged?: () => void
}

function stageTone(state: FlowStage['state']): string {
  if (state === 'done') return 'border-status-success-border bg-status-success-bg text-status-success-text'
  if (state === 'current') return 'border-status-info-border bg-status-info-bg text-status-info-text'
  if (state === 'skipped') return 'border-border bg-muted text-muted-foreground line-through'
  return 'border-border bg-background text-muted-foreground'
}

function wasReverted(stage: FlowStage): boolean {
  return stage.history.some((run) => run.status === 'reverted')
}

function PhaseProgress({ line, onOpen }: { line: FlowLine; onOpen: (code: string) => void }) {
  const phases = React.useMemo(() => {
    const groups: Array<{ phase: string; label: string; unit: string | null; stages: FlowStage[] }> = []
    for (const stage of line.stages) {
      const key = stage.phase ?? 'other'
      let group = groups.find((item) => item.phase === key)
      if (!group) {
        group = { phase: key, label: stage.phaseLabel ?? key, unit: stage.unit, stages: [] }
        groups.push(group)
      }
      group.stages.push(stage)
    }
    return groups
  }, [line.stages])
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
      {phases.map((phase) => {
        const doneCount = phase.stages.filter((stage) => stage.state === 'done' || stage.state === 'skipped').length
        const active = phase.stages.some((stage) => stage.state === 'current')
        return (
          <div
            key={phase.phase}
            className={cn(
              'rounded-md border p-2',
              active ? 'border-status-info-border' : doneCount === phase.stages.length ? 'border-status-success-border' : 'border-border',
            )}
          >
            <div className="flex items-center justify-between text-xs font-medium">
              <span>{phase.label}</span>
              <span className="text-muted-foreground">
                {doneCount}/{phase.stages.length}
                {phase.unit ? ` · ${phase.unit}` : ''}
              </span>
            </div>
            <div className="mt-2 space-y-1">
              {phase.stages.map((stage, index) => (
                <Button
                  key={stage.code}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpen(stage.code)}
                  className={cn('h-auto w-full justify-start gap-2 px-2 py-1 text-left text-xs font-normal', stage.state === 'current' && 'font-semibold')}
                >
                  <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full border text-overline', stageTone(stage.state))}>
                    {stage.state === 'done' ? <Check className="size-3" aria-hidden /> : index + 1}
                  </span>
                  <span className="truncate">{stage.name}</span>
                  {wasReverted(stage) ? <RotateCcw className="size-3 shrink-0 text-status-warning-icon" aria-hidden /> : null}
                </Button>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function OrderFlowPanel({ orderId, onChanged }: OrderFlowPanelProps) {
  const t = useT()
  const [flow, setFlow] = React.useState<OrderFlow | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [target, setTarget] = React.useState<StageTarget | null>(null)

  const load = React.useCallback(async () => {
    setError(null)
    const call = await apiCall<OrderFlow & { error?: string }>(`/api/dermat_workflow/orders/${orderId}/flow`)
    if (!call.ok || !call.result) {
      setError(stripInternal(call.result?.error, t('dermat_workflow.flow.loadError', 'Could not load the order workflow.')))
    } else {
      setFlow(call.result)
    }
    setLoading(false)
  }, [orderId, t])

  React.useEffect(() => {
    void load()
  }, [load])

  const handleChanged = React.useCallback(() => {
    void load()
    onChanged?.()
  }, [load, onChanged])

  const current = flow?.stages.find((stage) => stage.state === 'current') ?? null
  const inProduction = Boolean(current?.isAutomatic)
  const lines = flow?.lines ?? []
  const showLines = lines.some((line) => line.started)

  const openOrderStage = (code: string) => setTarget({ orderId, subjectType: 'order', subjectId: orderId, stageCode: code })
  const openLineStage = (line: FlowLine, code: string) =>
    setTarget({ orderId, subjectType: 'order_line', subjectId: line.lineId, stageCode: code })

  return (
    <Card>
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Factory className="h-5 w-5 text-primary" aria-hidden />
            {t('dermat_workflow.flow.title', 'Order Progress')}
          </CardTitle>
          {flow?.order.finished ? (
            <StatusBadge variant="success">{t('dermat_workflow.flow.finished', 'Dispatched — order complete')}</StatusBadge>
          ) : current ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {t('dermat_workflow.flow.currentAt', 'Now at')} <strong className="text-foreground">{current.name}</strong>
                {` · ${DEPARTMENT_LABELS[current.department] ?? current.department}`}
              </span>
              {!inProduction ? (
                <Button type="button" size="sm" onClick={() => openOrderStage(current.code)}>
                  {t('dermat_workflow.flow.completeStage', 'Complete {stage}', { stage: current.name })}
                  <ChevronRight className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-4 space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> {t('dermat_workflow.flow.loading', 'Loading workflow…')}
          </div>
        ) : null}
        {error ? <Notice variant="error" message={error} /> : null}

        {flow ? (
          <ol className="flex flex-wrap gap-2" aria-label={t('dermat_workflow.flow.stages', 'Order stages')}>
            {flow.stages.map((stage, index) => (
              <li key={stage.code}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openOrderStage(stage.code)}
                  className={cn('h-auto gap-2 rounded-full border px-3 py-1 text-xs font-medium', stageTone(stage.state))}
                  aria-current={stage.state === 'current' ? 'step' : undefined}
                >
                  <span className="tabular-nums">{stage.state === 'done' ? <Check className="size-3" aria-hidden /> : index + 1}</span>
                  {stage.name}
                  {wasReverted(stage) ? <RotateCcw className="size-3 text-status-warning-icon" aria-hidden /> : null}
                </Button>
              </li>
            ))}
          </ol>
        ) : null}

        {flow && showLines ? (
          <div className="space-y-3">
            <div className="text-sm font-semibold">{t('dermat_workflow.flow.production', 'Production by product')}</div>
            {lines.map((line) => {
              const lineCurrent = line.stages.find((stage) => stage.state === 'current') ?? null
              const phaseStages = lineCurrent ? line.stages.filter((stage) => stage.phase === lineCurrent.phase) : []
              return (
                <div key={line.lineId} className="rounded-lg border border-border p-3 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{line.productName ?? t('dermat_workflow.sheet.product', 'Product')}</div>
                      <div className="text-xs text-muted-foreground">
                        {[line.productCode, line.batchNumber ? `${t('dermat_workflow.batch', 'Batch')} ${line.batchNumber}` : null, line.quantity ? `${t('dermat_workflow.qty', 'Qty')} ${Number(line.quantity)}${line.quantityUnit ? ` ${line.quantityUnit}` : ''}` : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    {line.finished ? (
                      <StatusBadge variant="success">{t('dermat_workflow.flow.lineDone', 'Finished goods ready')}</StatusBadge>
                    ) : lineCurrent ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge variant="info">
                          {t('dermat_workflow.flow.linePhase', '{phase} · Stage {index} of {total}', {
                            phase: lineCurrent.phaseLabel ?? '',
                            index: phaseStages.findIndex((stage) => stage.code === lineCurrent.code) + 1,
                            total: phaseStages.length,
                          })}
                        </StatusBadge>
                        {inProduction ? (
                          <Button type="button" size="sm" onClick={() => openLineStage(line, lineCurrent.code)}>
                            {t('dermat_workflow.flow.completeStage', 'Complete {stage}', { stage: lineCurrent.name })}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <PhaseProgress line={line} onOpen={(code) => openLineStage(line, code)} />
                </div>
              )
            })}
          </div>
        ) : null}
      </CardContent>
      <StageSheet target={target} onOpenChange={(open) => { if (!open) setTarget(null) }} onChanged={handleChanged} />
    </Card>
  )
}

export default OrderFlowPanel
