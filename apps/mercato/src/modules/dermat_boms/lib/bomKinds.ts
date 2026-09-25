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

export function batchQuantity(kind: BomKind, batchSize: number, value: number): number {
  if (kind === 'formula') return (value * batchSize) / PERCENT_TOTAL
  return value * batchSize
}
