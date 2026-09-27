import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { OrderError, findOrder, resolveOrderContext } from '../../../lib/server'
import { orderFile } from '../../../lib/orderFile'
import { withStageOverrides } from '../../../lib/stageSettings'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_orders.view'] },
}

const querySchema = z.object({ id: z.string().uuid() })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Order id is required' }, { status: 400 })
  try {
    const order = await findOrder(ctx, parsed.data.id)
    return await withStageOverrides(ctx, async () => NextResponse.json(await orderFile(ctx, order)))
  } catch (error) {
    if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Orders',
  summary: 'Everything connected to one order: material account (needed, reserved, issued, used), purchases and GRNs, QC results, invoices and what was made and dispatched',
  methods: {
    GET: { summary: 'Order file', tags: ['Dermat Orders'], query: querySchema, responses: [{ status: 200, description: 'Order file', schema: z.object({ materials: z.array(z.object({ productId: z.string() }).passthrough()) }).passthrough() }] },
  },
}

export { GET }
