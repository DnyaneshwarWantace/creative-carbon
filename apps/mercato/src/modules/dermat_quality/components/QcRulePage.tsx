"use client"

import * as React from 'react'
import { ListSelectItems } from '../../dermat_lists/components/ListSelectItems'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { DEFAULT_RULES } from '../lib/defaults'
import { OPERATION_LABEL } from './shared'

type Param = { key: string; name: string; class: string; spec: string; test: 'chemical' | 'micro'; min?: number | null; max?: number | null; unit?: string | null }
type Rule = {
  id: string
  code: string
  title: string
  operation: string
  productId: string | null
  productTitle: string | null
  requiresChemical: boolean
  requiresMicro: boolean
  isActive: boolean
  parameters: Param[]
  notes: string | null
  updatedAt: string
}
type ProductOption = { id: string; title: string; code: string | null }

function keyFromName(name: string, taken: Set<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 50) || 'parameter'
  let key = base
  let index = 2
  while (taken.has(key)) key = `${base}_${index++}`
  return key
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (value: boolean) => void; label: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={cn('flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors', checked ? 'border-primary bg-primary/5' : 'hover:bg-muted/40')}
    >
      <span className={cn('mt-0.5 h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors', checked ? 'bg-primary' : 'bg-muted-foreground/30')}>
        <span className={cn('block h-3 w-3 rounded-full bg-background transition-transform', checked && 'translate-x-3')} />
      </span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  )
}

export function QcRulePage({ ruleId }: { ruleId?: string }) {
  const t = useT()
  const router = useRouter()
  const { runMutation } = useGuardedMutation({ contextId: `dermat-qc-rule-${ruleId ?? 'new'}` })
  const [rule, setRule] = React.useState<Rule | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [title, setTitle] = React.useState('')
  const [operation, setOperation] = React.useState('bulk')
  const [product, setProduct] = React.useState<ProductOption | null>(null)
  const [productSearch, setProductSearch] = React.useState('')
  const [productOptions, setProductOptions] = React.useState<ProductOption[]>([])
  const [requiresChemical, setRequiresChemical] = React.useState(true)
  const [requiresMicro, setRequiresMicro] = React.useState(false)
  const [isActive, setIsActive] = React.useState(true)
  const [params, setParams] = React.useState<Param[]>([])
  const [notes, setNotes] = React.useState('')
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!ruleId) {
      const base = DEFAULT_RULES.find((entry) => entry.operation === 'bulk')
      setParams(base?.parameters ?? [])
      setRequiresMicro(base?.requiresMicro ?? false)
      return
    }
    apiCall<Rule>(`/api/dermat_quality/rules?id=${encodeURIComponent(ruleId)}`).then((call) => {
      if (!call.ok || !call.result) {
        setLoadError(t('dermat_quality.rules.loadError', 'Could not load this rule.'))
        return
      }
      const value = call.result
      setRule(value)
      setTitle(value.title)
      setOperation(value.operation)
      setRequiresChemical(value.requiresChemical)
      setRequiresMicro(value.requiresMicro)
      setIsActive(value.isActive)
      setParams(value.parameters)
      setNotes(value.notes ?? '')
    })
  }, [ruleId, t])

  React.useEffect(() => {
    if (ruleId) return
    let cancelled = false
    const handle = window.setTimeout(async () => {
      const params = new URLSearchParams({ kinds: 'raw_material,packing_material,bulk,finished_goods,rnd', limit: '10' })
      if (productSearch.trim()) params.set('q', productSearch.trim())
      const call = await apiCall<{ items?: ProductOption[] }>(`/api/dermat_products/search?${params.toString()}`, undefined, { fallback: { items: [] } })
      if (!cancelled) setProductOptions(call.result?.items ?? [])
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(handle)
    }
  }, [productSearch, ruleId])

  const changeOperation = (value: string) => {
    setOperation(value)
    if (!ruleId) {
      const base = DEFAULT_RULES.find((entry) => entry.operation === value)
      setParams(base?.parameters ?? [])
      setRequiresChemical(base?.requiresChemical ?? true)
      setRequiresMicro(base?.requiresMicro ?? false)
    }
  }

  const patchParam = (index: number, patch: Partial<Param>) => setParams((prev) => prev.map((param, position) => (position === index ? { ...param, ...patch } : param)))

  const addParam = (test: 'chemical' | 'micro') =>
    setParams((prev) => [...prev, { key: keyFromName(`new ${test}`, new Set(prev.map((param) => param.key))), name: '', class: 'Critical', spec: '', test }])

  const save = async () => {
    const cleaned = params
      .filter((param) => param.name.trim())
      .map((param, index, list) => ({
        ...param,
        name: param.name.trim(),
        key: param.key.startsWith('new_') ? keyFromName(param.name, new Set(list.filter((_, other) => other !== index).map((entry) => entry.key))) : param.key,
      }))
    if (!title.trim()) {
      flash(t('dermat_quality.rules.needTitle', 'Enter a title.'), 'error')
      return
    }
    if (!ruleId && !product) {
      flash(t('dermat_quality.rules.needProduct', 'Pick the product this rule is for.'), 'error')
      return
    }
    const body = {
      title: title.trim(),
      operation,
      productId: rule?.productId ?? product?.id ?? null,
      requiresChemical,
      requiresMicro,
      isActive,
      parameters: cleaned,
      notes: notes.trim() || null,
    }
    setSaving(true)
    try {
      const payload = rule ? { ...body, id: rule.id } : body
      const call = await runMutation({
        context: { ruleId: rule?.id ?? null },
        mutationPayload: payload,
        operation: () => {
          const request = () =>
            apiCall<{ id?: string; error?: string }>('/api/dermat_quality/rules', {
              method: rule ? 'PUT' : 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(payload),
            })
          return rule ? withScopedApiRequestHeaders(buildOptimisticLockHeader(rule.updatedAt), request) : request()
        },
      })
      if (!call.ok) {
        flash(call.result?.error ?? t('dermat_quality.rules.saveError', 'Could not save the rule.'), 'error')
        return
      }
      flash(t('dermat_quality.rules.saved', 'QC rule saved'), 'success')
      router.push('/backend/qc/rules')
    } catch {
      flash(t('dermat_quality.rules.saveError', 'Could not save the rule.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loadError) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={loadError} />
        </PageBody>
      </Page>
    )
  }
  if (ruleId && !rule) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dermat_quality.rules.loading', 'Loading QC rules…')} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <form
          className="mx-auto max-w-5xl space-y-5 pb-16"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              save()
            }
            if (event.key === 'Escape') router.push('/backend/qc/rules')
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <div className="space-y-1">
              <Link href="/backend/qc/rules" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3 w-3" />
                {t('dermat_quality.nav.rules', 'QC rules')}
              </Link>
              <h1 className="text-xl font-bold">
                {rule ? `${rule.code} · ${rule.title}` : t('dermat_quality.rules.newTitle', 'New QC rule for a product')}
              </h1>
              <p className="text-xs text-muted-foreground">
                {OPERATION_LABEL[operation]}
                {rule ? ` · ${rule.productTitle ?? t('dermat_quality.rules.default', 'Default for every product')}` : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => router.push('/backend/qc/rules')} disabled={saving}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t('dermat_quality.rules.saving', 'Saving…') : t('dermat_quality.rules.save', 'Save rule')}
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader className="border-b bg-muted/20 pb-3">
              <CardTitle className="text-sm font-bold">{t('dermat_quality.rules.what', 'What this rule covers')}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rule-title" className="text-xs text-muted-foreground">
                  {t('dermat_quality.rules.title', 'Title *')}
                </Label>
                <Input id="rule-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. RM (Cucumber Kiwi WS)" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{t('dermat_quality.rules.operation', 'When it is tested')}</Label>
                <Select value={operation} onValueChange={changeOperation} disabled={Boolean(rule)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(OPERATION_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!rule ? (
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="rule-product" className="text-xs text-muted-foreground">
                    {t('dermat_quality.rules.product', 'Product *')}
                  </Label>
                  {product ? (
                    <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                      <span>
                        {product.code ? <span className="mr-1 font-mono text-xs text-muted-foreground">{product.code}</span> : null}
                        {product.title}
                      </span>
                      <button type="button" className="text-xs text-primary hover:underline" onClick={() => setProduct(null)}>
                        {t('dermat_quality.rules.change', 'Change')}
                      </button>
                    </div>
                  ) : (
                    <>
                      <Input id="rule-product" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder={t('dermat_quality.rules.productSearch', 'Internal ID or name')} />
                      <ul className="max-h-48 divide-y overflow-auto rounded-md border text-sm">
                        {productOptions.map((option) => (
                          <li key={option.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-1.5 text-left hover:bg-muted"
                              onClick={() => {
                                setProduct(option)
                                if (!title.trim()) setTitle(option.title)
                              }}
                            >
                              {option.code ? <span className="mr-1 font-mono text-xs text-muted-foreground">{option.code}</span> : null}
                              {option.title}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              ) : null}
              <Toggle
                checked={requiresChemical}
                onChange={setRequiresChemical}
                label={t('dermat_quality.rules.chemical', 'Chemical test needed')}
                hint={t('dermat_quality.rules.chemicalHint', 'The QC chemical team must pass it')}
              />
              <Toggle
                checked={requiresMicro}
                onChange={setRequiresMicro}
                label={t('dermat_quality.rules.micro', 'Micro test needed')}
                hint={t('dermat_quality.rules.microHint', 'The QC micro team must also pass it')}
              />
              <Toggle
                checked={isActive}
                onChange={setIsActive}
                label={t('dermat_quality.rules.active', 'Rule is on')}
                hint={t('dermat_quality.rules.activeHint', 'Off = no QC check is created at this point')}
              />
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b bg-muted/20 pb-3">
              <CardTitle className="text-sm font-bold">{t('dermat_quality.rules.parameters', 'Parameters')}</CardTitle>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => addParam('chemical')}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {t('dermat_quality.rules.addChemical', 'Chemical parameter')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => addParam('micro')}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {t('dermat_quality.rules.addMicro', 'Micro parameter')}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">{t('dermat_quality.parameter', 'Parameter')}</th>
                    <th className="w-32 p-3 text-left">{t('dermat_quality.class', 'Class')}</th>
                    <th className="p-3 text-left">{t('dermat_quality.spec', 'Specification')}</th>
                    <th className="w-60 p-3 text-left">{t('dermat_quality.limits', 'Min · Max · Unit (for automatic check)')}</th>
                    <th className="w-32 p-3 text-left">{t('dermat_quality.rules.test', 'Test')}</th>
                    <th className="w-12 p-3" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {params.map((param, index) => (
                    <tr key={param.key}>
                      <td className="p-2">
                        <Input aria-label="Parameter name" className="h-8" value={param.name} onChange={(event) => patchParam(index, { name: event.target.value })} />
                      </td>
                      <td className="p-2">
                        <Select value={param.class} onValueChange={(value) => patchParam(index, { class: value })}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <ListSelectItems listKey="qc_classes" current={param.class} />
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input aria-label="Specification" className="h-8" value={param.spec} placeholder="e.g. Clear, colourless gel" onChange={(event) => patchParam(index, { spec: event.target.value })} />
                      </td>
                      <td className="p-2">
                        <span className="flex gap-1.5">
                          <Input
                            aria-label="Minimum"
                            type="number"
                            step="any"
                            className="h-8 w-20 text-right"
                            placeholder="min"
                            value={param.min ?? ''}
                            onChange={(event) => patchParam(index, { min: event.target.value === '' ? null : Number(event.target.value) })}
                          />
                          <Input
                            aria-label="Maximum"
                            type="number"
                            step="any"
                            className="h-8 w-20 text-right"
                            placeholder="max"
                            value={param.max ?? ''}
                            onChange={(event) => patchParam(index, { max: event.target.value === '' ? null : Number(event.target.value) })}
                          />
                          <Input aria-label="Unit" className="h-8 w-16" placeholder="unit" value={param.unit ?? ''} onChange={(event) => patchParam(index, { unit: event.target.value || null })} />
                        </span>
                      </td>
                      <td className="p-2">
                        <Select value={param.test} onValueChange={(value) => patchParam(index, { test: value as Param['test'] })}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="chemical">Chemical</SelectItem>
                            <SelectItem value="micro">Micro</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground"
                          aria-label={t('dermat_quality.rules.remove', 'Remove parameter')}
                          onClick={() => setParams((prev) => prev.filter((_, position) => position !== index))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-1.5 pt-4">
              <Label htmlFor="rule-notes" className="text-xs text-muted-foreground">
                {t('dermat_quality.rules.notes', 'Notes')}
              </Label>
              <Textarea id="rule-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </CardContent>
          </Card>
        </form>
      </PageBody>
    </Page>
  )
}

export default QcRulePage
