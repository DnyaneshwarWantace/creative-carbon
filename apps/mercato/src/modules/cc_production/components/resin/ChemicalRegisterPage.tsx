"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowLeft, Printer } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { kg, thisMonth, type ResinSetup } from './shared'

type RegisterRow = { day: string; ob: number; received: number; total: number; use: number; balance: number; refs: string[]; water?: number; resin?: number }
type Register = { productId: string; title: string; unit: string; month: string; opening: number; closing: number; phenolColumns: boolean; rows: RegisterRow[]; totals: { received: number; use: number; water?: number; resin?: number } }

function shortDay(iso: string): string {
  const [year, month, dayOfMonth] = iso.split('-')
  return `${dayOfMonth}/${month}/${year.slice(2)}`
}

export function ChemicalRegisterPage() {
  const t = useT()
  const router = useRouter()
  const params = useSearchParams()
  const [chemicals, setChemicals] = React.useState<Array<{ id: string; title: string }>>([])
  const [item, setItem] = React.useState(params?.get('item') ?? '')
  const [month, setMonth] = React.useState(params?.get('month') ?? thisMonth())
  const [register, setRegister] = React.useState<Register | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void apiCall<ResinSetup>('/api/cc_production/resin/setup').then((call) => {
      const list = call.result?.chemicals ?? []
      setChemicals(list.map((chemical) => ({ id: chemical.id, title: chemical.title })))
      setItem((current) => current || list[0]?.id || '')
    })
  }, [])

  React.useEffect(() => {
    if (!item || !month) return
    let cancelled = false
    setLoading(true)
    setError(null)
    router.replace(`/backend/resin/chemical-register?item=${item}&month=${month}`)
    void apiCall<Register>(`/api/cc_production/resin/register?item=${encodeURIComponent(item)}&month=${encodeURIComponent(month)}`).then((call) => {
      if (cancelled) return
      setLoading(false)
      if (!call.ok || !call.result) {
        setError(t('cc_production.register.loadError', 'Could not build the register page.'))
        return
      }
      setRegister(call.result)
    })
    return () => {
      cancelled = true
    }
  }, [item, month, router, t])

  const head = ['Dt.', 'O.B.', 'Received', 'Total', 'Use', 'Balance', ...(register?.phenolColumns ? ['Water', 'Resin'] : []), t('cc_production.register.ref', 'Ref.')]

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-5xl flex-col gap-5 pb-12">
          <div className="print:hidden">
            <Link href="/backend/resin/batches" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {t('cc_production.resin.title', 'Resin batches')}
            </Link>
          </div>
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('cc_production.register.eyebrow', 'Chemical register')}</p>
              <h1 className="text-2xl font-bold tracking-tight">
                {register?.title ?? '—'} · {month}
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground print:hidden">
                {t('cc_production.register.lede', 'Built from entries, never typed: Received from GRNs and stock added, Use from resin batches and chemical issues. One page per chemical per month, as in the store book.')}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={item} onChange={(event) => setItem(event.target.value)} aria-label={t('cc_production.register.item', 'Chemical')}>
                {chemicals.map((chemical) => (
                  <option key={chemical.id} value={chemical.id}>
                    {chemical.title}
                  </option>
                ))}
              </select>
              <Input type="month" className="w-44" value={month} onChange={(event) => setMonth(event.target.value)} aria-label={t('cc_production.register.month', 'Month')} />
              <Button type="button" variant="outline" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.resin.print', 'Print')}
              </Button>
            </div>
          </header>

          {error ? <ErrorMessage label={error} /> : null}
          <section className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
            {loading && !register ? (
              <div className="flex justify-center py-16">
                <Spinner />
              </div>
            ) : register ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-border bg-muted/50">
                    {head.map((label, index) => (
                      <th key={label} className={cn('px-3 py-2 text-xs font-semibold uppercase tracking-wide', index === 0 || index === head.length - 1 ? 'text-left' : 'text-right')}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono tabular-nums">
                  <tr className="text-muted-foreground">
                    <td className="px-3 py-2">{t('cc_production.register.opening', 'Opening')}</td>
                    <td className="px-3 py-2 text-right">{kg(register.opening)}</td>
                    <td colSpan={head.length - 2} />
                  </tr>
                  {register.rows.map((row) => (
                    <tr key={row.day}>
                      <td className="px-3 py-2">{shortDay(row.day)}</td>
                      <td className="px-3 py-2 text-right">{kg(row.ob)}</td>
                      <td className="px-3 py-2 text-right">{row.received ? kg(row.received) : ''}</td>
                      <td className="px-3 py-2 text-right">{kg(row.total)}</td>
                      <td className="px-3 py-2 text-right">{row.use ? kg(row.use) : ''}</td>
                      <td className="px-3 py-2 text-right font-semibold">{kg(row.balance)}</td>
                      {register.phenolColumns ? (
                        <>
                          <td className="px-3 py-2 text-right">{row.water ? kg(row.water) : ''}</td>
                          <td className="px-3 py-2 text-right">{row.resin ? kg(row.resin) : ''}</td>
                        </>
                      ) : null}
                      <td className="px-3 py-2 font-sans text-xs text-muted-foreground">{row.refs.join(', ')}</td>
                    </tr>
                  ))}
                  {!register.rows.length ? (
                    <tr>
                      <td colSpan={head.length} className="px-3 py-8 text-center font-sans text-muted-foreground">
                        {t('cc_production.register.empty', 'Nothing received or used this month.')}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-mono font-semibold tabular-nums">
                    <td className="px-3 py-2 font-sans">{t('cc_production.register.total', 'Month')}</td>
                    <td />
                    <td className="px-3 py-2 text-right">{kg(register.totals.received)}</td>
                    <td />
                    <td className="px-3 py-2 text-right">{kg(register.totals.use)}</td>
                    <td className="px-3 py-2 text-right">{kg(register.closing)}</td>
                    {register.phenolColumns ? (
                      <>
                        <td className="px-3 py-2 text-right">{kg(register.totals.water ?? 0)}</td>
                        <td className="px-3 py-2 text-right">{kg(register.totals.resin ?? 0)}</td>
                      </>
                    ) : null}
                    <td />
                  </tr>
                </tfoot>
              </table>
            ) : null}
          </section>
        </div>
      </PageBody>
    </Page>
  )
}

export default ChemicalRegisterPage
