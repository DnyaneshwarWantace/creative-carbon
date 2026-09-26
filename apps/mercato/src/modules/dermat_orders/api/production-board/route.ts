import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../lib/server'
import { orderErrorResponse } from '../../lib/guard'
import { productionBoard } from '../../lib/productionBoard'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_orders.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  try {
    return NextResponse.json(await productionBoard(ctx))
  } catch (error) {
    return orderErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Orders',
  summary: 'Production board and schedule',
  methods: {
    GET: {
      summary: 'Every batch in production placed in its current step, plus the manufacturing schedule by date and vessel',
      tags: ['Dermat Orders'],
      responses: [{ status: 200, description: 'Board', schema: z.object({ cards: z.array(z.object({}).passthrough()), schedule: z.array(z.object({}).passthrough()) }).passthrough() }],
    },
  },
}

export { GET }
