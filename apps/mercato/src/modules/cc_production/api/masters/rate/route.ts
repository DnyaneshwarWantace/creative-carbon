import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../../cc_orders/lib/server'
import { plantErrorResponse } from '../../../lib/server'
import { rateHistory } from '../../../lib/rateHistory'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.prices.view'] },
}

const querySchema = z.object({ id: z.string().uuid() })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give the rate' }, { status: 400 })
  try {
    return NextResponse.json(await rateHistory(ctx, parsed.data.id))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Plant',
  summary: 'One price list rate with the quotations that used it',
  methods: {
    GET: { summary: 'Rate and quotations whose lines used this rate (or an earlier value of it) for its grade, thickness and currency', tags: ['Creative Carbon Plant'], query: querySchema, responses: [{ status: 200, description: 'Rate', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { GET }
