"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { HISTORY_ACTION, dateTimeText } from '../labels'
import type { RdRequest, Trial } from '../types'

type ActivityTabProps = { request: RdRequest; trials: Trial[] }

export function ActivityTab({ request, trials }: ActivityTabProps) {
  const t = useT()
  const entries = [
    ...request.history.map((entry) => ({ ...entry, source: request.code })),
    ...trials.flatMap((trial) => trial.history.map((entry) => ({ ...entry, source: trial.code }))),
  ].sort((left, right) => right.at.localeCompare(left.at))

  return (
    <ol className="divide-y rounded-lg border bg-card">
      {entries.map((entry, index) => (
        <li key={`${entry.at}-${index}`} className="flex flex-col gap-0.5 px-4 py-2 text-sm sm:flex-row sm:items-baseline sm:gap-4">
          <span className="w-32 shrink-0 text-xs tabular-nums text-muted-foreground">{dateTimeText(entry.at)}</span>
          <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">{entry.source}</span>
          <span className="min-w-0 flex-1">
            <span className="font-medium">{t(`dermat_rnd.history.${entry.action}`, HISTORY_ACTION[entry.action] ?? entry.action)}</span>
            {entry.note ? <span className="text-muted-foreground"> · {entry.note}</span> : null}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">{entry.by ?? '—'}</span>
        </li>
      ))}
    </ol>
  )
}
