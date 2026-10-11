import { randomUUID } from 'node:crypto'
import type { StoreContext } from '../../../cc_store/lib/server'
import { performerId, runCommand } from '../../../cc_store/lib/server'
import { CoatingSheet, MouldingEntry, PressBatch, ResinBatch, UploadBatch, type UploadRecordRef } from '../../data/entities'
import { MASTER_DEFS, type MasterType } from '../masterDefs'
import { deleteMaster, findMaster, masterUsage } from '../masters'
import { deleteBatch, reopenBatch, reopenDeadline } from '../resin'
import { deleteSheet, reopenSheet } from '../coating'
import { cancelPressBatch, reopenPressBatch } from '../press'
import { reopenEntry } from '../moulding'
import { kg3, lotOnHand, plantStock } from '../plantStock'
import { PlantError } from '../server'
import { uploadRegister } from './registers'

export const UPLOAD_UNDO_DAYS = 7

export type UndoBlocker = { label: string; href: string | null }

const UNDO_FEATURE: Record<string, string> = {
  resin_batch: 'cc_production.resin.sign',
  coating_sheet: 'cc_production.coating.enter',
  press_batch: 'cc_production.press.review',
  moulding_entry: 'cc_production.moulding.sign',
  lot: 'cc_store.approve',
}

function scope(ctx: StoreContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

function created(batch: UploadBatch): UploadRecordRef[] {
  return (batch.records ?? []).filter((record) => record.created && !record.undone)
}

export function undoFeatures(batch: UploadBatch): string[] {
  const register = uploadRegister(batch.registerKey)
  const needed = new Set<string>(['cc_production.upload.use'])
  for (const record of created(batch)) needed.add(UNDO_FEATURE[record.type] ?? register?.manageFeature ?? 'cc_production.masters.manage')
  return [...needed]
}

async function lotUse(ctx: StoreContext, lotId: string): Promise<{ moves: number; reserved: number }> {
  const [moves] = await ctx.em.getConnection().execute<Array<{ count: string }>>('select count(*) as count from wms_inventory_movements where lot_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null', [lotId, ctx.tenantId, ctx.organizationId])
  const [held] = await ctx.em.getConnection().execute<Array<{ reserved: string | null }>>('select sum(quantity_reserved + quantity_allocated) as reserved from wms_inventory_balances where lot_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null', [lotId, ctx.tenantId, ctx.organizationId])
  return { moves: Number(moves?.count ?? 0), reserved: Number(held?.reserved ?? 0) }
}

async function blockerFor(ctx: StoreContext, record: UploadRecordRef): Promise<string | null> {
  if (record.type === 'resin_batch') {
    const batch = await ctx.em.findOne(ResinBatch, { id: record.id, ...scope(ctx) })
    if (!batch || batch.deletedAt || batch.status === 'draft') return null
    const deadline = reopenDeadline(batch)
    if (deadline && deadline.getTime() < Date.now()) return `${batch.batchNo} was posted too long ago to reopen`
    if (batch.status === 'posted' && batch.resinProductId && batch.resinLotId) {
      const left = await lotOnHand(ctx, await plantStock(ctx, [batch.resinProductId]), batch.resinProductId, batch.resinLotId, 'tank')
      if (left + 0.0005 < Number(batch.yieldKg ?? 0)) return `${batch.batchNo}: its resin is already used`
    }
    return null
  }
  if (record.type === 'coating_sheet') {
    const sheet = await ctx.em.findOne(CoatingSheet, { id: record.id, ...scope(ctx) })
    if (!sheet || sheet.deletedAt || sheet.status !== 'posted') return null
    for (const row of sheet.rows) {
      if (!row.bstageProductId || !row.bstageLotId) continue
      const left = await lotOnHand(ctx, await plantStock(ctx, [row.bstageProductId]), row.bstageProductId, row.bstageLotId, 'floor')
      if (left + 0.0005 < (row.bstageKg ?? 0)) return `${sheet.dryerCode} ${sheet.sheetDate}: B-stage lot ${row.bstageLotNumber} is already used`
    }
    return null
  }
  if (record.type === 'press_batch') {
    const batch = await ctx.em.findOne(PressBatch, { id: record.id, ...scope(ctx) })
    if (!batch || batch.status !== 'posted') return null
    for (const output of batch.outputs ?? []) {
      const left = await lotOnHand(ctx, await plantStock(ctx, [output.productId]), output.productId, output.lotId, 'floor')
      if (left + 0.0005 < output.kg) return `${batch.batchNo}: ${output.lotNumber} is already cut or moved`
    }
    return null
  }
  if (record.type === 'moulding_entry') {
    const item = await ctx.em.findOne(MouldingEntry, { id: record.id, ...scope(ctx) })
    if (!item || item.deletedAt || item.status !== 'posted' || !item.outputProductId || !item.outputLotId) return null
    const left = await lotOnHand(ctx, await plantStock(ctx, [item.outputProductId]), item.outputProductId, item.outputLotId, 'floor')
    if (left + 0.0005 < item.productionNos) return `${record.label}: ${item.outputLotNumber} is already trimmed or moved`
    return null
  }
  if (record.type === 'lot') {
    const use = await lotUse(ctx, record.id)
    if (use.moves > 1 || use.reserved > 0) return `Lot ${record.label} is already used or allocated`
    return null
  }
  if (record.type === 'master' && record.masterType) {
    const used = await masterUsage(ctx, record.masterType as MasterType, record.id)
    if (used) return `${record.label} is already ${used}`
  }
  return null
}

const PATH: Record<string, string> = {
  resin_batch: '/backend/resin/batches/',
  coating_sheet: '/backend/coating/',
  press_batch: '/backend/press/batches/',
  moulding_entry: '/backend/moulding/entries/',
  lot: '/backend/stock/lots/',
}

export async function undoBlockers(ctx: StoreContext, batch: UploadBatch): Promise<UndoBlocker[]> {
  const blockers: UndoBlocker[] = []
  for (const record of created(batch)) {
    const reason = await blockerFor(ctx, record)
    if (reason) blockers.push({ label: reason, href: PATH[record.type] ? `${PATH[record.type]}${record.id}` : record.type === 'master' && record.masterType === 'moulds' ? `/backend/masters/moulds/${record.id}` : null })
  }
  return blockers
}

export function undoAvailability(batch: UploadBatch): string | null {
  if (batch.status === 'undone') return 'This upload is already undone'
  if (Date.now() - batch.createdAt.getTime() > UPLOAD_UNDO_DAYS * 86_400_000) return `Uploads can be undone for ${UPLOAD_UNDO_DAYS} days`
  if (!created(batch).length) return (batch.records ?? []).length ? 'This upload only changed records that already existed. Correct those on their own pages.' : 'This upload has no record list (made before uploads kept one)'
  return null
}

async function undoRecord(ctx: StoreContext, record: UploadRecordRef, reason: string, byName: string | null) {
  if (record.type === 'resin_batch') {
    const batch = await ctx.em.findOne(ResinBatch, { id: record.id, ...scope(ctx) })
    if (!batch || batch.deletedAt) return
    if (batch.status !== 'draft') await reopenBatch(ctx, batch, byName)
    await deleteBatch(ctx, batch, byName)
    return
  }
  if (record.type === 'coating_sheet') {
    const sheet = await ctx.em.findOne(CoatingSheet, { id: record.id, ...scope(ctx) })
    if (!sheet || sheet.deletedAt) return
    if (sheet.status === 'posted') await reopenSheet(ctx, sheet, byName)
    await deleteSheet(ctx, sheet, byName)
    return
  }
  if (record.type === 'press_batch') {
    const batch = await ctx.em.findOne(PressBatch, { id: record.id, ...scope(ctx) })
    if (!batch || batch.status === 'cancelled') return
    if (batch.status === 'posted') await reopenPressBatch(ctx, batch, byName)
    await cancelPressBatch(ctx, batch, `Upload undone: ${reason}`, byName)
    return
  }
  if (record.type === 'moulding_entry') {
    const item = await ctx.em.findOne(MouldingEntry, { id: record.id, ...scope(ctx) })
    if (!item || item.deletedAt) return
    if (item.status === 'posted') await reopenEntry(ctx, item.entryDate, item.shift, item.pressId, byName)
    item.deletedAt = new Date()
    item.updatedByName = byName
    await ctx.em.flush()
    return
  }
  if (record.type === 'lot') {
    const [balance] = await ctx.em.getConnection().execute<Array<{ warehouse_id: string; location_id: string; catalog_variant_id: string; quantity_on_hand: string }>>(
      'select warehouse_id, location_id, catalog_variant_id, quantity_on_hand from wms_inventory_balances where lot_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null and quantity_on_hand > 0 limit 1',
      [record.id, ctx.tenantId, ctx.organizationId],
    )
    if (!balance) return
    await runCommand(ctx, 'wms.inventory.adjust', {
      warehouseId: balance.warehouse_id,
      locationId: balance.location_id,
      catalogVariantId: balance.catalog_variant_id,
      lotId: record.id,
      delta: -kg3(Number(balance.quantity_on_hand)),
      reason: `Opening stock upload undone · ${reason}`,
      reasonCode: 'opening_undo',
      referenceType: 'manual',
      referenceId: randomUUID(),
      performedBy: performerId(ctx),
      metadata: { source: 'cc_production.upload', lotId: record.id, byName },
    })
    return
  }
  if (record.type === 'master' && record.masterType) {
    const def = MASTER_DEFS[record.masterType as MasterType]
    if (!def) return
    const entity = await findMaster(ctx, def, record.id).catch(() => null)
    if (entity) await deleteMaster(ctx, entity, byName)
  }
}

export async function undoUpload(ctx: StoreContext, batch: UploadBatch, reason: string, byName: string | null) {
  const unavailable = undoAvailability(batch)
  if (unavailable) throw new PlantError(unavailable, 409)
  const blockers = await undoBlockers(ctx, batch)
  if (blockers.length) throw new PlantError(`Cannot undo: ${blockers.map((entry) => entry.label).join('; ')}`, 409, { blockedBy: blockers })
  const records = [...(batch.records ?? [])]
  const order = (record: UploadRecordRef) => (record.type === 'master' ? 1 : 0)
  const targets = created(batch).sort((left, right) => order(left) - order(right))
  for (const record of targets) {
    await undoRecord(ctx, record, reason, byName)
    const index = records.findIndex((entry) => entry.type === record.type && entry.id === record.id)
    if (index >= 0) records[index] = { ...records[index], undone: true }
    batch.records = [...records]
    await ctx.em.flush()
  }
  batch.status = 'undone'
  batch.undoneAt = new Date()
  batch.undoneByName = byName
  batch.undoReason = reason
  await ctx.em.flush()
  return { undone: targets.length, kept: records.filter((record) => !record.created).length }
}
