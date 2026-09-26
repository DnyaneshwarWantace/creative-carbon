import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveOrderContext } from '../../../dermat_orders/lib/server'
import { RdRequest } from '../../data/entities'
import { rdInputSchema, rdListSchema, rdUpdateSchema } from '../../data/validators'
import { createRequest, findRequest, requestView, updateRequest } from '../../lib/service'
import { rdErrorResponse, runRdGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_rnd.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_rnd.request'] },
  PUT: { requireAuth: true, requireFeatures: ['dermat_rnd.request'] },
}

const VIEW_STATUS: Record<string, string[] | null> = {
  open: ['requested', 'in_progress', 'changes'],
  samples: ['sample_sent'],
  approved: ['approved'],
  closed: ['dropped'],
  all: null,
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = rdListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json(requestView(await findRequest(ctx, parsed.data.id)))
    const where: Record<string, unknown> = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }
    const statuses = VIEW_STATUS[parsed.data.view]
    if (statuses) where.status = { $in: statuses }
    if (parsed.data.kind) where.kind = parsed.data.kind
    if (parsed.data.customerId) where.customerId = parsed.data.customerId
    if (parsed.data.search) {
      const term = `%${parsed.data.search.replace(/[%_]/g, '')}%`
      where.$or = [{ code: { $ilike: term } }, { productName: { $ilike: term } }, { customerName: { $ilike: term } }, { brand: { $ilike: term } }, { orderNo: { $ilike: term } }]
    }
    const items = await ctx.em.find(RdRequest, where, { orderBy: { updatedAt: 'desc' }, limit: 300 })
    const counts = await ctx.em.getConnection().execute<Array<{ status: string; total: string }>>('select status, count(*) as total from dermat_rnd_requests where tenant_id = ? and organization_id = ? and deleted_at is null group by status', [ctx.tenantId, ctx.organizationId])
    return NextResponse.json({ items: items.map(requestView), counts: Object.fromEntries(counts.map((row) => [row.status, Number(row.total)])) })
  } catch (error) {
    return rdErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = rdInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Name the product and pick the client or NPD' }, { status: 400 })
  try {
    const result = await runRdGuarded(ctx, req, 'new', 'create', parsed.data as Record<string, unknown>, async () => requestView(await createRequest(ctx, parsed.data)))
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return rdErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = rdUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    const request = await findRequest(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'dermat_rnd.request', resourceId: request.id, current: request.updatedAt, request: req })
    const result = await runRdGuarded(ctx, req, request.id, 'update', parsed.data as Record<string, unknown>, async () => {
      await updateRequest(ctx, request, parsed.data)
      return requestView(request)
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return rdErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat R&D',
  summary: 'R&D requests',
  methods: {
    GET: { summary: 'R&D requests by view (open, samples out, approved, closed) or one by id', tags: ['Dermat R&D'], query: rdListSchema, responses: [{ status: 200, description: 'Requests', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Raise an R&D request for a client or a new product; gets an R&D number', tags: ['Dermat R&D'], requestBody: { schema: rdInputSchema }, responses: [{ status: 201, description: 'Request', schema: z.object({ id: z.string() }).passthrough() }] },
    PUT: { summary: 'Edit an R&D request', tags: ['Dermat R&D'], requestBody: { schema: rdUpdateSchema }, responses: [{ status: 200, description: 'Request', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { GET, POST, PUT }
