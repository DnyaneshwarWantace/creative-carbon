"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowDownRight, ArrowUpLeft, ClipboardList, History, PauseCircle, PlayCircle, Printer, Scale, Tag, Undo2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Input } from '@open-mercato/ui/primitives/input'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { useListOptions } from '../../../cc_lists/components/useListOptions'
import { Dropdown } from '../../../cc_lists/components/Dropdown'
import { Timeline } from '../../../cc_ui/components/Timeline'
import { Comments } from '../../../cc_ui/components/Comments'
import { Attachments } from '../../../cc_ui/components/Attachments'
import { CorrectDialog } from '../../../cc_ui/components/CorrectDialog'
import { DocLink, FieldList, LinkRows, Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, type Fact } from '../../../cc_ui/components/RecordPage'
import { PlantChain, type ChainKey } from '../../../cc_ui/components/PlantChain'
import { recordHref, type DocumentKind, type DocumentLink } from '../../../cc_ui/lib/links'
import { day, kg, when } from '../resin/shared'

type LotData = {
  lot: { lotId: string; lotNumber: string; title: string; onHand: number; free: number; place?: string | null; placeLabel: string; unit?: string; nosLeft?: number | null; status?: string; madeOn?: string | null; batchNo?: string | null; productId?: string }
  metadata: Record<string, unknown> | null
  movements: Array<{ id: string; at: string; qty: number; place: string | null; reason: string | null; source: string | null; document: DocumentLink | null; reverses?: string | null; reversedBy?: string | null; adjustmentId?: string | null }>
}

type FamilyLot = { lotId: string; lotNumber: string; title: string | null; madeBy: DocumentLink | null }

type Family = {
  lotId: string
  madeBy: DocumentLink | null
  usedBy: Array<{ document: DocumentLink; kg: number; at: string }>
  ancestors: FamilyLot[]
  children: Array<FamilyLot & { depth: number; parentLot: string }>
  allocations: Array<{ orderId: string; orderNo: string; qty: number; unit: string; status: string; at: string }>
}

const META_FIELDS = ['grade', 'thicknessMm', 'cutSize', 'sheetSize', 'nos', 'madeKg', 'dieNo', 'machine', 'shift', 'customerName', 'disposition', 'supplier', 'invoiceNo', 'pressNumber', 'batchDate'] as const

const CHAIN_OF: Partial<Record<DocumentKind, ChainKey>> = { resin: 'resin', coating: 'coating', press: 'press', moulding: 'moulding', cutting: 'cutting', fg_inspection: 'fg', direct_in: 'fg', order: 'despatch' }

export function StockLotPage({ lotId }: { lotId: string }) {
  const t = useT()
  const [data, setData] = React.useState<LotData | null>(null)
  const [family, setFamily] = React.useState<Family | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const granted = useGranted()
  const canAdjust = granted.has('cc_store.adjust')
  const reasons = useListOptions('stock_adjust_reasons')
  const [mode, setMode] = React.useState<'hold' | 'release' | 'adjust' | null>(null)
  const [adjust, setAdjust] = React.useState({ direction: 'out', quantity: '', reason: '' })
  const [stamp, setStamp] = React.useState(0)

  const load = React.useCallback(() => {
    void apiCall<LotData>(`/api/cc_production/stock/lot?id=${encodeURIComponent(lotId)}`).then((call) => {
      if (!call.ok || !call.result) setError(t('cc_production.stock.lotError', 'Could not load this lot.'))
      else setData(call.result)
    })
    void apiCall<Family>(`/api/cc_production/records/lot?id=${encodeURIComponent(lotId)}`).then((call) => {
      if (call.ok && call.result) setFamily(call.result)
    })
  }, [lotId, t])

  React.useEffect(() => {
    load()
  }, [load])

  const confirm = async (note: string): Promise<boolean> => {
    if (!data) return false
    const call =
      mode === 'adjust'
        ? await apiCall<{ ok?: boolean; status?: string; error?: string }>('/api/cc_store/stock/adjust', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ place: data.lot.place, productId: data.lot.productId, direction: adjust.direction, quantity: Number(adjust.quantity), lotId: data.lot.lotId, reason: adjust.reason, note }) })
        : await apiCall<{ ok?: boolean; error?: string }>('/api/cc_store/lots', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lotId: data.lot.lotId, status: mode === 'hold' ? 'hold' : 'available', reason: note }) })
    if (!call.ok) {
      flash(call.result?.error ?? t('cc_production.lot.actError', 'Could not save.'), 'error')
      return false
    }
    flash(mode === 'adjust' ? ((call.result as { status?: string })?.status === 'pending' ? t('cc_production.lot.pending', 'Sent to the store manager for approval') : t('cc_production.lot.adjusted', 'Stock adjusted')) : mode === 'hold' ? t('cc_production.lot.heldFlash', 'Lot put on hold') : t('cc_production.lot.releasedFlash', 'Lot released'), 'success')
    setAdjust({ direction: 'out', quantity: '', reason: '' })
    setStamp((value) => value + 1)
    load()
    return true
  }

  if (error || !data) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />

  const labels: Record<(typeof META_FIELDS)[number], string> = {
    grade: t('cc_production.lot.grade', 'Grade'),
    thicknessMm: t('cc_production.lot.thickness', 'Thickness (mm)'),
    cutSize: t('cc_production.lot.cutSize', 'Cut size'),
    sheetSize: t('cc_production.lot.sheetSize', 'Sheet size'),
    nos: t('cc_production.lot.nos', 'Nos made'),
    madeKg: t('cc_production.lot.madeKg', 'kg made'),
    dieNo: t('cc_production.lot.dieNo', 'Die No.'),
    machine: t('cc_production.lot.machine', 'Machine'),
    shift: t('cc_production.lot.shift', 'Shift'),
    customerName: t('cc_production.lot.customer', 'Customer'),
    disposition: t('cc_production.lot.disposition', 'Marked for'),
    supplier: t('cc_production.lot.supplier', 'Supplier'),
    invoiceNo: t('cc_production.lot.invoice', 'Invoice No.'),
    pressNumber: t('cc_production.lot.press', 'Press No.'),
    batchDate: t('cc_production.lot.batchDate', 'Batch date'),
  }
  const meta = data.metadata ?? {}
  const fields: Array<[string, React.ReactNode]> = META_FIELDS.filter((field) => meta[field] !== undefined && meta[field] !== null && meta[field] !== '').map((field) => [labels[field], String(meta[field])])
  const counted = data.lot.unit === 'nos'
  const unitText = counted ? t('cc_ui.pcs', 'pcs') : 'kg'
  const amount = (value: number) => (counted ? String(value) : kg(value))
  const totalIn = data.movements.filter((move) => move.qty > 0).reduce((sum, move) => sum + move.qty, 0)
  const totalOut = data.movements.filter((move) => move.qty < 0).reduce((sum, move) => sum + move.qty, 0)
  const held = family?.allocations.filter((entry) => entry.status === 'reserved') ?? []
  const madeBy = family?.madeBy ?? data.movements.find((move) => move.qty > 0)?.document ?? null
  const current = (madeBy && CHAIN_OF[madeBy.kind]) ?? 'fg'
  const route = madeBy?.kind === 'moulding' ? 'moulded' : 'laminate'
  const facts: Fact[] = [
    { label: t('cc_production.lot.left', 'Left'), value: `${amount(data.lot.onHand)} ${unitText}`, hint: data.lot.nosLeft ? t('cc_production.lot.nosLeft', '{nos} nos', { nos: data.lot.nosLeft }) : undefined },
    { label: t('cc_production.lot.free', 'Free to use'), value: `${amount(data.lot.free)} ${unitText}`, tone: data.lot.free < data.lot.onHand ? 'warn' : undefined },
    { label: t('cc_production.lot.where', 'Where'), value: data.lot.placeLabel },
    { label: t('cc_production.lot.madeOn', 'Made / received'), value: day(data.lot.madeOn ?? null) },
    { label: t('cc_production.lot.in', 'Total in'), value: amount(totalIn) },
    { label: t('cc_production.lot.out', 'Total out'), value: amount(Math.abs(totalOut)) },
  ]

  return (
    <RecordPage
      back={{ href: '/backend/stock', label: t('cc_production.stock.title', 'All stock') }}
      overline={[t('cc_production.lot.overline', 'Lot'), data.lot.title].join(' · ')}
      title={data.lot.lotNumber}
      badges={
        <>
          {data.lot.status && data.lot.status !== 'available' ? <StatusBadge variant="warning">{t(`cc_production.lot.status.${data.lot.status}`, data.lot.status)}</StatusBadge> : <StatusBadge variant="success">{t('cc_production.lot.available', 'Available')}</StatusBadge>}
          {held.length ? <StatusBadge variant="info">{t('cc_production.lot.heldFor', 'Held for {count} orders', { count: held.length })}</StatusBadge> : null}
        </>
      }
      meta={madeBy ? <>{t('cc_production.lot.madeBy', 'Made by')} <DocLink doc={madeBy} /></> : undefined}
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('cc_production.resin.print', 'Print')}
          </Button>
          {canAdjust && data.lot.place && data.lot.productId ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setMode('adjust')}>
              <Scale className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.lot.adjust', 'Adjust kg')}
            </Button>
          ) : null}
          {canAdjust && data.lot.onHand > 0 ? (
            data.lot.status === 'hold' ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setMode('release')}>
                <PlayCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.lot.release', 'Release')}
              </Button>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setMode('hold')}>
                <PauseCircle className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.lot.hold', 'Put on hold')}
              </Button>
            )
          ) : null}
        </>
      }
      chain={madeBy ? <PlantChain route={route} current={current} hrefs={{ [current]: madeBy.href }} /> : undefined}
      facts={facts}
    >
      <RecordColumns
        main={
          <>
            <Panel title={t('cc_production.bstage.movements', 'Came from and went to')} icon={History} count={data.movements.length} flush>
              <RegisterGrid
                rows={data.movements}
                rowKey={(move) => move.id}
                empty={t('cc_production.bstage.noMoves', 'No movements on this lot.')}
                columns={[
                  { key: 'at', label: t('cc_production.bstage.when', 'When'), render: (move) => when(move.at) },
                  { key: 'doc', label: t('cc_production.bstage.document', 'Document'), render: (move) => (move.document ? <DocLink doc={move.document} /> : '—') },
                  {
                    key: 'reason',
                    label: t('cc_production.bstage.detail', 'Detail'),
                    render: (move) => (
                      <span className="whitespace-normal text-xs text-muted-foreground">
                        {[move.reason, move.place].filter(Boolean).join(' · ') || '—'}
                        {move.adjustmentId ? (
                          <Link className="ml-1 text-primary hover:underline" href={`/backend/stock/adjustments/${move.adjustmentId}`}>
                            {t('cc_production.lot.openAdjustment', 'adjustment')}
                          </Link>
                        ) : null}
                        {move.reverses || move.reversedBy ? (
                          <span className="ml-1 inline-flex items-center gap-1 rounded border border-status-warning-border bg-status-warning-bg px-1 text-status-warning-text">
                            <Undo2 className="h-3 w-3" aria-hidden="true" />
                            {move.reverses ? t('cc_production.lot.undoes', 'undoes an earlier entry') : t('cc_production.lot.undone', 'undone later')}
                          </span>
                        ) : null}
                      </span>
                    ),
                  },
                  {
                    key: 'qty',
                    label: unitText,
                    align: 'right',
                    render: (move) => (
                      <span className={move.qty < 0 ? 'text-muted-foreground' : 'font-semibold'}>
                        {move.qty > 0 ? '+' : ''}
                        {amount(move.qty)}
                      </span>
                    ),
                    total: amount(data.lot.onHand),
                  },
                ]}
              />
            </Panel>
            {fields.length ? (
              <Panel title={t('cc_production.lot.details', 'Lot details')} icon={Tag}>
                <FieldList fields={fields} />
              </Panel>
            ) : null}
          </>
        }
        side={
          <>
            <Panel title={t('cc_production.lot.cameFrom', 'Came from (parent lots)')} icon={ArrowUpLeft} count={family?.ancestors.length ?? null} flush>
              <LinkRows
                empty={family ? (madeBy ? t('cc_production.lot.firstLot', 'First lot in its chain. See "Made by" above.') : t('cc_production.lot.noParent', 'No parent lot recorded.')) : t('cc_production.resin.loading', 'Loading…')}
                rows={(family?.ancestors ?? []).map((lot, index) => ({
                  key: lot.lotId,
                  href: recordHref.lot(lot.lotId),
                  primary: <span className="font-mono">{'↑'.repeat(index + 1)} {lot.lotNumber}</span>,
                  secondary: lot.madeBy ? <DocLink doc={lot.madeBy} /> : lot.title ?? undefined,
                }))}
              />
            </Panel>
            <Panel title={t('cc_production.lot.children', 'Went to (lots made from it)')} icon={ArrowDownRight} count={family?.children.length ?? null} flush>
              <LinkRows
                empty={t('cc_production.lot.noChildren', 'No lot has been made from this one yet.')}
                rows={(family?.children ?? []).map((lot) => ({
                  key: lot.lotId,
                  href: recordHref.lot(lot.lotId),
                  primary: <span className="font-mono">{lot.depth === 2 ? '↳↳' : '↳'} {lot.lotNumber}</span>,
                  secondary: lot.madeBy ? <DocLink doc={lot.madeBy} /> : lot.title ?? undefined,
                }))}
              />
            </Panel>
            <Panel title={t('cc_production.lot.orders', 'Orders holding or taking it')} icon={ClipboardList} count={family?.allocations.length ?? null} flush>
              <LinkRows
                empty={t('cc_production.lot.noOrders', 'Not allocated to any order.')}
                rows={(family?.allocations ?? []).map((entry, index) => ({
                  key: `${entry.orderId}-${index}`,
                  href: recordHref.order(entry.orderId),
                  primary: <span className="font-mono">{entry.orderNo}</span>,
                  secondary: day(entry.at),
                  value: `${amount(entry.qty)} ${entry.unit === 'nos' ? t('cc_ui.pcs', 'pcs') : 'kg'}`,
                  badge: <StatusBadge variant={entry.status === 'reserved' ? 'info' : entry.status === 'shipped' ? 'success' : 'neutral'}>{t(`cc_production.lot.allocation.${entry.status}`, entry.status)}</StatusBadge>,
                }))}
              />
            </Panel>
            {data.lot.productId ? (
              <p className="text-xs text-muted-foreground">
                <Link className="underline-offset-2 hover:underline" href={recordHref.product(data.lot.productId)}>
                  {t('cc_production.lot.openItem', 'Open the item {title}', { title: data.lot.title })}
                </Link>
              </p>
            ) : null}
          </>
        }
      />
      <Attachments type="lot" id={data.lot.lotId} hint={t('cc_production.lot.filesHint', 'COA, test reports, photos of the lot.')} />
      <Comments type="lot" id={data.lot.lotId} />
      <Timeline type="lot" id={data.lot.lotId} refreshKey={stamp} title={t('cc_production.lot.changes', 'Holds, releases, QC and adjustments')} />
      <CorrectDialog
        open={mode !== null}
        onOpenChange={(next) => !next && setMode(null)}
        destructive={mode === 'hold'}
        title={mode === 'adjust' ? t('cc_production.lot.adjustTitle', 'Adjust {lot}', { lot: data.lot.lotNumber }) : mode === 'hold' ? t('cc_production.lot.holdTitle', 'Put {lot} on hold?', { lot: data.lot.lotNumber }) : t('cc_production.lot.releaseTitle', 'Release {lot}?', { lot: data.lot.lotNumber })}
        description={
          mode === 'adjust' ? (
            <span className="mt-2 grid grid-cols-2 gap-2">
              <Dropdown value={adjust.direction} onChange={(event) => setAdjust((prev) => ({ ...prev, direction: event.target.value }))} aria-label={t('cc_production.lot.direction', 'Add or remove')}>
                <option value="out">{t('cc_production.lot.remove', 'Remove')}</option>
                <option value="in">{t('cc_production.lot.add', 'Add')}</option>
              </Dropdown>
              <Input type="number" min={0} step="any" value={adjust.quantity} onChange={(event) => setAdjust((prev) => ({ ...prev, quantity: event.target.value }))} placeholder={unitText} aria-label={t('cc_production.lot.qty', 'Quantity')} />
              <span className="col-span-2">
                <Dropdown value={adjust.reason} onChange={(event) => setAdjust((prev) => ({ ...prev, reason: event.target.value }))} aria-label={t('cc_production.lot.reasonPick', 'Reason')}>
                  <option value="">{t('cc_production.lot.reasonPick', 'Reason…')}</option>
                  {reasons.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Dropdown>
              </span>
            </span>
          ) : undefined
        }
        undo={mode === 'adjust' ? [t('cc_production.lot.adjustUndo', 'A stock adjustment is posted with your note; over {limit} it waits for the store manager', { limit: 100 })] : mode === 'hold' ? [t('cc_production.lot.holdUndo', 'It cannot be issued or allocated until released')] : [t('cc_production.lot.releaseUndo', 'It can be used again')]}
        confirmLabel={mode === 'adjust' ? t('cc_production.lot.adjust', 'Adjust kg') : mode === 'hold' ? t('cc_production.lot.hold', 'Put on hold') : t('cc_production.lot.release', 'Release')}
        onConfirm={(note) => (mode === 'adjust' && (!adjust.reason || !(Number(adjust.quantity) > 0)) ? Promise.resolve(false) : confirm(note))}
      />
    </RecordPage>
  )
}

export default StockLotPage
