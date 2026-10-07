import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { ProductKind } from './kinds'

export const PRODUCT_ENTITY_ID = 'catalog:catalog_product'

export const COMMON_FIELD_KEYS = new Set(['item_code', 'hsn_code', 'product_type', 'selling_price', 'cost_price', 'purchase_uom'])

const NUMERIC_KINDS = new Set(['integer', 'float', 'currency'])

export type ProductFieldDef = {
  key: string
  kind: string
  label: string
  fieldsets: string[]
  dictionaryId: string | null
  options: string[]
  listVisible: boolean
  filterable: boolean
}

type RawDef = {
  key?: string
  kind?: string
  label?: string
  fieldset?: string
  fieldsets?: string[]
  dictionaryId?: string
  options?: Array<string | number | { value?: string | number }>
  listVisible?: boolean
  filterable?: boolean
  formEditable?: boolean
}

export function isNumericField(def: ProductFieldDef): boolean {
  return NUMERIC_KINDS.has(def.kind)
}

export async function loadProductFieldDefs(): Promise<ProductFieldDef[]> {
  const call = await apiCall<{ items?: RawDef[] }>(
    `/api/entities/definitions?entityId=${encodeURIComponent(PRODUCT_ENTITY_ID)}`,
    undefined,
    { fallback: { items: [] } },
  )
  return (call.result?.items ?? [])
    .filter((raw) => typeof raw.key === 'string' && raw.formEditable !== false)
    .map((raw) => ({
      key: String(raw.key),
      kind: raw.kind ?? 'text',
      label: raw.label || String(raw.key),
      fieldsets: raw.fieldsets?.length ? raw.fieldsets : raw.fieldset ? [raw.fieldset] : [],
      dictionaryId: raw.dictionaryId ?? null,
      options: (raw.options ?? []).map((option) =>
        typeof option === 'object' && option !== null ? String(option.value ?? '') : String(option),
      ),
      listVisible: Boolean(raw.listVisible),
      filterable: Boolean(raw.filterable),
    }))
}

export function fieldsForKind(defs: ProductFieldDef[], kind: ProductKind, preferredOrder: string[]): ProductFieldDef[] {
  const own = defs.filter((def) => !COMMON_FIELD_KEYS.has(def.key) && def.fieldsets.includes(kind))
  const rank = (key: string) => {
    const index = preferredOrder.indexOf(key)
    return index === -1 ? preferredOrder.length : index
  }
  return own.sort((a, b) => rank(a.key) - rank(b.key) || a.label.localeCompare(b.label))
}

export function fieldsFromOtherKinds(defs: ProductFieldDef[], kind: ProductKind): ProductFieldDef[] {
  return defs
    .filter((def) => !COMMON_FIELD_KEYS.has(def.key) && def.fieldsets.length > 0 && !def.fieldsets.includes(kind))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function buildDefinitionPayload(def: ProductFieldDef, fieldsets: string[]) {
  const configJson: Record<string, unknown> = {
    label: def.label,
    fieldsets,
    formEditable: true,
    listVisible: def.listVisible,
    filterable: def.filterable,
  }
  if (def.dictionaryId) configJson.dictionaryId = def.dictionaryId
  if (def.options.length) configJson.options = def.options
  return { entityId: PRODUCT_ENTITY_ID, key: def.key, kind: def.kind, configJson }
}

export function fieldKeyFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60)
}
