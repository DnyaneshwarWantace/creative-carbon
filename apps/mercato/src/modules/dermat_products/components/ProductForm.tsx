"use client"

import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Page, PageBody } from '@open-mercato/ui/backend/Page'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrud, deleteCrud, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { DERMAT_UNITS, KIND_UNIT_TEMPLATES, PRODUCT_KINDS, type ProductKind } from '../lib/kinds'
import { KIND_CONFIG } from '../lib/kindConfig'
import { UnitTable, type UnitConversionDraft, type UnitOption, type UnitsValue } from './UnitTable'

type CategoryNode = { id: string; name: string; parentId: string | null; children?: CategoryNode[]; descendantIds?: string[] }
type TaxRate = { id: string; name: string; rate?: string | number | null; is_default?: boolean; isDefault?: boolean }
type ListResponse<T> = { items?: T[] }
type Row = Record<string, unknown>

type Options = {
  categories: UnitOption[]
  rootCategoryId: string | null
  taxRates: UnitOption[]
  defaultTaxRateId: string | null
  units: UnitOption[]
}

type LoadedRecord = {
  values: Record<string, unknown>
  conversionIds: Map<string, string>
  profileId: string | null
  updatedAt: string | null
}

function read(row: Row | undefined, ...keys: string[]): unknown {
  if (!row) return undefined
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null) return row[key]
  }
  const custom = row.customFields
  if (custom && typeof custom === 'object') {
    for (const key of keys) {
      const bare = key.startsWith('cf_') ? key.slice(3) : key
      const value = (custom as Row)[bare]
      if (value !== undefined && value !== null) return value
    }
  }
  return undefined
}

function asText(value: unknown): string {
  if (value === undefined || value === null) return ''
  return String(value)
}

function asNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function templateUnits(kind: ProductKind): UnitsValue {
  const template = KIND_UNIT_TEMPLATES[kind]
  return {
    baseUnit: template.baseUnit,
    purchaseUnit: template.baseUnit,
    conversions: template.conversions.map((row) => ({ unitCode: row.unitCode, toBaseFactor: String(row.toBaseFactor) })),
  }
}

async function loadOptions(kind: ProductKind): Promise<Options> {
  const kindLabel = PRODUCT_KINDS.find((entry) => entry.code === kind)?.label ?? ''
  const [tree, taxes, dictionary] = await Promise.all([
    apiCall<ListResponse<CategoryNode>>('/api/catalog/categories?view=tree', undefined, { fallback: { items: [] } }),
    apiCall<ListResponse<TaxRate>>('/api/sales/tax-rates?pageSize=100', undefined, { fallback: { items: [] } }),
    apiCall<{ entries?: Array<{ value: string; label: string }> }>('/api/catalog/dictionaries/unit', undefined, {
      fallback: { entries: [] },
    }),
  ])
  const root = (tree.result?.items ?? []).find((node) => node.name === kindLabel) ?? null
  const categories = (root?.children ?? []).map((child) => ({ value: child.id, label: child.name }))
  const taxItems = taxes.result?.items ?? []
  const order = new Map(DERMAT_UNITS.map((unit, index) => [unit.code, index]))
  const units = (dictionary.result?.entries ?? [])
    .map((entry) => ({ value: entry.value, label: entry.label }))
    .sort((a, b) => (order.get(a.value) ?? 99) - (order.get(b.value) ?? 99))
  return {
    categories,
    rootCategoryId: root?.id ?? null,
    taxRates: taxItems.map((rate) => ({ value: rate.id, label: rate.name })),
    defaultTaxRateId: taxItems.find((rate) => rate.is_default || rate.isDefault)?.id ?? null,
    units,
  }
}

async function loadRecord(kind: ProductKind, productId: string): Promise<LoadedRecord> {
  const config = KIND_CONFIG[kind]
  const [productCall, conversionCall, profileCall] = await Promise.all([
    apiCall<ListResponse<Row>>(`/api/catalog/products?id=${encodeURIComponent(productId)}&pageSize=1`),
    apiCall<ListResponse<Row>>(`/api/catalog/product-unit-conversions?productId=${encodeURIComponent(productId)}&pageSize=100`),
    apiCall<ListResponse<Row>>(`/api/wms/inventory-profiles?catalogProductId=${encodeURIComponent(productId)}&pageSize=1`),
  ])
  const product = productCall.result?.items?.[0]
  if (!productCall.ok || !product) throw new Error('not-found')
  const conversionRows = conversionCall.result?.items ?? []
  const profile = profileCall.result?.items?.[0]
  const baseUnit = asText(read(product, 'default_unit', 'defaultUnit'))
  const categoryIds = read(product, 'categoryIds')
  const values: Record<string, unknown> = {
    title: asText(read(product, 'title')),
    sku: asText(read(product, 'sku')),
    itemCode: asText(read(product, 'cf_item_code')),
    categoryId: Array.isArray(categoryIds) && categoryIds.length ? String(categoryIds[0]) : '',
    taxRateId: asText(read(product, 'tax_rate_id', 'taxRateId')),
    hsnCode: asText(read(product, 'cf_hsn_code')),
    shelfLifeMonths: asText(read(product, 'cf_shelf_life_months')),
    minFloorQty: asText(read(profile, 'reorder_point', 'reorderPoint')),
    strategy: asText(read(profile, 'default_strategy', 'defaultStrategy')) || (config.tracksExpiry ? 'fefo' : 'fifo'),
    trackBatch: Boolean(read(profile, 'track_lot', 'trackLot') ?? true),
    units: {
      baseUnit,
      purchaseUnit: asText(read(product, 'cf_purchase_uom')) || baseUnit,
      conversions: conversionRows.map<UnitConversionDraft>((row) => ({
        id: asText(read(row, 'id')),
        unitCode: asText(read(row, 'unit_code', 'unitCode')),
        toBaseFactor: asText(read(row, 'to_base_factor', 'toBaseFactor')),
      })),
    } satisfies UnitsValue,
  }
  for (const field of config.fields) values[`cf_${field.key}`] = asText(read(product, `cf_${field.key}`))
  return {
    values,
    conversionIds: new Map(conversionRows.map((row) => [asText(read(row, 'unit_code', 'unitCode')), asText(read(row, 'id'))])),
    profileId: profile ? asText(read(profile, 'id')) : null,
    updatedAt: asText(read(product, 'updated_at', 'updatedAt')) || null,
  }
}

function validateUnits(units: UnitsValue, message: (key: string, fallback: string) => string) {
  if (!units.baseUnit) throw createCrudFormError(message('dermat_products.errors.baseUnit', 'Select the stock unit.'), { units: message('dermat_products.errors.baseUnit', 'Select the stock unit.') })
  const seen = new Set<string>([units.baseUnit])
  for (const row of units.conversions) {
    const factor = Number(row.toBaseFactor)
    if (!row.unitCode || seen.has(row.unitCode) || !Number.isFinite(factor) || factor <= 0) {
      const text = message('dermat_products.errors.conversion', 'Every other unit needs a different unit and a ratio above 0.')
      throw createCrudFormError(text, { units: text })
    }
    seen.add(row.unitCode)
  }
}

export function ProductForm({ kind, productId }: { kind: ProductKind; productId?: string }) {
  const t = useT()
  const config = KIND_CONFIG[kind]
  const listHref = `/backend/products?tab=${config.slug}`
  const [options, setOptions] = React.useState<Options | null>(null)
  const [record, setRecord] = React.useState<LoadedRecord | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [loadedOptions, loadedRecord] = await Promise.all([
          loadOptions(kind),
          productId ? loadRecord(kind, productId) : Promise.resolve(null),
        ])
        if (cancelled) return
        setOptions(loadedOptions)
        setRecord(loadedRecord)
      } catch {
        if (!cancelled) setLoadError(t('dermat_products.errors.load', 'Could not load this product.'))
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [kind, productId, t])

  const initialValues = React.useMemo<Record<string, unknown> | undefined>(() => {
    if (!options) return undefined
    if (record) return { ...record.values, updatedAt: record.updatedAt ?? undefined }
    return {
      taxRateId: options.defaultTaxRateId ?? '',
      strategy: config.tracksExpiry ? 'fefo' : 'fifo',
      trackBatch: true,
      units: templateUnits(kind),
    }
  }, [options, record, kind, config.tracksExpiry])

  const fields = React.useMemo<CrudField[]>(() => {
    if (!options) return []
    const base: CrudField[] = [
      { id: 'title', label: t('dermat_products.form.name', config.nameLabel), type: 'text', required: true, layout: 'full' },
      { id: 'itemCode', label: t('dermat_products.form.code', config.codeLabel), type: 'text', layout: 'half' },
      {
        id: 'categoryId',
        label: t('dermat_products.form.category', 'Category'),
        type: 'select',
        layout: 'half',
        options: options.categories,
      },
      { id: 'sku', label: t('dermat_products.form.sku', 'SKU (auto)'), type: 'text', layout: 'half', readOnly: true, disabled: true },
      { id: 'taxRateId', label: t('dermat_products.form.gst', 'GST %'), type: 'select', layout: 'half', options: options.taxRates },
      { id: 'hsnCode', label: t('dermat_products.form.hsn', 'HSN Code'), type: 'text', layout: 'half' },
      { id: 'shelfLifeMonths', label: t('dermat_products.form.shelfLife', 'Shelf Life (months)'), type: 'number', layout: 'half' },
      { id: 'minFloorQty', label: t('dermat_products.form.minFloor', 'Min Floor Qty (in stock unit)'), type: 'number', layout: 'half' },
      {
        id: 'strategy',
        label: t('dermat_products.form.strategy', 'Issue Method'),
        type: 'select',
        layout: 'half',
        options: [
          { value: 'fifo', label: t('dermat_products.form.fifo', 'FIFO — first in, first out') },
          { value: 'fefo', label: t('dermat_products.form.fefo', 'FEFO — first expiry, first out') },
        ],
      },
      { id: 'trackBatch', label: t('dermat_products.form.trackBatch', 'Track batches'), type: 'checkbox', layout: 'half' },
    ]
    const kindFields: CrudField[] = config.fields.map((field) =>
      field.type === 'select'
        ? {
            id: `cf_${field.key}`,
            label: field.label,
            type: 'select',
            layout: field.layout,
            options: (field.options ?? []).map((option) => ({ value: option, label: option })),
          }
        : { id: `cf_${field.key}`, label: field.label, type: field.type, layout: field.layout },
    )
    return [...base, ...kindFields]
  }, [options, config, t])

  const groups = React.useMemo<CrudFormGroup[]>(() => {
    if (!options) return []
    return [
      { id: 'basic', title: t('dermat_products.form.basic', 'Basic Details'), column: 1, fields: ['title', 'itemCode', 'categoryId', 'sku'] },
      {
        id: 'kind',
        title: t('dermat_products.form.kindDetails', '{kind} Details', { kind: config.singular }),
        column: 1,
        fields: config.fields.map((field) => `cf_${field.key}`),
      },
      {
        id: 'units',
        title: t('dermat_products.form.units', 'Units'),
        column: 1,
        component: ({ values, setValue, errors }) => (
          <UnitTable
            value={(values.units as UnitsValue | undefined) ?? templateUnits(kind)}
            units={options.units}
            error={errors.units}
            onChange={(next) => setValue('units', next)}
          />
        ),
      },
      {
        id: 'stock',
        title: t('dermat_products.form.stockTax', 'Stock & Tax'),
        column: 2,
        fields: ['taxRateId', 'hsnCode', 'shelfLifeMonths', 'minFloorQty', 'strategy', 'trackBatch'],
      },
    ]
  }, [options, config, kind, t])

  const handleSubmit = React.useCallback(
    async (values: Record<string, unknown>) => {
      if (!options) return
      const units = (values.units as UnitsValue | undefined) ?? templateUnits(kind)
      validateUnits(units, (key, fallback) => t(key, fallback))
      const title = asText(values.title).trim()
      const categoryId = asText(values.categoryId) || options.rootCategoryId
      const customValues: Record<string, unknown> = {
        cf_item_code: asText(values.itemCode).trim() || null,
        cf_hsn_code: asText(values.hsnCode).trim() || null,
        cf_shelf_life_months: asNumber(values.shelfLifeMonths),
        cf_purchase_uom: units.purchaseUnit || units.baseUnit,
      }
      for (const field of config.fields) {
        const raw = values[`cf_${field.key}`]
        customValues[`cf_${field.key}`] = field.type === 'number' ? asNumber(raw) : asText(raw).trim() || null
      }
      const productPayload: Record<string, unknown> = {
        title,
        taxRateId: asText(values.taxRateId) || null,
        defaultUnit: units.baseUnit,
        defaultSalesUnit: units.baseUnit,
        uomRoundingScale: 3,
        customFieldsetCode: kind,
        categoryIds: categoryId ? [categoryId] : [],
        isActive: true,
        ...customValues,
      }
      const strategy = asText(values.strategy) === 'fefo' ? 'fefo' : 'fifo'
      const profilePayload = {
        defaultUom: units.baseUnit,
        trackLot: Boolean(values.trackBatch),
        trackExpiration: strategy === 'fefo',
        defaultStrategy: strategy,
        reorderPoint: asNumber(values.minFloorQty) ?? 0,
      }

      let id = productId ?? null
      if (id) {
        await updateCrud('catalog/products', { id, ...productPayload })
      } else {
        const created = await createCrud<{ id?: string }>('catalog/products', productPayload)
        id = created.result?.id ?? null
        if (!id) throw createCrudFormError(t('dermat_products.errors.create', 'The product was not created.'))
        await createCrud('catalog/variants', { productId: id, name: title, isDefault: true, isActive: true })
      }

      const existingIds = record?.conversionIds ?? new Map<string, string>()
      const keep = new Set<string>()
      for (const [index, row] of units.conversions.entries()) {
        const existingId = row.id || existingIds.get(row.unitCode)
        const payload = { unitCode: row.unitCode, toBaseFactor: Number(row.toBaseFactor), sortOrder: index, isActive: true }
        if (existingId) {
          keep.add(existingId)
          await updateCrud('catalog/product-unit-conversions', { id: existingId, ...payload })
        } else {
          await createCrud('catalog/product-unit-conversions', { productId: id, ...payload })
        }
      }
      for (const existingId of existingIds.values()) {
        if (!keep.has(existingId)) await deleteCrud('catalog/product-unit-conversions', existingId)
      }

      if (record?.profileId) {
        await updateCrud('wms/inventory-profiles', { id: record.profileId, ...profilePayload })
      } else {
        await createCrud('wms/inventory-profiles', { catalogProductId: id, ...profilePayload })
      }
    },
    [options, kind, config, productId, record, t],
  )

  const handleDelete = React.useCallback(async () => {
    if (productId) await deleteCrud('catalog/products', productId)
  }, [productId])

  if (loadError) {
    return (
      <Page>
        <PageBody>
          <ErrorMessage label={loadError} />
        </PageBody>
      </Page>
    )
  }

  if (!options || !initialValues) {
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
        <CrudForm<Record<string, unknown>>
          title={
            productId
              ? t('dermat_products.form.editTitle', 'Edit {kind}', { kind: config.singular })
              : t('dermat_products.form.createTitle', 'New {kind}', { kind: config.singular })
          }
          backHref={listHref}
          cancelHref={listHref}
          successRedirect={listHref}
          deleteRedirect={listHref}
          fields={fields}
          groups={groups}
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onDelete={productId ? handleDelete : undefined}
          submitLabel={productId ? t('common.save', 'Save') : t('dermat_products.form.create', 'Create {kind}', { kind: config.singular })}
        />
      </PageBody>
    </Page>
  )
}

export default ProductForm
