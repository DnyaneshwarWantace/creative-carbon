"use client"

import * as React from 'react'
import Link from 'next/link'
import { Boxes, CheckCircle2, ClipboardCheck, RotateCcw, Scale, Send, XCircle } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge, type StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { FieldList, LinkRows, Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, type Fact } from '../../../cc_ui/components/RecordPage'
import { PageLoading } from '../../../cc_ui/components/PageLoading'
import { Timeline } from '../../../cc_ui/components/Timeline'
import { Comments } from '../../../cc_ui/components/Comments'
import { Attachments } from '../../../cc_ui/components/Attachments'
import { CorrectDialog } from '../../../cc_ui/components/CorrectDialog'

type StocktakeLine = { lotId: string; lotNumber: string; productId: string; title: string; unit: string | null; book: number; counted: number; difference: number; movementId?: string | null }
type StocktakeView = {
  id: string
  code: string
  place: string
  placeLabel: string
  countDate: string
  status: 'counted' | 'approved' | 'posted' | 'reversed'
  lines: StocktakeLine[]
  note: string | null
  countedByName: string | null
  approvedByName: string | null
  approvedAt: string | null
  postedByName: string | null
  postedAt: string | null
  reversedByName: string | null
  reversedAt: string | null
  reverseReason: string | null
  canReverse: boolean
  difference: number
  updatedAt: string
}

type AdjustmentView = {
  id: string
  code: string
  kind: 'add' | 'remove' | 'move'
  placeLabel: string
  toPlaceLabel: string | null
  productId: string
  title: string
  unit: string | null
  lotId: string | null
  lotNumber: string | null
  quantity: number
  reason: string
  note: string | null
  status: 'pending' | 'posted' | 'rejected' | 'reversed'
  movementId: string | null
  reversalId: string | null
  createdByName: string | null
  approvedByName: string | null
  approvedAt: string | null
  reversedByName: string | null
  reversedAt: string | null
  reverseReason: string | null
  canReverse: boolean
  createdAt: string
  updatedAt: string
}

const COUNT_STATUS: Record<StocktakeView['status'], { label: string; variant: StatusBadgeVariant }> = {
  counted: { label: 'Waiting for approval', variant: 'warning' },
  approved: { label: 'Approved, to post', variant: 'info' },
  posted: { label: 'Posted', variant: 'success' },
  reversed: { label: 'Reversed', variant: 'neutral' },
}

const ADJ_STATUS: Record<AdjustmentView['status'], { label: string; variant: StatusBadgeVariant }> = {
  pending: { label: 'Waiting for approval', variant: 'warning' },
  posted: { label: 'Posted', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'error' },
  reversed: { label: 'Reversed', variant: 'neutral' },
}

const KIND_LABEL: Record<AdjustmentView['kind'], string> = { add: 'Added', remove: 'Removed', move: 'Moved' }

function num(value: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'
}

async function postAction<T>(url: string, version: string, body: Record<string, unknown>) {
  return withScopedApiRequestHeaders(buildOptimisticLockHeader(version), () => apiCall<T & { error?: string }>(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))
}

export function StocktakeListPanel() {
  const t = useT()
  const [rows, setRows] = React.useState<StocktakeView[] | null>(null)
  React.useEffect(() => {
    void apiCall<{ items: StocktakeView[] }>('/api/cc_production/stocktakes', undefined, { fallback: { items: [] } }).then((call) => setRows(call.result?.items ?? []))
  }, [])
  if (!rows?.length) return null
  return (
    <Panel title={t('cc_production.stocktake.past', 'Counts')} icon={ClipboardCheck} count={rows.length} flush>
      <LinkRows
        empty=""
        rows={rows.slice(0, 30).map((row) => ({
          key: row.id,
          href: `/backend/stock/stocktake/${row.id}`,
          primary: <span className="font-mono">{row.code}</span>,
          secondary: [row.countDate, row.placeLabel, row.countedByName].filter(Boolean).join(' · '),
          value: `${row.difference > 0 ? '+' : ''}${num(row.difference)}`,
          badge: <StatusBadge variant={COUNT_STATUS[row.status].variant}>{t(`cc_production.stocktake.status.${row.status}`, COUNT_STATUS[row.status].label)}</StatusBadge>,
        }))}
      />
    </Panel>
  )
}

export function StocktakeRecordPage({ id }: { id: string }) {
  const t = useT()
  const granted = useGranted()
  const canAdjust = granted.has('cc_store.adjust')
  const canApprove = granted.has('cc_store.approve')
  const [row, setRow] = React.useState<StocktakeView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [reversing, setReversing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<StocktakeView>(`/api/cc_production/stocktakes?id=${encodeURIComponent(id)}`)
    if (!call.ok || !call.result) setError(t('cc_production.stocktake.loadError', 'Could not load this count.'))
    else setRow(call.result)
  }, [id, t])

  React.useEffect(() => {
    void load()
  }, [load])

  if (!row) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />

  const act = async (action: string, reason?: string): Promise<boolean> => {
    setBusy(true)
    try {
      const call = await postAction<StocktakeView>('/api/cc_production/stocktakes/action', row.updatedAt, { id: row.id, action, ...(reason ? { reason } : {}) })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_production.stocktake.actError', 'Could not save.'), 'error')
        return false
      }
      setRow(call.result)
      flash(action === 'approve' ? t('cc_production.stocktake.approved', 'Approved') : action === 'post' ? t('cc_production.stocktake.posted', 'Posted to the book') : t('cc_production.stocktake.reversed', 'Reversed; the book is back as before'), 'success')
      return true
    } finally {
      setBusy(false)
    }
  }

  const differing = row.lines.filter((line) => Math.abs(line.difference) >= 0.0005)
  const facts: Fact[] = [
    { label: t('cc_production.stocktake.date', 'Count date'), value: row.countDate },
    { label: t('cc_production.stocktake.store', 'Store'), value: row.placeLabel },
    { label: t('cc_production.stocktake.countedBy', 'Counted by'), value: row.countedByName ?? '—' },
    { label: t('cc_production.stocktake.lines', 'Lots counted'), value: String(row.lines.length) },
    { label: t('cc_production.stocktake.differ', 'Differ from book'), value: String(differing.length), tone: differing.length ? 'warn' : 'good' },
    { label: t('cc_production.stocktake.difference', 'Net difference'), value: `${row.difference > 0 ? '+' : ''}${num(row.difference)}`, tone: Math.abs(row.difference) >= 0.0005 ? 'warn' : undefined },
  ]

  return (
    <RecordPage
      back={{ href: '/backend/stock/stocktake', label: t('cc_production.stock.stocktake', 'Stocktake') }}
      overline={t('cc_production.stocktake.overline', 'Stocktake')}
      title={row.code}
      badges={<StatusBadge variant={COUNT_STATUS[row.status].variant} dot>{t(`cc_production.stocktake.status.${row.status}`, COUNT_STATUS[row.status].label)}</StatusBadge>}
      meta={[row.approvedByName ? t('cc_production.stocktake.approvedBy', 'approved by {name}', { name: row.approvedByName }) : null, row.postedAt ? t('cc_production.stocktake.postedAt', 'posted {at}', { at: when(row.postedAt) }) : null].filter(Boolean).join(' · ') || undefined}
      actions={
        <>
          {row.status === 'counted' && canApprove ? (
            <Button type="button" size="sm" disabled={busy} onClick={() => void act('approve')}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.stocktake.approve', 'Approve')}
            </Button>
          ) : null}
          {row.status === 'approved' && canAdjust ? (
            <Button type="button" size="sm" disabled={busy} onClick={() => void act('post')}>
              <Send className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.stocktake.post', 'Post to the book')}
            </Button>
          ) : null}
          {row.canReverse && canApprove ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setReversing(true)}>
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.stocktake.reverse', 'Reverse')}
            </Button>
          ) : null}
        </>
      }
      alert={row.status === 'reversed' ? <p className="rounded-md border bg-muted/40 px-3 py-2 text-sm">{t('cc_production.stocktake.reversedNote', 'Reversed {at} by {by}: {reason}', { at: when(row.reversedAt), by: row.reversedByName ?? '—', reason: row.reverseReason ?? '—' })}</p> : null}
      facts={facts}
    >
      <RecordColumns
        main={
          <Panel title={t('cc_production.stocktake.linesTitle', 'Counted against the book')} icon={Boxes} count={row.lines.length} flush>
            <RegisterGrid
              rows={row.lines}
              rowKey={(line) => line.lotId}
              rowHref={(line) => `/backend/stock/lots/${line.lotId}`}
              empty={t('cc_production.stocktake.noLines', 'Nothing counted.')}
              columns={[
                { key: 'lot', label: t('cc_production.stocktake.lot', 'Lot'), mono: true, render: (line) => line.lotNumber },
                { key: 'item', label: t('cc_production.stocktake.item', 'Item'), render: (line) => line.title },
                { key: 'book', label: t('cc_production.stocktake.book', 'Book'), align: 'right', render: (line) => num(line.book) },
                { key: 'counted', label: t('cc_production.stocktake.counted', 'Counted'), align: 'right', render: (line) => num(line.counted) },
                { key: 'diff', label: t('cc_production.stocktake.diff', 'Difference'), align: 'right', render: (line) => <span className={cn(Math.abs(line.difference) >= 0.0005 && 'font-semibold text-status-warning-text')}>{`${line.difference > 0 ? '+' : ''}${num(line.difference)}`}</span> },
              ]}
            />
          </Panel>
        }
        side={
          <>
            <Panel title={t('cc_production.stocktake.details', 'Details')}>
              <FieldList
                columns={1}
                fields={[
                  [t('cc_production.stocktake.note', 'Note'), row.note ?? '—'],
                  [t('cc_production.stocktake.approvedAt', 'Approved'), row.approvedAt ? `${when(row.approvedAt)} · ${row.approvedByName ?? ''}` : '—'],
                  [t('cc_production.stocktake.postedAtLabel', 'Posted'), row.postedAt ? `${when(row.postedAt)} · ${row.postedByName ?? ''}` : '—'],
                ]}
              />
            </Panel>
            <Panel title={t('cc_production.stocktake.wentTo', 'Went to · adjustment movements')} flush>
              <LinkRows
                empty={row.status === 'posted' || row.status === 'reversed' ? t('cc_production.stocktake.noMoves', 'Book and count matched; nothing moved.') : t('cc_production.stocktake.notPosted', 'Not posted yet.')}
                rows={row.lines.filter((line) => line.movementId).map((line) => ({ key: line.lotId, href: `/backend/store/ledger?lotId=${line.lotId}`, primary: <span className="font-mono">{line.lotNumber}</span>, value: `${line.difference > 0 ? '+' : ''}${num(line.difference)}` }))}
              />
            </Panel>
          </>
        }
      />
      <Attachments type="stocktake" id={row.id} hint={t('cc_production.stocktake.filesHint', 'Photos of the count sheets.')} />
      <Comments type="stocktake" id={row.id} />
      <Timeline type="stocktake" id={row.id} refreshKey={row.updatedAt} />
      <CorrectDialog
        open={reversing}
        onOpenChange={setReversing}
        title={t('cc_production.stocktake.reverseTitle', 'Reverse {code}?', { code: row.code })}
        undo={[t('cc_production.stocktake.reverseUndo', '{count} counter-entries put the book back as it was before this count', { count: differing.length })]}
        confirmLabel={t('cc_production.stocktake.reverse', 'Reverse')}
        onConfirm={(reason) => act('reverse', reason)}
      />
    </RecordPage>
  )
}

export function AdjustmentsPage() {
  const t = useT()
  const [status, setStatus] = React.useState<'all' | 'pending' | 'posted' | 'reversed'>('all')
  const [rows, setRows] = React.useState<AdjustmentView[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    setRows(null)
    void apiCall<{ items: AdjustmentView[] }>(`/api/cc_store/adjustments?status=${status}`).then((call) => {
      if (!call.ok || !call.result) setError(t('cc_production.adjust.loadError', 'Could not load the adjustments.'))
      else setRows(call.result.items)
    })
  }, [status, t])
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-5xl flex-col gap-4">
          <header className="space-y-1 border-b pb-3">
            <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.adjust.title', 'Store adjustments')}</h1>
            <p className="text-sm text-muted-foreground">{t('cc_production.adjust.lede', 'Stock added, removed or moved by hand. Big ones wait for the store manager; any can be reversed within 7 days if the lot was not used since.')}</p>
          </header>
          <SegmentedControl value={status} onValueChange={(value) => setStatus(value as typeof status)} aria-label={t('cc_production.adjust.status', 'Status')}>
            <SegmentedControlItem value="all">{t('cc_production.adjust.all', 'All')}</SegmentedControlItem>
            <SegmentedControlItem value="pending">{t('cc_production.adjust.pending', 'To approve')}</SegmentedControlItem>
            <SegmentedControlItem value="posted">{t('cc_production.adjust.posted', 'Posted')}</SegmentedControlItem>
            <SegmentedControlItem value="reversed">{t('cc_production.adjust.reversed', 'Reversed')}</SegmentedControlItem>
          </SegmentedControl>
          {error ? <ErrorMessage label={error} /> : null}
          {!rows && !error ? <PageLoading label={t('cc_production.resin.loading', 'Loading…')} /> : null}
          {rows ? (
            <Panel title={t('cc_production.adjust.title', 'Store adjustments')} icon={Scale} count={rows.length} flush>
              <LinkRows
                empty={t('cc_production.adjust.empty', 'Nothing here.')}
                rows={rows.map((row) => ({
                  key: row.id,
                  href: `/backend/stock/adjustments/${row.id}`,
                  primary: `${row.code} · ${row.title}`,
                  secondary: [row.lotNumber, row.kind === 'move' ? `${row.placeLabel} → ${row.toPlaceLabel}` : row.placeLabel, row.reason, row.createdByName, when(row.createdAt)].filter(Boolean).join(' · '),
                  value: `${row.kind === 'remove' ? '−' : row.kind === 'add' ? '+' : ''}${num(row.quantity)} ${row.unit ?? ''}`,
                  badge: <StatusBadge variant={ADJ_STATUS[row.status].variant}>{t(`cc_production.adjust.status.${row.status}`, ADJ_STATUS[row.status].label)}</StatusBadge>,
                }))}
              />
            </Panel>
          ) : null}
        </div>
      </PageBody>
    </Page>
  )
}

export function AdjustmentPage({ id }: { id: string }) {
  const t = useT()
  const granted = useGranted()
  const canAdjust = granted.has('cc_store.adjust')
  const canApprove = granted.has('cc_store.approve')
  const [row, setRow] = React.useState<AdjustmentView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [mode, setMode] = React.useState<'reverse' | 'reject' | null>(null)
  const [busy, setBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<AdjustmentView>(`/api/cc_store/adjustments?id=${encodeURIComponent(id)}`)
    if (!call.ok || !call.result) setError(t('cc_production.adjust.loadOneError', 'Could not load this adjustment.'))
    else setRow(call.result)
  }, [id, t])

  React.useEffect(() => {
    void load()
  }, [load])

  if (!row) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />

  const act = async (action: string, reason?: string): Promise<boolean> => {
    setBusy(true)
    try {
      const call = await postAction<AdjustmentView>('/api/cc_store/adjustments/action', row.updatedAt, { id: row.id, action, ...(reason ? { reason } : {}) })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_production.adjust.actError', 'Could not save.'), 'error')
        return false
      }
      setRow(call.result)
      flash(action === 'approve' ? t('cc_production.adjust.approvedFlash', 'Approved and posted') : action === 'reject' ? t('cc_production.adjust.rejectedFlash', 'Rejected') : t('cc_production.adjust.reversedFlash', 'Reversed by a counter-entry'), 'success')
      return true
    } finally {
      setBusy(false)
    }
  }

  const facts: Fact[] = [
    { label: t('cc_production.adjust.kind', 'What'), value: t(`cc_production.adjust.kind.${row.kind}`, KIND_LABEL[row.kind]) },
    { label: t('cc_production.adjust.qty', 'Quantity'), value: `${num(row.quantity)} ${row.unit ?? ''}` },
    { label: t('cc_production.adjust.lot', 'Lot'), value: row.lotNumber ?? '—' },
    { label: t('cc_production.adjust.where', 'Where'), value: row.kind === 'move' ? `${row.placeLabel} → ${row.toPlaceLabel}` : row.placeLabel },
    { label: t('cc_production.adjust.reason', 'Reason'), value: row.reason },
    { label: t('cc_production.adjust.by', 'By'), value: row.createdByName ?? '—' },
  ]

  return (
    <RecordPage
      back={{ href: '/backend/stock/adjustments', label: t('cc_production.adjust.title', 'Store adjustments') }}
      overline={[t('cc_production.adjust.overline', 'Store adjustment'), row.title].join(' · ')}
      title={row.code}
      badges={<StatusBadge variant={ADJ_STATUS[row.status].variant} dot>{t(`cc_production.adjust.status.${row.status}`, ADJ_STATUS[row.status].label)}</StatusBadge>}
      meta={when(row.createdAt)}
      actions={
        <>
          {row.status === 'pending' && canApprove ? (
            <>
              <Button type="button" size="sm" disabled={busy} onClick={() => void act('approve')}>
                <CheckCircle2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.adjust.approve', 'Approve')}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setMode('reject')}>
                <XCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.adjust.reject', 'Reject')}
              </Button>
            </>
          ) : null}
          {row.canReverse && canAdjust ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setMode('reverse')}>
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.adjust.reverse', 'Reverse')}
            </Button>
          ) : null}
        </>
      }
      facts={facts}
    >
      <RecordColumns
        main={
          <Panel title={t('cc_production.adjust.details', 'Details')} icon={Scale}>
            <FieldList
              columns={1}
              fields={[
                [t('cc_production.adjust.note', 'Note'), row.note ?? '—'],
                [t('cc_production.adjust.approved', 'Approved'), row.approvedAt ? `${when(row.approvedAt)} · ${row.approvedByName ?? ''}` : '—'],
                [t('cc_production.adjust.reversedAt', 'Reversed'), row.reversedAt ? `${when(row.reversedAt)} · ${row.reversedByName ?? ''} · ${row.reverseReason ?? ''}` : '—'],
              ]}
            />
          </Panel>
        }
        side={
          <>
            <Panel title={t('cc_production.adjust.cameFrom', 'Came from')} flush>
              <LinkRows empty="" rows={[...(row.lotId ? [{ key: 'lot', href: `/backend/stock/lots/${row.lotId}`, primary: <span className="font-mono">{row.lotNumber}</span>, secondary: row.title }] : []), { key: 'item', href: `/backend/store/ledger?productId=${row.productId}`, primary: row.title, secondary: t('cc_production.adjust.ledger', 'Stock ledger of the item') }]} />
            </Panel>
            <Panel title={t('cc_production.adjust.wentTo', 'Went to · movements')} flush>
              <LinkRows
                empty={t('cc_production.adjust.noMove', 'No stock moved yet.')}
                rows={[
                  ...(row.movementId && row.lotId ? [{ key: 'move', href: `/backend/store/ledger?lotId=${row.lotId}#m-${row.movementId}`, primary: t('cc_production.adjust.movement', 'Stock movement') }] : []),
                  ...(row.reversalId && row.lotId ? [{ key: 'rev', href: `/backend/store/ledger?lotId=${row.lotId}#m-${row.reversalId}`, primary: t('cc_production.adjust.counter', 'Counter-entry') }] : []),
                ]}
              />
            </Panel>
            <p className="text-xs text-muted-foreground">
              <Link className="underline" href="/backend/stock/adjustments">
                {t('cc_production.adjust.all', 'All adjustments')}
              </Link>
            </p>
          </>
        }
      />
      <Attachments type="adjustment" id={row.id} hint={t('cc_production.adjust.filesHint', 'A photo of what was found.')} />
      <Comments type="adjustment" id={row.id} />
      <Timeline type="adjustment" id={row.id} refreshKey={row.updatedAt} />
      <CorrectDialog
        open={mode !== null}
        onOpenChange={(next) => !next && setMode(null)}
        title={mode === 'reverse' ? t('cc_production.adjust.reverseTitle', 'Reverse {code}?', { code: row.code }) : t('cc_production.adjust.rejectTitle', 'Reject {code}?', { code: row.code })}
        undo={mode === 'reverse' ? [t('cc_production.adjust.reverseUndo', 'A counter-entry undoes the stock change; both stay in the ledger, linked')] : [t('cc_production.adjust.rejectUndo', 'No stock moves')]}
        confirmLabel={mode === 'reverse' ? t('cc_production.adjust.reverse', 'Reverse') : t('cc_production.adjust.reject', 'Reject')}
        onConfirm={(reason) => act(mode === 'reverse' ? 'reverse' : 'reject', reason)}
      />
    </RecordPage>
  )
}
