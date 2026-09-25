import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { listPeople, resolveOrderContext } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_orders.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return NextResponse.json({ items: await listPeople(ctx) })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Orders',
  summary: 'People who can be responsible for an order stage',
  methods: {
    GET: {
      summary: 'List users (id and name)',
      tags: ['Dermat Orders'],
      responses: [{ status: 200, description: 'Users', schema: z.object({ items: z.array(z.object({ id: z.string(), name: z.string() })) }) }],
    },
  },
}

export { GET }
