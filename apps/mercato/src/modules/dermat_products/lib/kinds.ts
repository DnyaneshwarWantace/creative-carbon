export const PRODUCT_KINDS = [
  { code: 'raw_material', label: 'Raw Material' },
  { code: 'packing_material', label: 'Packing Material' },
  { code: 'bulk', label: 'Bulk' },
  { code: 'finished_goods', label: 'Finished Goods' },
  { code: 'rnd', label: 'R&D' },
] as const

export type ProductKind = (typeof PRODUCT_KINDS)[number]['code']

export const KIND_SUBCATEGORIES: Record<ProductKind, string[]> = {
  raw_material: ['Actives', 'Excipients', 'Fragrance', 'Colour', 'Preservatives'],
  packing_material: [
    'Bottles',
    'Bottle Set',
    'Caps',
    'Pumps',
    'Droppers',
    'Jars',
    'Tubes',
    'Labels',
    'Cartons',
    'Leaflets',
    'Spatula',
    'Tray',
    'Shipper',
  ],
  bulk: [],
  finished_goods: ['Cleanser', 'Cream', 'Facewash', 'Gel', 'Moisturiser', 'Serum', 'Sunscreen'],
  rnd: [],
}

export type UnitDefinition = { code: string; label: string; uqc: string }

export const DERMAT_UNITS: UnitDefinition[] = [
  { code: 'g', label: 'Grams', uqc: 'GMS' },
  { code: 'kg', label: 'Kilo Grams', uqc: 'KGS' },
  { code: 'ton', label: 'Tonnes', uqc: 'TON' },
  { code: 'qtl', label: 'Quintals', uqc: 'QTL' },
  { code: 'ml', label: 'Milliliter', uqc: 'MLT' },
  { code: 'l', label: 'Liter', uqc: 'LTR' },
  { code: 'nos', label: 'Numbers', uqc: 'NOS' },
  { code: 'pc', label: 'Pieces', uqc: 'PCS' },
  { code: 'dozen', label: 'Dozen', uqc: 'DOZ' },
  { code: 'pair', label: 'Pairs', uqc: 'PRS' },
  { code: 'box', label: 'Box', uqc: 'BOX' },
  { code: 'roll', label: 'Roll', uqc: 'ROL' },
  { code: 'set', label: 'Set', uqc: 'SET' },
]

export type UnitTemplate = { baseUnit: string; conversions: Array<{ unitCode: string; toBaseFactor: number }> }

const WEIGHT_TEMPLATE: UnitTemplate = {
  baseUnit: 'kg',
  conversions: [
    { unitCode: 'g', toBaseFactor: 0.001 },
    { unitCode: 'ton', toBaseFactor: 1000 },
    { unitCode: 'qtl', toBaseFactor: 100 },
  ],
}

const COUNT_TEMPLATE: UnitTemplate = {
  baseUnit: 'nos',
  conversions: [
    { unitCode: 'dozen', toBaseFactor: 12 },
    { unitCode: 'pair', toBaseFactor: 2 },
  ],
}

export const KIND_UNIT_TEMPLATES: Record<ProductKind, UnitTemplate> = {
  raw_material: WEIGHT_TEMPLATE,
  bulk: WEIGHT_TEMPLATE,
  rnd: WEIGHT_TEMPLATE,
  packing_material: COUNT_TEMPLATE,
  finished_goods: { baseUnit: 'nos', conversions: [{ unitCode: 'dozen', toBaseFactor: 12 }] },
}

export const DERMAT_WAREHOUSE = { code: 'DERMAT', name: 'Dermat India' }

export const DERMAT_STORES = ['RM-STORE', 'PM-STORE', 'PRODUCTION', 'FG-STORE'] as const
