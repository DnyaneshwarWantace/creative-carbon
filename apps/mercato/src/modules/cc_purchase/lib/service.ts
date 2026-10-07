import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { Vendor } from '../../cc_vendors/data/entities'
import { currentUserName, loadProducts, type OrderContext } from '../../cc_orders/lib/server'
import { LOCATION_CODES, PLACE_LABEL, ccWarehouse, receivingStoreFor } from '../../cc_products/lib/stock'
import { performerId, runCommand, type StoreContext } from '../../cc_store/lib/server'
import { ensureStockRecords } from '../../cc_store/lib/stockSetup'
import { GoodsReceipt, GoodsReceiptLine, PurchaseOrder, PurchaseOrderLine, type GrnStatus, type PoStatus } from '../data/entities'
import type { DirectGrnInput, GrnInput, PoInput } from '../data/validators'
import { linkIndentsToPo, notifyApprovers } from './indents'
import { loadCompany } from '../../cc_accounts/lib/documents'
import { nextSeriesCode } from '../../cc_accounts/lib/numberSeries'
import { PURCHASED_KINDS, type ProductKind } from '../../cc_products/lib/kinds'

const EPSILON = 0.000001

export class PurchaseError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

type Scope = { em: EntityManager; tenantId: string; organizationId: string }

export function num(value: string | number | null | undefined): number {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function round(value: number, digits = 4): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function stamp<T extends { history?: Array<{ action: string; by: string | null; at: string; note: string | null }> | null }>(record: T, action: string, by: string | null, note: string | null) {
  record.history = [...(record.history ?? []), { action, by, at: new Date().toISOString(), note }]
}

export async function nextCode(ctx: Scope, _table: 'cc_pos' | 'cc_grns' | 'cc_purchase_indents', kind: 'PO' | 'GR' | 'IND'): Promise<string> {
  return nextSeriesCode(ctx, kind)
}

export async function findVendor(ctx: Scope, id: string): Promise<Vendor> {
  const vendor = await ctx.em.findOne(Vendor, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!vendor) throw new PurchaseError('Vendor not found', 404)
  return vendor
}

export async function findPo(ctx: Scope, id: string): Promise<PurchaseOrder> {
  const po = await ctx.em.findOne(PurchaseOrder, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!po) throw new PurchaseError('Purchase order not found', 404)
  return po
}

export async function findGrn(ctx: Scope, id: string): Promise<GoodsReceipt> {
  const grn = await ctx.em.findOne(GoodsReceipt, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!grn) throw new PurchaseError('Goods receiving note not found', 404)
  return grn
}

export function receivedStatus(po: PurchaseOrder, lines: PurchaseOrderLine[]): PoStatus {
  if (po.status === 'draft' || po.status === 'pending_approval' || po.status === 'cancelled') return po.status
  if (lines.length && lines.every((line) => num(line.receivedQty) >= num(line.quantity) - EPSILON)) return 'received'
  if (lines.some((line) => num(line.receivedQty) > EPSILON)) return 'partly_received'
  return 'approved'
}

export function grnStatus(lines: GoodsReceiptLine[]): GrnStatus {
  if (!lines.length) return 'under_test'
  if (lines.some((line) => line.qcStatus === 'pending')) return lines.some((line) => line.qcStatus === 'passed') ? 'partly_approved' : 'under_test'
  if (lines.every((line) => line.qcStatus === 'passed')) return 'approved'
  if (lines.every((line) => line.qcStatus === 'failed' || line.qcStatus === 'returned')) return 'rejected'
  return 'partly_approved'
}

async function writeLines(ctx: OrderContext, po: PurchaseOrder, lines: PoInput['lines']) {
  const products = await loadProducts(ctx, lines.map((line) => line.productId))
  for (const line of lines) {
    const product = products.get(line.productId)
    if (!product) throw new PurchaseError('A material on the PO was not found', 404)
    if (!PURCHASED_KINDS.has(product.kind as ProductKind)) throw new PurchaseError(`${product.title} is not a material that is bought`)
  }
  const existing = await ctx.em.find(PurchaseOrderLine, { poId: po.id })
  for (const line of existing) ctx.em.remove(line)
  lines.forEach((line, index) => {
    ctx.em.persist(
      ctx.em.create(PurchaseOrderLine, {
        organizationId: ctx.organizationId,
        tenantId: ctx.tenantId,
        poId: po.id,
        position: index + 1,
        productId: line.productId,
        unit: products.get(line.productId)?.unit ?? 'pc',
        quantity: String(round(line.quantity)),
        rate: String(round(line.rate)),
        gstPercent: String(line.gstPercent),
        notes: line.notes ?? null,
      }),
    )
  })
}

export async function createPo(ctx: OrderContext, input: PoInput): Promise<PurchaseOrder> {
  const vendor = await findVendor(ctx, input.vendorId)
  const byName = await currentUserName(ctx)
  const po = ctx.em.create(PurchaseOrder, {
    organizationId: ctx.organizationId,
    tenantId: ctx.tenantId,
    code: await nextCode(ctx, 'cc_pos', 'PO'),
    vendorId: vendor.id,
    vendorName: vendor.name,
    vendorGstin: vendor.gstNumber ?? null,
    poDate: input.poDate,
    expectedDate: input.expectedDate ?? null,
    status: input.submit ? 'pending_approval' : 'draft',
    notes: input.notes ?? null,
    terms: input.terms ?? vendor.paymentTerms ?? null,
    orderRefs: input.orderRefs,
    createdByName: byName,
    history: [{ action: input.submit ? 'submitted' : 'created', by: byName, at: new Date().toISOString(), note: null }],
  })
  ctx.em.persist(po)
  await ctx.em.flush()
  await writeLines(ctx, po, input.lines)
  await ctx.em.flush()
  if (input.indentIds.length) await linkIndentsToPo(ctx, input.indentIds, po)
  if (po.status === 'pending_approval') await notifyApprovers(ctx, { type: 'cc_purchase.po.submitted', title: `PO ${po.code} needs approval`, body: `${vendor.name}${byName ? ` · raised by ${byName}` : ''}`, href: `/backend/purchase/orders/${po.id}`, sourceId: po.id })
  return po
}

export async function updatePo(ctx: OrderContext, po: PurchaseOrder, input: PoInput) {
  if (po.status !== 'draft' && po.status !== 'pending_approval') throw new PurchaseError('An approved PO cannot be changed. Cancel it and raise a new one.', 409)
  const vendor = await findVendor(ctx, input.vendorId)
  po.vendorId = vendor.id
  po.vendorName = vendor.name
  po.vendorGstin = vendor.gstNumber ?? null
  po.poDate = input.poDate
  po.expectedDate = input.expectedDate ?? null
  po.notes = input.notes ?? null
  po.terms = input.terms ?? null
  po.orderRefs = input.orderRefs
  if (input.submit && po.status === 'draft') po.status = 'pending_approval'
  await writeLines(ctx, po, input.lines)
  stamp(po, input.submit ? 'submitted' : 'edited', await currentUserName(ctx), null)
  po.updatedAt = new Date()
  await ctx.em.flush()
}

export async function submitPo(ctx: OrderContext, po: PurchaseOrder) {
  if (po.status !== 'draft') throw new PurchaseError('Only a draft can be sent for approval', 409)
  po.status = 'pending_approval'
  const byName = await currentUserName(ctx)
  stamp(po, 'submitted', byName, null)
  po.updatedAt = new Date()
  await ctx.em.flush()
  await notifyApprovers(ctx, { type: 'cc_purchase.po.submitted', title: `PO ${po.code} needs approval`, body: `${po.vendorName}${byName ? ` · raised by ${byName}` : ''}`, href: `/backend/purchase/orders/${po.id}`, sourceId: po.id })
}

export async function approvePo(ctx: OrderContext, po: PurchaseOrder, note: string | null) {
  if (po.status !== 'pending_approval') throw new PurchaseError('This PO is not waiting for approval', 409)
  const byName = await currentUserName(ctx)
  po.status = 'approved'
  po.approvedByName = byName
  po.approvedAt = new Date()
  stamp(po, 'approved', byName, note)
  po.updatedAt = new Date()
  await ctx.em.flush()
}

export async function cancelPo(ctx: OrderContext, po: PurchaseOrder, note: string) {
  const lines = await ctx.em.find(PurchaseOrderLine, { poId: po.id })
  if (lines.some((line) => num(line.receivedQty) > EPSILON)) throw new PurchaseError('Goods have been received against this PO. It cannot be cancelled.', 409)
  if (po.status === 'cancelled') return
  po.status = 'cancelled'
  stamp(po, 'cancelled', await currentUserName(ctx), note)
  po.updatedAt = new Date()
  await ctx.em.flush()
}

export async function poView(ctx: OrderContext, po: PurchaseOrder) {
  const [lines, grns, vendor] = await Promise.all([
    ctx.em.find(PurchaseOrderLine, { poId: po.id }, { orderBy: { position: 'asc' } }),
    ctx.em.find(GoodsReceipt, { poId: po.id, deletedAt: null }, { orderBy: { createdAt: 'asc' } }),
    ctx.em.findOne(Vendor, { id: po.vendorId, tenantId: ctx.tenantId, organizationId: ctx.organizationId }),
  ])
  const products = await loadProducts(ctx, lines.map((line) => line.productId))
  const view = lines.map((line) => {
    const amount = num(line.quantity) * num(line.rate)
    return {
      id: line.id,
      productId: line.productId,
      title: products.get(line.productId)?.title ?? '(deleted product)',
      code: products.get(line.productId)?.code ?? null,
      kind: products.get(line.productId)?.kind ?? null,
      unit: line.unit,
      quantity: num(line.quantity),
      rate: num(line.rate),
      gstPercent: num(line.gstPercent),
      amount: round(amount, 2),
      gst: round((amount * num(line.gstPercent)) / 100, 2),
      received: num(line.receivedQty),
      open: round(Math.max(0, num(line.quantity) - num(line.receivedQty))),
      notes: line.notes ?? null,
    }
  })
  const subtotal = round(view.reduce((sum, line) => sum + line.amount, 0), 2)
  const gst = round(view.reduce((sum, line) => sum + line.gst, 0), 2)
  return {
    id: po.id,
    code: po.code,
    vendorId: po.vendorId,
    vendorName: po.vendorName,
    vendorGstin: po.vendorGstin ?? null,
    vendorPhone: vendor?.contactPhone ?? null,
    vendorContact: vendor?.contactPerson ?? null,
    vendorEmail: vendor?.contactEmail ?? null,
    poDate: po.poDate,
    expectedDate: po.expectedDate ?? null,
    status: po.status,
    notes: po.notes ?? null,
    terms: po.terms ?? null,
    orderRefs: po.orderRefs ?? [],
    createdByName: po.createdByName ?? null,
    approvedByName: po.approvedByName ?? null,
    approvedAt: po.approvedAt ? po.approvedAt.toISOString() : null,
    history: po.history ?? [],
    createdAt: po.createdAt.toISOString(),
    updatedAt: po.updatedAt.toISOString(),
    lines: view,
    subtotal,
    gst,
    total: round(subtotal + gst, 2),
    grns: grns.map((grn) => ({ id: grn.id, code: grn.code, grnDate: grn.grnDate, status: grn.status, invoiceNo: grn.invoiceNo ?? null })),
  }
}

async function uniqueLotNumber(ctx: Scope, variantId: string, wanted: string, grnCode: string): Promise<string> {
  const [row] = await ctx.em.getConnection().execute<Array<{ count: string }>>(
    `select count(*)::text as count from wms_inventory_lots where catalog_variant_id = ? and lot_number = ? and tenant_id = ? and organization_id = ? and deleted_at is null`,
    [variantId, wanted, ctx.tenantId, ctx.organizationId],
  )
  return Number(row?.count ?? 0) ? `${wanted} (${grnCode})` : wanted
}

type ReceiveEntry = { productId: string; unit: string; quantity: number; lotNumber: string; mfgDate?: string | null; expiryDate?: string | null; poLineId?: string | null; rate?: number | null; gstPercent?: number | null }

async function stockTargets(ctx: StoreContext, productIds: string[]) {
  const warehouse = await ccWarehouse(ctx)
  if (!warehouse) throw new PurchaseError('The store locations are missing. Set them up under Masters → Stores.', 409)
  const variants = await ensureStockRecords(ctx, productIds)
  const skus = new Map<string, string>()
  if (variants.size) {
    const rows = await ctx.em.getConnection().execute<Array<{ id: string; sku: string | null }>>(
      `select id, sku from catalog_product_variants where id = any(?::uuid[])`,
      [`{${Array.from(variants.values()).join(',')}}`],
    )
    for (const row of rows) if (row.sku) skus.set(row.id, row.sku)
  }
  const products = await loadProducts(ctx, productIds)
  for (const productId of productIds) {
    const variantId = variants.get(productId)
    if (!variantId || !skus.get(variantId)) throw new PurchaseError(`${products.get(productId)?.title ?? 'A material'} has no stock record (SKU) yet`)
  }
  return { warehouse, variants, skus, products }
}

async function receiveLines(ctx: StoreContext, grn: GoodsReceipt, entries: ReceiveEntry[], source: { poId: string | null; poCode: string | null; vendorName: string }, byName: string | null): Promise<GoodsReceiptLine[]> {
  const { warehouse, variants, skus, products } = await stockTargets(ctx, [...new Set(entries.map((entry) => entry.productId))])
  const lines: GoodsReceiptLine[] = []
  for (const entry of entries) {
    const product = products.get(entry.productId)
    const store = receivingStoreFor(product?.kind ?? null)
    const variantId = variants.get(entry.productId)!
    const locationId = warehouse.locations.get(LOCATION_CODES[store])
    if (!locationId) throw new PurchaseError(`The ${PLACE_LABEL[store]} location is missing`, 409)
    const lotNumber = await uniqueLotNumber(ctx, variantId, entry.lotNumber, grn.code)
    const lot = await runCommand<{ lotId: string }>(ctx, 'wms.lots.create', {
      catalogVariantId: variantId,
      sku: skus.get(variantId),
      lotNumber,
      batchNumber: entry.lotNumber,
      ...(entry.mfgDate ? { manufacturedAt: entry.mfgDate } : {}),
      ...(entry.expiryDate ? { expiresAt: entry.expiryDate } : {}),
      status: 'quarantine',
      metadata: { grnId: grn.id, grnCode: grn.code, poCode: source.poCode, vendor: source.vendorName },
    })
    await runCommand(ctx, 'wms.inventory.receive', {
      warehouseId: warehouse.warehouseId,
      locationId,
      catalogVariantId: variantId,
      lotId: lot.lotId,
      quantity: round(entry.quantity),
      referenceType: 'po',
      referenceId: randomUUID(),
      performedBy: performerId(ctx),
      reason: `${grn.code} from ${source.vendorName} (${source.poCode ?? 'without PO'}) · under QC test`,
      metadata: { grnId: grn.id, grnCode: grn.code, poId: source.poId, poCode: source.poCode },
    })
    const line = ctx.em.create(GoodsReceiptLine, {
      organizationId: ctx.organizationId,
      tenantId: ctx.tenantId,
      grnId: grn.id,
      poLineId: entry.poLineId ?? null,
      rate: entry.rate == null ? null : String(entry.rate),
      gstPercent: entry.gstPercent == null ? null : String(entry.gstPercent),
      productId: entry.productId,
      variantId,
      unit: entry.unit,
      store,
      quantity: String(round(entry.quantity)),
      lotId: lot.lotId,
      lotNumber,
      mfgDate: entry.mfgDate ?? null,
      expiryDate: entry.expiryDate ?? null,
    })
    ctx.em.persist(line)
    lines.push(line)
  }
  return lines
}

export async function createGrn(ctx: StoreContext, input: GrnInput): Promise<GoodsReceipt> {
  const po = await findPo(ctx, input.poId)
  if (po.status !== 'approved' && po.status !== 'partly_received') {
    throw new PurchaseError(po.status === 'received' ? 'Everything on this PO has already arrived' : 'Goods can be received only against an approved PO', 409)
  }
  const poLines = await ctx.em.find(PurchaseOrderLine, { poId: po.id })
  const merged = new Map<string, number>()
  for (const entry of input.lines) {
    const line = poLines.find((candidate) => candidate.id === entry.poLineId)
    if (!line) throw new PurchaseError('A line is not on this PO', 404)
    merged.set(line.id, (merged.get(line.id) ?? 0) + entry.quantity)
  }
  const products = await loadProducts(ctx, poLines.map((line) => line.productId))
  const overPercent = Number((await loadCompany(ctx))?.grnOverPercent ?? 0)
  for (const [lineId, quantity] of merged) {
    const line = poLines.find((candidate) => candidate.id === lineId)!
    const open = num(line.quantity) - num(line.receivedQty)
    const allowance = (num(line.quantity) * overPercent) / 100
    if (quantity > open + allowance + EPSILON) {
      throw new PurchaseError(
        overPercent
          ? `${products.get(line.productId)?.title ?? 'A line'}: only ${round(open)} ${line.unit} is still to come on this PO (up to ${round(open + allowance)} with the ${overPercent}% allowance)`
          : `${products.get(line.productId)?.title ?? 'A line'}: only ${round(open)} ${line.unit} is still to come on this PO`,
      )
    }
  }
  await stockTargets(ctx, [...new Set(poLines.filter((line) => merged.has(line.id)).map((line) => line.productId))])

  const byName = await currentUserName(ctx)
  const grn = ctx.em.create(GoodsReceipt, {
    organizationId: ctx.organizationId,
    tenantId: ctx.tenantId,
    code: await nextCode(ctx, 'cc_grns', 'GR'),
    poId: po.id,
    poCode: po.code,
    vendorId: po.vendorId,
    vendorName: po.vendorName,
    grnDate: input.grnDate,
    invoiceNo: input.invoiceNo ?? null,
    invoiceDate: input.invoiceDate ?? null,
    notes: input.notes ?? null,
    receivedByName: byName,
    history: [{ action: 'received', by: byName, at: new Date().toISOString(), note: input.invoiceNo ? `Invoice ${input.invoiceNo}` : null }],
  })
  ctx.em.persist(grn)
  await ctx.em.flush()

  const entries: ReceiveEntry[] = input.lines.map((entry) => {
    const poLine = poLines.find((candidate) => candidate.id === entry.poLineId)!
    return { productId: poLine.productId, unit: poLine.unit, quantity: entry.quantity, lotNumber: entry.lotNumber, mfgDate: entry.mfgDate, expiryDate: entry.expiryDate, poLineId: poLine.id }
  })
  const grnLines = await receiveLines(ctx, grn, entries, { poId: po.id, poCode: po.code, vendorName: po.vendorName }, byName)
  for (const entry of input.lines) {
    const poLine = poLines.find((candidate) => candidate.id === entry.poLineId)!
    poLine.receivedQty = String(round(num(poLine.receivedQty) + entry.quantity))
  }
  grn.status = grnStatus(grnLines)
  po.status = receivedStatus(po, poLines)
  stamp(po, 'goods_received', byName, grn.code)
  po.updatedAt = new Date()
  await ctx.em.flush()
  return grn
}

export async function createDirectGrn(ctx: StoreContext, input: DirectGrnInput): Promise<GoodsReceipt> {
  const vendor = await findVendor(ctx, input.vendorId)
  const products = await loadProducts(ctx, input.lines.map((line) => line.productId))
  for (const entry of input.lines) {
    const product = products.get(entry.productId)
    if (!product) throw new PurchaseError('A material on the list was not found', 404)
    if (!PURCHASED_KINDS.has(product.kind as ProductKind)) throw new PurchaseError(`${product.title} is not a material that is bought`)
  }
  await stockTargets(ctx, [...new Set(input.lines.map((line) => line.productId))])
  const byName = await currentUserName(ctx)
  const grn = ctx.em.create(GoodsReceipt, {
    organizationId: ctx.organizationId,
    tenantId: ctx.tenantId,
    code: await nextCode(ctx, 'cc_grns', 'GR'),
    poId: null,
    poCode: null,
    vendorId: vendor.id,
    vendorName: vendor.name,
    grnDate: input.grnDate,
    invoiceNo: input.invoiceNo ?? null,
    invoiceDate: input.invoiceDate ?? null,
    notes: [`Without PO: ${input.reason}`, input.notes].filter(Boolean).join('\n'),
    receivedByName: byName,
    history: [{ action: 'received', by: byName, at: new Date().toISOString(), note: `Without PO: ${input.reason}${input.invoiceNo ? ` · invoice ${input.invoiceNo}` : ''}` }],
  })
  ctx.em.persist(grn)
  await ctx.em.flush()
  const entries: ReceiveEntry[] = input.lines.map((entry) => ({
    productId: entry.productId,
    unit: products.get(entry.productId)?.unit ?? 'kg',
    quantity: entry.quantity,
    lotNumber: entry.lotNumber,
    mfgDate: entry.mfgDate,
    expiryDate: entry.expiryDate,
    rate: entry.rate,
    gstPercent: entry.gstPercent,
  }))
  const grnLines = await receiveLines(ctx, grn, entries, { poId: null, poCode: null, vendorName: vendor.name }, byName)
  grn.status = grnStatus(grnLines)
  await ctx.em.flush()
  return grn
}

export async function decideLine(ctx: StoreContext, grn: GoodsReceipt, lineId: string, decision: 'passed' | 'failed', note: string | null) {
  const line = await ctx.em.findOne(GoodsReceiptLine, { id: lineId, grnId: grn.id })
  if (!line) throw new PurchaseError('Line not found', 404)
  if (line.qcStatus === 'returned') throw new PurchaseError('This batch was already returned to the vendor', 409)
  if (line.qcStatus === decision) return
  if (decision === 'failed' && !note) throw new PurchaseError('Write why the material is on hold')
  if (line.lotId) {
    await runCommand(ctx, 'wms.lots.update', {
      id: line.lotId,
      status: decision === 'passed' ? 'available' : 'hold',
      notes: decision === 'passed' ? `Passed on receipt (${grn.code})` : `On hold on receipt (${grn.code}): ${note}`,
    })
  }
  line.qcStatus = decision
  const lines = await ctx.em.find(GoodsReceiptLine, { grnId: grn.id })
  grn.status = grnStatus(lines)
  stamp(grn, decision === 'passed' ? 'qc_passed' : 'qc_failed', await currentUserName(ctx), note ?? line.lotNumber)
  grn.updatedAt = new Date()
  await ctx.em.flush()
}

export async function returnToVendor(ctx: StoreContext, grn: GoodsReceipt, lineId: string, note: string) {
  const line = await ctx.em.findOne(GoodsReceiptLine, { id: lineId, grnId: grn.id })
  if (!line) throw new PurchaseError('Line not found', 404)
  if (line.qcStatus !== 'failed') throw new PurchaseError('Only material on hold can be returned to the vendor', 409)
  const warehouse = await ccWarehouse(ctx)
  const locationId = warehouse?.locations.get(LOCATION_CODES[line.store])
  if (!warehouse || !locationId) throw new PurchaseError('The store location is missing', 409)
  const quantity = num(line.quantity)
  await runCommand(ctx, 'wms.inventory.adjust', {
    warehouseId: warehouse.warehouseId,
    locationId,
    catalogVariantId: line.variantId,
    ...(line.lotId ? { lotId: line.lotId } : {}),
    delta: -round(quantity),
    reason: `Returned to ${grn.vendorName} (${grn.code}): ${note}`,
    reasonCode: 'return_to_vendor',
    referenceType: 'po',
    referenceId: randomUUID(),
    performedBy: performerId(ctx),
    metadata: { grnId: grn.id, grnCode: grn.code },
  })
  line.returnedQty = String(round(quantity))
  line.qcStatus = 'returned'
  const byName = await currentUserName(ctx)
  if (grn.poId) {
    const poLine = line.poLineId ? await ctx.em.findOne(PurchaseOrderLine, { id: line.poLineId }) : null
    const po = await findPo(ctx, grn.poId)
    if (poLine) poLine.receivedQty = String(round(Math.max(0, num(poLine.receivedQty) - quantity)))
    const poLines = await ctx.em.find(PurchaseOrderLine, { poId: po.id })
    po.status = receivedStatus(po, poLines)
    stamp(po, 'returned', byName, `${round(quantity)} ${line.unit} back to vendor from ${grn.code}`)
    po.updatedAt = new Date()
  }
  const lines = await ctx.em.find(GoodsReceiptLine, { grnId: grn.id })
  grn.status = grnStatus(lines)
  stamp(grn, 'returned', byName, note)
  grn.updatedAt = new Date()
  await ctx.em.flush()
}

export async function grnView(ctx: OrderContext, grn: GoodsReceipt) {
  const lines = await ctx.em.find(GoodsReceiptLine, { grnId: grn.id }, { orderBy: { createdAt: 'asc' } })
  const products = await loadProducts(ctx, lines.map((line) => line.productId))
  const poLineIds = lines.map((line) => line.poLineId).filter((id): id is string => Boolean(id))
  const poLines = poLineIds.length ? await ctx.em.find(PurchaseOrderLine, { id: { $in: poLineIds } }) : []
  return {
    id: grn.id,
    code: grn.code,
    poId: grn.poId,
    poCode: grn.poCode,
    vendorId: grn.vendorId,
    vendorName: grn.vendorName,
    grnDate: grn.grnDate,
    invoiceNo: grn.invoiceNo ?? null,
    invoiceDate: grn.invoiceDate ?? null,
    status: grn.status,
    notes: grn.notes ?? null,
    receivedByName: grn.receivedByName ?? null,
    history: grn.history ?? [],
    createdAt: grn.createdAt.toISOString(),
    updatedAt: grn.updatedAt.toISOString(),
    lines: lines.map((line) => {
      const poLine = poLines.find((entry) => entry.id === line.poLineId)
      return {
        id: line.id,
        productId: line.productId,
        title: products.get(line.productId)?.title ?? '(deleted product)',
        code: products.get(line.productId)?.code ?? null,
        unit: line.unit,
        store: line.store,
        quantity: num(line.quantity),
        rate: poLine ? num(poLine.rate) : line.rate != null ? num(line.rate) : null,
        gstPercent: poLine ? num(poLine.gstPercent) : line.gstPercent != null ? num(line.gstPercent) : null,
        lotNumber: line.lotNumber,
        mfgDate: line.mfgDate ?? null,
        expiryDate: line.expiryDate ?? null,
        qcStatus: line.qcStatus,
        returnedQty: num(line.returnedQty),
      }
    }),
  }
}

export type OpenPurchase = { poId: string; code: string; open: number; expectedDate: string | null; vendorName: string; orderIds: string[] }

function refOrderIds(value: unknown): string[] {
  const list = typeof value === 'string' ? (() => { try { return JSON.parse(value) as unknown } catch { return [] } })() : value
  return Array.isArray(list) ? list.map((entry) => (entry && typeof entry === 'object' ? String((entry as { orderId?: unknown }).orderId ?? '') : '')).filter(Boolean) : []
}

export async function openPurchaseFor(ctx: Scope, productIds: string[]): Promise<Map<string, OpenPurchase[]>> {
  const result = new Map<string, OpenPurchase[]>()
  if (!productIds.length) return result
  const rows = await ctx.em.getConnection().execute<Array<{ product_id: string; po_id: string; code: string; open: string; expected_date: string | null; vendor_name: string; order_refs: unknown }>>(
    `select l.product_id, p.id as po_id, p.code, (l.quantity - l.received_qty)::text as open, p.expected_date, p.vendor_name, p.order_refs
       from cc_po_lines l join cc_pos p on p.id = l.po_id
      where l.product_id = any(?::uuid[]) and p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null
        and p.status in ('pending_approval', 'approved', 'partly_received') and l.quantity > l.received_qty
      order by p.expected_date nulls last`,
    [`{${productIds.join(',')}}`, ctx.tenantId, ctx.organizationId],
  )
  for (const row of rows) {
    result.set(row.product_id, [...(result.get(row.product_id) ?? []), { poId: row.po_id, code: row.code, open: num(row.open), expectedDate: row.expected_date, vendorName: row.vendor_name, orderIds: refOrderIds(row.order_refs) }])
  }
  return result
}

export async function underTestFor(ctx: Scope, productIds: string[]): Promise<Map<string, Array<{ grnCode: string; quantity: number; orderIds: string[] }>>> {
  const result = new Map<string, Array<{ grnCode: string; quantity: number; orderIds: string[] }>>()
  if (!productIds.length) return result
  const rows = await ctx.em.getConnection().execute<Array<{ product_id: string; code: string; quantity: string; order_refs: unknown }>>(
    `select l.product_id, g.code, (l.quantity - coalesce(l.returned_qty, 0))::text as quantity, p.order_refs
       from cc_grn_lines l join cc_grns g on g.id = l.grn_id left join cc_pos p on p.id = g.po_id
      where l.product_id = any(?::uuid[]) and g.tenant_id = ? and g.organization_id = ? and g.deleted_at is null and l.qc_status = 'pending'`,
    [`{${productIds.join(',')}}`, ctx.tenantId, ctx.organizationId],
  )
  for (const row of rows) {
    result.set(row.product_id, [...(result.get(row.product_id) ?? []), { grnCode: row.code, quantity: num(row.quantity), orderIds: refOrderIds(row.order_refs) }])
  }
  return result
}
