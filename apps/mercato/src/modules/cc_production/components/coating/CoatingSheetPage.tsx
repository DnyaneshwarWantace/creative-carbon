"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Pencil, Printer } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { PLACE_LABEL, type StockPlace } from '../../../cc_products/lib/stock'
import { HISTORY_LABEL, day, kg, when } from '../resin/shared'
import { SHEET_STATUS, paperTime, type SheetView } from './shared'

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{children}</p>
    </div>
  )
}

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

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!sheet) return <Page><PageBody><LoadingMessage label={t('cc_production.resin.loading', 'Loading…')} /></PageBody></Page>

  const status = SHEET_STATUS[sheet.status]
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-12">
          <Link href={`/backend/coating?date=${sheet.sheetDate}&dryer=${sheet.dryerId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('cc_production.coating.title', 'Dryer sheets')}
          </Link>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('cc_production.coating.eyebrow', 'Coating · Quality Control Report')}</p>
              <h1 className="text-2xl font-bold tracking-tight">
                {sheet.dryerCode} · {day(sheet.sheetDate)}
              </h1>
              <div className="flex items-center gap-2">
                <StatusBadge variant={status.variant} dot>
                  {status.label}
                </StatusBadge>
                {sheet.postedAt ? <span className="text-xs text-muted-foreground">{t('cc_production.resin.postedBy', 'by {name} · {at}', { name: sheet.postedByName ?? '—', at: when(sheet.postedAt) })}</span> : null}
              </div>
            </div>
            <div className="flex gap-2 print:hidden">
              <Button type="button" variant="outline" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.resin.print', 'Print')}
              </Button>
              <Button asChild variant="outline">
                <Link href={`/backend/coating?date=${sheet.sheetDate}&dryer=${sheet.dryerId}`}>
                  <Pencil className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.coating.openGrid', 'Open in the grid')}
                </Link>
              </Button>
            </div>
          </header>

          <section className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm md:grid-cols-6">
            <Fact label={t('cc_production.coating.raw', 'Raw kg')}>{kg(sheet.figures.rawTotal)}</Fact>
            <Fact label={t('cc_production.coating.nos', 'Nos')}>{sheet.figures.nosTotal}</Fact>
            <Fact label={t('cc_production.coating.output', 'Day output (kg)')}>{kg(sheet.figures.outputTotal)}</Fact>
            <Fact label={t('cc_production.coating.resinKg', 'Resin used (kg)')}>{kg(sheet.figures.resinTotal)}</Fact>
            <Fact label="DBP">{kg(sheet.figures.dbpTotal)} kg</Fact>
            <Fact label={t('cc_production.coating.oleic', 'Olic acid')}>{kg(sheet.figures.oleicTotal)} kg</Fact>
          </section>

          {sheet.warnings.length ? (
            <ul className="list-disc rounded-lg border border-status-warning-border bg-status-warning-bg px-8 py-3 text-sm text-status-warning-text">
              {sheet.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <section className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            <table className="w-full min-w-240 text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">S.N.</th>
                  <th className="px-3 py-2">{t('cc_production.coating.cloth', 'Cloth name')}</th>
                  <th className="px-3 py-2 text-right">GSM</th>
                  <th className="px-3 py-2 text-right">{t('cc_production.coating.used', 'Raw used')}</th>
                  <th className="px-3 py-2 text-right">{t('cc_production.coating.nos', 'Nos')}</th>
                  <th className="px-3 py-2 text-right">RC · VC</th>
                  <th className="px-3 py-2">{t('cc_production.coating.cameFrom', 'Came from')}</th>
                  <th className="px-3 py-2">{t('cc_production.coating.lot', 'B-stage lot')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sheet.rows.map((row) => (
                  <tr key={row.sn} className="align-top">
                    <td className="px-3 py-2 font-mono text-xs">{row.sn}</td>
                    <td className="px-3 py-2 font-medium">{row.clothTitle}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.gsm ?? '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {kg(row.consumedKg)}
                      {row.balanceRawKg ? <span className="block text-xs text-muted-foreground">{t('cc_production.coating.balanceLeft', 'balance {kg}', { kg: kg(row.balanceRawKg) })}</span> : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.coatedNos}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.rcPct ?? '—'}% · {row.vcPct ?? '—'}%
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {row.rawLots.map((lot) => (
                        <span key={lot.lotId} className="block">
                          {lot.lotNumber} · {kg(lot.kg)} kg · {PLACE_LABEL[lot.place as StockPlace] ?? lot.place}
                        </span>
                      ))}
                      {row.resinLots.map((lot) => (
                        <span key={lot.lotId} className="block">
                          {t('cc_production.coating.resinLot', 'Resin {lot} · {kg} kg', { lot: lot.lotNumber ?? '—', kg: kg(lot.kg) })}
                        </span>
                      ))}
                      {!row.rawLots.length && sheet.status === 'draft' ? t('cc_production.resin.pickedOnPost', 'Picked when posted (oldest lot first)') : null}
                    </td>
                    <td className="px-3 py-2">
                      {row.bstageLotId && sheet.status === 'posted' ? (
                        <Link className="font-mono text-xs underline-offset-2 hover:underline" href={`/backend/bstage/lots/${row.bstageLotId}`}>
                          {row.bstageLotNumber}
                        </Link>
                      ) : null}
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {kg(row.bstageKg ?? row.plannedBstageKg)} kg{row.bstageLeftKg !== null ? ` · ${t('cc_production.coating.left', '{kg} left', { kg: kg(row.bstageLeftKg) })}` : ''}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">{t('cc_production.coating.slots', 'Two-hourly log')}</h2>
              <ul className="space-y-1 text-sm tabular-nums">
                {sheet.slots
                  .filter((slot) => slot.outputKg || slot.dbpKg || slot.oleicKg)
                  .map((slot) => (
                    <li key={slot.time} className="flex justify-between gap-3">
                      <span className="font-mono">{paperTime(slot.time)}</span>
                      <span className="text-muted-foreground">
                        {slot.dbpKg ? `DBP ${kg(slot.dbpKg)} · ` : ''}
                        {slot.oleicKg ? `Olic ${kg(slot.oleicKg)} · ` : ''}
                        {slot.outputKg ? `${kg(slot.outputKg)} kg` : ''}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide">{t('cc_production.resin.history', 'History')}</h2>
              <ul className="space-y-1.5 text-sm">
                {[...sheet.history].reverse().map((entry, index) => (
                  <li key={`${entry.at}-${index}`} className="flex flex-wrap justify-between gap-2">
                    <span>
                      <span className="font-medium">{HISTORY_LABEL[entry.action] ?? entry.action}</span>
                      {entry.note ? <span className="text-muted-foreground"> · {entry.note}</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {entry.by ?? '—'} · {when(entry.at)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </PageBody>
    </Page>
  )
}

export default CoatingSheetPage
