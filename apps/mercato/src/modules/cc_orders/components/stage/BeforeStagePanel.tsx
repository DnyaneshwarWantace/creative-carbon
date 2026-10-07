"use client"

import * as React from 'react'
import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { stageDef, type StageDef } from '../../lib/stages'
import { STAGE_VARIANT, formatDateTime } from '../format'
import { LockedNote, SharedStageFields } from '../LockedStageRow'
import type { Order } from '../types'
import { useStageSettings } from '../useStageSettings'

export function BeforeStagePanel({ order, def }: { order: Order; def: StageDef }) {
  const t = useT()
  useStageSettings()
  const byKey = new Map(order.stages.map((entry) => [entry.key, entry]))
  return (
    <div className="divide-y">
      {def.after.map((key) => {
        const entry = byKey.get(key)
        const before = stageDef(key)
        if (!entry || !before) return null
        return (
          <div key={key} className="flex flex-col gap-1.5 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <Link href={`/backend/orders/${order.id}/stages/${key}`} className="text-sm font-semibold hover:underline">
                {before.label}
              </Link>
              <StatusBadge variant={STAGE_VARIANT[entry.status] ?? 'neutral'}>{t(`cc_orders.stageStatus.${entry.status}`, entry.status.replace('_', ' '))}</StatusBadge>
            </div>
            {entry.completedAt ? (
              <p className="text-xs text-muted-foreground">
                {[entry.completedByName, formatDateTime(entry.completedAt)].filter(Boolean).join(' · ')}
              </p>
            ) : null}
            <SharedStageFields stage={entry} />
            {entry.locked ? <LockedNote department={entry.department} /> : null}
          </div>
        )
      })}
    </div>
  )
}
