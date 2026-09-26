import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { stockQuerySchema } from '../../data/validators'
import { resolveStoreContext, storeErrorResponse } from '../../lib/server'
import { stockBook } from '../../lib/stockBook'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_store.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = stockQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    return NextResponse.json(await stockBook(ctx, parsed.data.place, { q: parsed.data.q, view: parsed.data.view }))
  } catch (error) {
    return storeErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Store',
  summary: 'Stock by store',
  methods: {
    GET: {
      summary: 'Stock in the RM store, PM store, production floor or FG store, per product and batch, with QC status, reservations and expiry',
      tags: ['Dermat Store'],
      query: stockQuerySchema,
      responses: [{ status: 200, description: 'Stock book', schema: z.object({ items: z.array(z.object({ productId: z.string() }).passthrough()) }).passthrough() }],
    },
  },
}

export { GET }
