import type { ProductKind } from './kinds'

export type KindField = {
  key: string
  label: string
  placeholder?: string
  numeric?: boolean
  wide?: boolean
}

export type KindColumn = { key: string; label: string }

export type KindConfig = {
  kind: ProductKind
  title: string
  singular: string
  hint: string
  slug: string
  icon: 'flask' | 'boxes' | 'layers' | 'package' | 'sparkles'
  namePlaceholder: string
  codeLabel: string
  codeRequired: boolean
  codePlaceholder: string
  defaultUnit: string
  units: string[]
  detailsTitle: string
  fields: KindField[]
  columns: KindColumn[]
}

export const KIND_CONFIG: Record<ProductKind, KindConfig> = {
  raw_material: {
    kind: 'raw_material',
    title: 'Raw Materials',
    singular: 'Raw Material',
    hint: 'Actives, excipients, fragrances, colours',
    slug: 'raw-materials',
    icon: 'flask',
    namePlaceholder: 'e.g. Niacinamide',
    codeLabel: 'Code',
    codeRequired: false,
    codePlaceholder: 'e.g. AP-070',
    defaultUnit: 'kg',
    units: ['kg', 'g', 'l', 'ml'],
    detailsTitle: 'Material Details',
    fields: [
      { key: 'inci_name', label: 'INCI Name', placeholder: 'e.g. Niacinamide', wide: true },
      { key: 'make_brand', label: 'Make / Brand', placeholder: 'e.g. DSM' },
      { key: 'supplier', label: 'Supplier', placeholder: 'e.g. Kumar Organics' },
      { key: 'benefit', label: 'Benefit', placeholder: 'e.g. Brightening' },
      { key: 'alternative', label: 'Alternative', placeholder: 'Alternative material, if any' },
    ],
    columns: [
      { key: 'inci_name', label: 'INCI Name' },
      { key: 'make_brand', label: 'Make / Brand' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'benefit', label: 'Benefit' },
    ],
  },
  packing_material: {
    kind: 'packing_material',
    title: 'Packing Materials',
    singular: 'Packing Material',
    hint: 'Bottles, caps, pumps, tubes, labels, cartons',
    slug: 'packing-materials',
    icon: 'boxes',
    namePlaceholder: 'e.g. 30 ml Amber Dropper Bottle',
    codeLabel: 'Code',
    codeRequired: false,
    codePlaceholder: 'e.g. BR-016',
    defaultUnit: 'nos',
    units: ['nos', 'pc'],
    detailsTitle: 'Packing Details',
    fields: [
      { key: 'capacity', label: 'Size / Capacity', placeholder: 'e.g. 30 ml, 20/410' },
      { key: 'cap_colour', label: 'Cap Colour', placeholder: 'e.g. Gold' },
      { key: 'body_colour', label: 'Body Colour', placeholder: 'e.g. Amber' },
      { key: 'supplier', label: 'Supplier', placeholder: 'e.g. Rajhans Packaging' },
      { key: 'make_brand', label: 'Make / Brand', placeholder: 'Optional' },
    ],
    columns: [
      { key: 'capacity', label: 'Capacity' },
      { key: 'cap_colour', label: 'Cap Colour' },
      { key: 'body_colour', label: 'Body Colour' },
      { key: 'supplier', label: 'Supplier' },
    ],
  },
  bulk: {
    kind: 'bulk',
    title: 'Bulk',
    singular: 'Bulk',
    hint: 'Semi-finished formulation made in the vessel',
    slug: 'bulk',
    icon: 'layers',
    namePlaceholder: 'e.g. Orange Skin Serum Bulk',
    codeLabel: 'Code',
    codeRequired: false,
    codePlaceholder: 'Optional',
    defaultUnit: 'kg',
    units: ['kg', 'g', 'l', 'ml'],
    detailsTitle: 'Bulk Details',
    fields: [{ key: 'rd_number', label: 'R&D No.', placeholder: 'e.g. RD-003' }],
    columns: [{ key: 'rd_number', label: 'R&D No.' }],
  },
  finished_goods: {
    kind: 'finished_goods',
    title: 'Finished Goods',
    singular: 'Finished Good',
    hint: 'Packed product sold to the client',
    slug: 'finished-goods',
    icon: 'package',
    namePlaceholder: 'e.g. Orange Skin Anti-Ageing Night Serum',
    codeLabel: 'Internal Reference ID',
    codeRequired: true,
    codePlaceholder: 'Internal reference used for this product',
    defaultUnit: 'nos',
    units: ['nos', 'pc'],
    detailsTitle: 'Product Details',
    fields: [
      { key: 'brand_name', label: 'Brand Name', placeholder: 'e.g. Orange Skin' },
      { key: 'pack_size', label: 'Pack Size', placeholder: 'e.g. 30 ml' },
      { key: 'mrp', label: 'MRP (₹)', placeholder: 'e.g. 599', numeric: true },
    ],
    columns: [
      { key: 'brand_name', label: 'Brand' },
      { key: 'pack_size', label: 'Pack Size' },
      { key: 'mrp', label: 'MRP' },
    ],
  },
  rnd: {
    kind: 'rnd',
    title: 'R&D Samples',
    singular: 'R&D Sample',
    hint: 'Trial batches and client samples',
    slug: 'rnd-samples',
    icon: 'sparkles',
    namePlaceholder: 'e.g. 5DRGN Cell Serum trial',
    codeLabel: 'Code',
    codeRequired: false,
    codePlaceholder: 'Optional',
    defaultUnit: 'kg',
    units: ['kg', 'g', 'l', 'ml'],
    detailsTitle: 'Sample Details',
    fields: [
      { key: 'rd_number', label: 'R&D No.', placeholder: 'e.g. RD-003' },
      { key: 'brand_name', label: 'Brand Name', placeholder: 'e.g. Orange Skin' },
    ],
    columns: [
      { key: 'rd_number', label: 'R&D No.' },
      { key: 'brand_name', label: 'Brand' },
    ],
  },
}

const KNOWN_UNITS = new Set(Object.values(KIND_CONFIG).flatMap((config) => config.units))

export function unitsForKind(config: KindConfig, available: Array<{ value: string; label: string }>) {
  return available.filter((unit) => config.units.includes(unit.value) || !KNOWN_UNITS.has(unit.value))
}

export function kindFromSlug(slug: string | undefined | null): ProductKind | null {
  const match = Object.values(KIND_CONFIG).find((config) => config.slug === slug)
  return match ? match.kind : null
}
