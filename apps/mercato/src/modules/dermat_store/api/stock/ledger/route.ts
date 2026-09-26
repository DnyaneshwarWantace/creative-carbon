import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { ledgerQuerySchema } from '../../../data/validators'
import { resolveStoreContext, storeErrorResponse } from '../../../lib/server'
import { stockLedger } from '../../../lib/stockBook'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_store.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = ledgerQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    const { page, pageSize, place, productId } = parsed.data
    const result = await stockLedger(ctx, { place, productId, limit: pageSize, offset: (page - 1) * pageSize })
    return NextResponse.json({ ...result, page, pageSize })
  } catch (error) {
    return storeErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Store',
  summary: 'Stock ledger',
  methods: {
    GET: {
      summary: 'Every stock movement (received, issued, used, adjusted, moved), newest first',
      tags: ['Dermat Store'],
      query: ledgerQuerySchema,
      responses: [{ status: 200, description: 'Movements', schema: z.object({ items: z.array(z.object({ id: z.string() }).passthrough()), hasMore: z.boolean() }).passthrough() }],
    },
  },
}

export { GET }
