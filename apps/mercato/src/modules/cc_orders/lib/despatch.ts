import { CcOrder, CcOrderAllocation, CcOrderLine, CcOrderStage, type FieldChange } from '../data/entities'
import { TaxInvoice } from '../../cc_accounts/data/entities'
import { runCommand } from '../../cc_store/lib/server'
import { kg3, movementTime, plantStock, produceLot } from '../../cc_production/lib/plantStock'
import { logCorrection } from '../../cc_audit/lib/activity'
import { logEvent } from './engine'
import { asStore } from './fulfilment'
import { stepStates } from './stages'
import { OrderError, loadCustomers, loadProducts, type OrderContext } from './server'

export const CORRECT_HOURS = 48
const SOURCE = 'cc_orders.return'

export const CORRECTABLE_FIELDS: Record<string, string> = {
  transporter: 'Transporter',
  vehicle_no: 'Vehicle no.',
  lr_number: 'LR / BL no.',
  container_no: 'Container no.',
  seal_no: 'Seal no.',
  port: 'Port',
}

export type SaleReturn = { id: string; allocationId: string; lotNumber: string; newLotId: string; newLotNumber: string; qty: number; unit: string; reason: string; at: string; by: string | null }

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const out = String(value).trim()
  return out || null
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const out = Number(value)
  return Number.isFinite(out) ? out : null
}

function returnsOf(stage: CcOrderStage): SaleReturn[] {
  const list = (stage.data as Record<string, unknown> | null)?.__returns
  return Array.isArray(list) ? (list as SaleReturn[]) : []
}

export async function findDespatch(ctx: OrderContext, id: string): Promise<{ stage: CcOrderStage; order: CcOrder }> {
  const stage = await ctx.em.findOne(CcOrderStage, { id, stageKey: 'dispatch', tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  if (!stage) throw new OrderError('Despatch not found', 404)
  const order = await ctx.em.findOne(CcOrder, { id: stage.orderId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!order) throw new OrderError('Despatch not found', 404)
  return { stage, order }
}

export function correctUntil(stage: CcOrderStage): Date | null {
  return stage.status === 'done' && stage.completedAt ? new Date(stage.completedAt.getTime() + CORRECT_HOURS * 3600_000) : null
}

export async function despatchView(ctx: OrderContext, stage: CcOrderStage, order: CcOrder) {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const [stages, lines, allocations, invoices] = await Promise.all([
    ctx.em.find(CcOrderStage, { orderId: order.id, stageKey: { $in: ['packing', 'invoice'] } }),
    ctx.em.find(CcOrderLine, { orderId: order.id }),
    ctx.em.find(CcOrderAllocation, { ...scope, orderId: order.id, status: { $in: ['reserved', 'shipped'] } }),
    ctx.em.find(TaxInvoice, { ...scope, orderId: order.id, deletedAt: null, status: { $ne: 'cancelled' } }, { orderBy: { createdAt: 'asc' } }),
  ])
  const [customers, products] = await Promise.all([loadCustomers(ctx, [order.customerId]), loadProducts(ctx, lines.map((line) => line.productId))])
  const data = (stage.data ?? {}) as Record<string, unknown>
  const packing = (stages.find((entry) => entry.stageKey === 'packing')?.data ?? {}) as Record<string, unknown>
  const billing = (stages.find((entry) => entry.stageKey === 'invoice')?.data ?? {}) as Record<string, unknown>
  const steps = stepStates(stage.data)
  const returns = returnsOf(stage)
  const until = correctUntil(stage)
  const shipped = allocations
    .filter((allocation) => Number(allocation.shippedQty) > 0)
    .map((allocation) => {
      const back = returns.filter((entry) => entry.allocationId === allocation.id).reduce((sum, entry) => sum + entry.qty, 0)
      return {
        allocationId: allocation.id,
        lotId: allocation.lotId,
        lotNumber: allocation.lotNumber,
        productId: allocation.productId,
        title: products.get(allocation.productId)?.title ?? 'Item',
        unit: allocation.unit,
        shipped: Number(allocation.shippedQty),
        returned: kg3(back),
        canReturn: kg3(Number(allocation.shippedQty) - back),
      }
    })
  return {
    id: stage.id,
    orderId: order.id,
    orderNo: order.orderNo,
    orderStatus: order.status,
    customerId: order.customerId,
    customer: customers.get(order.customerId)?.name ?? null,
    shippingAddress: order.shippingAddress ?? null,
    status: stage.status,
    despatchedAt: stage.completedAt ? stage.completedAt.toISOString() : null,
    despatchedBy: stage.completedByName ?? null,
    dispatchDate: text(data.dispatch_date),
    transporter: text(data.transporter),
    vehicleNo: text(data.vehicle_no),
    lrNumber: text(data.lr_number),
    containerNo: text(data.container_no),
    sealNo: text(data.seal_no),
    port: text(data.port),
    deliveredOn: text(data.delivered_on),
    delivered: Boolean(steps.delivered?.done) || Boolean(text(data.delivered_on)),
    loaded: Boolean(steps.loaded?.done),
    packType: text(packing.pack_type),
    packages: num(packing.packages),
    netKg: num(packing.net_kg),
    grossKg: num(packing.gross_kg),
    ewayBillNo: text(billing.eway_bill_no) ?? invoices.find((entry) => entry.ewayBillNo)?.ewayBillNo ?? null,
    irn: text(billing.irn),
    invoices: invoices.map((entry) => ({ id: entry.id, code: entry.code, kind: entry.kind, status: entry.status, invoiceDate: entry.invoiceDate })),
    shipped,
    returns,
    correctUntil: until ? until.toISOString() : null,
    canCorrect: Boolean(until && until.getTime() > Date.now()),
    updatedAt: stage.updatedAt.toISOString(),
  }
}

export async function correctDespatch(ctx: OrderContext, stage: CcOrderStage, order: CcOrder, input: { fields: Record<string, string | null>; reason: string }, byName: string | null) {
  if (stage.status !== 'done') throw new OrderError('The goods have not left yet. Change the details on the Despatch stage itself.', 409)
  const until = correctUntil(stage)
  if (!until || until.getTime() < Date.now()) throw new OrderError(`Vehicle and LR details can be corrected only within ${CORRECT_HOURS} hours of despatch`, 409)
  const data = { ...((stage.data ?? {}) as Record<string, unknown>) }
  const changes: FieldChange[] = []
  for (const [key, value] of Object.entries(input.fields)) {
    const label = CORRECTABLE_FIELDS[key]
    if (!label) continue
    const before = text(data[key])
    const after = text(value)
    if (before === after) continue
    changes.push({ key, label, from: before, to: after })
    data[key] = after
  }
  if (!changes.length) throw new OrderError('Nothing changed', 400)
  stage.data = data
  stage.updatedAt = new Date()
  order.updatedAt = new Date()
  logEvent(ctx, order, 'details_corrected', 'dispatch', input.reason, byName, changes)
  await ctx.em.flush()
  await logCorrection(ctx, {
    recordType: 'dispatch',
    recordId: stage.id,
    action: 'details_corrected',
    summary: `Despatch details corrected: ${changes.map((change) => change.label).join(', ')}`,
    reason: input.reason,
    changes: changes.map((change) => ({ field: change.key, label: change.label, from: change.from, to: change.to })),
    links: [{ type: 'order', id: order.id, label: order.orderNo }],
  })
  return changes
}

export async function returnGoods(ctx: OrderContext, stage: CcOrderStage, order: CcOrder, input: { allocationId: string; qty: number; reason: string; returnedOn: string }, byName: string | null): Promise<SaleReturn> {
  if (stage.status !== 'done') throw new OrderError('Nothing has been despatched yet', 409)
  const allocation = await ctx.em.findOne(CcOrderAllocation, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, id: input.allocationId, orderId: order.id })
  if (!allocation || Number(allocation.shippedQty) <= 0) throw new OrderError('That lot was not despatched on this order', 404)
  const returns = returnsOf(stage)
  const already = returns.filter((entry) => entry.allocationId === allocation.id).reduce((sum, entry) => sum + entry.qty, 0)
  const left = kg3(Number(allocation.shippedQty) - already)
  if (input.qty > left + 0.0005) throw new OrderError(`Only ${left} ${allocation.unit} of lot ${allocation.lotNumber} can still come back`, 409)
  const newLotNumber = `${allocation.lotNumber}-R${returns.filter((entry) => entry.lotNumber === allocation.lotNumber).length + 1}`
  const store = asStore(ctx)
  const stock = await plantStock(store, [allocation.productId])
  const metadata = { source: SOURCE, orderId: order.id, despatchId: stage.id, orderNo: order.orderNo, returnOf: allocation.lotNumber }
  const newLotId = await produceLot(store, stock, {
    productId: allocation.productId,
    place: 'fg',
    lotNumber: newLotNumber,
    existingLotId: null,
    kg: input.qty,
    manufacturedAt: input.returnedOn,
    reason: `Sales return from ${order.orderNo}: ${input.reason}`,
    reasonCode: 'sale_return',
    performedAt: movementTime(input.returnedOn),
    metadata,
    lotMetadata: { returnOf: allocation.lotNumber, returnReason: input.reason },
  })
  await runCommand(store, 'wms.lots.update', { id: newLotId, status: 'hold', notes: `Sales return from ${order.orderNo}: check before selling again` })
  const entry: SaleReturn = { id: newLotId, allocationId: allocation.id, lotNumber: allocation.lotNumber, newLotId, newLotNumber, qty: kg3(input.qty), unit: allocation.unit, reason: input.reason, at: new Date().toISOString(), by: byName }
  stage.data = { ...((stage.data ?? {}) as Record<string, unknown>), __returns: [...returns, entry] }
  stage.updatedAt = new Date()
  order.updatedAt = new Date()
  logEvent(ctx, order, 'returned', 'dispatch', `${entry.qty} ${entry.unit} of lot ${entry.lotNumber} came back as ${newLotNumber} (on hold) · ${input.reason}`, byName)
  await ctx.em.flush()
  await logCorrection(ctx, {
    recordType: 'dispatch',
    recordId: stage.id,
    action: 'returned',
    summary: `Sales return: ${entry.qty} ${entry.unit} of lot ${entry.lotNumber} back in the FG store as ${newLotNumber}, on hold`,
    reason: input.reason,
    links: [{ type: 'order', id: order.id, label: order.orderNo }, { type: 'lot', id: newLotId, label: newLotNumber }],
  })
  return entry
}
