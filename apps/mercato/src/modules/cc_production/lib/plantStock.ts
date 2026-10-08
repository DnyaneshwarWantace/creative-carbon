import { randomUUID } from 'node:crypto'
import { LOCATION_CODES, PLACE_LABEL, ccWarehouse, type StockPlace } from '../../cc_products/lib/stock'
import { ensureStockRecords } from '../../cc_store/lib/stockSetup'
import { performerId, runCommand, type StoreContext } from '../../cc_store/lib/server'
import { PlantError } from './server'

const EPSILON = 0.0005

export type PickedLot = { lotId: string; lotNumber: string | null; place: string; kg: number }

export type FreeLot = { lotId: string; lotNumber: string | null; place: StockPlace; free: number; receivedAt: string }

export type PlantStock = {
  warehouseId: string
  locationOf: (place: StockPlace) => string
  placeOf: (locationId: string) => StockPlace | null
  variants: Map<string, string>
}

export function kg3(value: number): number {
  return Math.round(value * 1000) / 1000
}

export async function plantStock(ctx: StoreContext, productIds: string[]): Promise<PlantStock> {
  const warehouse = await ccWarehouse(ctx)
  if (!warehouse) throw new PlantError('The stores are not set up yet', 409)
  const byPlace = new Map<StockPlace, string>()
  for (const [place, code] of Object.entries(LOCATION_CODES) as Array<[StockPlace, string]>) {
    const id = warehouse.locations.get(code)
    if (id) byPlace.set(place, id)
  }
  const byId = new Map([...byPlace.entries()].map(([place, id]) => [id, place]))
  const variants = await ensureStockRecords(ctx, productIds)
  return {
    warehouseId: warehouse.warehouseId,
    locationOf: (place) => {
      const id = byPlace.get(place)
      if (!id) throw new PlantError(`The ${PLACE_LABEL[place]} location is missing`, 409)
      return id
    },
    placeOf: (locationId) => byId.get(locationId) ?? null,
    variants,
  }
}

export async function freeLots(ctx: StoreContext, stock: PlantStock, productIds: string[], places: StockPlace[]): Promise<Map<string, FreeLot[]>> {
  const result = new Map<string, FreeLot[]>()
  const variantIds = productIds.map((id) => stock.variants.get(id)).filter((id): id is string => Boolean(id))
  if (!variantIds.length) return result
  const productOf = new Map(productIds.map((id) => [stock.variants.get(id), id]))
  const rows = await ctx.em.getConnection().execute<Array<{ catalog_variant_id: string; lot_id: string; lot_number: string | null; location_id: string; free: string; created_at: Date }>>(
    `select b.catalog_variant_id, b.lot_id, lot.lot_number, b.location_id, (b.quantity_on_hand - b.quantity_reserved - b.quantity_allocated) as free, b.created_at
       from wms_inventory_balances b
       join wms_inventory_lots lot on lot.id = b.lot_id
      where b.catalog_variant_id = any(?::uuid[]) and b.location_id = any(?::uuid[]) and b.tenant_id = ? and b.organization_id = ?
        and b.deleted_at is null and coalesce(lot.status, 'available') = 'available'
        and (b.quantity_on_hand - b.quantity_reserved - b.quantity_allocated) > 0
      order by b.created_at asc, lot.lot_number asc`,
    [`{${variantIds.join(',')}}`, `{${places.map((place) => stock.locationOf(place)).join(',')}}`, ctx.tenantId, ctx.organizationId],
  )
  for (const row of rows) {
    const productId = productOf.get(row.catalog_variant_id)
    const place = stock.placeOf(row.location_id)
    if (!productId || !place) continue
    const list = result.get(productId) ?? []
    list.push({ lotId: row.lot_id, lotNumber: row.lot_number, place, free: kg3(Number(row.free)), receivedAt: new Date(row.created_at).toISOString() })
    result.set(productId, list)
  }
  return result
}

export function pickLots(lots: FreeLot[], kg: number, title: string, preferredLotId: string | null): PickedLot[] {
  const ordered = preferredLotId ? [...lots.filter((lot) => lot.lotId === preferredLotId), ...lots.filter((lot) => lot.lotId !== preferredLotId)] : lots
  if (preferredLotId && !ordered.some((lot) => lot.lotId === preferredLotId)) throw new PlantError(`The ${title} lot you picked has no free stock`, 409)
  const picks: PickedLot[] = []
  let remaining = kg3(kg)
  for (const lot of ordered) {
    if (remaining <= EPSILON) break
    const take = kg3(Math.min(lot.free, remaining))
    if (take <= EPSILON) continue
    picks.push({ lotId: lot.lotId, lotNumber: lot.lotNumber, place: lot.place, kg: take })
    remaining = kg3(remaining - take)
  }
  if (remaining > EPSILON) {
    const free = kg3(lots.reduce((sum, lot) => sum + lot.free, 0))
    throw new PlantError(`Only ${free} kg of ${title} is in stock (approved lots); this needs ${kg3(kg)} kg`, 409, { productTitle: title, free, needed: kg3(kg) })
  }
  return picks
}

type Movement = { reason: string; reasonCode: string; performedAt: Date; metadata: Record<string, unknown> }

export async function consumeLots(ctx: StoreContext, stock: PlantStock, productId: string, picks: PickedLot[], movement: Movement) {
  const variantId = stock.variants.get(productId)
  if (!variantId) throw new PlantError('That item has no stock record', 404)
  for (const pick of picks) {
    await runCommand(ctx, 'wms.inventory.adjust', {
      warehouseId: stock.warehouseId,
      locationId: stock.locationOf(pick.place as StockPlace),
      catalogVariantId: variantId,
      lotId: pick.lotId,
      delta: -kg3(pick.kg),
      reason: movement.reason,
      reasonCode: movement.reasonCode,
      referenceType: 'manual',
      referenceId: randomUUID(),
      performedBy: performerId(ctx),
      performedAt: movement.performedAt,
      metadata: movement.metadata,
    })
  }
}

export async function returnLots(ctx: StoreContext, stock: PlantStock, productId: string, picks: PickedLot[], movement: Movement) {
  const variantId = stock.variants.get(productId)
  if (!variantId) throw new PlantError('That item has no stock record', 404)
  for (const pick of picks) {
    await runCommand(ctx, 'wms.inventory.adjust', {
      warehouseId: stock.warehouseId,
      locationId: stock.locationOf(pick.place as StockPlace),
      catalogVariantId: variantId,
      lotId: pick.lotId,
      delta: kg3(pick.kg),
      reason: movement.reason,
      reasonCode: movement.reasonCode,
      referenceType: 'manual',
      referenceId: randomUUID(),
      performedBy: performerId(ctx),
      performedAt: movement.performedAt,
      metadata: movement.metadata,
    })
  }
}

export async function produceLot(
  ctx: StoreContext,
  stock: PlantStock,
  input: { productId: string; place: StockPlace; lotNumber: string; existingLotId: string | null; kg: number; manufacturedAt: string; expiresAt?: string | null; lotMetadata?: Record<string, unknown> } & Movement,
): Promise<string> {
  const variantId = stock.variants.get(input.productId)
  if (!variantId) throw new PlantError('That item has no stock record', 404)
  let lotId = input.existingLotId
  if (!lotId) {
    const [variant] = await ctx.em.getConnection().execute<Array<{ sku: string | null }>>('select sku from catalog_product_variants where id = ? and tenant_id = ? and organization_id = ?', [variantId, ctx.tenantId, ctx.organizationId])
    if (!variant?.sku) throw new PlantError('That item has no stock code (SKU) yet', 409)
    const [existing] = await ctx.em.getConnection().execute<Array<{ id: string }>>(
      'select id from wms_inventory_lots where catalog_variant_id = ? and lot_number = ? and organization_id = ? and deleted_at is null limit 1',
      [variantId, input.lotNumber, ctx.organizationId],
    )
    lotId = existing?.id ?? (await runCommand<{ lotId: string }>(ctx, 'wms.lots.create', {
      catalogVariantId: variantId,
      sku: variant.sku,
      lotNumber: input.lotNumber,
      batchNumber: input.lotNumber,
      manufacturedAt: input.manufacturedAt,
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      status: 'available',
      metadata: { ...input.metadata, ...(input.lotMetadata ?? {}) },
    })).lotId
  }
  await runCommand(ctx, 'wms.inventory.receive', {
    warehouseId: stock.warehouseId,
    locationId: stock.locationOf(input.place),
    catalogVariantId: variantId,
    lotId,
    quantity: kg3(input.kg),
    referenceType: 'manual',
    referenceId: randomUUID(),
    performedBy: performerId(ctx),
    performedAt: input.performedAt,
    reason: input.reason,
    metadata: input.metadata,
  })
  return lotId
}

export async function lotOnHand(ctx: StoreContext, stock: PlantStock, productId: string, lotId: string, place: StockPlace): Promise<number> {
  const variantId = stock.variants.get(productId)
  if (!variantId) return 0
  const [row] = await ctx.em.getConnection().execute<Array<{ free: string }>>(
    `select (quantity_on_hand - quantity_reserved - quantity_allocated) as free from wms_inventory_balances
      where catalog_variant_id = ? and location_id = ? and lot_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null limit 1`,
    [variantId, stock.locationOf(place), lotId, ctx.tenantId, ctx.organizationId],
  )
  return row ? kg3(Number(row.free)) : 0
}

export function movementTime(isoDate: string): Date {
  return new Date(`${isoDate}T12:00:00+05:30`)
}
