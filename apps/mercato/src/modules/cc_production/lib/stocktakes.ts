import { randomUUID } from 'node:crypto'
import { currentUserName } from '../../cc_orders/lib/server'
import { PLACE_LABEL, type StockPlace } from '../../cc_products/lib/stock'
import { performerId, runCommand, type StoreContext } from '../../cc_store/lib/server'
import { linkReversals } from '../../cc_store/lib/counterEntries'
import { Stocktake, type StocktakeLine } from '../../cc_store/data/entities'
import { recordActivity } from '../../cc_audit/lib/activity'
import { findLot } from './finishing'
import { kg3, plantStock } from './plantStock'
import { PlantError } from './server'

export const STOCKTAKE_REVERSE_DAYS = 7
const SOURCE = 'cc_store.stocktake'

async function nextCode(ctx: StoreContext): Promise<string> {
  const [row] = await ctx.em.getConnection().execute<Array<{ max: number | null }>>(
    `select max(substring(code from 5)::int) as max from cc_stocktakes where tenant_id = ? and organization_id = ? and code ~ '^STK-[0-9]+$'`,
    [ctx.tenantId, ctx.organizationId],
  )
  return `STK-${String((row?.max ?? 0) + 1).padStart(4, '0')}`
}

function stamp(row: Stocktake, action: string, by: string | null, note: string | null) {
  row.history = [...(row.history ?? []), { action, by, at: new Date().toISOString(), note }]
}

function actor(ctx: StoreContext, byName: string | null) {
  return { actorUserId: ctx.userId ?? null, actorName: byName }
}

async function countLines(ctx: StoreContext, place: StockPlace, lines: Array<{ lotId: string; counted: number }>): Promise<StocktakeLine[]> {
  const result: StocktakeLine[] = []
  for (const line of lines) {
    const lot = await findLot(ctx, line.lotId)
    if (lot.place !== place) throw new PlantError(`${lot.lotNumber} is not in ${PLACE_LABEL[place]}`)
    result.push({ lotId: lot.lotId, lotNumber: lot.lotNumber, productId: lot.productId, title: lot.title, unit: lot.unit ?? null, book: lot.onHand, counted: kg3(line.counted), difference: kg3(line.counted - lot.onHand) })
  }
  return result
}

export async function findStocktake(ctx: StoreContext, id: string) {
  const row = await ctx.em.findOne(Stocktake, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  if (!row) throw new PlantError('Stocktake not found', 404)
  return row
}

export async function createStocktake(ctx: StoreContext, input: { place: StockPlace; countDate: string; lines: Array<{ lotId: string; counted: number }>; note: string | null }) {
  const byName = await currentUserName(ctx)
  const row = ctx.em.create(Stocktake, {
    organizationId: ctx.organizationId,
    tenantId: ctx.tenantId,
    code: await nextCode(ctx),
    place: input.place,
    countDate: input.countDate,
    status: 'counted',
    lines: await countLines(ctx, input.place, input.lines),
    note: input.note ?? null,
    countedByName: byName,
    history: [{ action: 'counted', by: byName, at: new Date().toISOString(), note: input.note ?? null }],
  })
  ctx.em.persist(row)
  await ctx.em.flush()
  recordActivity(ctx.em, ctx, { recordType: 'stocktake', recordId: row.id, action: 'counted', kind: 'stage', summary: `${row.lines.length} lot(s) counted in ${PLACE_LABEL[input.place]}; ${row.lines.filter((line) => Math.abs(line.difference) >= 0.0005).length} differ from the book`, ...actor(ctx, byName) })
  await ctx.em.flush()
  return row
}

export async function recountStocktake(ctx: StoreContext, row: Stocktake, lines: Array<{ lotId: string; counted: number }>, reason: string) {
  if (row.status !== 'counted' && row.status !== 'approved') throw new PlantError('Only a count that is not posted can be changed', 409)
  const next = await countLines(ctx, row.place as StockPlace, lines)
  const changes = next
    .map((line) => {
      const old = row.lines.find((entry) => entry.lotId === line.lotId)
      return old && old.counted !== line.counted ? { field: `lot:${line.lotId}`, label: `${line.lotNumber} counted`, from: old.counted, to: line.counted } : !old ? { field: `lot:${line.lotId}`, label: `${line.lotNumber} counted`, from: null, to: line.counted } : null
    })
    .filter((change): change is NonNullable<typeof change> => change !== null)
  if (!changes.length) throw new PlantError('Nothing changed')
  const byName = await currentUserName(ctx)
  row.lines = next
  row.status = 'counted'
  row.approvedByName = null
  row.approvedAt = null
  stamp(row, 'recounted', byName, reason)
  recordActivity(ctx.em, ctx, { recordType: 'stocktake', recordId: row.id, action: 'recounted', kind: 'change', summary: 'Recounted; it needs approval again', reason, changes, ...actor(ctx, byName) })
  await ctx.em.flush()
}

export async function approveStocktake(ctx: StoreContext, row: Stocktake, note: string | null) {
  if (row.status !== 'counted') throw new PlantError('This count is not waiting for approval', 409)
  const byName = await currentUserName(ctx)
  row.status = 'approved'
  row.approvedByName = byName
  row.approvedAt = new Date()
  stamp(row, 'approved', byName, note)
  recordActivity(ctx.em, ctx, { recordType: 'stocktake', recordId: row.id, action: 'approved', kind: 'stage', summary: 'Approved by the store manager', reason: note, ...actor(ctx, byName) })
  await ctx.em.flush()
}

export async function postStocktakeRecord(ctx: StoreContext, row: Stocktake) {
  if (row.status !== 'approved') throw new PlantError(row.status === 'counted' ? 'The store manager has to approve the count first' : 'Already posted', 409)
  const stock = await plantStock(ctx, [])
  const byName = await currentUserName(ctx)
  const lines: StocktakeLine[] = []
  for (const line of row.lines) {
    const lot = await findLot(ctx, line.lotId)
    const difference = kg3(line.counted - lot.onHand)
    const posted: StocktakeLine = { ...line, book: lot.onHand, difference, movementId: null }
    if (Math.abs(difference) >= 0.0005) {
      if (difference < 0 && -difference > lot.free + 0.0005) throw new PlantError(`${lot.lotNumber}: ${-difference} would have to come out but only ${lot.free} is free (reserved for an order)`, 409)
      const variants = await plantStock(ctx, [lot.productId])
      await runCommand(ctx, 'wms.inventory.adjust', {
        warehouseId: stock.warehouseId,
        locationId: stock.locationOf(row.place as StockPlace),
        catalogVariantId: variants.variants.get(lot.productId),
        lotId: lot.lotId,
        delta: difference,
        reason: `Stocktake ${row.countDate}: counted ${line.counted}, book ${lot.onHand}${row.note ? ` · ${row.note}` : ''}`,
        reasonCode: 'stocktake',
        referenceType: 'manual',
        referenceId: randomUUID(),
        performedBy: performerId(ctx),
        metadata: { source: SOURCE, stocktakeId: row.id, stocktakeCode: row.code, byName, countDate: row.countDate },
      })
      const [movement] = await ctx.em.getConnection().execute<Array<{ id: string }>>(
        `select id from wms_inventory_movements where lot_id = ? and tenant_id = ? and organization_id = ? and metadata->>'stocktakeId' = ? order by created_at desc limit 1`,
        [lot.lotId, ctx.tenantId, ctx.organizationId, row.id],
      )
      posted.movementId = movement?.id ?? null
    }
    lines.push(posted)
  }
  row.lines = lines
  row.status = 'posted'
  row.postedAt = new Date()
  row.postedByName = byName
  stamp(row, 'posted', byName, null)
  const adjusted = lines.filter((line) => line.movementId).length
  recordActivity(ctx.em, ctx, { recordType: 'stocktake', recordId: row.id, action: 'posted', kind: 'stage', summary: `Posted: ${adjusted} adjustment(s) to the book`, ...actor(ctx, byName) })
  for (const line of lines.filter((entry) => entry.movementId)) recordActivity(ctx.em, ctx, { recordType: 'lot', recordId: line.lotId, action: 'counted', kind: 'change', summary: `Stocktake ${row.code}: ${line.difference > 0 ? '+' : ''}${line.difference}`, changes: [{ field: 'onHand', label: 'On hand', from: line.book, to: line.counted }], links: [{ type: 'stocktake', id: row.id, label: row.code }], ...actor(ctx, byName) })
  await ctx.em.flush()
  return adjusted
}

export async function reverseStocktake(ctx: StoreContext, row: Stocktake, reason: string) {
  if (row.status !== 'posted' || !row.postedAt) throw new PlantError(row.status === 'reversed' ? 'Already reversed' : 'Only a posted count can be reversed', 409)
  if (Date.now() - row.postedAt.getTime() > STOCKTAKE_REVERSE_DAYS * 86_400_000) throw new PlantError(`Posted more than ${STOCKTAKE_REVERSE_DAYS} days ago. Count again instead.`, 409)
  const connection = ctx.em.getConnection()
  const moved = row.lines.filter((line) => line.movementId)
  for (const line of moved) {
    const [later] = await connection.execute<Array<{ reason: string | null }>>(
      `select reason from wms_inventory_movements where lot_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null and created_at > (select created_at from wms_inventory_movements where id = ?) and coalesce(metadata->>'stocktakeId', '') <> ? limit 1`,
      [line.lotId, ctx.tenantId, ctx.organizationId, line.movementId, row.id],
    )
    if (later) throw new PlantError(`${line.lotNumber} moved since (${later.reason ?? 'another movement'}). Count again instead.`, 409)
  }
  const stock = await plantStock(ctx, [])
  const byName = await currentUserName(ctx)
  const metadata = { source: SOURCE, stocktakeId: row.id, stocktakeCode: row.code, byName }
  for (const line of moved) {
    const variants = await plantStock(ctx, [line.productId])
    await runCommand(ctx, 'wms.inventory.adjust', {
      warehouseId: stock.warehouseId,
      locationId: stock.locationOf(row.place as StockPlace),
      catalogVariantId: variants.variants.get(line.productId),
      lotId: line.lotId,
      delta: -line.difference,
      reason: `${row.code} reversed: ${reason}`,
      reasonCode: 'stocktake_reverse',
      referenceType: 'manual',
      referenceId: randomUUID(),
      performedBy: performerId(ctx),
      metadata,
    })
  }
  await linkReversals(ctx, metadata)
  row.status = 'reversed'
  row.reversedAt = new Date()
  row.reversedByName = byName
  row.reverseReason = reason
  stamp(row, 'reversed', byName, reason)
  recordActivity(ctx.em, ctx, { recordType: 'stocktake', recordId: row.id, action: 'reversed', kind: 'correction', summary: `Reversed: ${moved.length} counter-entr${moved.length === 1 ? 'y' : 'ies'} put the book back`, reason, ...actor(ctx, byName) })
  await ctx.em.flush()
}

export function stocktakeView(row: Stocktake) {
  return {
    id: row.id,
    code: row.code,
    place: row.place,
    placeLabel: PLACE_LABEL[row.place as StockPlace] ?? row.place,
    countDate: row.countDate,
    status: row.status,
    lines: row.lines,
    note: row.note ?? null,
    countedByName: row.countedByName ?? null,
    approvedByName: row.approvedByName ?? null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    postedByName: row.postedByName ?? null,
    postedAt: row.postedAt ? row.postedAt.toISOString() : null,
    reversedByName: row.reversedByName ?? null,
    reversedAt: row.reversedAt ? row.reversedAt.toISOString() : null,
    reverseReason: row.reverseReason ?? null,
    canReverse: row.status === 'posted' && Boolean(row.postedAt && Date.now() - row.postedAt.getTime() <= STOCKTAKE_REVERSE_DAYS * 86_400_000),
    difference: kg3(row.lines.reduce((sum, line) => sum + line.difference, 0)),
    history: row.history ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listStocktakes(ctx: StoreContext) {
  const rows = await ctx.em.find(Stocktake, { tenantId: ctx.tenantId, organizationId: ctx.organizationId }, { orderBy: { createdAt: 'desc' }, limit: 200 })
  return rows.map(stocktakeView)
}
