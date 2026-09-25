"use client"

import * as React from 'react'
import Link from 'next/link'
import { Plus, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { FILL_UNITS, fillToBulkQuantity, type FillUnit } from '../lib/bomKinds'
import { formatQty } from './MaterialPicker'

type UsageItem = {
  bomId: string
  bomCode: string
  version: number
  status: string
  productId: string
  productName: string
  productCode: string | null
  packSize: string | null
  perPiece: number
  fillQty: number | null
  fillUnit: string | null
}

type PlanRow = {
  key: string
  label: string
  href: string | null
  fillQty: string
  fillUnit: FillUnit
  fixedPerPiece: number | null
  pieces: string
}

function toNumber(value: string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function FillPlan({
  productId,
  batchSize,
  bulkUnit,
  specificGravity,
}: {
  productId: string
  batchSize: number
  bulkUnit: string
  specificGravity: number | null
}) {
  const t = useT()
  const [rows, setRows] = React.useState<PlanRow[]>([])
  const [batch, setBatch] = React.useState(String(batchSize))
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    apiCall<{ items?: UsageItem[] }>(`/api/dermat_boms/usage?productId=${encodeURIComponent(productId)}`, undefined, { fallback: { items: [] } }).then(
      (call) => {
        if (cancelled) return
        setRows(
          (call.result?.items ?? []).map((item) => ({
            key: item.bomId,
            label: `${item.productName}${item.productCode ? ` · ${item.productCode}` : ''}`,
            href: `/backend/boms/${item.bomId}`,
            fillQty: item.fillQty != null ? String(item.fillQty) : '',
            fillUnit: (FILL_UNITS as readonly string[]).includes(item.fillUnit ?? '') ? (item.fillUnit as FillUnit) : 'ml',
            fixedPerPiece: item.fillQty != null ? null : item.perPiece,
            pieces: '',
          })),
        )
        setLoaded(true)
      },
    )
    return () => {
      cancelled = true
    }
  }, [productId])

  const perPiece = (row: PlanRow) =>
    row.fixedPerPiece ?? (toNumber(row.fillQty) > 0 ? fillToBulkQuantity(toNumber(row.fillQty), row.fillUnit, bulkUnit, specificGravity) : 0)

  const lines = rows.map((row) => {
    const each = perPiece(row)
    return { row, each, need: each * toNumber(row.pieces) }
  })
  const batchValue = toNumber(batch)
  const used = lines.reduce((sum, line) => sum + line.need, 0)
  const left = batchValue - used
  const over = left < -0.0005

  const update = (key: string, patch: Partial<PlanRow>) => setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)))

  const addCustom = () =>
    setRows((prev) => [
      ...prev,
      { key: `custom-${Date.now()}`, label: '', href: null, fillQty: '', fillUnit: 'ml', fixedPerPiece: null, pieces: '' },
    ])

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-col gap-3 border-b bg-muted/20 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <CardTitle className="text-sm font-bold">{t('dermat_boms.fill.title', 'Fill plan — one batch into pack sizes')}</CardTitle>
          <CardDescription className="text-xs">
            {t(
              'dermat_boms.fill.hint',
              'Enter how many pieces of each pack size you will fill from this batch. ml is turned into {unit} with specific gravity {sg}.',
              { unit: bulkUnit, sg: formatQty(specificGravity && specificGravity > 0 ? specificGravity : 1, 3) },
            )}
          </CardDescription>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('dermat_boms.fill.batch', 'Batch ({unit})', { unit: bulkUnit })}</Label>
          <Input type="number" min={0} step="any" className="h-8 w-32 text-right font-mono" value={batch} onChange={(event) => setBatch(event.target.value)} />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3 text-left">{t('dermat_boms.fill.pack', 'Pack')}</th>
                <th className="w-48 p-3 text-left">{t('dermat_boms.fill.fill', 'Fill size / pc')}</th>
                <th className="w-32 p-3 text-right">{t('dermat_boms.fill.each', '{unit} / pc', { unit: bulkUnit })}</th>
                <th className="w-32 p-3 text-right">{t('dermat_boms.fill.pieces', 'Pieces')}</th>
                <th className="w-32 p-3 text-right">{t('dermat_boms.fill.need', 'Bulk needed')}</th>
                <th className="w-36 p-3 text-right">{t('dermat_boms.fill.max', 'Max from what is left')}</th>
                <th className="w-12 p-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map(({ row, each, need }) => {
                const remainingForRow = left + need
                const maxPieces = each > 0 && remainingForRow > 0 ? Math.floor(remainingForRow / each) : 0
                return (
                  <tr key={row.key}>
                    <td className="p-3">
                      {row.href ? (
                        <Link href={row.href} className="font-medium hover:underline">
                          {row.label}
                        </Link>
                      ) : (
                        <Input
                          className="h-8"
                          value={row.label}
                          placeholder={t('dermat_boms.fill.customLabel', 'Other pack size')}
                          onChange={(event) => update(row.key, { label: event.target.value })}
                        />
                      )}
                    </td>
                    <td className="p-2">
                      {row.fixedPerPiece != null ? (
                        <span className="text-xs text-muted-foreground">{t('dermat_boms.fill.noFill', 'set as kg per piece in its BOM')}</span>
                      ) : (
                        <div className="flex gap-1.5">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            className="h-8 w-24 text-right font-mono"
                            value={row.fillQty}
                            onChange={(event) => update(row.key, { fillQty: event.target.value })}
                          />
                          <Select value={row.fillUnit} onValueChange={(value) => update(row.key, { fillUnit: value as FillUnit })}>
                            <SelectTrigger className="h-8 w-20">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {FILL_UNITS.map((unit) => (
                                <SelectItem key={unit} value={unit}>
                                  {unit}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-right font-mono text-xs">{each > 0 ? formatQty(each, 5) : '—'}</td>
                    <td className="p-2">
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        className="h-8 text-right font-mono"
                        value={row.pieces}
                        onChange={(event) => update(row.key, { pieces: event.target.value })}
                      />
                    </td>
                    <td className="p-3 text-right font-mono font-semibold">
                      {formatQty(need)} <span className="text-xs font-normal text-muted-foreground">{bulkUnit}</span>
                    </td>
                    <td className="p-3 text-right font-mono text-xs text-muted-foreground">
                      {each > 0 ? t('dermat_boms.fill.maxPieces', '{count} pcs', { count: formatQty(maxPieces, 0) }) : '—'}
                    </td>
                    <td className="p-2">
                      {row.href ? null : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          aria-label={t('dermat_boms.table.remove', 'Remove line')}
                          onClick={() => setRows((prev) => prev.filter((entry) => entry.key !== row.key))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {loaded && !rows.length ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-sm text-muted-foreground">
                    {t('dermat_boms.fill.empty', 'No Finished Good uses this bulk yet. Add a pack size below to try the numbers.')}
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot className="border-t bg-muted/30 text-sm font-semibold">
              <tr>
                <td colSpan={4} className="p-3 text-right text-xs uppercase text-muted-foreground">
                  {t('dermat_boms.fill.used', 'Used / left from {batch} {unit}', { batch: formatQty(batchValue), unit: bulkUnit })}
                </td>
                <td className="p-3 text-right font-mono">{formatQty(used)}</td>
                <td className={cn('p-3 text-right font-mono', over ? 'text-status-error-text' : 'text-status-success-text')}>
                  {over
                    ? t('dermat_boms.fill.over', '{value} {unit} short', { value: formatQty(-left), unit: bulkUnit })
                    : t('dermat_boms.fill.left', '{value} {unit} left', { value: formatQty(left), unit: bulkUnit })}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="border-t p-3">
          <Button type="button" variant="outline" size="sm" onClick={addCustom}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t('dermat_boms.fill.add', 'Try another pack size')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default FillPlan
