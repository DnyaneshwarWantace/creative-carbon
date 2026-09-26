'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, ClipboardCheck, RotateCcw, XCircle } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { QA_ARTWORK_CHECKS, stageDef } from '../lib/stages'
import { formatDateTime, formatQty } from './format'
import type { Order, OrderQcCheck, Stage } from './types'

type ReworkRound = { round: number; type: 'rework' | 'rejected'; note: string; qc: string[]; batchNo: string | null; at: string; by: string | null }

const CHECK_VARIANT: Record<string, 'success' | 'error' | 'warning' | 'neutral'> = { passed: 'success', failed: 'error', pending: 'warning', reworked: 'neutral', rejected: 'neutral' }
const CHECK_LABEL: Record<string, string> = { passed: 'Passed', failed: 'Failed', pending: 'Testing', reworked: 'Sent to rework', rejected: 'Batch rejected' }

export function ProductionRoundsPanel({
  order,
  stage,
  editable,
  busy,
  onRework,
}: {
  order: Order
  stage: Stage
  editable: boolean
  busy: boolean
  onRework: (action: 'rework' | 'reject_batch', note: string) => void
}) {
  const t = useT()
  const [mode, setMode] = React.useState<'rework' | 'reject_batch' | null>(null)
  const [note, setNote] = React.useState('')
  const rounds = ((stage.data as Record<string, unknown>)?.__rework as ReworkRound[] | undefined) ?? []
  const checks = order.qc?.[stage.key] ?? []
  const failed = checks.filter((check) => check.status === 'failed')
  const current = rounds.length + 1
  if (!rounds.length && !failed.length) return null
  return (
    <div className={cn('space-y-3 rounded-lg border p-3', failed.length ? 'border-status-error-border bg-status-error-bg' : 'bg-muted/20')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          {failed.length ? <AlertTriangle className="h-4 w-4 text-status-error-icon" aria-hidden="true" /> : null}
          {failed.length
            ? t('dermat_orders.rework.failed', 'QC failed on round {round}: {codes}', { round: current, codes: failed.map((check) => check.arNo ?? check.code).join(', ') })
            : t('dermat_orders.rework.round', 'Round {round}', { round: current })}
        </p>
        {failed.length && editable && !mode ? (
          <span className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setMode('rework')} disabled={busy}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t('dermat_orders.rework.rework', 'Rework')}
            </Button>
            {stage.key === 'manufacturing' ? (
              <Button type="button" size="sm" variant="destructive-ghost" onClick={() => setMode('reject_batch')} disabled={busy}>
                <XCircle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                {t('dermat_orders.rework.reject', 'Reject batch')}
              </Button>
            ) : null}
          </span>
        ) : null}
      </div>
      {failed.length && !mode ? (
        <p className="text-xs text-status-error-text">
          {t('dermat_orders.rework.hint', 'Rework sends this step back and QC tests again. A rejected batch is written off, its material is used up, and a new batch starts with a new store request. A re-test of the same sample is done from the QC check.')}{' '}
          {failed.map((check) => (
            <Link key={check.id} href={`/backend/qc/checks/${check.id}`} className="mr-2 font-medium underline">
              {check.arNo ?? check.code}
            </Link>
          ))}
        </p>
      ) : null}
      {mode ? (
        <div className="space-y-2">
          <Label htmlFor="rework-note" className="text-xs text-muted-foreground">
            {mode === 'rework'
              ? t('dermat_orders.rework.what', 'What failed and what will be corrected? (e.g. pH 6.8 high, adjust with citric acid 0.2 kg)')
              : t('dermat_orders.rework.why', 'Why is the batch rejected?')}
          </Label>
          <Textarea id="rework-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setMode(null)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'reject_batch' ? 'destructive' : 'default'}
              disabled={busy || !note.trim()}
              onClick={() => {
                onRework(mode, note.trim())
                setNote('')
                setMode(null)
              }}
            >
              {mode === 'rework' ? t('dermat_orders.rework.start', 'Start round {round}', { round: current + 1 }) : t('dermat_orders.rework.confirmReject', 'Reject and start a new batch')}
            </Button>
          </div>
        </div>
      ) : null}
      {rounds.length ? (
        <ol className="space-y-1.5 border-l pl-3 text-xs">
          {rounds
            .slice()
            .reverse()
            .map((round) => (
              <li key={round.round}>
                <span className="font-medium">
                  {round.type === 'rework'
                    ? t('dermat_orders.rework.reworked', 'Round {round}: reworked', { round: round.round - 1 })
                    : t('dermat_orders.rework.rejected', 'Round {round}: batch {batch} rejected', { round: round.round - 1, batch: round.batchNo ?? '' })}
                </span>
                <span className="text-muted-foreground">
                  {' '}
                  · {round.qc.join(', ')} · {round.by ?? '—'}, {formatDateTime(round.at)}
                </span>
                <p className="text-muted-foreground">{round.note}</p>
              </li>
            ))}
        </ol>
      ) : null}
    </div>
  )
}

type Tick = { done?: boolean; at?: string | null; by?: string | null }

export function QaArtworkChecklist({ stage, editable, busy, onToggle }: { stage: Stage; editable: boolean; busy: boolean; onToggle: (key: string, done: boolean) => void }) {
  const t = useT()
  const ticks = ((stage.data as Record<string, unknown>)?.__qa_art as Record<string, Tick> | undefined) ?? {}
  const done = QA_ARTWORK_CHECKS.filter((check) => ticks[check.key]?.done).length
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <ClipboardCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {t('dermat_orders.qaArt.title', 'QA artwork check')}
        </p>
        <span className="text-xs tabular-nums text-muted-foreground">
          {done}/{QA_ARTWORK_CHECKS.length}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{t('dermat_orders.qaArt.hint', 'QA ticks each point on the final artwork before "QA finalised the artwork".')}</p>
      <ul className="space-y-1">
        {QA_ARTWORK_CHECKS.map((check) => {
          const tick = ticks[check.key]
          return (
            <li key={check.key}>
              <label className={cn('flex items-start gap-2 rounded-sm px-1 py-1 text-sm', editable ? 'cursor-pointer hover:bg-muted/40' : '')}>
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded-sm border-input"
                  checked={Boolean(tick?.done)}
                  disabled={!editable || busy}
                  onChange={(event) => onToggle(check.key, event.target.checked)}
                />
                <span className="min-w-0">
                  <span className="block">{check.label}</span>
                  {tick?.done ? (
                    <span className="block text-xs text-muted-foreground">
                      {tick.by ?? '—'} · {tick.at ? formatDateTime(tick.at) : ''}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function num(value: unknown): number | null {
  const parsed = Number(value)
  return value === null || value === undefined || value === '' || !Number.isFinite(parsed) ? null : parsed
}

export function QaReleaseReview({ order }: { order: Order }) {
  const t = useT()
  const stageOf = (key: string) => order.stages.find((entry) => entry.key === key)
  const mfg = stageOf('manufacturing')?.data ?? {}
  const fill = stageOf('filling')?.data ?? {}
  const pack = stageOf('packing')?.data ?? {}
  const pieces = order.lines.reduce((sum, line) => sum + line.quantity, 0)
  const checks = Object.entries(order.qc ?? {}).flatMap(([key, list]) => list.map((check) => ({ stageKey: key, check })))
  const openChecks = checks.filter(({ check }) => check.status === 'pending' || check.status === 'failed')
  const requests = Object.entries(order.store ?? {}).flatMap(([key, list]) => list.map((request) => ({ stageKey: key, request })))
  const unsettled = requests.filter(({ request }) => request.status !== 'used' && request.status !== 'cancelled')
  const rows: Array<{ label: string; value: string; ok: boolean | null }> = [
    { label: t('dermat_orders.qaRel.bulk', 'Bulk made'), value: num(mfg.batch_size) != null ? `${formatQty(num(mfg.batch_size) ?? 0, 2)} kg · batch ${String(mfg.batch_no ?? '—')}` : '—', ok: num(mfg.batch_size) != null },
    { label: t('dermat_orders.qaRel.wastage', 'Wastage in manufacturing'), value: num(mfg.wastage_kg) != null ? `${formatQty(num(mfg.wastage_kg) ?? 0, 2)} kg` : '—', ok: null },
    { label: t('dermat_orders.qaRel.filled', 'Filled'), value: num(fill.filled_units) != null ? `${formatQty(num(fill.filled_units) ?? 0, 0)} units${num(fill.rejected_units) ? `, ${formatQty(num(fill.rejected_units) ?? 0, 0)} rejected` : ''}` : '—', ok: num(fill.filled_units) != null ? (num(fill.filled_units) ?? 0) >= pieces : null },
    { label: t('dermat_orders.qaRel.packed', 'Packed'), value: num(pack.packed_qty) != null ? `${formatQty(num(pack.packed_qty) ?? 0, 0)} pcs of ${formatQty(pieces, 0)} ordered` : '—', ok: num(pack.packed_qty) != null ? (num(pack.packed_qty) ?? 0) >= pieces : null },
    { label: t('dermat_orders.qaRel.store', 'Store requests settled'), value: unsettled.length ? t('dermat_orders.qaRel.unsettled', '{count} still open', { count: unsettled.length }) : t('dermat_orders.qaRel.settled', 'All {count} used or returned', { count: requests.length }), ok: unsettled.length === 0 },
    { label: t('dermat_orders.qaRel.qc', 'QC checks'), value: openChecks.length ? t('dermat_orders.qaRel.qcOpen', '{count} not passed', { count: openChecks.length }) : t('dermat_orders.qaRel.qcAll', 'All passed'), ok: openChecks.length === 0 },
  ]
  return (
    <div className="space-y-3 rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <ClipboardCheck className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {t('dermat_orders.qaRel.title', 'Batch review for QA')}
      </p>
      <dl className="divide-y rounded-md border text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 px-3 py-2">
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="flex items-center gap-1.5 text-right font-medium">
              {row.value}
              {row.ok === true ? <CheckCircle2 className="h-4 w-4 text-status-success-icon" aria-label="ok" /> : row.ok === false ? <AlertTriangle className="h-4 w-4 text-status-warning-icon" aria-label="check" /> : null}
            </dd>
          </div>
        ))}
      </dl>
      {checks.length ? (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{t('dermat_orders.qaRel.allChecks', 'Every QC check on this order')}</Label>
          <ul className="divide-y rounded-md border text-sm">
            {checks.map(({ stageKey, check }) => (
              <li key={check.id}>
                <Link href={`/backend/qc/checks/${check.id}`} className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted/40">
                  <span className="min-w-0">
                    <span className="block font-mono text-xs font-semibold">
                      {check.arNo ?? check.code}
                      {check.round > 1 ? ` · round ${check.round}` : ''}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {stageDef(stageKey)?.label ?? stageKey} · {check.productTitle}
                    </span>
                  </span>
                  <StatusBadge variant={CHECK_VARIANT[check.status] ?? 'neutral'}>{CHECK_LABEL[check.status] ?? check.status}</StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

export type { OrderQcCheck }
