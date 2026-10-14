"use client"

import * as React from 'react'
import { Search } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { CHART_DIMENSIONS, CHART_FAMILIES } from '../lib/masterDefs'

type Found = Record<string, string | number | boolean | null> & { id: string; family: string; code: string; distance: number }
type Result = { total: number; items: Found[] }

const EMPTY_FIELDS: Record<string, string> = {}

export function DieFinder() {
  const t = useT()
  const [family, setFamily] = React.useState('')
  const [text, setText] = React.useState('')
  const [tolerance, setTolerance] = React.useState('2')
  const [fields, setFields] = React.useState<Record<string, string>>(EMPTY_FIELDS)
  const [result, setResult] = React.useState<Result | null>(null)
  const [busy, setBusy] = React.useState(false)
  const shown = family ? (CHART_FAMILIES.find((entry) => entry.value === family)?.dimensions ?? []) : CHART_DIMENSIONS.map((dimension) => dimension.key)

  const search = React.useCallback(async () => {
    const params = new URLSearchParams()
    if (family) params.set('family', family)
    if (text.trim()) params.set('q', text.trim())
    params.set('tol', tolerance || '0')
    for (const [key, value] of Object.entries(fields)) if (value.trim() && shown.includes(key)) params.set(key, value.trim())
    setBusy(true)
    try {
      const call = await apiCall<Result>(`/api/cc_production/chart/find?${params.toString()}`)
      setResult(call.result ?? { total: 0, items: [] })
    } finally {
      setBusy(false)
    }
  }, [family, text, tolerance, fields, shown])

  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') void search()
  }

  return (
    <section className="rounded-md border border-border bg-card p-4 space-y-3" aria-label={t('cc_production.finder.title', 'Die finder')}>
      <div>
        <h2 className="text-sm font-semibold">{t('cc_production.finder.title', 'Die finder')}</h2>
        <p className="text-xs text-muted-foreground">{t('cc_production.finder.hint', 'An enquiry came with a drawing: do we already have a die for it? Type the sizes in mm and how far off they may be.')}</p>
      </div>
      <div className="flex flex-wrap items-end gap-3" onKeyDown={onKey}>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t('cc_production.finder.family', 'Family')}
          <select className="block h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground" value={family} onChange={(event) => setFamily(event.target.value)}>
            <option value="">{t('cc_production.finder.allFamilies', 'All')}</option>
            {CHART_FAMILIES.map((entry) => (
              <option key={entry.value} value={entry.value}>{entry.label}</option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t('cc_production.finder.code', 'Code, customer or note')}
          <Input className="w-48" value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        {CHART_DIMENSIONS.filter((dimension) => shown.includes(dimension.key)).map((dimension) => (
          <label key={dimension.key} className="space-y-1 text-xs text-muted-foreground">
            {dimension.label}
            <Input className="w-20" inputMode="decimal" value={fields[dimension.key] ?? ''} onChange={(event) => setFields((current) => ({ ...current, [dimension.key]: event.target.value }))} />
          </label>
        ))}
        <label className="space-y-1 text-xs text-muted-foreground">
          {t('cc_production.finder.tolerance', '± mm')}
          <Input className="w-16" inputMode="decimal" value={tolerance} onChange={(event) => setTolerance(event.target.value)} />
        </label>
        <Button type="button" onClick={() => void search()} disabled={busy}>
          <Search className="size-4" />
          {t('cc_production.finder.search', 'Find')}
        </Button>
      </div>
      {result ? (
        result.items.length ? (
          <div className="overflow-x-auto">
            <p className="mb-2 text-xs text-muted-foreground">{t('cc_production.finder.count', '{count} found, nearest first', { count: result.total })}</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1 pr-3">{t('cc_production.finder.family', 'Family')}</th>
                  <th className="py-1 pr-3">{t('cc_production.finder.codeColumn', 'Code No.')}</th>
                  {CHART_DIMENSIONS.filter((dimension) => shown.includes(dimension.key)).map((dimension) => (
                    <th key={dimension.key} className="py-1 pr-3">{dimension.label}</th>
                  ))}
                  <th className="py-1 pr-3">{t('cc_production.finder.weight', 'Weight (kg)')}</th>
                  <th className="py-1 pr-3">{t('cc_production.finder.customer', 'Customer / ref.')}</th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={item.id} className="border-t border-border">
                    <td className="py-1 pr-3">{CHART_FAMILIES.find((entry) => entry.value === item.family)?.label ?? item.family}</td>
                    <td className="py-1 pr-3 font-medium">{item.code}</td>
                    {CHART_DIMENSIONS.filter((dimension) => shown.includes(dimension.key)).map((dimension) => (
                      <td key={dimension.key} className="py-1 pr-3">{item[dimension.key] ?? ''}</td>
                    ))}
                    <td className="py-1 pr-3">{item.weightKg ?? ''}</td>
                    <td className="py-1 pr-3">{item.customerRef ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('cc_production.finder.none', 'No die in the chart is that close. Try a larger ± mm.')}</p>
        )
      ) : null}
    </section>
  )
}
