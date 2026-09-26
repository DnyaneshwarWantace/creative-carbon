import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { loadProducts, resolveOrderContext } from '../../../dermat_orders/lib/server'
import { PurchaseOrder, PurchaseOrderLine } from '../../data/entities'
import { poInputSchema, poListSchema, poUpdateSchema } from '../../data/validators'
import { createPo, findPo, num, poView, round, updatePo } from '../../lib/service'
import { purchaseErrorResponse, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_purchase.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_purchase.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['dermat_purchase.manage'] },
}

const RESOURCE = 'dermat_purchase.order'

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = poListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const query = parsed.data
  try {
    if (query.id) return NextResponse.json(await poView(ctx, await findPo(ctx, query.id)))
    const where: Record<string, unknown> = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }
    if (query.view === 'draft') where.status = 'draft'
    if (query.view === 'pending_approval') where.status = 'pending_approval'
    if (query.view === 'open') where.status = { $in: ['approved', 'partly_received'] }
    if (query.view === 'received') where.status = { $in: ['received', 'cancelled'] }
    if (query.vendorId) where.vendorId = query.vendorId
    if (query.productId) {
      const lines = await ctx.em.find(PurchaseOrderLine, { productId: query.productId, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
      where.id = { $in: Array.from(new Set(lines.map((line) => line.poId))) }
    }
    if (query.search) {
      const term = `%${query.search.replace(/[%_]/g, '')}%`
      where.$or = [{ code: { $ilike: term } }, { vendorName: { $ilike: term } }]
    }
    const [pos, total] = await ctx.em.findAndCount(PurchaseOrder, where, { orderBy: { createdAt: 'desc' }, limit: query.pageSize, offset: (query.page - 1) * query.pageSize })
    const lines = pos.length ? await ctx.em.find(PurchaseOrderLine, { poId: { $in: pos.map((po) => po.id) } }) : []
    const products = await loadProducts(ctx, lines.map((line) => line.productId))
    const items = pos.map((po) => {
      const own = lines.filter((line) => line.poId === po.id)
      const subtotal = own.reduce((sum, line) => sum + num(line.quantity) * num(line.rate), 0)
      const gst = own.reduce((sum, line) => sum + (num(line.quantity) * num(line.rate) * num(line.gstPercent)) / 100, 0)
      const ordered = own.reduce((sum, line) => sum + num(line.quantity), 0)
      const received = own.reduce((sum, line) => sum + Math.min(num(line.receivedQty), num(line.quantity)), 0)
      const focus = query.productId ? own.find((line) => line.productId === query.productId) : null
      return {
        id: po.id,
        code: po.code,
        vendorId: po.vendorId,
        vendorName: po.vendorName,
        poDate: po.poDate,
        expectedDate: po.expectedDate ?? null,
        status: po.status,
        total: round(subtotal + gst, 2),
        lineCount: own.length,
        receivedPercent: ordered > 0 ? Math.round((received / ordered) * 100) : 0,
        items: own.slice(0, 3).map((line) => products.get(line.productId)?.title ?? '—'),
        createdByName: po.createdByName ?? null,
        orderRefs: po.orderRefs ?? [],
        product: focus ? { quantity: num(focus.quantity), received: num(focus.receivedQty), rate: num(focus.rate), unit: focus.unit } : null,
      }
    })
    return NextResponse.json({ items, total, page: query.page, pageSize: query.pageSize })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = poInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pick a vendor and add at least one material with quantity and rate', details: parsed.error.flatten() }, { status: 400 })
  try {
    return await runGuarded(ctx, req, { resourceKind: RESOURCE, resourceId: 'new', operation: 'create', payload: parsed.data }, async () => {
      const po = await ctx.em.transactional(async (em) => createPo({ ...ctx, em: em as typeof ctx.em }, parsed.data))
      return NextResponse.json({ id: po.id, code: po.code, status: po.status }, { status: 201 })
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = poUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pick a vendor and add at least one material with quantity and rate' }, { status: 400 })
  try {
    const po = await findPo(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: RESOURCE, resourceId: po.id, current: po.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: RESOURCE, resourceId: po.id, operation: 'update', payload: parsed.data }, async () => {
      await ctx.em.transactional(async (em) => {
        const tx = { ...ctx, em: em as typeof ctx.em }
        await updatePo(tx, await findPo(tx, po.id), parsed.data)
      })
      return NextResponse.json(await poView(ctx, await findPo({ ...ctx, em: ctx.em.fork() }, po.id)))
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

const itemSchema = z.object({ id: z.string(), code: z.string(), status: z.string() }).passthrough()

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Purchase',
  summary: 'Purchase orders',
  methods: {
    GET: { summary: 'List purchase orders (draft, waiting approval, open, received) or one PO with lines, totals and GRNs', tags: ['Dermat Purchase'], query: poListSchema, responses: [{ status: 200, description: 'POs', schema: z.object({ items: z.array(itemSchema).optional() }).passthrough() }] },
    POST: { summary: 'Create a PO (draft, or sent for approval with submit=true)', tags: ['Dermat Purchase'], requestBody: { schema: poInputSchema }, responses: [{ status: 201, description: 'Created', schema: itemSchema }] },
    PUT: { summary: 'Edit a draft or waiting PO', tags: ['Dermat Purchase'], requestBody: { schema: poUpdateSchema }, responses: [{ status: 200, description: 'Updated', schema: itemSchema }], errors: [{ status: 409, description: 'Approved PO, or changed by someone else' }] },
  },
}

export { GET, POST, PUT }
