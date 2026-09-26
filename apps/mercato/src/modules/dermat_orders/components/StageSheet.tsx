'use client'

import * as React from 'react'
import { ListSelectItems } from '../../dermat_lists/components/ListSelectItems'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Check, CheckCircle2, CirclePause, CirclePlay, FileStack, Hourglass, Lock, PackagePlus, Play, RotateCcw, SkipForward, Wallet } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { HOLD_PARTIES, STAGES, WORK_STATE_LABEL, stageDef, stageWorkFeature, workState, type StageField, type WorkState } from '../lib/stages'
import { useGranted } from '../../dermat_departments/components/useGranted'
import { StageDocuments } from './StageDocuments'
import { SuggestInput } from '../../dermat_lists/components/SuggestInput'
import { cn } from '@open-mercato/shared/lib/utils'
import { STAGE_VARIANT, formatDate, formatDateTime, formatQty } from './format'
import { ProductionPanel } from './ProductionPanel'
import { SubStageTracker } from './SubStageTracker'
import { PackItemsPanel, SampleRoundsPanel } from './ArtworkPanels'
import { ProductionRoundsPanel, QaArtworkChecklist, QaReleaseReview } from './QualityPanels'
import type { Order, Stage } from './types'

export type StageActionRequest = {
  action: 'start' | 'checklist' | 'rework' | 'reject_batch' | 'save' | 'complete' | 'hold' | 'resume' | 'revert' | 'skip' | 'assign' | 'step' | 'pm_status' | 'new_round' | 'delivered'
  stepKey?: string
  productId?: string
  pmStatus?: string
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

const STORE_STAGES = ['manufacturing', 'filling', 'packing']
const STORE_VARIANT = { requested: 'warning', partly_issued: 'info', issued: 'info', received: 'success', used: 'neutral', cancelled: 'error' } as const
const STORE_LABEL = { requested: 'Requested', partly_issued: 'Partly issued', issued: 'Issued', received: 'Received', used: 'Used', cancelled: 'Cancelled' } as const

const QC_PART_VARIANT = { pending: 'warning', pass: 'success', fail: 'error', na: 'neutral' } as const

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

type StageSheetProps = Omit<StageWorkAreaProps, 'variant'> & { onClose: () => void }

type Mode = 'form' | 'hold' | 'revert' | 'skip'

function display(field: StageField, value: unknown): string {
  if (value === undefined || value === null || value === '') return '—'
  if (field.type === 'date') return formatDate(String(value))
  if (field.type === 'number') return formatQty(Number(value), 2)
  return String(value)
}

export function StageWorkArea({ order, stage, people, canWork: canWorkProp, busy, shortCount, onAction, variant = 'sheet' }: StageWorkAreaProps) {
  const granted = useGranted()
  const canWork = canWorkProp && Boolean(stage) && granted.has(stageWorkFeature(stage?.key ?? ''))
  const router = useRouter()
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
  const nextLabels = STAGES.filter((entry) => entry.after.includes(stage.key)).map((entry) => entry.label)
  const onOrderCopy = async (productId: string) => {
    const call = await apiCall<{ id?: string; error?: string }>('/api/dermat_boms/boms/order-copy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId: order.id, productId }),
    })
    if (call.result?.id) router.push(`/backend/boms/${call.result.id}`)
    else flash(call.result?.error ?? t('dermat_orders.sheet.orderBomError', 'Could not make the order BOM.'), 'error')
  }
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
            <p className="col-span-2 font-medium text-muted-foreground">
              {t('dermat_orders.sheet.locked', 'Locked. You can look but not complete this stage yet.')}{' '}
              {t('dermat_orders.sheet.waiting', 'It opens when these are done: {stages}', {
                stages: def.after.map((key) => stageDef(key)?.label ?? key).join(', '),
              })}
            </p>
          ) : null}
          <div className="col-span-2 flex items-center gap-2">
            <span className="text-muted-foreground">{t('dermat_orders.sheet.workState', 'Task')}</span>
            <StatusBadge variant={WORK_STATE_VARIANT[state]} dot>
              {t(`dermat_orders.workState.${state}`, WORK_STATE_LABEL[state])}
            </StatusBadge>
          </div>
        </div>

        {state === 'pending' && editable ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-status-warning-border bg-status-warning-bg p-3">
            <span className="flex min-w-0 items-start gap-2 text-sm text-status-warning-text">
              <Hourglass className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="block font-semibold">{t('dermat_orders.sheet.pendingTitle', 'Pending with {department}', { department: def.department })}</span>
                <span className="block text-xs">{t('dermat_orders.sheet.pendingHint', 'Start the work so everyone sees it is being done. Saving the form also starts it.')}</span>
              </span>
            </span>
            <Button type="button" size="sm" onClick={() => run({ action: 'start' })} disabled={busy}>
              <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('dermat_orders.sheet.start', 'Start work')}
            </Button>
          </div>
        ) : null}

        {stage.key === 'advance' ? (
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
              {t('dermat_orders.sheet.advanceCheck', 'Check the advance')}
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
                {t('dermat_orders.sheet.noAdvance', 'No payment recorded yet. Enter the advance below when it reaches the bank.')}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {order.totals?.total
                ? t('dermat_orders.sheet.advanceTotals', 'Order value {total} · received {received} · due {due}. Match the amount with the bank, correct it below if it differs, then verify.', {
                    total: rupees(order.totals.total),
                    received: rupees(order.payments?.received ?? 0),
                    due: rupees(order.payments?.due ?? 0),
                  })
                : t('dermat_orders.sheet.advanceNoRates', 'No rates on this order yet, so the due amount is not known. Match the amount with the bank, then verify.')}
            </p>
          </div>
        ) : null}

        {stage.key === 'formulation' ? (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t('dermat_orders.sheet.boms', 'BOM of each product')}</Label>
            <ul className="divide-y rounded-md border text-sm">
              {order.lines.map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0 truncate">{line.product?.title ?? '—'}</span>
                  {line.bom && editable && !line.bom.orderId ? (
                    <button type="button" className="shrink-0 text-xs text-primary hover:underline" onClick={() => onOrderCopy(line.productId)}>
                      {t('dermat_orders.sheet.orderBom', 'Change for this order')}
                    </button>
                  ) : null}
                  {line.bom?.orderId ? <span className="shrink-0 rounded-sm bg-status-info-bg px-1.5 py-0.5 text-xs text-status-info-text">{t('dermat_orders.sheet.orderBomTag', 'order BOM')}</span> : null}
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

        {stage.key === 'planning' ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">{t('dermat_orders.sheet.reserved', 'Stock reserved for this order')}</Label>
              <Link href={`/backend/planning?orders=${order.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                {t('dermat_orders.sheet.openBoard', 'Plan and reserve')}
              </Link>
            </div>
            {order.reservations?.length ? (
              <ul className="divide-y rounded-md border text-sm">
                {order.reservations.map((entry) => (
                  <li key={entry.productId} className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="min-w-0 truncate">{entry.title}</span>
                    <span className="shrink-0 text-right text-xs tabular-nums">
                      <span className="block font-medium">{formatQty(entry.quantity)} {entry.unit ?? ''}</span>
                      <span className="text-muted-foreground">{t('dermat_orders.sheet.since', 'since {date}', { date: formatDate(entry.since) })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                {t('dermat_orders.sheet.noReservation', 'Nothing reserved yet. Open the planning board to reserve stock for this order; it stays held until the store issues it.')}
              </p>
            )}
          </div>
        ) : null}

        {STORE_STAGES.includes(stage.key) ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground">{t('dermat_orders.sheet.store', 'Material from the store')}</Label>
              {editable ? (
                <Link
                  href={`/backend/store/requests/new?orderId=${order.id}&stageKey=${stage.key}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <PackagePlus className="h-3.5 w-3.5" aria-hidden="true" />
                  {t('dermat_orders.sheet.askStore', 'Ask the store')}
                </Link>
              ) : null}
            </div>
            {order.store?.[stage.key]?.length ? (
              <ul className="divide-y rounded-md border text-sm">
                {order.store[stage.key].map((request) => (
                  <li key={request.id}>
                    <Link href={`/backend/store/requests/${request.id}`} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40">
                      <span className="min-w-0">
                        <span className="block font-mono text-xs font-semibold">{request.code}</span>
                        <span className="block text-xs text-muted-foreground">
                          {request.store === 'rm' ? t('dermat_orders.sheet.rmStore', 'RM store') : t('dermat_orders.sheet.pmStore', 'PM store')} ·{' '}
                          {t('dermat_orders.sheet.linesIssued', '{done}/{total} lines issued', { done: request.issuedLines, total: request.lineCount })}
                        </span>
                      </span>
                      <StatusBadge variant={STORE_VARIANT[request.status]}>
                        {request.awaitingReceipt && request.status !== 'requested' ? t('dermat_orders.sheet.storeAwaiting', 'Sent · confirm receipt') : STORE_LABEL[request.status]}
                      </StatusBadge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                {t('dermat_orders.sheet.storeEmpty', 'Nothing asked yet. This stage can be completed only after the material is received.')}
              </p>
            )}
          </div>
        ) : null}

        {order.qc?.[stage.key]?.length ? (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">{t('dermat_orders.sheet.qc', 'Quality checks (must pass before this stage can be completed)')}</Label>
            <ul className="divide-y rounded-md border text-sm">
              {order.qc[stage.key].map((check) => (
                <li key={check.id}>
                  <Link href={`/backend/qc/checks/${check.id}`} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40">
                    <span className="min-w-0 truncate">
                      <span className="mr-1 font-mono text-xs text-muted-foreground">{check.arNo ?? check.code}{check.round > 1 ? ` · R${check.round}` : ''}</span>
                      {check.productTitle}
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {check.chemicalStatus !== 'na' ? (
                        <StatusBadge variant={QC_PART_VARIANT[check.chemicalStatus]}>{t('dermat_orders.sheet.qcChemical', 'Chemical')}</StatusBadge>
                      ) : null}
                      {check.microStatus !== 'na' ? (
                        <StatusBadge variant={QC_PART_VARIANT[check.microStatus]}>{t('dermat_orders.sheet.qcMicro', 'Micro')}</StatusBadge>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <SubStageTracker order={order} stage={stage} editable={editable} busy={busy} onStep={(stepKey, done) => run({ action: 'step', stepKey, done })} />

        {stage.key === 'artwork' && order.packItems?.length ? (
          <PackItemsPanel order={order} stage={stage} editable={editable} busy={busy} onStatus={(productId, pmStatus) => run({ action: 'pm_status', productId, pmStatus })} />
        ) : null}

        {['manufacturing', 'filling', 'packing'].includes(stage.key) ? (
          <ProductionRoundsPanel order={order} stage={stage} editable={editable} busy={busy} onRework={(action, text) => run({ action, note: text })} />
        ) : null}

        {stage.key === 'artwork' ? <QaArtworkChecklist stage={stage} editable={editable} busy={busy} onToggle={(key, done) => run({ action: 'checklist', stepKey: key, done })} /> : null}

        {stage.key === 'qc_qa' ? <QaReleaseReview order={order} /> : null}

        {stage.key === 'sampling' ? <SampleRoundsPanel stage={stage} editable={editable} busy={busy} onNewRound={(text) => run({ action: 'new_round', note: text })} /> : null}

        {mode === 'form' && (stage.key === 'manufacturing' || stage.key === 'filling') ? (
          <ProductionPanel
            orderId={order.id}
            stageKey={stage.key}
            values={values}
            editable={editable}
            onChange={(key, value) => setValues((prev) => ({ ...prev, [key]: value }))}
          />
        ) : null}

        {stage.key === 'dispatch' && stage.status === 'done' && (granted.has('dermat_orders.work.dispatch') || granted.has('dermat_orders.manage')) ? (
          <DeliveredBox
            deliveredOn={typeof stage.data?.delivered_on === 'string' ? stage.data.delivered_on : null}
            busy={busy}
            onMark={(date, receivedNote) => run({ action: 'delivered', data: { delivered_on: date }, note: receivedNote || undefined })}
          />
        ) : null}
        {!canWork && granted.ready && canWorkProp && (stage.status === 'open' || stage.status === 'on_hold') ? (
          <p className="rounded-md border border-status-info-border bg-status-info-bg px-3 py-2 text-xs text-status-info-text">
            {t('dermat_orders.sheet.viewOnly', 'View only: {department} works on this stage. Your role can see it but not change it.', { department: def.department })}
          </p>
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
            {stage.status !== 'waiting' ? (
              <StageDocuments orderId={order.id} stageKey={stage.key} documents={order.documents?.[stage.key] ?? []} editable={editable} />
            ) : null}
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
                    <ListSelectItems listKey="hold_parties" current={party} />
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
                {stage.key === 'advance'
                  ? t('dermat_orders.sheet.verifySend', 'Verified — send to {next}', { next: nextLabels.join(' + ') })
                  : nextLabels.length
                  ? t('dermat_orders.sheet.completeSend', 'Done — send to {next}', { next: nextLabels.join(' + ') })
                  : t('dermat_orders.sheet.completeLast', 'Done — close the order')}
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


function DeliveredBox({ deliveredOn, busy, onMark }: { deliveredOn: string | null; busy: boolean; onMark: (date: string, note: string) => Promise<boolean> }) {
  const t = useT()
  const [date, setDate] = React.useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
  const [note, setNote] = React.useState('')
  if (deliveredOn) {
    return (
      <p className="rounded-md border border-status-success-border bg-status-success-bg px-3 py-2 text-sm text-status-success-text">
        {t('dermat_orders.sheet.deliveredOn', 'Delivered to the client on {date}.', { date: formatDate(deliveredOn) })}
      </p>
    )
  }
  return (
    <div className="space-y-2 rounded-md border p-3">
      <p className="text-sm font-medium">{t('dermat_orders.sheet.deliveredTitle', 'Did the goods reach the client?')}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} aria-label={t('dermat_orders.sheet.deliveredDate', 'Delivered on')} />
        <Input className="sm:col-span-2" value={note} onChange={(event) => setNote(event.target.value)} placeholder={t('dermat_orders.sheet.deliveredNote', 'Received by / POD no. (optional)')} aria-label={t('dermat_orders.sheet.deliveredNoteLabel', 'Received by')} />
      </div>
      <Button type="button" size="sm" disabled={busy || !date} onClick={() => void onMark(date, note.trim())}>
        {t('dermat_orders.sheet.markDelivered', 'Mark delivered')}
      </Button>
    </div>
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
