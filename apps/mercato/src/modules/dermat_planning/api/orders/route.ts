import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../dermat_orders/lib/server'
import { planningOrders } from '../../lib/service'
import { planningErrorResponse } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_planning.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  try {
    return NextResponse.json({ items: await planningOrders(ctx) })
  } catch (error) {
    return planningErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Planning',
  summary: 'Open orders to plan',
  methods: {
    GET: {
      summary: 'Booked and confirmed orders with their lines, BOM status, planning stage and reservation count',
      tags: ['Dermat Planning'],
      responses: [{ status: 200, description: 'Orders', schema: z.object({ items: z.array(z.object({ id: z.string() }).passthrough()) }) }],
    },
  },
}

export { GET }
