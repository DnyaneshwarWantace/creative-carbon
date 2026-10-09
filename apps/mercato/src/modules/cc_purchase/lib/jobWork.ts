import { randomUUID } from 'node:crypto'
import { Vendor } from '../../cc_vendors/data/entities'
import { currentUserName } from '../../cc_orders/lib/server'
import { MANUAL_PLACES, PLACE_LABEL, type StockPlace } from '../../cc_products/lib/stock'
import { performerId, runCommand, type StoreContext } from '../../cc_store/lib/server'
import { lotsWithDetails } from '../../cc_production/lib/finishing'
import { consumeLots, kg3, plantStock, type PlantStock } from '../../cc_production/lib/plantStock'
import { nextSeriesCode } from '../../cc_accounts/lib/numberSeries'
import { JobWorkChallan, type JobWorkLine, type JobWorkStatus } from '../data/entities'
import type { JobWorkCreateInput, JobWorkReceiveInput } from '../data/validators'
import { PurchaseError } from './service'

const EPSILON = 0.0005
const SOURCE = 'cc_purchase.job_work'
const RETURN_LIMIT_DAYS = 365

function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000)
}

function performedAt(date: string): Date {
  return date === today() ? new Date() : new Date(`${date}T12:00:00+05:30`)
}

function pending(line: JobWorkLine): number {
  return kg3(line.qty - line.returnedQty - line.lossQty)
}

async function move(ctx: StoreContext, stock: PlantStock, line: Pick<JobWorkLine, 'productId' | 'lotId'>, from: StockPlace, to: StockPlace, qty: number, reason: string, metadata: Record<string, unknown>, at: Date) {
  await runCommand(ctx, 'wms.inventory.move', {
    warehouseId: stock.warehouseId,
    fromLocationId: stock.locationOf(from),
    toLocationId: stock.locationOf(to),
    catalogVariantId: stock.variants.get(line.productId),
    lotId: line.lotId,
    quantity: kg3(qty),
    type: 'transfer',
    reason,
    reasonCode: 'job_work',
    referenceType: 'transfer',
    referenceId: randomUUID(),
    performedBy: performerId(ctx),
    performedAt: at,
    metadata,
  })
}

export async function jobWorkLots(ctx: StoreContext, q: string | undefined) {
  const lots = await lotsWithDetails(ctx, { places: [...MANUAL_PLACES].filter((place) => place !== 'tank') as StockPlace[] })
  const term = q?.trim().toLowerCase()
  return lots
    .filter((lot) => lot.status === 'available' && lot.free > EPSILON)
    .filter((lot) => !term || [lot.lotNumber, lot.title].some((value) => value.toLowerCase().includes(term)))
    .slice(0, 60)
    .map((lot) => ({ lotId: lot.lotId, lotNumber: lot.lotNumber, productId: lot.productId, title: lot.title, kind: lot.kind, unit: lot.unit, place: lot.place, placeLabel: lot.placeLabel, free: lot.free }))
}

async function hsnFor(ctx: StoreContext, productIds: string[]): Promise<Map<string, string | null>> {
  if (!productIds.length) return new Map()
  const rows = await ctx.em.getConnection().execute<Array<{ record_id: string; field_key: string; value_text: string | null }>>(
    `select record_id, field_key, value_text from custom_field_values where field_key in ('hsn_code', 'item_code') and deleted_at is null and record_id = any(?::text[])`,
    [`{${productIds.join(',')}}`],
  )
  const result = new Map<string, string | null>()
  for (const row of rows) if (row.field_key === 'hsn_code') result.set(row.record_id, row.value_text)
  return result
}

export async function createJobWork(ctx: StoreContext, input: JobWorkCreateInput): Promise<JobWorkChallan> {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const vendor = await ctx.em.findOne(Vendor, { id: input.vendorId, ...scope, deletedAt: null })
  if (!vendor) throw new PurchaseError('Pick the job worker (vendor)', 400)
  if (input.expectedReturn && input.expectedReturn < input.challanDate) throw new PurchaseError('The return date is before the challan date')
  const seen = new Set<string>()
  const lines: JobWorkLine[] = []
  for (const wanted of input.lines) {
    if (seen.has(wanted.lotId)) throw new PurchaseError('The same lot is on the challan twice')
    seen.add(wanted.lotId)
    const [lot] = await lotsWithDetails(ctx, { lotId: wanted.lotId })
    if (!lot || !(MANUAL_PLACES as readonly string[]).includes(lot.place) || lot.place === 'tank') throw new PurchaseError('That lot is not in a store', 404)
    if (lot.status !== 'available') throw new PurchaseError(`${lot.lotNumber} is under test or on hold; only approved stock goes out`, 409)
    if (wanted.qty > lot.free + EPSILON) throw new PurchaseError(`Only ${lot.free} ${lot.unit} of ${lot.lotNumber} is free`, 409)
    lines.push({ lineId: randomUUID(), productId: lot.productId, title: lot.title, code: null, hsn: null, unit: lot.unit, lotId: lot.lotId, lotNumber: lot.lotNumber, fromPlace: lot.place, qty: kg3(wanted.qty), value: Math.round((wanted.value ?? 0) * 100) / 100, returnedQty: 0, lossQty: 0 })
  }
  const hsn = await hsnFor(ctx, lines.map((line) => line.productId))
  for (const line of lines) line.hsn = hsn.get(line.productId) ?? null
  const by = await currentUserName(ctx)
  const challan = ctx.em.create(JobWorkChallan, {
    ...scope,
    code: await nextSeriesCode(ctx, 'JW', new Date(`${input.challanDate}T12:00:00+05:30`)),
    vendorId: vendor.id,
    vendorName: vendor.name,
    vendorGstin: vendor.gstNumber ?? null,
    challanDate: input.challanDate,
    process: input.process,
    expectedReturn: input.expectedReturn ?? null,
    vehicleNo: input.vehicleNo?.toUpperCase() ?? null,
    notes: input.notes ?? null,
    status: 'open',
    lines,
    returns: [],
    history: [{ action: 'sent', by, at: new Date().toISOString(), note: `${lines.length} lot${lines.length === 1 ? '' : 's'} to ${vendor.name} for ${input.process}` }],
    createdByName: by,
  })
  await ctx.em.persist(challan).flush()
  const stock = await plantStock(ctx, lines.map((line) => line.productId))
  const done: JobWorkLine[] = []
  try {
    for (const line of lines) {
      await move(ctx, stock, line, line.fromPlace as StockPlace, 'jobwork', line.qty, `Sent to ${vendor.name} for ${input.process} on ${challan.code}`, { source: SOURCE, challanId: challan.id, challanCode: challan.code, byName: by }, performedAt(input.challanDate))
      done.push(line)
    }
  } catch (error) {
    for (const line of done) {
      await move(ctx, stock, line, 'jobwork', line.fromPlace as StockPlace, line.qty, `Undo ${challan.code}`, { source: SOURCE, challanId: challan.id, challanCode: challan.code, byName: by }, new Date()).catch(() => undefined)
    }
    challan.deletedAt = new Date()
    await ctx.em.flush()
    throw error
  }
  return challan
}

function statusOf(challan: JobWorkChallan): JobWorkStatus {
  if (challan.lines.every((line) => pending(line) <= EPSILON)) return 'returned'
  if (challan.lines.some((line) => line.returnedQty + line.lossQty > EPSILON)) return 'part_returned'
  return 'open'
}

export async function receiveJobWork(ctx: StoreContext, challan: JobWorkChallan, input: JobWorkReceiveInput): Promise<void> {
  if (challan.status === 'cancelled' || challan.status === 'returned') throw new PurchaseError(challan.status === 'cancelled' ? 'This challan is cancelled' : 'Everything on this challan is back', 409)
  if (input.date < challan.challanDate) throw new PurchaseError('The return date is before the challan date')
  const wanted = input.lines.filter((entry) => entry.qty > EPSILON || entry.lossQty > EPSILON)
  if (!wanted.length) throw new PurchaseError('Enter what came back (or the loss)')
  const by = await currentUserName(ctx)
  const stock = await plantStock(ctx, challan.lines.map((line) => line.productId))
  const lines = challan.lines.map((line) => ({ ...line }))
  const at = performedAt(input.date)
  const meta = { source: SOURCE, challanId: challan.id, challanCode: challan.code, byName: by }
  for (const entry of wanted) {
    const line = lines.find((row) => row.lineId === entry.lineId)
    if (!line) throw new PurchaseError('That line is not on the challan', 404)
    if (entry.qty + entry.lossQty > pending(line) + EPSILON) throw new PurchaseError(`${line.lotNumber}: only ${pending(line)} ${line.unit} is still with the job worker`, 409)
    const toPlace = (entry.toPlace ?? line.fromPlace) as StockPlace
    if (entry.qty > EPSILON) {
      await move(ctx, stock, line, 'jobwork', toPlace, entry.qty, `Back from ${challan.vendorName} on ${challan.code}`, meta, at)
      line.returnedQty = kg3(line.returnedQty + entry.qty)
    }
    if (entry.lossQty > EPSILON) {
      await consumeLots(ctx, stock, line.productId, [{ lotId: line.lotId, lotNumber: line.lotNumber, place: 'jobwork', kg: entry.lossQty }], { reason: `Process loss at ${challan.vendorName} (${challan.code})`, reasonCode: 'job_work_loss', performedAt: at, metadata: meta })
      line.lossQty = kg3(line.lossQty + entry.lossQty)
    }
  }
  challan.lines = lines
  challan.returns = [...challan.returns, { id: randomUUID(), date: input.date, by, at: new Date().toISOString(), note: input.note ?? null, lines: wanted.map((entry) => ({ lineId: entry.lineId, qty: kg3(entry.qty), lossQty: kg3(entry.lossQty), toPlace: entry.toPlace ?? lines.find((row) => row.lineId === entry.lineId)!.fromPlace })) }]
  challan.status = statusOf(challan)
  const back = kg3(wanted.reduce((sum, entry) => sum + entry.qty, 0))
  const loss = kg3(wanted.reduce((sum, entry) => sum + entry.lossQty, 0))
  challan.history = [...challan.history, { action: challan.status === 'returned' ? 'returned' : 'part_returned', by, at: new Date().toISOString(), note: [`${back} back`, loss ? `${loss} loss` : null, input.note].filter(Boolean).join(' · ') }]
  challan.updatedAt = new Date()
  await ctx.em.flush()
}

export async function cancelJobWork(ctx: StoreContext, challan: JobWorkChallan, reason: string): Promise<void> {
  if (challan.status === 'cancelled') throw new PurchaseError('Already cancelled', 409)
  if (challan.returns.length) throw new PurchaseError('Something already came back on this challan; receive the rest instead of cancelling', 409)
  const by = await currentUserName(ctx)
  const stock = await plantStock(ctx, challan.lines.map((line) => line.productId))
  for (const line of challan.lines) {
    await move(ctx, stock, line, 'jobwork', line.fromPlace as StockPlace, line.qty, `${challan.code} cancelled: ${reason}`, { source: SOURCE, challanId: challan.id, challanCode: challan.code, byName: by }, new Date())
  }
  challan.status = 'cancelled'
  challan.history = [...challan.history, { action: 'cancelled', by, at: new Date().toISOString(), note: reason }]
  challan.updatedAt = new Date()
  await ctx.em.flush()
}

export async function findJobWork(ctx: StoreContext, id: string): Promise<JobWorkChallan> {
  const challan = await ctx.em.findOne(JobWorkChallan, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!challan) throw new PurchaseError('Job-work challan not found', 404)
  return challan
}

export function jobWorkView(challan: JobWorkChallan) {
  const now = today()
  const sent = kg3(challan.lines.reduce((sum, line) => sum + line.qty, 0))
  const returned = kg3(challan.lines.reduce((sum, line) => sum + line.returnedQty, 0))
  const loss = kg3(challan.lines.reduce((sum, line) => sum + line.lossQty, 0))
  const out = kg3(challan.lines.reduce((sum, line) => sum + pending(line), 0))
  const open = challan.status === 'open' || challan.status === 'part_returned'
  const limitDate = addDays(challan.challanDate, RETURN_LIMIT_DAYS)
  return {
    id: challan.id,
    code: challan.code,
    vendorId: challan.vendorId,
    vendorName: challan.vendorName,
    vendorGstin: challan.vendorGstin ?? null,
    challanDate: challan.challanDate,
    process: challan.process,
    expectedReturn: challan.expectedReturn ?? null,
    vehicleNo: challan.vehicleNo ?? null,
    notes: challan.notes ?? null,
    status: challan.status,
    lines: challan.lines.map((line) => ({ ...line, fromPlaceLabel: PLACE_LABEL[line.fromPlace as StockPlace] ?? line.fromPlace, pending: pending(line) })),
    returns: challan.returns,
    history: challan.history,
    totals: { sent, returned, loss, out, value: Math.round(challan.lines.reduce((sum, line) => sum + line.value, 0) * 100) / 100 },
    daysOut: daysBetween(challan.challanDate, now),
    overdue: open && Boolean(challan.expectedReturn && challan.expectedReturn < now),
    limitDate,
    pastLimit: open && limitDate < now,
    createdByName: challan.createdByName ?? null,
    createdAt: challan.createdAt.toISOString(),
    updatedAt: challan.updatedAt.toISOString(),
  }
}

export async function listJobWork(ctx: StoreContext, filter: { status?: string; vendorId?: string; q?: string }) {
  const where: Record<string, unknown> = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }
  if (filter.status === 'open') where.status = { $in: ['open', 'part_returned'] }
  else if (filter.status) where.status = filter.status
  if (filter.vendorId) where.vendorId = filter.vendorId
  const rows = await ctx.em.find(JobWorkChallan, where, { orderBy: { challanDate: 'desc', code: 'desc' }, limit: 200 })
  const term = filter.q?.trim().toLowerCase()
  return rows
    .filter((row) => !term || [row.code, row.vendorName, row.process, ...row.lines.map((line) => line.lotNumber)].some((value) => value.toLowerCase().includes(term)))
    .map(jobWorkView)
}
