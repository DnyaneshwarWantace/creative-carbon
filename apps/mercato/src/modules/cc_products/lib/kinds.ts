export const PRODUCT_KINDS = [
  { code: 'chemical', label: 'Chemicals' },
  { code: 'reinforcement', label: 'Reinforcement' },
  { code: 'chindi', label: 'Chindi' },
  { code: 'resin', label: 'Resin' },
  { code: 'bstage', label: 'B-stage' },
  { code: 'laminate', label: 'Sheets, Tubes & Rods' },
  { code: 'moulded', label: 'Moulded Parts' },
  { code: 'bought_in', label: 'Bought-in & Consumables' },
] as const

export type ProductKind = (typeof PRODUCT_KINDS)[number]['code']

export const KIND_SUBCATEGORIES: Record<ProductKind, string[]> = {
  chemical: [],
  reinforcement: ['Paper', 'Cloth'],
  chindi: [],
  resin: [],
  bstage: [],
  laminate: ['Sheet', 'Tube', 'Rod'],
  moulded: [],
  bought_in: ['Bought-in finished goods', 'Consumables'],
}

export type UnitDefinition = { code: string; label: string; uqc: string }

export const CC_UNITS: UnitDefinition[] = [
  { code: 'kg', label: 'Kilo Grams', uqc: 'KGS' },
  { code: 'nos', label: 'Numbers', uqc: 'NOS' },
  { code: 'roll', label: 'Rolls', uqc: 'ROL' },
  { code: 'l', label: 'Liter', uqc: 'LTR' },
]

export const CC_WAREHOUSE = { code: 'CCCPL', name: 'Creative Carbon Composites' }

export const SELLABLE_KINDS = new Set<ProductKind>(['laminate', 'moulded', 'bstage', 'bought_in'])

export const PURCHASED_KIND_LIST: ProductKind[] = ['chemical', 'reinforcement', 'chindi', 'bstage', 'bought_in']

export const PURCHASED_KINDS = new Set<ProductKind>(PURCHASED_KIND_LIST)
