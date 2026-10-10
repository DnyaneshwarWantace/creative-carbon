import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../lib/server'
import { orderErrorResponse } from '../../../lib/guard'
import { despatchView, findDespatch } from '../../../lib/despatch'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_orders.view'] },
}

const querySchema = z.object({ id: z.string().uuid() })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give the despatch' }, { status: 400 })
  try {
    const { stage, order } = await findDespatch(ctx, parsed.data.id)
    return NextResponse.json(await despatchView(ctx, stage, order))
  } catch (error) {
    return orderErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Orders',
  summary: 'One despatch',
  methods: {
    GET: {
      summary: 'Despatch of an order: invoice, transporter, vehicle, LR, container, packages, weights, lots that went out and came back',
      tags: ['Creative Carbon Orders'],
      query: querySchema,
      responses: [{ status: 200, description: 'Despatch', schema: z.object({ id: z.string(), orderId: z.string() }).passthrough() }],
      errors: [{ status: 404, description: 'Not found' }],
    },
  },
}

export { GET }
