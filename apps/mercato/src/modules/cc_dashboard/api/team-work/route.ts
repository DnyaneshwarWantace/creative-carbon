import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../cc_orders/lib/server'
import { myWork } from '../../lib/overview'
import { withStageOverrides } from '../../../cc_orders/lib/stageSettings'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_dashboard.everyone'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return withStageOverrides(ctx, async () => {
    return NextResponse.json({ items: await myWork(ctx, ctx.userId, true) })
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Overview',
  summary: 'Open order steps of everyone, with the responsible person',
  methods: {
    GET: { summary: 'Open order steps of everyone, with the responsible person', tags: ['Creative Carbon Overview'], responses: [{ status: 200, description: 'Pending steps', schema: z.object({ items: z.array(z.object({ orderId: z.string() }).passthrough()) }) }] },
  },
}

export { GET }
