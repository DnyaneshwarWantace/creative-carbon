import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../../cc_orders/lib/server'
import { findInChart, parseChartQuery, type ChartRecord } from '../../../lib/chartFinder'
import { MASTER_DEFS } from '../../../lib/masterDefs'
import { listMasters } from '../../../lib/masters'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.masters.view'] },
}

const LIMIT = 100

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const query = parseChartQuery(new URL(req.url).searchParams)
  const rows = (await listMasters(ctx, MASTER_DEFS.chart, { includeInactive: false }))
  const matches = findInChart(rows, query)
  return NextResponse.json({ total: matches.length, items: matches.slice(0, LIMIT).map((match) => ({ ...match.entry, distance: match.distance })) })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Masters',
  summary: 'Die finder: search the die chart by family, code text and dimensions within a tolerance',
  methods: {
    GET: {
      summary: 'Find chart entries (?family=&q=&r1=&t=&tol=)',
      tags: ['Creative Carbon Masters'],
      query: z.object({ family: z.string().optional(), q: z.string().optional(), tol: z.string().optional() }).passthrough(),
      responses: [{ status: 200, description: 'Matches, nearest first', schema: z.object({ total: z.number(), items: z.array(z.object({}).passthrough()) }) }],
    },
  },
}

export { GET }
