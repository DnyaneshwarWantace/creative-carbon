"use client"

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ClipboardPlus, PackageCheck } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { PlantTable } from '../../cc_production/components/PlantTable'
import { useGranted } from '../../cc_departments/components/useGranted'
import { useSend } from '../../cc_production/components/finishing/shared'

type Suggestion = { productId: string; title: string; code: string | null; kind: string | null; unit: string; reorderPoint: number; safetyStock: number; onHand: number; free: number; onOrder: number; onIndent: number; position: number; below: boolean; stockBelow: boolean; suggested: number }

function qty(value: number): string {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(value)
}

export function ReorderPage() {
  const t = useT()
  const router = useRouter()
  const granted = useGranted()
  const send = useSend('cc-reorder')
  const [all, setAll] = React.useState(false)
  const [items, setItems] = React.useState<Suggestion[] | null>(null)
  const [picked, setPicked] = React.useState<Record<string, string>>({})
  const [saving, setSaving] = React.useState(false)

  const load = React.useCallback(async () => {
    const call = await apiCall<{ items: Suggestion[] }>(`/api/cc_purchase/reorder${all ? '?all=true' : ''}`)
    const list = call.result?.items ?? []
    setItems(list)
    setPicked(Object.fromEntries(list.filter((item) => item.suggested > 0).map((item) => [item.productId, String(item.suggested)])))
  }, [all])

  React.useEffect(() => {
    void load()
  }, [load])

  const chosen = Object.entries(picked).filter(([, value]) => Number(value) > 0)

  const raise = async () => {
    if (!chosen.length) return
    setSaving(true)
    const result = await send<{ id: string; code: string }>(
      '/api/cc_purchase/indents',
      'POST',
      { source: 'low_stock', department: 'Store', notes: t('cc_purchase.reorder.indentNote', 'Below reorder level'), lines: chosen.map(([productId, value]) => ({ productId, quantity: Number(value) })) },
      null,
      t('cc_purchase.reorder.failed', 'Could not raise the indent.'),
    )
    setSaving(false)
    if (!result) return
    flash(t('cc_purchase.reorder.raised', 'Indent {code} raised', { code: result.code }), 'success')
    router.push(`/backend/purchase/indents?id=${result.id}`)
  }

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-7xl space-y-4 pb-16">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold">{t('cc_purchase.nav.reorder', 'Reorder suggestions')}</h1>
              <p className="text-sm text-muted-foreground">
                {t('cc_purchase.reorder.subtitle', 'Raw material is bought by reorder level, not from orders. Stock + open POs + open indents below the item’s reorder level is suggested back up to reorder level + safety stock. Set the level on the item (Minimum stock).')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <input type="checkbox" className="h-3.5 w-3.5 rounded-sm border-input" checked={all} onChange={(event) => setAll(event.target.checked)} />
                {t('cc_purchase.reorder.all', 'Show every item with a reorder level')}
              </label>
              {granted.has('cc_purchase.indent') ? (
                <Button type="button" disabled={saving || !chosen.length} onClick={raise}>
                  <ClipboardPlus className="mr-1.5 h-4 w-4" />
                  {t('cc_purchase.reorder.raise', 'Raise indent ({count})', { count: chosen.length })}
                </Button>
              ) : null}
            </div>
          </div>
          {!items ? (
            <LoadingMessage label={t('cc_purchase.loading', 'Loading…')} />
          ) : (
            <div className="rounded-xl border bg-card shadow-xs">
              <PlantTable
                tableId="cc_purchase.reorder"
                rows={items}
                rowKey={(row) => row.productId}
                empty={<EmptyState className="py-12" variant="subtle" icon={<PackageCheck className="h-5 w-5" aria-hidden="true" />} title={t('cc_purchase.reorder.empty', 'Nothing is below its reorder level')} />}
                columns={[
                  { key: 'item', label: t('cc_purchase.reorder.item', 'Item'), alwaysVisible: true, render: (row) => <Link className="font-medium underline-offset-2 hover:underline" href={`/backend/products/${row.productId}`}>{row.title}{row.code ? <span className="ml-1 font-mono text-xs text-muted-foreground">{row.code}</span> : null}</Link> },
                  { key: 'kind', label: t('cc_purchase.reorder.kind', 'Type'), hidden: true, render: (row) => row.kind ?? '' },
                  { key: 'onHand', label: t('cc_purchase.reorder.onHand', 'In stock'), align: 'right', render: (row) => <span className={cn('tabular-nums', row.stockBelow && 'font-semibold text-status-error-text')}>{qty(row.onHand)} {row.unit}</span> },
                  { key: 'free', label: t('cc_purchase.reorder.free', 'Free'), align: 'right', hidden: true, render: (row) => <span className="tabular-nums">{qty(row.free)}</span> },
                  { key: 'onOrder', label: t('cc_purchase.reorder.onOrder', 'On open POs'), align: 'right', render: (row) => <span className="tabular-nums">{row.onOrder ? qty(row.onOrder) : '—'}</span> },
                  { key: 'onIndent', label: t('cc_purchase.reorder.onIndent', 'On open indents'), align: 'right', render: (row) => <span className="tabular-nums">{row.onIndent ? qty(row.onIndent) : '—'}</span> },
                  { key: 'reorder', label: t('cc_purchase.reorder.level', 'Reorder level'), align: 'right', render: (row) => <span className="tabular-nums">{qty(row.reorderPoint)}</span> },
                  { key: 'safety', label: t('cc_purchase.reorder.safety', 'Safety stock'), align: 'right', hidden: true, render: (row) => <span className="tabular-nums">{qty(row.safetyStock)}</span> },
                  {
                    key: 'order',
                    label: t('cc_purchase.reorder.toOrder', 'Indent qty'),
                    align: 'right',
                    alwaysVisible: true,
                    render: (row) => (
                      <Input
                        type="number"
                        min={0}
                        step="0.001"
                        className="ml-auto w-28 text-right font-mono"
                        value={picked[row.productId] ?? ''}
                        placeholder={row.below ? String(row.suggested) : '0'}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => setPicked((prev) => ({ ...prev, [row.productId]: event.target.value }))}
                        aria-label={t('cc_purchase.reorder.toOrder', 'Indent qty')}
                      />
                    ),
                  },
                ]}
              />
            </div>
          )}
        </div>
      </PageBody>
    </Page>
  )
}

export default ReorderPage
