"use client"

import * as React from 'react'
import Link from 'next/link'
import { History, Layers, Printer, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { day, kg, when } from '../resin/shared'
import { BAND_STYLE, type BstageCard } from './BstageBoardPage'
import { DocLink, FieldList, Panel, RecordColumns, RecordPage, RecordState, RegisterGrid, type Fact } from '../../../cc_ui/components/RecordPage'
import { PlantChain } from '../../../cc_ui/components/PlantChain'
import { recordHref, type DocumentLink } from '../../../cc_ui/lib/links'

type LotView = BstageCard & { movements: Array<{ id: string; at: string; kg: number; reason: string | null; reasonCode: string | null; source: string | null; document: DocumentLink | null }> }

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

  if (error || !lot) return <RecordState error={error} loadingLabel={t('cc_production.resin.loading', 'Loading…')} />

  const band = BAND_STYLE[lot.band]
  const facts: Fact[] = [
    { label: t('cc_production.bstage.left', 'Left'), value: `${kg(lot.onHandKg)} kg`, hint: lot.nosLeft !== null ? `${lot.nosLeft} nos` : undefined },
    { label: t('cc_production.bstage.made', 'Made'), value: `${kg(lot.madeKg)} kg`, hint: lot.nosMade !== null ? `${lot.nosMade} nos` : undefined },
    { label: t('cc_production.bstage.ageShort', 'Age'), value: t('cc_production.bstage.age', 'day {days}', { days: lot.ageDays }), tone: lot.band === 'fresh' ? 'good' : lot.band === 'soon' ? 'warn' : 'bad' },
    { label: t('cc_production.bstage.useBy', 'Use by'), value: day(lot.expiresOn), hint: t('cc_production.bstage.shelf', '{days}-day shelf life', { days: lot.shelfLife }) },
    { label: t('cc_production.bstage.blockedAfter', 'Blocked after'), value: t('cc_production.bstage.days', '{days} days', { days: lot.maxUse }) },
    { label: t('cc_production.bstage.where', 'Where'), value: lot.placeLabel ?? '—' },
  ]

  return (
    <>
      <RecordPage
        back={{ href: '/backend/bstage', label: t('cc_production.bstage.title', 'B-stage board') }}
        overline={lot.title}
        title={lot.lotNumber}
        badges={<span className={cn('inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold', band.head)}>{t(`cc_production.bstage.band.${lot.band}`, band.label)}</span>}
        meta={t('cc_production.bstage.coatedOn', 'Coated {date} on {dryer}', { date: day(lot.madeOn), dryer: lot.dryerCode ?? '—' })}
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t('cc_production.bstage.label', 'Print label')}
            </Button>
            {granted.has('cc_production.bstage.manage') && lot.freeKg > 0 ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setScrapping(true)}>
                <Trash2 className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.bstage.scrap', 'Scrap')}
              </Button>
            ) : null}
          </>
        }
        chain={<PlantChain current="coating" hrefs={{ coating: lot.sheetId ? recordHref.coatingSheet(lot.sheetId) : null }} />}
        facts={facts}
      >
        <RecordColumns
          main={
            <Panel title={t('cc_production.bstage.movements', 'Came from and went to')} icon={History} count={lot.movements.length} flush>
              <RegisterGrid
                rows={lot.movements}
                rowKey={(movement) => movement.id}
                empty={t('cc_production.bstage.noMoves', 'No movements on this lot.')}
                columns={[
                  { key: 'at', label: t('cc_production.bstage.when', 'When'), render: (movement) => when(movement.at) },
                  { key: 'doc', label: t('cc_production.bstage.document', 'Document'), render: (movement) => (movement.document ? <DocLink doc={movement.document} /> : movement.reasonCode ?? '—') },
                  { key: 'reason', label: t('cc_production.bstage.detail', 'Detail'), render: (movement) => <span className="whitespace-normal text-xs text-muted-foreground">{movement.reason ?? '—'}</span> },
                  {
                    key: 'kg',
                    label: 'kg',
                    align: 'right',
                    render: (movement) => (
                      <span className={movement.kg < 0 ? 'text-muted-foreground' : 'font-semibold'}>
                        {movement.kg > 0 ? '+' : ''}
                        {kg(movement.kg)}
                      </span>
                    ),
                    total: kg(lot.onHandKg),
                  },
                ]}
              />
            </Panel>
          }
          side={
            <Panel title={t('cc_production.bstage.cameFrom', 'Came from')} icon={Layers}>
              <FieldList
                columns={1}
                fields={[
                  [t('cc_production.coating.cloth', 'Cloth name'), `${lot.clothTitle ?? '—'}${lot.gsm ? ` · ${lot.gsm} GSM` : ''}`],
                  [
                    t('cc_production.bstage.sheet', 'Dryer sheet'),
                    lot.sheetId ? (
                      <Link key="sheet" className="underline-offset-2 hover:underline" href={recordHref.coatingSheet(lot.sheetId)}>
                        {lot.dryerCode ?? '—'} · {day(lot.madeOn)}
                      </Link>
                    ) : null,
                  ],
                  [t('cc_production.bstage.resin', 'Resin batch'), lot.resinBatchNo],
                ]}
              />
            </Panel>
          }
        />
      </RecordPage>

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
    </>
  )
}

export default BstageLotPage
