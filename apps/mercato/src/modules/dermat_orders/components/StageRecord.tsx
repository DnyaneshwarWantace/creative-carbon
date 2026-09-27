"use client"

import * as React from 'react'
import Link from 'next/link'
import { Check, ChevronDown, CircleDot, Lock, PauseCircle, SkipForward } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { stageDef, stepStates, type StageField } from '../lib/stages'
import { formatDate, formatDateTime, formatQty } from './format'
import { StageWorkArea, type StageActionRequest } from './StageSheet'
import { subStageProgress } from './subStages'
import type { Order, Stage } from './types'
import { StageFileDetails, type OrderFileData } from './OrderFile'

type Props = {
  order: Order
  file: OrderFileData | null
  people: Array<{ id: string; name: string }>
  busy: boolean
  shortCount: number | null
  focusKey: string | null
  onAction: (stage: Stage, request: StageActionRequest) => Promise<boolean>
}

const STORE_LABEL: Record<string, string> = { requested: 'Requested', partly_issued: 'Partly issued', issued: 'Issued', received: 'Received', used: 'Used', cancelled: 'Cancelled' }

function show(field: StageField, value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (field.type === 'date') return formatDate(String(value))
  if (field.type === 'number') return formatQty(Number(value), 3)
  return String(value)
}

function StatusIcon({ status }: { status: Stage['status'] }) {
  const base = 'flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-card'
  if (status === 'done') return <span className={cn(base, 'bg-status-success-icon text-white')}><Check className="h-4 w-4" aria-hidden="true" /></span>
  if (status === 'open') return <span className={cn(base, 'bg-status-warning-icon text-white')}><CircleDot className="h-4 w-4" aria-hidden="true" /></span>
  if (status === 'on_hold') return <span className={cn(base, 'bg-status-error-icon text-white')}><PauseCircle className="h-4 w-4" aria-hidden="true" /></span>
  if (status === 'skipped') return <span className={cn(base, 'bg-muted text-muted-foreground')}><SkipForward className="h-4 w-4" aria-hidden="true" /></span>
  return <span className={cn(base, 'border border-dashed border-border bg-card text-muted-foreground')}><Lock className="h-3.5 w-3.5" aria-hidden="true" /></span>
}

function DoneSummary({ order, stage, file }: { order: Order; stage: Stage; file: OrderFileData | null }) {
  const t = useT()
  const def = stageDef(stage.key)
  const data = stage.data ?? {}
  const filled = (def?.fields ?? []).map((field) => ({ field, value: show(field, data[field.key]) })).filter((entry) => entry.value)
  const steps = stepStates(data)
  const store = order.store?.[stage.key] ?? []
  const qc = order.qc?.[stage.key] ?? []
  const pm = (data.__pm as Record<string, { status?: string; by?: string | null }> | undefined) ?? {}
  const rounds = (data.__rounds as Array<{ round: number; feedback: string; by: string | null; at: string }> | undefined) ?? []
  const events = order.events.filter((event) => event.stageKey === stage.key).slice(0, 12)
  const payments = stage.key === 'advance' || stage.key === 'billing' ? (order.payments?.items ?? []).filter((payment) => !payment.voided && (stage.key === 'advance' ? payment.kind === 'advance' : payment.kind !== 'advance')) : []

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <StageFileDetails order={order} stage={stage} file={file} />
        {filled.length ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {filled.map(({ field, value }) => (
              <div key={field.key} className="min-w-0">
                <dt className="text-xs text-muted-foreground">{field.label}</dt>
                <dd className="break-words font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">{t('dermat_orders.record.noFields', 'No details were filled in.')}</p>
        )}
        {def?.steps.length ? (
          <ul className="flex flex-wrap gap-2">
            {def.steps.map((step) => {
              const state = steps[step.key]
              return (
                <li key={step.key} className={cn('inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs', state?.done ? 'border-status-success-border bg-status-success-bg text-status-success-text' : 'text-muted-foreground')}>
                  {state?.done ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
                  {step.label}
                  {state?.done && state.by ? <span className="opacity-70">· {state.by}</span> : null}
                </li>
              )
            })}
          </ul>
        ) : null}
        {store.length || qc.length || Object.keys(pm).length || rounds.length || payments.length ? (
          <div className="flex flex-wrap gap-2 text-xs">
            {store.map((request) => (
              <Link key={request.id} href={`/backend/store/requests/${request.id}`} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 hover:bg-muted">
                <span className="font-mono font-semibold">{request.code}</span>
                <span className="text-muted-foreground">{STORE_LABEL[request.status] ?? request.status}</span>
              </Link>
            ))}
            {qc.map((check) => (
              <Link key={check.id} href={`/backend/qc/checks/${check.id}`} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 hover:bg-muted">
                <span className="font-mono font-semibold">{check.code}</span>
                <StatusBadge variant={check.status === 'passed' ? 'success' : check.status === 'failed' ? 'error' : 'warning'}>{check.status}</StatusBadge>
              </Link>
            ))}
            {order.packItems
              .filter((item) => pm[item.productId]?.status)
              .map((item) => (
                <span key={item.productId} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1">
                  {item.title}
                  <span className="font-medium">{pm[item.productId]?.status}</span>
                </span>
              ))}
            {rounds.map((round) => (
              <span key={round.round} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1">
                {t('dermat_orders.record.round', 'Round {round} sent back', { round: round.round })}: <span className="text-muted-foreground">{round.feedback}</span>
              </span>
            ))}
            {payments.map((payment) => (
              <span key={payment.id} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1">
                ₹{formatQty(payment.amount, 2)} <span className="text-muted-foreground">{formatDate(payment.paidOn)}{payment.reference ? ` · ${payment.reference}` : ''}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div>
        <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('dermat_orders.record.history', 'What happened')}</p>
        {events.length ? (
          <ol className="mt-2 space-y-1.5 border-l pl-3 text-xs">
            {events.map((event) => (
              <li key={event.id}>
                <span className="font-medium">{event.action.replace(/_/g, ' ')}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {event.byName ?? '—'} · {formatDateTime(event.at)}
                </span>
                {event.note ? <p className="text-muted-foreground">{event.note}</p> : null}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">—</p>
        )}
      </div>
    </div>
  )
}

export function StageRecord({ order, file, people, busy, shortCount, focusKey, onAction }: Props) {
  const t = useT()
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())

  React.useEffect(() => {
    if (!focusKey) return
    setExpanded((prev) => new Set(prev).add(focusKey))
    document.getElementById(`stage-row-${focusKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focusKey])

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <section className="overflow-hidden rounded-lg border bg-card shadow-sm">
      <header className="border-b bg-muted/20 px-4 py-3">
        <h2 className="text-sm font-bold">{t('dermat_orders.record.title', 'Order file: every stage on one page')}</h2>
        <p className="text-xs text-muted-foreground">
          {t('dermat_orders.record.hint', 'Finished stages keep everything that was filled in. The stage in progress is open below: finish it here and the next stage opens.')}
        </p>
      </header>
      <ol className="relative">
        {order.stages.map((stage, index) => {
          const def = stageDef(stage.key)
          const working = stage.status === 'open' || stage.status === 'on_hold'
          const finished = stage.status === 'done' || stage.status === 'skipped'
          const isOpen = working || expanded.has(stage.key)
          const waitingFor = (def?.after ?? []).map((key) => order.stages.find((entry) => entry.key === key)).filter((entry): entry is Stage => Boolean(entry) && entry!.status !== 'done' && entry!.status !== 'skipped')
          return (
            <li key={stage.key} id={`stage-row-${stage.key}`} className={cn('relative scroll-mt-4 border-b last:border-b-0', working && 'bg-status-warning-bg/30', stage.status === 'waiting' && 'opacity-60')}>
              <button
                type="button"
                disabled={stage.status === 'waiting' || working}
                onClick={() => toggle(stage.key)}
                className={cn('flex w-full items-center gap-4 px-4 py-3 text-left', finished && 'hover:bg-muted/40')}
                aria-expanded={isOpen}
              >
                <StatusIcon status={stage.status} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">{index + 1}</span>
                    <span className="font-semibold">{stage.label}</span>
                    <span className="text-xs text-muted-foreground">{stage.department}</span>
                    {working ? (
                      <StatusBadge variant={stage.status === 'on_hold' ? 'error' : stage.data?.__started ? 'info' : 'warning'} dot>
                        {stage.status === 'on_hold'
                          ? t('dermat_orders.record.hold', 'On hold')
                          : stage.data?.__started
                            ? t('dermat_orders.workState.in_progress', 'In progress')
                            : t('dermat_orders.workState.pending', 'Pending — not started')}
                      </StatusBadge>
                    ) : null}
                    {(() => {
                      const progress = subStageProgress(order, stage)
                      if (!progress.total || stage.status === 'waiting' || stage.status === 'skipped') return null
                      return (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {progress.done}/{progress.total}
                          {working && progress.current ? ` · ${t('dermat_orders.record.nowSub', 'now: {sub}', { sub: progress.current })}` : ''}
                        </span>
                      )
                    })()}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {finished
                      ? t('dermat_orders.record.doneBy', '{status} by {name} on {date}{days}', {
                          status: stage.status === 'skipped' ? t('dermat_orders.record.skipped', 'Skipped') : t('dermat_orders.record.done', 'Done'),
                          name: stage.completedByName ?? '—',
                          date: stage.completedAt ? formatDateTime(stage.completedAt) : '—',
                          days: stage.days != null ? ` · ${formatQty(stage.days, 1)} d` : '',
                        })
                      : working
                        ? `${stage.responsibleName ? `${stage.responsibleName} · ` : ''}${t('dermat_orders.record.openFor', 'open for {days} d', { days: formatQty(stage.days ?? 0, 1) })}${stage.status === 'on_hold' ? ` · ${stage.holdParty ?? ''}: ${stage.holdReason ?? ''}` : ''}`
                        : waitingFor.length
                          ? t('dermat_orders.record.waits', 'Opens after {stages}', { stages: waitingFor.map((entry) => entry.label).join(' + ') })
                          : t('dermat_orders.record.coming', 'Coming')}
                  </span>
                </span>
                {finished ? <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', isOpen && 'rotate-180')} aria-hidden="true" /> : null}
              </button>
              {isOpen && stage.status !== 'waiting' ? (
                <div className="border-t bg-card px-4 py-4 sm:pl-16">
                  {working ? (
                    <div className="space-y-4">
                      <StageWorkArea order={order} stage={stage} people={people} canWork busy={busy} shortCount={shortCount} onAction={onAction} variant="page" />
                      <div className="border-t pt-3">
                        <StageFileDetails order={order} stage={stage} file={file} />
                      </div>
                    </div>
                  ) : (
                    <DoneSummary order={order} stage={stage} file={file} />
                  )}
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
