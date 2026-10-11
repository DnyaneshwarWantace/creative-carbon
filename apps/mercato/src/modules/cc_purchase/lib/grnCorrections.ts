import { randomUUID } from 'node:crypto'
import { currentUserName } from '../../cc_orders/lib/server'
import { LOCATION_CODES, ccWarehouse } from '../../cc_products/lib/stock'
import { performerId, runCommand, type StoreContext } from '../../cc_store/lib/server'
import { logCorrection } from '../../cc_audit/lib/activity'
import { GoodsReceipt, GoodsReceiptLine, PurchaseOrderLine } from '../data/entities'
import { PurchaseError } from './service'
import { findPo, grnStatus, receivedStatus } from './service'

export const QC_UNDO_HOURS = 24

const round = (value: number) => Math.round(value * 10000) / 10000
const num = (value: string | number | null | undefined) => Number(value ?? 0)

async function lotUsedBy(ctx: StoreContext, grn: GoodsReceipt, line: GoodsReceiptLine): Promise<string | null> {
  if (!line.lotId) return null
  const [row] = await ctx.em.getConnection().execute<Array<{ reason: string | null; reason_code: string | null }>>(
    `select reason, reason_code from wms_inventory_movements
      where lot_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null
        and coalesce(metadata->>'grnId', '') <> ?
      order by performed_at asc limit 1`,
    [line.lotId, ctx.tenantId, ctx.organizationId, grn.id],
  )
  if (row) return row.reason ?? row.reason_code ?? 'another document'
  const [held] = await ctx.em.getConnection().execute<Array<{ total: string }>>(
    `select coalesce(sum(quantity_reserved + quantity_allocated), 0) as total from wms_inventory_balances where lot_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null`,
    [line.lotId, ctx.tenantId, ctx.organizationId],
  )
  return Number(held?.total ?? 0) > 0 ? 'held for an order' : null
}

async function billFor(ctx: StoreContext, grn: GoodsReceipt): Promise<string | null> {
  const [row] = await ctx.em.getConnection().execute<Array<{ code: string }>>(
    `select code from cc_vendor_bills where tenant_id = ? and organization_id = ? and deleted_at is null and status <> 'cancelled' and grn_ids @> ?::jsonb limit 1`,
    [ctx.tenantId, ctx.organizationId, JSON.stringify([grn.id])],
  )
  return row?.code ?? null
}

async function location(ctx: StoreContext, line: GoodsReceiptLine) {
  const warehouse = await ccWarehouse(ctx)
  const locationId = warehouse?.locations.get(LOCATION_CODES[line.store])
  if (!warehouse || !locationId) throw new PurchaseError('The store location is missing', 409)
  return { warehouseId: warehouse.warehouseId, locationId }
}

function stamp(grn: GoodsReceipt, action: string, by: string | null, note: string | null) {
  grn.history = [...(grn.history ?? []), { action, by, at: new Date().toISOString(), note }]
}

async function syncPo(ctx: StoreContext, grn: GoodsReceipt, line: GoodsReceiptLine, delta: number, byName: string | null, note: string) {
  if (!grn.poId) return
  const po = await findPo(ctx, grn.poId)
  const poLine = line.poLineId ? await ctx.em.findOne(PurchaseOrderLine, { id: line.poLineId }) : null
  if (poLine) poLine.receivedQty = String(round(Math.max(0, num(poLine.receivedQty) + delta)))
  if (po.status !== 'cancelled' && !po.shortClosedAt) po.status = receivedStatus({ ...po, status: po.status === 'received' ? 'approved' : po.status } as typeof po, await ctx.em.find(PurchaseOrderLine, { poId: po.id }))
  po.history = [...(po.history ?? []), { action: 'grn_corrected', by: byName, at: new Date().toISOString(), note }]
  po.updatedAt = new Date()
}

export async function correctReceivedQty(ctx: StoreContext, grn: GoodsReceipt, lineId: string, quantity: number, reason: string) {
  if (grn.status === 'cancelled') throw new PurchaseError('This GRN is cancelled', 409)
  const line = await ctx.em.findOne(GoodsReceiptLine, { id: lineId, grnId: grn.id })
  if (!line) throw new PurchaseError('Line not found', 404)
  if (line.qcStatus === 'returned') throw new PurchaseError('This batch was returned to the vendor', 409)
  const used = await lotUsedBy(ctx, grn, line)
  if (used) throw new PurchaseError(`Lot ${line.lotNumber} is already used (${used}). Correct it with a stock adjustment instead.`, 409)
  const bill = await billFor(ctx, grn)
  if (bill) throw new PurchaseError(`Vendor bill ${bill} is entered on this GRN. Raise a debit note instead.`, 409)
  const before = num(line.quantity)
  const delta = round(quantity - before)
  if (Math.abs(delta) < 0.00005) throw new PurchaseError('That is the same quantity')
  const where = await location(ctx, line)
  await runCommand(ctx, 'wms.inventory.adjust', {
    ...where,
    catalogVariantId: line.variantId,
    ...(line.lotId ? { lotId: line.lotId } : {}),
    delta,
    reason: `${grn.code}: received quantity corrected ${before} → ${quantity} ${line.unit}: ${reason}`,
    reasonCode: 'grn_correct',
    referenceType: 'po',
    referenceId: randomUUID(),
    performedBy: performerId(ctx),
    metadata: { grnId: grn.id, grnCode: grn.code, correction: true },
  })
  const byName = await currentUserName(ctx)
  line.quantity = String(round(quantity))
  await syncPo(ctx, grn, line, delta, byName, `${grn.code}: ${line.lotNumber} ${before} → ${quantity} ${line.unit}`)
  stamp(grn, 'qty_corrected', byName, `${line.lotNumber}: ${before} → ${quantity} ${line.unit} · ${reason}`)
  grn.updatedAt = new Date()
  await ctx.em.flush()
  await logCorrection(ctx, { recordType: 'grn', recordId: grn.id, action: 'qty_corrected', summary: `Received quantity of lot ${line.lotNumber} corrected; a stock adjustment of ${delta > 0 ? '+' : ''}${delta} ${line.unit} was made`, reason, changes: [{ field: `line:${line.id}`, label: `${line.lotNumber} received (${line.unit})`, from: before, to: quantity }], links: line.lotId ? [{ type: 'lot', id: line.lotId, label: line.lotNumber }] : [] })
}

export async function undoQc(ctx: StoreContext, grn: GoodsReceipt, lineId: string, reason: string) {
  const line = await ctx.em.findOne(GoodsReceiptLine, { id: lineId, grnId: grn.id })
  if (!line) throw new PurchaseError('Line not found', 404)
  if (line.qcStatus !== 'passed' && line.qcStatus !== 'failed') throw new PurchaseError(line.qcStatus === 'returned' ? 'This batch was returned to the vendor' : 'This batch has no QC result yet', 409)
  if (line.qcAt && Date.now() - line.qcAt.getTime() > QC_UNDO_HOURS * 3600_000) throw new PurchaseError(`The QC result is more than ${QC_UNDO_HOURS} hours old. Put the lot on hold from the lot page instead.`, 409)
  const used = await lotUsedBy(ctx, grn, line)
  if (used) throw new PurchaseError(`Lot ${line.lotNumber} is already used (${used}). The QC result can no longer be undone.`, 409)
  if (line.lotId) await runCommand(ctx, 'wms.lots.update', { id: line.lotId, status: 'quarantine', notes: `QC result undone (${grn.code}): ${reason}` })
  const was = line.qcStatus
  line.qcStatus = 'pending'
  line.qcAt = null
  line.qcByName = null
  line.qcByUserId = null
  grn.status = grnStatus(await ctx.em.find(GoodsReceiptLine, { grnId: grn.id }))
  const byName = await currentUserName(ctx)
  stamp(grn, 'qc_undone', byName, `${line.lotNumber}: ${reason}`)
  grn.updatedAt = new Date()
  await ctx.em.flush()
  await logCorrection(ctx, { recordType: 'grn', recordId: grn.id, action: 'qc_undone', summary: `QC result of lot ${line.lotNumber} undone; it is back under QC`, reason, changes: [{ field: `qc:${line.id}`, label: `${line.lotNumber} QC`, from: was, to: 'pending' }], links: line.lotId ? [{ type: 'lot', id: line.lotId, label: line.lotNumber }] : [] })
}

export async function cancelGrn(ctx: StoreContext, grn: GoodsReceipt, reason: string) {
  if (grn.status === 'cancelled') throw new PurchaseError('Already cancelled', 409)
  const bill = await billFor(ctx, grn)
  if (bill) throw new PurchaseError(`Vendor bill ${bill} is entered on this GRN. Cancel the bill first, or raise a debit note.`, 409)
  const lines = await ctx.em.find(GoodsReceiptLine, { grnId: grn.id })
  for (const line of lines) {
    const used = await lotUsedBy(ctx, grn, line)
    if (used) throw new PurchaseError(`Lot ${line.lotNumber} is already used (${used}). The GRN can no longer be cancelled.`, 409)
  }
  const byName = await currentUserName(ctx)
  const connection = ctx.em.getConnection()
  for (const line of lines) {
    const left = round(num(line.quantity) - num(line.returnedQty))
    if (left <= 0) continue
    const where = await location(ctx, line)
    await runCommand(ctx, 'wms.inventory.adjust', {
      ...where,
      catalogVariantId: line.variantId,
      ...(line.lotId ? { lotId: line.lotId } : {}),
      delta: -left,
      reason: `${grn.code} cancelled: ${reason}`,
      reasonCode: 'grn_cancel',
      referenceType: 'po',
      referenceId: randomUUID(),
      performedBy: performerId(ctx),
      metadata: { grnId: grn.id, grnCode: grn.code, cancelled: true },
    })
    if (line.lotId) {
      const pair = await connection.execute<Array<{ id: string; type: string; reason_code: string | null }>>(
        `select id, type, reason_code from wms_inventory_movements where lot_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null and metadata->>'grnId' = ? order by created_at asc`,
        [line.lotId, ctx.tenantId, ctx.organizationId, grn.id],
      )
      const original = pair.find((row) => row.type === 'receipt')
      const reversal = [...pair].reverse().find((row) => row.reason_code === 'grn_cancel')
      if (original && reversal) {
        await connection.execute(`update wms_inventory_movements set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reversedBy', ?::text) where id = ?`, [reversal.id, original.id])
        await connection.execute(`update wms_inventory_movements set metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('reverses', ?::text) where id = ?`, [original.id, reversal.id])
      }
      await runCommand(ctx, 'wms.lots.update', { id: line.lotId, status: 'hold', notes: `${grn.code} cancelled: ${reason}` })
    }
    await syncPo(ctx, grn, line, -left, byName, `${grn.code} cancelled`)
  }
  grn.status = 'cancelled'
  stamp(grn, 'cancelled', byName, reason)
  grn.updatedAt = new Date()
  await ctx.em.flush()
  await logCorrection(ctx, { recordType: 'grn', recordId: grn.id, action: 'cancelled', summary: `GRN cancelled; ${lines.length} lot(s) taken back out of stock by counter-entries`, reason, links: grn.poId ? [{ type: 'po', id: grn.poId, label: grn.poCode ?? null }] : [] })
}
