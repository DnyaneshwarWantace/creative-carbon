"use client"

import * as React from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useGranted } from '../../../cc_departments/components/useGranted'
import { SearchPicker, type PickerOption } from '../../../cc_orders/components/SearchPicker'
import { RECIPE_LEVELS, type RecipeLevel } from '../../lib/recipeCheck'

type View = {
  id: string
  level: RecipeLevel
  name: string
  basis: string
  outputProductId: string | null
  outputProductTitle: string | null
  dieNo: string | null
  outputQty: number
  lines: Array<{ productId: string; kg: number; tolerancePct: number; title: string }>
  notes: string | null
  isActive: boolean
  updatedAt: string
}

type Draft = {
  id?: string
  level: RecipeLevel
  name: string
  outputProductId: string | null
  outputProductTitle: string | null
  dieNo: string
  outputQty: string
  lines: Array<{ productId: string; title: string; kg: string; tolerancePct: string }>
  notes: string
  isActive: boolean
  updatedAt?: string
}

const OUTPUT_KINDS: Record<RecipeLevel, string> = { resin: 'resin', coating: 'bstage', laminate: 'laminate', moulded: 'moulded' }
const INPUT_KINDS: Record<RecipeLevel, string> = {
  resin: 'chemical',
  coating: 'reinforcement,resin',
  laminate: 'bstage',
  moulded: 'bstage,chindi,reinforcement',
}

function searchProducts(kinds: string) {
  return async (search: string): Promise<PickerOption<null>[]> => {
    const call = await apiCall<{ items?: Array<{ id: string; title: string; code: string | null }> }>(`/api/cc_products/search?kinds=${kinds}&q=${encodeURIComponent(search.trim())}&limit=20`, undefined, { fallback: { items: [] } })
    return (call.result?.items ?? []).map((item) => ({ id: item.id, primary: item.title, secondary: item.code, value: null }))
  }
}

function blank(level: RecipeLevel): Draft {
  return { level, name: '', outputProductId: null, outputProductTitle: null, dieNo: '', outputQty: level === 'resin' ? '1000' : '1', lines: [], notes: '', isActive: true }
}

function toDraft(view: View): Draft {
  return { id: view.id, level: view.level, name: view.name, outputProductId: view.outputProductId, outputProductTitle: view.outputProductTitle, dieNo: view.dieNo ?? '', outputQty: String(view.outputQty), lines: view.lines.map((line) => ({ productId: line.productId, title: line.title, kg: String(line.kg), tolerancePct: String(line.tolerancePct) })), notes: view.notes ?? '', isActive: view.isActive, updatedAt: view.updatedAt }
}

export function RecipesPage() {
  const t = useT()
  const granted = useGranted()
  const canManage = granted.has('cc_production.recipes.manage')
  const { runMutation } = useGuardedMutation({ contextId: 'cc-recipes' })
  const [level, setLevel] = React.useState<RecipeLevel>('resin')
  const [items, setItems] = React.useState<View[]>([])
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [busy, setBusy] = React.useState(false)
  const def = RECIPE_LEVELS.find((entry) => entry.value === level)!

  const load = React.useCallback(async () => {
    const call = await apiCall<{ items: View[] }>(`/api/cc_production/recipes?level=${level}`, undefined, { fallback: { items: [] } })
    setItems(call.result?.items ?? [])
  }, [level])
  React.useEffect(() => {
    setDraft(null)
    void load()
  }, [load])

  const save = async () => {
    if (!draft) return
    const body = {
      ...(draft.id ? { id: draft.id } : {}),
      level: draft.level,
      name: draft.name.trim(),
      outputProductId: draft.outputProductId,
      dieNo: draft.level === 'moulded' ? draft.dieNo.trim() || null : null,
      outputQty: Number(draft.outputQty),
      lines: draft.lines.map((line) => ({ productId: line.productId, kg: Number(line.kg), tolerancePct: Number(line.tolerancePct) || 0 })),
      notes: draft.notes.trim() || null,
      isActive: draft.isActive,
    }
    setBusy(true)
    try {
      const method = draft.id ? 'PUT' : 'POST'
      const request = () => apiCall<{ error?: string }>('/api/cc_production/recipes', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const call = await runMutation({
        context: { resourceKind: 'cc_production.recipe', resourceId: draft.id ?? 'new' },
        mutationPayload: body,
        operation: () => (draft.updatedAt ? withScopedApiRequestHeaders(buildOptimisticLockHeader(draft.updatedAt), request) : request()),
      })
      if (!call.ok) {
        flash(call.result?.error ?? t('cc_production.recipes.saveError', 'Could not save the recipe.'), 'error')
        return
      }
      flash(t('cc_production.recipes.saved', 'Recipe saved.'), 'success')
      setDraft(null)
      await load()
    } finally {
      setBusy(false)
    }
  }

  const setLine = (index: number, patch: Partial<Draft['lines'][number]>) => setDraft((current) => (current ? { ...current, lines: current.lines.map((line, at) => (at === index ? { ...line, ...patch } : line)) } : current))

  return (
    <Page>
      <PageBody>
        <div className="mx-auto max-w-5xl space-y-4 pb-16">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold">{t('cc_production.recipes.title', 'Recipes')}</h1>
              <p className="text-sm text-muted-foreground">{t('cc_production.recipes.hint', 'The standard raw material for what is made. The production entry compares what was really used with it and shows a warning; it never blocks the entry.')}</p>
            </div>
            {canManage ? (
              <Button type="button" onClick={() => setDraft(blank(level))}>
                <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t('cc_production.recipes.new', 'New recipe')}
              </Button>
            ) : null}
          </div>
          <SegmentedControl value={level} onValueChange={(value) => setLevel(value as RecipeLevel)} aria-label={t('cc_production.recipes.levels', 'Recipe type')}>
            {RECIPE_LEVELS.map((entry) => (
              <SegmentedControlItem key={entry.value} value={entry.value}>{t(`cc_production.recipes.level.${entry.value}`, entry.label)}</SegmentedControlItem>
            ))}
          </SegmentedControl>
          <p className="text-xs text-muted-foreground">{def.hint}</p>

          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full text-sm">
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-border last:border-b-0 align-top">
                    <td className="px-3 py-2 font-medium">{item.name}{item.dieNo ? <span className="ml-2 font-mono text-xs text-muted-foreground">Die {item.dieNo}</span> : null}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.outputProductTitle ?? '—'}</td>
                    <td className="px-3 py-2">{item.outputQty} {item.basis}</td>
                    <td className="px-3 py-2 text-muted-foreground">{item.lines.map((line) => `${line.title} ${line.kg} kg`).join(' · ')}</td>
                    <td className="px-3 py-2">{item.isActive ? null : <StatusBadge variant="neutral">{t('cc_production.recipes.off', 'Not in use')}</StatusBadge>}</td>
                    <td className="px-3 py-2 text-right">{canManage ? <Button type="button" variant="outline" size="sm" onClick={() => setDraft(toDraft(item))}>{t('cc_production.recipes.edit', 'Edit')}</Button> : null}</td>
                  </tr>
                ))}
                {!items.length ? <tr><td className="px-3 py-6 text-center text-muted-foreground">{t('cc_production.recipes.empty', 'No recipe of this type yet.')}</td></tr> : null}
              </tbody>
            </table>
          </div>

          {draft ? (
            <section className="space-y-3 rounded-md border border-border bg-card p-4" onKeyDown={(event) => { if (event.key === 'Escape') setDraft(null); if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) void save() }}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5"><Label>{t('cc_production.recipes.name', 'Recipe name')}</Label><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div>
                <div className="space-y-1.5">
                  <Label>{t('cc_production.recipes.output', 'Makes (item)')}</Label>
                  <SearchPicker
                    value={draft.outputProductId ? { id: draft.outputProductId, primary: draft.outputProductTitle ?? '', value: null } : null}
                    placeholder={t('cc_production.recipes.pickOutput', 'Pick the item made')}
                    searchPlaceholder={t('cc_production.recipes.searchItem', 'Search item')}
                    load={searchProducts(OUTPUT_KINDS[draft.level])}
                    onSelect={(option) => setDraft({ ...draft, outputProductId: option.id, outputProductTitle: option.primary })}
                  />
                </div>
                <div className="space-y-1.5"><Label>{t('cc_production.recipes.qty', 'Quantity these amounts make ({basis})', { basis: RECIPE_LEVELS.find((entry) => entry.value === draft.level)?.basis ?? '' })}</Label><Input inputMode="decimal" value={draft.outputQty} onChange={(event) => setDraft({ ...draft, outputQty: event.target.value })} /></div>
                {draft.level === 'moulded' ? <div className="space-y-1.5"><Label>{t('cc_production.recipes.die', 'Die No. (optional)')}</Label><Input value={draft.dieNo} onChange={(event) => setDraft({ ...draft, dieNo: event.target.value })} /></div> : null}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-muted-foreground"><th className="px-1 py-1">{t('cc_production.recipes.material', 'Raw material')}</th><th className="px-1 py-1">kg</th><th className="px-1 py-1">{t('cc_production.recipes.tolerance', 'Allowed ± %')}</th><th /></tr></thead>
                  <tbody>
                    {draft.lines.map((line, index) => (
                      <tr key={index}>
                        <td className="px-1 py-1 min-w-56">{line.title}</td>
                        <td className="px-1 py-1"><Input className="w-28" inputMode="decimal" value={line.kg} onChange={(event) => setLine(index, { kg: event.target.value })} /></td>
                        <td className="px-1 py-1"><Input className="w-20" inputMode="decimal" value={line.tolerancePct} onChange={(event) => setLine(index, { tolerancePct: event.target.value })} /></td>
                        <td className="px-1 py-1"><Button type="button" variant="ghost" size="sm" aria-label={t('cc_production.recipes.removeLine', 'Remove material')} onClick={() => setDraft({ ...draft, lines: draft.lines.filter((_, at) => at !== index) })}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="max-w-md">
                <SearchPicker
                  value={null}
                  placeholder={t('cc_production.recipes.addMaterial', 'Add a raw material')}
                  searchPlaceholder={t('cc_production.recipes.searchItem', 'Search item')}
                  load={searchProducts(INPUT_KINDS[draft.level])}
                  onSelect={(option) => { if (!draft.lines.some((line) => line.productId === option.id)) setDraft({ ...draft, lines: [...draft.lines, { productId: option.id, title: option.primary, kg: '', tolerancePct: '2' }] }) }}
                />
              </div>
              <div className="space-y-1.5"><Label>{t('cc_production.recipes.notes', 'Notes')}</Label><Textarea rows={2} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.isActive} onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })} />{t('cc_production.recipes.inUse', 'In use')}</label>
                <Button type="button" disabled={busy || !draft.name.trim() || !draft.lines.length || draft.lines.some((line) => !Number(line.kg))} onClick={() => void save()}>{t('cc_production.recipes.save', 'Save recipe')}</Button>
                <Button type="button" variant="ghost" onClick={() => setDraft(null)}>{t('cc_production.recipes.cancel', 'Cancel')}</Button>
              </div>
            </section>
          ) : null}
        </div>
      </PageBody>
    </Page>
  )
}
