import type { StoreContext } from '../../cc_store/lib/server'
import { CoatingSheet, Dryer, MouldingEntry, Press, PressBatch, Reactor, ResinBatch } from '../data/entities'
import { sheetFigures } from './coatingFigures'
import { dryerTiles, pressTiles, reactorTiles, summariseTiles, type EntryStatus } from './floorBoard'
import { ownerOverview } from './owner'
import { pressFigures } from './pressFigures'

function scope(ctx: StoreContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

export type FeedItem = { key: string; at: string; area: 'resin' | 'coating' | 'press' | 'moulding'; title: string; detail: string; status: EntryStatus | string; href: string }

export async function productionFloor(ctx: StoreContext, date: string, withOwnerFigures: boolean) {
  const base = { ...scope(ctx), deletedAt: null }
  const [reactors, dryers, presses, resins, sheets, batches, mouldings] = await Promise.all([
    ctx.em.find(Reactor, { ...base, isActive: true }),
    ctx.em.find(Dryer, { ...base, isActive: true }),
    ctx.em.find(Press, { ...base, isActive: true }),
    ctx.em.find(ResinBatch, { ...base, batchDate: date }),
    ctx.em.find(CoatingSheet, { ...base, sheetDate: date }),
    ctx.em.find(PressBatch, { ...scope(ctx), batchDate: date }),
    ctx.em.find(MouldingEntry, { ...base, entryDate: date }),
  ])
  const sheetKg = new Map(sheets.map((sheet) => [sheet.id, sheetFigures(sheet.rows, sheet.slots).bstageTotal]))
  const batchFigures = new Map(batches.map((batch) => [batch.id, pressFigures(batch.daylights)]))

  const reactorList = reactorTiles(
    reactors.map((row) => ({ id: row.id, code: row.code })),
    resins.map((row) => ({ id: row.id, reactorCode: row.reactorCode, batchNo: row.batchNo, grade: row.grade, status: row.status, yieldKg: Number(row.yieldKg ?? 0) })),
  )
  const dryerList = dryerTiles(
    dryers.map((row) => ({ id: row.id, code: row.code })),
    sheets.map((row) => ({ id: row.id, dryerCode: row.dryerCode, status: row.status, bstageKg: sheetKg.get(row.id) ?? 0 })),
  )
  const pressList = pressTiles(
    presses.map((row) => ({ id: row.id, number: row.number, pressType: row.pressType, usage: row.usage, isWorking: row.isWorking })),
    batches.map((row) => ({ id: row.id, pressNumber: row.pressNumber, batchNo: row.batchNo, status: row.status, sheets: batchFigures.get(row.id)?.totalSheets ?? 0, kg: batchFigures.get(row.id)?.totalKg ?? 0 })),
    mouldings.map((row) => ({ id: row.id, pressNumber: row.pressNumber, dieNo: row.dieNo, shift: row.shift, status: row.status, pieces: row.productionNos })),
  )

  const feed: FeedItem[] = [
    ...resins.map((row): FeedItem => ({ key: `r-${row.id}`, at: (row.postedAt ?? row.updatedAt).toISOString(), area: 'resin', title: `Resin batch ${row.batchNo}`, detail: `${row.reactorCode} · ${row.grade} · ${Number(row.yieldKg ?? 0).toFixed(3)} kg`, status: row.status, href: `/backend/resin/batches/${row.id}` })),
    ...sheets.map((row): FeedItem => ({ key: `c-${row.id}`, at: (row.postedAt ?? row.updatedAt).toISOString(), area: 'coating', title: `Coating ${row.dryerCode}`, detail: `${(sheetKg.get(row.id) ?? 0).toFixed(3)} kg B-stage`, status: row.status, href: `/backend/coating/${row.id}` })),
    ...batches.filter((row) => row.status !== 'cancelled').map((row): FeedItem => ({ key: `p-${row.id}`, at: (row.postedAt ?? row.updatedAt).toISOString(), area: 'press', title: `Press ${row.pressNumber} · ${row.batchNo}`, detail: `${batchFigures.get(row.id)?.totalSheets ?? 0} sheets · ${(batchFigures.get(row.id)?.totalKg ?? 0).toFixed(3)} kg`, status: row.status, href: `/backend/press/batches/${row.id}` })),
    ...mouldings.map((row): FeedItem => ({ key: `m-${row.id}`, at: (row.postedAt ?? row.updatedAt).toISOString(), area: 'moulding', title: `Moulding machine ${row.pressNumber} · die ${row.dieNo}`, detail: `Shift ${row.shift} · ${row.productionNos} pcs`, status: row.status, href: `/backend/moulding/entries/${row.id}` })),
  ]
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, 30)

  const owner = withOwnerFigures ? await ownerOverview(ctx, date) : null
  return {
    date,
    machines: { reactors: reactorList, dryers: dryerList, presses: pressList },
    summary: { reactors: summariseTiles(reactorList), dryers: summariseTiles(dryerList), presses: summariseTiles(pressList) },
    feed,
    open: { resin: resins.filter((row) => row.status === 'draft').length, coating: sheets.filter((row) => row.status === 'draft').length, press: batches.filter((row) => row.status === 'draft').length, moulding: mouldings.filter((row) => row.status === 'draft').length },
    produced: owner?.produced ?? null,
    plan: owner?.plan ?? null,
    alerts: owner ? { failedBatches: owner.breakdowns.failedBatches, bstageAtRisk: owner.breakdowns.bstageAtRisk, belowReorder: owner.breakdowns.belowReorder, damaged: owner.breakdowns.damaged } : null,
  }
}
