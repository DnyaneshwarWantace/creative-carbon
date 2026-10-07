"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { formatDateTime } from '../format'
import type { Order } from '../types'

const EVENT_LABEL: Record<string, string> = {
  opened: 'Started',
  saved: 'Saved',
  completed: 'Done',
  held: 'Put on hold',
  resumed: 'Resumed',
  reverted: 'Reopened',
  skipped: 'Skipped',
  assigned: 'Assigned to',
  step_done: 'Ticked',
  step_undone: 'Unticked',
  created: 'Order booked',
}

export function StageHistoryPanel({ events }: { events: Order['events'] }) {
  const t = useT()
  if (!events.length) return <p className="p-4 text-sm text-muted-foreground">{t('cc_orders.stagePage.noHistory', 'Nothing has happened at this stage yet.')}</p>
  return (
    <ol className="divide-y text-sm">
      {events.map((event) => (
        <li key={event.id} className="flex flex-col gap-0.5 px-4 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-medium">{t(`cc_orders.event.${event.action}`, EVENT_LABEL[event.action] ?? event.action)}</span>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDateTime(event.at)}</span>
          </div>
          {event.note ? <p className="text-xs">{event.note}</p> : null}
          {event.byName ? <p className="text-xs text-muted-foreground">{event.byName}</p> : null}
        </li>
      ))}
    </ol>
  )
}
