'use client'

import * as React from 'react'
import { ArrowRight, History, UserRound } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Button } from '@open-mercato/ui/primitives/button'
import { stageDef, stageList } from '../lib/stages'
import { formatDateTime } from './format'
import type { OrderEvent } from './types'

export const ACTION_LABEL: Record<string, string> = {
  created: 'Order booked',
  opened: 'Opened for the department',
  started: 'Work started',
  saved: 'Saved',
  completed: 'Done',
  held: 'Put on hold',
  resumed: 'Resumed',
  reverted: 'Reopened',
  skipped: 'Skipped',
  assigned: 'Assigned to',
  edited: 'Order edited',
  step_done: 'Ticked',
  step_undone: 'Unticked',
  qa_check: 'QA check ticked',
  qa_uncheck: 'QA check unticked',
  pm_status: 'Packing material status',
  sample_round: 'New sample round',
  qc_created: 'Sent to QC',
  payment: 'Payment',
  payment_override: 'Dispatched before full payment',
  delivered: 'Delivered',
  cancelled: 'Order cancelled',
}

type Kind = 'all' | 'changes' | 'holds' | 'steps' | 'done'

const KIND_OF: Record<string, Exclude<Kind, 'all'>> = {
  edited: 'changes',
  saved: 'changes',
  held: 'holds',
  resumed: 'holds',
  reverted: 'holds',
  skipped: 'holds',
  cancelled: 'holds',
  payment_override: 'holds',
  step_done: 'steps',
  step_undone: 'steps',
  qa_check: 'steps',
  qa_uncheck: 'steps',
  pm_status: 'steps',
  completed: 'done',
  delivered: 'done',
  created: 'done',
}

const DOT: Record<Exclude<Kind, 'all'> | 'other', string> = {
  changes: 'bg-status-info-icon',
  holds: 'bg-status-warning-icon',
  steps: 'bg-muted-foreground',
  done: 'bg-status-success-icon',
  other: 'bg-border',
}

function kindOf(event: OrderEvent): Exclude<Kind, 'all'> | 'other' {
  if (event.changes.length) return 'changes'
  return KIND_OF[event.action] ?? 'other'
}

function shown(value: string | number | null): string {
  return value === null || value === '' ? 'empty' : String(value)
}

export function EventList({ events, showStage = true }: { events: OrderEvent[]; showStage?: boolean }) {
  const t = useT()
  return (
    <ol className="relative flex flex-col">
      {events.map((event) => {
        const kind = kindOf(event)
        return (
          <li key={event.id} className="relative flex gap-3 px-4 py-2.5">
            <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', DOT[kind])} aria-hidden="true" />
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-sm font-medium">
                  {t(`dermat_orders.event.${event.action}`, ACTION_LABEL[event.action] ?? event.action)}
                  {showStage && event.stageKey && event.action !== 'created' ? <span className="text-muted-foreground"> · {stageDef(event.stageKey)?.label ?? event.stageKey}</span> : null}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDateTime(event.at)}</span>
              </div>
              {event.note ? <p className="text-xs">{event.note}</p> : null}
              {event.changes.length ? (
                <ul className="space-y-0.5 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
                  {event.changes.map((change) => (
                    <li key={change.key} className="flex flex-wrap items-center gap-1.5">
                      <span className="text-muted-foreground">{change.label}:</span>
                      <span className={cn(change.from === null ? 'italic text-muted-foreground' : 'text-muted-foreground line-through')}>{shown(change.from)}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                      <span className="font-medium">{shown(change.to)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {event.byName ? (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <UserRound className="h-3 w-3" aria-hidden="true" />
                  {event.byName}
                </p>
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

const PAGE = 40

export function OrderHistory({ events }: { events: OrderEvent[] }) {
  const t = useT()
  const [stage, setStage] = React.useState('all')
  const [person, setPerson] = React.useState('all')
  const [kind, setKind] = React.useState<Kind>('all')
  const [limit, setLimit] = React.useState(PAGE)
  const stages = stageList().filter((def) => events.some((event) => event.stageKey === def.key))
  const people = Array.from(new Set(events.map((event) => event.byName).filter((name): name is string => Boolean(name)))).sort()
  const filtered = events.filter(
    (event) =>
      (stage === 'all' || (stage === 'order' ? !event.stageKey || event.stageKey === 'order' : event.stageKey === stage)) &&
      (person === 'all' || event.byName === person) &&
      (kind === 'all' || kindOf(event) === kind),
  )
  React.useEffect(() => setLimit(PAGE), [stage, person, kind])

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 border-b bg-muted/20 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <History className="h-4 w-4 text-primary" />
          {t('dermat_orders.view.history', 'History')}
          <span className="font-normal text-muted-foreground">· {t('dermat_orders.history.count', '{count} of {total}', { count: filtered.length, total: events.length })}</span>
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl value={kind} onValueChange={(value) => setKind(value as Kind)} aria-label={t('dermat_orders.history.kind', 'What to show')}>
            <SegmentedControlItem value="all">{t('dermat_orders.history.all', 'All')}</SegmentedControlItem>
            <SegmentedControlItem value="changes">{t('dermat_orders.history.changes', 'Changes')}</SegmentedControlItem>
            <SegmentedControlItem value="done">{t('dermat_orders.history.done', 'Done')}</SegmentedControlItem>
            <SegmentedControlItem value="holds">{t('dermat_orders.history.holds', 'Holds & reopens')}</SegmentedControlItem>
            <SegmentedControlItem value="steps">{t('dermat_orders.history.steps', 'Steps')}</SegmentedControlItem>
          </SegmentedControl>
          <Select value={stage} onValueChange={setStage}>
            <SelectTrigger className="h-8 w-44" aria-label={t('dermat_orders.history.stage', 'Stage')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('dermat_orders.history.allStages', 'All stages')}</SelectItem>
              {stages.map((def) => (
                <SelectItem key={def.key} value={def.key}>
                  {def.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={person} onValueChange={setPerson}>
            <SelectTrigger className="h-8 w-44" aria-label={t('dermat_orders.history.person', 'Person')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('dermat_orders.history.everyone', 'Everyone')}</SelectItem>
              {people.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filtered.length ? (
          <div className="divide-y">
            <EventList events={filtered.slice(0, limit)} />
          </div>
        ) : (
          <p className="px-4 py-6 text-sm text-muted-foreground">{t('dermat_orders.history.none', 'Nothing matches these filters.')}</p>
        )}
        {filtered.length > limit ? (
          <div className="border-t p-3 text-center">
            <Button type="button" variant="outline" size="sm" onClick={() => setLimit((value) => value + PAGE)}>
              {t('dermat_orders.history.more', 'Show {count} more', { count: Math.min(PAGE, filtered.length - limit) })}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function StageHistory({ events, stageKey }: { events: OrderEvent[]; stageKey: string }) {
  const t = useT()
  const own = events.filter((event) => event.stageKey === stageKey)
  if (!own.length) return null
  return (
    <details className="group rounded-md border">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/40">
        <span className="flex items-center gap-1.5">
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          {t('dermat_orders.history.stageTitle', 'History of this stage ({count})', { count: own.length })}
        </span>
        <span className="group-open:hidden">{t('dermat_orders.history.showStage', 'Show')}</span>
      </summary>
      <div className="max-h-80 divide-y overflow-y-auto border-t">
        <EventList events={own} showStage={false} />
      </div>
    </details>
  )
}
