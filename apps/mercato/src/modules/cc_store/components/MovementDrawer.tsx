"use client"

import * as React from 'react'
import Link from 'next/link'
import { Undo2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@open-mercato/ui/primitives/sheet'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { FieldList } from '../../cc_ui/components/RecordPage'
import { PageLoading } from '../../cc_ui/components/PageLoading'
import type { DocumentLink } from '../../cc_ui/lib/links'

type Movement = {
  id: string
  type: string
  reasonCode: string | null
  quantity: number
  unit: string | null
  from: string | null
  to: string | null
  productId: string | null
  title: string
  lotId: string | null
  lotNumber: string | null
  reason: string | null
  by: string | null
  at: string
  document: DocumentLink | null
  adjustmentId: string | null
  stocktakeId: string | null
  reverses: string | null
  reversedBy: string | null
  pair: { id: string; quantity: number; reason: string | null; at: string } | null
}

export function MovementDrawer({ movementId, onOpenChange }: { movementId: string | null; onOpenChange: (open: boolean) => void }) {
  const t = useT()
  const [current, setCurrent] = React.useState<string | null>(movementId)
  const [movement, setMovement] = React.useState<Movement | null>(null)

  React.useEffect(() => setCurrent(movementId), [movementId])
  React.useEffect(() => {
    setMovement(null)
    if (!current) return
    void apiCall<Movement>(`/api/cc_store/stock/movement?id=${encodeURIComponent(current)}`).then((call) => setMovement(call.ok ? (call.result ?? null) : null))
  }, [current])

  const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const link = (href: string, label: React.ReactNode) => (
    <Link href={href} className="text-primary hover:underline">
      {label}
    </Link>
  )

  return (
    <Sheet open={Boolean(movementId)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{movement ? `${movement.quantity > 0 ? '+' : ''}${movement.quantity} ${movement.unit ?? ''} · ${movement.title}` : t('cc_store.movement.title', 'Stock movement')}</SheetTitle>
          <SheetDescription>{movement?.reason ?? ''}</SheetDescription>
        </SheetHeader>
        {!movement ? (
          <PageLoading label={t('cc_store.movement.loading', 'Loading…')} />
        ) : (
          <div className="mt-4 space-y-4">
            <FieldList
              columns={1}
              fields={[
                [t('cc_store.movement.type', 'Type'), [movement.type, movement.reasonCode].filter(Boolean).join(' · ')],
                [t('cc_store.movement.qty', 'Quantity'), `${movement.quantity} ${movement.unit ?? ''}`],
                [t('cc_store.movement.route', 'From → to'), [movement.from, movement.to].filter(Boolean).join(' → ') || '—'],
                [t('cc_store.movement.lot', 'Lot'), movement.lotId ? link(`/backend/stock/lots/${movement.lotId}`, movement.lotNumber ?? '—') : '—'],
                [t('cc_store.movement.item', 'Item'), movement.productId ? link(`/backend/store/ledger?productId=${movement.productId}`, movement.title) : movement.title],
                [t('cc_store.movement.document', 'Document'), movement.document?.href ? link(movement.document.href, movement.document.label ?? movement.document.kind) : movement.adjustmentId ? link(`/backend/stock/adjustments/${movement.adjustmentId}`, t('cc_store.movement.adjustment', 'Store adjustment')) : movement.stocktakeId ? link(`/backend/stock/stocktake/${movement.stocktakeId}`, t('cc_store.movement.stocktake', 'Stocktake')) : '—'],
                [t('cc_store.movement.by', 'Who'), movement.by ?? '—'],
                [t('cc_store.movement.when', 'When'), when(movement.at)],
              ]}
            />
            {movement.pair ? (
              <div className="space-y-2 rounded-md border border-status-warning-border bg-status-warning-bg p-3 text-sm text-status-warning-text">
                <p className="flex items-center gap-1.5 font-medium">
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  {movement.reverses ? t('cc_store.movement.reverses', 'This undoes an earlier entry') : t('cc_store.movement.reversedBy', 'This was undone later')}
                </p>
                <p className="text-xs">{[`${movement.pair.quantity > 0 ? '+' : ''}${movement.pair.quantity}`, movement.pair.reason, when(movement.pair.at)].filter(Boolean).join(' · ')}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => setCurrent(movement.pair!.id)}>
                  {t('cc_store.movement.openPair', 'Open the other entry')}
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('cc_store.movement.noPair', 'Not reversed.')}</p>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export default MovementDrawer
