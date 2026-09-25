import type { EntityManager } from '@mikro-orm/postgresql'
import { Dictionary, DictionaryEntry, type DictionaryManagerVisibility } from '@open-mercato/core/modules/dictionaries/data/entities'
import { CustomFieldEntityConfig } from '@open-mercato/core/modules/entities/data/entities'
import { E } from '@/.mercato/generated/entities.ids.generated'

export type DermatSalesFlowSeedScope = { tenantId: string; organizationId: string }

const CATEGORY_DEFAULTS: Array<{ value: string; label: string }> = [
  { value: 'Serum', label: 'Face Serum' },
  { value: 'Cream', label: 'Face Cream / Moisturizer' },
  { value: 'Lotion', label: 'Body Lotion / Milk' },
  { value: 'Gel', label: 'Treatment Gel / Salicylic' },
  { value: 'Face Wash', label: 'Cleanser / Face Wash' },
  { value: 'Sunscreen', label: 'Sunscreen Gel / Lotion SPF' },
  { value: 'Toner', label: 'Facial Toner / Mist' },
  { value: 'Shampoo', label: 'Hair Care / Shampoo / Conditioner' },
  { value: 'Mask', label: 'Face Mask / Peeling Solution' },
  { value: 'Oil', label: 'Face / Hair Oil' },
]

const PACKAGING_TYPE_DEFAULTS: Array<{ value: string; label: string }> = [
  { value: 'Bottle', label: 'Bottle (Dropper / Pump / Flip-top)' },
  { value: 'Jar', label: 'Jar (Glass / Acrylic / PP)' },
  { value: 'Tube', label: 'Tube (Lami / Aluminum / Plastic)' },
  { value: 'Dropper', label: 'Glass Dropper Bottle' },
  { value: 'Pump', label: 'Airless Pump Bottle' },
  { value: 'Sachet', label: 'Sachet / Single Use' },
  { value: 'Custom', label: 'Custom Packaging' },
]

export const DERMAT_DICTIONARY_DEFAULTS: Record<string, { name: string; description: string; entries: Array<{ value: string; label: string }> }> = {
  category: {
    name: 'Product category',
    description: 'Cosmetics product categories used on sales order lines.',
    entries: CATEGORY_DEFAULTS,
  },
  packaging_type: {
    name: 'Packaging type',
    description: 'Primary packaging types used on sales orders.',
    entries: PACKAGING_TYPE_DEFAULTS,
  },
}

async function seedDictionary(
  em: EntityManager,
  scope: DermatSalesFlowSeedScope,
  key: string,
  def: { name: string; description: string; entries: Array<{ value: string; label: string }> },
) {
  let dictionary = await em.findOne(Dictionary, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    key,
    deletedAt: null,
  })
  if (!dictionary) {
    dictionary = em.create(Dictionary, {
      key,
      name: def.name,
      description: def.description,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      isSystem: true,
      isActive: true,
      managerVisibility: 'default' satisfies DictionaryManagerVisibility,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(dictionary)
    await em.flush()
  }
  const existingEntries = await em.find(DictionaryEntry, {
    dictionary,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  })
  const existingMap = new Map(existingEntries.map((entry) => [entry.value.toLowerCase(), entry]))
  let position = existingEntries.length
  for (const item of def.entries) {
    const normalized = item.value.toLowerCase()
    if (existingMap.has(normalized)) continue
    const entry = em.create(DictionaryEntry, {
      dictionary,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      value: item.value,
      normalizedValue: normalized,
      label: item.label,
      color: null,
      icon: null,
      position,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    em.persist(entry)
    position += 1
  }
  await em.flush()
}

export async function seedDermatSalesFlowDictionaries(
  em: EntityManager,
  scope: DermatSalesFlowSeedScope,
) {
  for (const [key, def] of Object.entries(DERMAT_DICTIONARY_DEFAULTS)) {
    await seedDictionary(em, scope, key, def)
  }
}

// Product Management screen (Dermat legacy "Procuzy" parity) — the four
// category-driven custom-field groupings on the unified catalog product
// entity. Raw Material / Packing Material / Finished Goods / Bulk share the
// same underlying product row; a fieldset only changes which custom fields
// render for a given "Select Category" value (see CrudForm's
// `customFieldsetBindings`, singleFieldsetPerRecord mode). Fieldsets are a
// runtime/DB-backed concept (`custom_field_entity_configs.config_json`,
// managed by packages/core/src/modules/entities/lib/fieldsets.ts), not a
// ce.ts-declarable one, so they are seeded here the same way Dictionary
// entries are seeded above.
export const DERMAT_PRODUCT_FIELDSETS = [
  { code: 'raw_material', label: 'Raw Material' },
  { code: 'packing_material', label: 'Packing Material' },
  { code: 'finished_goods', label: 'Finished Goods' },
  { code: 'bulk', label: 'Bulk' },
  { code: 'rnd', label: 'R&D / Trial' },
] as const

export async function seedDermatProductFieldsets(
  em: EntityManager,
  scope: DermatSalesFlowSeedScope,
) {
  const entityId = E.catalog.catalog_product
  const existing = await em.findOne(CustomFieldEntityConfig, {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    entityId,
    deletedAt: null,
  })
  const desiredFieldsets = DERMAT_PRODUCT_FIELDSETS.map((fs) => ({ code: fs.code, label: fs.label }))
  if (existing) {
    const config = (existing.configJson ?? {}) as { fieldsets?: Array<{ code?: string }> }
    const currentCodes = new Set(
      Array.isArray(config.fieldsets)
        ? config.fieldsets.map((fs) => (typeof fs.code === 'string' ? fs.code : '')).filter(Boolean)
        : [],
    )
    const missing = desiredFieldsets.filter((fs) => !currentCodes.has(fs.code))
    if (missing.length === 0) return
    existing.configJson = {
      ...config,
      fieldsets: [...(Array.isArray(config.fieldsets) ? config.fieldsets : []), ...missing],
      singleFieldsetPerRecord: (config as { singleFieldsetPerRecord?: boolean }).singleFieldsetPerRecord ?? true,
    }
    existing.updatedAt = new Date()
    em.persist(existing)
    await em.flush()
    return
  }
  const row = em.create(CustomFieldEntityConfig, {
    entityId,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    configJson: {
      fieldsets: desiredFieldsets,
      singleFieldsetPerRecord: true,
    },
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  em.persist(row)
  await em.flush()
}
