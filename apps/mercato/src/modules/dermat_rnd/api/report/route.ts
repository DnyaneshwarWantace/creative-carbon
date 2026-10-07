import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../dermat_orders/lib/server'
import { rdReportSchema } from '../../data/validators'
import { buildReport, currentMonth } from '../../lib/report'
import { rdErrorResponse } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_rnd.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = rdReportSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Pick a month as YYYY-MM' }, { status: 400 })
  try {
    return NextResponse.json(await buildReport(ctx, parsed.data.month ?? currentMonth()))
  } catch (error) {
    return rdErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat R&D',
  summary: 'Monthly R&D report',
  methods: {
    GET: { summary: 'Trial batches made, pass / fail, approved formulas and samples sent in a month, by chemist, with a 12-month trend', tags: ['Dermat R&D'], query: rdReportSchema, responses: [{ status: 200, description: 'Report', schema: z.object({}).passthrough() }] },
  },
}

export { GET }
