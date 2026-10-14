import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { poActionSchema, poQuerySchema, poWriteSchema } from '../../../data/validators'
import { acknowledgePo, addAmendment, findPoRow, poView, savePo } from '../../../lib/poDetails'
import { currentUserName, findOrder, resolveOrderContext } from '../../../lib/server'
import { orderErrorResponse, runGuarded } from '../../../lib/guard'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_orders.view'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_orders.manage'] },
  POST: { requireAuth: true, requireFeatures: ['cc_orders.manage'] },
}

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = poQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Send the order id' }, { status: 400 })
  try {
    return NextResponse.json(await poView(ctx, await findOrder(ctx, parsed.data.orderId), today()))
  } catch (error) {
    return orderErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = poWriteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the PO details' }, { status: 400 })
  try {
    const order = await findOrder(ctx, parsed.data.orderId)
    const existing = await findPoRow(ctx, order.id)
    if (existing) enforceCommandOptimisticLock({ resourceKind: 'cc_orders.po', resourceId: existing.id, current: existing.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runGuarded(ctx, req, { resourceId: order.id, operation: 'custom', payload: parsed.data }, async () => {
      await savePo(ctx, order, parsed.data, byName)
      return poView(ctx, order, today())
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return orderErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = poActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the request' }, { status: 400 })
  try {
    const order = await findOrder(ctx, parsed.data.orderId)
    const existing = await findPoRow(ctx, order.id)
    if (existing) enforceCommandOptimisticLock({ resourceKind: 'cc_orders.po', resourceId: existing.id, current: existing.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runGuarded(ctx, req, { resourceId: order.id, operation: 'custom', payload: parsed.data }, async () => {
      if (parsed.data.action === 'amend') await addAmendment(ctx, order, parsed.data.date, parsed.data.note, byName)
      else await acknowledgePo(ctx, order, byName)
      return poView(ctx, order, today())
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return orderErrorResponse(error)
  }
}

const viewSchema = z.object({}).passthrough()

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Orders',
  summary: 'Customer purchase order details on an order: PO header, item codes and line delivery dates, documents to send, commercial terms, amendments, acknowledgement',
  methods: {
    GET: { summary: 'Read the PO details', tags: ['Creative Carbon Orders'], query: poQuerySchema, responses: [{ status: 200, description: 'PO details', schema: viewSchema }] },
    PUT: { summary: 'Save the PO details', tags: ['Creative Carbon Orders'], requestBody: { schema: poWriteSchema }, responses: [{ status: 200, description: 'Saved', schema: viewSchema }], errors: [{ status: 409, description: 'Changed by someone else' }] },
    POST: { summary: 'Record an amendment or the acknowledgement', tags: ['Creative Carbon Orders'], requestBody: { schema: poActionSchema }, responses: [{ status: 200, description: 'Saved', schema: viewSchema }] },
  },
}

export { GET, PUT, POST }
