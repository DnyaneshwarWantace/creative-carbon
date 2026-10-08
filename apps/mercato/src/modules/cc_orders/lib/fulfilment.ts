import type { StoreContext } from '../../cc_store/lib/server'
import { runCommand } from '../../cc_store/lib/server'
import type { StockPlace } from '../../cc_products/lib/stock'
import { lotsWithDetails, type LotInfo } from '../../cc_production/lib/finishing'
import { kg3, movementTime, plantStock, returnLots, consumeLots } from '../../cc_production/lib/plantStock'
import { MouldingEntry } from '../../cc_production/data/entities'
import { CcOrder, CcOrderAllocation, CcOrderLine, CcOrderPacking, CcOrderStage } from '../data/entities'
import { loadCustomers, loadProducts, OrderError, type OrderContext } from './server'
import { logEvent } from './engine'
import { stepStates } from './stages'
import type { LineSpecs } from './specs'

const EPSILON = 0.0005
const SOURCE = 'cc_orders.dispatch'

function scope(ctx: OrderContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

export function placesFor(kind: string | null): StockPlace[] {
  if (kind === 'laminate' || kind === 'moulded' || kind === 'bought_in') return ['fg']
  if (kind === 'bstage') return ['floor', 'fg']
  if (kind === 'resin') return ['tank']
  return ['wh_a', 'wh_b']
}

function asStore(ctx: OrderContext): StoreContext {
  const store = ctx as StoreContext
  if (!('organizationScope' in store) || !store.request) throw new OrderError('[internal] stock work needs the store context', 500)
  return store
}

async function stageOf(ctx: OrderContext, orderId: string, stageKey: string) {
  const stage = await ctx.em.findOne(CcOrderStage, { orderId, stageKey })
  if (!stage) throw new OrderError('Stage not found', 404)
  return stage
}

function requireOpen(stage: CcOrderStage, label: string) {
  if (stage.status !== 'open' && stage.status !== 'on_hold') throw new OrderError(stage.status === 'waiting' ? `${label} has not opened yet` : `${label} is finished. Reopen it to change it.`, 409)
}

function setSteps(stage: CcOrderStage, updates: Record<string, boolean>, byName: string | null) {
  const states = { ...stepStates(stage.data) }
  for (const [key, done] of Object.entries(updates)) {
    if (Boolean(states[key]?.done) === done) continue
    states[key] = { done, at: done ? new Date().toISOString() : null, by: done ? byName : null }
  }
  stage.data = { ...(stage.data ?? {}), __steps: states, __started: (stage.data as Record<string, unknown> | null)?.__started ?? { at: new Date().toISOString(), by: byName } }
}

type LineInfo = {
  line: CcOrderLine
  title: string
  kind: string | null
  unit: string
  qty: number
  material: Record<string, string>
}

async function orderLines(ctx: OrderContext, orderId: string): Promise<LineInfo[]> {
  const lines = await ctx.em.find(CcOrderLine, { orderId }, { orderBy: { position: 'asc' } })
  const products = await loadProducts(ctx, lines.map((line) => line.productId))
  return lines.map((line) => {
    const product = products.get(line.productId)
    return {
      line,
      title: product?.title ?? '(deleted item)',
      kind: product?.kind ?? null,
      unit: product?.unit ?? 'kg',
      qty: kg3(Number(line.quantity)),
      material: ((line.specs as LineSpecs | null)?.material ?? {}) as Record<string, string>,
    }
  })
}

function sumQty(rows: CcOrderAllocation[], field: 'qty' | 'shippedQty', status?: CcOrderAllocation['status'][]) {
  return kg3(rows.filter((row) => !status || status.includes(row.status)).reduce((sum, row) => sum + Number(row[field]), 0))
}

async function mouldedMade(ctx: OrderContext, order: CcOrder, dieNo: string | undefined): Promise<number | null> {
  if (!dieNo) return null
  const entries = await ctx.em.find(MouldingEntry, { ...scope(ctx), orderRef: order.orderNo, deletedAt: null })
  return entries.filter((entry) => entry.dieNo.toUpperCase() === dieNo.toUpperCase()).reduce((sum, entry) => sum + entry.productionNos, 0)
}

export async function fulfilmentView(ctx: OrderContext, order: CcOrder) {
  const [lines, allocations, packings] = await Promise.all([
    orderLines(ctx, order.id),
    ctx.em.find(CcOrderAllocation, { ...scope(ctx), orderId: order.id }, { orderBy: { createdAt: 'asc' } }),
    ctx.em.find(CcOrderPacking, { ...scope(ctx), orderId: order.id }),
  ])
  const lotIds = [...new Set(allocations.filter((row) => row.status !== 'released').map((row) => row.lotId))]
  const lotStatus = new Map<string, string>()
  if (lotIds.length) {
    const rows = await ctx.em.getConnection().execute<Array<{ id: string; status: string | null }>>('select id, status from wms_inventory_lots where id = any(?::uuid[]) and organization_id = ?', [`{${lotIds.join(',')}}`, ctx.organizationId])
    for (const row of rows) lotStatus.set(row.id, row.status ?? 'available')
  }
  const view = []
  for (const info of lines) {
    const own = allocations.filter((row) => row.lineId === info.line.id)
    const packing = packings.find((row) => row.lineId === info.line.id) ?? null
    const allocated = sumQty(own, 'qty', ['reserved', 'shipped'])
    view.push({
      lineId: info.line.id,
      productId: info.line.productId,
      title: info.title,
      kind: info.kind,
      unit: info.unit,
      qty: info.qty,
      material: info.material,
      allocated,
      short: kg3(Math.max(0, info.qty - allocated)),
      packed: packing ? Number(packing.packedQty) : null,
      weights: packing?.weights ?? [],
      despatched: sumQty(own, 'shippedQty'),
      made: info.kind === 'moulded' ? await mouldedMade(ctx, order, info.material.die_no) : null,
      allocations: own
        .filter((row) => row.status !== 'released')
        .map((row) => ({ id: row.id, lotId: row.lotId, lotNumber: row.lotNumber, place: row.place, qty: Number(row.qty), shippedQty: Number(row.shippedQty), status: row.status, lotStatus: lotStatus.get(row.lotId) ?? 'available', byName: row.byName ?? null, at: row.createdAt.toISOString() })),
    })
  }
  return {
    lines: view,
    totals: {
      ordered: kg3(view.reduce((sum, line) => sum + line.qty, 0)),
      allocated: kg3(view.reduce((sum, line) => sum + line.allocated, 0)),
      packed: kg3(view.reduce((sum, line) => sum + (line.packed ?? 0), 0)),
      despatched: kg3(view.reduce((sum, line) => sum + line.despatched, 0)),
    },
    onHold: view.flatMap((line) => line.allocations.filter((row) => row.status === 'reserved' && row.lotStatus !== 'available').map((row) => row.lotNumber)),
  }
}

function matches(lot: LotInfo, info: LineInfo): boolean {
  const thickness = Number(info.material.thickness_mm)
  if (Number.isFinite(thickness) && thickness > 0 && lot.thicknessMm !== null && Math.abs(lot.thicknessMm - thickness) > 0.001) return false
  return true
}

export async function allocationCandidates(ctx: OrderContext, order: CcOrder, lineId: string) {
  const info = (await orderLines(ctx, order.id)).find((entry) => entry.line.id === lineId)
  if (!info) throw new OrderError('Order line not found', 404)
  const lots = (await lotsWithDetails(asStore(ctx), { places: placesFor(info.kind) })).filter((lot) => lot.productId === info.line.productId && lot.free > EPSILON)
  const customerName = (await loadCustomers(ctx, [order.customerId])).get(order.customerId)?.name ?? null
  const forCustomer = (lot: LotInfo) => lot.metadata.customerId === order.customerId || (Boolean(customerName) && typeof lot.metadata.customerName === 'string' && lot.metadata.customerName.toLowerCase() === customerName!.toLowerCase())
  return lots
    .map((lot) => ({
      lotId: lot.lotId,
      lotNumber: lot.lotNumber,
      place: lot.place,
      placeLabel: lot.placeLabel,
      status: lot.status,
      free: lot.free,
      unit: lot.unit,
      nosLeft: lot.nosLeft,
      thicknessMm: lot.thicknessMm,
      sheetSize: typeof lot.metadata.sheetSize === 'string' ? lot.metadata.sheetSize : lot.cutSize,
      madeOn: lot.madeOn,
      expiresOn: typeof lot.metadata.shelfLifeDays === 'number' && lot.madeOn ? new Date(Date.parse(`${lot.madeOn}T00:00:00Z`) + Number(lot.metadata.shelfLifeDays) * 86_400_000).toISOString().slice(0, 10) : null,
      forCustomer: forCustomer(lot),
      markedFor: typeof lot.metadata.customerName === 'string' ? lot.metadata.customerName : lot.metadata.disposition === 'export' ? 'Export' : null,
      matches: matches(lot, info),
    }))
    .sort((left, right) => Number(right.forCustomer) - Number(left.forCustomer) || Number(right.matches) - Number(left.matches) || (left.madeOn ?? '').localeCompare(right.madeOn ?? ''))
}

async function refreshAllocationSteps(ctx: OrderContext, order: CcOrder, stage: CcOrderStage, byName: string | null) {
  const lines = await orderLines(ctx, order.id)
  const allocations = await ctx.em.find(CcOrderAllocation, { ...scope(ctx), orderId: order.id, status: { $in: ['reserved', 'shipped'] } })
  const full = lines.length > 0 && lines.every((info) => sumQty(allocations.filter((row) => row.lineId === info.line.id), 'qty') + EPSILON >= info.qty)
  const any = allocations.length > 0
  setSteps(stage, { checked: any || Boolean(stepStates(stage.data).checked?.done), allocated: full }, byName)
}

export async function allocateLot(ctx: OrderContext, order: CcOrder, input: { lineId: string; lotId: string; qty: number }, byName: string | null) {
  const stage = await stageOf(ctx, order.id, 'allocation')
  requireOpen(stage, 'Stock allocation')
  const info = (await orderLines(ctx, order.id)).find((entry) => entry.line.id === input.lineId)
  if (!info) throw new OrderError('Order line not found', 404)
  const store = asStore(ctx)
  const [lot] = await lotsWithDetails(store, { lotId: input.lotId })
  if (!lot || lot.productId !== info.line.productId) throw new OrderError('That lot is not this item', 400)
  if (!placesFor(info.kind).includes(lot.place)) throw new OrderError(`That lot is in the ${lot.placeLabel}; ${info.kind === 'laminate' || info.kind === 'moulded' ? 'only finished stock in the FG store' : 'it'} can be allocated`, 409)
  if (lot.status !== 'available') throw new OrderError(`${lot.lotNumber} is on hold`, 409)
  const already = sumQty(await ctx.em.find(CcOrderAllocation, { ...scope(ctx), orderId: order.id, lineId: info.line.id, status: { $in: ['reserved', 'shipped'] } }), 'qty')
  const qty = kg3(input.qty)
  if (qty > lot.free + EPSILON) throw new OrderError(`Only ${lot.free} ${lot.unit} of ${lot.lotNumber} is free`, 409)
  if (already + qty > info.qty + EPSILON) throw new OrderError(`The line needs only ${kg3(info.qty - already)} ${info.unit} more`, 400)
  const stock = await plantStock(store, [info.line.productId])
  const reservation = await runCommand<{ reservationId: string }>(store, 'wms.inventory.reserve', {
    warehouseId: stock.warehouseId,
    catalogVariantId: stock.variants.get(info.line.productId),
    lotId: lot.lotId,
    quantity: qty,
    sourceType: 'order',
    sourceId: order.id,
    metadata: { orderNo: order.orderNo, lineId: info.line.id },
  })
  ctx.em.persist(ctx.em.create(CcOrderAllocation, { ...scope(ctx), orderId: order.id, lineId: info.line.id, productId: info.line.productId, lotId: lot.lotId, lotNumber: lot.lotNumber, place: lot.place, qty: String(qty), unit: lot.unit, reservationId: reservation.reservationId, byName }))
  await ctx.em.flush()
  await refreshAllocationSteps(ctx, order, stage, byName)
  logEvent(ctx, order, 'allocated', 'allocation', `${info.title}: ${qty} ${lot.unit} from ${lot.lotNumber}`, byName)
  await ctx.em.flush()
}

export async function releaseAllocation(ctx: OrderContext, order: CcOrder, allocationId: string, byName: string | null) {
  const stage = await stageOf(ctx, order.id, 'allocation')
  requireOpen(stage, 'Stock allocation')
  const allocation = await ctx.em.findOne(CcOrderAllocation, { ...scope(ctx), id: allocationId, orderId: order.id })
  if (!allocation || allocation.status !== 'reserved') throw new OrderError('That allocation is not held any more', 409)
  if (Number(allocation.shippedQty) > EPSILON) throw new OrderError('Part of it is despatched already', 409)
  if (allocation.reservationId) await runCommand(asStore(ctx), 'wms.inventory.release', { reservationId: allocation.reservationId, reason: `Released from order ${order.orderNo}` })
  allocation.status = 'released'
  await ctx.em.flush()
  await refreshAllocationSteps(ctx, order, stage, byName)
  logEvent(ctx, order, 'unallocated', 'allocation', `${allocation.lotNumber}: ${allocation.qty} ${allocation.unit} released`, byName)
  await ctx.em.flush()
}

export async function savePacking(ctx: OrderContext, order: CcOrder, input: { lineId: string; weights: number[]; pieces: number | null; notes: string | null }, byName: string | null) {
  const stage = await stageOf(ctx, order.id, 'packing')
  requireOpen(stage, 'Packing & weighment')
  const lines = await orderLines(ctx, order.id)
  const info = lines.find((entry) => entry.line.id === input.lineId)
  if (!info) throw new OrderError('Order line not found', 404)
  const weights = input.weights.map((value) => kg3(value)).filter((value) => value > 0)
  const packedQty = info.unit === 'nos' ? input.pieces ?? weights.length : kg3(weights.reduce((sum, value) => sum + value, 0))
  if (!(packedQty > 0)) throw new OrderError(info.unit === 'nos' ? 'Enter the pieces packed' : 'Enter the weight of each sheet')
  const allocated = sumQty(await ctx.em.find(CcOrderAllocation, { ...scope(ctx), orderId: order.id, lineId: info.line.id, status: { $in: ['reserved', 'shipped'] } }), 'qty')
  let packing = await ctx.em.findOne(CcOrderPacking, { ...scope(ctx), orderId: order.id, lineId: info.line.id })
  if (!packing) {
    packing = ctx.em.create(CcOrderPacking, { ...scope(ctx), orderId: order.id, lineId: info.line.id, weights, packedQty: String(packedQty), unit: info.unit, notes: input.notes, byName })
    ctx.em.persist(packing)
  } else Object.assign(packing, { weights, packedQty: String(packedQty), notes: input.notes, byName })
  await ctx.em.flush()
  const packings = await ctx.em.find(CcOrderPacking, { ...scope(ctx), orderId: order.id })
  const allWeighed = lines.every((entry) => packings.some((row) => row.lineId === entry.line.id && Number(row.packedQty) > 0))
  setSteps(stage, { weighed: allWeighed }, byName)
  const netKg = kg3(packings.filter((row) => row.unit !== 'nos').reduce((sum, row) => sum + Number(row.packedQty), 0))
  if (netKg > 0) stage.data = { ...(stage.data ?? {}), net_kg: netKg }
  logEvent(ctx, order, 'weighed', 'packing', `${info.title}: ${info.unit === 'nos' ? `${packedQty} pcs` : `${weights.length} sheets, ${packedQty} kg`}`, byName)
  await ctx.em.flush()
  return { packedQty, allocated, overAllocated: packedQty > allocated + EPSILON }
}

export async function markPacked(ctx: OrderContext, order: CcOrder, byName: string | null) {
  const stage = await stageOf(ctx, order.id, 'packing')
  requireOpen(stage, 'Packing & weighment')
  if (!stepStates(stage.data).weighed?.done) throw new OrderError('Weigh every line first', 400)
  setSteps(stage, { packed: true }, byName)
  logEvent(ctx, order, 'step_done', 'packing', 'Packed', byName)
  await ctx.em.flush()
}

export async function qcView(ctx: OrderContext, order: CcOrder) {
  const allocations = await ctx.em.find(CcOrderAllocation, { ...scope(ctx), orderId: order.id, status: { $in: ['reserved', 'shipped'] } })
  if (!allocations.length) return { lots: [], allThickness: false, allFg: false }
  const store = asStore(ctx)
  const lots = []
  for (const allocation of allocations) {
    const [lot] = await lotsWithDetails(store, { lotId: allocation.lotId })
    const parent = typeof lot?.metadata.parentLot === 'string' ? lot.metadata.parentLot : null
    const thickness = parent
      ? await ctx.em.getConnection().execute<Array<{ result: string; inspect_date: string }>>(
          `select t.result, t.inspect_date from cc_thickness_inspections t join wms_inventory_lots l on l.id = t.lot_id
            where t.organization_id = ? and t.deleted_at is null and l.lot_number = ? order by t.created_at desc limit 1`,
          [ctx.organizationId, parent],
        )
      : []
    lots.push({
      allocationId: allocation.id,
      lotId: allocation.lotId,
      lotNumber: allocation.lotNumber,
      status: lot?.status ?? 'available',
      fgInspected: Boolean(lot?.metadata.fgReportId) || Boolean(lot?.metadata.boughtIn),
      thickness: thickness[0] ? { result: thickness[0].result, date: thickness[0].inspect_date } : null,
      boughtIn: Boolean(lot?.metadata.boughtIn),
    })
  }
  return {
    lots,
    allFg: lots.every((lot) => lot.fgInspected),
    allThickness: lots.every((lot) => lot.boughtIn || lot.thickness?.result === 'pass'),
  }
}

export async function syncQcSteps(ctx: OrderContext, order: CcOrder, byName: string | null) {
  const stage = await stageOf(ctx, order.id, 'qc')
  requireOpen(stage, 'QC & test report')
  const view = await qcView(ctx, order)
  if (!view.lots.length) throw new OrderError('Nothing is allocated to this order yet', 409)
  setSteps(stage, { thickness: view.allThickness, fg_inspection: view.allThickness && view.allFg }, byName)
  await ctx.em.flush()
  return view
}

export async function qcGate(ctx: OrderContext, order: CcOrder) {
  const view = await fulfilmentView(ctx, order)
  if (view.onHold.length) throw new OrderError(`These allocated lots are on hold: ${view.onHold.join(', ')}. Release them or clear the hold first.`, 409)
}

export async function saleOut(ctx: OrderContext, order: CcOrder, byName: string | null) {
  const store = asStore(ctx)
  const lines = await orderLines(ctx, order.id)
  const allocations = await ctx.em.find(CcOrderAllocation, { ...scope(ctx), orderId: order.id, status: 'reserved' }, { orderBy: { createdAt: 'asc' } })
  const packings = await ctx.em.find(CcOrderPacking, { ...scope(ctx), orderId: order.id })
  if (!allocations.length) throw new OrderError('Nothing is allocated to this order. Allocate stock first.', 409)
  const plan: Array<{ allocation: CcOrderAllocation; take: number }> = []
  for (const info of lines) {
    const own = allocations.filter((row) => row.lineId === info.line.id)
    if (!own.length) continue
    const held = sumQty(own, 'qty')
    const packing = packings.find((row) => row.lineId === info.line.id)
    const ship = packing ? Number(packing.packedQty) : held
    if (ship > held + EPSILON) throw new OrderError(`${info.title}: packed ${ship} ${info.unit} but only ${held} ${info.unit} is allocated. Allocate more stock before despatch.`, 409)
    let remaining = kg3(ship)
    for (const allocation of own) {
      if (remaining <= EPSILON) break
      const take = kg3(Math.min(remaining, Number(allocation.qty)))
      plan.push({ allocation, take })
      remaining = kg3(remaining - take)
    }
  }
  const performedAt = movementTime(new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10))
  for (const { allocation, take } of plan) {
    const stock = await plantStock(store, [allocation.productId])
    if (allocation.reservationId) await runCommand(store, 'wms.inventory.release', { reservationId: allocation.reservationId, reason: `Despatched on order ${order.orderNo}` })
    await consumeLots(store, stock, allocation.productId, [{ lotId: allocation.lotId, lotNumber: allocation.lotNumber, place: allocation.place, kg: take }], {
      reason: `Despatched to customer on ${order.orderNo}`,
      reasonCode: 'sale_out',
      performedAt,
      metadata: { source: SOURCE, orderId: order.id, orderNo: order.orderNo, byName },
    })
    const rest = kg3(Number(allocation.qty) - take)
    allocation.shippedQty = String(kg3(Number(allocation.shippedQty) + take))
    allocation.shipments = [...(allocation.shipments ?? []), { qty: take, at: new Date().toISOString(), by: byName }]
    if (rest > EPSILON) {
      const reservation = await runCommand<{ reservationId: string }>(store, 'wms.inventory.reserve', { warehouseId: stock.warehouseId, catalogVariantId: stock.variants.get(allocation.productId), lotId: allocation.lotId, quantity: rest, sourceType: 'order', sourceId: order.id, metadata: { orderNo: order.orderNo, lineId: allocation.lineId } })
      allocation.qty = String(rest)
      allocation.reservationId = reservation.reservationId
      ctx.em.persist(ctx.em.create(CcOrderAllocation, { ...scope(ctx), orderId: order.id, lineId: allocation.lineId, productId: allocation.productId, lotId: allocation.lotId, lotNumber: allocation.lotNumber, place: allocation.place, qty: String(take), unit: allocation.unit, reservationId: null, status: 'shipped', shippedQty: String(take), shipments: allocation.shipments, byName }))
      allocation.shippedQty = '0'
      allocation.shipments = []
    } else {
      allocation.status = 'shipped'
      allocation.reservationId = null
    }
  }
  logEvent(ctx, order, 'stock_out', 'dispatch', plan.map(({ allocation, take }) => `${allocation.lotNumber} ${take} ${allocation.unit}`).join(', '), byName)
  await ctx.em.flush()
}

export async function reverseSaleOut(ctx: OrderContext, order: CcOrder, byName: string | null) {
  const store = asStore(ctx)
  const shipped = await ctx.em.find(CcOrderAllocation, { ...scope(ctx), orderId: order.id, status: 'shipped' })
  if (!shipped.length) return
  const performedAt = movementTime(new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10))
  for (const allocation of shipped) {
    const qty = Number(allocation.shippedQty)
    const stock = await plantStock(store, [allocation.productId])
    await returnLots(store, stock, allocation.productId, [{ lotId: allocation.lotId, lotNumber: allocation.lotNumber, place: allocation.place, kg: qty }], { reason: `Despatch of ${order.orderNo} reopened`, reasonCode: 'sale_out_reverse', performedAt, metadata: { source: SOURCE, orderId: order.id, orderNo: order.orderNo, byName } })
    const reservation = await runCommand<{ reservationId: string }>(store, 'wms.inventory.reserve', { warehouseId: stock.warehouseId, catalogVariantId: stock.variants.get(allocation.productId), lotId: allocation.lotId, quantity: qty, sourceType: 'order', sourceId: order.id, metadata: { orderNo: order.orderNo, lineId: allocation.lineId } })
    allocation.status = 'reserved'
    allocation.reservationId = reservation.reservationId
    allocation.qty = String(qty)
    allocation.shippedQty = '0'
    allocation.shipments = []
  }
  logEvent(ctx, order, 'stock_back', 'dispatch', 'Despatch reopened: stock back in the FG store, still allocated', byName)
  await ctx.em.flush()
}

export async function releaseAllForOrder(ctx: OrderContext, order: CcOrder, byName: string | null) {
  const held = await ctx.em.find(CcOrderAllocation, { ...scope(ctx), orderId: order.id, status: 'reserved' })
  for (const allocation of held) {
    if (allocation.reservationId) await runCommand(asStore(ctx), 'wms.inventory.release', { reservationId: allocation.reservationId, reason: `Order ${order.orderNo} cancelled` })
    allocation.status = 'released'
  }
  if (held.length) logEvent(ctx, order, 'unallocated', 'allocation', `Order cancelled: ${held.length} allocations released`, byName)
  await ctx.em.flush()
}
