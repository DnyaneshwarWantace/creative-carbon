import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { dieDetail } from '../../../lib/records'
import { plantErrorResponse } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.masters.view'] },
}

const querySchema = z.object({ id: z.string().uuid() })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give the die id' }, { status: 400 })
  try {
    return NextResponse.json(await dieDetail(ctx, parsed.data.id))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Masters',
  summary: 'One mould or die: its master row, the moulded product, open orders for it and every moulding entry on it',
  methods: { GET: { summary: 'Die detail', tags: ['Creative Carbon Masters'], query: querySchema, responses: [{ status: 200, description: 'Die', schema: z.object({}).passthrough() }] } },
}

export { GET }
