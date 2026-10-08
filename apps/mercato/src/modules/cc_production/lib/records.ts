import { loadCustomers } from '../../cc_orders/lib/server'
import type { StoreContext } from '../../cc_store/lib/server'
import { CoatingSheet, Dryer, Mould, MouldingEntry, Press, PressBatch, Reactor, ResinBatch } from '../data/entities'
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
