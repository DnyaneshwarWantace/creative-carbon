"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Boxes, FlaskConical, Layers, Package, Receipt, Sparkles, Tag } from 'lucide-react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { cn } from '@open-mercato/shared/lib/utils'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrud, deleteCrud, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useGuardedMutation } from '@open-mercato/ui/backend/injection/useGuardedMutation'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { PRODUCT_KINDS, type ProductKind } from '../lib/kinds'
import { KIND_CONFIG, unitsForKind, type KindConfig } from '../lib/kindConfig'

type Row = Record<string, unknown>
type ListResponse<T> = { items?: T[] }
type TaxOption = { value: string; label: string }

type FormState = {
  title: string
  itemCode: string
  unit: string
  taxRateId: string
  hsnCode: string
  minStock: string
  details: Record<string, string>
}

type Loaded = {
  state: FormState
  rootCategoryId: string | null
  taxRates: TaxOption[]
  units: TaxOption[]
  profileId: string | null
  updatedAt: string | null
}

const KIND_ICONS: Record<KindConfig['icon'], React.ComponentType<{ className?: string }>> = {
  flask: FlaskConical,
  boxes: Boxes,
  layers: Layers,
  package: Package,
  sparkles: Sparkles,
}

function read(row: Row | undefined, ...keys: string[]): unknown {
  if (!row) return undefined
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key]
  }
  const custom = row.customFields
  if (custom && typeof custom === 'object') {
    for (const key of keys) {
      const value = (custom as Row)[key.startsWith('cf_') ? key.slice(3) : key]
      if (value !== undefined && value !== null) return value
    }
  }
  return undefined
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value)
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function load(config: KindConfig, productId?: string): Promise<Loaded> {
  const kindLabel = PRODUCT_KINDS.find((entry) => entry.code === config.kind)?.label ?? ''
  const [tree, taxes, unitCall, productCall, profileCall] = await Promise.all([
    apiCall<ListResponse<{ id: string; name: string }>>('/api/catalog/categories?view=tree', undefined, { fallback: { items: [] } }),
    apiCall<ListResponse<Row>>('/api/sales/tax-rates?pageSize=100', undefined, { fallback: { items: [] } }),
    apiCall<{ entries?: Array<{ value: string; label: string }> }>('/api/catalog/dictionaries/unit', undefined, {
      fallback: { entries: [] },
    }),
    productId ? apiCall<ListResponse<Row>>(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`) : null,
    productId
      ? apiCall<ListResponse<Row>>(`/api/wms/inventory-profiles?catalogProductId=${encodeURIComponent(productId)}&pageSize=1`, undefined, {
          fallback: { items: [] },
        })
      : null,
  ])
  const taxItems = taxes.result?.items ?? []
  const taxRates = taxItems.map((rate) => ({ value: text(rate.id), label: text(rate.name) }))
  const defaultTax = text(taxItems.find((rate) => rate.is_default || rate.isDefault)?.id)
  const product = productCall?.result?.items?.[0]
  if (productId && (!productCall?.ok || !product)) throw new Error('not-found')
  const profile = profileCall?.result?.items?.[0]
  const details: Record<string, string> = {}
  for (const field of config.fields) details[field.key] = text(read(product, `cf_${field.key}`))
  return {
    state: {
      title: text(read(product, 'title')),
      itemCode: text(read(product, 'cf_item_code')),
      unit: text(read(product, 'default_unit', 'defaultUnit')) || config.defaultUnit,
      taxRateId: text(read(product, 'tax_rate_id', 'taxRateId')) || (product ? '' : defaultTax),
      hsnCode: text(read(product, 'cf_hsn_code')),
      minStock: text(read(profile, 'reorder_point', 'reorderPoint')),
      details,
    },
    rootCategoryId: (tree.result?.items ?? []).find((node) => node.name === kindLabel)?.id ?? null,
    taxRates,
    units: unitsForKind(config, (unitCall.result?.entries ?? []).map((entry) => ({ value: entry.value, label: entry.label }))),
    profileId: profile ? text(read(profile, 'id')) : null,
    updatedAt: text(read(product, 'updated_at', 'updatedAt')) || null,
  }
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">
        {label}
        {required ? ' *' : ''}
      </Label>
      {children}
    </div>
  )
}

export function ProductForm({ kind, productId }: { kind: ProductKind; productId?: string }) {
  const t = useT()
  const router = useRouter()
  const config = KIND_CONFIG[kind]
  const listHref = `/backend/products?tab=${config.slug}`
  const { runMutation } = useGuardedMutation({ contextId: `dermat-product-${productId ?? 'new'}` })

  const [loaded, setLoaded] = React.useState<Loaded | null>(null)
  const [state, setState] = React.useState<FormState | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [nameError, setNameError] = React.useState<string | null>(null)
  const [codeError, setCodeError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    setLoaded(null)
    setState(null)
    load(config, productId)
      .then((result) => {
        if (cancelled) return
        setLoaded(result)
        setState(result.state)
      })
      .catch(() => {
        if (!cancelled) setLoadError(t('dermat_products.errors.load', 'Could not load this product.'))
      })
    return () => {
      cancelled = true
    }
  }, [config, productId, t])

  const update = (patch: Partial<FormState>) => setState((prev) => (prev ? { ...prev, ...patch } : prev))
  const updateDetail = (key: string, value: string) =>
    setState((prev) => (prev ? { ...prev, details: { ...prev.details, [key]: value } } : prev))

  const handleSave = async () => {
    if (!state || !loaded) return
    const title = state.title.trim()
    if (!title) {
      setNameError(t('dermat_products.errors.name', 'Enter a name.'))
      return
    }
    setNameError(null)
    if (config.codeRequired && !state.itemCode.trim()) {
      setCodeError(t('dermat_products.errors.codeRequired', 'Enter the {label}.', { label: config.codeLabel }))
      return
    }
    setCodeError(null)
    const custom: Record<string, unknown> = {
      cf_item_code: state.itemCode.trim() || null,
      cf_hsn_code: state.hsnCode.trim() || null,
    }
    for (const field of config.fields) {
      const value = state.details[field.key] ?? ''
      custom[`cf_${field.key}`] = field.numeric ? numberOrNull(value) : value.trim() || null
    }
    const productPayload = {
      title,
      taxRateId: state.taxRateId || null,
      defaultUnit: state.unit,
      defaultSalesUnit: state.unit,
      uomRoundingScale: 3,
      customFieldsetCode: kind,
      categoryIds: loaded.rootCategoryId ? [loaded.rootCategoryId] : [],
      isActive: true,
      ...custom,
    }
    const profilePayload = {
      defaultUom: state.unit,
      defaultStrategy: 'fifo',
      trackLot: true,
      reorderPoint: numberOrNull(state.minStock) ?? 0,
    }
    setSaving(true)
    try {
      await runMutation({
        context: { kind, productId: productId ?? null },
        mutationPayload: productPayload,
        operation: async () => {
          let id = productId ?? null
          if (id) {
            await withScopedApiRequestHeaders(buildOptimisticLockHeader(loaded.updatedAt), () =>
              updateCrud('catalog/products', { id, ...productPayload }),
            )
          } else {
            const created = await createCrud<{ id?: string }>('catalog/products', productPayload)
            id = created.result?.id ?? null
            if (!id) throw new Error('[internal] product id missing after create')
            await createCrud('catalog/variants', { productId: id, name: title, isDefault: true, isActive: true })
          }
          if (loaded.profileId) await updateCrud('wms/inventory-profiles', { id: loaded.profileId, ...profilePayload })
          else await createCrud('wms/inventory-profiles', { catalogProductId: id, ...profilePayload })
        },
      })
      flash(t('dermat_products.flash.saved', '{kind} saved', { kind: config.singular }), 'success')
      router.push(listHref)
    } catch {
      flash(t('dermat_products.flash.saveFailed', 'Could not save. Check the fields and try again.'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!productId || !loaded) return
    setSaving(true)
    try {
      await runMutation({
        context: { kind, productId },
        operation: () =>
          withScopedApiRequestHeaders(buildOptimisticLockHeader(loaded.updatedAt), () => deleteCrud('catalog/products', productId)),
      })
      flash(t('dermat_products.flash.deleted', '{kind} deleted', { kind: config.singular }), 'success')
      router.push(listHref)
    } catch {
      flash(t('dermat_products.flash.deleteFailed', 'Could not delete.'), 'error')
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
  if (!loaded || !state) {
    return (
      <Page>
        <PageBody>
          <LoadingMessage label={t('dermat_products.form.loading', 'Loading…')} />
        </PageBody>
      </Page>
    )
  }

  return (
    <Page>
      <PageBody>
        <form
          className="space-y-6"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSave()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void handleSave()
            }
            if (event.key === 'Escape') router.push(listHref)
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="icon" onClick={() => router.push(listHref)} aria-label={t('common.back', 'Back')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-2xl font-bold tracking-tight">
                  {productId
                    ? t('dermat_products.form.editTitle', 'Edit {kind}', { kind: config.singular })
                    : t('dermat_products.form.createTitle', 'New {kind}', { kind: config.singular })}
                </h1>
              </div>
              <p className="ml-11 text-xs text-muted-foreground">{config.hint}</p>
            </div>
            <div className="flex items-center gap-2">
              {productId ? (
                <Button type="button" variant="destructive-ghost" onClick={handleDelete} disabled={saving}>
                  {t('common.delete', 'Delete')}
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => router.push(listHref)} disabled={saving}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t('dermat_products.form.saving', 'Saving…') : t('dermat_products.form.save', 'Save {kind}', { kind: config.singular })}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/30 p-1.5">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              {PRODUCT_KINDS.map((entry) => {
                const entryConfig = KIND_CONFIG[entry.code]
                const Icon = KIND_ICONS[entryConfig.icon]
                const selected = entry.code === kind
                const locked = Boolean(productId)
                return (
                  <button
                    key={entry.code}
                    type="button"
                    disabled={locked && !selected}
                    onClick={() => {
                      if (!locked && !selected) router.replace(`/backend/products/new/${entryConfig.slug}`)
                    }}
                    className={cn(
                      'flex flex-col items-start rounded-lg border p-3 text-left transition-colors',
                      selected
                        ? 'border-primary/20 bg-background text-primary shadow-sm ring-1 ring-primary/20'
                        : 'border-transparent text-muted-foreground hover:bg-background/50 hover:text-foreground disabled:opacity-40',
                    )}
                  >
                    <span className="flex items-center gap-2 text-xs font-bold">
                      <Icon className="h-4 w-4" />
                      {entryConfig.singular}
                    </span>
                    <span className="mt-1 hidden text-xs text-muted-foreground sm:inline">{entryConfig.hint}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              <Card>
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    <Tag className="h-4 w-4 text-primary" />
                    {t('dermat_products.form.identity', '1. Name & Code')}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t('dermat_products.form.identityHint', 'The name and the code your team already uses.')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-12">
                  <div className="sm:col-span-8">
                    <Field label={t('dermat_products.form.name', 'Name')} required>
                      <Input
                        value={state.title}
                        onChange={(event) => update({ title: event.target.value })}
                        placeholder={config.namePlaceholder}
                        autoFocus
                      />
                    </Field>
                    {nameError ? <p className="mt-1 text-xs text-destructive">{nameError}</p> : null}
                  </div>
                  <div className="sm:col-span-4">
                    <Field label={config.codeLabel} required={config.codeRequired}>
                      <Input
                        value={state.itemCode}
                        onChange={(event) => update({ itemCode: event.target.value })}
                        placeholder={config.codePlaceholder}
                        className="font-mono"
                      />
                    </Field>
                    {codeError ? <p className="mt-1 text-xs text-destructive">{codeError}</p> : null}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    {React.createElement(KIND_ICONS[config.icon], { className: 'h-4 w-4 text-primary' })}
                    {`2. ${config.detailsTitle}`}
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
                  {config.fields.map((field) => (
                    <div key={field.key} className={field.wide ? 'sm:col-span-2' : undefined}>
                      <Field label={field.label}>
                        <Input
                          value={state.details[field.key] ?? ''}
                          onChange={(event) => updateDetail(field.key, event.target.value)}
                          placeholder={field.placeholder}
                          inputMode={field.numeric ? 'decimal' : undefined}
                        />
                      </Field>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-4">
              <Card>
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    <Receipt className="h-4 w-4 text-primary" />
                    {t('dermat_products.form.stockTax', '3. Unit, Stock & Tax')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <Field label={t('dermat_products.form.unit', 'Unit')} required>
                    <Select value={state.unit} onValueChange={(unit) => update({ unit })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {loaded.units.map((unit) => (
                          <SelectItem key={unit.value} value={unit.value}>
                            {unit.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={t('dermat_products.form.minStock', 'Minimum Stock ({unit})', { unit: state.unit })}>
                    <Input
                      value={state.minStock}
                      onChange={(event) => update({ minStock: event.target.value })}
                      inputMode="decimal"
                      placeholder="0"
                    />
                  </Field>
                  <Field label={t('dermat_products.form.gst', 'GST')}>
                    <Select value={state.taxRateId} onValueChange={(taxRateId) => update({ taxRateId })}>
                      <SelectTrigger>
                        <SelectValue placeholder={t('dermat_products.form.gstPlaceholder', 'Select GST')} />
                      </SelectTrigger>
                      <SelectContent>
                        {loaded.taxRates.map((rate) => (
                          <SelectItem key={rate.value} value={rate.value}>
                            {rate.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label={t('dermat_products.form.hsn', 'HSN Code')}>
                    <Input value={state.hsnCode} onChange={(event) => update({ hsnCode: event.target.value })} placeholder="e.g. 3304" />
                  </Field>
                </CardContent>
              </Card>
            </div>
          </div>
        </form>
      </PageBody>
    </Page>
  )
}

export default ProductForm
