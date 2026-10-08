"use client"

import * as React from 'react'
import Link from 'next/link'
import { Layers, Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Input } from '@open-mercato/ui/primitives/input'
import { Button } from '@open-mercato/ui/primitives/button'
import { Spinner } from '@open-mercato/ui/primitives/spinner'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { day, kg } from '../resin/shared'

export type BstageBand = 'fresh' | 'soon' | 'expired' | 'blocked'

export type BstageCard = {
  lotId: string
  lotNumber: string
  title: string
  clothTitle: string | null
  gsm: number | null
  dryerCode: string | null
  resinBatchNo: string | null
  sheetId: string | null
  placeLabel: string | null
  madeOn: string
  expiresOn: string | null
  ageDays: number
  shelfLife: number
  maxUse: number
  band: BstageBand
  onHandKg: number
  freeKg: number
  madeKg: number | null
  nosMade: number | null
  nosLeft: number | null
}

type Board = { today: string; columns: Array<{ band: BstageBand; lots: BstageCard[]; kg: number; nos: number }>; totalKg: number; lots: number }

export const BAND_STYLE: Record<BstageBand, { label: string; head: string; card: string }> = {
  fresh: { label: 'Day 0–4', head: 'bg-status-success-bg text-status-success-text', card: 'border-border' },
  soon: { label: 'Day 5–7', head: 'bg-status-warning-bg text-status-warning-text', card: 'border-status-warning-border' },
  expired: { label: 'Past 7 days', head: 'bg-status-error-bg text-status-error-text', card: 'border-status-error-border' },
  blocked: { label: 'Past 10 · blocked from pressing', head: 'bg-muted text-muted-foreground', card: 'border-border opacity-80' },
}

export function BstageBoardPage() {
  const t = useT()
  const [search, setSearch] = React.useState('')
  const [board, setBoard] = React.useState<Board | null>(null)

  React.useEffect(() => {
    let cancelled = false
    const handle = window.setTimeout(async () => {
      const params = new URLSearchParams()
      if (search.trim()) params.set('q', search.trim())
      const call = await apiCall<Board>(`/api/cc_production/bstage?${params.toString()}`)
      if (!cancelled) setBoard(call.ok ? (call.result ?? null) : null)
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [search])

  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-7xl flex-col gap-5 pb-12">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{t('cc_production.coating.eyebrow', 'Coating · Quality Control Report')}</p>
              <h1 className="text-2xl font-bold tracking-tight">{t('cc_production.bstage.title', 'B-stage board')}</h1>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {t('cc_production.bstage.lede', 'Every coated lot still in stock, by age. Use the oldest of the grade you need first; past 7 days it is red, past 10 days it cannot go into a press batch.')}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {board ? (
                <span className="text-sm text-muted-foreground">
                  {t('cc_production.bstage.total', '{lots} lots · {kg} kg', { lots: board.lots, kg: kg(board.totalKg) })}
                </span>
              ) : null}
              <div className="relative w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('cc_production.bstage.search', 'Lot, cloth, dryer or resin batch')} />
              </div>
              <Button asChild variant="outline">
                <Link href="/backend/coating">{t('cc_production.coating.title', 'Dryer sheets')}</Link>
              </Button>
            </div>
          </header>

          {!board ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {board.columns.map((column) => (
                <section key={column.band} className="flex flex-col rounded-xl border border-border bg-card shadow-sm">
                  <header className={cn('flex items-baseline justify-between rounded-t-xl px-4 py-2.5', BAND_STYLE[column.band].head)}>
                    <h2 className="text-sm font-semibold">{BAND_STYLE[column.band].label}</h2>
                    <span className="text-xs tabular-nums">
                      {column.lots.length} · {kg(column.kg)} kg
                    </span>
                  </header>
                  <div className="flex flex-col gap-2 p-3">
                    {column.lots.length ? (
                      column.lots.map((lot) => (
                        <Link key={lot.lotId} href={`/backend/bstage/lots/${lot.lotId}`} className={cn('rounded-lg border bg-background p-3 transition-shadow hover:shadow-md', BAND_STYLE[lot.band].card)}>
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="font-mono text-xs font-semibold">{lot.lotNumber}</span>
                            <span className="text-xs tabular-nums text-muted-foreground">{t('cc_production.bstage.age', 'day {days}', { days: lot.ageDays })}</span>
                          </div>
                          <p className="mt-1 text-sm font-medium">
                            {lot.clothTitle ?? lot.title}
                            {lot.gsm ? <span className="text-muted-foreground"> · {lot.gsm} GSM</span> : null}
                          </p>
                          <p className="mt-1 text-xs tabular-nums">
                            {kg(lot.onHandKg)} kg{lot.nosLeft !== null ? ` · ${lot.nosLeft} nos` : ''}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {[lot.dryerCode, lot.resinBatchNo, day(lot.madeOn)].filter(Boolean).join(' · ')}
                          </p>
                        </Link>
                      ))
                    ) : (
                      <p className="flex items-center gap-2 py-6 text-center text-xs text-muted-foreground">
                        <Layers className="h-4 w-4" aria-hidden="true" />
                        {t('cc_production.bstage.none', 'No lots')}
                      </p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default BstageBoardPage
