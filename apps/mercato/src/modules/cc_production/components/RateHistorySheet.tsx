"use client"

import * as React from 'react'
import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { FieldList, LinkRows, Panel } from '../../cc_ui/components/RecordPage'
import { PageLoading } from '../../cc_ui/components/PageLoading'
import { Timeline } from '../../cc_ui/components/Timeline'

type RateView = {
  id: string
  sizeClass: 'small' | 'big'
  grade: string
  thicknessFrom: number | null
  thicknessTo: number | null
  ratePerKg: number
  currency: string
  isActive: boolean
  updatedByName: string | null
  updatedAt: string
  quotations: Array<{ id: string; quoteNo: string; quoteDate: string; status: string; rate: number }>
}

function range(from: number | null, to: number | null): string {
  if (from === null && to === null) return 'Any thickness'
  return `${from ?? '…'} – ${to ?? '…'} mm`
}

export function RateHistorySheet({ rateId, onOpenChange }: { rateId: string | null; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const [rate, setRate] = React.useState<RateView | null>(null)

  React.useEffect(() => {
    setRate(null)
    if (!rateId) return
    void apiCall<RateView>(`/api/cc_production/masters/rate?id=${encodeURIComponent(rateId)}`).then((call) => setRate(call.ok ? (call.result ?? null) : null))
  }, [rateId])

  return (
    <Sheet open={Boolean(rateId)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{rate ? `${rate.grade} · ${rate.sizeClass === 'small' ? t('cc_production.prices.small', 'Small size') : t('cc_production.prices.big', 'Big size')}` : t('cc_production.prices.history', 'Rate history')}</SheetTitle>
          <SheetDescription>{t('cc_production.prices.historyHint', 'Every change of this rate with who and why, and the quotations that used it.')}</SheetDescription>
        </SheetHeader>
        {!rate ? (
          <PageLoading label={t('cc_production.prices.loading', 'Loading rate…')} />
        ) : (
          <div className="mt-4 space-y-4">
            <Panel title={t('cc_production.prices.rate', 'Rate')}>
              <FieldList
                columns={1}
                fields={[
                  [t('cc_production.prices.thickness', 'Thickness'), range(rate.thicknessFrom, rate.thicknessTo)],
                  [t('cc_production.prices.perKg', 'Rate per kg'), `${rate.currency} ${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(rate.ratePerKg)}`],
                  [t('cc_production.prices.inUse', 'In use'), rate.isActive ? t('common.yes', 'Yes') : t('common.no', 'No')],
                  [t('cc_production.prices.changed', 'Last changed'), [new Date(rate.updatedAt).toLocaleString('en-IN'), rate.updatedByName].filter(Boolean).join(' · ')],
                ]}
              />
            </Panel>
            <Panel title={t('cc_production.prices.usedIn', 'Used in quotations')} count={rate.quotations.length} flush>
              <LinkRows
                empty={t('cc_production.prices.notUsed', 'No quotation used this rate yet.')}
                rows={rate.quotations.map((quote) => ({
                  key: `${quote.id}-${quote.rate}`,
                  href: `/backend/crm/quotations/${quote.id}`,
                  primary: <span className="font-mono">{quote.quoteNo}</span>,
                  secondary: quote.quoteDate,
                  value: `${rate.currency} ${quote.rate}`,
                  badge: <StatusBadge variant="neutral">{quote.status}</StatusBadge>,
                }))}
              />
            </Panel>
            <Timeline type="price_rate" id={rate.id} refreshKey={rate.updatedAt} title={t('cc_production.prices.changes', 'Rate changes')} />
            <p className="text-xs text-muted-foreground">
              <Link href="/backend/masters/prices" className="underline">
                {t('cc_production.prices.back', 'All price lists')}
              </Link>
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default RateHistorySheet
