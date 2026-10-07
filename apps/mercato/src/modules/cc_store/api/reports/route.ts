import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext, storeErrorResponse } from '../../lib/server'
import { consumption, stockAgeing, stockOverview } from '../../lib/reports'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_store.view'] },
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const querySchema = z.object({ type: z.enum(['overview', 'ageing', 'consumption']).default('overview'), from: isoDate.optional(), to: isoDate.optional() })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.type === 'overview') return NextResponse.json({ items: await stockOverview(ctx) })
    if (parsed.data.type === 'ageing') return NextResponse.json(await stockAgeing(ctx))
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    const from = parsed.data.from ?? `${today.slice(0, 8)}01`
    const to = parsed.data.to ?? today
    if (from > to) return NextResponse.json({ error: 'The start date is after the end date' }, { status: 400 })
    return NextResponse.json({ from, to, ...(await consumption(ctx, { from, to })) })
  } catch (error) {
    return storeErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Store',
  summary: 'Inventory reports',
  methods: {
    GET: {
      summary: 'Stock overview across stores, stock ageing by days in store, or material consumption for a date range',
      tags: ['Creative Carbon Store'],
      query: querySchema,
      responses: [{ status: 200, description: 'Report', schema: z.object({ items: z.array(z.object({}).passthrough()) }).passthrough() }],
    },
  },
}

export { GET }
