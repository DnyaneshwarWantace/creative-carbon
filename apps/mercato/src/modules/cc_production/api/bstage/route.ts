import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { bstageBoard, bstageLot } from '../../lib/bstage'
import { plantErrorResponse } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.coating.view'] },
}

const querySchema = z.object({ lotId: z.string().uuid().optional(), q: z.string().trim().max(100).optional() })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.lotId) return NextResponse.json(await bstageLot(ctx, parsed.data.lotId))
    return NextResponse.json(await bstageBoard(ctx, { q: parsed.data.q }))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Coating',
  summary: 'B-stage board: lots by age (day 0–4, 5–7, past 7, past 10 blocked) or one lot (?lotId=)',
  methods: { GET: { summary: 'B-stage board or one lot', tags: ['Creative Carbon Coating'], query: querySchema, responses: [{ status: 200, description: 'Board', schema: z.object({}).passthrough() }] } },
}

export { GET }
