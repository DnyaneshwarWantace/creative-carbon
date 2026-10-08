"use client"

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Boxes, FlaskConical, IndianRupee, Layers, Package, Receipt, Settings2, Sparkles, Tag } from 'lucide-react'
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
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { PRODUCT_KINDS, SELLABLE_KINDS, type ProductKind } from '../lib/kinds'
import { KIND_CONFIG, unitsForKind, type KindConfig } from '../lib/kindConfig'
import { fieldsForKind, isNumericField, loadProductFieldDefs, type ProductFieldDef } from '../lib/fieldDefs'
import { FieldsPanel, type PanelField } from './FieldsPanel'
import { PageLoading } from '../../cc_ui/components/PageLoading'

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
  productType: string
  strategy: string
  sellingPrice: string
  costPrice: string
  details: Record<string, string>
}

type Loaded = {
  state: FormState
  rootCategoryId: string | null
  taxRates: TaxOption[]
  units: TaxOption[]
  productTypes: TaxOption[]
  hiddenFields: string[]
  defs: ProductFieldDef[]
  listOptions: Record<string, TaxOption[]>
  profileId: string | null
  updatedAt: string | null
  sku: string | null
}

const STRATEGY_OPTIONS = [
  { value: 'fifo', label: 'First In First Out (FIFO)' },
  { value: 'fefo', label: 'First Expiry First Out (FEFO)' },
  { value: 'lifo', label: 'Last In First Out (LIFO)' },
]

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

async function loadListOptions(defs: ProductFieldDef[]): Promise<Record<string, TaxOption[]>> {
  const result: Record<string, TaxOption[]> = {}
  await Promise.all(
    defs.map(async (def) => {
      if (def.dictionaryId) {
        const call = await apiCall<{ items?: Array<{ value: string; label?: string | null }> }>(
          `/api/dictionaries/${def.dictionaryId}/entries?limit=500`,
          undefined,
          { fallback: { items: [] } },
        )
        result[def.key] = (call.result?.items ?? []).map((entry) => ({ value: entry.value, label: entry.label || entry.value }))
      } else if (def.options.length) {
        result[def.key] = def.options.map((value) => ({ value, label: value }))
      }
    }),
  )
  return result
}

async function load(config: KindConfig, productId?: string): Promise<Loaded> {
  const kindLabel = PRODUCT_KINDS.find((entry) => entry.code === config.kind)?.label ?? ''
  const [defs, tree, taxes, unitCall, typeCall, settingsCall, productCall, profileCall] = await Promise.all([
    loadProductFieldDefs(),
    apiCall<ListResponse<{ id: string; name: string }>>('/api/catalog/categories?view=tree', undefined, { fallback: { items: [] } }),
    apiCall<ListResponse<Row>>('/api/sales/tax-rates?pageSize=100', undefined, { fallback: { items: [] } }),
    apiCall<{ entries?: Array<{ value: string; label: string }> }>('/api/catalog/dictionaries/unit', undefined, {
      fallback: { entries: [] },
    }),
    apiCall<{ entries?: Array<{ value: string; label: string }> }>('/api/catalog/dictionaries/product_type', undefined, {
      fallback: { entries: [] },
    }),
    apiCall<{ hiddenFields?: Record<string, string[]> }>('/api/cc_products/field-settings', undefined, {
      fallback: { hiddenFields: {} },
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
  const kindDefs = fieldsForKind(defs, config.kind, config.fields.map((field) => field.key))
  const details: Record<string, string> = {}
  for (const def of kindDefs) details[def.key] = text(read(product, `cf_${def.key}`))
  const listOptions = await loadListOptions(kindDefs)
  return {
    state: {
      title: text(read(product, 'title')),
      itemCode: text(read(product, 'cf_item_code')),
      unit: text(read(product, 'default_unit', 'defaultUnit')) || config.defaultUnit,
      taxRateId: text(read(product, 'tax_rate_id', 'taxRateId')) || (product ? '' : defaultTax),
      hsnCode: text(read(product, 'cf_hsn_code')),
      minStock: text(read(profile, 'reorder_point', 'reorderPoint')),
      productType: text(read(product, 'cf_product_type')) || (product ? '' : 'Storable'),
      strategy: text(read(profile, 'default_strategy', 'defaultStrategy')) || 'fifo',
      sellingPrice: text(read(product, 'cf_selling_price')),
      costPrice: text(read(product, 'cf_cost_price')),
      details,
    },
    rootCategoryId: (tree.result?.items ?? []).find((node) => node.name === kindLabel)?.id ?? null,
    taxRates,
    productTypes: (typeCall.result?.entries ?? []).map((entry) => ({ value: entry.value, label: entry.label })),
    hiddenFields: settingsCall.result?.hiddenFields?.[config.kind] ?? [],
    defs,
    listOptions,
    units: unitsForKind(config, (unitCall.result?.entries ?? []).map((entry) => ({ value: entry.value, label: entry.label }))),
    profileId: profile ? text(read(profile, 'id')) : null,
    updatedAt: text(read(product, 'updated_at', 'updatedAt')) || null,
    sku: text(read(product, 'sku')) || null,
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
  const backHref = productId ? `/backend/products/${productId}` : listHref
  const { runMutation } = useGuardedMutation({ contextId: `cc-product-${productId ?? 'new'}` })

  const [loaded, setLoaded] = React.useState<Loaded | null>(null)
  const [state, setState] = React.useState<FormState | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [panelOpen, setPanelOpen] = React.useState(false)
  const [hidden, setHidden] = React.useState<Set<string>>(new Set())
  const [defs, setDefs] = React.useState<ProductFieldDef[]>([])
  const [listOptions, setListOptions] = React.useState<Record<string, TaxOption[]>>({})
  const [stock, setStock] = React.useState<{ onHand: number; reserved: number; available: number } | null>(null)

  React.useEffect(() => {
    if (!loaded) return
    setHidden(new Set(loaded.hiddenFields))
    setDefs(loaded.defs)
    setListOptions(loaded.listOptions)
  }, [loaded])

  const kindDefs = React.useMemo(
    () => fieldsForKind(defs, kind, config.fields.map((field) => field.key)),
    [defs, kind, config],
  )

  const panelFields = React.useMemo<PanelField[]>(
    () => [
      { key: 'item_code', label: config.codeLabel, locked: config.codeRequired },
      ...kindDefs.map((def) => ({ key: def.key, label: def.label })),
      { key: 'min_stock', label: t('cc_products.form.minStockPlain', 'Minimum Stock') },
      { key: 'gst', label: t('cc_products.form.gst', 'GST') },
      { key: 'hsn', label: t('cc_products.form.hsn', 'HSN Code') },
      ...(SELLABLE_KINDS.has(kind) ? [{ key: 'selling_price', label: t('cc_products.form.sellingPrice', 'Selling Price (₹)') }] : []),
      { key: 'cost_price', label: t('cc_products.form.costPrice', 'Cost Price (₹)') },
    ],
    [config, kind, kindDefs, t],
  )

  const isVisible = (key: string) => {
    if (key === 'item_code' && config.codeRequired) return true
    if (key === 'product_type' || key === 'batch_method') return false
    if (key === 'selling_price' && !SELLABLE_KINDS.has(kind)) return false
    return !hidden.has(key)
  }

  const reloadDefinitions = async () => {
    const nextDefs = await loadProductFieldDefs()
    setDefs(nextDefs)
    setListOptions(await loadListOptions(fieldsForKind(nextDefs, kind, config.fields.map((field) => field.key))))
  }
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
        if (!cancelled) setLoadError(t('cc_products.errors.load', 'Could not load this product.'))
      })
    return () => {
      cancelled = true
    }
  }, [config, productId, t])

  React.useEffect(() => {
    if (!productId) return
    let cancelled = false
    apiCall<{ items?: Record<string, { onHand: number; reserved: number; available: number }> }>(
      `/api/cc_products/stock?productIds=${encodeURIComponent(productId)}`,
      undefined,
      { fallback: { items: {} } },
    ).then((call) => {
      if (!cancelled) setStock(call.result?.items?.[productId] ?? { onHand: 0, reserved: 0, available: 0 })
    })
    return () => {
      cancelled = true
    }
  }, [productId])

  const update = (patch: Partial<FormState>) => setState((prev) => (prev ? { ...prev, ...patch } : prev))
  const updateDetail = (key: string, value: string) =>
    setState((prev) => (prev ? { ...prev, details: { ...prev.details, [key]: value } } : prev))

  const handleSave = async () => {
    if (!state || !loaded) return
    const title = state.title.trim()
    if (!title) {
      setNameError(t('cc_products.errors.name', 'Enter a name.'))
      return
    }
    setNameError(null)
    if (config.codeRequired && !state.itemCode.trim()) {
      setCodeError(t('cc_products.errors.codeRequired', 'Enter the {label}.', { label: config.codeLabel }))
      return
    }
    setCodeError(null)
    const custom: Record<string, unknown> = {
      cf_item_code: state.itemCode.trim() || null,
      cf_hsn_code: state.hsnCode.trim() || null,
      cf_product_type: state.productType || null,
      cf_selling_price: numberOrNull(state.sellingPrice),
      cf_cost_price: numberOrNull(state.costPrice),
    }
    for (const def of kindDefs) {
      const value = state.details[def.key] ?? ''
      custom[`cf_${def.key}`] = isNumericField(def) ? numberOrNull(value) : value.trim() || null
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
      defaultStrategy: state.strategy === 'fefo' || state.strategy === 'lifo' ? state.strategy : 'fifo',
      trackExpiration: state.strategy === 'fefo',
      trackLot: true,
      reorderPoint: numberOrNull(state.minStock) ?? 0,
    }
    setSaving(true)
    let savedId: string | null = productId ?? null
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
            const next = await apiCall<{ sku?: string }>('/api/cc_products/next-sku')
            const created = await createCrud<{ id?: string }>('catalog/products', { ...productPayload, ...(next.result?.sku ? { sku: next.result.sku } : {}) })
            id = created.result?.id ?? null
            if (!id) throw new Error('[internal] product id missing after create')
            savedId = id
            const createdCall = await apiCall<{ items?: Row[] }>(`/api/catalog/products?id=${encodeURIComponent(id)}&pageSize=1`)
            const productSku = text(read(createdCall.result?.items?.[0], 'sku')) || undefined
            await createCrud('catalog/variants', { productId: id, name: title, sku: productSku, isDefault: true, isActive: true })
          }
          if (loaded.profileId) await updateCrud('wms/inventory-profiles', { id: loaded.profileId, ...profilePayload })
          else await createCrud('wms/inventory-profiles', { catalogProductId: id, ...profilePayload })
        },
      })
      flash(t('cc_products.flash.saved', '{kind} saved', { kind: config.singular }), 'success')
      router.push(savedId ? `/backend/products/${savedId}` : listHref)
    } catch {
      flash(t('cc_products.flash.saveFailed', 'Could not save. Check the fields and try again.'), 'error')
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
      flash(t('cc_products.flash.deleted', '{kind} deleted', { kind: config.singular }), 'success')
      router.push(listHref)
    } catch (error) {
      const message = error instanceof Error && error.message && !error.message.startsWith('[internal]') ? error.message : null
      flash(message ?? t('cc_products.flash.deleteFailed', 'Could not delete.'), 'error')
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
          <PageLoading label={t('cc_products.form.loading', 'Loading…')} />
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
            if (event.key === 'Escape') router.push(backHref)
          }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="ghost" size="icon" onClick={() => router.push(backHref)} aria-label={t('common.back', 'Back')}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-2xl font-bold tracking-tight">
                  {productId
                    ? t('cc_products.form.editTitle', 'Edit {kind}', { kind: config.singular })
                    : t('cc_products.form.createTitle', 'New {kind}', { kind: config.singular })}
                </h1>
              </div>
              <p className="ml-11 text-xs text-muted-foreground">{config.hint}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={() => setPanelOpen(true)}>
                <Settings2 className="mr-2 h-4 w-4" />
                {t('cc_products.form.customize', 'Customize fields')}
              </Button>
              {productId ? (
                <Button type="button" variant="destructive-ghost" onClick={handleDelete} disabled={saving}>
                  {t('common.delete', 'Delete')}
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => router.push(backHref)} disabled={saving}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? t('cc_products.form.saving', 'Saving…') : t('cc_products.form.save', 'Save {kind}', { kind: config.singular })}
              </Button>
            </div>
          </div>

          <div className="rounded-xl border bg-muted/30 p-1.5">
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
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

          {productId && stock ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              {[
                { key: 'onHand', label: t('cc_products.stock.onHand', 'On hand'), value: stock.onHand },
                { key: 'reserved', label: t('cc_products.stock.reserved', 'Reserved for orders'), value: stock.reserved },
                { key: 'available', label: t('cc_products.stock.available', 'Free to use'), value: stock.available },
              ].map((tile) => (
                <div key={tile.key} className="rounded-lg border bg-background p-3">
                  <div className="text-xs text-muted-foreground">{tile.label}</div>
                  <div className="text-lg font-semibold">
                    {new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(tile.value)} {state.unit}
                  </div>
                </div>
              ))}
              <div className="rounded-lg border bg-background p-3">
                <div className="text-xs text-muted-foreground">{t('cc_products.stock.minStock', 'Min stock')}</div>
                <div
                  className={cn(
                    'text-lg font-semibold',
                    state.minStock && stock.available < Number(state.minStock) ? 'text-status-error-text' : '',
                  )}
                >
                  {state.minStock ? `${state.minStock} ${state.unit}` : '—'}
                </div>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              <Card>
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    <Tag className="h-4 w-4 text-primary" />
                    {t('cc_products.form.identity', '1. Name & Code')}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {t('cc_products.form.identityHint', 'The name and the code your team already uses.')}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-12">
                  <div className="sm:col-span-8">
                    <Field label={t('cc_products.form.name', 'Name')} required>
                      <Input
                        value={state.title}
                        onChange={(event) => update({ title: event.target.value })}
                        placeholder={config.namePlaceholder}
                        autoFocus
                      />
                    </Field>
                    {nameError ? <p className="mt-1 text-xs text-destructive">{nameError}</p> : null}
                  </div>
                  {isVisible('item_code') ? (
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
                  ) : null}
                </CardContent>
              </Card>

              {kindDefs.some((def) => isVisible(def.key)) ? (
                <Card>
                  <CardHeader className="border-b bg-muted/20 pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-bold">
                      {React.createElement(KIND_ICONS[config.icon], { className: 'h-4 w-4 text-primary' })}
                      {`2. ${config.detailsTitle}`}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
                    {kindDefs
                      .filter((def) => isVisible(def.key))
                      .map((def) => {
                        const hint = config.fields.find((field) => field.key === def.key)
                        const options = listOptions[def.key]
                        const value = state.details[def.key] ?? ''
                        return (
                          <div key={def.key} className={hint?.wide ? 'sm:col-span-2' : undefined}>
                            <Field label={def.label}>
                              {options ? (
                                <Select value={value} onValueChange={(next) => updateDetail(def.key, next)}>
                                  <SelectTrigger>
                                    <SelectValue placeholder={t('cc_products.form.select', 'Select')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {options.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input
                                  value={value}
                                  onChange={(event) => updateDetail(def.key, event.target.value)}
                                  placeholder={hint?.placeholder}
                                  inputMode={isNumericField(def) ? 'decimal' : undefined}
                                />
                              )}
                            </Field>
                          </div>
                        )
                      })}
                  </CardContent>
                </Card>
              ) : null}
            </div>

            <div className="space-y-6 lg:col-span-4">
              <Card>
                <CardHeader className="border-b bg-muted/20 pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm font-bold">
                    <Receipt className="h-4 w-4 text-primary" />
                    {t('cc_products.form.stockTax', '3. Unit, Stock & Tax')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-4">
                  <Field label={t('cc_products.form.unit', 'Unit')} required>
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
                  {isVisible('product_type') ? (
                    <Field label={t('cc_products.form.productType', 'Product Type')}>
                      <Select value={state.productType} onValueChange={(productType) => update({ productType })}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('cc_products.form.select', 'Select')} />
                        </SelectTrigger>
                        <SelectContent>
                          {loaded.productTypes.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : null}
                  {isVisible('batch_method') ? (
                    <Field label={t('cc_products.form.batchMethod', 'Batch Consumption Method')}>
                      <Select value={state.strategy} onValueChange={(strategy) => update({ strategy })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STRATEGY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : null}
                  {isVisible('min_stock') ? (
                    <Field label={t('cc_products.form.minStock', 'Minimum Stock ({unit})', { unit: state.unit })}>
                      <Input
                        value={state.minStock}
                        onChange={(event) => update({ minStock: event.target.value })}
                        inputMode="decimal"
                        placeholder="0"
                      />
                    </Field>
                  ) : null}
                  {isVisible('gst') ? (
                    <Field label={t('cc_products.form.gst', 'GST')}>
                      <Select value={state.taxRateId} onValueChange={(taxRateId) => update({ taxRateId })}>
                        <SelectTrigger>
                          <SelectValue placeholder={t('cc_products.form.gstPlaceholder', 'Select GST')} />
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
                  ) : null}
                  {isVisible('hsn') ? (
                    <Field label={t('cc_products.form.hsn', 'HSN Code')}>
                      <Input value={state.hsnCode} onChange={(event) => update({ hsnCode: event.target.value })} placeholder="e.g. 3304" />
                    </Field>
                  ) : null}
                </CardContent>
              </Card>

              {isVisible('selling_price') || isVisible('cost_price') ? (
                <Card>
                  <CardHeader className="border-b bg-muted/20 pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm font-bold">
                      <IndianRupee className="h-4 w-4 text-primary" />
                      {t('cc_products.form.pricing', '4. Pricing')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid grid-cols-2 gap-4 pt-4">
                    {isVisible('selling_price') ? (
                      <Field label={t('cc_products.form.sellingPrice', 'Selling Price (₹)')}>
                        <Input
                          value={state.sellingPrice}
                          onChange={(event) => update({ sellingPrice: event.target.value })}
                          inputMode="decimal"
                          placeholder="0.00"
                        />
                      </Field>
                    ) : null}
                    {isVisible('cost_price') ? (
                      <Field label={t('cc_products.form.costPrice', 'Cost Price (₹)')}>
                        <Input
                          value={state.costPrice}
                          onChange={(event) => update({ costPrice: event.target.value })}
                          inputMode="decimal"
                          placeholder="0.00"
                        />
                      </Field>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

            </div>
          </div>
        </form>
        <FieldsPanel
          open={panelOpen}
          onOpenChange={setPanelOpen}
          kind={kind}
          fields={panelFields}
          defs={defs}
          hidden={hidden}
          onHiddenSaved={setHidden}
          onDefinitionsChanged={reloadDefinitions}
        />
      </PageBody>
    </Page>
  )
}

export default ProductForm
