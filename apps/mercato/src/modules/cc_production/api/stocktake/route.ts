import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { stocktakeQuerySchema, stocktakeSchema } from '../../data/validators'
import { postStocktake, stocktakeSheet } from '../../lib/owner'
import { plantErrorResponse, runPlantGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_store.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_store.adjust'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = stocktakeQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Pick the store' }, { status: 400 })
  try {
    return NextResponse.json({ items: await stocktakeSheet(ctx, parsed.data.place, parsed.data.kind ?? null) })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = stocktakeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter the counted quantity for the lots you counted' }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.stocktake', resourceId: parsed.data.place, operation: 'custom', payload: parsed.data }, () => postStocktake(ctx, parsed.data, byName))
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Owner',
  summary: 'Stocktake: the dated stock list becomes a count that posts the difference',
  methods: {
    GET: { summary: 'Lots in a store to count (?place=&kind=)', tags: ['Creative Carbon Owner'], query: stocktakeQuerySchema, responses: [{ status: 200, description: 'Lots', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Post counted quantities; differences are adjusted with the reason "stocktake"', tags: ['Creative Carbon Owner'], requestBody: { schema: stocktakeSchema }, responses: [{ status: 200, description: 'Result', schema: z.object({}).passthrough() }] },
  },
}

export { GET, POST }
