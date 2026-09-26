import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../dermat_orders/lib/server'
import { myWork } from '../../lib/overview'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_dashboard.everyone'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return NextResponse.json({ items: await myWork(ctx, ctx.userId, true) })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Overview',
  summary: 'Open order steps of everyone, with the responsible person',
  methods: {
    GET: { summary: 'Open order steps of everyone, with the responsible person', tags: ['Dermat Overview'], responses: [{ status: 200, description: 'Pending steps', schema: z.object({ items: z.array(z.object({ orderId: z.string() }).passthrough()) }) }] },
  },
}

export { GET }
