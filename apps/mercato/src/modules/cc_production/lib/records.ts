import { loadCustomers } from '../../cc_orders/lib/server'
import type { StoreContext } from '../../cc_store/lib/server'
import { CoatingSheet, CuttingEntry, DamageEntry, Dryer, FgDirectIn, FgInspection, Mould, MouldingEntry, Press, PressBatch, Reactor, ResinBatch, ThicknessInspection } from '../data/entities'
import { movementDocument, type DocumentLink } from '../../cc_ui/lib/links'
import { cuttingView, fgReportView, thicknessView } from './finishing'
import { sheetFigures } from './coatingFigures'
import { mouldedProductsByDie, runningTotals } from './moulding'
import { kg3 } from './plantStock'
import { pressFigures } from './pressFigures'
import { PlantError } from './server'

const WORK_DAYS = 60

function scope(ctx: StoreContext) {
  return { organizationId: ctx.organizationId, tenantId: ctx.tenantId }
}

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`

export async function dieDetail(ctx: StoreContext, mouldId: string) {
  const mould = await ctx.em.findOne(Mould, { id: mouldId, ...scope(ctx), deletedAt: null })
  if (!mould) throw new PlantError('Die not found', 404)
  const dieKey = mould.dieNo.toUpperCase()
  const [customers, products, entries, openLines] = await Promise.all([
    loadCustomers(ctx, mould.customerId ? [mould.customerId] : []),
    mouldedProductsByDie(ctx, [mould.dieNo]),
    ctx.em.find(MouldingEntry, { ...scope(ctx), mouldId: mould.id, deletedAt: null }, { orderBy: { entryDate: 'desc', shift: 'desc' }, limit: 200 }),
    ctx.em.getConnection().execute<Array<{ order_id: string; order_no: string; order_date: string; quantity: string; customer_id: string; status: string }>>(
      `select o.id as order_id, o.order_no, o.order_date, l.quantity, o.customer_id, o.status
         from cc_order_lines l join cc_orders o on o.id = l.order_id
        where o.tenant_id = ? and o.organization_id = ? and o.deleted_at is null and o.status in ('booked', 'confirmed')
          and upper(l.specs->'material'->>'die_no') = ?
        order by o.order_date asc`,
      [ctx.tenantId, ctx.organizationId, dieKey],
    ),
  ])
  const orderCustomers = await loadCustomers(ctx, openLines.map((line) => line.customer_id))
  const totals = await runningTotals(ctx, entries)
  const product = products.get(dieKey) ?? null
  const posted = entries.filter((entry) => entry.status === 'posted')
  const thisMonth = posted.filter((entry) => entry.entryDate >= monthStart())
  const madeFor = (orderNo: string) => posted.filter((entry) => entry.orderRef === orderNo).reduce((sum, entry) => sum + entry.productionNos, 0)
  return {
    id: mould.id,
    dieNo: mould.dieNo,
    mouldType: mould.mouldType,
    description: mould.description ?? null,
    size: mould.size ?? null,
    finish: mould.finish ?? null,
    thicknessMm: mould.thicknessMm ? Number(mould.thicknessMm) : null,
    customerId: mould.customerId ?? null,
    customerName: mould.customerId ? customers.get(mould.customerId)?.name ?? null : null,
    customerMouldNo: mould.customerMouldNo ?? null,
    storeLocation: mould.storeLocation ?? null,
    heatUpMinutes: mould.heatUpMinutes ?? null,
    isActive: mould.isActive,
    updatedByName: mould.updatedByName ?? null,
    updatedAt: mould.updatedAt.toISOString(),
    product: product ? { id: product.id, title: product.title, articleWeightKg: product.articleWeightKg } : null,
    figures: {
      piecesThisMonth: thisMonth.reduce((sum, entry) => sum + entry.productionNos, 0),
      kgThisMonth: kg3(thisMonth.reduce((sum, entry) => sum + entry.productionNos * Number(entry.articleWeightKg), 0)),
      piecesAllTime: posted.reduce((sum, entry) => sum + entry.productionNos, 0),
      lastUsed: posted[0]?.entryDate ?? null,
      shiftsRun: posted.length,
    },
    openOrders: openLines.map((line) => {
      const quantity = Number(line.quantity)
      const made = madeFor(line.order_no)
      return {
        orderId: line.order_id,
        orderNo: line.order_no,
        orderDate: line.order_date,
        customerName: orderCustomers.get(line.customer_id)?.name ?? null,
        quantity,
        made,
        short: Math.max(quantity - made, 0),
      }
    }),
    entries: entries.map((entry) => ({
      id: entry.id,
      entryDate: entry.entryDate,
      shift: entry.shift,
      pressId: entry.pressId,
      pressNumber: entry.pressNumber,
      orderRef: entry.orderRef ?? null,
      orderQty: entry.orderQty ?? null,
      productionNos: entry.productionNos,
      weightKg: kg3(entry.productionNos * Number(entry.articleWeightKg)),
      total: totals.get(entry.id) ?? entry.productionNos,
      operatorName: entry.operatorName ?? null,
      status: entry.status,
      outputLotId: entry.outputLotId ?? null,
      outputLotNumber: entry.outputLotNumber ?? null,
    })),
  }
}

export type MachineKind = 'reactor' | 'dryer' | 'press'

type WorkRow = { id: string; kind: 'resin' | 'coating' | 'press' | 'moulding'; date: string; label: string; detail: string | null; status: string; inputKg: number | null; outputKg: number | null; pieces: number | null; overCapacity: boolean }

export async function machineDetail(ctx: StoreContext, kind: MachineKind, id: string) {
  const since = daysAgo(WORK_DAYS)
  if (kind === 'reactor') {
    const reactor = await ctx.em.findOne(Reactor, { id, ...scope(ctx), deletedAt: null })
    if (!reactor) throw new PlantError('Reactor not found', 404)
    const batches = await ctx.em.find(ResinBatch, { ...scope(ctx), reactorId: reactor.id, deletedAt: null, batchDate: { $gte: since } }, { orderBy: { batchDate: 'desc', batchNo: 'desc' } })
    const capacity = reactor.capacityKg ? Number(reactor.capacityKg) : null
    const work: WorkRow[] = batches.map((batch) => {
      const input = kg3((batch.materials ?? []).reduce((sum, line) => sum + Number(line.kg ?? 0), 0))
      return {
        id: batch.id,
        kind: 'resin',
        date: batch.batchDate,
        label: batch.batchNo,
        detail: batch.grade,
        status: batch.status,
        inputKg: input,
        outputKg: batch.yieldKg ? Number(batch.yieldKg) : null,
        pieces: null,
        overCapacity: capacity !== null && input > capacity,
      }
    })
    return machineView({ kind, id: reactor.id, code: reactor.code, title: reactor.code, isActive: reactor.isActive, isWorking: null, capacityKg: capacity, notes: reactor.notes ?? null, work })
  }
  if (kind === 'dryer') {
    const dryer = await ctx.em.findOne(Dryer, { id, ...scope(ctx), deletedAt: null })
    if (!dryer) throw new PlantError('Dryer not found', 404)
    const sheets = await ctx.em.find(CoatingSheet, { ...scope(ctx), dryerId: dryer.id, deletedAt: null, sheetDate: { $gte: since } }, { orderBy: { sheetDate: 'desc' } })
    const work: WorkRow[] = sheets.map((sheet) => {
      const figures = sheetFigures(sheet.rows ?? [], sheet.slots ?? [])
      return {
        id: sheet.id,
        kind: 'coating',
        date: sheet.sheetDate,
        label: sheet.sheetDate,
        detail: null,
        status: sheet.status,
        inputKg: figures.rawTotal,
        outputKg: figures.outputTotal || figures.bstageTotal || null,
        pieces: figures.nosTotal || null,
        overCapacity: false,
      }
    })
    return machineView({ kind, id: dryer.id, code: dryer.code, title: dryer.code, isActive: dryer.isActive, isWorking: null, capacityKg: null, notes: dryer.notes ?? null, dryerKind: dryer.kind, work })
  }
  const press = await ctx.em.findOne(Press, { id, ...scope(ctx), deletedAt: null })
  if (!press) throw new PlantError('Press not found', 404)
  const [batches, entries] = await Promise.all([
    ctx.em.find(PressBatch, { ...scope(ctx), pressId: press.id, batchDate: { $gte: since } }, { orderBy: { batchDate: 'desc', seq: 'desc' } }),
    ctx.em.find(MouldingEntry, { ...scope(ctx), pressId: press.id, deletedAt: null, entryDate: { $gte: since } }, { orderBy: { entryDate: 'desc', shift: 'desc' } }),
  ])
  const work: WorkRow[] = [
    ...batches.map((batch) => {
      const figures = pressFigures(batch.daylights ?? [])
      return { id: batch.id, kind: 'press' as const, date: batch.batchDate, label: batch.batchNo, detail: null, status: batch.status, inputKg: null, outputKg: figures.totalKg, pieces: figures.totalSheets, overCapacity: false }
    }),
    ...entries.map((entry) => ({
      id: entry.id,
      kind: 'moulding' as const,
      date: entry.entryDate,
      label: `${entry.dieNo} · S${entry.shift}`,
      detail: entry.customerName ?? null,
      status: entry.status,
      inputKg: null,
      outputKg: kg3(entry.productionNos * Number(entry.articleWeightKg)),
      pieces: entry.productionNos,
      overCapacity: false,
    })),
  ].sort((left, right) => right.date.localeCompare(left.date))
  return machineView({
    kind,
    id: press.id,
    code: String(press.number),
    title: String(press.number),
    isActive: press.isActive,
    isWorking: press.isWorking,
    capacityKg: null,
    notes: press.notes ?? null,
    pressType: press.pressType,
    usage: press.usage,
    daylights: press.daylights ?? null,
    work,
  })
}

function machineView(input: { kind: MachineKind; id: string; code: string; title: string; isActive: boolean; isWorking: boolean | null; capacityKg: number | null; notes: string | null; work: WorkRow[]; dryerKind?: 'dryer' | 'mixer'; pressType?: 'small' | 'big'; usage?: 'laminate' | 'moulding' | 'both'; daylights?: number | null }) {
  const counted = input.work.filter((row) => row.status === 'posted')
  const month = counted.filter((row) => row.date >= monthStart())
  return {
    ...input,
    days: WORK_DAYS,
    figures: {
      runsThisMonth: month.length,
      kgThisMonth: kg3(month.reduce((sum, row) => sum + (row.outputKg ?? 0), 0)),
      piecesThisMonth: month.reduce((sum, row) => sum + (row.pieces ?? 0), 0),
      lastRun: counted[0]?.date ?? null,
      drafts: input.work.filter((row) => row.status === 'draft').length,
      overCapacity: input.work.filter((row) => row.overCapacity).length,
    },
  }
}

export type LotTrace = { lotId: string; lotNumber: string | null; title: string | null; madeBy: DocumentLink | null; usedBy: Array<{ document: DocumentLink; kg: number; at: string }> }

export async function traceLots(ctx: StoreContext, lotIds: string[]): Promise<Map<string, LotTrace>> {
  const unique = [...new Set(lotIds.filter(Boolean))]
  const result = new Map<string, LotTrace>()
  if (!unique.length) return result
  const rows = await ctx.em.getConnection().execute<Array<{ lot_id: string; lot_number: string | null; title: string | null; type: string; quantity: string; performed_at: Date; metadata: Record<string, unknown> | null }>>(
    `select m.lot_id, lot.lot_number, p.title, m.type, m.quantity, m.performed_at, m.metadata
       from wms_inventory_movements m
       join wms_inventory_lots lot on lot.id = m.lot_id
       left join catalog_product_variants v on v.id = lot.catalog_variant_id
       left join catalog_products p on p.id = v.product_id
      where m.lot_id = any(?::uuid[]) and m.tenant_id = ? and m.organization_id = ? and m.deleted_at is null
      order by m.performed_at asc, m.created_at asc`,
    [`{${unique.join(',')}}`, ctx.tenantId, ctx.organizationId],
  )
  for (const lotId of unique) result.set(lotId, { lotId, lotNumber: null, title: null, madeBy: null, usedBy: [] })
  for (const row of rows) {
    const trace = result.get(row.lot_id)!
    trace.lotNumber = row.lot_number
    trace.title = row.title
    const document = movementDocument(row.metadata)
    const quantity = Number(row.quantity)
    const incoming = row.type === 'receipt' || (row.type === 'adjust' && quantity > 0)
    if (incoming && !trace.madeBy) trace.madeBy = document
    else if (!incoming && document) {
      const same = trace.usedBy.find((entry) => entry.document.href === document.href && entry.document.label === document.label)
      if (same) same.kg = kg3(same.kg + Math.abs(quantity))
      else trace.usedBy.push({ document, kg: kg3(Math.abs(quantity)), at: new Date(row.performed_at).toISOString() })
    }
  }
  return result
}

function historyOf(entries: Array<{ action: string; by: string | null; at: string; note: string | null }> | null | undefined) {
  return entries ?? []
}

export async function cuttingDetail(ctx: StoreContext, id: string) {
  const cut = await ctx.em.findOne(CuttingEntry, { id, ...scope(ctx), deletedAt: null })
  if (!cut) throw new PlantError('Cutting entry not found', 404)
  const traces = await traceLots(ctx, [cut.sourceLotId, cut.outputLotId ?? ''])
  const [thickness, fgReports] = await Promise.all([
    cut.outputLotId ? ctx.em.find(ThicknessInspection, { ...scope(ctx), lotId: cut.outputLotId, deletedAt: null }, { orderBy: { inspectDate: 'desc' } }) : Promise.resolve([] as ThicknessInspection[]),
    cut.outputLotId ? fgReportsForLot(ctx, cut.outputLotId) : Promise.resolve([]),
  ])
  return {
    ...cuttingView(cut),
    sourceTitle: traces.get(cut.sourceLotId)?.title ?? null,
    source: traces.get(cut.sourceLotId) ?? null,
    output: cut.outputLotId ? traces.get(cut.outputLotId) ?? null : null,
    thickness: thickness.map((row) => ({ id: row.id, inspectDate: row.inspectDate, result: row.result, outOfTolerance: row.outOfTolerance })),
    fgReports,
    history: historyOf(cut.history),
    createdAt: cut.createdAt.toISOString(),
  }
}

async function fgReportsForLot(ctx: StoreContext, lotId: string) {
  const rows = await ctx.em.getConnection().execute<Array<{ id: string; report_date: string; status: string }>>(
    `select id, report_date, status from cc_fg_inspections
      where tenant_id = ? and organization_id = ? and deleted_at is null and rows @> ?::jsonb
      order by report_date desc limit 20`,
    [ctx.tenantId, ctx.organizationId, JSON.stringify([{ sourceLotId: lotId }])],
  )
  return rows.map((row) => ({ id: row.id, reportDate: row.report_date, status: row.status }))
}

export async function thicknessDetail(ctx: StoreContext, id: string) {
  const row = await ctx.em.findOne(ThicknessInspection, { id, ...scope(ctx), deletedAt: null })
  if (!row) throw new PlantError('Thickness inspection not found', 404)
  const traces = row.lotId ? await traceLots(ctx, [row.lotId]) : new Map<string, LotTrace>()
  const cutting = row.lotId ? await ctx.em.findOne(CuttingEntry, { ...scope(ctx), outputLotId: row.lotId, deletedAt: null }) : null
  return {
    ...thicknessView(row),
    lot: row.lotId ? traces.get(row.lotId) ?? null : null,
    cutting: cutting ? { id: cutting.id, entryDate: cutting.entryDate, cutSize: cutting.cutSize } : null,
    fgReports: row.lotId ? await fgReportsForLot(ctx, row.lotId) : [],
    byName: row.byName ?? null,
    history: historyOf(row.history),
    createdAt: row.createdAt.toISOString(),
  }
}

export async function fgDetail(ctx: StoreContext, id: string) {
  const report = await ctx.em.findOne(FgInspection, { id, ...scope(ctx), deletedAt: null })
  if (!report) throw new PlantError('FG inspection report not found', 404)
  const traces = await traceLots(ctx, report.rows.flatMap((row) => [row.sourceLotId, row.outputLotId ?? '']))
  return {
    ...fgReportView(report),
    postedAt: report.postedAt ? report.postedAt.toISOString() : null,
    byName: report.byName ?? null,
    rows: report.rows.map((row) => ({
      ...row,
      source: traces.get(row.sourceLotId) ?? null,
      output: row.outputLotId ? traces.get(row.outputLotId) ?? null : null,
    })),
  }
}

export async function directInDetail(ctx: StoreContext, id: string) {
  const record = await ctx.em.findOne(FgDirectIn, { id, ...scope(ctx), deletedAt: null })
  if (!record) throw new PlantError('Bought-in entry not found', 404)
  const traces = record.lotId ? await traceLots(ctx, [record.lotId]) : new Map<string, LotTrace>()
  return {
    id: record.id,
    inDate: record.inDate,
    supplier: record.supplier,
    invoiceNo: record.invoiceNo ?? null,
    productId: record.productId,
    itemTitle: record.itemTitle,
    sheetSize: record.sheetSize ?? null,
    thicknessMm: record.thicknessMm ? Number(record.thicknessMm) : null,
    nos: record.nos ?? null,
    kg: Number(record.kg),
    lotId: record.lotId ?? null,
    lotNumber: record.lotNumber ?? null,
    status: record.status,
    byName: record.byName ?? null,
    lot: record.lotId ? traces.get(record.lotId) ?? null : null,
    history: historyOf(record.history),
    createdAt: record.createdAt.toISOString(),
  }
}

export async function damageDetail(ctx: StoreContext, id: string) {
  const record = await ctx.em.findOne(DamageEntry, { id, ...scope(ctx), deletedAt: null })
  if (!record) throw new PlantError('Damage entry not found', 404)
  const traces = await traceLots(ctx, [record.lotId])
  return {
    id: record.id,
    entryDate: record.entryDate,
    productId: record.productId,
    itemTitle: record.itemTitle,
    lotId: record.lotId,
    lotNumber: record.lotNumber ?? null,
    place: record.place,
    kg: Number(record.kg),
    reason: record.reason,
    byName: record.byName ?? null,
    lot: traces.get(record.lotId) ?? null,
    history: historyOf(record.history),
    createdAt: record.createdAt.toISOString(),
  }
}
