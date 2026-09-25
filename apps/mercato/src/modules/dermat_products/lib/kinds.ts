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
  { code: 'kg', label: 'Kilo Grams', uqc: 'KGS' },
  { code: 'g', label: 'Grams', uqc: 'GMS' },
  { code: 'l', label: 'Liter', uqc: 'LTR' },
  { code: 'ml', label: 'Milliliter', uqc: 'MLT' },
  { code: 'nos', label: 'Numbers', uqc: 'NOS' },
  { code: 'pc', label: 'Pieces', uqc: 'PCS' },
]

export const DERMAT_WAREHOUSE = { code: 'DERMAT', name: 'Dermat India' }

export const DERMAT_STORES = ['RM-STORE', 'PM-STORE', 'PRODUCTION', 'FG-STORE'] as const
