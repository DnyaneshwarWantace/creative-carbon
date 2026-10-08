import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CcOrder, CcOrderLine, CcOrderStage } from '../../data/entities'
import { orderInputSchema, orderListQuerySchema, orderUpdateSchema, type OrderInput } from '../../data/validators'
import { createStages, logEvent, openReadyStages, serializeOrder, stageViews } from '../../lib/engine'
import { isFinished, orderHeadline } from '../../lib/stages'
import {
  OrderError,
  currentUserName,
  customerExists,
  findOrder,
  loadCustomers,
  loadProducts,
  nextOrderNo,
  resolveOrderContext,
  type OrderContext,
} from '../../lib/server'
import { orderFilter } from '../../lib/orderFilter'
import { notifyStagesOpened } from '../../lib/notify'
import { enforceOrderLock, orderErrorResponse, runGuarded } from '../../lib/guard'
import { withStageOverrides } from '../../lib/stageSettings'
import { applyHeader, clean, createOrderRecord, validateInput, writeLines } from '../../lib/orderCreate'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_orders.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_orders.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_orders.manage'] },
}

function describeChanges(before: { header: Record<string, unknown>; lines: Array<{ productId: string; quantity: number; rate: number | null }> }, input: OrderInput, titles: Map<string, string>): string {
  const labels: Record<string, string> = { deliveryDate: 'delivery date', customerPoRef: 'customer PO', salesManager: 'sales manager', paymentTerms: 'payment terms', market: 'domestic / export', incoterm: 'incoterm', portOfLoading: 'port of loading', country: 'country', currency: 'currency', paymentRemarks: 'payment remarks', priority: 'priority', shippingAddress: 'shipping address', billingAddress: 'billing address', productRemarks: 'product remarks', packingRemarks: 'packing remarks', billingRemarks: 'billing remarks' }
  const changes: string[] = []
  for (const [key, label] of Object.entries(labels)) {
    const was = before.header[key] ?? null
    const now = (input as Record<string, unknown>)[key] ?? null
    if (String(was ?? '') !== String(now ?? '')) changes.push(`${label}: ${was ?? '—'} → ${now ?? '—'}`)
  }
  for (const line of input.lines) {
    const old = before.lines.find((entry) => entry.productId === line.productId)
    const name = titles.get(line.productId) ?? 'product'
    if (!old) changes.push(`added ${name} × ${line.quantity}`)
    else {
      if (old.quantity !== Number(line.quantity)) changes.push(`${name} qty ${old.quantity} → ${line.quantity}`)
      if ((old.rate ?? null) !== (line.rate ?? null)) changes.push(`${name} rate ${old.rate ?? '—'} → ${line.rate ?? '—'}`)
    }
  }
  for (const old of before.lines) if (!input.lines.some((line) => line.productId === old.productId)) changes.push(`removed ${titles.get(old.productId) ?? 'product'}`)
  return changes.join('; ')
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return withStageOverrides(ctx, async () => {
    const parsed = orderListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
    const query = parsed.data
    try {
      if (query.id) return NextResponse.json(await serializeOrder(ctx, await findOrder(ctx, query.id)))
    } catch (error) {
      return orderErrorResponse(error)
    }

    const { where, params } = await orderFilter(ctx, query)
    const connection = ctx.em.getConnection()
    const [countRow] = await connection.execute<Array<{ total: string }>>(`select count(*) as total from cc_orders o where ${where.join(' and ')}`, params)
    const orders = await connection.execute<
      Array<{ id: string; order_no: string; order_date: string; delivery_date: string | null; customer_id: string; status: string; order_type: string; sales_manager: string | null; priority: string; revised_at: Date | null; created_at: Date }>
    >(
      `select o.id, o.order_no, o.order_date::text as order_date, o.delivery_date::text as delivery_date, o.customer_id, o.status, o.order_type, o.sales_manager, o.priority, o.revised_at, o.created_at
         from cc_orders o where ${where.join(' and ')}
        order by o.created_at desc limit ? offset ?`,
      [...params, query.pageSize, (query.page - 1) * query.pageSize],
    )
    const ids = orders.map((order) => order.id)
    const [lines, stages, customers] = await Promise.all([
      ids.length ? ctx.em.find(CcOrderLine, { orderId: { $in: ids } }, { orderBy: { position: 'asc' } }) : [],
      ids.length ? ctx.em.find(CcOrderStage, { orderId: { $in: ids } }) : [],
      loadCustomers(
        ctx,
        orders.map((order) => order.customer_id),
      ),
    ])
    const products = await loadProducts(
      ctx,
      lines.map((line) => line.productId),
    )
    const total = Number(countRow?.total ?? 0)
    return NextResponse.json({
      items: orders.map((order) => {
        const orderLines = lines.filter((line) => line.orderId === order.id)
        const views = stageViews(stages.filter((stage) => stage.orderId === order.id), undefined, order)
        return {
          id: order.id,
          orderNo: order.order_no,
          orderDate: order.order_date,
          deliveryDate: order.delivery_date,
          customerId: order.customer_id,
          customerName: customers.get(order.customer_id)?.name ?? '',
          status: order.status,
          headline: orderHeadline(order.status, order.revised_at, stages.find((stage) => stage.orderId === order.id && stage.stageKey === 'dispatch')?.data),
          priority: order.priority,
          orderType: order.order_type,
          salesManager: order.sales_manager,
          products: orderLines.map((line) => ({
            id: line.productId,
            title: products.get(line.productId)?.title ?? '',
            code: products.get(line.productId)?.code ?? null,
            quantity: Number(line.quantity),
          })),
          current: views
            .filter((stage) => stage.status === 'open' || stage.status === 'on_hold')
            .map((stage) => ({ key: stage.key, label: stage.label, status: stage.status, responsibleName: stage.responsibleName, days: stage.days, holdParty: stage.holdParty, started: Boolean(stage.data.__started) })),
          doneCount: views.filter((stage) => isFinished(stage.status)).length,
          stageCount: views.length,
        }
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    })
  })
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = orderInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid order', details: parsed.error.flatten() }, { status: 400 })
  const input = parsed.data
  try {
    await validateInput(ctx, input)
    return await runGuarded(ctx, req, { resourceId: input.customerId, operation: 'create', payload: input }, async () => {
      const order = await createOrderRecord(ctx, input, await currentUserName(ctx))
      return NextResponse.json({ id: order.id, orderNo: order.orderNo }, { status: 201 })
    })
  } catch (error) {
    return orderErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = orderUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid order', details: parsed.error.flatten() }, { status: 400 })
  const input = parsed.data
  try {
    const order = await findOrder(ctx, input.id)
    if (order.status === 'cancelled' || order.status === 'completed') throw new OrderError('This order can no longer be changed', 409)
    const stages = await ctx.em.find(CcOrderStage, { orderId: order.id })
    if (stages.some((stage) => stage.stageKey === 'allocation' && isFinished(stage.status))) {
      throw new OrderError('Stock is allocated — items and quantities are locked', 409)
    }
    enforceOrderLock(order, req)
    await validateInput(ctx, input)
    return await runGuarded(ctx, req, { resourceId: order.id, operation: 'update', payload: input }, async () => {
      const byName = await currentUserName(ctx)
      await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const fresh = await findOrder(txCtx, order.id)
        const oldLines = await em.find(CcOrderLine, { orderId: fresh.id })
        const before = {
          header: { deliveryDate: fresh.deliveryDate, customerPoRef: fresh.customerPoRef, salesManager: fresh.salesManager, paymentTerms: fresh.paymentTerms, market: fresh.market, incoterm: fresh.incoterm, portOfLoading: fresh.portOfLoading, country: fresh.country, currency: fresh.currency, paymentRemarks: fresh.paymentRemarks, priority: fresh.priority, shippingAddress: fresh.shippingAddress, billingAddress: fresh.billingAddress, productRemarks: fresh.productRemarks, packingRemarks: fresh.packingRemarks, billingRemarks: fresh.billingRemarks },
          lines: oldLines.map((line) => ({ productId: line.productId, quantity: Number(line.quantity), rate: line.rate == null ? null : Number(line.rate) })),
        }
        const titles = new Map([...(await loadProducts(txCtx, [...oldLines.map((line) => line.productId), ...input.lines.map((line) => line.productId)])).entries()].map(([id, product]) => [id, product.title]))
        const summary = describeChanges(before, input, titles)
        const keptBatch = new Map(oldLines.map((line) => [line.productId, line.batchNo ?? null]))
        const withBatches = { ...input, lines: input.lines.map((line) => ({ ...line, batchNo: clean(line.batchNo) ?? keptBatch.get(line.productId) ?? null })) }
        applyHeader(fresh, input)
        fresh.updatedAt = new Date()
        if (summary || clean(input.revisionNote)) {
          fresh.revisedAt = new Date()
          fresh.revisedByName = byName
          fresh.revisionNote = [clean(input.revisionNote), summary].filter(Boolean).join(' — ').slice(0, 2000)
        }
        await em.nativeDelete(CcOrderLine, { orderId: fresh.id })
        await writeLines(txCtx, fresh, withBatches)
        logEvent(txCtx, fresh, 'edited', null, [clean(input.revisionNote), summary].filter(Boolean).join(' — ') || null, byName)
        await em.flush()
      })
      return NextResponse.json({ ok: true })
    })
  } catch (error) {
    return orderErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Orders',
  summary: 'Sales orders',
  methods: {
    GET: {
      summary: 'Order book, or one order with lines, stages and history (id)',
      tags: ['Creative Carbon Orders'],
      query: orderListQuerySchema,
      responses: [{ status: 200, description: 'Orders', schema: z.object({ items: z.array(z.object({ id: z.string() }).passthrough()).optional() }).passthrough() }],
    },
    POST: {
      summary: 'Create an order (number DER/SO/<FY>/<n>)',
      tags: ['Creative Carbon Orders'],
      requestBody: { schema: orderInputSchema },
      responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.string(), orderNo: z.string() }) }],
      errors: [{ status: 400, description: 'Invalid lines' }],
    },
    PUT: {
      summary: 'Update order header and lines (until production is finished)',
      tags: ['Creative Carbon Orders'],
      requestBody: { schema: orderUpdateSchema },
      responses: [{ status: 200, description: 'Saved', schema: z.object({ ok: z.boolean() }) }],
      errors: [{ status: 409, description: 'Locked or changed by someone else' }],
    },
  },
}

export { GET, POST, PUT }
