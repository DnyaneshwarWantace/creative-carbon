import type { ProductKind } from './kinds'

export type KindField = {
  key: string
  label: string
  type: 'text' | 'number' | 'select'
  options?: string[]
  required?: boolean
  layout?: 'full' | 'half' | 'third'
}

export type KindColumn = { key: string; label: string }

export type KindConfig = {
  kind: ProductKind
  title: string
  singular: string
  slug: string
  nameLabel: string
  codeLabel: string
  fields: KindField[]
  columns: KindColumn[]
  tracksExpiry: boolean
}

const PURCHASE_FIELDS: KindField[] = [
  { key: 'make_brand', label: 'Make / Brand', type: 'text', layout: 'half' },
  { key: 'supplier', label: 'Supplier', type: 'text', layout: 'half' },
  { key: 'old_code', label: 'Old Code', type: 'text', layout: 'half' },
  { key: 'grn_excess_percent', label: '% Excess GRN Allowed', type: 'number', layout: 'half' },
]

export const KIND_CONFIG: Record<ProductKind, KindConfig> = {
  raw_material: {
    kind: 'raw_material',
    title: 'Raw Materials',
    singular: 'Raw Material',
    slug: 'raw-materials',
    nameLabel: 'Name',
    codeLabel: 'Code (e.g. AP-070, EP-181, FC-005)',
    fields: [
      { key: 'inci_name', label: 'INCI Name', type: 'text', layout: 'full' },
      { key: 'benefit', label: 'Benefit / Function', type: 'text', layout: 'half' },
      { key: 'alternative', label: 'Alternative Material', type: 'text', layout: 'half' },
      { key: 'solubility', label: 'Solubility', type: 'select', options: ['Oil soluble', 'Water soluble'], layout: 'half' },
      { key: 'physical_state', label: 'Physical State', type: 'select', options: ['Solid', 'Liquid', 'Semi-solid', 'Powder', 'Gel', 'Paste'], layout: 'half' },
      ...PURCHASE_FIELDS,
    ],
    columns: [
      { key: 'inci_name', label: 'INCI Name' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'make_brand', label: 'Make / Brand' },
      { key: 'benefit', label: 'Benefit' },
    ],
    tracksExpiry: true,
  },
  packing_material: {
    kind: 'packing_material',
    title: 'Packing Materials',
    singular: 'Packing Material',
    slug: 'packing-materials',
    nameLabel: 'Name',
    codeLabel: 'Packing Code (e.g. CP-001, BR-016)',
    fields: [
      { key: 'printed', label: 'Printed / Non-printed', type: 'select', options: ['Printed', 'Non-printed'], layout: 'half' },
      { key: 'capacity', label: 'Size / Capacity', type: 'text', layout: 'half' },
      { key: 'cap_colour', label: 'Cap Colour', type: 'text', layout: 'half' },
      { key: 'body_colour', label: 'Body Colour', type: 'text', layout: 'half' },
      { key: 'shape', label: 'Shape', type: 'select', options: ['Round', 'Oval'], layout: 'half' },
      { key: 'finish', label: 'Finish', type: 'select', options: ['Matt', 'Glossy'], layout: 'half' },
      { key: 'decoration', label: 'Leafing / UV / Foiling', type: 'text', layout: 'full' },
      { key: 'brand_name', label: 'Brand Name (printed items)', type: 'text', layout: 'half' },
      ...PURCHASE_FIELDS,
    ],
    columns: [
      { key: 'capacity', label: 'Capacity' },
      { key: 'printed', label: 'Printed' },
      { key: 'supplier', label: 'Supplier' },
    ],
    tracksExpiry: false,
  },
  bulk: {
    kind: 'bulk',
    title: 'Bulk',
    singular: 'Bulk',
    slug: 'bulk',
    nameLabel: 'Bulk Name',
    codeLabel: 'Code',
    fields: [
      { key: 'rd_number', label: 'R&D No.', type: 'text', layout: 'half' },
      { key: 'physical_state', label: 'Physical State', type: 'select', options: ['Solid', 'Liquid', 'Semi-solid', 'Powder', 'Gel', 'Paste'], layout: 'half' },
      { key: 'density', label: 'Density (g per ml)', type: 'number', layout: 'half' },
    ],
    columns: [
      { key: 'rd_number', label: 'R&D No.' },
      { key: 'physical_state', label: 'Physical State' },
    ],
    tracksExpiry: true,
  },
  finished_goods: {
    kind: 'finished_goods',
    title: 'Finished Goods',
    singular: 'Finished Good',
    slug: 'finished-goods',
    nameLabel: 'Product Name',
    codeLabel: 'Code',
    fields: [
      { key: 'brand_name', label: 'Brand Name', type: 'text', layout: 'half' },
      { key: 'mrp', label: 'MRP (₹)', type: 'number', layout: 'half' },
      { key: 'pack_size', label: 'Pack Size', type: 'number', layout: 'half' },
      { key: 'pack_unit', label: 'Pack Unit', type: 'select', options: ['ml', 'g', 'kg', 'l', 'nos'], layout: 'half' },
      { key: 'fragrance', label: 'Fragrance', type: 'text', layout: 'half' },
      { key: 'colour', label: 'Colour', type: 'text', layout: 'half' },
      { key: 'density', label: 'Density (g per ml)', type: 'number', layout: 'half' },
    ],
    columns: [
      { key: 'brand_name', label: 'Brand' },
      { key: 'pack_size', label: 'Pack Size' },
      { key: 'pack_unit', label: 'Pack Unit' },
      { key: 'mrp', label: 'MRP' },
    ],
    tracksExpiry: true,
  },
  rnd: {
    kind: 'rnd',
    title: 'R&D Samples',
    singular: 'R&D Sample',
    slug: 'rnd-samples',
    nameLabel: 'Sample Name',
    codeLabel: 'Code',
    fields: [
      { key: 'rd_number', label: 'R&D No.', type: 'text', layout: 'half' },
      { key: 'brand_name', label: 'Brand Name', type: 'text', layout: 'half' },
    ],
    columns: [
      { key: 'rd_number', label: 'R&D No.' },
      { key: 'brand_name', label: 'Brand' },
    ],
    tracksExpiry: false,
  },
}

export function kindFromSlug(slug: string | undefined | null): ProductKind | null {
  const match = Object.values(KIND_CONFIG).find((config) => config.slug === slug)
  return match ? match.kind : null
}
