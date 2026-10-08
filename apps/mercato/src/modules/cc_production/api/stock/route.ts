import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { stockGridSchema } from '../../data/validators'
import { stockGrid } from '../../lib/owner'
import { plantErrorResponse } from '../../lib/server'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['cc_store.view'] } }

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = stockGridSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    return NextResponse.json(await stockGrid(ctx, parsed.data))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Owner',
  summary: 'One stock grid for every type and store: kg, nos, lots, oldest lot age, reorder flag',
  methods: { GET: { summary: 'Stock grid (?kind=&place=&q=)', tags: ['Creative Carbon Owner'], query: stockGridSchema, responses: [{ status: 200, description: 'Grid', schema: z.object({}).passthrough() }] } },
}

export { GET }
