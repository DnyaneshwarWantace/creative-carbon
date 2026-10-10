"use client"

import * as React from 'react'
import Link from 'next/link'
import { Beaker, Clock, Pencil, Printer, TriangleAlert, Waypoints, Wind } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { PLACE_LABEL, type StockPlace } from '../../../cc_products/lib/stock'
import { HISTORY_LABEL, day, kg, when } from '../resin/shared'
import { SHEET_STATUS, paperTime, type SheetView } from './shared'
import { LinkRows, Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, type Fact } from '../../../cc_ui/components/RecordPage'
import { PlantChain } from '../../../cc_ui/components/PlantChain'
import { recordHref } from '../../../cc_ui/lib/links'
import { Timeline } from '../../../cc_ui/components/Timeline'
import { Attachments } from '../../../cc_ui/components/Attachments'

export function CoatingSheetPage({ sheetId }: { sheetId: string }) {
  const t = useT()
  const [sheet, setSheet] = React.useState<SheetView | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void apiCall<SheetView>(`/api/cc_production/coating/sheets?id=${encodeURIComponent(sheetId)}`).then((call) => {
      if (!call.ok || !call.result) setError(t('cc_production.coating.loadError', 'Could not load this sheet.'))
      else setSheet(call.result)
    })
  }, [sheetId, t])

  if (error || !sheet) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />

  const status = SHEET_STATUS[sheet.status]
  const gridHref = `/backend/coating?date=${sheet.sheetDate}&dryer=${sheet.dryerId}`
  const bstageLots = sheet.rows.filter((row) => row.bstageLotId && sheet.status === 'posted')
  const loggedSlots = sheet.slots.filter((slot) => slot.outputKg || slot.dbpKg || slot.oleicKg)
  const facts: Fact[] = [
    { label: t('cc_production.coating.raw', 'Raw kg'), value: kg(sheet.figures.rawTotal) },
    { label: t('cc_production.coating.nos', 'Nos'), value: String(sheet.figures.nosTotal) },
    { label: t('cc_production.coating.output', 'Day output (kg)'), value: kg(sheet.figures.outputTotal) },
    { label: t('cc_production.coating.resinKg', 'Resin used (kg)'), value: kg(sheet.figures.resinTotal) },
    { label: 'DBP', value: `${kg(sheet.figures.dbpTotal)} kg` },
    { label: t('cc_production.coating.oleic', 'Olic acid'), value: `${kg(sheet.figures.oleicTotal)} kg` },
  ]

  return (
    <RecordPage
      back={{ href: gridHref, label: t('cc_production.coating.title', 'Dryer sheets') }}
      overline={t('cc_production.coating.eyebrow', 'Coating · Quality Control Report')}
      title={`${sheet.dryerCode} · ${day(sheet.sheetDate)}`}
      badges={
        <StatusBadge variant={status.variant} dot>
          {status.label}
        </StatusBadge>
      }
      meta={sheet.postedAt ? t('cc_production.resin.postedBy', 'by {name} · {at}', { name: sheet.postedByName ?? '—', at: when(sheet.postedAt) }) : undefined}
      actions={
        <>
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {t('cc_production.resin.print', 'Print')}
          </Button>
          <Button asChild size="sm">
            <Link href={gridHref}>
              <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.coating.openGrid', 'Open in the grid')}
            </Link>
          </Button>
        </>
      }
      chain={<PlantChain current="coating" />}
      facts={facts}
    >
      <Panel title={t('cc_production.coating.rows', 'Cloth rows')} icon={Wind} count={sheet.rows.length} flush>
        <RegisterGrid
          rows={sheet.rows}
          rowKey={(row) => String(row.sn)}
          empty={t('cc_production.coating.noRows', 'No cloth rows on this sheet.')}
          columns={[
            { key: 'sn', label: 'S.N.', mono: true, render: (row) => row.sn },
            {
              key: 'cloth',
              label: t('cc_production.coating.cloth', 'Cloth name'),
              render: (row) => (
                <Link className="font-medium underline-offset-2 hover:underline" href={recordHref.product(row.clothProductId)}>
                  {row.clothTitle}
                </Link>
              ),
            },
            { key: 'gsm', label: 'GSM', align: 'right', render: (row) => row.gsm ?? '—' },
            {
              key: 'raw',
              label: t('cc_production.coating.used', 'Raw used'),
              align: 'right',
              render: (row) => (
                <>
                  {kg(row.consumedKg)}
                  {row.balanceRawKg ? <span className="block text-xs text-muted-foreground">{t('cc_production.coating.balanceLeft', 'balance {kg}', { kg: kg(row.balanceRawKg) })}</span> : null}
                </>
              ),
              total: kg(sheet.figures.rawTotal),
            },
            { key: 'nos', label: t('cc_production.coating.nos', 'Nos'), align: 'right', render: (row) => row.coatedNos, total: String(sheet.figures.nosTotal) },
            { key: 'rcvc', label: 'RC · VC', align: 'right', render: (row) => `${row.rcPct ?? '—'}% · ${row.vcPct ?? '—'}%` },
            {
              key: 'from',
              label: t('cc_production.coating.cameFrom', 'Came from'),
              render: (row) => (
                <span className="flex flex-col gap-0.5 text-xs">
                  {row.rawLots.map((lot) => (
                    <span key={lot.lotId}>
                      <Link className="font-mono underline-offset-2 hover:underline" href={recordHref.lot(lot.lotId)}>
                        {lot.lotNumber ?? '—'}
                      </Link>{' '}
                      · {kg(lot.kg)} kg · {PLACE_LABEL[lot.place as StockPlace] ?? lot.place}
                    </span>
                  ))}
                  {row.resinLots.map((lot) => (
                    <span key={lot.lotId}>
                      {t('cc_production.coating.resinWord', 'Resin')}{' '}
                      <Link className="font-mono underline-offset-2 hover:underline" href={recordHref.lot(lot.lotId)}>
                        {lot.lotNumber ?? '—'}
                      </Link>{' '}
                      · {kg(lot.kg)} kg
                    </span>
                  ))}
                  {!row.rawLots.length && sheet.status === 'draft' ? <span className="text-muted-foreground">{t('cc_production.resin.pickedOnPost', 'Picked when posted (oldest lot first)')}</span> : null}
                </span>
              ),
            },
            {
              key: 'lot',
              label: t('cc_production.coating.lot', 'B-stage lot'),
              align: 'right',
              render: (row) => (
                <>
                  {row.bstageLotId && sheet.status === 'posted' ? (
                    <Link className="font-mono text-xs underline-offset-2 hover:underline" href={recordHref.bstageLot(row.bstageLotId)}>
                      {row.bstageLotNumber}
                    </Link>
                  ) : null}
                  <span className="block text-xs text-muted-foreground">
                    {kg(row.bstageKg ?? row.plannedBstageKg)} kg{row.bstageLeftKg !== null ? ` · ${t('cc_production.coating.left', '{kg} left', { kg: kg(row.bstageLeftKg) })}` : ''}
                  </span>
                </>
              ),
              total: kg(sheet.figures.bstageTotal),
            },
          ]}
        />
      </Panel>

      <RecordColumns
        main={
          <Panel title={t('cc_production.coating.slots', 'Two-hourly log')} icon={Clock} count={loggedSlots.length} flush>
            <RegisterGrid
              rows={loggedSlots}
              rowKey={(slot) => slot.time}
              empty={t('cc_production.coating.noSlots', 'Nothing logged in the two-hourly slots.')}
              columns={[
                { key: 'time', label: t('cc_production.coating.time', 'Time'), mono: true, render: (slot) => paperTime(slot.time) },
                { key: 'dbp', label: 'DBP', align: 'right', render: (slot) => (slot.dbpKg ? kg(slot.dbpKg) : '—'), total: kg(sheet.figures.dbpTotal) },
                { key: 'oleic', label: t('cc_production.coating.oleic', 'Olic acid'), align: 'right', render: (slot) => (slot.oleicKg ? kg(slot.oleicKg) : '—'), total: kg(sheet.figures.oleicTotal) },
                { key: 'output', label: t('cc_production.coating.remarksKg', 'Remarks (output kg)'), align: 'right', render: (slot) => (slot.outputKg ? kg(slot.outputKg) : '—'), total: kg(sheet.figures.outputTotal) },
              ]}
            />
          </Panel>
        }
        side={
          <>
            {sheet.warnings.length ? (
              <Panel title={t('cc_production.press.warnings', 'Warnings')} icon={TriangleAlert} count={sheet.warnings.length}>
                <ul className="list-disc space-y-1 pl-5 text-sm text-status-warning-text">
                  {sheet.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </Panel>
            ) : null}
            <Panel title={t('cc_production.coating.wentTo', 'Went to · B-stage lots')} icon={Waypoints} count={bstageLots.length} flush>
              <LinkRows
                empty={sheet.status === 'posted' ? t('cc_production.coating.noLots', 'No B-stage lot came out of this sheet.') : t('cc_production.resin.notPostedYet', 'Not posted yet.')}
                rows={bstageLots.map((row) => ({
                  key: `${row.sn}-${row.bstageLotId}`,
                  href: recordHref.bstageLot(row.bstageLotId as string),
                  primary: <span className="font-mono">{row.bstageLotNumber}</span>,
                  secondary: row.clothTitle,
                  value: `${kg(row.bstageKg)} kg`,
                  valueHint: row.bstageLeftKg !== null ? t('cc_production.coating.left', '{kg} left', { kg: kg(row.bstageLeftKg) }) : undefined,
                }))}
              />
            </Panel>
            {sheet.issueIds.length ? (
              <Panel title={t('cc_production.coating.issues', 'Chemical issues for this dryer')} icon={Beaker} count={sheet.issueIds.length} flush>
                <LinkRows
                  empty={null}
                  rows={sheet.issueIds.map((issueId, index) => ({
                    key: issueId,
                    href: recordHref.chemicalIssue(issueId),
                    primary: t('cc_production.coating.issueNo', 'Issue {no}', { no: index + 1 }),
                  }))}
                />
              </Panel>
            ) : null}
          </>
        }
      />
      <Attachments type="coating_sheet" id={sheet.id} />
      <Timeline type="coating_sheet" id={sheet.id} refreshKey={sheet.history.length} />
    </RecordPage>
  )
}

export default CoatingSheetPage
