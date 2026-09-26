import { DermatOrder, DermatOrderLine, DermatOrderStage } from '../data/entities'
import { QcCheck } from '../../dermat_quality/data/entities'
import { StoreRequest, StoreRequestLine } from '../../dermat_store/data/entities'
import { OrderError, loadCustomers, loadProducts, type OrderContext } from './server'

const PRODUCTION_KEYS = ['manufacturing', 'filling', 'packing', 'qc_qa', 'billing', 'dispatch'] as const

export type BatchStatus = 'manufacturing' | 'filling' | 'packing' | 'qa' | 'released' | 'rework' | 'rejected' | 'dispatched'

export const BATCH_STATUS_LABEL: Record<BatchStatus, string> = {
  manufacturing: 'In manufacturing',
  filling: 'Filling',
  packing: 'Packing',
  qa: 'Waiting for QA',
  released: 'Released',
  rework: 'Rework',
  rejected: 'Rejected',
  dispatched: 'Dispatched',
}

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const out = String(value).trim()
  return out ? out : null
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const out = Number(value)
  return Number.isFinite(out) ? out : null
}

function statusOf(stages: Map<string, DermatOrderStage>): BatchStatus {
  const of = (key: string) => stages.get(key)?.status ?? 'waiting'
  const done = (key: string) => of(key) === 'done' || of(key) === 'skipped'
  const qaResult = text(stages.get('qc_qa')?.data?.qc_result)
  if (done('dispatch')) return 'dispatched'
  if (qaResult === 'Rejected') return 'rejected'
  if (qaResult === 'Rework') return 'rework'
  if (done('qc_qa')) return 'released'
  if (done('packing')) return 'qa'
  if (done('filling')) return 'packing'
  if (done('manufacturing')) return 'filling'
  return 'manufacturing'
}

type BatchKey = { batchNo: string; orderIds: string[] }

async function batchKeys(ctx: OrderContext, batchNo?: string): Promise<BatchKey[]> {
  const rows = await ctx.em.getConnection().execute<Array<{ order_id: string; batch_no: string }>>(
    `select s.order_id, trim(s.data->>'batch_no') as batch_no
       from dermat_order_stages s
       join dermat_orders o on o.id = s.order_id
      where s.stage_key = 'manufacturing' and s.tenant_id = ? and s.organization_id = ?
        and o.deleted_at is null and o.status <> 'cancelled'
        and coalesce(trim(s.data->>'batch_no'), '') <> ''
        ${batchNo ? `and lower(trim(s.data->>'batch_no')) = lower(?)` : ''}`,
    [ctx.tenantId, ctx.organizationId, ...(batchNo ? [batchNo.trim()] : [])],
  )
  const map = new Map<string, BatchKey>()
  for (const row of rows) {
    const entry = map.get(row.batch_no) ?? { batchNo: row.batch_no, orderIds: [] }
    entry.orderIds.push(row.order_id)
    map.set(row.batch_no, entry)
  }
  return [...map.values()]
}

async function load(ctx: OrderContext, orderIds: string[]) {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const [orders, lines, stages, checks] = await Promise.all([
    ctx.em.find(DermatOrder, { id: { $in: orderIds }, ...scope }),
    ctx.em.find(DermatOrderLine, { orderId: { $in: orderIds } }, { orderBy: { position: 'asc' } }),
    ctx.em.find(DermatOrderStage, { orderId: { $in: orderIds }, stageKey: { $in: [...PRODUCTION_KEYS] } }),
    ctx.em.find(QcCheck, { orderId: { $in: orderIds }, ...scope }, { orderBy: { createdAt: 'asc' } }),
  ])
  const customers = await loadCustomers(ctx, orders.map((order) => order.customerId))
  return { orders, lines, stages, checks, customers }
}

function summarise(key: BatchKey, data: Awaited<ReturnType<typeof load>>, products: Map<string, { title: string; code: string | null }>) {
  const orders = data.orders.filter((order) => key.orderIds.includes(order.id))
  const primary = orders[0]
  const stageMap = new Map(data.stages.filter((stage) => stage.orderId === primary?.id).map((stage) => [stage.stageKey, stage]))
  const mfg = stageMap.get('manufacturing')?.data ?? {}
  const filling = stageMap.get('filling')?.data ?? {}
  const packing = stageMap.get('packing')?.data ?? {}
  const qa = stageMap.get('qc_qa')?.data ?? {}
  const lines = data.lines.filter((line) => key.orderIds.includes(line.orderId))
  const ordered = lines.reduce((sum, line) => sum + Number(line.quantity), 0)
  const filled = num(filling.filled_units)
  const packed = num(packing.packed_qty)
  const checks = data.checks.filter((check) => key.orderIds.includes(check.orderId ?? ''))
  const open = checks.filter((check) => check.status === 'pending').length
  const failed = checks.filter((check) => check.status === 'failed').length
  return {
    batchNo: key.batchNo,
    status: statusOf(stageMap),
    orders: orders.map((order) => ({ id: order.id, orderNo: order.orderNo, customer: data.customers.get(order.customerId)?.name ?? null })),
    products: lines.map((line) => ({ productId: line.productId, title: products.get(line.productId)?.title ?? '(deleted product)', code: products.get(line.productId)?.code ?? null, quantity: Number(line.quantity) })),
    bulkSource: text(mfg.bulk_source),
    mfgDate: text(mfg.mfg_date),
    bulkKg: num(mfg.batch_size),
    wastageKg: num(mfg.wastage_kg),
    shift: text(mfg.shift),
    vessel: text(mfg.machine),
    operator: text(mfg.operator),
    ordered,
    filled,
    rejectedUnits: num(filling.rejected_units),
    packed,
    packedYield: packed !== null && ordered > 0 ? Math.round((packed / ordered) * 1000) / 10 : null,
    qa: { result: text(qa.qc_result), releasedOn: text(qa.released_on), coaNo: text(qa.coa_no), retentionQty: num(qa.retention_qty), retentionLocation: text(qa.retention_location) },
    qc: { total: checks.length, open, failed, passed: checks.filter((check) => check.status === 'passed').length },
    reworkRounds: Array.isArray(mfg.__rework) ? (mfg.__rework as unknown[]).length : 0,
    updatedAt: [...stageMap.values()].reduce((latest, stage) => (stage.updatedAt > latest ? stage.updatedAt : latest), new Date(0)).toISOString(),
  }
}

export async function batchRegister(ctx: OrderContext, filter: { q?: string; status?: BatchStatus }) {
  const keys = await batchKeys(ctx)
  if (!keys.length) return { items: [], counts: {} as Record<string, number> }
  const data = await load(ctx, [...new Set(keys.flatMap((key) => key.orderIds))])
  const products = await loadProducts(ctx, data.lines.map((line) => line.productId))
  let items = keys.map((key) => summarise(key, data, products))
  const counts: Record<string, number> = {}
  for (const item of items) counts[item.status] = (counts[item.status] ?? 0) + 1
  const term = filter.q?.trim().toLowerCase()
  if (term) items = items.filter((item) => item.batchNo.toLowerCase().includes(term) || item.orders.some((order) => order.orderNo.toLowerCase().includes(term) || (order.customer ?? '').toLowerCase().includes(term)) || item.products.some((product) => product.title.toLowerCase().includes(term) || (product.code ?? '').toLowerCase().includes(term)))
  if (filter.status) items = items.filter((item) => item.status === filter.status)
  items.sort((a, b) => (b.mfgDate ?? '').localeCompare(a.mfgDate ?? '') || b.updatedAt.localeCompare(a.updatedAt))
  return { items, counts }
}

export async function batchFile(ctx: OrderContext, batchNo: string) {
  const [key] = await batchKeys(ctx, batchNo)
  if (!key) throw new OrderError(`Batch ${batchNo} not found`, 404)
  const data = await load(ctx, key.orderIds)
  const requests = await ctx.em.find(StoreRequest, { orderId: { $in: key.orderIds }, tenantId: ctx.tenantId, organizationId: ctx.organizationId }, { orderBy: { createdAt: 'asc' } })
  const requestLines = requests.length ? await ctx.em.find(StoreRequestLine, { requestId: { $in: requests.map((request) => request.id) } }, { orderBy: { position: 'asc' } }) : []
  const products = await loadProducts(ctx, [...data.lines.map((line) => line.productId), ...requestLines.map((line) => line.productId), ...data.checks.map((check) => check.productId)])
  const summary = summarise(key, data, products)
  const primaryId = summary.orders[0]?.id
  const stageMap = new Map(data.stages.filter((stage) => stage.orderId === primaryId).map((stage) => [stage.stageKey, stage]))
  const steps = PRODUCTION_KEYS.map((stageKey) => {
    const stage = stageMap.get(stageKey)
    return {
      key: stageKey,
      status: stage?.status ?? 'waiting',
      openedAt: stage?.openedAt ? stage.openedAt.toISOString() : null,
      completedAt: stage?.completedAt ? stage.completedAt.toISOString() : null,
      completedByName: stage?.completedByName ?? null,
      responsibleName: stage?.responsibleName ?? null,
      fields: Object.fromEntries(Object.entries(stage?.data ?? {}).filter(([field]) => !field.startsWith('__'))),
      ticks: Object.entries((stage?.data?.__steps as Record<string, { done?: boolean }> | undefined) ?? {}).filter(([, value]) => value?.done).map(([tick]) => tick),
      rework: Array.isArray(stage?.data?.__rework) ? (stage?.data?.__rework as Array<Record<string, unknown>>) : [],
    }
  })
  const materials = requestLines.map((line) => {
    const request = requests.find((entry) => entry.id === line.requestId)
    const issues = line.issues ?? []
    return {
      requestCode: request?.code ?? '',
      requestId: line.requestId,
      stageKey: request?.stageKey ?? '',
      store: request?.store ?? null,
      productId: line.productId,
      title: products.get(line.productId)?.title ?? '(deleted product)',
      code: products.get(line.productId)?.code ?? null,
      unit: line.unit,
      required: Number(line.requiredQty),
      issued: issues.reduce((sum, issue) => sum + issue.quantity, 0),
      used: issues.reduce((sum, issue) => sum + issue.used, 0),
      returned: issues.reduce((sum, issue) => sum + issue.returned, 0),
      lots: issues.map((issue) => ({ lotNumber: issue.lotNumber, quantity: issue.quantity, used: issue.used, returned: issue.returned, at: issue.at, by: issue.by })),
    }
  })
  const checks = data.checks.map((check) => ({
    id: check.id,
    code: check.code,
    arNo: check.arNo ?? null,
    round: check.round,
    stageKey: check.stageKey ?? null,
    operation: check.operation,
    productTitle: products.get(check.productId)?.title ?? '',
    status: check.status,
    chemicalStatus: check.chemicalStatus,
    microStatus: check.microStatus,
    createdAt: check.createdAt.toISOString(),
  }))
  return { ...summary, steps, materials, checks }
}
