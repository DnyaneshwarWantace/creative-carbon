import type { CustomFieldDefDto } from '@open-mercato/ui/backend/utils/customFieldDefs'

/**
 * Single source of truth for which product custom fields belong to a category.
 * A product's category is its custom fieldset (Raw Material, Packing Material,
 * Bulk, Finished Goods, R&D…). Fields without a fieldset apply to every
 * category. The product form and the product list both use this, so a field
 * added, hidden or removed through "Manage fields" changes both together.
 */

export const PRODUCT_CATEGORY_INTERNAL_KEYS: ReadonlySet<string> = new Set([
  'category',
  'product_category_group',
])

function membership(def: CustomFieldDefDto): string[] {
  if (Array.isArray(def.fieldsets) && def.fieldsets.length) {
    return def.fieldsets.filter((code): code is string => typeof code === 'string' && code.trim().length > 0)
  }
  return typeof def.fieldset === 'string' && def.fieldset.trim().length ? [def.fieldset.trim()] : []
}

function isOnForm(def: CustomFieldDefDto): boolean {
  return def.formEditable !== false && !PRODUCT_CATEGORY_INTERNAL_KEYS.has(def.key)
}

function uniqueByKey(defs: CustomFieldDefDto[]): CustomFieldDefDto[] {
  const seen = new Set<string>()
  return defs.filter((def) => {
    if (seen.has(def.key)) return false
    seen.add(def.key)
    return true
  })
}

/** Fields that show for every category (no fieldset). */
export function productCommonFields(defs: CustomFieldDefDto[]): CustomFieldDefDto[] {
  return uniqueByKey(defs.filter((def) => isOnForm(def) && membership(def).length === 0))
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
}

/** Fields shown for one category: the common fields, then that category's own fields. */
export function productCategoryFields(defs: CustomFieldDefDto[], category: string | null): CustomFieldDefDto[] {
  const common = productCommonFields(defs)
  if (!category) return common
  const own = uniqueByKey(defs.filter((def) => isOnForm(def) && membership(def).includes(category)))
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
  return [...common, ...own]
}

const LIST_COMMON_KEYS = ['base_uom']

/** Columns for the product list: base UOM, then only the category's own fields. */
export function productListFields(defs: CustomFieldDefDto[], category: string | null): CustomFieldDefDto[] {
  const common = productCommonFields(defs).filter((def) => LIST_COMMON_KEYS.includes(def.key))
  if (!category) return common
  const own = productCategoryFields(defs, category).filter((def) => membership(def).includes(category))
  return [...common, ...own]
}
