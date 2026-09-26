import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../lib/server'
import { orderErrorResponse } from '../../lib/guard'
import { batchFile, batchRegister } from '../../lib/batches'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_orders.view'] },
}

const querySchema = z.object({
  no: z.string().trim().min(1).max(80).optional(),
  q: z.string().trim().max(200).optional(),
  status: z.enum(['manufacturing', 'filling', 'packing', 'qa', 'released', 'rework', 'rejected', 'dispatched']).optional(),
})

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.no) return NextResponse.json(await batchFile(ctx, parsed.data.no))
    return NextResponse.json(await batchRegister(ctx, { q: parsed.data.q, status: parsed.data.status }))
  } catch (error) {
    return orderErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Orders',
  summary: 'Batch register',
  methods: {
    GET: {
      summary: 'Every production batch with its order, quantities, QC and QA state; pass ?no= for one batch with materials used, steps and QC checks',
      tags: ['Dermat Orders'],
      query: querySchema,
      responses: [{ status: 200, description: 'Batches or one batch file', schema: z.object({}).passthrough() }],
    },
  },
}

export { GET }
