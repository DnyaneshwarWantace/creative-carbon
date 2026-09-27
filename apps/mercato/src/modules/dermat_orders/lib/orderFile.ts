import { QcCheck } from '../../dermat_quality/data/entities'
import { reservationHealth } from '../../dermat_planning/lib/health'
import { StoreRequest, StoreRequestLine } from '../../dermat_store/data/entities'
import { TaxInvoice } from '../../dermat_accounts/data/entities'
import { calculate } from '../../dermat_planning/lib/service'
import { LOCATION_CODES, dermatWarehouse, lotsAtLocation, variantsForProducts } from '../../dermat_products/lib/stock'
import { DermatOrder, DermatOrderLine, DermatOrderStage } from '../data/entities'
import { loadProducts, type OrderContext } from './server'
import { canSeeMoney, isMoneyStageField } from './money'
import { bomsInUse, type BomsInUse } from './engine'
import { stageDef } from './stages'

const EPSILON = 0.0001

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

export type MaterialStatus = 'used' | 'with_production' | 'reserved' | 'partly_reserved' | 'available' | 'coming' | 'short'

type IssueEntry = { lotNumber?: string | null; quantity?: number; used?: number; returned?: number; at?: string; by?: string | null }

export async function orderFile(ctx: OrderContext, order: DermatOrder) {
  const money = await canSeeMoney(ctx)
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const lines = await ctx.em.find(DermatOrderLine, { orderId: order.id }, { orderBy: { position: 'asc' } })
  const stages = await ctx.em.find(DermatOrderStage, { orderId: order.id })
  const stageData = (key: string) => (stages.find((stage) => stage.stageKey === key)?.data ?? {}) as Record<string, unknown>
  const open = order.status !== 'completed' && order.status !== 'cancelled'

  const health = [...(await reservationHealth(ctx, { orderIds: [order.id] })).values()]
  const calc = await calculate(ctx, lines.map((line) => ({ key: line.id, orderId: order.id, lineId: line.id, productId: line.productId, quantity: num(line.quantity) })))

  const requests = await ctx.em.find(StoreRequest, { ...scope, orderId: order.id, deletedAt: null }, { orderBy: { createdAt: 'asc' } })
  const requestLines = requests.length ? await ctx.em.find(StoreRequestLine, { requestId: { $in: requests.map((request) => request.id) } }) : []
  const issued = new Map<string, { requested: number; issued: number; received: number; used: number; returned: number; lots: Array<{ lotNumber: string; quantity: number; stage: string; request: string; at: string | null }> }>()
  for (const line of requestLines) {
    const request = requests.find((entry) => entry.id === line.requestId)
    if (!request || request.status === 'cancelled') continue
    const entry = issued.get(line.productId) ?? { requested: 0, issued: 0, received: 0, used: 0, returned: 0, lots: [] }
    entry.requested += num(line.requiredQty)
    entry.issued += num(line.issuedQty)
    entry.received += num(line.receivedQty)
    entry.used += num(line.usedQty)
    entry.returned += num(line.returnedQty)
    for (const issue of (line.issues as IssueEntry[] | null) ?? []) {
      if (!issue.quantity) continue
      entry.lots.push({ lotNumber: issue.lotNumber ?? '—', quantity: round(num(issue.quantity)), stage: request.stageKey, request: request.code, at: issue.at ?? null })
    }
    issued.set(line.productId, entry)
  }

  const materials = calc.rows.map((row) => {
    const moved = issued.get(row.productId)
    const used = round(moved?.used ?? 0)
    const issuedQty = round(moved?.issued ?? 0)
    const returned = round(moved?.returned ?? 0)
    const withProduction = round(Math.max(0, (moved?.received ?? 0) - used - returned))
    const covered = issuedQty - returned
    const stillNeeded = round(Math.max(0, row.required - covered))
    const incoming = round(row.underTest + row.onOrder)
    let status: MaterialStatus
    if (stillNeeded <= EPSILON && used >= covered - EPSILON && covered > EPSILON) status = 'used'
    else if (stillNeeded <= EPSILON) status = 'with_production'
    else if (row.reservedHere >= stillNeeded - EPSILON) status = 'reserved'
    else if (!open) status = 'used'
    else if (row.reservedHere > EPSILON) status = 'partly_reserved'
    else if (row.free >= stillNeeded - EPSILON) status = 'available'
    else if (row.free + incoming >= stillNeeded - EPSILON) status = 'coming'
    else status = 'short'
    return {
      productId: row.productId,
      code: row.code,
      title: row.title,
      kind: row.kind,
      unit: row.unit,
      needed: row.required,
      reserved: row.reservedHere,
      issued: issuedQty,
      withProduction,
      used,
      returned,
      stillNeeded: open ? stillNeeded : 0,
      free: row.free,
      underTest: row.underTest,
      onOrder: row.onOrder,
      toBuy: open ? round(Math.max(0, stillNeeded - row.reservedHere - row.free - incoming)) : 0,
      status,
      lots: moved?.lots ?? [],
      reserveMissing: round(health.filter((entry) => entry.productId === row.productId).reduce((sum, entry) => sum + entry.missing, 0)),
      reserveExpiring: health.find((entry) => entry.productId === row.productId && entry.expiring)?.expiring ?? null,
      reservedSince: health.find((entry) => entry.productId === row.productId) ? new Date(Date.now() - (health.find((entry) => entry.productId === row.productId)?.ageDays ?? 0) * 86400000).toISOString().slice(0, 10) : null,
      openPos: row.openPos.map((po) => ({ id: po.poId, code: po.code, open: po.open, expectedDate: po.expectedDate, vendorName: po.vendorName })),
    }
  })

  const connection = ctx.em.getConnection()
  const pos = await connection.execute<Array<{ id: string; code: string; status: string; vendor_name: string; po_date: string; expected_date: string | null; total: string | null; lines: string }>>(
    `select p.id, p.code, p.status, p.vendor_name, p.po_date, p.expected_date,
            (select sum(l.quantity * l.rate * (1 + coalesce(l.gst_percent, 0) / 100)) from dermat_po_lines l where l.po_id = p.id)::text as total,
            (select count(*) from dermat_po_lines l where l.po_id = p.id)::text as lines
       from dermat_pos p
      where p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null and p.order_refs::text like ?
      order by p.created_at`,
    [ctx.tenantId, ctx.organizationId, `%${order.id}%`],
  )
  const grns = pos.length
    ? await connection.execute<Array<{ id: string; code: string; po_id: string; status: string; grn_date: string; invoice_no: string | null }>>(
        `select id, code, po_id, status, grn_date, invoice_no from dermat_grns where po_id = any(?::uuid[]) and deleted_at is null order by created_at`,
        [`{${pos.map((po) => po.id).join(',')}}`],
      )
    : []
  const indents = await connection.execute<Array<{ id: string; code: string; status: string; department: string | null }>>(
    `select id, code, status, department from dermat_purchase_indents where tenant_id = ? and organization_id = ? and deleted_at is null and order_refs::text like ? order by created_at`,
    [ctx.tenantId, ctx.organizationId, `%${order.id}%`],
  )

  const checks = await ctx.em.find(QcCheck, { ...scope, orderId: order.id, deletedAt: null }, { orderBy: { createdAt: 'asc' } })
  const qcProducts = await loadProducts(ctx, checks.map((check) => check.productId))
  const qc = checks.map((check) => ({
    id: check.id,
    code: check.code,
    stageKey: check.stageKey,
    status: check.status,
    productTitle: qcProducts.get(check.productId)?.title ?? '',
    batchNo: check.batchNo ?? null,
    arNo: check.arNo ?? null,
    chemicalStatus: check.chemicalStatus,
    microStatus: check.microStatus,
    chemicalBy: check.chemicalBy ?? null,
    microBy: check.microBy ?? null,
    round: check.round ?? 1,
    results: (check.results ?? []).map((result) => ({ name: result.name, spec: result.spec, observation: result.observation, test: result.test, inSpec: result.inSpec ?? null })),
  }))

  const invoices = await ctx.em.find(TaxInvoice, { ...scope, orderId: order.id, deletedAt: null }, { orderBy: { createdAt: 'asc' } })

  const products = await loadProducts(ctx, lines.map((line) => line.productId))
  const bulkRows = lines.length
    ? await connection.execute<Array<{ product_id: string; bulk_id: string }>>(
        `select h.product_id, i.component_product_id as bulk_id
           from dermat_bom_headers h join dermat_bom_items i on i.bom_id = h.id
          where h.product_id = any(?::uuid[]) and h.tenant_id = ? and h.organization_id = ? and h.deleted_at is null and h.status = 'approved' and i.component_kind = 'bulk'`,
        [`{${lines.map((line) => line.productId).join(',')}}`, ctx.tenantId, ctx.organizationId],
      )
    : []
  const bulkOf = new Map(bulkRows.map((row) => [row.product_id, row.bulk_id]))
  const bulkProducts = await loadProducts(ctx, [...new Set(bulkRows.map((row) => row.bulk_id))])
  const warehouse = await dermatWarehouse(ctx)
  const productionId = warehouse?.locations.get(LOCATION_CODES.production)
  const fgId = warehouse?.locations.get(LOCATION_CODES.fg)
  const variantIds = await variantsForProducts(ctx, [...lines.map((line) => line.productId), ...bulkOf.values()])
  const allVariants = Array.from(variantIds.values())
  const productionLots = productionId && allVariants.length ? await lotsAtLocation(ctx, allVariants, productionId) : []
  const fgLots = fgId && allVariants.length ? await lotsAtLocation(ctx, allVariants, fgId) : []
  const manufacturing = stageData('manufacturing')
  const filling = stageData('filling')
  const packing = stageData('packing')
  const dispatch = stageData('dispatch')
  const lineCount = Math.max(1, lines.length)
  const output = lines.map((line) => {
    const batchNo = line.batchNo ?? (typeof manufacturing.batch_no === 'string' ? manufacturing.batch_no : null)
    const bulkId = bulkOf.get(line.productId) ?? null
    const bulkVariant = bulkId ? variantIds.get(bulkId) : undefined
    const fgVariant = variantIds.get(line.productId)
    const bulkLeft = productionLots.filter((lot) => lot.variantId === bulkVariant && (!batchNo || lot.lotNumber === batchNo)).reduce((sum, lot) => sum + lot.onHand, 0)
    const fgLeft = fgLots.filter((lot) => lot.variantId === fgVariant && (!batchNo || lot.lotNumber === batchNo)).reduce((sum, lot) => sum + lot.onHand, 0)
    return {
      lineId: line.id,
      productId: line.productId,
      title: products.get(line.productId)?.title ?? '—',
      ordered: num(line.quantity),
      batchNo,
      bulkId,
      bulkTitle: bulkId ? (bulkProducts.get(bulkId)?.title ?? null) : null,
      bulkMadeKg: lineCount === 1 ? num(manufacturing.batch_size) || null : null,
      bulkLeftKg: round(bulkLeft),
      filled: lineCount === 1 ? num(filling.filled_units) || null : null,
      rejected: lineCount === 1 ? num(filling.rejected_units) || null : null,
      packed: lineCount === 1 ? num(packing.packed_qty) || null : null,
      packedLocation: typeof packing.location === 'string' ? packing.location : null,
      dispatched: dispatch.dispatch_date ? (lineCount === 1 ? num(packing.packed_qty) || num(line.quantity) : num(line.quantity)) : 0,
      dispatchDate: typeof dispatch.dispatch_date === 'string' ? dispatch.dispatch_date : null,
      deliveredOn: typeof dispatch.delivered_on === 'string' ? dispatch.delivered_on : null,
      fgInStore: round(fgLeft),
    }
  })

  const frozen = stageData('manufacturing').__bom_used as BomsInUse | undefined
  const bomSet = frozen ?? (await bomsInUse(ctx, order.id, null))
  const bomIds = Array.from(new Set([...Object.values(bomSet.pack), ...Object.values(bomSet.formula)].map((bom) => bom.id)))
  const bomProducts = await loadProducts(ctx, Object.keys(bomSet.formula))

  const issuedLots = materials.flatMap((row) => row.lots.map((lot) => ({ ...lot, productId: row.productId, code: row.code, title: row.title, unit: row.unit })))
  const lotSources = issuedLots.length
    ? await connection.execute<Array<{ product_id: string; lot_number: string; mfg_date: string | null; expiry_date: string | null; qc_status: string | null; grn_id: string; grn_code: string; vendor_name: string | null; grn_date: string | null; qc_id: string | null; qc_code: string | null; ar_no: string | null }>>(
        `select gl.product_id, gl.lot_number, gl.mfg_date, gl.expiry_date, gl.qc_status, g.id as grn_id, g.code as grn_code, g.vendor_name, g.grn_date::text as grn_date, q.id as qc_id, q.code as qc_code, q.ar_no
           from dermat_grn_lines gl
           join dermat_grns g on g.id = gl.grn_id
           left join dermat_quality_checks q on q.id = gl.qc_check_id
          where g.tenant_id = ? and g.organization_id = ? and g.deleted_at is null
            and gl.lot_number = any(?::text[]) and gl.product_id = any(?::uuid[])`,
        [ctx.tenantId, ctx.organizationId, `{${issuedLots.map((lot) => `"${lot.lotNumber.replace(/"/g, '')}"`).join(',')}}`, `{${Array.from(new Set(issuedLots.map((lot) => lot.productId))).join(',')}}`],
      )
    : []
  const sourceOf = (productId: string, lotNumber: string) => lotSources.find((row) => row.product_id === productId && row.lot_number === lotNumber) ?? null

  const RUN_STAGES = ['manufacturing', 'filling', 'packing', 'qc_qa', 'dispatch']
  const runs = RUN_STAGES.map((key) => {
    const def = stageDef(key)
    const stage = stages.find((entry) => entry.stageKey === key)
    const data = stageData(key)
    const fields = (def?.fields ?? [])
      .filter((field) => money || !isMoneyStageField(key, field.key))
      .map((field) => ({ key: field.key, label: field.label, value: data[field.key] }))
      .filter((field) => field.value !== undefined && field.value !== null && field.value !== '')
      .map((field) => ({ key: field.key, label: field.label, value: String(field.value) }))
    return { key, label: def?.label ?? key, department: def?.department ?? '', status: stage?.status ?? 'waiting', completedAt: stage?.completedAt ? stage.completedAt.toISOString() : null, completedByName: stage?.completedByName ?? null, fields }
  })

  const record = {
    boms: {
      frozen: Boolean(frozen),
      at: frozen?.at ?? null,
      by: frozen?.by ?? null,
      lines: lines.map((line) => {
        const bulkId = bulkOf.get(line.productId) ?? null
        return {
          lineId: line.id,
          productId: line.productId,
          title: products.get(line.productId)?.title ?? '—',
          pack: bomSet.pack[line.productId] ?? null,
          bulkId,
          bulkTitle: bulkId ? (bomProducts.get(bulkId)?.title ?? bulkProducts.get(bulkId)?.title ?? null) : null,
          formula: bulkId ? (bomSet.formula[bulkId] ?? null) : null,
        }
      }),
      count: bomIds.length,
    },
    lots: issuedLots.map((lot) => {
      const source = sourceOf(lot.productId, lot.lotNumber)
      return {
        productId: lot.productId,
        code: lot.code,
        title: lot.title,
        unit: lot.unit,
        lotNumber: lot.lotNumber,
        quantity: lot.quantity,
        stage: lot.stage,
        request: lot.request,
        at: lot.at,
        grn: source ? { id: source.grn_id, code: source.grn_code, vendorName: source.vendor_name, date: source.grn_date } : null,
        mfgDate: source?.mfg_date ?? null,
        expiryDate: source?.expiry_date ?? null,
        qc: source?.qc_id ? { id: source.qc_id, code: source.qc_code ?? '', arNo: source.ar_no, status: source.qc_status } : null,
      }
    }),
    runs,
  }

  return {
    orderId: order.id,
    open,
    record,
    materials,
    summary: {
      total: materials.length,
      used: materials.filter((row) => row.status === 'used').length,
      withProduction: materials.filter((row) => row.status === 'with_production').length,
      reserved: materials.filter((row) => row.status === 'reserved').length,
      short: materials.filter((row) => row.status === 'short').length,
      coming: materials.filter((row) => row.status === 'coming').length,
      toBuy: materials.filter((row) => row.toBuy > EPSILON).length,
      reserveProblems: materials.filter((row) => row.reserveMissing > EPSILON || row.reserveExpiring).length,
    },
    missingBoms: calc.missingBoms,
    indents: indents.map((indent) => ({ id: indent.id, code: indent.code, status: indent.status, department: indent.department })),
    purchases: pos.map((po) => ({
      id: po.id,
      code: po.code,
      status: po.status,
      vendorName: po.vendor_name,
      poDate: po.po_date,
      expectedDate: po.expected_date,
      total: money ? Math.round(num(po.total) * 100) / 100 : null,
      lines: Number(po.lines),
      grns: grns.filter((grn) => grn.po_id === po.id).map((grn) => ({ id: grn.id, code: grn.code, status: grn.status, grnDate: grn.grn_date, invoiceNo: grn.invoice_no })),
    })),
    storeRequests: requests.map((request) => ({ id: request.id, code: request.code, stageKey: request.stageKey, status: request.status, lines: requestLines.filter((line) => line.requestId === request.id).length })),
    qc,
    invoices: invoices.map((invoice) => ({ id: invoice.id, code: invoice.code, kind: invoice.kind, status: invoice.status, invoiceDate: invoice.invoiceDate, total: money ? (invoice.totals?.payable ?? invoice.totals?.total ?? 0) : null })),
    output,
  }
}
