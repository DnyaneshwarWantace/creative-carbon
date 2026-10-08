import type { StoreContext } from '../../cc_store/lib/server'
import { LabTest } from '../data/entities'
import { PlantError } from './server'

export type LabInput = { testDate: string; lotRefs: string | null; productId: string | null; itemTitle: string | null; customerId: string | null; customerName: string | null; testType: string; standard: string | null; result: 'pass' | 'fail' | 'pending'; notes: string | null }

function scope(ctx: StoreContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

export function labView(row: LabTest) {
  return {
    id: row.id,
    testDate: row.testDate,
    lotRefs: row.lotRefs ?? null,
    productId: row.productId ?? null,
    itemTitle: row.itemTitle ?? null,
    customerId: row.customerId ?? null,
    customerName: row.customerName ?? null,
    testType: row.testType,
    standard: row.standard ?? null,
    result: row.result,
    notes: row.notes ?? null,
    byName: row.byName ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function findLabTest(ctx: StoreContext, id: string) {
  const row = await ctx.em.findOne(LabTest, { id, ...scope(ctx), deletedAt: null })
  if (!row) throw new PlantError('Lab test not found', 404)
  return row
}

export async function saveLabTest(ctx: StoreContext, existing: LabTest | null, input: LabInput, byName: string | null) {
  if (!input.customerId && !input.customerName?.trim()) throw new PlantError('Pick the customer the test is for (tests follow the customer specification)')
  const values = { ...input, customerName: input.customerName?.trim() || null, byName }
  if (existing) {
    Object.assign(existing, values)
    existing.history = [...(existing.history ?? []), { action: 'edited', by: byName, at: new Date().toISOString(), note: null }]
    await ctx.em.flush()
    return existing
  }
  const row = ctx.em.create(LabTest, { ...scope(ctx), ...values, history: [{ action: 'created', by: byName, at: new Date().toISOString(), note: null }] })
  ctx.em.persist(row)
  await ctx.em.flush()
  return row
}

export async function listLabTests(ctx: StoreContext, query: { month?: string }) {
  const rows = await ctx.em.find(LabTest, { ...scope(ctx), deletedAt: null, ...(query.month ? { testDate: { $like: `${query.month}-%` } } : {}) }, { orderBy: { testDate: 'desc', createdAt: 'desc' }, limit: 300 })
  return rows.map(labView)
}

export async function lastLabTest(ctx: StoreContext, customerName: string, itemTitle: string | null) {
  const row = await ctx.em.findOne(LabTest, { ...scope(ctx), deletedAt: null, customerName: { $ilike: customerName }, ...(itemTitle ? { itemTitle: { $ilike: itemTitle } } : {}) }, { orderBy: { testDate: 'desc', createdAt: 'desc' } })
  return row ? labView(row) : null
}
