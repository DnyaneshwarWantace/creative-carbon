import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../lib/server'
import { orderErrorResponse } from '../../lib/guard'
import { salesQueue } from '../../lib/salesQueue'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_orders.view', 'dermat_orders.manage'] },
}

const querySchema = z.object({ mine: z.string().trim().max(120).optional() })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    return NextResponse.json(await salesQueue(ctx, { mine: parsed.data.mine }))
  } catch (error) {
    return orderErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Orders',
  summary: 'Sales work queue',
  methods: {
    GET: {
      summary: 'Everything waiting on Sales: client-side holds, sample feedback, artwork with the client, advances, deliveries due or late, samples without an R&D number, deliveries to confirm',
      tags: ['Dermat Orders'],
      query: querySchema,
      responses: [{ status: 200, description: 'Tasks', schema: z.object({ tasks: z.array(z.object({ orderId: z.string() }).passthrough()), counts: z.record(z.string(), z.number()) }) }],
    },
  },
}

export { GET }
