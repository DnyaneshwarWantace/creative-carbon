"use client"

import * as React from 'react'
import Link from 'next/link'
import { ArrowLeft, Printer, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { day, kg, when } from '../resin/shared'
import { BAND_STYLE, type BstageCard } from './BstageBoardPage'
import { PageLoading } from '../../../cc_ui/components/PageLoading'

type LotView = BstageCard & { movements: Array<{ id: string; at: string; kg: number; reason: string | null; reasonCode: string | null; source: string | null }> }

export function BstageLotPage({ lotId }: { lotId: string }) {
  const t = useT()
  const granted = useGranted()
  const { runMutation } = useGuardedMutation({ contextId: `cc-bstage-${lotId}` })
  const [lot, setLot] = React.useState<LotView | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [scrapping, setScrapping] = React.useState(false)
  const [scrapKg, setScrapKg] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [scrapReasons, setScrapReasons] = React.useState<string[]>([])

  React.useEffect(() => {
    void apiCall<{ scrapReasons?: string[] }>('/api/cc_production/coating/setup').then((call) => setScrapReasons(call.result?.scrapReasons ?? []))
  }, [])

  const load = React.useCallback(async () => {
    const call = await apiCall<LotView>(`/api/cc_production/bstage?lotId=${encodeURIComponent(lotId)}`)
    if (!call.ok || !call.result) setError(t('cc_production.bstage.loadError', 'Could not load this lot.'))
    else setLot(call.result)
  }, [lotId, t])

  React.useEffect(() => {
    void load()
  }, [load])

  const scrap = async () => {
    if (!lot || !reason.trim()) return
    const body = { lotId: lot.lotId, reason: reason.trim(), ...(scrapKg.trim() ? { kg: Number(scrapKg) } : {}) }
    setBusy(true)
    try {
      const call = await runMutation({
        context: { lotId: lot.lotId },
        mutationPayload: body,
        operation: () => apiCall<LotView & { error?: string }>('/api/cc_production/bstage/scrap', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      })
      if (!call.ok || !call.result || call.result.error) {
        flash(call.result?.error ?? t('cc_production.bstage.scrapError', 'Could not scrap it.'), 'error')
        return
      }
      setLot(call.result)
      setScrapping(false)
      setReason('')
      setScrapKg('')
      flash(t('cc_production.bstage.scrapped', 'Scrapped.'), 'success')
    } finally {
      setBusy(false)
    }
  }

  if (error) return <Page><PageBody><ErrorMessage label={error} /></PageBody></Page>
  if (!lot) return <Page><PageBody><PageLoading label={t('cc_production.resin.loading', 'Loading…')} /></PageBody></Page>

  const band = BAND_STYLE[lot.band]
  return (
    <Page>
      <PageBody>
        <div className="mx-auto flex max-w-4xl flex-col gap-5 pb-12">
          <Link href="/backend/bstage" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground print:hidden">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t('cc_production.bstage.title', 'B-stage board')}
          </Link>
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <p className="text-overline font-semibold uppercase tracking-widest text-muted-foreground">{lot.title}</p>
              <h1 className="font-mono text-2xl font-bold tracking-tight">{lot.lotNumber}</h1>
              <span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', band.head)}>
                {band.label} · {t('cc_production.bstage.age', 'day {days}', { days: lot.ageDays })}
              </span>
            </div>
            <div className="flex gap-2 print:hidden">
              <Button type="button" variant="outline" onClick={() => window.print()}>
                <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.bstage.label', 'Print label')}
              </Button>
              {granted.has('cc_production.bstage.manage') && lot.freeKg > 0 ? (
                <Button type="button" variant="outline" onClick={() => setScrapping(true)}>
                  <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  {t('cc_production.bstage.scrap', 'Scrap')}
                </Button>
              ) : null}
            </div>
          </header>

          <section className="grid grid-cols-2 gap-4 rounded-xl border border-border bg-card p-5 shadow-sm md:grid-cols-4">
            {(
              [
                [t('cc_production.coating.cloth', 'Cloth name'), `${lot.clothTitle ?? '—'}${lot.gsm ? ` · ${lot.gsm} GSM` : ''}`],
                [t('cc_production.bstage.left', 'Left'), `${kg(lot.onHandKg)} kg${lot.nosLeft !== null ? ` · ${lot.nosLeft} nos` : ''}`],
                [t('cc_production.bstage.made', 'Made'), `${kg(lot.madeKg)} kg${lot.nosMade !== null ? ` · ${lot.nosMade} nos` : ''}`],
                [t('cc_production.bstage.where', 'Where'), lot.placeLabel ?? '—'],
                [t('cc_production.bstage.coated', 'Coated'), `${day(lot.madeOn)} · ${lot.dryerCode ?? '—'}`],
                [t('cc_production.bstage.useBy', 'Use by'), `${day(lot.expiresOn)} (${lot.shelfLife} days)`],
                [t('cc_production.bstage.blockedAfter', 'Blocked after'), `${lot.maxUse} days`],
                [t('cc_production.bstage.resin', 'Resin batch'), lot.resinBatchNo ?? '—'],
              ] as Array<[string, string]>
            ).map(([label, value]) => (
              <div key={label}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-sm font-semibold">{value}</p>
              </div>
            ))}
          </section>

          <section className="rounded-xl border border-border bg-card shadow-sm">
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide">{t('cc_production.bstage.movements', 'Came from and went to')}</h2>
              {lot.sheetId ? (
                <Link className="text-sm underline-offset-2 hover:underline" href={`/backend/coating/${lot.sheetId}`}>
                  {t('cc_production.bstage.sheet', 'Dryer sheet')}
                </Link>
              ) : null}
            </header>
            <ul className="divide-y divide-border">
              {lot.movements.map((movement) => (
                <li key={movement.id} className="flex flex-wrap items-baseline justify-between gap-2 px-5 py-2.5 text-sm">
                  <span>{movement.reason ?? movement.reasonCode ?? '—'}</span>
                  <span className="flex gap-4 tabular-nums">
                    <span className={movement.kg < 0 ? 'text-muted-foreground' : 'font-semibold'}>
                      {movement.kg > 0 ? '+' : ''}
                      {kg(movement.kg)} kg
                    </span>
                    <span className="text-xs text-muted-foreground">{when(movement.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="px-5 py-3 text-xs text-muted-foreground">{t('cc_production.bstage.next', 'Press batches (Stage 5) and order despatch (Stage 9) take from this lot and show here.')}</p>
          </section>
        </div>

        <Dialog open={scrapping} onOpenChange={(open) => !open && setScrapping(false)}>
          <DialogContent
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void scrap()
            }}
          >
            <DialogHeader>
              <DialogTitle>{t('cc_production.bstage.scrapTitle', 'Scrap B-stage')}</DialogTitle>
              <DialogDescription>{t('cc_production.bstage.scrapHint', 'Leave kg blank to scrap everything left ({kg} kg).', { kg: kg(lot.freeKg) })}</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="scrap-kg">kg</Label>
                <Input id="scrap-kg" inputMode="decimal" value={scrapKg} onChange={(event) => setScrapKg(event.target.value)} placeholder={String(lot.freeKg)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="scrap-reason">{t('cc_production.issues.why', 'Why')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {scrapReasons.map((option) => (
                    <Button key={option} type="button" size="sm" variant={reason === option ? 'default' : 'outline'} onClick={() => setReason(option)}>
                      {option}
                    </Button>
                  ))}
                </div>
                <Textarea id="scrap-reason" rows={2} value={reason} onChange={(event) => setReason(event.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setScrapping(false)}>
                {t('cc_production.resin.cancel', 'Cancel')}
              </Button>
              <Button type="button" variant="destructive" disabled={busy || !reason.trim()} onClick={() => void scrap()}>
                {t('cc_production.bstage.scrap', 'Scrap')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </Page>
  )
}

export default BstageLotPage
