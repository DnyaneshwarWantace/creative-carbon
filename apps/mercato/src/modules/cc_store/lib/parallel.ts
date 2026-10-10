import { MANUAL_PLACES, PLACE_LABEL, type StockPlace } from '../../cc_products/lib/stock'
import { currentUserName } from '../../cc_orders/lib/server'
import { ParallelCheck, type ParallelRow } from '../data/entities'
import { StoreError, type StoreContext } from './server'
import { stockBook } from './stockBook'

export const PARALLEL_PLACES = MANUAL_PLACES

function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

export function tolerance(system: number): number {
  return Math.max(0.5, Math.abs(system) * 0.001)
}

function judge(row: Omit<ParallelRow, 'diff' | 'matched'>): ParallelRow {
  if (row.paper === null) return { ...row, diff: null, matched: null }
  const diff = round(row.paper - row.system)
  return { ...row, diff, matched: Math.abs(diff) <= tolerance(row.system) }
}

async function systemRows(ctx: StoreContext, place: StockPlace): Promise<Array<Omit<ParallelRow, 'paper' | 'diff' | 'matched'>>> {
  const book = await stockBook(ctx, place, { view: 'all' })
  return book.items.map((item) => ({ productId: item.productId, title: item.title, code: item.code ?? null, unit: item.unit ?? 'kg', system: round(item.onHand) }))
}

export async function parallelSheet(ctx: StoreContext, place: StockPlace, date: string) {
  const existing = await ctx.em.findOne(ParallelCheck, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, checkDate: date, place })
  const live = date === today()
  if (!live && !existing) return { date, place, placeLabel: PLACE_LABEL[place], live, saved: false, rows: [] as ParallelRow[], note: null, byName: null, updatedAt: null }
  let rows: ParallelRow[]
  if (live) {
    const current = await systemRows(ctx, place)
    const saved = new Map((existing?.rows ?? []).map((row) => [row.productId, row]))
    rows = current.map((row) => judge({ ...row, paper: saved.get(row.productId)?.paper ?? null }))
    for (const row of existing?.rows ?? []) if (!rows.some((entry) => entry.productId === row.productId)) rows.push(judge({ ...row, system: 0 }))
  } else {
    rows = existing!.rows
  }
  return { date, place, placeLabel: PLACE_LABEL[place], live, saved: Boolean(existing), rows: rows.sort((a, b) => a.title.localeCompare(b.title)), note: existing?.note ?? null, byName: existing?.byName ?? null, updatedAt: existing?.updatedAt.toISOString() ?? null }
}

export async function saveParallel(ctx: StoreContext, input: { date: string; place: StockPlace; rows: Array<{ productId: string; paper: number | null }>; note?: string | null }) {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const existing = await ctx.em.findOne(ParallelCheck, { ...scope, checkDate: input.date, place: input.place })
  const live = input.date === today()
  if (!live && !existing) throw new StoreError('Compare on the same day, at the end of the day. Past days keep the figures they were saved with.', 409)
  const base: Array<Omit<ParallelRow, 'paper' | 'diff' | 'matched'>> = existing && !live ? existing.rows : await systemRows(ctx, input.place)
  if (existing && live) for (const row of existing.rows) if (!base.some((entry) => entry.productId === row.productId)) base.push({ productId: row.productId, title: row.title, code: row.code, unit: row.unit, system: 0 })
  const paperOf = new Map(input.rows.map((row) => [row.productId, row.paper]))
  for (const productId of paperOf.keys()) if (!base.some((row) => row.productId === productId)) throw new StoreError('An item on the sheet is not in this store', 400)
  const rows = base.map((row) => judge({ ...row, paper: paperOf.has(row.productId) ? (paperOf.get(row.productId) ?? null) : (existing?.rows.find((entry) => entry.productId === row.productId)?.paper ?? null) }))
  const counted = rows.filter((row) => row.paper !== null).length
  if (!counted) throw new StoreError('Enter the paper balance for at least one item')
  const matched = rows.filter((row) => row.matched).length
  const byName = await currentUserName(ctx)
  const check = existing ?? ctx.em.create(ParallelCheck, { ...scope, checkDate: input.date, place: input.place, rows, counted, matched })
  check.rows = rows
  check.counted = counted
  check.matched = matched
  check.note = input.note ?? existing?.note ?? null
  check.byName = byName
  check.updatedAt = new Date()
  await ctx.em.persist(check).flush()
  return parallelSheet(ctx, input.place, input.date)
}

export async function parallelSummary(ctx: StoreContext, targetDays: number) {
  const checks = await ctx.em.find(ParallelCheck, { tenantId: ctx.tenantId, organizationId: ctx.organizationId }, { orderBy: { checkDate: 'desc' }, limit: 500 })
  const byDay = new Map<string, ParallelCheck[]>()
  for (const check of checks) byDay.set(check.checkDate, [...(byDay.get(check.checkDate) ?? []), check])
  const days = [...byDay.entries()].map(([date, list]) => {
    const counted = list.reduce((sum, check) => sum + check.counted, 0)
    const matched = list.reduce((sum, check) => sum + check.matched, 0)
    return {
      date,
      stores: list.map((check) => ({ place: check.place, placeLabel: PLACE_LABEL[check.place as StockPlace] ?? check.place, counted: check.counted, matched: check.matched, byName: check.byName ?? null })),
      counted,
      matched,
      agrees: counted > 0 && matched === counted,
      differences: list.flatMap((check) => check.rows.filter((row) => row.matched === false).map((row) => ({ place: PLACE_LABEL[check.place as StockPlace] ?? check.place, title: row.title, unit: row.unit, paper: row.paper, system: row.system, diff: row.diff }))).slice(0, 20),
    }
  })
  let streak = 0
  for (const day of days) {
    if (!day.agrees) break
    streak += 1
  }
  return { targetDays, streak, ready: streak >= targetDays, lastDate: days[0]?.date ?? null, days: days.slice(0, 60) }
}
