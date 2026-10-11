import { randomUUID } from 'node:crypto'
import { currentUserName, hasFeatures, loadProducts } from '../../cc_orders/lib/server'
import { PLACE_LABEL, variantsForProducts, type StockPlace } from '../../cc_products/lib/stock'
import { recordActivity } from '../../cc_audit/lib/activity'
import { activeOptions } from '../../cc_lists/lib/service'
import { StoreAdjustment } from '../data/entities'
import { linkReversals } from './counterEntries'
import { StoreError, performerId, runCommand, type StoreContext } from './server'
import { adjustStock, placeLocations, transferStock, type AdjustInput, type TransferInput } from './stockBook'

export const APPROVAL_LIMIT = 100
export const REVERSE_DAYS = 7

const round = (value: number) => Math.round(value * 10000) / 10000

async function nextCode(ctx: StoreContext): Promise<string> {
  const [row] = await ctx.em.getConnection().execute<Array<{ max: number | null }>>(
    `select max(substring(code from 5)::int) as max from cc_store_adjustments where tenant_id = ? and organization_id = ? and code ~ '^ADJ-[0-9]+$'`,
    [ctx.tenantId, ctx.organizationId],
  )
  return `ADJ-${String((row?.max ?? 0) + 1).padStart(4, '0')}`
}

function actor(ctx: StoreContext, byName: string | null) {
  return { actorUserId: ctx.userId ?? null, actorName: byName }
}

function stamp(row: StoreAdjustment, action: string, by: string | null, note: string | null) {
  row.history = [...(row.history ?? []), { action, by, at: new Date().toISOString(), note }]
}

export async function findAdjustment(ctx: StoreContext, id: string) {
  const row = await ctx.em.findOne(StoreAdjustment, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  if (!row) throw new StoreError('Adjustment not found', 404)
  return row
}

function describe(row: StoreAdjustment): string {
  const qty = `${Number(row.quantity)} ${row.unit ?? ''}`.trim()
  if (row.kind === 'move') return `${qty} moved ${PLACE_LABEL[row.place as StockPlace]} → ${PLACE_LABEL[row.toPlace as StockPlace]}`
  return `${row.kind === 'add' ? 'Added' : 'Removed'} ${qty} ${row.kind === 'add' ? 'to' : 'from'} ${PLACE_LABEL[row.place as StockPlace]}`
}

async function lotNumberOf(ctx: StoreContext, lotId: string | null | undefined): Promise<string | null> {
  if (!lotId) return null
  const [row] = await ctx.em.getConnection().execute<Array<{ lot_number: string }>>('select lot_number from wms_inventory_lots where id = ? limit 1', [lotId])
  return row?.lot_number ?? null
}

async function post(ctx: StoreContext, row: StoreAdjustment, byName: string | null) {
  const tag = { adjustmentId: row.id, adjustmentCode: row.code }
  const result =
    row.kind === 'move'
      ? await transferStock(ctx, { productId: row.productId, lotId: row.lotId ?? null, from: row.place as StockPlace, to: row.toPlace as StockPlace, quantity: Number(row.quantity), note: [row.reason, row.note].filter(Boolean).join(' · ') }, tag)
      : await adjustStock(ctx, { place: row.place as StockPlace, productId: row.productId, direction: row.kind === 'add' ? 'in' : 'out', quantity: Number(row.quantity), lotId: row.lotId ?? null, newLot: row.newLot ?? null, reason: row.reason, note: row.note ?? null }, tag)
  row.movementId = result.movementId
  row.lotId = result.lotId ?? row.lotId ?? null
  row.lotNumber = row.lotNumber ?? (await lotNumberOf(ctx, row.lotId))
  row.status = 'posted'
  stamp(row, 'posted', byName, null)
  recordActivity(ctx.em, ctx, { recordType: 'adjustment', recordId: row.id, action: 'posted', kind: 'stage', summary: describe(row), reason: row.reason, ...actor(ctx, byName) })
  if (row.lotId) recordActivity(ctx.em, ctx, { recordType: 'lot', recordId: row.lotId, action: row.kind === 'move' ? 'moved' : 'adjusted', kind: 'change', summary: `${describe(row)} (${row.code})`, reason: [row.reason, row.note].filter(Boolean).join(' · '), links: [{ type: 'adjustment', id: row.id, label: row.code }], ...actor(ctx, byName) })
}

export async function createAdjustment(ctx: StoreContext, input: { kind: 'add' | 'remove'; adjust: AdjustInput } | { kind: 'move'; transfer: TransferInput; reason: string }) {
  const byName = await currentUserName(ctx)
  const productId = input.kind === 'move' ? input.transfer.productId : input.adjust.productId
  const quantity = input.kind === 'move' ? input.transfer.quantity : input.adjust.quantity
  if (input.kind !== 'move') {
    const reasons = await activeOptions(ctx, 'stock_adjust_reasons')
    if (!reasons.includes(input.adjust.reason)) throw new StoreError('Pick a reason from the list')
  }
  const product = (await loadProducts(ctx, [productId])).get(productId)
  if (!product) throw new StoreError('That product was not found', 404)
  const row = ctx.em.create(StoreAdjustment, {
    organizationId: ctx.organizationId,
    tenantId: ctx.tenantId,
    code: await nextCode(ctx),
    kind: input.kind,
    place: input.kind === 'move' ? input.transfer.from : input.adjust.place,
    toPlace: input.kind === 'move' ? input.transfer.to : null,
    productId,
    title: product.title,
    unit: product.unit ?? null,
    lotId: input.kind === 'move' ? input.transfer.lotId : (input.adjust.lotId ?? null),
    newLot: input.kind === 'move' ? null : (input.adjust.newLot ?? null),
    quantity: String(round(quantity)),
    reason: input.kind === 'move' ? input.reason : input.adjust.reason,
    note: input.kind === 'move' ? (input.transfer.note ?? null) : (input.adjust.note ?? null),
    status: 'pending',
    createdByName: byName,
    createdByUserId: ctx.userId ?? null,
    history: [{ action: 'made', by: byName, at: new Date().toISOString(), note: null }],
  })
  row.lotNumber = await lotNumberOf(ctx, row.lotId) ?? row.newLot?.lotNumber ?? null
  ctx.em.persist(row)
  await ctx.em.flush()
  const needsApproval = quantity > APPROVAL_LIMIT && row.kind !== 'move' && !(await hasFeatures(ctx, ['cc_store.approve']))
  if (needsApproval) {
    recordActivity(ctx.em, ctx, { recordType: 'adjustment', recordId: row.id, action: 'made', kind: 'stage', summary: `${describe(row)}: over ${APPROVAL_LIMIT}, waiting for the store manager`, reason: row.reason, ...actor(ctx, byName) })
    await ctx.em.flush()
    return row
  }
  await ctx.em.flush()
  try {
    await post(ctx, row, byName)
  } catch (error) {
    await ctx.em.nativeDelete(StoreAdjustment, { id: row.id })
    throw error
  }
  await ctx.em.flush()
  return row
}

export async function decideAdjustment(ctx: StoreContext, row: StoreAdjustment, approve: boolean, note: string | null) {
  if (row.status !== 'pending') throw new StoreError('This adjustment is not waiting for approval', 409)
  const byName = await currentUserName(ctx)
  if (!approve) {
    if (!note || note.trim().length < 3) throw new StoreError('Write why it is rejected (at least 3 letters)')
    row.status = 'rejected'
    stamp(row, 'rejected', byName, note)
    recordActivity(ctx.em, ctx, { recordType: 'adjustment', recordId: row.id, action: 'rejected', kind: 'correction', summary: 'Rejected; no stock moved', reason: note, ...actor(ctx, byName) })
  } else {
    row.approvedByName = byName
    row.approvedAt = new Date()
    stamp(row, 'approved', byName, note)
    recordActivity(ctx.em, ctx, { recordType: 'adjustment', recordId: row.id, action: 'approved', kind: 'stage', summary: 'Approved by the store manager', reason: note, ...actor(ctx, byName) })
    await post(ctx, row, byName)
  }
  await ctx.em.flush()
}

export async function reverseAdjustment(ctx: StoreContext, row: StoreAdjustment, reason: string) {
  if (row.status !== 'posted' || !row.movementId) throw new StoreError(row.status === 'reversed' ? 'Already reversed' : 'Nothing was posted', 409)
  const postedAt = row.approvedAt ?? row.createdAt
  if (Date.now() - postedAt.getTime() > REVERSE_DAYS * 86_400_000) throw new StoreError(`Older than ${REVERSE_DAYS} days. Make a new adjustment instead.`, 409)
  const connection = ctx.em.getConnection()
  const [original] = await connection.execute<Array<{ created_at: Date; catalog_variant_id: string; lot_id: string | null }>>('select created_at, catalog_variant_id, lot_id from wms_inventory_movements where id = ?', [row.movementId])
  if (!original) throw new StoreError('The stock movement was not found', 404)
  if (original.lot_id) {
    const [later] = await connection.execute<Array<{ reason: string | null }>>(
      `select reason from wms_inventory_movements where lot_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null and id <> ? and created_at > ? limit 1`,
      [original.lot_id, ctx.tenantId, ctx.organizationId, row.movementId, original.created_at],
    )
    if (later) throw new StoreError(`The lot was used since (${later.reason ?? 'another movement'}). Make a new adjustment instead.`, 409)
  }
  const { warehouseId, byPlace } = await placeLocations(ctx)
  const byName = await currentUserName(ctx)
  const metadata = { source: row.kind === 'move' ? 'cc_store.transfer' : 'cc_store.adjust', adjustmentId: row.id, adjustmentCode: row.code, byName }
  const quantity = Number(row.quantity)
  if (row.kind === 'move') {
    await runCommand(ctx, 'wms.inventory.move', {
      warehouseId,
      fromLocationId: byPlace.get(row.toPlace as StockPlace),
      toLocationId: byPlace.get(row.place as StockPlace),
      catalogVariantId: original.catalog_variant_id,
      ...(original.lot_id ? { lotId: original.lot_id } : {}),
      quantity: round(quantity),
      type: 'transfer',
      reason: `${row.code} reversed: ${reason}`,
      reasonCode: 'store_transfer_reverse',
      referenceType: 'transfer',
      referenceId: randomUUID(),
      performedBy: performerId(ctx),
      metadata,
    })
  } else {
    await runCommand(ctx, 'wms.inventory.adjust', {
      warehouseId,
      locationId: byPlace.get(row.place as StockPlace),
      catalogVariantId: original.catalog_variant_id,
      ...(original.lot_id ? { lotId: original.lot_id } : {}),
      delta: row.kind === 'add' ? -round(quantity) : round(quantity),
      reason: `${row.code} reversed: ${reason}`,
      reasonCode: 'store_adjust_reverse',
      referenceType: 'manual',
      referenceId: randomUUID(),
      performedBy: performerId(ctx),
      metadata,
    })
  }
  const [reversal] = await connection.execute<Array<{ id: string }>>(
    `select id from wms_inventory_movements where tenant_id = ? and organization_id = ? and metadata->>'adjustmentId' = ? and id <> ? order by created_at desc limit 1`,
    [ctx.tenantId, ctx.organizationId, row.id, row.movementId],
  )
  if (reversal) {
    await connection.execute(`update wms_inventory_movements set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reversedBy', ?::text) where id = ?`, [reversal.id, row.movementId])
    await connection.execute(`update wms_inventory_movements set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reverses', ?::text) where id = ?`, [row.movementId, reversal.id])
  } else await linkReversals(ctx, metadata)
  row.status = 'reversed'
  row.reversalId = reversal?.id ?? null
  row.reversedAt = new Date()
  row.reversedByName = byName
  row.reverseReason = reason
  stamp(row, 'reversed', byName, reason)
  recordActivity(ctx.em, ctx, { recordType: 'adjustment', recordId: row.id, action: 'reversed', kind: 'correction', summary: `Reversed by a counter-entry: ${describe(row)} undone`, reason, ...actor(ctx, byName) })
  if (row.lotId) recordActivity(ctx.em, ctx, { recordType: 'lot', recordId: row.lotId, action: 'adjustment_reversed', kind: 'correction', summary: `${row.code} reversed`, reason, links: [{ type: 'adjustment', id: row.id, label: row.code }], ...actor(ctx, byName) })
  await ctx.em.flush()
}

export async function adjustmentView(ctx: StoreContext, row: StoreAdjustment) {
  const variants = await variantsForProducts(ctx, [row.productId])
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    place: row.place,
    placeLabel: PLACE_LABEL[row.place as StockPlace] ?? row.place,
    toPlace: row.toPlace ?? null,
    toPlaceLabel: row.toPlace ? (PLACE_LABEL[row.toPlace as StockPlace] ?? row.toPlace) : null,
    productId: row.productId,
    title: row.title,
    unit: row.unit ?? null,
    lotId: row.lotId ?? null,
    lotNumber: row.lotNumber ?? null,
    quantity: Number(row.quantity),
    reason: row.reason,
    note: row.note ?? null,
    status: row.status,
    movementId: row.movementId ?? null,
    reversalId: row.reversalId ?? null,
    createdByName: row.createdByName ?? null,
    approvedByName: row.approvedByName ?? null,
    approvedAt: row.approvedAt ? row.approvedAt.toISOString() : null,
    reversedByName: row.reversedByName ?? null,
    reversedAt: row.reversedAt ? row.reversedAt.toISOString() : null,
    reverseReason: row.reverseReason ?? null,
    canReverse: row.status === 'posted' && Date.now() - (row.approvedAt ?? row.createdAt).getTime() <= REVERSE_DAYS * 86_400_000,
    hasStockRecord: variants.has(row.productId),
    history: row.history ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listAdjustments(ctx: StoreContext, status: string | null) {
  const where: Record<string, unknown> = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  if (status && status !== 'all') where.status = status
  const rows = await ctx.em.find(StoreAdjustment, where, { orderBy: { createdAt: 'desc' }, limit: 300 })
  return Promise.all(rows.map((row) => adjustmentView(ctx, row)))
}
