'use client'

import * as React from 'react'
import Link from 'next/link'
import { Check, CheckCircle2, CirclePause, CirclePlay, FileStack, RotateCcw, SkipForward } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { HOLD_PARTIES, stageDef, stepStates, type StageField } from '../lib/stages'
import { cn } from '@open-mercato/shared/lib/utils'
import { STAGE_VARIANT, formatDate, formatDateTime, formatQty } from './format'
import type { Order, Stage } from './types'

export type StageActionRequest = {
  action: 'save' | 'complete' | 'hold' | 'resume' | 'revert' | 'skip' | 'assign' | 'step'
  stepKey?: string
  done?: boolean
  data?: Record<string, string | number | null>
  note?: string
  holdParty?: string
  responsibleUserId?: string | null
}

type StageWorkAreaProps = {
  order: Order
  stage: Stage | null
  people: Array<{ id: string; name: string }>
  canWork: boolean
  busy: boolean
  shortCount: number | null
  onAction: (stage: Stage, request: StageActionRequest) => Promise<boolean>
  variant?: 'sheet' | 'page'
}

type StageSheetProps = Omit<StageWorkAreaProps, 'variant'> & { onClose: () => void }

type Mode = 'form' | 'hold' | 'revert' | 'skip'

function display(field: StageField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (field.type === 'date') return formatDate(String(value))
  if (field.type === 'number') return formatQty(Number(value), 2)
  return String(value)
}

export function StageWorkArea({ order, stage, people, canWork, busy, shortCount, onAction, variant = 'sheet' }: StageWorkAreaProps) {
  const t = useT()
  const def = stage ? stageDef(stage.key) : undefined
  const [values, setValues] = React.useState<Record<string, string>>({})
  const [mode, setMode] = React.useState<Mode>('form')
  const [note, setNote] = React.useState('')
  const [party, setParty] = React.useState(HOLD_PARTIES[0])

  React.useEffect(() => {
    if (!stage) return
    const next: Record<string, string> = {}
    for (const [key, value] of Object.entries(stage.data ?? {})) next[key] = value === null || value === undefined ? '' : String(value)
    setValues(next)
    setMode('form')
    setNote('')
    setParty(HOLD_PARTIES[0])
  }, [stage])

  if (!stage || !def) return null

  const editable = canWork && (stage.status === 'open' || stage.status === 'on_hold') && order.status !== 'cancelled'
  const finished = stage.status === 'done' || stage.status === 'skipped'
  const dataPayload = () => {
    const data: Record<string, string | number | null> = {}
    for (const field of def.fields) {
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
            {(field.options ?? []).map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    if (field.type === 'textarea') return <Textarea rows={3} value={value} onChange={(event) => set(event.target.value)} />
    return (
      <Input
        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
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
            <span className="text-muted-foreground">{t('dermat_orders.sheet.responsible', 'Responsible')}</span>
            {canWork && order.status !== 'cancelled' ? (
              <Select
                value={stage.responsibleUserId ?? '__none'}
                onValueChange={(value) => run({ action: 'assign', responsibleUserId: value === '__none' ? null : value })}
              >
                <SelectTrigger className="mt-1 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">{t('dermat_orders.sheet.nobody', 'Not assigned')}</SelectItem>
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
            <span className="text-muted-foreground">{t('dermat_orders.sheet.time', 'Time in this stage')}</span>
            <p className="mt-1 font-medium">
              {stage.days == null ? '—' : t('dermat_orders.sheet.days', '{days} days', { days: formatQty(stage.days, 1) })}
              {stage.openedAt ? (
                <span className="block text-muted-foreground">
                  {t('dermat_orders.sheet.since', 'since {date}', { date: formatDateTime(stage.openedAt) })}
                </span>
              ) : null}
            </p>
          </div>
          {finished ? (
            <div className="col-span-2">
              <span className="text-muted-foreground">
                {stage.status === 'skipped'
                  ? t('dermat_orders.sheet.skippedBy', 'Skipped by')
                  : t('dermat_orders.sheet.doneBy', 'Completed by')}
              </span>
              <p className="mt-1 font-medium">
                {stage.completedByName ?? '—'}
                {stage.completedAt ? ` · ${formatDateTime(stage.completedAt)}` : ''}
              </p>
            </div>
          ) : null}
          {stage.status === 'on_hold' ? (
            <div className="col-span-2 rounded-md bg-status-error-bg p-2 text-status-error-text">
              <span className="font-semibold">{t('dermat_orders.sheet.onHold', 'On hold')}</span>
              {stage.holdParty ? ` · ${stage.holdParty}` : ''}
              <span className="block">{stage.holdReason}</span>
            </div>
          ) : null}
          {stage.status === 'waiting' ? (
            <p className="col-span-2 text-muted-foreground">
              {t('dermat_orders.sheet.waiting', 'Starts after: {stages}', {
                stages: def.after.map((key) => stageDef(key)?.label ?? key).join(', '),
              })}
            </p>
          ) : null}
        </div>

        {stage.key === 'formulation' ? (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t('dermat_orders.sheet.boms', 'BOM of each product')}</Label>
            <ul className="divide-y rounded-md border text-sm">
              {order.lines.map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate">{line.product?.title ?? '—'}</span>
                  {line.bom ? (
                    <Link href={`/backend/boms/${line.bom.id}`} className="shrink-0 hover:underline">
                      <StatusBadge variant={line.bom.status === 'approved' ? 'success' : 'warning'}>
                        {line.bom.status === 'approved'
                          ? t('dermat_orders.sheet.bomOk', 'v{version} approved', { version: line.bom.version })
                          : t('dermat_orders.sheet.bomDraft', 'v{version} draft', { version: line.bom.version })}
                      </StatusBadge>
                    </Link>
                  ) : (
                    <Link
                      href={`/backend/boms/new?productId=${line.productId}`}
                      className="inline-flex shrink-0 items-center gap-1 text-xs text-status-warning-text hover:underline"
                    >
                      <FileStack className="h-3.5 w-3.5" />
                      {t('dermat_orders.sheet.makeBom', 'Make BOM')}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {stage.key === 'planning' && shortCount !== null ? (
          <p
            className={
              shortCount
                ? 'rounded-md bg-status-warning-bg p-2 text-xs text-status-warning-text'
                : 'rounded-md bg-status-success-bg p-2 text-xs text-status-success-text'
            }
          >
            {shortCount
              ? t('dermat_orders.sheet.short', '{count} materials are short for this order — see Materials below.', { count: shortCount })
              : t('dermat_orders.sheet.allStock', 'All materials for this order are in stock.')}
          </p>
        ) : null}

        {def.steps.length ? (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t('dermat_orders.sheet.steps', 'Steps')}</Label>
            <ul className="divide-y rounded-md border">
              {def.steps.map((step, index) => {
                const state = stepStates(stage.data)[step.key]
                const checked = Boolean(state?.done)
                return (
                  <li key={step.key}>
                    <button
                      type="button"
                      disabled={!editable || busy}
                      onClick={() => run({ action: 'step', stepKey: step.key, done: !checked })}
                      className="flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40 disabled:cursor-default disabled:hover:bg-transparent"
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                          checked ? 'border-status-success-border bg-status-success-bg text-status-success-text' : 'border-input',
                        )}
                      >
                        {checked ? <Check className="h-3 w-3" /> : null}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn(checked && 'text-muted-foreground line-through')}>
                          {index + 1}. {step.label}
                        </span>
                        {step.optional ? (
                          <span className="ml-1 text-xs text-muted-foreground">{t('dermat_orders.sheet.optional', '(if needed)')}</span>
                        ) : null}
                        {checked && state?.at ? (
                          <span className="block text-xs text-muted-foreground">
                            {[state.by, formatDateTime(state.at)].filter(Boolean).join(' · ')}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ) : null}

        {mode === 'form' ? (
          <div className="space-y-4">
            {def.fields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {field.label}
                  {field.required && editable ? ' *' : ''}
                </Label>
                {renderInput(field)}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border p-3">
            <h4 className="text-sm font-semibold">
              {mode === 'hold'
                ? t('dermat_orders.sheet.holdTitle', 'Put on hold')
                : mode === 'skip'
                  ? t('dermat_orders.sheet.skipTitle', 'Skip this stage')
                  : t('dermat_orders.sheet.revertTitle', 'Reopen this stage')}
            </h4>
            {mode === 'hold' ? (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('dermat_orders.sheet.whoseSide', 'Waiting on')}</Label>
                <Select value={party} onValueChange={setParty}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOLD_PARTIES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {mode === 'skip' ? t('dermat_orders.sheet.why', 'Why (optional)') : t('dermat_orders.sheet.reason', 'Reason *')}
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
                      ? { action: 'hold', note, holdParty: party, data: dataPayload() }
                      : mode === 'skip'
                        ? { action: 'skip', note }
                        : { action: 'revert', note },
                  )
                }
              >
                {mode === 'hold'
                  ? t('dermat_orders.sheet.hold', 'Put on hold')
                  : mode === 'skip'
                    ? t('dermat_orders.sheet.skip', 'Skip')
                    : t('dermat_orders.sheet.reopen', 'Reopen')}
              </Button>
            </div>
          </div>
        )}
      </div>

      {canWork && order.status !== 'cancelled' && mode === 'form' ? (
        <div className={cn('flex flex-wrap justify-end gap-2 border-t p-4', variant === 'page' && 'sticky bottom-0 bg-card')}>
          {stage.status === 'open' ? (
            <>
              {def.canSkip ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setMode('skip')} disabled={busy}>
                  <SkipForward className="mr-1.5 h-4 w-4" />
                  {t('dermat_orders.sheet.skip', 'Skip')}
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={() => setMode('hold')} disabled={busy}>
                <CirclePause className="mr-1.5 h-4 w-4" />
                {t('dermat_orders.sheet.hold', 'Put on hold')}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => run({ action: 'save', data: dataPayload() })}
                disabled={busy}
              >
                {t('dermat_orders.sheet.save', 'Save')}
              </Button>
              <Button type="button" size="sm" onClick={() => run({ action: 'complete', data: dataPayload() })} disabled={busy}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" />
                {t('dermat_orders.sheet.complete', 'Mark done')}
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
                {t('dermat_orders.sheet.save', 'Save')}
              </Button>
              <Button type="button" size="sm" onClick={() => run({ action: 'resume' })} disabled={busy}>
                <CirclePlay className="mr-1.5 h-4 w-4" />
                {t('dermat_orders.sheet.resume', 'Resume')}
              </Button>
            </>
          ) : null}
          {finished && stage.key !== 'order' ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setMode('revert')} disabled={busy}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {t('dermat_orders.sheet.reopen', 'Reopen')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}

export function StageSheet({ order, stage, people, canWork, busy, shortCount, onClose, onAction }: StageSheetProps) {
  const t = useT()
  const def = stage ? stageDef(stage.key) : undefined
  if (!stage || !def) return null
  return (
    <Sheet open={Boolean(stage)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-4">
          <div className="flex items-center gap-2">
            <SheetTitle>{def.label}</SheetTitle>
            <StatusBadge variant={STAGE_VARIANT[stage.status] ?? 'neutral'} dot>
              {t(`dermat_orders.stageStatus.${stage.status}`, stage.status.replace('_', ' '))}
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
              {t('dermat_orders.sheet.fullPage', 'Open the full stage page →')}
            </Link>
          </SheetDescription>
        </SheetHeader>
        <StageWorkArea
          order={order}
          stage={stage}
          people={people}
          canWork={canWork}
          busy={busy}
          shortCount={shortCount}
          onAction={onAction}
          variant="sheet"
        />
      </SheetContent>
    </Sheet>
  )
}

export default StageSheet
