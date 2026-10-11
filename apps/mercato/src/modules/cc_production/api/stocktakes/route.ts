import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { plantErrorResponse } from '../../lib/server'
import { findStocktake, listStocktakes, stocktakeView } from '../../lib/stocktakes'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_store.view'] },
}

const querySchema = z.object({ id: z.string().uuid().optional() })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json(stocktakeView(await findStocktake(ctx, parsed.data.id)))
    return NextResponse.json({ items: await listStocktakes(ctx) })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Owner',
  summary: 'Stocktakes and opening stock counts',
  methods: {
    GET: { summary: 'One stocktake (id) or the list', tags: ['Creative Carbon Owner'], query: querySchema, responses: [{ status: 200, description: 'Stocktakes', schema: z.object({}).passthrough() }] },
  },
}

export { GET }
