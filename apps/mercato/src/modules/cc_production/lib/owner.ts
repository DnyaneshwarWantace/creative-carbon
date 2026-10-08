import { randomUUID } from 'node:crypto'
import type { StoreContext } from '../../cc_store/lib/server'
import { performerId, runCommand } from '../../cc_store/lib/server'
import { PLACE_LABEL, STOCK_PLACES, type StockPlace } from '../../cc_products/lib/stock'
import { CoatingSheet, DamageEntry, MouldingEntry, Press, PressBatch, ProductionPlan, ResinBatch, SyncClash, type PlanLine } from '../data/entities'
import { bstageBoard } from './bstage'
import { sheetFigures } from './coatingFigures'
import { allLots, findLot } from './finishing'
import { pressFigures } from './pressFigures'
import { PlantError } from './server'
import { kg3, plantStock } from './plantStock'

function scope(ctx: StoreContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86_400_000)
}

export async function producedOn(ctx: StoreContext, date: string) {
  const [presses, mouldings, resins, sheets] = await Promise.all([
    ctx.em.find(PressBatch, { ...scope(ctx), batchDate: date, status: 'posted' }),
    ctx.em.find(MouldingEntry, { ...scope(ctx), entryDate: date, status: 'posted', deletedAt: null }),
    ctx.em.find(ResinBatch, { ...scope(ctx), batchDate: date, status: 'posted', deletedAt: null }),
    ctx.em.find(CoatingSheet, { ...scope(ctx), sheetDate: date, status: 'posted', deletedAt: null }),
  ])
  const byThickness = new Map<number, { thicknessMm: number; sheets: number; kg: number }>()
  for (const batch of presses) {
    for (const line of pressFigures(batch.daylights).sizeLines) {
      const entry = byThickness.get(line.thicknessMm) ?? { thicknessMm: line.thicknessMm, sheets: 0, kg: 0 }
      entry.sheets += line.count
      entry.kg = kg3(entry.kg + line.kg)
      byThickness.set(line.thicknessMm, entry)
    }
  }
  const resinInput = resins.reduce((sum, batch) => sum + batch.materials.reduce((inner, line) => inner + line.kg, 0), 0)
  const resinYield = resins.reduce((sum, batch) => sum + Number(batch.yieldKg ?? 0), 0)
  return {
    press: {
      batches: presses.length,
      kg: kg3([...byThickness.values()].reduce((sum, entry) => sum + entry.kg, 0)),
      sheets: [...byThickness.values()].reduce((sum, entry) => sum + entry.sheets, 0),
      byThickness: [...byThickness.values()].sort((left, right) => left.thicknessMm - right.thicknessMm),
    },
    moulding: {
      pieces: mouldings.reduce((sum, entry) => sum + entry.productionNos, 0),
      kg: kg3(mouldings.reduce((sum, entry) => sum + entry.productionNos * Number(entry.articleWeightKg), 0)),
      machines: new Set(mouldings.map((entry) => entry.pressNumber)).size,
    },
    resin: { batches: resins.length, kg: kg3(resinYield), yieldPct: resinInput ? Math.round((resinYield / resinInput) * 1000) / 10 : null },
    coating: { sheets: sheets.length, kg: kg3(sheets.reduce((sum, sheet) => sum + sheetFigures(sheet.rows, sheet.slots).bstageTotal, 0)) },
  }
}

async function actualFor(ctx: StoreContext, date: string, line: PlanLine): Promise<number> {
  const resource = line.resource.trim().toLowerCase()
  const number = Number(resource.match(/\d+/)?.[0])
  if (line.area === 'press') {
    const batches = await ctx.em.find(PressBatch, { ...scope(ctx), batchDate: date, status: 'posted', ...(Number.isFinite(number) ? { pressNumber: number } : {}) })
    return line.unit === 'sheets' ? batches.reduce((sum, batch) => sum + pressFigures(batch.daylights).totalSheets, 0) : kg3(batches.reduce((sum, batch) => sum + pressFigures(batch.daylights).totalKg, 0))
  }
  if (line.area === 'moulding') {
    const entries = await ctx.em.find(MouldingEntry, { ...scope(ctx), entryDate: date, status: 'posted', deletedAt: null, ...(Number.isFinite(number) ? { pressNumber: number } : {}) })
    const own = line.item ? entries.filter((entry) => entry.dieNo.toLowerCase() === line.item!.trim().toLowerCase()) : entries
    return line.unit === 'kg' ? kg3(own.reduce((sum, entry) => sum + entry.productionNos * Number(entry.articleWeightKg), 0)) : own.reduce((sum, entry) => sum + entry.productionNos, 0)
  }
  if (line.area === 'coating') {
    const sheets = await ctx.em.find(CoatingSheet, { ...scope(ctx), sheetDate: date, status: 'posted', deletedAt: null })
    const own = sheets.filter((sheet) => !resource || sheet.dryerCode.toLowerCase() === resource || sheet.dryerCode.match(/\d+/)?.[0] === String(number))
    return kg3(own.reduce((sum, sheet) => sum + sheetFigures(sheet.rows, sheet.slots).bstageTotal, 0))
  }
  const batches = await ctx.em.find(ResinBatch, { ...scope(ctx), batchDate: date, status: 'posted', deletedAt: null })
  return kg3(batches.reduce((sum, batch) => sum + Number(batch.yieldKg ?? 0), 0))
}

export async function findPlan(ctx: StoreContext, date: string) {
  return ctx.em.findOne(ProductionPlan, { ...scope(ctx), planDate: date })
}

export function planView(plan: ProductionPlan | null, date: string) {
  return { id: plan?.id ?? null, planDate: date, lines: plan?.lines ?? [], notes: plan?.notes ?? null, byName: plan?.byName ?? null, updatedAt: plan?.updatedAt.toISOString() ?? null }
}

export async function savePlan(ctx: StoreContext, date: string, lines: PlanLine[], notes: string | null, byName: string | null) {
  let plan = await findPlan(ctx, date)
  if (!plan) {
    plan = ctx.em.create(ProductionPlan, { ...scope(ctx), planDate: date, lines, notes, byName })
    ctx.em.persist(plan)
  } else Object.assign(plan, { lines, notes, byName })
  await ctx.em.flush()
  return plan
}

async function shortfall(ctx: StoreContext) {
  const rows = await ctx.em.getConnection().execute<Array<{ product_id: string; title: string; unit: string | null; ordered: string; orders: string }>>(
    `select l.product_id, p.title, p.default_unit as unit, sum(l.quantity) as ordered, count(distinct o.id) as orders
       from cc_order_lines l
       join cc_orders o on o.id = l.order_id
       join catalog_products p on p.id = l.product_id
      where o.tenant_id = ? and o.organization_id = ? and o.status in ('booked', 'confirmed') and o.deleted_at is null
      group by l.product_id, p.title, p.default_unit`,
    [ctx.tenantId, ctx.organizationId],
  )
  if (!rows.length) return []
  const fgLots = (await allLots(ctx, null)).filter((lot) => lot.place === 'fg' && lot.status === 'available')
  return rows
    .map((row) => {
      const inStock = kg3(fgLots.filter((lot) => lot.productId === row.product_id).reduce((sum, lot) => sum + lot.free, 0))
      const ordered = kg3(Number(row.ordered))
      return { productId: row.product_id, title: row.title, unit: row.unit ?? 'kg', ordered, inStock, short: kg3(Math.max(0, ordered - inStock)), orders: Number(row.orders) }
    })
    .filter((row) => row.short > 0)
    .sort((left, right) => right.short - left.short)
    .slice(0, 20)
}

export async function ownerOverview(ctx: StoreContext, date: string) {
  const produced = await producedOn(ctx, date)
  const plan = await findPlan(ctx, date)
  const planRows = []
  for (const line of plan?.lines ?? []) {
    const actual = await actualFor(ctx, date, line)
    planRows.push({ ...line, actual, pct: line.plannedQty ? Math.round((actual / line.plannedQty) * 100) : null })
  }
  const weekAgo = addDays(date, -7)
  const monthAgo = addDays(date, -30)
  const [failed, damages, presses, pressBatches, mouldings, board, clashes] = await Promise.all([
    ctx.em.find(ResinBatch, { ...scope(ctx), status: 'failed', deletedAt: null, batchDate: { $gte: monthAgo, $lte: date } }, { orderBy: { batchDate: 'desc' } }),
    ctx.em.find(DamageEntry, { ...scope(ctx), deletedAt: null, entryDate: { $gte: weekAgo, $lte: date } }, { orderBy: { entryDate: 'desc' } }),
    ctx.em.find(Press, { ...scope(ctx), deletedAt: null }, { orderBy: { number: 'asc' } }),
    ctx.em.find(PressBatch, { ...scope(ctx), batchDate: date, status: { $ne: 'cancelled' } }),
    ctx.em.find(MouldingEntry, { ...scope(ctx), entryDate: date, deletedAt: null }),
    bstageBoard(ctx, {}),
    ctx.em.find(SyncClash, { ...scope(ctx), createdAt: { $gte: new Date(`${weekAgo}T00:00:00Z`) } }, { orderBy: { createdAt: 'desc' }, limit: 20 }),
  ])
  const usedPresses = new Set([...pressBatches.map((batch) => batch.pressNumber), ...mouldings.map((entry) => entry.pressNumber)])
  const idle = presses.filter((press) => !usedPresses.has(press.number))
  const atRisk = board.columns.filter((column) => column.band !== 'fresh').flatMap((column) => column.lots.map((lot) => ({ lotId: lot.lotId, lotNumber: lot.lotNumber, clothTitle: lot.clothTitle, kg: lot.onHandKg, ageDays: lot.ageDays, band: lot.band })))
  return {
    date,
    produced,
    plan: { exists: Boolean(plan), rows: planRows, notes: plan?.notes ?? null },
    shortfall: await shortfall(ctx),
    breakdowns: {
      failedBatches: failed.map((batch) => ({ id: batch.id, batchNo: batch.batchNo, batchDate: batch.batchDate, reason: batch.failReason ?? null, inputKg: kg3(batch.materials.reduce((sum, line) => sum + line.kg, 0)) })),
      idleMachines: idle.map((press) => ({ number: press.number, usage: press.usage, isWorking: press.isWorking })),
      damaged: damages.map((row) => ({ id: row.id, entryDate: row.entryDate, itemTitle: row.itemTitle, kg: Number(row.kg), reason: row.reason })),
      bstageAtRisk: atRisk,
      clashes: clashes.map((row) => ({ id: row.id, screen: row.screen, recordRef: row.recordRef, detail: row.detail ?? null, byName: row.byName ?? null, at: row.createdAt.toISOString() })),
    },
  }
}

export async function logClash(ctx: StoreContext, input: { screen: string; recordRef: string; detail: string | null }, byName: string | null) {
  const clash = ctx.em.create(SyncClash, { ...scope(ctx), screen: input.screen, recordRef: input.recordRef, detail: input.detail, byName })
  ctx.em.persist(clash)
  await ctx.em.flush()
  return clash
}

type ReorderRow = { product_id: string; reorder_point: string | null }

export async function stockGrid(ctx: StoreContext, filter: { kind?: string; place?: StockPlace; q?: string }) {
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
  let lots = await allLots(ctx, filter.kind ? [filter.kind] : null)
  if (filter.place) lots = lots.filter((lot) => lot.place === filter.place)
  const term = filter.q?.trim().toLowerCase()
  if (term) lots = lots.filter((lot) => lot.title.toLowerCase().includes(term) || lot.lotNumber.toLowerCase().includes(term))
  const reorder = await ctx.em.getConnection().execute<ReorderRow[]>(
    'select catalog_product_id as product_id, reorder_point from wms_product_inventory_profiles where tenant_id = ? and organization_id = ? and deleted_at is null',
    [ctx.tenantId, ctx.organizationId],
  )
  const reorderOf = new Map(reorder.map((row) => [row.product_id, Number(row.reorder_point ?? 0)]))
  const rows = new Map<string, { productId: string; title: string; kind: string; unit: string; place: StockPlace; placeLabel: string; qty: number; free: number; nos: number | null; lots: number; onHold: number; oldestDays: number | null }>()
  for (const lot of lots) {
    const key = `${lot.productId}|${lot.place}`
    const row = rows.get(key) ?? { productId: lot.productId, title: lot.title, kind: lot.kind, unit: lot.unit, place: lot.place, placeLabel: lot.placeLabel, qty: 0, free: 0, nos: null, lots: 0, onHold: 0, oldestDays: null }
    row.qty = kg3(row.qty + lot.onHand)
    row.free = kg3(row.free + lot.free)
    if (lot.nosLeft !== null && lot.unit !== 'nos') row.nos = (row.nos ?? 0) + lot.nosLeft
    row.lots += 1
    if (lot.status !== 'available') row.onHold = kg3(row.onHold + lot.onHand)
    if (lot.madeOn) {
      const age = daysBetween(lot.madeOn, today)
      row.oldestDays = row.oldestDays === null ? age : Math.max(row.oldestDays, age)
    }
    rows.set(key, row)
  }
  const totals = new Map<string, number>()
  for (const row of rows.values()) totals.set(row.productId, kg3((totals.get(row.productId) ?? 0) + row.qty))
  const items = [...rows.values()]
    .map((row) => {
      const point = reorderOf.get(row.productId) ?? 0
      return { ...row, reorderPoint: point || null, reorder: point > 0 && (totals.get(row.productId) ?? 0) < point }
    })
    .sort((left, right) => left.kind.localeCompare(right.kind) || left.title.localeCompare(right.title) || left.place.localeCompare(right.place))
  return {
    items,
    places: STOCK_PLACES.map((place) => ({ key: place, label: PLACE_LABEL[place] })),
    totals: { kg: kg3(items.filter((row) => row.unit !== 'nos').reduce((sum, row) => sum + row.qty, 0)), pieces: items.filter((row) => row.unit === 'nos').reduce((sum, row) => sum + row.qty, 0), reorder: items.filter((row) => row.reorder).length },
  }
}

export async function lotDetail(ctx: StoreContext, lotId: string) {
  const lot = await findLot(ctx, lotId).catch(() => null)
  const movements = await ctx.em.getConnection().execute<Array<{ id: string; type: string; quantity: string; reason: string | null; reason_code: string | null; performed_at: Date; location_from_id: string | null; location_to_id: string | null; metadata: Record<string, unknown> | null }>>(
    `select id, type, quantity, reason, reason_code, performed_at, location_from_id, location_to_id, metadata from wms_inventory_movements
      where lot_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null order by performed_at asc, created_at asc`,
    [lotId, ctx.tenantId, ctx.organizationId],
  )
  if (!lot && !movements.length) throw new PlantError('Lot not found', 404)
  const stock = await plantStock(ctx, [])
  const [info] = lot
    ? [null]
    : await ctx.em.getConnection().execute<Array<{ lot_number: string; title: string }>>(
        'select lot.lot_number, p.title from wms_inventory_lots lot join catalog_product_variants v on v.id = lot.catalog_variant_id join catalog_products p on p.id = v.product_id where lot.id = ? and lot.organization_id = ?',
        [lotId, ctx.organizationId],
      )
  return {
    lot: lot ? { ...lot, metadata: undefined, locationId: undefined } : { lotId, lotNumber: info?.lot_number ?? '—', title: info?.title ?? '—', onHand: 0, free: 0, place: null, placeLabel: 'Used up' },
    metadata: lot?.metadata ?? null,
    movements: movements.map((row) => {
      const place = stock.placeOf(row.location_to_id ?? row.location_from_id ?? '')
      return {
        id: row.id,
        at: new Date(row.performed_at).toISOString(),
        qty: kg3(row.type === 'adjust' ? Number(row.quantity) : row.type === 'receipt' ? Math.abs(Number(row.quantity)) : -Math.abs(Number(row.quantity))),
        place: place ? PLACE_LABEL[place] : null,
        reason: row.reason,
        reasonCode: row.reason_code,
        source: typeof row.metadata?.source === 'string' ? row.metadata.source : null,
      }
    }),
  }
}

export async function stocktakeSheet(ctx: StoreContext, place: StockPlace, kind: string | null) {
  return (await allLots(ctx, kind ? [kind] : null)).filter((lot) => lot.place === place)
}

export async function postStocktake(ctx: StoreContext, input: { place: StockPlace; countDate: string; lines: Array<{ lotId: string; counted: number }>; note: string | null }, byName: string | null) {
  const stock = await plantStock(ctx, [])
  const results: Array<{ lotId: string; lotNumber: string; book: number; counted: number; difference: number }> = []
  for (const line of input.lines) {
    const lot = await findLot(ctx, line.lotId)
    if (lot.place !== input.place) throw new PlantError(`${lot.lotNumber} is not in ${PLACE_LABEL[input.place]}`)
    const difference = kg3(line.counted - lot.onHand)
    results.push({ lotId: lot.lotId, lotNumber: lot.lotNumber, book: lot.onHand, counted: kg3(line.counted), difference })
    if (Math.abs(difference) < 0.0005) continue
    if (difference < 0 && -difference > lot.free + 0.0005) throw new PlantError(`${lot.lotNumber}: ${-difference} would have to come out but only ${lot.free} is free (reserved for an order)`, 409)
    const variants = await plantStock(ctx, [lot.productId])
    await runCommand(ctx, 'wms.inventory.adjust', {
      warehouseId: stock.warehouseId,
      locationId: stock.locationOf(input.place),
      catalogVariantId: variants.variants.get(lot.productId),
      lotId: lot.lotId,
      delta: difference,
      reason: `Stocktake ${input.countDate}: counted ${kg3(line.counted)}, book ${lot.onHand}${input.note ? ` · ${input.note}` : ''}`,
      reasonCode: 'stocktake',
      referenceType: 'manual',
      referenceId: randomUUID(),
      performedBy: performerId(ctx),
      metadata: { source: 'cc_production.stocktake', byName, countDate: input.countDate },
    })
  }
  return { lines: results, adjusted: results.filter((row) => Math.abs(row.difference) >= 0.0005).length }
}
