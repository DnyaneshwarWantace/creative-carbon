import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../cc_orders/lib/server'
import { rateQuerySchema } from '../../data/validators'
import { suggestRates } from '../../lib/rates'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.prices.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = rateQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  return NextResponse.json({ items: await suggestRates(ctx, parsed.data) })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon CRM',
  summary: 'Rate per kg from the price list for a grade and thickness',
  methods: {
    GET: { summary: 'Matching price-list rates (?grade=&thickness=&currency=)', tags: ['Creative Carbon CRM'], query: rateQuerySchema, responses: [{ status: 200, description: 'Rates', schema: z.object({ items: z.array(z.object({}).passthrough()) }) }] },
  },
}

export { GET }
