'use client'

import * as React from 'react'
import { ListSelectItems } from '../../cc_lists/components/ListSelectItems'
import Link from 'next/link'
import { Check, CheckCircle2, CirclePause, CirclePlay, Hourglass, Lock, Play, RotateCcw, SkipForward, Wallet } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { isMoneyStageField } from '../lib/moneyFields'
import { HOLD_PARTIES, reopenBlock, reopenUntilText, stageList, WORK_STATE_LABEL, stageDef, stageWorkFeature, workState, type StageField, type WorkState } from '../lib/stages'
import { useGranted } from '../../cc_departments/components/useGranted'
import { StageDocuments } from './StageDocuments'
import { FulfilmentPanel } from './FulfilmentPanel'
import { StageHistory } from './OrderHistory'
import { SuggestInput } from '../../cc_lists/components/SuggestInput'
import { cn } from '@open-mercato/shared/lib/utils'
import { STAGE_VARIANT, formatDate, formatDateTime, formatQty } from './format'
import { SubStageTracker } from './SubStageTracker'
import type { Order, Stage } from './types'
import { useStageSettings } from './useStageSettings'

export type StageActionRequest = {
  action: 'start' | 'save' | 'complete' | 'hold' | 'resume' | 'revert' | 'skip' | 'assign' | 'step' | 'delivered'
  stepKey?: string
  done?: boolean
  data?: Record<string, string | number | null>
  note?: string
  holdParty?: string
  followUpOn?: string | null
  responsibleUserId?: string | null
}

type StageWorkAreaProps = {
  order: Order
  stage: Stage | null
  people: Array<{ id: string; name: string }>
  canWork: boolean
  busy: boolean
  onAction: (stage: Stage, request: StageActionRequest) => Promise<boolean>
  variant?: 'sheet' | 'page'
}

export const WORK_STATE_VARIANT: Record<WorkState, 'neutral' | 'warning' | 'info' | 'error' | 'success'> = {
  coming: 'neutral',
  pending: 'warning',
  in_progress: 'info',
  on_hold: 'error',
  completed: 'success',
  skipped: 'neutral',
}

function rupees(value: number): string {
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(value)}`
}

type StageSheetProps = Omit<StageWorkAreaProps, 'variant'> & { onClose: () => void; onPickStage?: (stageKey: string) => void }

function StageStrip({ order, current, onPick }: { order: Order; current: string; onPick: (stageKey: string) => void }) {
  const t = useT()
  const byKey = new Map(order.stages.map((entry) => [entry.key, entry]))
  return (
    <nav aria-label={t('cc_orders.sheet.allStages', 'All stages')} className="flex flex-wrap gap-1 border-b bg-muted/20 px-4 py-2">
      {stageList()
        .filter((def) => def.key !== 'order')
        .map((def) => {
          const status = byKey.get(def.key)?.status ?? 'waiting'
          const done = status === 'done' || status === 'skipped'
          const active = status === 'open' || status === 'on_hold'
          return (
            <button
              key={def.key}
              type="button"
              onClick={() => onPick(def.key)}
              aria-current={def.key === current ? 'step' : undefined}
              title={`${def.label} · ${t(`cc_orders.stageStatus.${status}`, status.replace('_', ' '))}`}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                done && 'border-status-success-border bg-status-success-bg text-status-success-text',
                active && status === 'open' && 'border-primary bg-primary/10 font-semibold text-primary',
                status === 'on_hold' && 'border-status-warning-border bg-status-warning-bg font-semibold text-status-warning-text',
                !done && !active && 'border-dashed text-muted-foreground opacity-60 hover:opacity-100',
                def.key === current && 'ring-2 ring-ring ring-offset-1',
              )}
            >
              {done ? <Check className="h-3 w-3" aria-hidden="true" /> : !active ? <Lock className="h-3 w-3" aria-hidden="true" /> : null}
              {def.label}
            </button>
          )
        })}
    </nav>
  )
}

type Mode = 'form' | 'hold' | 'revert' | 'skip'

function display(field: StageField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (field.type === 'date') return formatDate(String(value))
  if (field.type === 'number') return formatQty(Number(value), 2)
  return String(value)
}

export function StageWorkArea({ order, stage, people, canWork: canWorkProp, busy, onAction, variant = 'sheet' }: StageWorkAreaProps) {
  const granted = useGranted()
  const canWork = canWorkProp && Boolean(stage) && granted.has(stageWorkFeature(stage?.key ?? ''))
  const canReopenLate = canWorkProp && granted.has('cc_orders.reopen')
  const t = useT()
  useStageSettings()
  const def = stage ? stageDef(stage.key) : undefined
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [mode, setMode] = React.useState<Mode>('form')
  const [note, setNote] = React.useState('')
  const [party, setParty] = React.useState(HOLD_PARTIES[0])
  const [followUp, setFollowUp] = React.useState('')

  React.useEffect(() => {
    if (!stage) return
    const next: Record<string, string> = {}
    for (const [key, value] of Object.entries(stage.data ?? {})) next[key] = value === null || value === undefined ? '' : String(value)
    if (stage.key === 'advance' && !next.advance_amount) {
      const advance = order.payments?.items.find((payment) => payment.kind === 'advance' && !payment.voided)
      if (advance) {
        next.advance_amount = String(advance.amount)
        if (!next.received_on) next.received_on = advance.paidOn
        if (!next.payment_ref && advance.reference) next.payment_ref = advance.reference
      }
    }
    setValues(next)
    setMode('form')
    setNote('')
    setParty(HOLD_PARTIES[0])
  }, [stage, order.payments])

  if (!stage || !def) return null
  const state = workState(stage.status, stage.data)

  const editable = canWork && (stage.status === 'open' || stage.status === 'on_hold') && order.status !== 'cancelled'
  const nextLabels = stageList().filter((entry) => entry.after.includes(stage.key)).map((entry) => entry.label)
  const finished = stage.status === 'done' || stage.status === 'skipped'
  const reopenable = finished && stage.key !== 'order'
  const reopenBlocked = stage.reopen ? reopenBlock(stage.reopen) : null
  const reopenUntil = stage.reopen ? reopenUntilText(stage.reopen) : null
  const canReopen = reopenable && ((canWork && !reopenBlocked) || canReopenLate)
  const backToWaiting = (() => {
    const later = new Set<string>()
    const walk = (key: string) => {
      for (const entry of stageList()) if (entry.after.includes(key) && !later.has(entry.key)) { later.add(entry.key); walk(entry.key) }
    }
    walk(stage.key)
    return order.stages.filter((entry) => later.has(entry.key) && (entry.status === 'open' || entry.status === 'on_hold')).map((entry) => entry.label)
  })()
  const formFields = def.fields.filter((field) => order.canSeeMoney !== false || !isMoneyStageField(stage.key, field.key))
  const dataPayload = () => {
    const data: Record<string, string | number | null> = {}
    for (const field of formFields) {
      const raw = values[field.key] ?? ''
      data[field.key] = field.type === 'number' ? (raw.trim() === '' ? null : Number(raw)) : raw
    }
    return data
  }

  const run = async (request: StageActionRequest) => {
    const ok = await onAction(stage, request)
    if (ok && request.action !== 'save' && request.action !== 'assign' && request.action !== 'step') setMode('form')
    return ok
  }

  const renderInput = (field: StageField) => {
    const value = values[field.key] ?? ''
    const set = (next: string) => setValues((prev) => ({ ...prev, [field.key]: next }))
    if (!editable) return <p className="text-sm">{display(field, stage.data?.[field.key])}</p>
    if (field.type === 'select') {
      return (
        <Select value={value || '__none'} onValueChange={(next) => set(next === '__none' ? '' : next)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none">—</SelectItem>
            <ListSelectItems listKey={field.listKey} fallback={field.options} current={value} />
          </SelectContent>
        </Select>
      )
    }
    if (field.type === 'textarea') return <Textarea rows={3} value={value} onChange={(event) => set(event.target.value)} />
    if (field.type === 'text' && field.listKey) return <SuggestInput listKey={field.listKey} value={value} placeholder={field.placeholder} onChange={(event) => set(event.target.value)} />
    return (
      <Input
        type={field.type === 'date' ? 'date' : field.type === 'time' ? 'time' : field.type === 'number' ? 'number' : 'text'}
        step={field.type === 'number' ? 'any' : undefined}
        value={value}
        placeholder={field.placeholder}
        onChange={(event) => set(event.target.value)}
      />
    )
  }

  return (
    <>
      <div
        className={cn('space-y-5 p-4', variant === 'sheet' && 'flex-1 overflow-auto')}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && editable && mode === 'form') {
            event.preventDefault()
            run({ action: 'complete', data: dataPayload() })
          }
        }}
      >
        <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/20 p-3 text-xs">
          <div>
            <span className="text-muted-foreground">{t('cc_orders.sheet.responsible', 'Responsible')}</span>
            {canWork && order.status !== 'cancelled' ? (
              <Select
                value={stage.responsibleUserId ?? '__none'}
                onValueChange={(value) => run({ action: 'assign', responsibleUserId: value === '__none' ? null : value })}
              >
                <SelectTrigger className="mt-1 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t('cc_orders.sheet.nobody', 'Not assigned')}</SelectItem>
                  {people.map((person) => (
                    <SelectItem key={person.id} value={person.id}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="mt-1 font-medium">{stage.responsibleName ?? '—'}</p>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">{t('cc_orders.sheet.time', 'Time in this stage')}</span>
            <p className="mt-1 font-medium">
              {stage.days == null ? '—' : t('cc_orders.sheet.days', '{days} days', { days: formatQty(stage.days, 1) })}
              {stage.openedAt ? (
                <span className="block text-muted-foreground">
                  {t('cc_orders.sheet.since', 'since {date}', { date: formatDateTime(stage.openedAt) })}
                </span>
              ) : null}
            </p>
          </div>
          {finished ? (
            <div className="col-span-2">
              <span className="text-muted-foreground">
                {stage.status === 'skipped'
                  ? t('cc_orders.sheet.skippedBy', 'Skipped by')
                  : t('cc_orders.sheet.doneBy', 'Completed by')}
              </span>
              <p className="mt-1 font-medium">
                {stage.completedByName ?? '—'}
                {stage.completedAt ? ` · ${formatDateTime(stage.completedAt)}` : ''}
              </p>
            </div>
          ) : null}
          {stage.status === 'on_hold' ? (
            <div className="col-span-2 rounded-md bg-status-error-bg p-2 text-status-error-text">
              <span className="font-semibold">{t('cc_orders.sheet.onHold', 'On hold')}</span>
              {stage.holdParty ? ` · ${stage.holdParty}` : ''}
              <span className="block">{stage.holdReason}</span>
            </div>
          ) : null}
          {stage.status === 'waiting' ? (
            <p className="col-span-2 font-medium text-muted-foreground">
              {t('cc_orders.sheet.locked', 'Locked. You can look but not complete this stage yet.')}{' '}
              {t('cc_orders.sheet.waiting', 'It opens when these are done: {stages}', {
                stages: def.after.map((key) => stageDef(key)?.label ?? key).join(', '),
              })}
            </p>
          ) : null}
          <div className="col-span-2 flex items-center gap-2">
            <span className="text-muted-foreground">{t('cc_orders.sheet.workState', 'Task')}</span>
            <StatusBadge variant={WORK_STATE_VARIANT[state]} dot>
              {t(`cc_orders.workState.${state}`, WORK_STATE_LABEL[state])}
            </StatusBadge>
          </div>
        </div>

        {state === 'pending' && editable ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-warning-border bg-status-warning-bg p-3">
            <span className="flex min-w-0 items-start gap-2 text-sm text-status-warning-text">
              <Hourglass className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="block font-semibold">{t('cc_orders.sheet.pendingTitle', 'Pending with {department}', { department: def.department })}</span>
                <span className="block text-xs">{t('cc_orders.sheet.pendingHint', 'Start the work so everyone sees it is being done. Saving the form also starts it.')}</span>
              </span>
            </span>
            <Button type="button" size="sm" onClick={() => run({ action: 'start' })} disabled={busy}>
              <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_orders.sheet.start', 'Start work')}
            </Button>
          </div>
        ) : null}

        {stage.key === 'advance' ? (
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              {t('cc_orders.sheet.advanceCheck', 'Check the advance')}
            </Label>
            {order.payments?.items.filter((payment) => !payment.voided).length ? (
              <ul className="divide-y rounded-md border text-sm">
                {order.payments.items
                  .filter((payment) => !payment.voided)
                  .map((payment) => (
                    <li key={payment.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block font-medium capitalize">{payment.kind}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {formatDate(payment.paidOn)}
                          {payment.reference ? ` · ${payment.reference}` : ''}
                          {payment.byName ? ` · ${payment.byName}` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold tabular-nums">{rupees(payment.amount)}</span>
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                {t('cc_orders.sheet.noAdvance', 'No payment recorded yet. Enter the advance below when it reaches the bank.')}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {order.totals?.total
                ? t('cc_orders.sheet.advanceTotals', 'Order value {total} · received {received} · due {due}. Match the amount with the bank, correct it below if it differs, then verify.', {
                    total: rupees(order.totals.total),
                    received: rupees(order.payments?.received ?? 0),
                    due: rupees(order.payments?.due ?? 0),
                  })
                : t('cc_orders.sheet.advanceNoRates', 'No rates on this order yet, so the due amount is not known. Match the amount with the bank, then verify.')}
            </p>
          </div>
        ) : null}

        <SubStageTracker order={order} stage={stage} editable={editable} busy={busy} onStep={(stepKey, done) => run({ action: 'step', stepKey, done })} />

        {stage.key === 'dispatch' && stage.status === 'done' && (granted.has('cc_orders.work.dispatch') || granted.has('cc_orders.manage')) ? (
          <DeliveredBox
            deliveredOn={typeof stage.data?.delivered_on === 'string' ? stage.data.delivered_on : null}
            busy={busy}
            onMark={(date, receivedNote) => run({ action: 'delivered', data: { delivered_on: date }, note: receivedNote || undefined })}
          />
        ) : null}
        {!canWork && granted.ready && canWorkProp && (stage.status === 'open' || stage.status === 'on_hold') ? (
          <p className="rounded-md border border-status-info-border bg-status-info-bg px-3 py-2 text-xs text-status-info-text">
            {t('cc_orders.sheet.viewOnly', 'View only: {department} works on this stage. Your role can see it but not change it.', { department: def.department })}
          </p>
        ) : null}
        {mode === 'form' ? <StageHistory events={order.events} stageKey={stage.key} /> : null}
        {mode === 'form' ? (
          <div className="space-y-4">
            {formFields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {field.label}
                  {field.required && editable ? ' *' : ''}
                </Label>
                {renderInput(field)}
              </div>
            ))}
            {stage.status !== 'waiting' && ['allocation', 'qc', 'packing', 'dispatch'].includes(stage.key) ? (
              <FulfilmentPanel orderId={order.id} stageKey={stage.key} stageStatus={stage.status} editable={canWork} />
            ) : null}
            {stage.status !== 'waiting' ? (
              <StageDocuments orderId={order.id} stageKey={stage.key} documents={order.documents?.[stage.key] ?? []} editable={editable} />
            ) : null}
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border p-3">
            <h4 className="text-sm font-semibold">
              {mode === 'hold'
                ? t('cc_orders.sheet.holdTitle', 'Put on hold')
                : mode === 'skip'
                  ? t('cc_orders.sheet.skipTitle', 'Skip this stage')
                  : t('cc_orders.sheet.revertTitle', 'Reopen this stage')}
            </h4>
            {mode === 'hold' ? (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('cc_orders.sheet.whoseSide', 'Waiting on')}</Label>
                <Select value={party} onValueChange={setParty}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <ListSelectItems listKey="hold_parties" current={party} />
                  </SelectContent>
                </Select>
                <Label htmlFor="hold-follow-up" className="block pt-2 text-xs text-muted-foreground">
                  {t('cc_orders.sheet.followUp', 'Follow up on')}
                </Label>
                <Input id="hold-follow-up" type="date" value={followUp} onChange={(event) => setFollowUp(event.target.value)} />
              </div>
            ) : null}
            {mode === 'revert' ? (
              <div className="space-y-2 text-xs">
                {reopenBlocked ? (
                  <p className="rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-status-warning-text">
                    {t('cc_orders.sheet.reopenLate', '{reason} You are reopening it with the manager right; this is written in the order history.', { reason: reopenBlocked })}
                  </p>
                ) : null}
                {stage.reopen?.stockMoved ? (
                  <p className="rounded-md border border-status-warning-border bg-status-warning-bg px-3 py-2 text-status-warning-text">
                    {t('cc_orders.sheet.reopenStock', 'Stock already moved for this stage stays as it is, and finishing the stage again will not move it a second time. If a quantity was wrong, correct it in Store stock.')}
                  </p>
                ) : null}
                {backToWaiting.length ? (
                  <p className="text-muted-foreground">
                    {t('cc_orders.sheet.reopenPauses', 'These go back to waiting and their department is told: {stages}', { stages: backToWaiting.join(', ') })}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {mode === 'skip' ? t('cc_orders.sheet.why', 'Why (optional)') : t('cc_orders.sheet.reason', 'Reason *')}
              </Label>
              <Textarea
                autoFocus
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation()
                    setMode('form')
                  }
                }}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setMode('form')} disabled={busy}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={busy || (mode !== 'skip' && !note.trim())}
                onClick={() =>
                  run(
                    mode === 'hold'
                      ? { action: 'hold', note, holdParty: party, followUpOn: followUp || null, data: dataPayload() }
                      : mode === 'skip'
                        ? { action: 'skip', note }
                        : { action: 'revert', note },
                  )
                }
              >
                {mode === 'hold'
                  ? t('cc_orders.sheet.hold', 'Put on hold')
                  : mode === 'skip'
                    ? t('cc_orders.sheet.skip', 'Skip')
                    : t('cc_orders.sheet.reopen', 'Reopen')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {(canWork || (reopenable && canReopenLate)) && order.status !== 'cancelled' && mode === 'form' ? (
        <div className={cn('flex flex-wrap justify-end gap-2 border-t p-4', variant === 'page' && 'sticky bottom-0 bg-card')}>
          {stage.status === 'open' ? (
            <>
              {def.canSkip ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setMode('skip')} disabled={busy}>
                  <SkipForward className="mr-1.5 h-4 w-4" />
                  {t('cc_orders.sheet.skip', 'Skip')}
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={() => setMode('hold')} disabled={busy}>
                <CirclePause className="mr-1.5 h-4 w-4" />
                {t('cc_orders.sheet.hold', 'Put on hold')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => run({ action: 'save', data: dataPayload() })}
                disabled={busy}
              >
                {t('cc_orders.sheet.save', 'Save')}
              </Button>
              <Button type="button" size="sm" onClick={() => run({ action: 'complete', data: dataPayload() })} disabled={busy}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                {stage.key === 'advance'
                  ? t('cc_orders.sheet.verifySend', 'Verified — send to {next}', { next: nextLabels.join(' + ') })
                  : nextLabels.length
                  ? t('cc_orders.sheet.completeSend', 'Done — send to {next}', { next: nextLabels.join(' + ') })
                  : t('cc_orders.sheet.completeLast', 'Done — close the order')}
              </Button>
            </>
          ) : null}
          {stage.status === 'on_hold' ? (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => run({ action: 'save', data: dataPayload() })}
                disabled={busy}
              >
                {t('cc_orders.sheet.save', 'Save')}
              </Button>
              <Button type="button" size="sm" onClick={() => run({ action: 'resume' })} disabled={busy}>
                <CirclePlay className="mr-1.5 h-4 w-4" />
                {t('cc_orders.sheet.resume', 'Resume')}
              </Button>
            </>
          ) : null}
          {reopenable ? (
            <div className="flex w-full flex-wrap items-center justify-end gap-3">
              <p className="mr-auto text-xs text-muted-foreground">
                {!reopenBlocked && reopenUntil
                  ? t('cc_orders.sheet.reopenUntil', 'Found a mistake? You can reopen this until {time}.', { time: reopenUntil })
                  : canReopenLate
                    ? t('cc_orders.sheet.reopenManager', '{reason} You can still reopen it as a manager.', { reason: reopenBlocked ?? '' })
                    : t('cc_orders.sheet.reopenClosed', '{reason} Ask a manager if it must be reopened.', { reason: reopenBlocked ?? '' })}
              </p>
              {canReopen ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setMode('revert')} disabled={busy}>
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  {reopenBlocked ? t('cc_orders.sheet.reopenAsManager', 'Reopen as manager') : t('cc_orders.sheet.reopen', 'Reopen')}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  )
}


function DeliveredBox({ deliveredOn, busy, onMark }: { deliveredOn: string | null; busy: boolean; onMark: (date: string, note: string) => Promise<boolean> }) {
  const t = useT()
  useStageSettings()
  const [date, setDate] = React.useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
  const [note, setNote] = React.useState('')
  if (deliveredOn) {
    return (
      <p className="rounded-md border border-status-success-border bg-status-success-bg px-3 py-2 text-sm text-status-success-text">
        {t('cc_orders.sheet.deliveredOn', 'Delivered to the client on {date}.', { date: formatDate(deliveredOn) })}
      </p>
    )
  }
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">{t('cc_orders.sheet.deliveredTitle', 'Did the goods reach the customer?')}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label={t('cc_orders.sheet.deliveredDate', 'Delivered on')} />
        <Input className="sm:col-span-2" value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('cc_orders.sheet.deliveredNote', 'Received by / POD no. (optional)')} aria-label={t('cc_orders.sheet.deliveredNoteLabel', 'Received by')} />
      </div>
      <Button type="button" size="sm" disabled={busy || !date} onClick={() => void onMark(date, note.trim())}>
        {t('cc_orders.sheet.markDelivered', 'Mark delivered')}
      </Button>
    </div>
  )
}

export function StageSheet({ order, stage, people, canWork, busy, onClose, onAction, onPickStage }: StageSheetProps) {
  const t = useT()
  useStageSettings()
  const def = stage ? stageDef(stage.key) : undefined
  if (!stage || !def) return null
  return (
    <Sheet open={Boolean(stage)} modal={false} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-4">
          <div className="flex items-center gap-2">
            <SheetTitle>{def.label}</SheetTitle>
            <StatusBadge variant={STAGE_VARIANT[stage.status] ?? 'neutral'} dot>
              {t(`cc_orders.stageStatus.${stage.status}`, stage.status.replace('_', ' '))}
            </StatusBadge>
          </div>
          <SheetDescription className="text-xs">
            <Link href={`/backend/orders/${order.id}`} className="font-mono font-semibold text-primary hover:underline">
              {order.orderNo}
            </Link>
            {order.customer?.name ? ` · ${order.customer.name}` : ''}
            {` · ${order.lines.map((line) => `${line.product?.title ?? ''} × ${formatQty(line.quantity, 0)}`).join(', ')}`}
            <span className="mt-1 block">
              {def.department} · {def.hint}
            </span>
            <Link
              href={`/backend/orders/${order.id}/stages/${stage.key}`}
              className="mt-1 inline-block font-medium text-primary hover:underline"
            >
              {t('cc_orders.sheet.fullPage', 'Open the full stage page →')}
            </Link>
          </SheetDescription>
        </SheetHeader>
        {onPickStage ? <StageStrip order={order} current={stage.key} onPick={onPickStage} /> : null}
        {stage.status === 'waiting' ? (
          <p className="mx-4 mt-3 rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
            {t('cc_orders.sheet.waitingPreview', 'Not started yet. This is a preview of what {department} will fill in once the stages before it are done.', { department: def.department })}
          </p>
        ) : null}
        <StageWorkArea
          order={order}
          stage={stage}
          people={people}
          canWork={canWork}
          busy={busy}
          onAction={onAction}
          variant="sheet"
        />
      </SheetContent>
    </Sheet>
  )
}

export default StageSheet
