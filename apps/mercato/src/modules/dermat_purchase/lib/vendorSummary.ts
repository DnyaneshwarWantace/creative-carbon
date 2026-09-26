import { Vendor } from '../../dermat_vendors/data/entities'
import { loadProducts, type OrderContext } from '../../dermat_orders/lib/server'
import { GoodsReceipt, GoodsReceiptLine, PurchaseOrder, PurchaseOrderLine, type PoStatus } from '../data/entities'
import { PurchaseError, num, round } from './service'

const OPEN_STATUSES: PoStatus[] = ['draft', 'pending_approval', 'approved', 'partly_received']

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export async function vendorSummary(ctx: OrderContext, vendorId: string) {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const vendor = await ctx.em.findOne(Vendor, { id: vendorId, ...scope, deletedAt: null })
  if (!vendor) throw new PurchaseError('Vendor not found', 404)
  const [pos, grns] = await Promise.all([
    ctx.em.find(PurchaseOrder, { vendorId, ...scope, deletedAt: null }, { orderBy: { poDate: 'desc', code: 'desc' } }),
    ctx.em.find(GoodsReceipt, { vendorId, ...scope, deletedAt: null }, { orderBy: { grnDate: 'desc', code: 'desc' } }),
  ])
  const [poLines, grnLines] = await Promise.all([
    pos.length ? ctx.em.find(PurchaseOrderLine, { poId: { $in: pos.map((po) => po.id) } }) : Promise.resolve([] as PurchaseOrderLine[]),
    grns.length ? ctx.em.find(GoodsReceiptLine, { grnId: { $in: grns.map((grn) => grn.id) } }) : Promise.resolve([] as GoodsReceiptLine[]),
  ])
  const products = await loadProducts(ctx, [...new Set(poLines.map((line) => line.productId))])
  const today = todayIso()

  const poRows = pos.map((po) => {
    const lines = poLines.filter((line) => line.poId === po.id)
    const value = lines.reduce((sum, line) => sum + num(line.quantity) * num(line.rate) * (1 + num(line.gstPercent) / 100), 0)
    const ordered = lines.reduce((sum, line) => sum + num(line.quantity) * num(line.rate), 0)
    const received = lines.reduce((sum, line) => sum + Math.min(num(line.receivedQty), num(line.quantity)) * num(line.rate), 0)
    const receipts = grns.filter((grn) => grn.poId === po.id).map((grn) => grn.grnDate).sort()
    const open = OPEN_STATUSES.includes(po.status)
    return {
      id: po.id,
      code: po.code,
      poDate: po.poDate,
      expectedDate: po.expectedDate ?? null,
      status: po.status,
      value: round(value, 2),
      receivedPercent: ordered > 0 ? Math.round((received / ordered) * 100) : 0,
      firstReceipt: receipts[0] ?? null,
      late: open && po.status !== 'draft' && Boolean(po.expectedDate && po.expectedDate < today),
      orderRefs: po.orderRefs ?? [],
    }
  })

  const grnRows = grns.map((grn) => {
    const lines = grnLines.filter((line) => line.grnId === grn.id)
    return {
      id: grn.id,
      code: grn.code,
      poId: grn.poId,
      poCode: grn.poCode,
      grnDate: grn.grnDate,
      invoiceNo: grn.invoiceNo ?? null,
      status: grn.status,
      lines: lines.length,
      passed: lines.filter((line) => line.qcStatus === 'passed').length,
      failed: lines.filter((line) => line.qcStatus === 'failed' || line.qcStatus === 'returned').length,
    }
  })

  const materials = new Map<string, { productId: string; title: string; code: string | null; unit: string; orderedQty: number; receivedQty: number; lastRate: number; lastPoDate: string; poCount: number }>()
  for (const po of [...pos].reverse()) {
    if (po.status === 'cancelled') continue
    for (const line of poLines.filter((entry) => entry.poId === po.id)) {
      const product = products.get(line.productId)
      const current = materials.get(line.productId) ?? {
        productId: line.productId,
        title: product?.title ?? '(deleted product)',
        code: product?.code ?? null,
        unit: line.unit,
        orderedQty: 0,
        receivedQty: 0,
        lastRate: 0,
        lastPoDate: po.poDate,
        poCount: 0,
      }
      current.orderedQty = round(current.orderedQty + num(line.quantity))
      current.receivedQty = round(current.receivedQty + num(line.receivedQty))
      current.lastRate = num(line.rate)
      current.lastPoDate = po.poDate
      current.poCount += 1
      materials.set(line.productId, current)
    }
  }

  const dueRows = poRows.filter((row) => row.expectedDate && row.firstReceipt)
  const onTime = dueRows.filter((row) => (row.firstReceipt as string) <= (row.expectedDate as string)).length
  const tested = grnLines.filter((line) => line.qcStatus !== 'pending')
  const passedLines = tested.filter((line) => line.qcStatus === 'passed').length
  const openRows = poRows.filter((row) => OPEN_STATUSES.includes(row.status))

  return {
    vendor: {
      id: vendor.id,
      name: vendor.name,
      code: vendor.code ?? null,
      gstNumber: vendor.gstNumber ?? null,
      contactPerson: vendor.contactPerson ?? null,
      contactPhone: vendor.contactPhone ?? null,
      contactEmail: vendor.contactEmail ?? null,
      address: vendor.address ?? null,
      paymentTerms: vendor.paymentTerms ?? null,
      category: vendor.category ?? null,
      isActive: vendor.isActive,
      updatedAt: vendor.updatedAt.toISOString(),
    },
    summary: {
      poCount: poRows.filter((row) => row.status !== 'cancelled').length,
      openPoCount: openRows.length,
      openValue: round(openRows.reduce((sum, row) => sum + row.value * (1 - row.receivedPercent / 100), 0), 2),
      totalValue: round(poRows.filter((row) => row.status !== 'cancelled').reduce((sum, row) => sum + row.value, 0), 2),
      latePos: poRows.filter((row) => row.late).length,
      onTimePercent: dueRows.length ? Math.round((onTime / dueRows.length) * 100) : null,
      deliveriesMeasured: dueRows.length,
      qcPassPercent: tested.length ? Math.round((passedLines / tested.length) * 100) : null,
      batchesTested: tested.length,
      batchesRejected: tested.length - passedLines,
      lastPoDate: poRows[0]?.poDate ?? null,
    },
    pos: poRows,
    grns: grnRows,
    materials: [...materials.values()].sort((a, b) => (a.lastPoDate < b.lastPoDate ? 1 : -1)),
  }
}

export type VendorSummary = Awaited<ReturnType<typeof vendorSummary>>
