import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { availableBulk } from '../../../lib/productionStock'
import { findOrder, resolveOrderContext } from '../../../lib/server'
import { orderErrorResponse } from '../../../lib/guard'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_orders.view'] },
}

const querySchema = z.object({ orderId: z.string().uuid() })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
  try {
    const order = await findOrder(ctx, parsed.data.orderId)
    return NextResponse.json(await availableBulk(ctx, order.id))
  } catch (error) {
    return orderErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Orders',
  summary: 'Bulk needed by an order and bulk batches available in PRODUCTION',
  methods: {
    GET: {
      summary: 'Planned bulk per line (from fill size × SG) and QC-approved bulk batches that can be reused',
      tags: ['Dermat Orders'],
      query: querySchema,
      responses: [{ status: 200, description: 'Plan and batches', schema: z.object({ plan: z.array(z.object({}).passthrough()), batches: z.array(z.object({}).passthrough()) }) }],
    },
  },
}

export { GET }
