import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { parseBooleanToken } from '@open-mercato/shared/lib/boolean'
import { resolveOrderContext } from '../../../cc_orders/lib/server'
import { reorderSuggestions } from '../../lib/reorder'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_purchase.view'] },
}

const querySchema = z.object({ all: z.string().optional() })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  return NextResponse.json(await reorderSuggestions(ctx, { all: parseBooleanToken(parsed.data.all ?? '') === true }))
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Purchase',
  summary: 'Reorder-level suggestions (stock + open POs + open indents against each item’s reorder level; not from orders)',
  methods: {
    GET: { summary: 'Items at or below reorder level (?all=true lists every item with a reorder level)', tags: ['Creative Carbon Purchase'], query: querySchema, responses: [{ status: 200, description: 'Suggestions', schema: z.object({ items: z.array(z.object({}).passthrough()), below: z.number() }) }] },
  },
}

export { GET }
