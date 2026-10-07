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
  chemical: {
    kind: 'chemical',
    title: 'Chemicals',
    singular: 'Chemical',
    hint: 'Phenol, formaldehyde, cardinol, ammonia, methanol and other resin and coating chemicals',
    slug: 'chemicals',
    icon: 'flask',
    namePlaceholder: 'e.g. Phenol',
    codeLabel: 'Code',
    codeRequired: false,
    codePlaceholder: 'Optional',
    defaultUnit: 'kg',
    units: ['kg', 'l'],
    detailsTitle: 'Chemical Details',
    fields: [
      { key: 'used_in', label: 'Used in', placeholder: 'Resin, Coating or Both' },
      { key: 'make_brand', label: 'Make / Brand', placeholder: 'Optional' },
      { key: 'supplier', label: 'Usual supplier', placeholder: 'Optional' },
    ],
    columns: [
      { key: 'used_in', label: 'Used in' },
      { key: 'supplier', label: 'Supplier' },
    ],
  },
  reinforcement: {
    kind: 'reinforcement',
    title: 'Reinforcement',
    singular: 'Reinforcement',
    hint: 'Paper by brand and GSM, cloth by weave',
    slug: 'reinforcement',
    icon: 'layers',
    namePlaceholder: 'e.g. ISCON 110 or 10x10',
    codeLabel: 'Code',
    codeRequired: false,
    codePlaceholder: 'Optional',
    defaultUnit: 'kg',
    units: ['kg', 'roll'],
    detailsTitle: 'Reinforcement Details',
    fields: [
      { key: 'material_kind', label: 'Paper or cloth', placeholder: 'Paper / Cloth' },
      { key: 'make_brand', label: 'Brand', placeholder: 'e.g. ISCON, G.K., Star' },
      { key: 'gsm', label: 'GSM', placeholder: 'e.g. 110', numeric: true },
      { key: 'weave', label: 'Weave', placeholder: 'e.g. 10x10, 6x6' },
      { key: 'supplier', label: 'Usual supplier', placeholder: 'Optional' },
    ],
    columns: [
      { key: 'material_kind', label: 'Paper / cloth' },
      { key: 'make_brand', label: 'Brand' },
      { key: 'gsm', label: 'GSM' },
      { key: 'weave', label: 'Weave' },
    ],
  },
  chindi: {
    kind: 'chindi',
    title: 'Chindi',
    singular: 'Chindi',
    hint: 'Cotton fibre chips used in moulding',
    slug: 'chindi',
    icon: 'layers',
    namePlaceholder: 'e.g. Cotton chindi',
    codeLabel: 'Code',
    codeRequired: false,
    codePlaceholder: 'Optional',
    defaultUnit: 'kg',
    units: ['kg'],
    detailsTitle: 'Chindi Details',
    fields: [{ key: 'supplier', label: 'Source / supplier', placeholder: 'Optional' }],
    columns: [{ key: 'supplier', label: 'Source' }],
  },
  resin: {
    kind: 'resin',
    title: 'Resin',
    singular: 'Resin',
    hint: 'Phenol formaldehyde resin made in the reactors',
    slug: 'resin',
    icon: 'flask',
    namePlaceholder: 'e.g. P.F. Resin PFAC',
    codeLabel: 'Code',
    codeRequired: false,
    codePlaceholder: 'Optional',
    defaultUnit: 'kg',
    units: ['kg'],
    detailsTitle: 'Resin Details',
    fields: [
      { key: 'resin_grade', label: 'Resin grade', placeholder: 'PFC, PFA, PFAC or E-GLASS' },
      { key: 'solid_content_target', label: 'Solid content target (%)', placeholder: 'e.g. 79', numeric: true },
    ],
    columns: [
      { key: 'resin_grade', label: 'Grade' },
      { key: 'solid_content_target', label: 'Solid %' },
    ],
  },
  bstage: {
    kind: 'bstage',
    title: 'B-stage',
    singular: 'B-stage',
    hint: 'Coated (pre-preg) cloth or paper, used within 7 days and also sold per kg',
    slug: 'b-stage',
    icon: 'layers',
    namePlaceholder: 'e.g. B-stage 10x10 PFAC',
    codeLabel: 'Code',
    codeRequired: false,
    codePlaceholder: 'Optional',
    defaultUnit: 'kg',
    units: ['kg'],
    detailsTitle: 'B-stage Details',
    fields: [
      { key: 'base_material', label: 'Base cloth / paper', placeholder: 'e.g. 10x10' },
      { key: 'resin_grade', label: 'Resin grade', placeholder: 'e.g. PFAC' },
      { key: 'shelf_life_days', label: 'Shelf life (days)', placeholder: '7', numeric: true },
      { key: 'max_use_days', label: 'Usable up to (days)', placeholder: '10', numeric: true },
      { key: 'rc_min', label: 'RC % min', placeholder: 'e.g. 44', numeric: true },
      { key: 'rc_max', label: 'RC % max', placeholder: 'e.g. 45', numeric: true },
      { key: 'vc_min', label: 'VC % min', placeholder: 'e.g. 2.5', numeric: true },
      { key: 'vc_max', label: 'VC % max', placeholder: 'e.g. 3.5', numeric: true },
    ],
    columns: [
      { key: 'base_material', label: 'Base' },
      { key: 'resin_grade', label: 'Resin' },
      { key: 'shelf_life_days', label: 'Shelf life' },
    ],
  },
  laminate: {
    kind: 'laminate',
    title: 'Sheets, Tubes & Rods',
    singular: 'Sheet / Tube / Rod',
    hint: 'Pressed laminates sold by kg',
    slug: 'laminates',
    icon: 'package',
    namePlaceholder: 'e.g. F2F3 10x10 Sheet',
    codeLabel: 'Code',
    codeRequired: false,
    codePlaceholder: 'Optional',
    defaultUnit: 'kg',
    units: ['kg', 'nos'],
    detailsTitle: 'Laminate Details',
    fields: [
      { key: 'product_form', label: 'Form', placeholder: 'Sheet, Tube or Rod' },
      { key: 'laminate_grade', label: 'Grade', placeholder: 'e.g. F2F3, MUS2, Fabric' },
      { key: 'weave', label: 'Weave / paper', placeholder: 'e.g. 10x10, 6x6' },
      { key: 'thickness_mm', label: 'Thickness (mm)', placeholder: 'Leave empty if the item covers many thicknesses', numeric: true },
      { key: 'sheet_size', label: 'Sheet size', placeholder: 'e.g. 8x4, 6x6, 1906x1250' },
      { key: 'test_standard', label: 'Standard', placeholder: 'e.g. IS 2036, NEMA' },
    ],
    columns: [
      { key: 'product_form', label: 'Form' },
      { key: 'laminate_grade', label: 'Grade' },
      { key: 'weave', label: 'Weave' },
      { key: 'sheet_size', label: 'Size' },
    ],
  },
  moulded: {
    kind: 'moulded',
    title: 'Moulded Parts',
    singular: 'Moulded Part',
    hint: 'Compression-moulded components counted in pieces',
    slug: 'moulded-parts',
    icon: 'boxes',
    namePlaceholder: 'e.g. Bush 1155',
    codeLabel: 'Code',
    codeRequired: false,
    codePlaceholder: 'Optional',
    defaultUnit: 'nos',
    units: ['nos', 'kg'],
    detailsTitle: 'Moulded Part Details',
    fields: [
      { key: 'die_no', label: 'Die No.', placeholder: 'e.g. 1155, 4306L' },
      { key: 'article_weight_kg', label: 'Weight of article (kg)', placeholder: 'e.g. 1.600', numeric: true },
      { key: 'customer_name', label: 'Customer', placeholder: 'Whose die this is' },
    ],
    columns: [
      { key: 'die_no', label: 'Die No.' },
      { key: 'article_weight_kg', label: 'Article kg' },
      { key: 'customer_name', label: 'Customer' },
    ],
  },
  bought_in: {
    kind: 'bought_in',
    title: 'Bought-in & Consumables',
    singular: 'Bought-in Item',
    hint: 'Goods bought for resale, pallets, PP wrap, LDP and other consumables',
    slug: 'bought-in',
    icon: 'sparkles',
    namePlaceholder: 'e.g. Wooden pallet',
    codeLabel: 'Code',
    codeRequired: false,
    codePlaceholder: 'Optional',
    defaultUnit: 'nos',
    units: ['nos', 'kg', 'roll'],
    detailsTitle: 'Item Details',
    fields: [
      { key: 'resale', label: 'Bought for resale', placeholder: 'Yes / No' },
      { key: 'supplier', label: 'Usual supplier', placeholder: 'Optional' },
    ],
    columns: [
      { key: 'resale', label: 'Resale' },
      { key: 'supplier', label: 'Supplier' },
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
