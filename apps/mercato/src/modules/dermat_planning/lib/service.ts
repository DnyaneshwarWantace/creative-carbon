import type { EntityManager } from '@mikro-orm/postgresql'
import { DermatOrder, DermatOrderLine, DermatOrderStage } from '../../dermat_orders/data/entities'
import { approvedPackBoms, currentUserName, loadCustomers, loadProducts, type OrderContext } from '../../dermat_orders/lib/server'
import { STAGES } from '../../dermat_orders/lib/stages'
import { BomHeader } from '../../dermat_boms/data/entities'
import { explodeBom } from '../../dermat_boms/lib/explode'
import { LOCATION_CODES, dermatWarehouse, isUsable, lotsAtLocation, variantsForProducts, type StockScope } from '../../dermat_products/lib/stock'
import { openPurchaseFor } from '../../dermat_purchase/lib/service'
import { PlanningLog, PlanningReservation } from '../data/entities'
import type { PlanItemInput } from '../data/validators'
import { nextSeriesCode } from '../../dermat_accounts/lib/numberSeries'

const EPSILON = 0.000001

export class PlanningError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

type Scope = { em: EntityManager; tenantId: string; organizationId: string }

function num(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function round(value: number): number {
  return Math.round(value * 10000) / 10000
}

function stockScope(ctx: Scope): StockScope {
  return { em: ctx.em, tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

export async function reservationsFor(ctx: Scope, filter: { orderIds?: string[]; productIds?: string[] }): Promise<PlanningReservation[]> {
  const where: Record<string, unknown> = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, quantity: { $gt: 0 } }
  if (filter.orderIds) where.orderId = { $in: filter.orderIds }
  if (filter.productIds) where.productId = { $in: filter.productIds }
  if ((filter.orderIds && !filter.orderIds.length) || (filter.productIds && !filter.productIds.length)) return []
  return ctx.em.find(PlanningReservation, where, { orderBy: { since: 'asc' } })
}

async function storeLots(ctx: Scope, productIds: string[]) {
  const scope = stockScope(ctx)
  const [warehouse, variants] = await Promise.all([dermatWarehouse(scope), variantsForProducts(scope, productIds)])
  if (!warehouse) return { variants, lots: [] as Awaited<ReturnType<typeof lotsAtLocation>> }
  const variantIds = Array.from(variants.values())
  const locations = [warehouse.locations.get(LOCATION_CODES.rm), warehouse.locations.get(LOCATION_CODES.pm)].filter((id): id is string => Boolean(id))
  const lots = (await Promise.all(locations.map((location) => lotsAtLocation(scope, variantIds, location)))).flat()
  return { variants, lots }
}

export async function storeStock(ctx: Scope, productIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (!productIds.length) return result
  const { variants, lots } = await storeLots(ctx, productIds)
  for (const [productId, variantId] of variants) {
    result.set(productId, round(lots.filter((lot) => lot.variantId === variantId && isUsable(lot)).reduce((sum, lot) => sum + lot.onHand, 0)))
  }
  return result
}

export async function underTestStock(ctx: Scope, productIds: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>()
  if (!productIds.length) return result
  const { variants, lots } = await storeLots(ctx, productIds)
  for (const [productId, variantId] of variants) {
    result.set(productId, round(lots.filter((lot) => lot.variantId === variantId && lot.status === 'quarantine').reduce((sum, lot) => sum + lot.onHand, 0)))
  }
  return result
}

export async function freeFor(ctx: Scope, productId: string, exceptOrderId?: string): Promise<{ inStore: number; reservedOther: number; free: number; holders: PlanningReservation[] }> {
  const [stock, reservations] = await Promise.all([storeStock(ctx, [productId]), reservationsFor(ctx, { productIds: [productId] })])
  const holders = reservations.filter((entry) => entry.orderId !== exceptOrderId)
  const reservedOther = holders.reduce((sum, entry) => sum + num(entry.quantity), 0)
  const inStore = stock.get(productId) ?? 0
  return { inStore, reservedOther: round(reservedOther), free: round(Math.max(0, inStore - reservedOther)), holders }
}

function log(ctx: Scope, entry: { action: PlanningLog['action']; orderId: string; orderNo: string; toOrderId?: string | null; toOrderNo?: string | null; productId: string; quantity: number; note?: string | null; byName: string | null }) {
  ctx.em.persist(
    ctx.em.create(PlanningLog, {
      organizationId: ctx.organizationId,
      tenantId: ctx.tenantId,
      action: entry.action,
      orderId: entry.orderId,
      orderNo: entry.orderNo,
      toOrderId: entry.toOrderId ?? null,
      toOrderNo: entry.toOrderNo ?? null,
      productId: entry.productId,
      quantity: String(round(entry.quantity)),
      note: entry.note ?? null,
      byName: entry.byName,
    }),
  )
}

async function findOpenOrder(ctx: Scope, orderId: string): Promise<DermatOrder> {
  const order = await ctx.em.findOne(DermatOrder, { id: orderId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!order) throw new PlanningError('Order not found', 404)
  if (order.status === 'cancelled' || order.status === 'completed') throw new PlanningError(`${order.orderNo} is ${order.status}. Reserve only for open orders.`, 409)
  return order
}

async function holding(ctx: Scope, orderId: string, productId: string): Promise<PlanningReservation | null> {
  return ctx.em.findOne(PlanningReservation, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, orderId, productId })
}

async function write(ctx: Scope, order: DermatOrder, productId: string, quantity: number, byName: string | null, note: string | null) {
  const current = await holding(ctx, order.id, productId)
  if (quantity <= EPSILON) {
    if (current) ctx.em.remove(current)
    return
  }
  if (current) {
    current.quantity = String(round(quantity))
    current.byName = byName
    if (note) current.note = note
    current.updatedAt = new Date()
    return
  }
  ctx.em.persist(
    ctx.em.create(PlanningReservation, {
      organizationId: ctx.organizationId,
      tenantId: ctx.tenantId,
      orderId: order.id,
      orderNo: order.orderNo,
      productId,
      quantity: String(round(quantity)),
      note,
      byName,
    }),
  )
}

async function productLabel(ctx: OrderContext, productId: string): Promise<{ title: string; unit: string }> {
  const product = (await loadProducts(ctx, [productId])).get(productId)
  if (!product) throw new PlanningError('Material not found', 404)
  if (product.kind !== 'raw_material' && product.kind !== 'packing_material') throw new PlanningError(`${product.title} is not a raw or packing material`)
  return { title: product.title, unit: product.unit ?? '' }
}

export async function setReservation(ctx: OrderContext, orderId: string, productId: string, quantity: number, note: string | null): Promise<number> {
  const order = await findOpenOrder(ctx, orderId)
  const product = await productLabel(ctx, productId)
  const current = num((await holding(ctx, orderId, productId))?.quantity)
  if (quantity > current + EPSILON) {
    const { free, holders } = await freeFor(ctx, productId, orderId)
    if (quantity > free + EPSILON) {
      const others = holders.map((entry) => `${entry.orderNo} ${round(num(entry.quantity))}`).join(', ')
      throw new PlanningError(`Only ${round(free)} ${product.unit} of ${product.title} is free${others ? ` (reserved for ${others})` : ''}. Clear or move a reservation first.`, 409)
    }
  }
  const byName = await currentUserName(ctx)
  await write(ctx, order, productId, quantity, byName, note)
  log(ctx, { action: quantity > EPSILON ? 'reserve' : 'clear', orderId, orderNo: order.orderNo, productId, quantity, note, byName })
  await ctx.em.flush()
  return round(quantity)
}

export async function clearReservation(ctx: OrderContext, orderId: string, productId: string, note: string | null) {
  const current = await holding(ctx, orderId, productId)
  if (!current) throw new PlanningError('Nothing is reserved for this order', 404)
  const byName = await currentUserName(ctx)
  log(ctx, { action: 'clear', orderId, orderNo: current.orderNo, productId, quantity: num(current.quantity), note, byName })
  ctx.em.remove(current)
  await ctx.em.flush()
}

export async function moveReservation(ctx: OrderContext, fromOrderId: string, toOrderId: string, productId: string, quantity: number, note: string) {
  if (fromOrderId === toOrderId) throw new PlanningError('Pick a different order to move it to')
  const from = await holding(ctx, fromOrderId, productId)
  if (!from || num(from.quantity) < quantity - EPSILON) throw new PlanningError(`Only ${round(num(from?.quantity))} is reserved for that order`, 409)
  const [source, target] = await Promise.all([findOpenOrder(ctx, fromOrderId), findOpenOrder(ctx, toOrderId)])
  await productLabel(ctx, productId)
  const byName = await currentUserName(ctx)
  const targetCurrent = num((await holding(ctx, toOrderId, productId))?.quantity)
  await write(ctx, source, productId, num(from.quantity) - quantity, byName, null)
  await write(ctx, target, productId, targetCurrent + quantity, byName, note)
  log(ctx, { action: 'move', orderId: source.id, orderNo: source.orderNo, toOrderId: target.id, toOrderNo: target.orderNo, productId, quantity, note, byName })
  await ctx.em.flush()
}

export async function reserveNeeded(ctx: OrderContext, entries: Array<{ orderId: string; productId: string; quantity: number }>) {
  const results: Array<{ orderId: string; productId: string; wanted: number; reserved: number }> = []
  for (const entry of entries) {
    const current = num((await holding(ctx, entry.orderId, entry.productId))?.quantity)
    const { free } = await freeFor(ctx, entry.productId, entry.orderId)
    const target = round(Math.min(entry.quantity, free))
    if (target > current + EPSILON) await setReservation(ctx, entry.orderId, entry.productId, target, null)
    results.push({ orderId: entry.orderId, productId: entry.productId, wanted: round(entry.quantity), reserved: round(Math.max(current, target)) })
  }
  return results
}

export async function consumeReservation(ctx: Scope & { userName?: string | null }, orderId: string, productId: string, quantity: number, note: string | null) {
  const current = await holding(ctx, orderId, productId)
  if (!current) return 0
  const used = Math.min(num(current.quantity), quantity)
  const left = round(num(current.quantity) - used)
  log(ctx, { action: 'issued', orderId, orderNo: current.orderNo, productId, quantity: used, note, byName: ctx.userName ?? null })
  if (left <= EPSILON) ctx.em.remove(current)
  else {
    current.quantity = String(left)
    current.updatedAt = new Date()
  }
  return round(used)
}

export type CalcSource = { key: string; orderId: string | null; orderNo: string | null; label: string; required: number; reserved: number; since: string | null }
export type CalcRow = {
  productId: string
  title: string
  code: string | null
  kind: string | null
  unit: string | null
  required: number
  inStore: number
  reservedHere: number
  reservedOther: number
  free: number
  short: number
  underTest: number
  onOrder: number
  toOrder: number
  openPos: Array<{ poId: string; code: string; open: number; expectedDate: string | null; vendorName: string }>
  status: 'reserved' | 'available' | 'partial' | 'short'
  sources: CalcSource[]
  holders: Array<{ orderId: string; orderNo: string; quantity: number; since: string }>
}

export async function calculate(ctx: OrderContext, items: PlanItemInput[]) {
  const productIds = Array.from(new Set(items.map((item) => item.productId)))
  const products = await loadProducts(ctx, productIds)
  const bomCache = new Map<string, Awaited<ReturnType<typeof approvedPackBoms>>>()
  const bomFor = async (productId: string, orderId: string | null) => {
    const key = orderId ?? ''
    if (!bomCache.has(key)) bomCache.set(key, await approvedPackBoms(ctx, productIds, orderId))
    return bomCache.get(key)!.get(productId)
  }
  const orderIds = Array.from(new Set(items.map((item) => item.orderId).filter((id): id is string => Boolean(id))))
  const orders = orderIds.length ? await ctx.em.find(DermatOrder, { id: { $in: orderIds }, tenantId: ctx.tenantId, organizationId: ctx.organizationId }) : []
  const orderNos = new Map(orders.map((order) => [order.id, order.orderNo]))
  const totals = new Map<string, { title: string; code: string | null; kind: string | null; unit: string | null; required: number; sources: Map<string, CalcSource> }>()
  const missingBoms: string[] = []
  const headers = new Map<string, BomHeader | null>()
  for (const item of items) {
    const bom = await bomFor(item.productId, item.orderId)
    const product = products.get(item.productId)
    if (!bom || bom.status !== 'approved') {
      missingBoms.push(product?.title ?? item.productId)
      continue
    }
    if (!headers.has(bom.id)) headers.set(bom.id, await ctx.em.findOne(BomHeader, { id: bom.id }))
    const header = headers.get(bom.id)
    if (!header) continue
    const { requirements } = await explodeBom(ctx, header, item.quantity, item.orderId)
    const sourceKey = item.orderId ?? item.key
    const label = item.orderId ? (orderNos.get(item.orderId) ?? 'Order') : `What-if · ${product?.title ?? ''}`
    for (const row of requirements) {
      if (row.kind !== 'raw_material' && row.kind !== 'packing_material') continue
      const total = totals.get(row.productId) ?? { title: row.name, code: row.code, kind: row.kind, unit: row.unit, required: 0, sources: new Map<string, CalcSource>() }
      total.required += row.quantity
      const source = total.sources.get(sourceKey) ?? { key: sourceKey, orderId: item.orderId, orderNo: item.orderId ? (orderNos.get(item.orderId) ?? null) : null, label, required: 0, reserved: 0, since: null }
      source.required += row.quantity
      total.sources.set(sourceKey, source)
      totals.set(row.productId, total)
    }
  }
  const materialIds = Array.from(totals.keys())
  const [stock, reservations, testing, purchases] = await Promise.all([
    storeStock(ctx, materialIds),
    reservationsFor(ctx, { productIds: materialIds }),
    underTestStock(ctx, materialIds),
    openPurchaseFor(ctx, materialIds),
  ])
  const rows: CalcRow[] = materialIds.map((productId) => {
    const total = totals.get(productId)!
    const own = reservations.filter((entry) => entry.productId === productId)
    const here = own.filter((entry) => orderIds.includes(entry.orderId))
    const reservedHere = round(here.reduce((sum, entry) => sum + num(entry.quantity), 0))
    const reservedAll = round(own.reduce((sum, entry) => sum + num(entry.quantity), 0))
    const inStore = stock.get(productId) ?? 0
    const free = round(Math.max(0, inStore - reservedAll))
    const required = round(total.required)
    const short = round(Math.max(0, required - reservedHere - free))
    const sources = Array.from(total.sources.values()).map((source) => {
      const held = source.orderId ? own.find((entry) => entry.orderId === source.orderId) : null
      return { ...source, required: round(source.required), reserved: round(num(held?.quantity)), since: held ? held.since.toISOString() : null }
    })
    const status: CalcRow['status'] = reservedHere >= required - EPSILON ? 'reserved' : short > EPSILON ? 'short' : reservedHere > EPSILON ? 'partial' : 'available'
    return {
      productId,
      title: total.title,
      code: total.code,
      kind: total.kind,
      unit: total.unit,
      required,
      inStore,
      reservedHere,
      reservedOther: round(reservedAll - reservedHere),
      free,
      short,
      underTest: testing.get(productId) ?? 0,
      onOrder: round((purchases.get(productId) ?? []).reduce((sum, entry) => sum + entry.open, 0)),
      toOrder: round(Math.max(0, short - (testing.get(productId) ?? 0) - (purchases.get(productId) ?? []).reduce((sum, entry) => sum + entry.open, 0))),
      openPos: purchases.get(productId) ?? [],
      status,
      sources,
      holders: own.map((entry) => ({ orderId: entry.orderId, orderNo: entry.orderNo, quantity: round(num(entry.quantity)), since: entry.since.toISOString() })),
    }
  })
  rows.sort((a, b) => Number(b.short > 0) - Number(a.short > 0) || (a.kind ?? '').localeCompare(b.kind ?? '') || a.title.localeCompare(b.title))
  return { rows, missingBoms: Array.from(new Set(missingBoms)) }
}

export async function planningOrders(ctx: OrderContext) {
  const orders = await ctx.em.find(
    DermatOrder,
    { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, status: { $in: ['booked', 'confirmed'] } },
    { orderBy: { deliveryDate: 'asc', orderDate: 'asc' }, limit: 300 },
  )
  if (!orders.length) return []
  const ids = orders.map((order) => order.id)
  const [lines, stages] = await Promise.all([ctx.em.find(DermatOrderLine, { orderId: { $in: ids } }), ctx.em.find(DermatOrderStage, { orderId: { $in: ids } })])
  const productIds = lines.map((line) => line.productId)
  const [customers, products, boms, reservations] = await Promise.all([
    loadCustomers(ctx, orders.map((order) => order.customerId)),
    loadProducts(ctx, productIds),
    approvedPackBoms(ctx, productIds),
    reservationsFor(ctx, { orderIds: ids }),
  ])
  const orderBoms = await ctx.em.getConnection().execute<Array<{ order_id: string; product_id: string; status: string }>>(
    `select distinct on (order_id, product_id) order_id, product_id, status from dermat_bom_headers
      where order_id = any(?::uuid[]) and deleted_at is null and status <> 'superseded' order by order_id, product_id, (status = 'approved') desc, version desc`,
    [`{${ids.join(',')}}`],
  )
  const labels = new Map(STAGES.map((stage) => [stage.key, stage.label]))
  return orders.map((order) => {
    const own = stages.filter((stage) => stage.orderId === order.id)
    const planning = own.find((stage) => stage.stageKey === 'planning')
    const current = own.filter((stage) => stage.status === 'open' || stage.status === 'on_hold').map((stage) => labels.get(stage.stageKey) ?? stage.stageKey)
    return {
      id: order.id,
      orderNo: order.orderNo,
      orderDate: order.orderDate,
      deliveryDate: order.deliveryDate ?? null,
      customerName: customers.get(order.customerId)?.name ?? '—',
      planningStatus: planning?.status ?? 'waiting',
      planningHold: planning?.status === 'on_hold' ? (planning.holdReason ?? null) : null,
      current,
      reservedMaterials: reservations.filter((entry) => entry.orderId === order.id).length,
      lines: lines
        .filter((line) => line.orderId === order.id)
        .map((line) => ({
          id: line.id,
          productId: line.productId,
          title: products.get(line.productId)?.title ?? '—',
          code: products.get(line.productId)?.code ?? null,
          quantity: num(line.quantity),
          bomApproved: (orderBoms.find((entry) => entry.order_id === order.id && entry.product_id === line.productId)?.status ?? boms.get(line.productId)?.status) === 'approved',
        })),
    }
  })
}

export async function reservationList(ctx: OrderContext, filter: { orderId?: string; productId?: string }) {
  const reservations = await reservationsFor(ctx, { orderIds: filter.orderId ? [filter.orderId] : undefined, productIds: filter.productId ? [filter.productId] : undefined })
  const productIds = Array.from(new Set(reservations.map((entry) => entry.productId)))
  const [products, stock] = await Promise.all([loadProducts(ctx, productIds), storeStock(ctx, productIds)])
  const logWhere: Record<string, unknown> = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  if (filter.orderId) logWhere.$or = [{ orderId: filter.orderId }, { toOrderId: filter.orderId }]
  if (filter.productId) logWhere.productId = filter.productId
  const history = await ctx.em.find(PlanningLog, logWhere, { orderBy: { createdAt: 'desc' }, limit: 50 })
  const historyProducts = await loadProducts(ctx, history.map((entry) => entry.productId))
  return {
    items: reservations.map((entry) => ({
      id: entry.id,
      orderId: entry.orderId,
      orderNo: entry.orderNo,
      productId: entry.productId,
      title: products.get(entry.productId)?.title ?? '—',
      code: products.get(entry.productId)?.code ?? null,
      kind: products.get(entry.productId)?.kind ?? null,
      unit: products.get(entry.productId)?.unit ?? null,
      quantity: round(num(entry.quantity)),
      inStore: stock.get(entry.productId) ?? 0,
      since: entry.since.toISOString(),
      byName: entry.byName ?? null,
      note: entry.note ?? null,
      updatedAt: entry.updatedAt.toISOString(),
    })),
    history: history.map((entry) => ({
      id: entry.id,
      action: entry.action,
      orderId: entry.orderId,
      orderNo: entry.orderNo,
      toOrderNo: entry.toOrderNo ?? null,
      productId: entry.productId,
      title: historyProducts.get(entry.productId)?.title ?? '—',
      quantity: round(num(entry.quantity)),
      note: entry.note ?? null,
      byName: entry.byName ?? null,
      at: entry.createdAt.toISOString(),
    })),
  }
}

export type OrderReservationSummary = { productId: string; title: string; unit: string | null; quantity: number; since: string }

export async function reservationsForOrder(ctx: OrderContext, orderId: string): Promise<OrderReservationSummary[]> {
  const reservations = await reservationsFor(ctx, { orderIds: [orderId] })
  const products = await loadProducts(ctx, reservations.map((entry) => entry.productId))
  return reservations.map((entry) => ({
    productId: entry.productId,
    title: products.get(entry.productId)?.title ?? '—',
    unit: products.get(entry.productId)?.unit ?? null,
    quantity: round(num(entry.quantity)),
    since: entry.since.toISOString(),
  }))
}

export async function nextPlanCode(ctx: Scope): Promise<string> {
  return nextSeriesCode(ctx, 'PL')
}

export async function releaseAllForOrder(ctx: Scope, orderId: string, note: string, byName: string | null): Promise<number> {
  const reservations = await reservationsFor(ctx, { orderIds: [orderId] })
  for (const entry of reservations) {
    log(ctx, { action: 'clear', orderId, orderNo: entry.orderNo, productId: entry.productId, quantity: num(entry.quantity), note, byName })
    ctx.em.remove(entry)
  }
  return reservations.length
}
