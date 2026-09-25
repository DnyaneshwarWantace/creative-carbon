import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { suggestSchema } from '../../../data/validators'
import { suggestLines } from '../../../lib/service'
import { resolveStoreContext, storeErrorResponse } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_store.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = suggestSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'orderId and stageKey are required' }, { status: 400 })
  try {
    return NextResponse.json(await suggestLines(ctx, parsed.data.orderId, parsed.data.stageKey))
  } catch (error) {
    return storeErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Store',
  summary: 'Material an order stage needs from the store',
  methods: {
    GET: {
      summary: 'RM for Manufacturing, bottles/tubes/caps for Filling, cartons/labels for Packing, from the approved BOMs',
      tags: ['Dermat Store'],
      query: suggestSchema,
      responses: [{ status: 200, description: 'Suggested lines', schema: z.object({ rows: z.array(z.object({ productId: z.string() }).passthrough()) }).passthrough() }],
    },
  },
}

export { GET }
