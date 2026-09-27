import type { EntityManager } from '@mikro-orm/postgresql'
import { Dictionary, DictionaryEntry, type DictionaryManagerVisibility } from '@open-mercato/core/modules/dictionaries/data/entities'
import { CustomFieldEntityConfig } from '@open-mercato/core/modules/entities/data/entities'
import { CatalogProductCategory } from '@open-mercato/core/modules/catalog/data/entities'
import { rebuildCategoryHierarchyForOrganization } from '@open-mercato/core/modules/catalog/lib/categoryHierarchy'
import { Warehouse, WarehouseLocation } from '@open-mercato/core/modules/wms/data/entities'
import { SalesTaxRate } from '@open-mercato/core/modules/sales/data/entities'
import { E } from '@/.mercato/generated/entities.ids.generated'
import {
  DERMAT_STORES,
  DERMAT_UNITS,
  DERMAT_WAREHOUSE,
  KIND_SUBCATEGORIES,
  PRODUCT_KINDS,
} from './kinds'

export type DermatSeedScope = { tenantId: string; organizationId: string }

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const GENERIC_UNIT_CODES = new Set([
  'box', 'cl', 'cm', 'cm2', 'day', 'dozen', 'ft', 'ft2', 'gb', 'hour', 'in', 'km', 'kwh', 'lb', 'license',
  'm', 'm2', 'm3', 'mb', 'mg', 'min', 'month', 'oz', 'pair', 'pkg', 'qtl', 'roll', 'seat', 'sec', 'set',
  'tb', 'ton', 'unit', 'week', 'year',
])

export async function seedDermatUnits(em: EntityManager, scope: DermatSeedScope) {
  let dictionary = await em.findOne(Dictionary, { ...scope, key: 'unit', deletedAt: null })
  if (!dictionary) {
    dictionary = em.create(Dictionary, {
      key: 'unit',
      name: 'Units of measure',
      description: 'Units used for Dermat products, stock and documents.',
      ...scope,
      isSystem: true,
      isActive: true,
      managerVisibility: 'default' satisfies DictionaryManagerVisibility,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(dictionary)
    await em.flush()
  }
  const wanted = new Map(DERMAT_UNITS.map((unit, index) => [unit.code, { ...unit, index }]))
  const existing = await em.find(DictionaryEntry, { dictionary, ...scope })
  for (const entry of existing) {
    const unit = wanted.get(entry.normalizedValue)
    if (!unit) {
      if (GENERIC_UNIT_CODES.has(entry.normalizedValue)) em.remove(entry)
      continue
    }
    entry.label = `${unit.label} (${unit.uqc})`
    entry.position = unit.index
    wanted.delete(entry.normalizedValue)
  }
  for (const unit of wanted.values()) {
    em.persist(
      em.create(DictionaryEntry, {
        dictionary,
        ...scope,
        value: unit.code,
        normalizedValue: unit.code,
        label: `${unit.label} (${unit.uqc})`,
        color: null,
        icon: null,
        position: unit.index,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    )
  }
  await em.flush()
}

export async function seedDermatProductKinds(em: EntityManager, scope: DermatSeedScope) {
  const entityId = E.catalog.catalog_product
  const fieldsets = PRODUCT_KINDS.map((kind) => ({ code: kind.code, label: kind.label }))
  const existing = await em.findOne(CustomFieldEntityConfig, { ...scope, entityId, deletedAt: null })
  if (existing) {
    const config = (existing.configJson ?? {}) as Record<string, unknown>
    existing.configJson = { ...config, fieldsets, singleFieldsetPerRecord: true }
    existing.updatedAt = new Date()
  } else {
    em.persist(
      em.create(CustomFieldEntityConfig, {
        entityId,
        ...scope,
        configJson: { fieldsets, singleFieldsetPerRecord: true },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    )
  }
  await em.flush()
}

async function ensureCategory(
  em: EntityManager,
  scope: DermatSeedScope,
  name: string,
  parentId: string | null,
  kind: string,
): Promise<CatalogProductCategory> {
  const existing = await em.findOne(CatalogProductCategory, { ...scope, name, deletedAt: null })
  if (existing) {
    existing.parentId = parentId
    existing.metadata = { ...(existing.metadata ?? {}), dermatKind: kind }
    return existing
  }
  const category = em.create(CatalogProductCategory, {
    ...scope,
    name,
    slug: parentId ? `${kind}-${slugify(name)}` : slugify(name),
    parentId,
    metadata: { dermatKind: kind },
    isActive: true,
    depth: 0,
    ancestorIds: [],
    childIds: [],
    descendantIds: [],
  })
  em.persist(category)
  await em.flush()
  return category
}

export async function seedDermatCategories(em: EntityManager, scope: DermatSeedScope) {
  for (const kind of PRODUCT_KINDS) {
    const root = await ensureCategory(em, scope, kind.label, null, kind.code)
    for (const child of KIND_SUBCATEGORIES[kind.code]) {
      await ensureCategory(em, scope, child, root.id, kind.code)
    }
  }
  await em.flush()
  await rebuildCategoryHierarchyForOrganization(em, scope.organizationId, scope.tenantId)
}

export async function seedDermatStores(em: EntityManager, scope: DermatSeedScope) {
  let warehouse = await em.findOne(Warehouse, { ...scope, code: DERMAT_WAREHOUSE.code, deletedAt: null })
  if (!warehouse) {
    warehouse = em.create(Warehouse, {
      ...scope,
      code: DERMAT_WAREHOUSE.code,
      name: DERMAT_WAREHOUSE.name,
      isPrimary: true,
      isActive: true,
      country: 'IN',
      timezone: 'Asia/Kolkata',
    })
    em.persist(warehouse)
    await em.flush()
  }
  for (const code of DERMAT_STORES) {
    const existing = await em.findOne(WarehouseLocation, { ...scope, warehouse, code, deletedAt: null })
    if (existing) continue
    em.persist(em.create(WarehouseLocation, { ...scope, warehouse, code, type: 'zone', isActive: true }))
  }
  await em.flush()
}

const GST_RATES = [0, 5, 12, 18, 28]

export async function seedDermatGstRates(em: EntityManager, scope: DermatSeedScope) {
  const existing = await em.find(SalesTaxRate, { ...scope, deletedAt: null })
  const now = new Date()
  for (const rate of existing) {
    if (!rate.code.startsWith('gst-')) rate.deletedAt = now
  }
  for (const value of GST_RATES) {
    const code = `gst-${value}`
    const found = existing.find((rate) => rate.code === code)
    if (found) {
      found.isDefault = value === 18
      continue
    }
    em.persist(
      em.create(SalesTaxRate, {
        ...scope,
        name: `GST ${value}%`,
        code,
        rate: String(value),
        countryCode: 'IN',
        isDefault: value === 18,
        priority: 0,
        isCompound: false,
        createdAt: now,
        updatedAt: now,
      }),
    )
  }
  await em.flush()
}

const PRODUCT_TYPES = ['Storable', 'Consumable']

async function seedDictionary(
  em: EntityManager,
  scope: DermatSeedScope,
  definition: { key: string; name: string; description: string; values: readonly string[] },
) {
  let dictionary = await em.findOne(Dictionary, { ...scope, key: definition.key, deletedAt: null })
  if (!dictionary) {
    dictionary = em.create(Dictionary, {
      key: definition.key,
      name: definition.name,
      description: definition.description,
      ...scope,
      isSystem: false,
      isActive: true,
      managerVisibility: 'default' satisfies DictionaryManagerVisibility,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(dictionary)
    await em.flush()
  }
  const existing = await em.find(DictionaryEntry, { dictionary, ...scope })
  const present = new Set(existing.map((entry) => entry.normalizedValue))
  definition.values.forEach((value, index) => {
    const normalized = value.toLowerCase()
    if (present.has(normalized)) return
    em.persist(
      em.create(DictionaryEntry, {
        dictionary,
        ...scope,
        value,
        normalizedValue: normalized,
        label: value,
        color: null,
        icon: null,
        position: index,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    )
  })
  await em.flush()
}

export async function seedDermatProductTypes(em: EntityManager, scope: DermatSeedScope) {
  await seedDictionary(em, scope, {
    key: 'product_type',
    name: 'Product type',
    description: 'How a product is stocked (Storable, Consumable).',
    values: PRODUCT_TYPES,
  })
}

export async function seedDermatProducts(em: EntityManager, scope: DermatSeedScope) {
  await seedDermatUnits(em, scope)
  await seedDermatProductTypes(em, scope)
  await seedDermatGstRates(em, scope)
  await seedDermatProductKinds(em, scope)
  await seedDermatCategories(em, scope)
  await seedDermatStores(em, scope)
}
