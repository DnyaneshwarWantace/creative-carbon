import { randomUUID } from 'node:crypto'
import { BomItem } from '../../dermat_boms/data/entities'
import { fillToBulkQuantity } from '../../dermat_boms/lib/bomKinds'
import { loadProducts as loadBomProducts } from '../../dermat_boms/lib/server'
import { LOCATION_CODES, dermatWarehouse, lotsAtLocation, variantsForProducts } from '../../dermat_products/lib/stock'
import { performerId, runCommand, type StoreContext } from '../../dermat_store/lib/server'
import { ensureStockRecords } from '../../dermat_store/lib/stockSetup'
import { DermatOrder, DermatOrderEvent, DermatOrderLine, DermatOrderStage } from '../data/entities'
import { approvedPackBoms, type OrderContext } from './server'

export const USE_EXISTING_BULK = 'Use bulk already made'
export const MAKE_NEW_BULK = 'Make a new batch'

const EPSILON = 0.000001

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

export type BulkPlanLine = { lineId: string; fgId: string; pieces: number; bulkId: string; bulkUnit: string; kgPerPiece: number; plannedKg: number }

export async function bulkPlan(ctx: OrderContext, orderId: string): Promise<BulkPlanLine[]> {
  const lines = await ctx.em.find(DermatOrderLine, { orderId }, { orderBy: { position: 'asc' } })
  const boms = await approvedPackBoms(ctx, lines.map((line) => line.productId), orderId)
  const plan: BulkPlanLine[] = []
  for (const line of lines) {
    const bom = boms.get(line.productId)
    if (!bom || bom.status !== 'approved') continue
    const items = await ctx.em.find(BomItem, { bomId: bom.id, componentKind: 'bulk' }, { orderBy: { position: 'asc' } })
    const bulks = await loadBomProducts(ctx, items.map((item) => item.componentProductId))
    for (const item of items) {
      const bulk = bulks.get(item.componentProductId)
      const unit = bulk?.unit ?? 'kg'
      const perPiece =
        item.fillQty != null && item.fillUnit ? fillToBulkQuantity(Number(item.fillQty), item.fillUnit, unit, bulk?.specificGravity) : Number(item.qtyPerUnit ?? 0)
      const pieces = Number(line.quantity)
      plan.push({ lineId: line.id, fgId: line.productId, pieces, bulkId: item.componentProductId, bulkUnit: unit, kgPerPiece: perPiece, plannedKg: round(perPiece * pieces) })
    }
  }
  return plan
}

async function stageData(ctx: OrderContext, orderId: string, stageKey: string): Promise<Record<string, unknown>> {
  const stage = await ctx.em.findOne(DermatOrderStage, { orderId, stageKey })
  return (stage?.data as Record<string, unknown>) ?? {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

function numberOf(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

async function locations(ctx: StoreContext) {
  const warehouse = await dermatWarehouse(ctx)
  if (!warehouse) throw new Error('[internal] store locations missing')
  return warehouse
}

async function lotFor(ctx: StoreContext, variantId: string, lotNumber: string, sku: string | null, dates: { manufacturedAt?: string; expiresAt?: string }): Promise<string> {
  const [existing] = await ctx.em.getConnection().execute<Array<{ id: string }>>(
    `select id from wms_inventory_lots where catalog_variant_id = ? and lot_number = ? and tenant_id = ? and organization_id = ? and deleted_at is null limit 1`,
    [variantId, lotNumber, ctx.tenantId, ctx.organizationId],
  )
  if (existing) return existing.id
  const created = await runCommand<{ lotId: string }>(ctx, 'wms.lots.create', {
    catalogVariantId: variantId,
    sku: sku ?? lotNumber,
    lotNumber,
    status: 'available',
    ...(dates.manufacturedAt ? { manufacturedAt: dates.manufacturedAt } : {}),
    ...(dates.expiresAt ? { expiresAt: dates.expiresAt } : {}),
  })
  return created.lotId
}

async function skus(ctx: StoreContext, variantIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (!variantIds.length) return result
  const rows = await ctx.em.getConnection().execute<Array<{ id: string; sku: string | null }>>(`select id, sku from catalog_product_variants where id = any(?::uuid[])`, [`{${variantIds.join(',')}}`])
  for (const row of rows) if (row.sku) result.set(row.id, row.sku)
  return result
}

export async function existingBulkProblem(ctx: OrderContext, orderId: string, batchNo: string): Promise<string | null> {
  if (!batchNo) return 'Enter the batch no. of the bulk you are using'
  const plan = await bulkPlan(ctx, orderId)
  if (!plan.length) return 'This order has no approved BOM with a bulk'
  const warehouse = await dermatWarehouse(ctx)
  const production = warehouse?.locations.get(LOCATION_CODES.production)
  if (!production) return 'The PRODUCTION location is missing'
  const variants = await variantsForProducts(ctx, plan.map((entry) => entry.bulkId))
  for (const bulkId of new Set(plan.map((entry) => entry.bulkId))) {
    const lots = await lotsAtLocation(ctx, [variants.get(bulkId) ?? ''], production)
    const lot = lots.find((entry) => entry.lotNumber === batchNo && entry.status === 'available')
    const needed = plan.filter((entry) => entry.bulkId === bulkId).reduce((sum, entry) => sum + entry.plannedKg, 0)
    if (!lot) return `Bulk batch ${batchNo} is not in PRODUCTION (or not QC-approved)`
    if (lot.onHand < needed - EPSILON) return `Bulk batch ${batchNo} has only ${round(lot.onHand)} left; this order needs ${round(needed)}`
  }
  return null
}

export type BulkBatch = { bulkId: string; lotNumber: string; onHand: number; manufacturedAt: string | null }

export async function availableBulk(ctx: OrderContext, orderId: string): Promise<{ plan: BulkPlanLine[]; batches: BulkBatch[] }> {
  const plan = await bulkPlan(ctx, orderId)
  const warehouse = await dermatWarehouse(ctx)
  const production = warehouse?.locations.get(LOCATION_CODES.production)
  if (!production || !plan.length) return { plan, batches: [] }
  const variants = await variantsForProducts(ctx, plan.map((entry) => entry.bulkId))
  const batches: BulkBatch[] = []
  for (const bulkId of new Set(plan.map((entry) => entry.bulkId))) {
    const variantId = variants.get(bulkId)
    if (!variantId) continue
    const rows = await ctx.em.getConnection().execute<Array<{ lot_number: string; on_hand: string; manufactured_at: Date | null }>>(
      `select lot.lot_number, sum(b.quantity_on_hand)::text as on_hand, lot.manufactured_at
         from wms_inventory_balances b join wms_inventory_lots lot on lot.id = b.lot_id
        where b.catalog_variant_id = ? and b.location_id = ? and b.deleted_at is null and lot.status = 'available'
        group by lot.lot_number, lot.manufactured_at having sum(b.quantity_on_hand) > 0 order by lot.manufactured_at desc nulls last`,
      [variantId, production],
    )
    for (const row of rows) batches.push({ bulkId, lotNumber: row.lot_number, onHand: round(Number(row.on_hand)), manufacturedAt: row.manufactured_at ? new Date(row.manufactured_at).toISOString() : null })
  }
  return { plan, batches }
}

function note(ctx: StoreContext, orderId: string, stageKey: string, message: string) {
  ctx.em.persist(ctx.em.create(DermatOrderEvent, { organizationId: ctx.organizationId, tenantId: ctx.tenantId, orderId, stageKey, action: 'stock', note: message, byName: null }))
}

function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + months)
  return date.toISOString().slice(0, 10)
}

function expiryMonths(value: string | undefined): number | null {
  const match = (value ?? '').match(/(\d{1,3})/)
  return match ? Number(match[1]) : null
}

export async function onProductionStageDone(ctx: StoreContext, orderId: string, stageKey: string): Promise<string[]> {
  const order = await ctx.em.findOne(DermatOrder, { id: orderId, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  if (!order) return []
  const problems: string[] = []
  const mfg = await stageData(ctx, orderId, 'manufacturing')
  const batchNo = text(mfg.batch_no)
  const mfgDate = text(mfg.mfg_date) || new Date().toISOString().slice(0, 10)
  if (!batchNo) return []
  const warehouse = await locations(ctx)
  const production = warehouse.locations.get(LOCATION_CODES.production)
  const fgStore = warehouse.locations.get(LOCATION_CODES.fg)
  const plan = await bulkPlan(ctx, orderId)
  const lines = await ctx.em.find(DermatOrderLine, { orderId })
  await ensureStockRecords(ctx, [...plan.map((entry) => entry.bulkId), ...lines.map((line) => line.productId)])
  const totalPieces = lines.reduce((sum, line) => sum + Number(line.quantity), 0) || 1

  if (stageKey === 'manufacturing' && text(mfg.bulk_source) !== USE_EXISTING_BULK && production) {
    const made = numberOf(mfg.batch_size)
    const planned = plan.reduce((sum, entry) => sum + entry.plannedKg, 0) || 1
    const byBulk = new Map<string, number>()
    for (const entry of plan) byBulk.set(entry.bulkId, (byBulk.get(entry.bulkId) ?? 0) + entry.plannedKg)
    const variants = await variantsForProducts(ctx, Array.from(byBulk.keys()))
    const variantSkus = await skus(ctx, Array.from(variants.values()))
    for (const [bulkId, plannedKg] of byBulk) {
      const variantId = variants.get(bulkId)
      const quantity = round(made * (plannedKg / planned))
      if (!variantId || quantity <= EPSILON) continue
      try {
        const lotId = await lotFor(ctx, variantId, batchNo, variantSkus.get(variantId) ?? null, { manufacturedAt: mfgDate })
        await runCommand(ctx, 'wms.inventory.receive', {
          warehouseId: warehouse.warehouseId,
          locationId: production,
          catalogVariantId: variantId,
          lotId,
          quantity,
          referenceType: 'so',
          referenceId: randomUUID(),
          performedBy: performerId(ctx),
          reason: `Bulk made in batch ${batchNo} for ${order.orderNo}`,
          metadata: { orderId, orderNo: order.orderNo },
        })
      } catch {
        problems.push(`Could not put bulk batch ${batchNo} into stock`)
      }
    }
  }

  if (stageKey === 'filling' && production) {
    const filled = numberOf((await stageData(ctx, orderId, 'filling')).filled_units)
    const variants = await variantsForProducts(ctx, plan.map((entry) => entry.bulkId))
    for (const entry of plan) {
      const variantId = variants.get(entry.bulkId)
      const line = lines.find((candidate) => candidate.id === entry.lineId)
      if (!variantId || !line) continue
      const pieces = filled * (Number(line.quantity) / totalPieces)
      let remaining = round(pieces * entry.kgPerPiece)
      const lots = (await lotsAtLocation(ctx, [variantId], production)).filter((lot) => lot.lotNumber === batchNo && lot.onHand > 0)
      for (const lot of lots) {
        if (remaining <= EPSILON) break
        const quantity = round(Math.min(remaining, lot.onHand))
        try {
          await runCommand(ctx, 'wms.inventory.adjust', {
            warehouseId: warehouse.warehouseId,
            locationId: production,
            catalogVariantId: variantId,
            ...(lot.lotId ? { lotId: lot.lotId } : {}),
            delta: -quantity,
            reason: `Filled ${round(pieces)} pcs for ${order.orderNo} (batch ${batchNo})`,
            reasonCode: 'filling_use',
            referenceType: 'so',
            referenceId: randomUUID(),
            performedBy: performerId(ctx),
            metadata: { orderId, orderNo: order.orderNo },
          })
          remaining = round(remaining - quantity)
        } catch {
          problems.push(`Could not record bulk used from batch ${batchNo}`)
          break
        }
      }
      if (remaining > 0.001) problems.push(`Bulk batch ${batchNo} was short by ${remaining} ${entry.bulkUnit} for filling`)
    }
  }

  if (stageKey === 'packing' && fgStore) {
    const packed = numberOf((await stageData(ctx, orderId, 'packing')).packed_qty)
    const variants = await variantsForProducts(ctx, lines.map((line) => line.productId))
    const variantSkus = await skus(ctx, Array.from(variants.values()))
    for (const line of lines) {
      const variantId = variants.get(line.productId)
      const quantity = Math.round(packed * (Number(line.quantity) / totalPieces))
      if (!variantId || quantity <= 0) continue
      const months = expiryMonths(line.specs?.production?.expiry_month)
      try {
        const lotId = await lotFor(ctx, variantId, batchNo, variantSkus.get(variantId) ?? null, { manufacturedAt: mfgDate, ...(months ? { expiresAt: addMonths(mfgDate, months) } : {}) })
        await runCommand(ctx, 'wms.inventory.receive', {
          warehouseId: warehouse.warehouseId,
          locationId: fgStore,
          catalogVariantId: variantId,
          lotId,
          quantity,
          referenceType: 'so',
          referenceId: randomUUID(),
          performedBy: performerId(ctx),
          reason: `Packed for ${order.orderNo} (batch ${batchNo})`,
          metadata: { orderId, orderNo: order.orderNo },
        })
      } catch {
        problems.push(`Could not put finished goods of batch ${batchNo} into FG-STORE`)
      }
    }
  }

  if (stageKey === 'dispatch' && fgStore) {
    const packed = numberOf((await stageData(ctx, orderId, 'packing')).packed_qty)
    const dispatch = await stageData(ctx, orderId, 'dispatch')
    const variants = await variantsForProducts(ctx, lines.map((line) => line.productId))
    for (const line of lines) {
      const variantId = variants.get(line.productId)
      if (!variantId) continue
      const quantity = Math.round(packed * (Number(line.quantity) / totalPieces))
      const lot = (await lotsAtLocation(ctx, [variantId], fgStore)).find((entry) => entry.lotNumber === batchNo)
      if (!lot || quantity <= 0) continue
      try {
        await runCommand(ctx, 'wms.inventory.adjust', {
          warehouseId: warehouse.warehouseId,
          locationId: fgStore,
          catalogVariantId: variantId,
          ...(lot.lotId ? { lotId: lot.lotId } : {}),
          delta: -Math.min(quantity, lot.onHand),
          reason: `Dispatched ${order.orderNo}${text(dispatch.lr_number) ? ` (LR ${text(dispatch.lr_number)})` : ''}`,
          reasonCode: 'dispatch',
          referenceType: 'so',
          referenceId: randomUUID(),
          performedBy: performerId(ctx),
          metadata: { orderId, orderNo: order.orderNo },
        })
      } catch {
        problems.push(`Could not take batch ${batchNo} out of FG-STORE`)
      }
    }
  }

  for (const problem of problems) note(ctx, orderId, stageKey, problem)
  if (problems.length) await ctx.em.flush()
  return problems
}

export type PackItem = { productId: string; title: string; code: string | null; unit: string; quantity: number }

export async function packItems(ctx: OrderContext, orderId: string): Promise<PackItem[]> {
  const lines = await ctx.em.find(DermatOrderLine, { orderId })
  const boms = await approvedPackBoms(ctx, lines.map((line) => line.productId), orderId)
  const totals = new Map<string, number>()
  for (const line of lines) {
    const bom = boms.get(line.productId)
    if (!bom) continue
    const items = await ctx.em.find(BomItem, { bomId: bom.id, componentKind: 'packing_material' })
    for (const item of items) totals.set(item.componentProductId, (totals.get(item.componentProductId) ?? 0) + Number(item.qtyPerUnit ?? 0) * Number(line.quantity))
  }
  if (!totals.size) return []
  const products = await loadBomProducts(ctx, Array.from(totals.keys()))
  return Array.from(totals.entries()).map(([productId, quantity]) => ({
    productId,
    title: products.get(productId)?.title ?? '—',
    code: products.get(productId)?.code ?? null,
    unit: products.get(productId)?.unit ?? 'pc',
    quantity: round(quantity),
  }))
}
