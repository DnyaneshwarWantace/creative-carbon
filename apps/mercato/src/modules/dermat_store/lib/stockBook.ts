import { randomUUID } from 'node:crypto'
import { currentUserName, loadProducts, userNames } from '../../dermat_orders/lib/server'
import { LOCATION_CODES, dermatWarehouse, variantsForProducts } from '../../dermat_products/lib/stock'
import { reservationsFor } from '../../dermat_planning/lib/service'
import { activeOptions } from '../../dermat_lists/lib/service'
import { ensureStockRecords } from './stockSetup'
import { StoreError, performerId, runCommand, type StoreContext } from './server'

export type StockPlace = keyof typeof LOCATION_CODES

export const PLACE_LABEL: Record<StockPlace, string> = { rm: 'RM store', pm: 'PM store', production: 'Production floor', fg: 'FG store' }

const EPSILON = 0.000001
const EXPIRY_WARNING_DAYS = 90

function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  return Math.round((Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / 86400000)
}

async function placeLocations(ctx: StoreContext) {
  const warehouse = await dermatWarehouse(ctx)
  if (!warehouse) throw new StoreError('The Dermat warehouse is not set up yet', 409)
  const byPlace = new Map<StockPlace, string>()
  for (const [place, code] of Object.entries(LOCATION_CODES) as Array<[StockPlace, string]>) {
    const id = warehouse.locations.get(code)
    if (id) byPlace.set(place, id)
  }
  return { warehouseId: warehouse.warehouseId, byPlace, byId: new Map([...byPlace.entries()].map(([place, id]) => [id, place])) }
}

type BalanceRow = { catalog_variant_id: string; product_id: string; lot_id: string | null; lot_number: string | null; status: string | null; on_hand: string; free: string; expires_at: Date | null; manufactured_at: Date | null; received: Date | null }

export async function stockBook(ctx: StoreContext, place: StockPlace, filter: { q?: string; view?: 'all' | 'under_test' | 'expiring' | 'hold' }) {
  const { byPlace } = await placeLocations(ctx)
  const locationId = byPlace.get(place)
  if (!locationId) throw new StoreError(`${PLACE_LABEL[place]} location is missing`, 409)
  const rows = await ctx.em.getConnection().execute<BalanceRow[]>(
    `select b.catalog_variant_id, v.product_id, b.lot_id, lot.lot_number, coalesce(lot.status, 'available') as status,
            b.quantity_on_hand as on_hand, (b.quantity_on_hand - b.quantity_reserved - b.quantity_allocated) as free,
            lot.expires_at, lot.manufactured_at, b.created_at as received
       from wms_inventory_balances b
       join catalog_product_variants v on v.id = b.catalog_variant_id
       left join wms_inventory_lots lot on lot.id = b.lot_id
      where b.location_id = ? and b.tenant_id = ? and b.organization_id = ? and b.deleted_at is null and b.quantity_on_hand > 0
      order by b.created_at asc`,
    [locationId, ctx.tenantId, ctx.organizationId],
  )
  const productIds = [...new Set(rows.map((row) => row.product_id))]
  const [products, reservations] = await Promise.all([
    loadProducts(ctx, productIds),
    place === 'rm' || place === 'pm' ? reservationsFor(ctx, { productIds }) : Promise.resolve([]),
  ])
  const reserved = new Map<string, number>()
  for (const entry of reservations) reserved.set(entry.productId, (reserved.get(entry.productId) ?? 0) + Number(entry.quantity))

  const grouped = new Map<string, { productId: string; code: string | null; title: string; kind: string | null; unit: string | null; lots: Array<{ lotId: string | null; lotNumber: string | null; status: string; onHand: number; free: number; expiresAt: string | null; manufacturedAt: string | null; receivedAt: string | null; daysToExpiry: number | null }> }>()
  for (const row of rows) {
    const product = products.get(row.product_id)
    const entry = grouped.get(row.product_id) ?? { productId: row.product_id, code: product?.code ?? null, title: product?.title ?? '(deleted product)', kind: product?.kind ?? null, unit: product?.unit ?? null, lots: [] }
    const expiresAt = row.expires_at ? new Date(row.expires_at).toISOString().slice(0, 10) : null
    entry.lots.push({
      lotId: row.lot_id,
      lotNumber: row.lot_number,
      status: row.status ?? 'available',
      onHand: round(Number(row.on_hand)),
      free: round(Number(row.free)),
      expiresAt,
      manufacturedAt: row.manufactured_at ? new Date(row.manufactured_at).toISOString().slice(0, 10) : null,
      receivedAt: row.received ? new Date(row.received).toISOString() : null,
      daysToExpiry: daysUntil(expiresAt),
    })
    grouped.set(row.product_id, entry)
  }

  let items = [...grouped.values()].map((entry) => {
    const usable = entry.lots.filter((lot) => lot.status === 'available' && (lot.daysToExpiry === null || lot.daysToExpiry >= 0))
    const onHand = round(entry.lots.reduce((sum, lot) => sum + lot.onHand, 0))
    const usableQty = round(usable.reduce((sum, lot) => sum + lot.free, 0))
    const reservedQty = round(reserved.get(entry.productId) ?? 0)
    const expiries = entry.lots.map((lot) => lot.daysToExpiry).filter((value): value is number => value !== null)
    return {
      ...entry,
      onHand,
      usable: usableQty,
      underTest: round(entry.lots.filter((lot) => lot.status === 'quarantine').reduce((sum, lot) => sum + lot.onHand, 0)),
      onHold: round(entry.lots.filter((lot) => lot.status === 'hold' || lot.status === 'expired').reduce((sum, lot) => sum + lot.onHand, 0)),
      reserved: reservedQty,
      free: round(Math.max(0, usableQty - reservedQty)),
      nextExpiryDays: expiries.length ? Math.min(...expiries) : null,
    }
  })

  const summary = {
    items: items.length,
    lots: items.reduce((sum, item) => sum + item.lots.length, 0),
    underTest: items.filter((item) => item.underTest > EPSILON).length,
    onHold: items.filter((item) => item.onHold > EPSILON).length,
    expiringSoon: items.filter((item) => item.nextExpiryDays !== null && item.nextExpiryDays >= 0 && item.nextExpiryDays <= EXPIRY_WARNING_DAYS).length,
    expired: items.filter((item) => item.nextExpiryDays !== null && item.nextExpiryDays < 0).length,
  }

  const term = filter.q?.trim().toLowerCase()
  if (term) items = items.filter((item) => item.title.toLowerCase().includes(term) || (item.code ?? '').toLowerCase().includes(term) || item.lots.some((lot) => (lot.lotNumber ?? '').toLowerCase().includes(term)))
  if (filter.view === 'under_test') items = items.filter((item) => item.underTest > EPSILON)
  if (filter.view === 'hold') items = items.filter((item) => item.onHold > EPSILON)
  if (filter.view === 'expiring') items = items.filter((item) => item.nextExpiryDays !== null && item.nextExpiryDays <= EXPIRY_WARNING_DAYS)
  items.sort((a, b) => (a.code ?? a.title).localeCompare(b.code ?? b.title))
  return { place, label: PLACE_LABEL[place], summary, items, expiryWarningDays: EXPIRY_WARNING_DAYS }
}

type MovementRow = { id: string; type: string; quantity: string; location_from_id: string | null; location_to_id: string | null; product_id: string | null; lot_number: string | null; reason: string | null; reason_code: string | null; performed_by: string | null; performed_at: Date; metadata: Record<string, unknown> | null }

export async function stockLedger(ctx: StoreContext, filter: { place?: StockPlace; productId?: string; limit: number; offset: number }) {
  const { byPlace, byId } = await placeLocations(ctx)
  const where: string[] = ['m.tenant_id = ?', 'm.organization_id = ?', 'm.deleted_at is null']
  const params: unknown[] = [ctx.tenantId, ctx.organizationId]
  if (filter.place) {
    const id = byPlace.get(filter.place)
    where.push('(m.location_from_id = ? or m.location_to_id = ?)')
    params.push(id, id)
  }
  if (filter.productId) {
    where.push('v.product_id = ?')
    params.push(filter.productId)
  }
  const rows = await ctx.em.getConnection().execute<MovementRow[]>(
    `select m.id, m.type, m.quantity, m.location_from_id, m.location_to_id, v.product_id, lot.lot_number, m.reason, m.reason_code, m.performed_by, m.performed_at, m.metadata
       from wms_inventory_movements m
       left join catalog_product_variants v on v.id = m.catalog_variant_id
       left join wms_inventory_lots lot on lot.id = m.lot_id
      where ${where.join(' and ')}
      order by m.performed_at desc, m.created_at desc
      limit ? offset ?`,
    [...params, filter.limit + 1, filter.offset],
  )
  const page = rows.slice(0, filter.limit)
  const [products, names] = await Promise.all([
    loadProducts(ctx, page.map((row) => row.product_id ?? '').filter(Boolean)),
    userNames(ctx, page.map((row) => row.performed_by ?? '').filter(Boolean)),
  ])
  const placeOf = (id: string | null) => (id ? byId.get(id) ?? null : null)
  return {
    hasMore: rows.length > filter.limit,
    items: page.map((row) => {
      const from = placeOf(row.location_from_id)
      const to = placeOf(row.location_to_id)
      const quantity = Number(row.quantity)
      const signed = filter.place ? (row.type === 'adjust' ? quantity : to === filter.place && from !== filter.place ? Math.abs(quantity) : -Math.abs(quantity)) : quantity
      const product = row.product_id ? products.get(row.product_id) : undefined
      return {
        id: row.id,
        at: new Date(row.performed_at).toISOString(),
        type: row.type,
        quantity: round(signed),
        unit: product?.unit ?? null,
        from: from ? PLACE_LABEL[from] : null,
        to: to ? PLACE_LABEL[to] : null,
        productId: row.product_id,
        title: product?.title ?? '(deleted product)',
        code: product?.code ?? null,
        lotNumber: row.lot_number,
        reason: row.reason,
        reasonCode: row.reason_code,
        by: row.performed_by ? names.get(row.performed_by) ?? null : null,
        orderNo: typeof row.metadata?.orderNo === 'string' ? row.metadata.orderNo : null,
        orderId: typeof row.metadata?.orderId === 'string' ? row.metadata.orderId : null,
      }
    }),
  }
}

async function lotBalance(ctx: StoreContext, variantId: string, locationId: string, lotId: string | null) {
  const [row] = await ctx.em.getConnection().execute<Array<{ on_hand: string; free: string; status: string | null }>>(
    `select b.quantity_on_hand as on_hand, (b.quantity_on_hand - b.quantity_reserved - b.quantity_allocated) as free, lot.status
       from wms_inventory_balances b left join wms_inventory_lots lot on lot.id = b.lot_id
      where b.catalog_variant_id = ? and b.location_id = ? and b.tenant_id = ? and b.organization_id = ? and b.deleted_at is null
        and ${lotId ? 'b.lot_id = ?' : 'b.lot_id is null'}
      limit 1`,
    [variantId, locationId, ctx.tenantId, ctx.organizationId, ...(lotId ? [lotId] : [])],
  )
  return row ? { onHand: Number(row.on_hand), free: Number(row.free), status: row.status ?? 'available' } : null
}

export type AdjustInput = {
  place: StockPlace
  productId: string
  direction: 'in' | 'out'
  quantity: number
  lotId?: string | null
  newLot?: { lotNumber: string; expiryDate?: string | null; mfgDate?: string | null } | null
  reason: string
  note?: string | null
}

export async function adjustStock(ctx: StoreContext, input: AdjustInput) {
  const reasons = await activeOptions(ctx, 'stock_adjust_reasons')
  if (!reasons.includes(input.reason)) throw new StoreError('Pick a reason from the list')
  if (!(input.quantity > 0)) throw new StoreError('Enter a quantity above zero')
  const { warehouseId, byPlace } = await placeLocations(ctx)
  const locationId = byPlace.get(input.place)
  if (!locationId) throw new StoreError(`${PLACE_LABEL[input.place]} location is missing`, 409)
  const variants = await ensureStockRecords(ctx, [input.productId])
  const variantId = variants.get(input.productId) ?? (await variantsForProducts(ctx, [input.productId])).get(input.productId)
  if (!variantId) throw new StoreError('That product has no stock record', 404)
  const byName = await currentUserName(ctx)
  const text = `${input.reason}${input.note ? ` · ${input.note}` : ''}`
  const metadata = { source: 'dermat_store.adjust', reason: input.reason, note: input.note ?? null, byName }

  if (input.direction === 'out') {
    if (!input.lotId) throw new StoreError('Pick the batch to take stock from')
    const balance = await lotBalance(ctx, variantId, locationId, input.lotId)
    if (!balance || balance.onHand <= EPSILON) throw new StoreError(`That batch is not in the ${PLACE_LABEL[input.place]}`, 404)
    if (input.quantity > balance.free + EPSILON) throw new StoreError(`Only ${round(balance.free)} is free in that batch`, 409)
    await runCommand(ctx, 'wms.inventory.adjust', {
      warehouseId,
      locationId,
      catalogVariantId: variantId,
      lotId: input.lotId,
      delta: -round(input.quantity),
      reason: text,
      reasonCode: 'store_adjust_out',
      referenceType: 'manual',
      referenceId: randomUUID(),
      performedBy: performerId(ctx),
      metadata,
    })
    return
  }

  let lotId = input.lotId ?? null
  if (!lotId) {
    const lotNumber = input.newLot?.lotNumber?.trim()
    if (!lotNumber) throw new StoreError('Enter the batch / lot number of the stock you are adding')
    const [variant] = await ctx.em.getConnection().execute<Array<{ sku: string | null }>>('select sku from catalog_product_variants where id = ? and tenant_id = ? and organization_id = ?', [variantId, ctx.tenantId, ctx.organizationId])
    if (!variant?.sku) throw new StoreError('This material has no stock code (SKU) yet. Open the product and save it once.', 409)
    const lot = await runCommand<{ lotId: string }>(ctx, 'wms.lots.create', {
      catalogVariantId: variantId,
      sku: variant.sku,
      lotNumber,
      batchNumber: lotNumber,
      ...(input.newLot?.mfgDate ? { manufacturedAt: input.newLot.mfgDate } : {}),
      ...(input.newLot?.expiryDate ? { expiresAt: input.newLot.expiryDate } : {}),
      status: 'available',
      metadata,
    })
    lotId = lot.lotId
  }
  await runCommand(ctx, 'wms.inventory.receive', {
    warehouseId,
    locationId,
    catalogVariantId: variantId,
    lotId,
    quantity: round(input.quantity),
    referenceType: 'manual',
    referenceId: randomUUID(),
    performedBy: performerId(ctx),
    reason: text,
    metadata,
  })
}

export type TransferInput = { productId: string; lotId: string | null; from: StockPlace; to: StockPlace; quantity: number; note?: string | null }

export async function transferStock(ctx: StoreContext, input: TransferInput) {
  if (input.from === input.to) throw new StoreError('Pick two different places')
  if (!(input.quantity > 0)) throw new StoreError('Enter a quantity above zero')
  const { warehouseId, byPlace } = await placeLocations(ctx)
  const from = byPlace.get(input.from)
  const to = byPlace.get(input.to)
  if (!from || !to) throw new StoreError('A store location is missing', 409)
  const variantId = (await variantsForProducts(ctx, [input.productId])).get(input.productId)
  if (!variantId) throw new StoreError('That product has no stock record', 404)
  const balance = await lotBalance(ctx, variantId, from, input.lotId)
  if (!balance || balance.onHand <= EPSILON) throw new StoreError(`That batch is not in the ${PLACE_LABEL[input.from]}`, 404)
  if (balance.status !== 'available') throw new StoreError('Only QC-approved stock can be moved. This batch is under test or on hold.', 409)
  if (input.quantity > balance.free + EPSILON) throw new StoreError(`Only ${round(balance.free)} is free in that batch`, 409)
  const byName = await currentUserName(ctx)
  await runCommand(ctx, 'wms.inventory.move', {
    warehouseId,
    fromLocationId: from,
    toLocationId: to,
    catalogVariantId: variantId,
    ...(input.lotId ? { lotId: input.lotId } : {}),
    quantity: round(input.quantity),
    type: 'transfer',
    reason: `Moved ${PLACE_LABEL[input.from]} → ${PLACE_LABEL[input.to]}${input.note ? ` · ${input.note}` : ''}`,
    reasonCode: 'store_transfer',
    referenceType: 'transfer',
    referenceId: randomUUID(),
    performedBy: performerId(ctx),
    metadata: { source: 'dermat_store.transfer', note: input.note ?? null, byName },
  })
}
