import { BomHeader, BomItem } from '../data/entities'
import type { BomItemInput } from '../data/validators'
import { BOM_KINDS, PERCENT_TOLERANCE, PERCENT_TOTAL, batchQuantity, bomKindForProduct, fillToBulkQuantity, type BomKind } from './bomKinds'
import type { EntityManager } from '@mikro-orm/postgresql'
import { currentUserName, loadProducts, loadStock, nextBomCode, type BomRequestContext, type ProductSummary } from './server'

export class BomError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export type BomItemView = {
  id: string
  position: number
  componentProductId: string
  componentKind: string
  code: string | null
  sku: string | null
  name: string
  unit: string
  value: number
  quantity: number
  onHand: number
  available: number
  remark: string | null
  fillQty: number | null
  fillUnit: string | null
  specificGravity: number | null
  packSize: string | null
}

export type BomView = {
  id: string
  code: string
  kind: BomKind
  productId: string
  product: ProductSummary | null
  version: number
  status: string
  batchSize: number
  batchUnit: string
  notes: string | null
  createdByName: string | null
  approvedByName: string | null
  approvedAt: string | null
  createdAt: string
  updatedAt: string
  totalPercent: number | null
  items: BomItemView[]
  orderId: string | null
  orderNo: string | null
  versions: Array<{ id: string; code: string; version: number; status: string; orderNo: string | null }>
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

export function sumPercent(items: Array<{ value: number }>): number {
  return roundTo(
    items.reduce((sum, item) => sum + item.value, 0),
    4,
  )
}

export type ValidatedItem = Omit<BomItemInput, 'value' | 'fillQty' | 'fillUnit'> & { value: number; componentKind: string; unit: string; fillQty: number | null; fillUnit: string | null }

export async function findBom(ctx: BomRequestContext, id: string): Promise<BomHeader> {
  const bom = await ctx.em.findOne(BomHeader, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!bom) throw new BomError('BOM not found', 404)
  return bom
}

export async function resolveProductKind(ctx: BomRequestContext, productId: string): Promise<{ product: ProductSummary; kind: BomKind }> {
  const product = (await loadProducts(ctx, [productId])).get(productId)
  if (!product) throw new BomError('Product not found', 404)
  const kind = bomKindForProduct(product.kind)
  if (!kind) throw new BomError('A BOM can only be made for Bulk, R&D or Finished Goods products')
  return { product, kind }
}

async function reachableProducts(ctx: BomRequestContext, startIds: string[]): Promise<Set<string>> {
  if (!startIds.length) return new Set()
  const rows = await ctx.em.getConnection().execute<Array<{ product_id: string }>>(
    `with recursive reach(product_id) as (
        select unnest(?::uuid[])
      union
        select i.component_product_id
          from reach r
          join dermat_bom_headers h on h.product_id = r.product_id and h.status <> 'superseded' and h.deleted_at is null
           and h.tenant_id = ? and h.organization_id = ?
          join dermat_bom_items i on i.bom_id = h.id
     )
     select product_id from reach`,
    [`{${startIds.join(',')}}`, ctx.tenantId, ctx.organizationId],
  )
  return new Set(rows.map((row) => row.product_id))
}

export async function validateItems(
  ctx: BomRequestContext,
  kind: BomKind,
  productId: string,
  items: BomItemInput[],
): Promise<ValidatedItem[]> {
  const config = BOM_KINDS[kind]
  const products = await loadProducts(
    ctx,
    items.map((item) => item.componentProductId),
  )
  const seen = new Set<string>()
  const rowErrors: Record<string, string> = {}
  const validated = items.map((item, index) => {
    const component = products.get(item.componentProductId)
    const rowKey = String(index + 1)
    if (!component) {
      rowErrors[rowKey] = 'Material not found'
    } else if (!config.componentKinds.includes(component.kind as never)) {
      rowErrors[rowKey] = `${component.title} cannot be used in this BOM`
    } else if (component.id === productId) {
      rowErrors[rowKey] = 'A product cannot be part of its own BOM'
    } else if (seen.has(component.id)) {
      rowErrors[rowKey] = `${component.title} is added twice`
    }
    const usesFill = kind === 'pack' && component?.kind === 'bulk' && item.fillQty != null && item.fillUnit != null
    const value = usesFill
      ? Math.round(fillToBulkQuantity(item.fillQty as number, item.fillUnit as string, component?.unit, component?.specificGravity) * 100000) / 100000
      : (item.value ?? 0)
    if (!(value > 0)) rowErrors[rowKey] = 'Enter a quantity above 0'
    if (kind === 'formula' && value > PERCENT_TOTAL) rowErrors[rowKey] = 'RM % cannot be more than 100'
    seen.add(item.componentProductId)
    return {
      ...item,
      value,
      fillQty: usesFill ? (item.fillQty as number) : null,
      fillUnit: usesFill ? (item.fillUnit as string) : null,
      componentKind: component?.kind ?? '',
      unit: component?.unit ?? (kind === 'formula' ? 'kg' : 'pc'),
    }
  })
  if (Object.keys(rowErrors).length) throw new BomError('Some lines need fixing', 400, { rows: rowErrors })
  const subAssemblies = validated.filter((item) => item.componentKind === 'bulk').map((item) => item.componentProductId)
  if (subAssemblies.length) {
    const reach = await reachableProducts(ctx, subAssemblies)
    if (reach.has(productId)) throw new BomError('This would make a loop: a Bulk in this BOM already uses this product')
  }
  return validated
}

export async function replaceItems(
  ctx: BomRequestContext,
  bom: BomHeader,
  kind: BomKind,
  items: ValidatedItem[],
): Promise<void> {
  await ctx.em.nativeDelete(BomItem, { bomId: bom.id })
  items.forEach((item, index) => {
    ctx.em.persist(
      ctx.em.create(BomItem, {
        organizationId: ctx.organizationId,
        tenantId: ctx.tenantId,
        bomId: bom.id,
        position: index + 1,
        componentProductId: item.componentProductId,
        componentKind: item.componentKind,
        percent: kind === 'formula' ? String(item.value) : null,
        qtyPerUnit: kind === 'pack' ? String(item.value) : null,
        fillQty: item.fillQty != null ? String(item.fillQty) : null,
        fillUnit: item.fillUnit,
        unit: item.unit,
        remark: item.remark?.trim() || null,
      }),
    )
  })
}

export async function serializeBom(ctx: BomRequestContext, bom: BomHeader): Promise<BomView> {
  const kind = bomKindForProduct(bom.productKind) ?? 'formula'
  const items = await ctx.em.find(BomItem, { bomId: bom.id }, { orderBy: { position: 'asc' } })
  const componentIds = items.map((item) => item.componentProductId)
  const [products, stock, versions] = await Promise.all([
    loadProducts(ctx, [bom.productId, ...componentIds]),
    loadStock(ctx, componentIds),
    ctx.em.find(
      BomHeader,
      { productId: bom.productId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null },
      { orderBy: { version: 'desc' } },
    ),
  ])
  const batchSize = Number(bom.batchSize)
  const itemViews = items.map<BomItemView>((item) => {
    const component = products.get(item.componentProductId)
    const value = Number(kind === 'formula' ? item.percent : item.qtyPerUnit) || 0
    const componentStock = stock.get(item.componentProductId)
    return {
      id: item.id,
      position: item.position,
      componentProductId: item.componentProductId,
      componentKind: item.componentKind,
      code: component?.code ?? null,
      sku: component?.sku ?? null,
      name: component?.title ?? '(deleted product)',
      unit: component?.unit ?? item.unit,
      value,
      quantity: roundTo(batchQuantity(kind, batchSize, value, bom.batchUnit, component?.unit ?? item.unit, component?.specificGravity), 4),
      onHand: componentStock?.onHand ?? 0,
      available: componentStock?.available ?? 0,
      remark: item.remark ?? null,
      fillQty: item.fillQty == null ? null : Number(item.fillQty),
      fillUnit: item.fillUnit ?? null,
      specificGravity: component?.specificGravity ?? null,
      packSize: null,
    }
  })
  return {
    id: bom.id,
    code: bom.code,
    kind,
    productId: bom.productId,
    product: products.get(bom.productId) ?? null,
    version: bom.version,
    status: bom.status,
    batchSize,
    batchUnit: bom.batchUnit,
    notes: bom.notes ?? null,
    createdByName: bom.createdByName ?? null,
    approvedByName: bom.approvedByName ?? null,
    approvedAt: bom.approvedAt ? bom.approvedAt.toISOString() : null,
    createdAt: bom.createdAt.toISOString(),
    updatedAt: bom.updatedAt.toISOString(),
    totalPercent: kind === 'formula' ? sumPercent(itemViews) : null,
    items: itemViews,
    orderId: bom.orderId ?? null,
    orderNo: bom.orderNo ?? null,
    versions: versions.map((entry) => ({ id: entry.id, code: entry.code, version: entry.version, status: entry.status, orderNo: entry.orderNo ?? null })),
  }
}

export function assertReadyToApprove(kind: BomKind, items: Array<{ value: number }>): void {
  if (!items.length) throw new BomError('Add at least one line before approving')
  if (kind === 'formula') {
    const total = sumPercent(items)
    if (Math.abs(total - PERCENT_TOTAL) > PERCENT_TOLERANCE) {
      throw new BomError(`RM % must total 100 before approving (now ${total})`)
    }
  }
}

export type DraftBomInput = { productId: string; batchSize: number; notes?: string | null; items: BomItemInput[] }

export async function prepareDraftBom(ctx: BomRequestContext, input: DraftBomInput) {
  const { product, kind } = await resolveProductKind(ctx, input.productId)
  const existingDraft = await ctx.em.findOne(BomHeader, {
    productId: input.productId,
    orderId: null,
    status: 'draft',
    tenantId: ctx.tenantId,
    organizationId: ctx.organizationId,
    deletedAt: null,
  })
  if (existingDraft) throw new BomError('This product already has a draft BOM', 409, { id: existingDraft.id })
  const items = await validateItems(ctx, kind, input.productId, input.items)
  return { product, kind, items }
}

export async function createDraftBom(ctx: BomRequestContext, input: DraftBomInput, prepared: Awaited<ReturnType<typeof prepareDraftBom>>): Promise<BomHeader> {
  const latest = await ctx.em.findOne(
    BomHeader,
    { productId: input.productId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null },
    { orderBy: { version: 'desc' } },
  )
  const createdByName = await currentUserName(ctx)
  return ctx.em.transactional(async (em) => {
    const txCtx = { ...ctx, em: em as EntityManager }
    const header = em.create(BomHeader, {
      organizationId: ctx.organizationId,
      tenantId: ctx.tenantId,
      code: await nextBomCode(txCtx),
      productId: input.productId,
      productKind: prepared.product.kind ?? '',
      version: (latest?.version ?? 0) + 1,
      status: 'draft',
      batchSize: String(input.batchSize),
      batchUnit: BOM_KINDS[prepared.kind].defaultBatchUnit ?? prepared.product.unit ?? 'kg',
      notes: input.notes?.trim() || null,
      createdByName,
    })
    em.persist(header)
    await em.flush()
    await replaceItems(txCtx, header, prepared.kind, prepared.items)
    await em.flush()
    return header
  })
}
