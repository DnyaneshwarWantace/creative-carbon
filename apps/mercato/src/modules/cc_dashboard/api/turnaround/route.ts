import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../cc_orders/lib/server'
import { turnaround } from '../../lib/turnaround'
import { withStageOverrides } from '../../../cc_orders/lib/stageSettings'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_dashboard.view'] },
}

const querySchema = z.object({ days: z.coerce.number().int().min(7).max(730).default(90) })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return withStageOverrides(ctx, async () => {
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid days' }, { status: 400 })
    return NextResponse.json(await turnaround(ctx, parsed.data.days))
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Overview',
  summary: 'Turnaround: how long each stage and each person takes',
  methods: {
    GET: { summary: 'Completed steps in the last N days: average and slowest days per stage and per person, open now, slowest steps', tags: ['Creative Carbon Overview'], query: querySchema, responses: [{ status: 200, description: 'Turnaround', schema: z.object({ stages: z.array(z.object({}).passthrough()) }).passthrough() }] },
  },
}

export { GET }
