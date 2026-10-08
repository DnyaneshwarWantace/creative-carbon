import type { StoreContext } from '../../cc_store/lib/server'
import { loadProducts } from '../../cc_orders/lib/server'
import { ChemicalIssue, CoatingSheet, ResinBatch } from '../data/entities'
import { PlantError } from './server'
import { consumeLots, freeLots, kg3, movementTime, pickLots, plantStock, returnLots } from './plantStock'
import { CHEMICAL_PLACES, chemicalProducts, lotSources } from './resin'

const SOURCE = 'cc_production.chemical_issue'

function scope(ctx: StoreContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

export type ChemicalIssueInput = { issueDate: string; productId: string; kg: number; usedFor: 'coating' | 'other'; dryerCode?: string | null; lotId?: string | null; note?: string | null }

function issueRow(issue: ChemicalIssue) {
  return {
    id: issue.id,
    issueDate: issue.issueDate,
    productId: issue.productId,
    productTitle: issue.productTitle,
    kg: Number(issue.kg),
    usedFor: issue.usedFor,
    dryerCode: issue.dryerCode ?? null,
    note: issue.note ?? null,
    lots: issue.lots ?? [],
    status: issue.status,
    byName: issue.byName ?? null,
    history: issue.history ?? [],
    updatedAt: issue.updatedAt.toISOString(),
  }
}

export async function createIssue(ctx: StoreContext, input: ChemicalIssueInput, byName: string | null) {
  const chemical = (await chemicalProducts(ctx)).find((entry) => entry.id === input.productId)
  if (!chemical) throw new PlantError('Pick a chemical from the list')
  if (input.usedFor === 'coating' && !input.dryerCode?.trim()) throw new PlantError('Say which coating dryer used it')
  const issue = ctx.em.create(ChemicalIssue, {
    ...scope(ctx),
    issueDate: input.issueDate,
    productId: chemical.id,
    productTitle: chemical.title,
    kg: String(kg3(input.kg)),
    usedFor: input.usedFor,
    dryerCode: input.usedFor === 'coating' ? input.dryerCode?.trim() ?? null : null,
    note: input.note?.trim() || null,
    byName,
    history: [{ action: 'issued', by: byName, at: new Date().toISOString(), note: null }],
  })
  ctx.em.persist(issue)
  await ctx.em.flush()
  const stock = await plantStock(ctx, [chemical.id])
  const lots = (await freeLots(ctx, stock, [chemical.id], [...CHEMICAL_PLACES])).get(chemical.id) ?? []
  try {
    const picks = pickLots(lots, input.kg, chemical.title, input.lotId ?? null)
    const usedFor = input.usedFor === 'coating' ? `coating ${issue.dryerCode}` : 'other use'
    await consumeLots(ctx, stock, chemical.id, picks, {
      reason: `Chemical issue for ${usedFor}${issue.note ? ` · ${issue.note}` : ''}`,
      reasonCode: 'chemical_issue',
      performedAt: movementTime(input.issueDate),
      metadata: { source: SOURCE, issueId: issue.id, usedFor: input.usedFor, dryerCode: issue.dryerCode ?? null },
    })
    issue.lots = picks
    await ctx.em.flush()
  } catch (error) {
    ctx.em.remove(issue)
    await ctx.em.flush()
    throw error
  }
  return issueRow(issue)
}

export async function issueDetail(ctx: StoreContext, id: string) {
  const issue = await findIssue(ctx, id)
  const sources = await lotSources(ctx, (issue.lots ?? []).map((lot) => lot.lotId))
  const sheet =
    issue.usedFor === 'coating' && issue.dryerCode
      ? await ctx.em.findOne(CoatingSheet, { organizationId: ctx.organizationId, tenantId: ctx.tenantId, dryerCode: issue.dryerCode, sheetDate: issue.issueDate, deletedAt: null })
      : null
  const row = issueRow(issue)
  return {
    ...row,
    lots: row.lots.map((lot) => ({ ...lot, ...(sources.get(lot.lotId) ?? { grnCode: null, grnId: null }) })),
    coatingSheet: sheet ? { id: sheet.id, sheetDate: sheet.sheetDate, dryerCode: sheet.dryerCode, status: sheet.status } : null,
    createdAt: issue.createdAt.toISOString(),
  }
}

export async function findIssue(ctx: StoreContext, id: string): Promise<ChemicalIssue> {
  const issue = await ctx.em.findOne(ChemicalIssue, { id, ...scope(ctx), deletedAt: null })
  if (!issue) throw new PlantError('Chemical issue not found', 404)
  return issue
}

export async function cancelIssue(ctx: StoreContext, issue: ChemicalIssue, reason: string, byName: string | null) {
  if (issue.status === 'cancelled') throw new PlantError('This issue is already cancelled', 409)
  const stock = await plantStock(ctx, [issue.productId])
  await returnLots(ctx, stock, issue.productId, issue.lots ?? [], {
    reason: `Chemical issue cancelled · ${reason}`,
    reasonCode: 'chemical_issue_cancel',
    performedAt: movementTime(issue.issueDate),
    metadata: { source: SOURCE, issueId: issue.id },
  })
  issue.status = 'cancelled'
  issue.history = [...(issue.history ?? []), { action: 'cancelled', by: byName, at: new Date().toISOString(), note: reason }]
  await ctx.em.flush()
  return issueRow(issue)
}

export async function listIssues(ctx: StoreContext, query: { month?: string; productId?: string }) {
  const where: Record<string, unknown> = { ...scope(ctx), deletedAt: null }
  if (query.month) where.issueDate = { $like: `${query.month}-%` }
  if (query.productId) where.productId = query.productId
  const rows = await ctx.em.find(ChemicalIssue, where, { orderBy: { issueDate: 'desc', createdAt: 'desc' }, limit: 500 })
  return rows.map(issueRow)
}

type RegisterMovement = { day: string; type: string; quantity: string; from_id: string | null; to_id: string | null; source: string | null; ref: string | null; reason: string | null }

function signed(row: RegisterMovement): number {
  const quantity = Number(row.quantity)
  if (row.from_id && row.to_id) return 0
  if (row.type === 'receipt' || row.type === 'return_receive') return Math.abs(quantity)
  if (row.type === 'adjust' || row.type === 'cycle_count') return quantity
  return -Math.abs(quantity)
}

function monthBounds(month: string) {
  const [year, value] = month.split('-').map(Number)
  const next = value === 12 ? `${year + 1}-01` : `${year}-${String(value + 1).padStart(2, '0')}`
  const days = new Date(Date.UTC(year, value, 0)).getUTCDate()
  return { start: `${month}-01`, end: `${next}-01`, days }
}

export async function chemicalRegister(ctx: StoreContext, productId: string, month: string) {
  const product = (await loadProducts(ctx, [productId])).get(productId)
  if (!product) throw new PlantError('Item not found', 404)
  const stock = await plantStock(ctx, [productId])
  const variantId = stock.variants.get(productId)
  const { start, end, days } = monthBounds(month)
  const movements = variantId
    ? await ctx.em.getConnection().execute<RegisterMovement[]>(
        `select to_char(m.performed_at at time zone 'Asia/Kolkata', 'YYYY-MM-DD') as day, m.type, m.quantity,
                m.location_from_id as from_id, m.location_to_id as to_id, m.metadata->>'source' as source,
                coalesce(m.metadata->>'batchNo', m.metadata->>'grnCode', m.metadata->>'issueId') as ref, m.reason
           from wms_inventory_movements m
          where m.catalog_variant_id = ? and m.tenant_id = ? and m.organization_id = ? and m.deleted_at is null
            and (m.performed_at at time zone 'Asia/Kolkata') < ?::date
          order by m.performed_at asc, m.created_at asc`,
        [variantId, ctx.tenantId, ctx.organizationId, end],
      )
    : []
  let opening = 0
  const byDay = new Map<string, { received: number; use: number; refs: Set<string> }>()
  for (const row of movements) {
    const value = signed(row)
    if (row.day < start) {
      opening += value
      continue
    }
    const entry = byDay.get(row.day) ?? { received: 0, use: 0, refs: new Set<string>() }
    const plantUse = row.source === 'cc_production.resin' || row.source === 'cc_production.chemical_issue'
    if (plantUse || value < 0) entry.use -= value
    else entry.received += value
    if (row.ref && row.source === 'cc_production.resin') entry.refs.add(row.ref)
    if (row.ref && row.source !== 'cc_production.resin' && row.source !== 'cc_production.chemical_issue' && value > 0) entry.refs.add(row.ref)
    byDay.set(row.day, entry)
  }

  const isPhenol = product.title.trim().toLowerCase() === 'phenol'
  const resinByDay = new Map<string, { water: number; resin: number }>()
  if (isPhenol) {
    const batches = await ctx.em.find(ResinBatch, { ...scope(ctx), deletedAt: null, status: 'posted', batchDate: { $gte: start, $lt: end } })
    for (const batch of batches) {
      if (!batch.materials.some((line) => line.productId === productId)) continue
      const entry = resinByDay.get(batch.batchDate) ?? { water: 0, resin: 0 }
      entry.water += Number(batch.waterRemovedKg ?? 0)
      entry.resin += Number(batch.yieldKg ?? 0)
      resinByDay.set(batch.batchDate, entry)
      if (!byDay.has(batch.batchDate)) byDay.set(batch.batchDate, { received: 0, use: 0, refs: new Set([batch.batchNo]) })
    }
  }

  let balance = kg3(opening)
  const rows = [...byDay.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([day, entry]) => {
      const ob = balance
      const received = kg3(entry.received)
      const total = kg3(ob + received)
      const use = kg3(entry.use)
      balance = kg3(total - use)
      const extra = resinByDay.get(day)
      return { day, ob, received, total, use, balance, refs: [...entry.refs], ...(isPhenol ? { water: kg3(extra?.water ?? 0), resin: kg3(extra?.resin ?? 0) } : {}) }
    })
  const totals = {
    received: kg3(rows.reduce((sum, row) => sum + row.received, 0)),
    use: kg3(rows.reduce((sum, row) => sum + row.use, 0)),
    ...(isPhenol ? { water: kg3(rows.reduce((sum, row) => sum + (row.water ?? 0), 0)), resin: kg3(rows.reduce((sum, row) => sum + (row.resin ?? 0), 0)) } : {}),
  }
  return { productId, title: product.title, unit: product.unit ?? 'kg', month, days, opening: kg3(opening), closing: balance, phenolColumns: isPhenol, rows, totals }
}
