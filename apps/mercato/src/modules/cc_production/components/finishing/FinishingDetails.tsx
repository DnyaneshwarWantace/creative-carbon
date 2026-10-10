"use client"

import * as React from 'react'
import Link from 'next/link'
import { ClipboardCheck, PackagePlus, Printer, Ruler, RotateCcw, Scissors, Trash2, TriangleAlert, Undo2, Waypoints } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { PLACE_LABEL, type StockPlace } from '../../../cc_products/lib/stock'
import { DocLink, FieldList, LinkRows, Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, type Fact, type LinkRow } from '../../../cc_ui/components/RecordPage'
import { PlantChain } from '../../../cc_ui/components/PlantChain'
import { recordHref, type DocumentLink } from '../../../cc_ui/lib/links'
import { HISTORY_LABEL, day, kg, when } from '../resin/shared'
import { useSend } from './shared'
import { Timeline } from '../../../cc_ui/components/Timeline'

type Kind = 'cutting' | 'thickness' | 'fg' | 'direct_in' | 'damage'
type HistoryItem = { action: string; by: string | null; at: string; note: string | null }
type LotTrace = { lotId: string; lotNumber: string | null; title: string | null; madeBy: DocumentLink | null; usedBy: Array<{ document: DocumentLink; kg: number; at: string }> }
type FgLink = { id: string; reportDate: string; status: string }

function useRecord<T>(kind: Kind, id: string, errorText: string) {
  const [record, setRecord] = React.useState<T | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const load = React.useCallback(async () => {
    const call = await apiCall<T>(`/api/cc_production/records/finishing?kind=${kind}&id=${encodeURIComponent(id)}`)
    if (!call.ok || !call.result) setError(errorText)
    else setRecord(call.result)
  }, [errorText, id, kind])
  React.useEffect(() => {
    void load()
  }, [load])
  return { record, error, load }
}

function historyEntries(history: HistoryItem[]) {
  return [...history].reverse().map((entry, index) => ({ key: `${entry.at}-${index}`, label: HISTORY_LABEL[entry.action] ?? entry.action, note: entry.note, by: entry.by, at: entry.at }))
}

function PrintButton() {
  const t = useT()
  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
      {t('cc_production.resin.print', 'Print')}
    </Button>
  )
}

function LotLink({ lotId, lotNumber }: { lotId: string | null; lotNumber: string | null }) {
  if (!lotId) return <span className="font-mono">{lotNumber ?? '—'}</span>
  return (
    <Link className="font-mono underline-offset-2 hover:underline" href={recordHref.lot(lotId)}>
      {lotNumber ?? '—'}
    </Link>
  )
}

function TracePanel({ title, trace, empty }: { title: string; trace: LotTrace | null; empty: string }) {
  const t = useT()
  const rows: LinkRow[] = trace
    ? [
        { key: 'lot', href: recordHref.lot(trace.lotId), primary: <span className="font-mono">{trace.lotNumber ?? '—'}</span>, secondary: trace.title ?? undefined },
        ...(trace.madeBy ? [{ key: 'made', href: trace.madeBy.href, primary: <DocLink doc={trace.madeBy} />, secondary: t('cc_production.trace.madeBy', 'made this lot') }] : []),
        ...trace.usedBy.map((entry, index) => ({ key: `used-${index}`, href: entry.document.href, primary: <DocLink doc={entry.document} />, secondary: day(entry.at), value: `${kg(entry.kg)}` })),
      ]
    : []
  return (
    <Panel title={title} icon={Waypoints} flush>
      <LinkRows empty={empty} rows={rows} />
    </Panel>
  )
}

function FgLinks({ reports }: { reports: FgLink[] }) {
  const t = useT()
  return (
    <Panel title={t('cc_production.trace.fgReports', 'FG inspection')} icon={ClipboardCheck} count={reports.length} flush>
      <LinkRows
        empty={t('cc_production.trace.noFg', 'Not on an FG inspection report yet.')}
        rows={reports.map((report) => ({
          key: report.id,
          href: recordHref.fgInspection(report.id),
          primary: day(report.reportDate),
          badge: <StatusBadge variant={report.status === 'posted' ? 'success' : 'warning'}>{report.status === 'posted' ? t('cc_production.status.posted', 'Posted') : t('cc_production.status.draft', 'Not posted')}</StatusBadge>,
        }))}
      />
    </Panel>
  )
}

type CuttingView = {
  id: string
  entryDate: string
  sourceLotId: string
  sourceLotNumber: string | null
  sourceTitle: string | null
  sheetsIn: number
  sourceKgUsed: number
  cutSize: string
  sheets: Array<{ no: number; weightKg: number }>
  trimmedKg: number
  trimKg: number
  trimPct: number
  outputLotId: string | null
  outputLotNumber: string | null
  status: 'posted' | 'reversed'
  warnings: string[]
  notes: string | null
  byName: string | null
  updatedAt: string
  source: LotTrace | null
  output: LotTrace | null
  thickness: Array<{ id: string; inspectDate: string; result: 'pass' | 'hold'; outOfTolerance: number }>
  fgReports: FgLink[]
  history: HistoryItem[]
}

export function CuttingDetailPage({ recordId }: { recordId: string }) {
  const t = useT()
  const granted = useGranted()
  const send = useSend(`cc-cutting-${recordId}`)
  const { record: cut, error, load } = useRecord<CuttingView>('cutting', recordId, t('cc_production.cutting.loadError', 'Could not load this cutting entry.'))
  const [busy, setBusy] = React.useState(false)
  if (error || !cut) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />

  const reverse = async () => {
    setBusy(true)
    const result = await send<{ ok: boolean }>('/api/cc_production/cutting/reverse', 'POST', { id: cut.id }, cut.updatedAt)
    setBusy(false)
    if (result) {
      flash(t('cc_production.cutting.reversed', 'Reversed. The sheets are back in the pressed lot.'), 'success')
      await load()
    }
  }
  const outsideBand = cut.warnings.length > 0
  const facts: Fact[] = [
    { label: t('cc_production.resin.date', 'Date'), value: day(cut.entryDate) },
    { label: t('cc_production.cutting.cutSize', 'Cut size'), value: cut.cutSize },
    { label: t('cc_production.cutting.sheetsIn', 'Sheets'), value: String(cut.sheetsIn) },
    { label: t('cc_production.cutting.taken', 'Taken from lot'), value: `${kg(cut.sourceKgUsed)} kg` },
    { label: t('cc_production.cutting.trimmed', 'After trimming'), value: `${kg(cut.trimmedKg)} kg` },
    { label: t('cc_production.cutting.trim', 'Trim loss'), value: `${kg(cut.trimKg)} kg`, hint: `${cut.trimPct}%`, tone: outsideBand ? 'warn' : 'good' },
  ]
  return (
    <RecordPage
      back={{ href: '/backend/cutting', label: t('cc_production.nav.cutting', 'Cutting & trimming') }}
      overline={[t('cc_production.cutting.overline', 'Cutting · trimming'), cut.sourceTitle].filter(Boolean).join(' · ')}
      title={cut.outputLotNumber ?? cut.sourceLotNumber ?? '—'}
      badges={<StatusBadge variant={cut.status === 'posted' ? 'success' : 'neutral'}>{cut.status === 'posted' ? t('cc_production.cutting.posted', 'Cut') : t('cc_production.cutting.reversedBadge', 'Reversed')}</StatusBadge>}
      meta={cut.byName ? t('cc_production.cutting.by', 'Entered by {name}', { name: cut.byName }) : undefined}
      actions={
        <>
          <PrintButton />
          {granted.has('cc_production.cutting.enter') && cut.status === 'posted' ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void reverse()}>
              <Undo2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.cutting.reverse', 'Reverse')}
            </Button>
          ) : null}
        </>
      }
      chain={<PlantChain current="cutting" hrefs={{ press: cut.source?.madeBy?.href ?? null, thickness: cut.thickness[0] ? recordHref.thickness(cut.thickness[0].id) : null, fg: cut.fgReports[0] ? recordHref.fgInspection(cut.fgReports[0].id) : null }} />}
      facts={facts}
    >
      <RecordColumns
        main={
          <>
            <Panel title={t('cc_production.cutting.sheetWeights', 'Sheet weights after trimming')} icon={Scissors} count={cut.sheets.length} flush>
              <RegisterGrid
                rows={cut.sheets}
                rowKey={(sheet) => String(sheet.no)}
                empty={t('cc_production.cutting.noSheets', 'No sheet weights.')}
                columns={[
                  { key: 'no', label: t('cc_production.cutting.sheetNo', 'Sheet No.'), mono: true, render: (sheet) => sheet.no },
                  { key: 'kg', label: 'kg', align: 'right', render: (sheet) => kg(sheet.weightKg), total: kg(cut.trimmedKg) },
                ]}
              />
            </Panel>
            {cut.notes ? (
              <Panel title={t('cc_production.issues.note', 'Note')}>
                <p className="text-sm">{cut.notes}</p>
              </Panel>
            ) : null}
          </>
        }
        side={
          <>
            {cut.warnings.length ? (
              <Panel title={t('cc_production.press.warnings', 'Warnings')} icon={TriangleAlert} count={cut.warnings.length}>
                <ul className="list-disc space-y-1 pl-5 text-sm text-status-warning-text">
                  {cut.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Panel>
            ) : null}
            <TracePanel title={t('cc_production.trace.cameFrom', 'Came from')} trace={cut.source} empty={t('cc_production.trace.noSource', 'Source lot not found.')} />
            <TracePanel title={t('cc_production.trace.wentTo', 'Went to')} trace={cut.output} empty={t('cc_production.trace.reversed', 'No trimmed lot (reversed).')} />
            <Panel title={t('cc_production.nav.thickness', 'Thickness inspection')} icon={Ruler} count={cut.thickness.length} flush>
              <LinkRows
                empty={t('cc_production.trace.noThickness', 'Not checked for thickness yet.')}
                rows={cut.thickness.map((row) => ({
                  key: row.id,
                  href: recordHref.thickness(row.id),
                  primary: day(row.inspectDate),
                  secondary: t('cc_production.thickness.outOf', '{count} of 12 out', { count: row.outOfTolerance }),
                  badge: <StatusBadge variant={row.result === 'pass' ? 'success' : 'warning'}>{row.result === 'pass' ? t('cc_production.thickness.pass', 'Pass') : t('cc_production.thickness.hold', 'Hold')}</StatusBadge>,
                }))}
              />
            </Panel>
            <FgLinks reports={cut.fgReports} />
          </>
        }
      />
      <Timeline type="cutting" id={cut.id} refreshKey={cut.history.length} />
    </RecordPage>
  )
}

type ThicknessView = {
  id: string
  inspectDate: string
  lotId: string | null
  lotRef: string
  grade: string | null
  daylight: string | null
  targetMm: number
  minusMm: number | null
  plusMm: number | null
  readings: number[]
  outOfTolerance: number
  result: 'pass' | 'hold'
  inspector: string | null
  notes: string | null
  byName: string | null
  lot: LotTrace | null
  cutting: { id: string; entryDate: string; cutSize: string } | null
  fgReports: FgLink[]
  history: HistoryItem[]
}

export function ThicknessDetailPage({ recordId }: { recordId: string }) {
  const t = useT()
  const { record: row, error } = useRecord<ThicknessView>('thickness', recordId, t('cc_production.thickness.loadError', 'Could not load this inspection.'))
  if (error || !row) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />
  const low = row.minusMm === null ? null : row.targetMm - row.minusMm
  const high = row.plusMm === null ? null : row.targetMm + row.plusMm
  const out = (reading: number) => (low !== null && reading < low - 0.0001) || (high !== null && reading > high + 0.0001)
  const average = row.readings.length ? row.readings.reduce((sum, reading) => sum + reading, 0) / row.readings.length : null
  const facts: Fact[] = [
    { label: t('cc_production.resin.date', 'Date'), value: day(row.inspectDate) },
    { label: t('cc_production.thickness.target', 'Target'), value: `${row.targetMm} mm`, hint: row.minusMm !== null || row.plusMm !== null ? `−${row.minusMm ?? 0} / +${row.plusMm ?? 0}` : t('cc_production.thickness.noTolerance', 'no tolerance set') },
    { label: t('cc_production.thickness.min', 'Lowest'), value: row.readings.length ? `${Math.min(...row.readings)} mm` : '—' },
    { label: t('cc_production.thickness.max', 'Highest'), value: row.readings.length ? `${Math.max(...row.readings)} mm` : '—' },
    { label: t('cc_production.thickness.avg', 'Average'), value: average === null ? '—' : `${Math.round(average * 100) / 100} mm` },
    { label: t('cc_production.thickness.outShort', 'Out of 12'), value: String(row.outOfTolerance), tone: row.outOfTolerance ? 'bad' : 'good' },
  ]
  return (
    <RecordPage
      back={{ href: '/backend/quality/thickness', label: t('cc_production.nav.thickness', 'Thickness inspection') }}
      overline={[t('cc_production.thickness.overline', 'Thickness inspection'), row.grade, row.daylight ? t('cc_production.thickness.daylight', 'daylight {no}', { no: row.daylight }) : null].filter(Boolean).join(' · ')}
      title={row.lotRef}
      badges={<StatusBadge variant={row.result === 'pass' ? 'success' : 'warning'} dot>{row.result === 'pass' ? t('cc_production.thickness.pass', 'Pass') : t('cc_production.thickness.hold', 'Hold')}</StatusBadge>}
      meta={row.inspector ? t('cc_production.thickness.inspector', 'Checked by {name}', { name: row.inspector }) : undefined}
      actions={<PrintButton />}
      chain={<PlantChain current="thickness" hrefs={{ cutting: row.cutting ? recordHref.cutting(row.cutting.id) : null, fg: row.fgReports[0] ? recordHref.fgInspection(row.fgReports[0].id) : null }} />}
      facts={facts}
    >
      <RecordColumns
        main={
          <>
            <Panel title={t('cc_production.thickness.grid', '12 readings')} icon={Ruler}>
              <div className="grid grid-cols-4 overflow-hidden rounded-md border border-foreground/70">
                {row.readings.map((reading, index) => (
                  <div key={index} className={cn('border-b border-r border-border px-3 py-2 text-center', out(reading) && 'bg-status-error-bg text-status-error-text')}>
                    <p className="font-mono text-overline uppercase tracking-widest text-muted-foreground">{index + 1}</p>
                    <p className="font-mono text-lg font-semibold tabular-nums">{reading}</p>
                  </div>
                ))}
              </div>
              {low !== null || high !== null ? <p className="mt-2 text-xs text-muted-foreground">{t('cc_production.thickness.band', 'Accepted {low} – {high} mm', { low: low ?? '—', high: high ?? '—' })}</p> : null}
            </Panel>
            {row.notes ? (
              <Panel title={t('cc_production.issues.note', 'Note')}>
                <p className="text-sm">{row.notes}</p>
              </Panel>
            ) : null}
          </>
        }
        side={
          <>
            <TracePanel title={t('cc_production.trace.lot', 'Lot checked')} trace={row.lot} empty={t('cc_production.thickness.noLot', 'Entered by batch reference only, no stock lot.')} />
            {row.cutting ? (
              <Panel title={t('cc_production.nav.cutting', 'Cutting & trimming')} icon={Scissors} flush>
                <LinkRows empty={null} rows={[{ key: row.cutting.id, href: recordHref.cutting(row.cutting.id), primary: day(row.cutting.entryDate), secondary: row.cutting.cutSize }]} />
              </Panel>
            ) : null}
            <FgLinks reports={row.fgReports} />
          </>
        }
      />
      <Timeline type="thickness" id={row.id} refreshKey={row.history.length} />
    </RecordPage>
  )
}

type FgRowView = {
  sr: number
  sourceLotId: string
  sourceLotNumber: string | null
  batchNo: string | null
  itemTitle: string
  sheetSize: string | null
  thicknessMm: number | null
  qtyNos: number
  rejectNos: number
  rejectReason: string | null
  disposition: 'stock' | 'export' | 'allocation'
  customerId: string | null
  customerName: string | null
  passKg: number | null
  rejectKg: number | null
  outputLotId: string | null
  outputLotNumber: string | null
  source: LotTrace | null
  output: LotTrace | null
}

type FgView = {
  id: string
  reportDate: string
  rows: FgRowView[]
  inspector: string | null
  approvedBy: string | null
  status: 'draft' | 'posted'
  totals: { pieces: number; rejected: number; kg: number }
  postedAt: string | null
  byName: string | null
  history: HistoryItem[]
  updatedAt: string
}

export function FgReportDetailPage({ recordId }: { recordId: string }) {
  const t = useT()
  const granted = useGranted()
  const send = useSend(`cc-fg-${recordId}`)
  const { record: report, error, load } = useRecord<FgView>('fg', recordId, t('cc_production.fg.loadError', 'Could not load this report.'))
  const [busy, setBusy] = React.useState(false)
  if (error || !report) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />
  const reopen = async () => {
    setBusy(true)
    const result = await send<FgView>('/api/cc_production/fg-inspection/action', 'POST', { id: report.id, action: 'reopen' }, report.updatedAt)
    setBusy(false)
    if (result) {
      flash(t('cc_production.fg.reopened', 'Reopened. The pieces are back on the shop floor.'), 'success')
      await load()
    }
  }
  const disposition = (row: FgRowView) =>
    row.disposition === 'allocation' ? (
      row.customerId ? (
        <Link className="underline-offset-2 hover:underline" href={recordHref.customer(row.customerId)}>
          {row.customerName ?? '—'}
        </Link>
      ) : (
        row.customerName ?? '—'
      )
    ) : row.disposition === 'export' ? (
      t('cc_production.fg.export', 'Export')
    ) : (
      t('cc_production.fg.stock', 'Stock')
    )
  const facts: Fact[] = [
    { label: t('cc_production.resin.date', 'Date'), value: day(report.reportDate) },
    { label: t('cc_production.fg.rows', 'Rows'), value: String(report.rows.length) },
    { label: t('cc_production.fg.pass', 'Pieces OK'), value: String(report.totals.pieces), tone: 'good' },
    { label: t('cc_production.fg.rejected', 'Rejected'), value: String(report.totals.rejected), tone: report.totals.rejected ? 'bad' : undefined },
    { label: t('cc_production.fg.kgIn', 'kg to FG store'), value: kg(report.totals.kg) },
    { label: t('cc_production.fg.allocated', 'Allocated rows'), value: String(report.rows.filter((row) => row.disposition === 'allocation').length) },
  ]
  return (
    <RecordPage
      back={{ href: '/backend/quality/fg-inspection', label: t('cc_production.nav.fgInspection', 'FG inspection') }}
      overline={`CCCPL/F/QC/04 · ${t('cc_production.fg.overline', 'Finished goods inspection test report')}`}
      title={day(report.reportDate)}
      mono={false}
      badges={<StatusBadge variant={report.status === 'posted' ? 'success' : 'warning'} dot>{report.status === 'posted' ? t('cc_production.status.posted', 'Posted') : t('cc_production.status.draft', 'Not posted')}</StatusBadge>}
      meta={[report.inspector ? t('cc_production.fg.inspector', 'Inspected by {name}', { name: report.inspector }) : null, report.approvedBy ? t('cc_production.fg.approved', 'approved by {name}', { name: report.approvedBy }) : null, report.postedAt ? when(report.postedAt) : null].filter(Boolean).join(' · ')}
      actions={
        <>
          <PrintButton />
          {granted.has('cc_production.quality.enter') && report.status === 'posted' ? (
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void reopen()}>
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.resin.reopen', 'Reopen')}
            </Button>
          ) : null}
        </>
      }
      chain={<PlantChain current="fg" />}
      facts={facts}
    >
      <Panel title={t('cc_production.fg.rowsTitle', 'Rows as entered')} icon={ClipboardCheck} count={report.rows.length} flush>
        <RegisterGrid
          rows={report.rows}
          rowKey={(row) => String(row.sr)}
          empty={t('cc_production.fg.noRows', 'No rows.')}
          columns={[
            { key: 'sr', label: 'Sr.', mono: true, render: (row) => row.sr },
            { key: 'source', label: t('cc_production.fg.fromLot', 'From lot'), render: (row) => <LotLink lotId={row.sourceLotId} lotNumber={row.batchNo ?? row.sourceLotNumber} /> },
            { key: 'item', label: t('cc_production.fg.item', 'Item'), render: (row) => row.itemTitle },
            { key: 'size', label: t('cc_production.fg.size', 'Size'), render: (row) => [row.sheetSize, row.thicknessMm ? `${row.thicknessMm} mm` : null].filter(Boolean).join(' · ') || '—' },
            { key: 'goes', label: t('cc_production.fg.disposition', 'Goes to'), render: disposition },
            {
              key: 'reject',
              label: t('cc_production.fg.rejected', 'Rejected'),
              align: 'right',
              render: (row) => (row.rejectNos ? <span className="text-status-error-text">{row.rejectNos} · {row.rejectReason}</span> : '—'),
              total: String(report.totals.rejected),
            },
            { key: 'ok', label: t('cc_production.fg.pass', 'Pieces OK'), align: 'right', render: (row) => row.qtyNos, total: String(report.totals.pieces) },
            { key: 'kg', label: 'kg', align: 'right', render: (row) => (row.passKg !== null ? kg(row.passKg) : '—'), total: kg(report.totals.kg) },
            { key: 'out', label: t('cc_production.fg.fgLot', 'FG lot'), render: (row) => (row.outputLotId ? <LotLink lotId={row.outputLotId} lotNumber={row.outputLotNumber} /> : '—') },
          ]}
        />
      </Panel>
      <Panel title={t('cc_production.fg.wentOn', 'Where the FG lots went')} icon={Waypoints} flush>
        <LinkRows
          empty={report.status === 'posted' ? t('cc_production.fg.notUsed', 'No FG lot has been allocated or despatched yet.') : t('cc_production.resin.notPostedYet', 'Not posted yet.')}
          rows={report.rows.flatMap((row) =>
            (row.output?.usedBy ?? []).map((entry, index) => ({
              key: `${row.sr}-${index}`,
              href: entry.document.href,
              primary: <DocLink doc={entry.document} />,
              secondary: `${row.outputLotNumber ?? ''} · ${day(entry.at)}`,
              value: kg(entry.kg),
            })),
          )}
        />
      </Panel>
      <Timeline type="fg_inspection" id={report.id} refreshKey={report.history.length} />
    </RecordPage>
  )
}

type DirectInView = {
  id: string
  inDate: string
  supplier: string
  invoiceNo: string | null
  productId: string
  itemTitle: string
  sheetSize: string | null
  thicknessMm: number | null
  nos: number | null
  kg: number
  lotId: string | null
  lotNumber: string | null
  status: string
  byName: string | null
  lot: LotTrace | null
  history: HistoryItem[]
}

export function DirectInDetailPage({ recordId }: { recordId: string }) {
  const t = useT()
  const { record, error } = useRecord<DirectInView>('direct_in', recordId, t('cc_production.direct.loadError', 'Could not load this entry.'))
  if (error || !record) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />
  const facts: Fact[] = [
    { label: t('cc_production.resin.date', 'Date'), value: day(record.inDate) },
    { label: t('cc_production.direct.supplier', 'Supplier'), value: record.supplier },
    { label: t('cc_production.direct.invoice', 'Invoice No.'), value: record.invoiceNo ?? '—' },
    { label: 'kg', value: kg(record.kg) },
    { label: t('cc_production.direct.nos', 'Nos'), value: record.nos !== null ? String(record.nos) : '—' },
    { label: t('cc_production.fg.size', 'Size'), value: [record.sheetSize, record.thicknessMm ? `${record.thicknessMm} mm` : null].filter(Boolean).join(' · ') || '—' },
  ]
  return (
    <RecordPage
      back={{ href: '/backend/fg/direct-in', label: t('cc_production.nav.directIn', 'Bought-in & damaged') }}
      overline={t('cc_production.direct.overline', 'Bought-in goods · FG store')}
      title={record.lotNumber ?? record.itemTitle}
      badges={<StatusBadge variant={record.status === 'posted' ? 'success' : 'neutral'}>{record.status === 'posted' ? t('cc_production.direct.received', 'Received') : t('cc_production.cutting.reversedBadge', 'Reversed')}</StatusBadge>}
      meta={record.byName ? t('cc_production.cutting.by', 'Entered by {name}', { name: record.byName }) : undefined}
      actions={<PrintButton />}
      facts={facts}
    >
      <RecordColumns
        main={
          <Panel title={t('cc_production.direct.item', 'Item')} icon={PackagePlus}>
            <FieldList
              fields={[
                [
                  t('cc_production.fg.item', 'Item'),
                  <Link key="item" className="underline-offset-2 hover:underline" href={recordHref.product(record.productId)}>
                    {record.itemTitle}
                  </Link>,
                ],
                [t('cc_production.direct.supplier', 'Supplier'), record.supplier],
                [t('cc_production.direct.invoice', 'Invoice No.'), record.invoiceNo],
                [t('cc_production.fg.size', 'Size'), record.sheetSize],
                [t('cc_production.direct.thickness', 'Thickness'), record.thicknessMm ? `${record.thicknessMm} mm` : null],
              ]}
            />
          </Panel>
        }
        side={<TracePanel title={t('cc_production.trace.wentTo', 'Went to')} trace={record.lot} empty={t('cc_production.direct.noLot', 'No stock lot.')} />}
      />
      <Timeline type="fg_direct_in" id={record.id} refreshKey={record.history.length} />
    </RecordPage>
  )
}

type DamageView = {
  id: string
  entryDate: string
  productId: string
  itemTitle: string
  lotId: string
  lotNumber: string | null
  place: string
  kg: number
  reason: string
  byName: string | null
  lot: LotTrace | null
  history: HistoryItem[]
}

export function DamageDetailPage({ recordId }: { recordId: string }) {
  const t = useT()
  const { record, error } = useRecord<DamageView>('damage', recordId, t('cc_production.damage.loadError', 'Could not load this entry.'))
  if (error || !record) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />
  const facts: Fact[] = [
    { label: t('cc_production.resin.date', 'Date'), value: day(record.entryDate) },
    { label: t('cc_production.damage.qty', 'Written off'), value: kg(record.kg), tone: 'bad' },
    { label: t('cc_production.damage.store', 'Store'), value: PLACE_LABEL[record.place as StockPlace] ?? record.place },
    { label: t('cc_production.damage.by', 'By'), value: record.byName ?? '—' },
  ]
  return (
    <RecordPage
      back={{ href: '/backend/fg/direct-in', label: t('cc_production.nav.directIn', 'Bought-in & damaged') }}
      overline={t('cc_production.damage.overline', 'Damage · stock written off')}
      title={record.lotNumber ?? record.itemTitle}
      badges={<StatusBadge variant="error">{t('cc_production.damage.badge', 'Damaged')}</StatusBadge>}
      meta={record.reason}
      actions={<PrintButton />}
      facts={facts}
    >
      <RecordColumns
        main={
          <Panel title={t('cc_production.damage.what', 'What was damaged')} icon={Trash2}>
            <FieldList
              fields={[
                [
                  t('cc_production.fg.item', 'Item'),
                  <Link key="item" className="underline-offset-2 hover:underline" href={recordHref.product(record.productId)}>
                    {record.itemTitle}
                  </Link>,
                ],
                [t('cc_production.damage.lot', 'Lot No.'), <LotLink key="lot" lotId={record.lotId} lotNumber={record.lotNumber} />],
                [t('cc_production.damage.reason', 'Reason'), record.reason],
              ]}
            />
          </Panel>
        }
        side={<TracePanel title={t('cc_production.trace.cameFrom', 'Came from')} trace={record.lot} empty={t('cc_production.trace.noSource', 'Source lot not found.')} />}
      />
      <Timeline type="damage" id={record.id} refreshKey={record.history.length} />
    </RecordPage>
  )
}
