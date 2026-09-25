/**
 * Single source of truth for which customer (company profile) custom fields the
 * Add Customer form shows — the customers list derives its columns from the same
 * rules, so a field added to the form appears as a column and a field removed or
 * hidden from the form disappears from the list.
 */

export const COMPANY_FORM_BUILT_IN_KEYS = [
  'legal_trade_name',
  'customer_type_category',
  'gst_registration_type',
  'gstin',
  'sales_manager',
  'payment_terms',
  'payment_remarks',
] as const

export const COMPANY_FORM_IGNORED_KEYS: ReadonlySet<string> = new Set([
  'default_currency',
  'currency',
  'tally_address_type_billing',
  'tally_address_type_shipping',
  'address',
  'gst_number',
  'sales_poc',
  'customer_type',
  'relationship_health',
  'renewal_quarter',
  'executive_notes',
  'customer_marketing_case',
  'pan',
])

const builtInKeys: ReadonlySet<string> = new Set(COMPANY_FORM_BUILT_IN_KEYS)

export const COMPANY_FORM_RENDERED_SEPARATELY_KEYS: ReadonlySet<string> = new Set([
  ...COMPANY_FORM_BUILT_IN_KEYS,
  ...COMPANY_FORM_IGNORED_KEYS,
])

type FieldDefLike = { key: string; isActive?: boolean | null; formEditable?: boolean | null }

function isShownOnForm(def: FieldDefLike): boolean {
  return def.isActive !== false && def.formEditable !== false
}

/** Custom field keys the Add Customer form captures, in form order. */
export function companyFormFieldKeys(defs: FieldDefLike[]): string[] {
  const active = defs.filter(isShownOnForm)
  const activeKeys = new Set(active.map((def) => def.key))
  const builtIns = COMPANY_FORM_BUILT_IN_KEYS.filter((key) => activeKeys.has(key))
  const extras = active
    .map((def) => def.key)
    .filter((key, index, keys) => keys.indexOf(key) === index)
    .filter((key) => !builtInKeys.has(key) && !COMPANY_FORM_IGNORED_KEYS.has(key))
  return [...builtIns, ...extras]
}
