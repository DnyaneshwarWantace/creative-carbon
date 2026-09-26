"use client"

import * as React from 'react'
import Link from 'next/link'
import { Check, Lock, MinusCircle, Undo2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { formatDateTime } from './format'
import { subStages, type SubStage } from './subStages'
import type { Order, Stage } from './types'

const UNIT: Record<string, string> = { manufacturing: 'Unit: KG / ml', filling: 'Unit: bottles / gm / ml', packing: 'Unit: pieces' }

export function SubStageTracker({
  order,
  stage,
  editable,
  busy,
  onStep,
}: {
  order: Order
  stage: Stage
  editable: boolean
  busy: boolean
  onStep: (stepKey: string, done: boolean) => void
}) {
  const t = useT()
  const items = subStages(order, stage)
  if (!items.length) return null
  const lastDoneStep = [...items].reverse().find((item) => item.kind === 'step' && item.status === 'done')
  const counted = items.filter((item) => item.status !== 'na' && !item.optional)
  const doneCount = counted.filter((item) => item.status === 'done').length

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">
          {t('dermat_orders.sub.title', 'Sub-stages')} · {doneCount}/{counted.length}
        </p>
        {UNIT[stage.key] ? <span className="rounded-sm bg-status-warning-bg px-1.5 py-0.5 text-xs text-status-warning-text">{UNIT[stage.key]}</span> : null}
      </div>
      <ol className="relative space-y-0">
        {items.map((item, index) => (
          <Row
            key={item.key}
            item={item}
            index={index}
            last={index === items.length - 1}
            canAct={editable && !busy}
            canUndo={editable && !busy && lastDoneStep?.key === item.key && stage.status !== 'done'}
            onStep={onStep}
          />
        ))}
      </ol>
    </div>
  )
}

function Row({ item, index, last, canAct, canUndo, onStep }: { item: SubStage; index: number; last: boolean; canAct: boolean; canUndo: boolean; onStep: (stepKey: string, done: boolean) => void }) {
  const t = useT()
  const icon =
    item.status === 'done' ? (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-status-success-icon text-white">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    ) : item.status === 'current' ? (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-status-warning-icon text-xs font-bold text-white">{index + 1}</span>
    ) : item.status === 'na' ? (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <MinusCircle className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    ) : (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-border bg-card text-muted-foreground">
        {item.optional ? <span className="text-xs">{index + 1}</span> : <Lock className="h-3 w-3" aria-hidden="true" />}
      </span>
    )
  return (
    <li className={cn('relative flex gap-3 pb-3', item.status === 'pending' && !item.optional && 'opacity-60')}>
      {!last ? <span className="absolute left-3.5 top-7 h-full w-px bg-border" aria-hidden="true" /> : null}
      <span className="relative z-10 shrink-0">{icon}</span>
      <div className={cn('min-w-0 flex-1 rounded-md px-2 py-1', item.status === 'current' && 'bg-status-warning-bg/50')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={cn('text-sm', item.status === 'current' ? 'font-semibold' : 'font-medium')}>
            {item.label}
            {item.optional ? <span className="ml-1 text-xs font-normal text-muted-foreground">{t('dermat_orders.sheet.optional', '(if needed)')}</span> : null}
            {item.kind !== 'step' ? <span className="ml-1 text-xs font-normal text-muted-foreground">· {item.kind === 'store' ? t('dermat_orders.sub.byStore', 'store') : t('dermat_orders.sub.byQc', 'QC team')}</span> : null}
          </p>
          {item.kind === 'step' && (item.status === 'current' || (item.optional && item.status === 'pending')) && canAct ? (
            <Button type="button" size="sm" className="h-7" onClick={() => onStep(item.key, true)}>
              <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              {t('dermat_orders.sub.markDone', 'Mark done')}
            </Button>
          ) : null}
          {canUndo ? (
            <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => onStep(item.key, false)}>
              <Undo2 className="h-3 w-3" aria-hidden="true" />
              {t('dermat_orders.sub.undo', 'Undo')}
            </button>
          ) : null}
        </div>
        {item.status === 'done' && item.at ? <p className="text-xs text-muted-foreground">{[item.by, formatDateTime(item.at)].filter(Boolean).join(' · ')}</p> : null}
        {item.detail ? <p className="text-xs text-muted-foreground">{item.detail}</p> : null}
        {item.links.length && item.status !== 'na' ? (
          <p className="mt-0.5 flex flex-wrap gap-2 text-xs">
            {item.links.map((link) => (
              <Link key={link.href} href={link.href} className="font-mono text-primary hover:underline">
                {link.label} →
              </Link>
            ))}
          </p>
        ) : null}
      </div>
    </li>
  )
}
