import type { StoreContext } from '../../cc_store/lib/server'
import { loadCustomers } from '../../cc_orders/lib/server'
import { CcOrder } from '../../cc_orders/data/entities'
import { markOrderTests } from '../../cc_orders/lib/fulfilment'
import { LabTest } from '../data/entities'
import { PlantError } from './server'

export type LabInput = { testDate: string; lotRefs: string | null; productId: string | null; itemTitle: string | null; customerId: string | null; customerName: string | null; testType: string; standard: string | null; result: 'pass' | 'fail' | 'pending'; notes: string | null; orderId: string | null; reportNo: string | null; testedBy: string | null; testPoint: 'incoming' | 'outgoing' }

function scope(ctx: StoreContext) {
  return { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
}

export type LabReportFile = { id: string; fileName: string; fileSize: number; mimeType: string; createdAt: string }

export async function labReports(ctx: StoreContext, ids: string[]): Promise<Map<string, LabReportFile[]>> {
  const result = new Map<string, LabReportFile[]>()
  if (!ids.length) return result
  const rows = await ctx.em.getConnection().execute<Array<{ id: string; record_id: string; file_name: string; file_size: number; mime_type: string; created_at: Date }>>(
    `select id, record_id, file_name, file_size, mime_type, created_at from attachments where entity_id = 'cc_production:lab_test' and tenant_id = ? and record_id = any(?::text[]) order by created_at asc`,
    [ctx.tenantId, `{${ids.join(',')}}`],
  )
  for (const row of rows) {
    const list = result.get(row.record_id) ?? []
    list.push({ id: row.id, fileName: row.file_name, fileSize: Number(row.file_size), mimeType: row.mime_type, createdAt: new Date(row.created_at).toISOString() })
    result.set(row.record_id, list)
  }
  return result
}

export async function labDetail(ctx: StoreContext, row: LabTest) {
  const reports = await labReports(ctx, [row.id])
  return { ...labView(row), reports: reports.get(row.id) ?? [] }
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
    orderId: row.orderId ?? null,
    orderNo: row.orderNo ?? null,
    reportNo: row.reportNo ?? null,
    testedBy: row.testedBy ?? null,
    testPoint: row.testPoint ?? 'outgoing',
    history: row.history ?? [],
    createdAt: row.createdAt.toISOString(),
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
  let order: CcOrder | null = null
  if (input.orderId) {
    order = await ctx.em.findOne(CcOrder, { id: input.orderId, ...scope(ctx), deletedAt: null })
    if (!order) throw new PlantError('Order not found', 404)
  }
  const customerId = order?.customerId ?? input.customerId
  const customerName = order ? ((await loadCustomers(ctx, [order.customerId])).get(order.customerId)?.name ?? input.customerName) : input.customerName?.trim() || null
  if (!input.lotRefs?.trim() && !input.itemTitle?.trim() && !order) throw new PlantError('Pick the lot or the item that was tested')
  const values = { ...input, customerId, customerName, orderId: order?.id ?? null, orderNo: order?.orderNo ?? null, reportNo: input.reportNo?.trim() || null, testedBy: input.testedBy?.trim() || byName, byName }
  let row: LabTest
  if (existing) {
    const before = existing.result
    Object.assign(existing, values)
    existing.history = [...(existing.history ?? []), { action: before !== input.result ? `result ${input.result}` : 'edited', by: byName, at: new Date().toISOString(), note: null }]
    await ctx.em.flush()
    row = existing
  } else {
    row = ctx.em.create(LabTest, { ...scope(ctx), ...values, history: [{ action: 'created', by: byName, at: new Date().toISOString(), note: order ? `For order ${order.orderNo}` : null }] })
    ctx.em.persist(row)
    await ctx.em.flush()
  }
  if (order && row.result === 'pass') await markOrderTests(ctx, order, row, byName)
  return row
}

export async function listLabTests(ctx: StoreContext, query: { month?: string; orderId?: string; result?: string; testPoint?: string; search?: string }) {
  const where: Record<string, unknown> = { ...scope(ctx), deletedAt: null }
  if (query.month) where.testDate = { $like: `${query.month}-%` }
  if (query.orderId) where.orderId = query.orderId
  if (query.result) where.result = query.result
  if (query.testPoint) where.testPoint = query.testPoint
  if (query.search) {
    const like = `%${query.search.replace(/[%_]/g, '')}%`
    where.$or = [{ customerName: { $ilike: like } }, { itemTitle: { $ilike: like } }, { lotRefs: { $ilike: like } }, { testType: { $ilike: like } }, { orderNo: { $ilike: like } }, { reportNo: { $ilike: like } }]
  }
  const rows = await ctx.em.find(LabTest, where, { orderBy: { testDate: 'desc', createdAt: 'desc' }, limit: 500 })
  const reports = await labReports(ctx, rows.map((row) => row.id))
  return rows.map((row) => ({ ...labView(row), reports: reports.get(row.id) ?? [] }))
}

export async function lastLabTest(ctx: StoreContext, customerName: string | null, itemTitle: string | null) {
  if (!customerName && !itemTitle) return null
  const row = await ctx.em.findOne(LabTest, { ...scope(ctx), deletedAt: null, ...(customerName ? { customerName: { $ilike: customerName } } : {}), ...(itemTitle ? { itemTitle: { $ilike: itemTitle } } : {}) }, { orderBy: { testDate: 'desc', createdAt: 'desc' } })
  return row ? labView(row) : null
}
