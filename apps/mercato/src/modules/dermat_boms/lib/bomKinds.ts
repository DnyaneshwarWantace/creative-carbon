import type { ProductKind } from '../../dermat_products/lib/kinds'

export type BomKind = 'formula' | 'pack'

export type BomKindConfig = {
  kind: BomKind
  productKinds: ProductKind[]
  componentKinds: ProductKind[]
  defaultBatchSize: number
  defaultBatchUnit: string | null
}

export const BOM_KINDS: Record<BomKind, BomKindConfig> = {
  formula: {
    kind: 'formula',
    productKinds: ['bulk', 'rnd'],
    componentKinds: ['raw_material', 'bulk'],
    defaultBatchSize: 100,
    defaultBatchUnit: null,
  },
  pack: {
    kind: 'pack',
    productKinds: ['finished_goods'],
    componentKinds: ['bulk', 'packing_material'],
    defaultBatchSize: 1000,
    defaultBatchUnit: 'pc',
  },
}

export const PERCENT_TOTAL = 100
export const PERCENT_TOLERANCE = 0.001

export function bomKindForProduct(productKind: string | null | undefined): BomKind | null {
  if (!productKind) return null
  if (BOM_KINDS.formula.productKinds.includes(productKind as ProductKind)) return 'formula'
  if (BOM_KINDS.pack.productKinds.includes(productKind as ProductKind)) return 'pack'
  return null
}

export const DEFAULT_SPECIFIC_GRAVITY = 1

const UNIT_FACTOR: Record<string, { base: 'mass' | 'volume'; factor: number }> = {
  kg: { base: 'mass', factor: 1 },
  g: { base: 'mass', factor: 0.001 },
  l: { base: 'volume', factor: 1 },
  ml: { base: 'volume', factor: 0.001 },
}

export function convertQuantity(
  value: number,
  fromUnit: string | null | undefined,
  toUnit: string | null | undefined,
  specificGravity?: number | null,
): number {
  const from = UNIT_FACTOR[(fromUnit ?? '').toLowerCase()]
  const to = UNIT_FACTOR[(toUnit ?? '').toLowerCase()]
  if (!from || !to) return value
  const sg = specificGravity && specificGravity > 0 ? specificGravity : DEFAULT_SPECIFIC_GRAVITY
  let base = value * from.factor
  if (from.base === 'volume' && to.base === 'mass') base *= sg
  if (from.base === 'mass' && to.base === 'volume') base /= sg
  return base / to.factor
}

export function batchQuantity(
  kind: BomKind,
  batchSize: number,
  value: number,
  batchUnit?: string | null,
  componentUnit?: string | null,
  componentSpecificGravity?: number | null,
): number {
  if (kind === 'formula') return convertQuantity((value * batchSize) / PERCENT_TOTAL, batchUnit, componentUnit, componentSpecificGravity)
  return value * batchSize
}

export const FILL_UNITS = ['ml', 'g', 'l', 'kg'] as const
export type FillUnit = (typeof FILL_UNITS)[number]


export function fillToBulkQuantity(
  fillQty: number,
  fillUnit: string,
  bulkUnit: string | null | undefined,
  specificGravity: number | null | undefined,
): number {
  return convertQuantity(fillQty, fillUnit, bulkUnit ?? 'kg', specificGravity)
}

const PACK_SIZE_UNITS: Record<string, FillUnit> = {
  ml: 'ml', mls: 'ml', mltr: 'ml', millilitre: 'ml', milliliter: 'ml',
  g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', gr: 'g',
  l: 'l', ltr: 'l', litre: 'l', liter: 'l',
  kg: 'kg', kgs: 'kg',
}

export function parsePackSize(text: string | null | undefined): { qty: number; unit: FillUnit } | null {
  if (!text) return null
  const match = text.toLowerCase().replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*([a-z]+)/)
  if (!match) return null
  const unit = PACK_SIZE_UNITS[match[2]]
  const qty = Number(match[1])
  if (!unit || !(qty > 0)) return null
  return { qty, unit }
}
