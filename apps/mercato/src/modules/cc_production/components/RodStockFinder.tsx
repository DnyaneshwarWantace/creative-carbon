"use client"

import * as React from 'react'
import { Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'

type Rod = { id: string; srNo: number | null; odText: string; lengthMm: number; quantity: number }
type Result = { items: Rod[]; totalPieces: number }

export function RodStockFinder() {
  const t = useT()
  const [od, setOd] = React.useState('')
  const [length, setLength] = React.useState('')
  const [tolerance, setTolerance] = React.useState('20')
  const [result, setResult] = React.useState<Result | null>(null)
  const [busy, setBusy] = React.useState(false)

  const search = async () => {
    const params = new URLSearchParams()
    if (od.trim()) params.set('od', od.trim())
    if (length.trim()) params.set('length', length.trim())
    params.set('lengthTolerance', tolerance || '0')
    setBusy(true)
    try {
      const call = await apiCall<Result>(`/api/cc_production/rod-stock?${params.toString()}`)
      setResult(call.ok ? (call.result ?? { items: [], totalPieces: 0 }) : { items: [], totalPieces: 0 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-md border border-border bg-card p-4 space-y-3" aria-label={t('cc_production.rod.title', 'Rod stock')}>
      <div>
        <h2 className="text-sm font-semibold">{t('cc_production.rod.title', 'Rod stock')}</h2>
        <p className="text-xs text-muted-foreground">{t('cc_production.rod.hint', 'An order for a rod came in: do we hold one of that OD and length? Rods are kept by OD range and length in mm.')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3" onKeyDown={(event) => { if (event.key === 'Enter') void search() }}>
        <label className="space-y-1 text-xs text-muted-foreground">{t('cc_production.rod.od', 'OD (mm)')}<Input className="w-24" inputMode="decimal" value={od} onChange={(event) => setOd(event.target.value)} /></label>
        <label className="space-y-1 text-xs text-muted-foreground">{t('cc_production.rod.length', 'Length (mm)')}<Input className="w-24" inputMode="numeric" value={length} onChange={(event) => setLength(event.target.value)} /></label>
        <label className="space-y-1 text-xs text-muted-foreground">{t('cc_production.rod.tolerance', 'Length ± mm')}<Input className="w-20" inputMode="numeric" value={tolerance} onChange={(event) => setTolerance(event.target.value)} /></label>
        <Button type="button" disabled={busy} onClick={() => void search()}>
          <Search className="size-4" />
          {t('cc_production.finder.search', 'Find')}
        </Button>
      </div>
      {result ? (
        result.items.length ? (
          <div className="overflow-x-auto">
            <p className="mb-2 text-xs text-muted-foreground">{t('cc_production.rod.total', '{rows} rows, {pieces} pieces', { rows: result.items.length, pieces: result.totalPieces })}</p>
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-muted-foreground"><th className="py-1 pr-3">#</th><th className="py-1 pr-3">OD</th><th className="py-1 pr-3">{t('cc_production.rod.length', 'Length (mm)')}</th><th className="py-1 pr-3">{t('cc_production.rod.qty', 'Qty')}</th></tr></thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={item.id} className="border-t border-border"><td className="py-1 pr-3 text-muted-foreground">{item.srNo ?? ''}</td><td className="py-1 pr-3">{item.odText}</td><td className="py-1 pr-3">{item.lengthMm}</td><td className="py-1 pr-3">{item.quantity}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('cc_production.rod.none', 'No rod in stock matches.')}</p>
        )
      ) : null}
    </section>
  )
}
