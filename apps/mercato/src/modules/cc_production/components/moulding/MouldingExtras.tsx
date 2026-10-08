"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Input } from '@open-mercato/ui/primitives/input'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { HISTORY_LABEL, day, kg, todayIso, when } from '../resin/shared'

type EntryPage = {
  id: string
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
  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!entry) return <Page><PageBody><LoadingMessage label={t('cc_production.resin.loading', 'Loading…')} /></PageBody></Page>
  const facts: Array<[string, string]> = [
    [t('cc_production.resin.date', 'Date'), `${day(entry.entryDate)} · ${entry.shift === 1 ? '1st' : '2nd'} shift`],
    [t('cc_production.moulding.machine', 'Machine No.'), String(entry.pressNumber)],
    [t('cc_production.moulding.customer', 'Customer'), entry.customerName ?? '—'],
    [t('cc_production.moulding.operator', 'Operator'), `${entry.operatorName ?? '—'}${entry.startTime ? ` · ${entry.startTime}` : ''}`],
    [t('cc_production.moulding.production', 'Production'), `${entry.productionNos} nos × ${kg(entry.articleWeightKg)} kg = ${kg(entry.weightKg)} kg`],
    [t('cc_production.moulding.order', 'Order'), entry.orderQty ? `${entry.total} of ${entry.orderQty} made` : `${entry.total} made`],
    [t('cc_production.moulding.inputs', 'Inputs'), [entry.chindiKg ? `chindi ${kg(entry.chindiKg)} kg` : null, entry.clothKg ? `cloth ${kg(entry.clothKg)} kg${entry.clothNote ? ` (${entry.clothNote})` : ''}` : null, entry.bstageKg ? `B-stage ${entry.bstageGrade} ${kg(entry.bstageKg)} kg` : null].filter(Boolean).join(' · ') || '—'],
    [t('cc_production.moulding.lot', 'Lot'), entry.outputLotNumber ? `${entry.outputLotNumber}${entry.leftNos !== null ? ` · ${entry.leftNos} nos left` : ''}` : '—'],
  ]
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-4xl flex-col gap-5 pb-12">
          <Link href={`/backend/moulding?date=${entry.entryDate}&shift=${entry.shift}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('cc_production.moulding.title', 'Moulded products daily production register')}
          </Link>
          <header className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {t('cc_production.moulding.die', 'Die')} <span className="font-mono">{entry.dieNo}</span>
            </h1>
            <StatusBadge variant={entry.status === 'posted' ? 'success' : 'warning'} dot>
              {entry.status === 'posted' ? 'Posted' : 'Not posted'}
            </StatusBadge>
          </header>
          <section className="grid grid-cols-1 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm sm:grid-cols-2">
            {facts.map(([label, value]) => (
              <div key={label}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-sm font-semibold">{value}</p>
              </div>
            ))}
          </section>
          {entry.picks.length ? (
            <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">{t('cc_production.coating.cameFrom', 'Came from')}</h2>
              <ul className="space-y-1 text-sm">
                {entry.picks.map((pick) => (
                  <li key={`${pick.lotId}-${pick.grade}`} className="flex justify-between">
                    <span className="font-mono text-xs">{pick.lotNumber}</span>
                    <span className="text-xs text-muted-foreground">
                      {pick.grade} · {kg(pick.kg)} kg
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">{t('cc_production.moulding.run', 'This die on this order')}</h2>
            <ul className="space-y-1 text-sm tabular-nums">
              {entry.run.map((other) => (
                <li key={other.id} className="flex justify-between gap-3">
                  <Link className="underline-offset-2 hover:underline" href={`/backend/moulding/entries/${other.id}`}>
                    {day(other.entryDate)} · shift {other.shift} · machine {other.pressNumber}
                  </Link>
                  <span className="text-muted-foreground">
                    +{other.productionNos} → {other.total}
                    {entry.orderQty ? ` of ${entry.orderQty}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide">{t('cc_production.resin.history', 'History')}</h2>
            <ul className="space-y-1.5 text-sm">
              {[...entry.history].reverse().map((item, index) => (
                <li key={`${item.at}-${index}`} className="flex flex-wrap justify-between gap-2">
                  <span>
                    <span className="font-medium">{HISTORY_LABEL[item.action] ?? item.action}</span>
                    {item.note ? <span className="text-muted-foreground"> · {item.note}</span> : null}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {item.by ?? '—'} · {when(item.at)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </PageBody>
    </Page>
  )
}

type Availability = { date: string; dies: Array<{ dieNo: string; customerName: string | null; shift1: number | null; shift2: number | null; orderQty: number | null }>; idleMachines: Record<string, number[]> }

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
      if (!cancelled) setData(call.ok ? (call.result ?? null) : null)
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
              <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
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
                      <tr key={die.dieNo}>
                        <td className="px-4 py-2 font-mono">{die.dieNo}</td>
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
