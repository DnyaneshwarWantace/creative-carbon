import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../lib/server'
import { orderErrorResponse } from '../../lib/guard'
import { dispatchRegister } from '../../lib/dispatches'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_orders.view'] },
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const querySchema = z.object({ view: z.enum(['ready', 'done', 'all']).default('all'), q: z.string().trim().max(200).optional(), from: isoDate.optional(), to: isoDate.optional() })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    return NextResponse.json(await dispatchRegister(ctx, parsed.data))
  } catch (error) {
    return orderErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Orders',
  summary: 'Dispatch register',
  methods: {
    GET: {
      summary: 'Orders ready to dispatch and every dispatch with invoice, transporter, LR, vehicle, e-way bill and delivery',
      tags: ['Dermat Orders'],
      query: querySchema,
      responses: [{ status: 200, description: 'Dispatches', schema: z.object({ items: z.array(z.object({ orderId: z.string() }).passthrough()) }).passthrough() }],
    },
  },
}

export { GET }
