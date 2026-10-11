import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext, storeErrorResponse } from '../../lib/server'
import { adjustmentView, findAdjustment, listAdjustments } from '../../lib/adjustments'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_store.view'] },
}

const querySchema = z.object({ id: z.string().uuid().optional(), status: z.enum(['pending', 'posted', 'rejected', 'reversed', 'all']).default('all') })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json(await adjustmentView(ctx, await findAdjustment(ctx, parsed.data.id)))
    return NextResponse.json({ items: await listAdjustments(ctx, parsed.data.status) })
  } catch (error) {
    return storeErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Store',
  summary: 'Store adjustments (stock added, removed or moved by hand)',
  methods: {
    GET: { summary: 'One adjustment (id) or the list', tags: ['Creative Carbon Store'], query: querySchema, responses: [{ status: 200, description: 'Adjustments', schema: z.object({}).passthrough() }] },
  },
}

export { GET }
