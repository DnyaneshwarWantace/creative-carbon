import { canReadStage, resolveOrderAccess, visibleStageData } from '../../../lib/visibility'
import { loadStageOverrides } from '../../../lib/stageSettings'
import { NextResponse } from 'next/server'
import { canSeeMoney, isMoneyStageField } from '../../../lib/money'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CcOrder, CcOrderLine, CcOrderStage } from '../../../data/entities'
import { orderListQuerySchema } from '../../../data/validators'
import { stageViews } from '../../../lib/engine'
import { orderFilter } from '../../../lib/orderFilter'
import { priceLine, priceOrder } from '../../../lib/pricing'
import { loadCustomers, loadProducts, resolveOrderContext } from '../../../lib/server'
import { STAGES, isFinished, stageDef, stepStates } from '../../../lib/stages'
import { paymentsFor, received } from '../../../../cc_accounts/lib/service'
import { withStageOverrides } from '../../../lib/stageSettings'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_orders.view'] },
}

const querySchema = orderListQuerySchema
  .pick({ search: true, status: true, stage: true, customerId: true, productId: true })
  .extend({
    stageStatus: z.enum(['active', 'waiting', 'done']).default('active'),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(100),
  })

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function stageFields(key: string, data: Record<string, unknown>): Record<string, string | number | null> {
  const def = stageDef(key)
  const fields: Record<string, string | number | null> = {}
  for (const field of def?.fields ?? []) {
    const value = data[field.key]
    fields[field.key] = typeof value === 'string' || typeof value === 'number' ? value : null
  }
  return fields
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return withStageOverrides(ctx, async () => {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
    const query = parsed.data
    const connection = ctx.em.getConnection()

    const base = await orderFilter(ctx, { ...query, stage: undefined })
    const everything = await connection.execute<Array<{ id: string; status: string; delivery_date: string | null }>>(
      `select o.id, o.status, o.delivery_date::text as delivery_date from cc_orders o where ${base.where.join(' and ')} order by o.created_at desc limit 5000`,
      base.params,
    )
    const allIds = everything.map((row) => row.id)
    const [allStages, allLines, allPayments] = await Promise.all([
      allIds.length ? ctx.em.find(CcOrderStage, { orderId: { $in: allIds } }) : Promise.resolve([] as CcOrderStage[]),
      allIds.length ? ctx.em.find(CcOrderLine, { orderId: { $in: allIds } }, { orderBy: { position: 'asc' } }) : Promise.resolve([] as CcOrderLine[]),
      paymentsFor(ctx, allIds),
    ])
    const pricesInclude = new Map<string, boolean>()
    if (allIds.length) {
      const flags = await connection.execute<Array<{ id: string; prices_include_gst: boolean }>>(`select id, prices_include_gst from cc_orders where id = any(?::uuid[])`, [`{${allIds.join(',')}}`])
      for (const row of flags) pricesInclude.set(row.id, Boolean(row.prices_include_gst))
    }
    const stagesOf = new Map<string, CcOrderStage[]>()
    for (const stage of allStages) stagesOf.set(stage.orderId, [...(stagesOf.get(stage.orderId) ?? []), stage])
    const linesOf = new Map<string, CcOrderLine[]>()
    for (const line of allLines) linesOf.set(line.orderId, [...(linesOf.get(line.orderId) ?? []), line])
    const totalOf = (orderId: string) =>
      priceOrder(
        (linesOf.get(orderId) ?? []).map((line) => ({ quantity: num(line.quantity), rate: line.rate == null ? null : num(line.rate), gstPercent: num(line.gstPercent), discountPercent: num(line.discountPercent) })),
        pricesInclude.get(orderId) ?? false,
      ).total
    const receivedOf = (orderId: string) => received(allPayments.filter((payment) => payment.orderId === orderId))

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const stageCounts: Record<string, number> = {}
    let value = 0
    let paid = 0
    let late = 0
    let onHold = 0
    for (const row of everything) {
      const stages = stagesOf.get(row.id) ?? []
      for (const stage of stages) if (stage.status === 'open' || stage.status === 'on_hold') stageCounts[stage.stageKey] = (stageCounts[stage.stageKey] ?? 0) + 1
      if (stages.some((stage) => stage.status === 'on_hold')) onHold += 1
      if (row.status === 'cancelled') continue
      value += totalOf(row.id)
      paid += receivedOf(row.id)
      if (row.delivery_date && row.delivery_date < today && row.status !== 'completed') late += 1
    }

    const statusOk = (status: string | undefined) =>
      query.stageStatus === 'waiting' ? status === 'waiting' || !status : query.stageStatus === 'done' ? status === 'done' || status === 'skipped' : status === 'open' || status === 'on_hold'
    const pickedIds = query.stage ? allIds.filter((id) => statusOk((stagesOf.get(id) ?? []).find((stage) => stage.stageKey === query.stage)?.status)) : allIds
    const total = pickedIds.length
    const pageIds = pickedIds.slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
    const orders = pageIds.length ? await ctx.em.find(CcOrder, { id: { $in: pageIds }, tenantId: ctx.tenantId, organizationId: ctx.organizationId }) : []
    const pageLines = pageIds.flatMap((id) => linesOf.get(id) ?? [])
    const [customers, products] = await Promise.all([loadCustomers(ctx, orders.map((order) => order.customerId)), loadProducts(ctx, pageLines.map((line) => line.productId))])

    const items = pageIds
      .map((id) => orders.find((order) => order.id === id))
      .filter((order): order is CcOrder => Boolean(order))
      .map((order) => {
        const views = stageViews(stagesOf.get(order.id) ?? [], undefined, order)
        const orderTotal = totalOf(order.id)
        const got = receivedOf(order.id)
        const customer = customers.get(order.customerId)
        return {
          id: order.id,
          orderNo: order.orderNo,
          orderDate: order.orderDate,
          deliveryDate: order.deliveryDate ?? null,
          orderType: order.orderType,
          status: order.status,
          customerId: order.customerId,
          customerName: customer?.name ?? '',
          customerPhone: customer?.phone ?? null,
          customerPoRef: order.customerPoRef ?? null,
          salesManager: order.salesManager ?? null,
          paymentTerms: order.paymentTerms ?? null,
          paymentRemarks: order.paymentRemarks ?? null,
          productRemarks: order.productRemarks ?? null,
          billingRemarks: order.billingRemarks ?? null,
          packingRemarks: order.packingRemarks ?? null,
          pricesIncludeGst: order.pricesIncludeGst,
          updatedAt: order.updatedAt.toISOString(),
          total: orderTotal,
          received: got,
          due: Math.round((orderTotal - got) * 100) / 100,
          late: Boolean(order.deliveryDate && order.deliveryDate < today && order.status !== 'completed' && order.status !== 'cancelled'),
          doneCount: views.filter((view) => isFinished(view.status)).length,
          stageCount: views.length,
          current: views
            .filter((view) => view.status === 'open' || view.status === 'on_hold')
            .map((view) => ({ key: view.key, label: view.label, department: view.department, status: view.status, days: view.days, responsibleName: view.responsibleName, holdParty: view.holdParty, holdReason: view.holdReason, started: Boolean(view.data.__started) })),
          stages: Object.fromEntries(
            views.map((view) => {
              const def = stageDef(view.key)
              const steps = stepStates(view.data)
              const required = (def?.steps ?? []).filter((step) => !step.optional)
              return [
                view.key,
                {
                  status: view.status,
                  days: view.days,
                  openedAt: view.openedAt,
                  completedAt: view.completedAt,
                  completedByName: view.completedByName,
                  responsibleName: view.responsibleName,
                  started: Boolean(view.data.__started),
                  reopen: view.reopen,
                  stepsDone: required.filter((step) => steps[step.key]?.done).length,
                  stepsTotal: required.length,
                  fields: stageFields(view.key, view.data),
                },
              ]
            }),
          ),
          lines: (linesOf.get(order.id) ?? []).map((line) => {
            const product = products.get(line.productId)
            const priced = priceLine({ quantity: num(line.quantity), rate: line.rate == null ? null : num(line.rate), gstPercent: num(line.gstPercent), discountPercent: num(line.discountPercent) }, order.pricesIncludeGst)
            return {
              id: line.id,
              productId: line.productId,
              productCode: product?.code ?? null,
              productTitle: product?.title ?? '(deleted product)',
              brandName: line.brandName ?? null,
              packSize: line.packSize ?? null,
              mrp: line.mrp == null ? null : num(line.mrp),
              quantity: num(line.quantity),
              rate: line.rate == null ? null : num(line.rate),
              gstPercent: num(line.gstPercent),
              discountPercent: num(line.discountPercent),
              total: priced.total,
              batchNo: line.batchNo ?? null,
              specs: line.specs ?? {},
            }
          }),
        }
      })

    const money = await canSeeMoney(ctx)
    const access = await resolveOrderAccess(ctx)
    const overrides = access.full ? undefined : await loadStageOverrides(ctx)
    const visible = access.full
      ? items
      : items.map((item) => ({
          ...item,
          customerPhone: access.accounts || access.dispatch ? item.customerPhone : null,
          paymentTerms: access.accounts ? item.paymentTerms : null,
          paymentRemarks: access.accounts ? item.paymentRemarks : null,
          billingRemarks: access.accounts ? item.billingRemarks : null,
          current: item.current.map((stage) => (canReadStage(access, stage.key) ? stage : { ...stage, holdReason: null })),
          stages: Object.fromEntries(Object.entries(item.stages).map(([key, stage]) => [key, { ...stage, locked: !canReadStage(access, key), fields: visibleStageData(access, key, stage.fields, overrides) }])),
        }))
    const shown = money
      ? visible
      : visible.map((item) => ({
          ...item,
          total: null,
          received: null,
          due: null,
          stages: Object.fromEntries(Object.entries(item.stages).map(([key, stage]) => [key, { ...stage, fields: Object.fromEntries(Object.entries(stage.fields).filter(([field]) => !isMoneyStageField(key, field))) }])),
          lines: item.lines.map((line) => ({ ...line, rate: null, discountPercent: null, total: null })),
        }))
    return NextResponse.json({
      canSeeMoney: money,
      access: { full: access.full, stages: Array.from(access.stages) },
      items: shown,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      summary: { orders: everything.length, value: money ? Math.round(value * 100) / 100 : null, received: money ? Math.round(paid * 100) / 100 : null, due: money ? Math.round((value - paid) * 100) / 100 : null, late, onHold, stageCounts },
      stageKeys: STAGES.map((def) => def.key),
    })
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Orders',
  summary: 'Order book master sheet',
  methods: {
    GET: {
      summary: 'Orders with every line, stage status, stage fields, money and counts per stage for the master sheet',
      tags: ['Creative Carbon Orders'],
      query: querySchema,
      responses: [{ status: 200, description: 'Sheet rows', schema: z.object({ items: z.array(z.object({ id: z.string() }).passthrough()) }).passthrough() }],
    },
  },
}

export { GET }
