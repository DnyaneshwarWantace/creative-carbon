import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../dermat_orders/lib/server'
import { PurchaseIndent } from '../../data/entities'
import { indentInputSchema, indentListSchema } from '../../data/validators'
import { createIndent, findIndent, indentViews } from '../../lib/indents'
import { purchaseErrorResponse, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_purchase.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_purchase.indent'] },
}

const VIEW_STATUS: Record<string, string[] | null> = {
  to_approve: ['submitted'],
  approved: ['approved'],
  ordered: ['ordered'],
  closed: ['rejected', 'cancelled'],
  all: null,
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = indentListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json((await indentViews(ctx, [await findIndent(ctx, parsed.data.id)]))[0])
    const statuses = VIEW_STATUS[parsed.data.view]
    const where: Record<string, unknown> = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }
    if (statuses) where.status = { $in: statuses }
    if (parsed.data.search) {
      const term = `%${parsed.data.search.replace(/[%_]/g, '')}%`
      where.$or = [{ code: { $ilike: term } }, { department: { $ilike: term } }, { requestedByName: { $ilike: term } }]
    }
    const indents = await ctx.em.find(PurchaseIndent, where, { orderBy: { createdAt: 'desc' }, limit: 200 })
    const counts = await ctx.em.getConnection().execute<Array<{ status: string; total: string }>>(
      'select status, count(*) as total from dermat_purchase_indents where tenant_id = ? and organization_id = ? and deleted_at is null group by status',
      [ctx.tenantId, ctx.organizationId],
    )
    return NextResponse.json({ items: await indentViews(ctx, indents), counts: Object.fromEntries(counts.map((row) => [row.status, Number(row.total)])) })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = indentInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Add at least one material with a quantity' }, { status: 400 })
  try {
    const result = await runGuarded(ctx, req, { resourceKind: 'dermat_purchase.indent', resourceId: 'new', operation: 'create', payload: parsed.data as Record<string, unknown> }, async () => {
      const indent = await createIndent(ctx, parsed.data)
      return (await indentViews(ctx, [indent]))[0]
    })
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Purchase',
  summary: 'Purchase indents',
  methods: {
    GET: { summary: 'Indents by view (to approve, approved, ordered, closed) or one indent by id', tags: ['Dermat Purchase'], query: indentListSchema, responses: [{ status: 200, description: 'Indents', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Raise an indent; approvers are notified', tags: ['Dermat Purchase'], requestBody: { schema: indentInputSchema }, responses: [{ status: 201, description: 'Indent', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { GET, POST }
