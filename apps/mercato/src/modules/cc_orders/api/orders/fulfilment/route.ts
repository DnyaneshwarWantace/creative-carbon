import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { fulfilmentActionSchema, fulfilmentQuerySchema } from '../../../data/validators'
import { allocateLot, allocationCandidates, fulfilmentView, markPacked, qcView, releaseAllocation, savePacking, syncQcSteps } from '../../../lib/fulfilment'
import { currentUserName, findOrder, hasFeatures } from '../../../lib/server'
import { orderErrorResponse, runGuarded } from '../../../lib/guard'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_orders.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_orders.stages'] },
}

const FEATURE: Record<string, string> = { allocate: 'cc_orders.work.store', release: 'cc_orders.work.store', pack: 'cc_orders.work.dispatch', packed: 'cc_orders.work.dispatch', qc_sync: 'cc_orders.work.qc' }

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = fulfilmentQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give the order' }, { status: 400 })
  try {
    const order = await findOrder(ctx, parsed.data.id)
    if (parsed.data.lineId) return NextResponse.json({ items: await allocationCandidates(ctx, order, parsed.data.lineId) })
    return NextResponse.json({ ...(await fulfilmentView(ctx, order)), qc: await qcView(ctx, order) })
  } catch (error) {
    return orderErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = fulfilmentActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Check the line, lot and quantity' }, { status: 400 })
  const input = parsed.data
  if (!(await hasFeatures(ctx, [FEATURE[input.action]]))) return NextResponse.json({ error: 'Your department does not do this step' }, { status: 403 })
  try {
    const order = await findOrder(ctx, input.orderId)
    if (order.status === 'cancelled') return NextResponse.json({ error: 'This order is cancelled' }, { status: 409 })
    const byName = await currentUserName(ctx)
    return await runGuarded(ctx, req, { resourceId: order.id, operation: 'custom', payload: input }, async () => {
      let extra: Record<string, unknown> = {}
      if (input.action === 'allocate') await allocateLot(ctx, order, input, byName)
      if (input.action === 'release') await releaseAllocation(ctx, order, input.allocationId, byName)
      if (input.action === 'pack') extra = await savePacking(ctx, order, input, byName)
      if (input.action === 'packed') await markPacked(ctx, order, byName)
      if (input.action === 'qc_sync') extra = { qc: await syncQcSteps(ctx, order, byName) }
      order.updatedAt = new Date()
      await ctx.em.flush()
      return NextResponse.json({ ...(await fulfilmentView(ctx, order)), ...extra })
    })
  } catch (error) {
    return orderErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Orders',
  summary: 'Order fulfilment: stock allocation by lot, sheet weighment, QC read-out',
  methods: {
    GET: { summary: 'Line progress and allocations (?id=), or lots to allocate for a line (?id=&lineId=)', tags: ['Creative Carbon Orders'], query: fulfilmentQuerySchema, responses: [{ status: 200, description: 'Fulfilment', schema: z.object({}).passthrough() }] },
    POST: {
      summary: 'Allocate a lot to a line (held in stock), release it, save the sheet weights of a line, mark packed, or read QC steps from the inspections',
      tags: ['Creative Carbon Orders'],
      requestBody: { schema: fulfilmentActionSchema },
      responses: [{ status: 200, description: 'Fulfilment', schema: z.object({}).passthrough() }],
      errors: [{ status: 409, description: 'Stage not open, lot on hold, or not enough free stock' }],
    },
  },
}

export { GET, POST }
