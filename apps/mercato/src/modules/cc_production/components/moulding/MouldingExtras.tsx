"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Boxes, History, Layers, Shapes } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { HISTORY_LABEL, day, kg, todayIso, when } from '../resin/shared'
import { FieldList, LinkRows, Panel, PanelEmpty, RecordColumns, RecordPage, RecordState, RegisterGrid, type Fact } from '../../../cc_ui/components/RecordPage'
import { PlantChain } from '../../../cc_ui/components/PlantChain'
import { recordHref } from '../../../cc_ui/lib/links'
import { Timeline } from '../../../cc_ui/components/Timeline'

type EntryPage = {
  id: string
  pressId: string
  mouldId: string
  orderRef: string | null
  outputLotId: string | null
  entryDate: string
  shift: number
  pressNumber: number
  dieNo: string
  customerName: string | null
  dieHeatTime: string | null
  orderQty: number | null
  articleWeightKg: number
  productionNos: number
  weightKg: number
  chindiKg: number | null
  clothKg: number | null
  clothNote: string | null
  bstageGrade: string | null
  bstageKg: number | null
  operatorName: string | null
  startTime: string | null
  total: number
  status: 'draft' | 'posted'
  outputLotNumber: string | null
  leftNos: number | null
  picks: Array<{ grade: string; lotId: string; lotNumber: string | null; kg: number }>
  run: Array<{ id: string; entryDate: string; shift: number; pressNumber: number; productionNos: number; total: number; status: string }>
  history: Array<{ action: string; by: string | null; at: string; note: string | null }>
}

export function MouldingEntryPage({ entryId }: { entryId: string }) {
  const t = useT()
  const [entry, setEntry] = React.useState<EntryPage | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    void apiCall<EntryPage>(`/api/cc_production/moulding?id=${encodeURIComponent(entryId)}`).then((call) => {
      if (!call.ok || !call.result) setError(t('cc_production.moulding.loadError', 'Could not load this entry.'))
      else setEntry(call.result)
    })
  }, [entryId, t])
  if (error || !entry) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />
  const shiftLabel = entry.shift === 1 ? t('cc_production.moulding.shiftFirst', '1st shift') : t('cc_production.moulding.shiftSecond', '2nd shift')
  const facts: Fact[] = [
    { label: t('cc_production.resin.date', 'Date'), value: day(entry.entryDate), hint: shiftLabel },
    {
      label: t('cc_production.moulding.machine', 'Machine No.'),
      value: (
        <Link className="underline-offset-2 hover:underline" href={recordHref.machine('press', entry.pressId)}>
          {entry.pressNumber}
        </Link>
      ),
    },
    { label: t('cc_production.moulding.thisShift', 'This shift'), value: `${entry.productionNos} ${t('cc_ui.pcs', 'pcs')}`, hint: `${kg(entry.weightKg)} kg` },
    { label: t('cc_production.moulding.totalMade', 'Total'), value: String(entry.total), hint: entry.orderQty ? t('cc_production.moulding.ofOrder', 'of {qty} ordered', { qty: entry.orderQty }) : undefined, tone: entry.orderQty && entry.total >= entry.orderQty ? 'good' : undefined },
    { label: t('cc_production.moulding.articleWeight', 'Article weight'), value: `${kg(entry.articleWeightKg)} kg` },
    { label: t('cc_production.moulding.lotLeft', 'Left in lot'), value: entry.leftNos !== null ? `${entry.leftNos} ${t('cc_ui.pcs', 'pcs')}` : '—' },
  ]
  return (
    <RecordPage
      back={{ href: `/backend/moulding?date=${entry.entryDate}&shift=${entry.shift}`, label: t('cc_production.moulding.title', 'Moulded products daily production register') }}
      overline={[t('cc_production.moulding.overline', 'Moulding register'), entry.customerName].filter(Boolean).join(' · ')}
      title={
        <>
          {t('cc_production.moulding.die', 'Die')}{' '}
          <Link className="underline-offset-4 hover:underline" href={recordHref.die(entry.mouldId)}>
            {entry.dieNo}
          </Link>
        </>
      }
      badges={
        <StatusBadge variant={entry.status === 'posted' ? 'success' : 'warning'} dot>
          {entry.status === 'posted' ? t('cc_production.moulding.posted', 'Posted') : t('cc_production.moulding.notPosted', 'Not posted')}
        </StatusBadge>
      }
      meta={[entry.operatorName ? t('cc_production.moulding.operatorIs', 'Operator {name}', { name: entry.operatorName }) : null, entry.startTime ? t('cc_production.moulding.startedAt', 'started {time}', { time: entry.startTime }) : null, entry.dieHeatTime ? t('cc_production.moulding.heatAt', 'die heat {time}', { time: entry.dieHeatTime }) : null].filter(Boolean).join(' · ')}
      chain={<PlantChain route="moulded" current="moulding" hrefs={{ cutting: entry.outputLotId ? recordHref.lot(entry.outputLotId) : null }} />}
      facts={facts}
    >
      <RecordColumns
        main={
          <>
            <Panel title={t('cc_production.moulding.run', 'This die on this order')} icon={History} count={entry.run.length} flush>
              <RegisterGrid
                rows={entry.run}
                rowKey={(other) => other.id}
                rowHref={(other) => recordHref.mouldingEntry(other.id)}
                empty={t('cc_production.moulding.noRun', 'No other shift on this die and order.')}
                columns={[
                  { key: 'date', label: t('cc_production.resin.date', 'Date'), render: (other) => `${day(other.entryDate)} · S${other.shift}` },
                  { key: 'machine', label: t('cc_production.moulding.machine', 'Machine No.'), render: (other) => other.pressNumber },
                  { key: 'status', label: t('cc_production.resin.status', 'Status'), render: (other) => <StatusBadge variant={other.status === 'posted' ? 'success' : 'warning'}>{other.status === 'posted' ? t('cc_production.moulding.posted', 'Posted') : t('cc_production.moulding.notPosted', 'Not posted')}</StatusBadge> },
                  { key: 'nos', label: t('cc_production.moulding.thisShift', 'This shift'), align: 'right', render: (other) => `+${other.productionNos}` },
                  { key: 'total', label: t('cc_production.moulding.totalMade', 'Total'), align: 'right', render: (other) => `${other.total}${entry.orderQty ? ` / ${entry.orderQty}` : ''}` },
                ]}
              />
            </Panel>
            <Panel title={t('cc_production.moulding.inputs', 'Inputs')} icon={Layers}>
              <FieldList
                fields={[
                  [t('cc_production.moulding.chindi', 'Chindi'), entry.chindiKg ? `${kg(entry.chindiKg)} kg` : null],
                  [t('cc_production.moulding.cloth', 'Cloth'), entry.clothKg ? `${kg(entry.clothKg)} kg${entry.clothNote ? ` (${entry.clothNote})` : ''}` : null],
                  [t('cc_production.moulding.bstage', 'B-stage'), entry.bstageKg ? `${entry.bstageGrade ?? ''} ${kg(entry.bstageKg)} kg` : null],
                  [t('cc_production.moulding.production', 'Production'), `${entry.productionNos} × ${kg(entry.articleWeightKg)} kg = ${kg(entry.weightKg)} kg`],
                ]}
              />
            </Panel>
          </>
        }
        side={
          <>
            <Panel title={t('cc_production.coating.cameFrom', 'Came from')} icon={Boxes} count={entry.picks.length} flush>
              <LinkRows
                empty={entry.status === 'draft' ? t('cc_production.resin.pickedOnPost', 'Picked when posted (oldest lot first)') : t('cc_production.moulding.noPicks', 'No stock lots recorded.')}
                rows={entry.picks.map((pick) => ({ key: `${pick.lotId}-${pick.grade}`, href: recordHref.lot(pick.lotId), primary: <span className="font-mono">{pick.lotNumber ?? '—'}</span>, secondary: pick.grade, value: `${kg(pick.kg)} kg` }))}
              />
            </Panel>
            <Panel title={t('cc_production.resin.wentTo', 'Went to')} icon={Shapes} flush>
              {entry.outputLotId ? (
                <LinkRows
                  empty={null}
                  rows={[
                    {
                      key: entry.outputLotId,
                      href: recordHref.lot(entry.outputLotId),
                      primary: <span className="font-mono">{entry.outputLotNumber ?? '—'}</span>,
                      secondary: t('cc_production.moulding.mouldedLot', 'Moulded lot'),
                      value: `${entry.productionNos} ${t('cc_ui.pcs', 'pcs')}`,
                      valueHint: entry.leftNos !== null ? t('cc_production.moulding.leftNos', '{nos} left', { nos: entry.leftNos }) : undefined,
                    },
                  ]}
                />
              ) : (
                <PanelEmpty>{t('cc_production.resin.notPostedYet', 'Not posted yet.')}</PanelEmpty>
              )}
              {entry.orderRef ? <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">{t('cc_production.moulding.forOrder', 'For order {no}', { no: entry.orderRef })}</p> : null}
            </Panel>
          </>
        }
      />
      <Timeline type="moulding_entry" id={entry.id} refreshKey={entry.history.length} />
    </RecordPage>
  )
}

type Availability = { date: string; dies: Array<{ mouldId: string; dieNo: string; customerName: string | null; shift1: number | null; shift2: number | null; orderQty: number | null }>; idleMachines: Record<string, number[]> }

export function DieAvailabilityPage() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const [date, setDate] = React.useState(params?.get('date') ?? todayIso())
  const [data, setData] = React.useState<Availability | null>(null)
  const [search, setSearch] = React.useState('')
  React.useEffect(() => {
    let cancelled = false
    setData(null)
    router.replace(`/backend/moulding/dies?date=${date}`)
    void apiCall<Availability>(`/api/cc_production/moulding/dies?date=${date}`).then((call) => {
      if (!cancelled) setData(call.ok ? (call.ok ? (call.result ?? null) : null) : null)
    })
    return () => {
      cancelled = true
    }
  }, [date, router])
  const rows = (data?.dies ?? []).filter((die) => !search.trim() || die.dieNo.toLowerCase().includes(search.trim().toLowerCase()) || (die.customerName ?? '').toLowerCase().includes(search.trim().toLowerCase()))
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-4xl flex-col gap-5 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('cc_production.moulding.eyebrow', 'Moulding')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.moulding.dies', 'Die availability')}</h1>
              <p className="text-sm text-muted-foreground">{t('cc_production.moulding.diesLede', 'Which die is on which machine in each shift. A die not listed is free; changing a die takes about a day.')}</p>
            </div>
            <div className="flex gap-2">
              <Input className="w-48" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('cc_production.moulding.searchDie', 'Die No. or customer')} />
              <Input type="date" className="w-44" value={date} onChange={(event) => setDate(event.target.value)} aria-label={t('cc_production.resin.date', 'Date')} />
            </div>
          </header>
          {!data ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <>
              <section className="overflow-x-auto rounded-md border border-foreground/70 bg-card shadow-sm">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2">{t('cc_production.moulding.die', 'Die')}</th>
                      <th className="px-4 py-2">{t('cc_production.moulding.customer', 'Customer')}</th>
                      <th className="px-4 py-2 text-center">{t('cc_production.moulding.shift1', '1st shift')}</th>
                      <th className="px-4 py-2 text-center">{t('cc_production.moulding.shift2', '2nd shift')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {rows.map((die) => (
                      <tr key={die.dieNo} className="even:bg-muted/30">
                        <td className="px-4 py-2 font-mono">
                          <Link className="underline-offset-2 hover:underline" href={recordHref.die(die.mouldId)}>
                            {die.dieNo}
                          </Link>
                        </td>
                        <td className="px-4 py-2">{die.customerName ?? '—'}</td>
                        <td className="px-4 py-2 text-center">{die.shift1 ? `M${die.shift1}` : <span className="text-muted-foreground">free</span>}</td>
                        <td className="px-4 py-2 text-center">{die.shift2 ? `M${die.shift2}` : <span className="text-muted-foreground">free</span>}</td>
                      </tr>
                    ))}
                    {!rows.length ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                          {t('cc_production.moulding.noDies', 'No dies on the machines this day.')}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </section>
              <p className="text-sm text-muted-foreground">
                {t('cc_production.moulding.idle', 'Idle machines — 1st shift: {one}; 2nd shift: {two}', { one: data.idleMachines['1']?.join(', ') || 'none', two: data.idleMachines['2']?.join(', ') || 'none' })}
              </p>
            </>
          )}
        </div>
      </PageBody>
    </Page>
  )
}
