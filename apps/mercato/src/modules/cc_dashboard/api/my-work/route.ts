import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../cc_orders/lib/server'
import { sweepOverdueStages } from '../../../cc_orders/lib/notify'
import { myWork } from '../../lib/overview'
import { withStageOverrides } from '../../../cc_orders/lib/stageSettings'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_dashboard.my_work'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return withStageOverrides(ctx, async () => {
    await sweepOverdueStages(ctx)
    return NextResponse.json({ items: await myWork(ctx, ctx.userId, false) })
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Overview',
  summary: 'Open order steps assigned to me, overdue and stuck first',
  methods: {
    GET: { summary: 'Open order steps assigned to me, overdue and stuck first', tags: ['Creative Carbon Overview'], responses: [{ status: 200, description: 'Pending steps', schema: z.object({ items: z.array(z.object({ orderId: z.string() }).passthrough()) }) }] },
  },
}

export { GET }
