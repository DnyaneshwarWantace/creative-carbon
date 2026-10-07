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

export const CC_UNITS: UnitDefinition[] = [
  { code: 'kg', label: 'Kilo Grams', uqc: 'KGS' },
  { code: 'g', label: 'Grams', uqc: 'GMS' },
  { code: 'l', label: 'Liter', uqc: 'LTR' },
  { code: 'ml', label: 'Milliliter', uqc: 'MLT' },
  { code: 'nos', label: 'Numbers', uqc: 'NOS' },
  { code: 'pc', label: 'Pieces', uqc: 'PCS' },
]

export const CC_WAREHOUSE = { code: 'CCCPL', name: 'Creative Carbon Composites' }

export const CC_STORES = ['RM-STORE', 'PM-STORE', 'PRODUCTION', 'FG-STORE'] as const

export const PACKING_ITEM_DICTIONARY = 'packing_item_type'

export const PACKING_ITEM_TYPES = ['Carton', 'Label', 'Tube', 'Bottle', 'Bottle Set', 'Jar', 'Cap', 'Pump', 'Dropper', 'Leaflet', 'Tray', 'Shipper'] as const
