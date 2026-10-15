"use client"

import * as React from 'react'
import { ClipboardList } from 'lucide-react'
import Link from 'next/link'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { Panel } from '../../../cc_ui/components/RecordPage'
import { pickRecipe, type ActualUse, type RecipeLevel } from '../../lib/recipeCheck'

type RecipeRow = { id: string; level: string; name: string; outputProductId: string | null; dieNo: string | null; isActive: boolean }
type Check = {
  recipeName: string
  basis: string
  warnings: number
  lines: Array<{ productId: string; title: string; expectedKg: number; actualKg: number; deviationPct: number | null; status: 'ok' | 'high' | 'low' | 'missing' | 'extra' }>
}

const VARIANT = { ok: 'success', high: 'warning', low: 'warning', missing: 'error', extra: 'warning' } as const

export function RecipeCheckPanel({ level, match, outputQty, actual }: { level: RecipeLevel; match: { outputProductId?: string | null; dieNo?: string | null }; outputQty: number | null; actual: ActualUse[] }) {
  const t = useT()
  const granted = useGranted()
  const [recipes, setRecipes] = React.useState<RecipeRow[] | null>(null)
  const [check, setCheck] = React.useState<Check | null>(null)
  const allowed = granted.has('cc_production.recipes.view')
  const recipe = recipes ? pickRecipe(recipes, level, match) : null
  const actualKey = JSON.stringify(actual)

  React.useEffect(() => {
    if (!allowed) return
    void apiCall<{ items: RecipeRow[] }>(`/api/cc_production/recipes?level=${level}`, undefined, { fallback: { items: [] } }).then((call) => setRecipes(call.result?.items ?? []))
  }, [allowed, level])

  React.useEffect(() => {
    setCheck(null)
    if (!recipe || !outputQty || outputQty <= 0 || !actual.length) return
    let cancelled = false
    void apiCall<Check>('/api/cc_production/recipes/check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ recipeId: recipe.id, outputQty, actual }) }).then((call) => {
      if (!cancelled && call.ok && call.result) setCheck(call.result)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipe?.id, outputQty, actualKey])

  if (!allowed || !recipes || !actual.length) return null
  if (!recipe) {
    return (
      <Panel title={t('cc_production.recipes.check', 'Recipe check')} icon={ClipboardList}>
        <p className="text-sm text-muted-foreground">
          {t('cc_production.recipes.noneFor', 'No recipe is set for this.')}{' '}
          <Link className="underline-offset-2 hover:underline" href="/backend/recipes">{t('cc_production.recipes.setOne', 'Set one up')}</Link>
        </p>
      </Panel>
    )
  }
  if (!check) return null
  const nf = (value: number) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value)
  return (
    <Panel
      title={t('cc_production.recipes.checkAgainst', 'Recipe check: {name}', { name: check.recipeName })}
      icon={ClipboardList}
      action={check.warnings ? <StatusBadge variant="warning">{t('cc_production.recipes.warnings', '{count} to look at', { count: check.warnings })}</StatusBadge> : <StatusBadge variant="success">{t('cc_production.recipes.allOk', 'As per recipe')}</StatusBadge>}
      flush
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th className="px-3 py-2">{t('cc_production.recipes.material', 'Raw material')}</th><th className="px-3 py-2 text-right">{t('cc_production.recipes.expected', 'Recipe kg')}</th><th className="px-3 py-2 text-right">{t('cc_production.recipes.used', 'Used kg')}</th><th className="px-3 py-2 text-right">±%</th><th className="px-3 py-2" /></tr></thead>
          <tbody>
            {check.lines.map((line) => (
              <tr key={line.productId} className="border-t border-border">
                <td className="px-3 py-2">{line.title}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{nf(line.expectedKg)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{nf(line.actualKg)}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">{line.deviationPct === null ? '—' : `${line.deviationPct > 0 ? '+' : ''}${line.deviationPct}`}</td>
                <td className="px-3 py-2"><StatusBadge variant={VARIANT[line.status]}>{{ ok: t('cc_production.recipes.s.ok', 'OK'), high: t('cc_production.recipes.s.high', 'More than recipe'), low: t('cc_production.recipes.s.low', 'Less than recipe'), missing: t('cc_production.recipes.s.missing', 'Not used'), extra: t('cc_production.recipes.s.extra', 'Not in recipe') }[line.status]}</StatusBadge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}
