"use client"

import * as React from 'react'
import { Lock } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { stageDef, type StageField } from '../lib/stages'
import { formatDate, formatQty } from './format'
import type { Stage } from './types'

function show(field: StageField, value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (field.type === 'date') return formatDate(String(value))
  if (field.type === 'number') return formatQty(Number(value), 3)
  return String(value)
}

export function lockedStatusText(stage: Stage, t: ReturnType<typeof useT>): string {
  if (stage.status === 'done') return t('cc_orders.locked.done', 'Done{days}', { days: stage.days != null ? ` · ${formatQty(stage.days, 1)} d` : '' })
  if (stage.status === 'skipped') return t('cc_orders.locked.skipped', 'Skipped')
  if (stage.status === 'on_hold') return t('cc_orders.locked.hold', 'On hold · {name} · {days} d', { name: stage.responsibleName ?? stage.department, days: formatQty(stage.days ?? 0, 1) })
  if (stage.status === 'open') return t('cc_orders.locked.open', 'Working · {name} · {days} d', { name: stage.responsibleName ?? stage.department, days: formatQty(stage.days ?? 0, 1) })
  return t('cc_orders.locked.coming', 'Coming')
}

export function SharedStageFields({ stage }: { stage: Stage }) {
  const fields = (stageDef(stage.key)?.fields ?? []).map((field) => ({ field, value: show(field, stage.data?.[field.key]) })).filter((entry) => entry.value)
  if (!fields.length) return null
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {fields.map(({ field, value }) => (
        <div key={field.key} className="flex gap-1">
          <dt className="text-muted-foreground">{field.label}</dt>
          <dd className="font-medium">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function LockedNote({ department }: { department: string }) {
  const t = useT()
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-dashed px-1.5 py-0.5 text-xs text-muted-foreground">
      <Lock className="size-3" aria-hidden="true" />
      {t('cc_orders.locked.with', 'Details with {department}', { department })}
    </span>
  )
}
