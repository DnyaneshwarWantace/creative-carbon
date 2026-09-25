import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { loadProducts } from '../../../dermat_orders/lib/server'
import { StoreRequest, StoreRequestLine } from '../../data/entities'
import { listSchema, requestCreateSchema } from '../../data/validators'
import { STORE_LABEL, awaitingReceipt, createRequests, findRequest, requestView } from '../../lib/service'
import { resolveStoreContext, runGuarded, storeErrorResponse } from '../../lib/server'
import { stageDef } from '../../../dermat_orders/lib/stages'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_store.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_store.request'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = listSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const query = parsed.data
  try {
    if (query.id) return NextResponse.json(await requestView(ctx, await findRequest(ctx, query.id), true))
    const where: Record<string, unknown> = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }
    if (query.store) where.store = query.store
    if (query.orderId) where.orderId = query.orderId
    if (query.stageKey) where.stageKey = query.stageKey
    if (query.view === 'to_issue') where.status = { $in: ['requested', 'partly_issued'] }
    if (query.view === 'done') where.status = { $in: ['received', 'used', 'cancelled'] }
    if (query.view === 'to_receive') where.status = { $nin: ['cancelled', 'used'] }
    if (query.productId) {
      const lines = await ctx.em.find(StoreRequestLine, { productId: query.productId, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
      where.id = { $in: Array.from(new Set(lines.map((line) => line.requestId))) }
    }
    if (query.search) {
      const term = `%${query.search.replace(/[%_]/g, '')}%`
      where.$or = [{ code: { $ilike: term } }, { orderNo: { $ilike: term } }]
    }
    let requests = await ctx.em.find(StoreRequest, where, { orderBy: { createdAt: 'desc' }, limit: 500 })
    const lines = requests.length ? await ctx.em.find(StoreRequestLine, { requestId: { $in: requests.map((request) => request.id) } }) : []
    if (query.view === 'to_receive') requests = requests.filter((request) => awaitingReceipt(lines.filter((line) => line.requestId === request.id)))
    const total = requests.length
    const pageItems = requests.slice((query.page - 1) * query.pageSize, query.page * query.pageSize)
    const products = await loadProducts(ctx, lines.filter((line) => pageItems.some((request) => request.id === line.requestId)).map((line) => line.productId))
    const items = pageItems.map((request) => {
      const own = lines.filter((line) => line.requestId === request.id)
      const focus = query.productId ? own.find((line) => line.productId === query.productId) : null
      return {
        id: request.id,
        code: request.code,
        orderId: request.orderId,
        orderNo: request.orderNo,
        stageKey: request.stageKey,
        stageLabel: stageDef(request.stageKey)?.label ?? request.stageKey,
        store: request.store,
        storeLabel: STORE_LABEL[request.store],
        status: request.status,
        awaitingReceipt: awaitingReceipt(own),
        requestedByName: request.requestedByName ?? null,
        createdAt: request.createdAt.toISOString(),
        lineCount: own.length,
        issuedLines: own.filter((line) => Number(line.issuedQty) >= Number(line.requiredQty) - 0.000001).length,
        items: own.slice(0, 4).map((line) => products.get(line.productId)?.title ?? '—'),
        product: focus
          ? { required: Number(focus.requiredQty), issued: Number(focus.issuedQty), received: Number(focus.receivedQty), used: Number(focus.usedQty), returned: Number(focus.returnedQty), unit: focus.unit }
          : null,
      }
    })
    return NextResponse.json({ items, total, page: query.page, pageSize: query.pageSize })
  } catch (error) {
    return storeErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = requestCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Add at least one material with a quantity', details: parsed.error.flatten() }, { status: 400 })
  try {
    return await runGuarded(ctx, req, { resourceId: parsed.data.orderId, operation: 'create', payload: parsed.data }, async () => {
      const created = await ctx.em.transactional(async (em) => createRequests({ ...ctx, em: em as typeof ctx.em }, parsed.data))
      return NextResponse.json({ items: created.map((request) => ({ id: request.id, code: request.code, store: request.store })) }, { status: 201 })
    })
  } catch (error) {
    return storeErrorResponse(error)
  }
}

const itemSchema = z.object({ id: z.string(), code: z.string(), status: z.string() }).passthrough()

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Store',
  summary: 'Store requests from production to the RM / PM store',
  methods: {
    GET: {
      summary: 'List store requests (to issue, to receive, done) or one request with stock by batch',
      tags: ['Dermat Store'],
      query: listSchema,
      responses: [{ status: 200, description: 'Requests', schema: z.object({ items: z.array(itemSchema).optional() }).passthrough() }],
    },
    POST: {
      summary: 'Ask the store for material for an order stage (split into RM and PM requests)',
      tags: ['Dermat Store'],
      requestBody: { schema: requestCreateSchema },
      responses: [{ status: 201, description: 'Created requests', schema: z.object({ items: z.array(itemSchema.partial()) }) }],
      errors: [{ status: 409, description: 'Stage not started or already finished' }],
    },
  },
}

export { GET, POST }
