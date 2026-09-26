import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { DermatOrder, DermatOrderLine, DermatOrderStage } from '../../data/entities'
import { orderInputSchema, orderListQuerySchema, orderUpdateSchema, type OrderInput } from '../../data/validators'
import { createStages, logEvent, openReadyStages, serializeOrder, stageViews } from '../../lib/engine'
import { isFinished } from '../../lib/stages'
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
import { enforceOrderLock, orderErrorResponse, runGuarded } from '../../lib/guard'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_orders.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_orders.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['dermat_orders.manage'] },
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function cleanSpecs(specs: OrderInput['lines'][number]['specs']): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  for (const [section, values] of Object.entries(specs ?? {})) {
    const kept = Object.fromEntries(Object.entries(values ?? {}).filter(([, value]) => value.trim()))
    if (Object.keys(kept).length) result[section] = kept
  }
  return result
}

async function validateInput(ctx: OrderContext, input: OrderInput): Promise<void> {
  if (!(await customerExists(ctx, input.customerId))) throw new OrderError('Customer not found', 404)
  const products = await loadProducts(
    ctx,
    input.lines.map((line) => line.productId),
  )
  const rows: Record<string, string> = {}
  input.lines.forEach((line, index) => {
    const product = products.get(line.productId)
    if (!product) rows[String(index + 1)] = 'Product not found'
    else if (product.kind !== 'finished_goods') rows[String(index + 1)] = `${product.title} is not a Finished Good`
  })
  if (Object.keys(rows).length) throw new OrderError('Some lines need fixing', 400, { rows })
  if (input.deliveryDate && input.deliveryDate < input.orderDate) throw new OrderError('Delivery date is before the order date')
}

function applyHeader(order: DermatOrder, input: OrderInput) {
  order.orderDate = input.orderDate
  order.deliveryDate = input.deliveryDate ?? null
  order.customerId = input.customerId
  order.customerPoRef = clean(input.customerPoRef)
  order.orderType = input.orderType
  order.sourceOrderId = input.sourceOrderId ?? null
  order.salesManager = clean(input.salesManager)
  order.paymentTerms = clean(input.paymentTerms)
  order.paymentRemarks = clean(input.paymentRemarks)
  order.productRemarks = clean(input.productRemarks)
  order.billingRemarks = clean(input.billingRemarks)
  order.packingRemarks = clean(input.packingRemarks)
  order.pricesIncludeGst = input.pricesIncludeGst
}

function writeLines(ctx: OrderContext, order: DermatOrder, input: OrderInput) {
  input.lines.forEach((line, index) => {
    ctx.em.persist(
      ctx.em.create(DermatOrderLine, {
        organizationId: ctx.organizationId,
        tenantId: ctx.tenantId,
        orderId: order.id,
        position: index + 1,
        productId: line.productId,
        brandName: clean(line.brandName),
        packSize: clean(line.packSize),
        mrp: line.mrp == null ? null : String(line.mrp),
        quantity: String(line.quantity),
        rate: line.rate == null ? null : String(line.rate),
        gstPercent: String(line.gstPercent),
        discountPercent: String(line.discountPercent),
        batchNo: clean(line.batchNo),
        specs: cleanSpecs(line.specs),
      }),
    )
  })
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
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
  const [countRow] = await connection.execute<Array<{ total: string }>>(`select count(*) as total from dermat_orders o where ${where.join(' and ')}`, params)
  const orders = await connection.execute<
    Array<{ id: string; order_no: string; order_date: string; delivery_date: string | null; customer_id: string; status: string; order_type: string; sales_manager: string | null; created_at: Date }>
  >(
    `select o.id, o.order_no, o.order_date::text as order_date, o.delivery_date::text as delivery_date, o.customer_id, o.status, o.order_type, o.sales_manager, o.created_at
       from dermat_orders o where ${where.join(' and ')}
      order by o.created_at desc limit ? offset ?`,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  )
  const ids = orders.map((order) => order.id)
  const [lines, stages, customers] = await Promise.all([
    ids.length ? ctx.em.find(DermatOrderLine, { orderId: { $in: ids } }, { orderBy: { position: 'asc' } }) : [],
    ids.length ? ctx.em.find(DermatOrderStage, { orderId: { $in: ids } }) : [],
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
      const views = stageViews(stages.filter((stage) => stage.orderId === order.id))
      return {
        id: order.id,
        orderNo: order.order_no,
        orderDate: order.order_date,
        deliveryDate: order.delivery_date,
        customerId: order.customer_id,
        customerName: customers.get(order.customer_id)?.name ?? '',
        status: order.status,
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
      const byName = await currentUserName(ctx)
      const order = await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const created = em.create(DermatOrder, {
          organizationId: ctx.organizationId,
          tenantId: ctx.tenantId,
          orderNo: await nextOrderNo(txCtx, input.orderDate),
          orderDate: input.orderDate,
          customerId: input.customerId,
          createdByName: byName,
        })
        applyHeader(created, input)
        em.persist(created)
        await em.flush()
        writeLines(txCtx, created, input)
        const stages = createStages(txCtx, created, byName)
        logEvent(txCtx, created, 'created', 'order', created.orderType === 'repeat' ? 'Repeat order' : null, byName)
        for (const opened of openReadyStages(stages)) logEvent(txCtx, created, 'opened', opened, null, null)
        await em.flush()
        return created
      })
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
    const stages = await ctx.em.find(DermatOrderStage, { orderId: order.id })
    if (stages.some((stage) => stage.stageKey === 'manufacturing' && isFinished(stage.status))) {
      throw new OrderError('Manufacturing is done — products and quantities are locked', 409)
    }
    enforceOrderLock(order, req)
    await validateInput(ctx, input)
    return await runGuarded(ctx, req, { resourceId: order.id, operation: 'update', payload: input }, async () => {
      const byName = await currentUserName(ctx)
      await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const fresh = await findOrder(txCtx, order.id)
        applyHeader(fresh, input)
        fresh.updatedAt = new Date()
        await em.nativeDelete(DermatOrderLine, { orderId: fresh.id })
        writeLines(txCtx, fresh, input)
        logEvent(txCtx, fresh, 'edited', null, null, byName)
        await em.flush()
      })
      return NextResponse.json({ ok: true })
    })
  } catch (error) {
    return orderErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Orders',
  summary: 'Sales orders',
  methods: {
    GET: {
      summary: 'Order book, or one order with lines, stages and history (id)',
      tags: ['Dermat Orders'],
      query: orderListQuerySchema,
      responses: [{ status: 200, description: 'Orders', schema: z.object({ items: z.array(z.object({ id: z.string() }).passthrough()).optional() }).passthrough() }],
    },
    POST: {
      summary: 'Create an order (number DER/SO/<FY>/<n>)',
      tags: ['Dermat Orders'],
      requestBody: { schema: orderInputSchema },
      responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.string(), orderNo: z.string() }) }],
      errors: [{ status: 400, description: 'Invalid lines' }],
    },
    PUT: {
      summary: 'Update order header and lines (until production is finished)',
      tags: ['Dermat Orders'],
      requestBody: { schema: orderUpdateSchema },
      responses: [{ status: 200, description: 'Saved', schema: z.object({ ok: z.boolean() }) }],
      errors: [{ status: 409, description: 'Locked or changed by someone else' }],
    },
  },
}

export { GET, POST, PUT }
