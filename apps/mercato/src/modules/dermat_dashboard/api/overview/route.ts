import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../dermat_orders/lib/server'
import { sweepOverdueStages } from '../../../dermat_orders/lib/notify'
import { overview } from '../../lib/overview'
import { withStageOverrides } from '../../../dermat_orders/lib/stageSettings'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_dashboard.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return withStageOverrides(ctx, async () => {
    await sweepOverdueStages(ctx)
    return NextResponse.json(await overview(ctx))
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Overview',
  summary: 'Overview dashboard',
  methods: {
    GET: {
      summary: 'Open / stuck / on hold / due orders, orders per stage, stuck steps, pending per person, materials below minimum, waiting queues, recent orders',
      tags: ['Dermat Overview'],
      responses: [{ status: 200, description: 'Overview', schema: z.object({ tiles: z.object({}).passthrough() }).passthrough() }],
    },
  },
}

export { GET }
