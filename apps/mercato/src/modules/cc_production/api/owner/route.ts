import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { ownerQuerySchema } from '../../data/validators'
import { ownerOverview } from '../../lib/owner'
import { plantErrorResponse } from '../../lib/server'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['cc_production.owner.view'] } }

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = ownerQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give the date' }, { status: 400 })
  try {
    return NextResponse.json(await ownerOverview(ctx, parsed.data.date))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Owner',
  summary: "Owner's overview: produced today, against plan and order shortfall, breakdowns",
  methods: { GET: { summary: 'Owner overview for a date', tags: ['Creative Carbon Owner'], query: ownerQuerySchema, responses: [{ status: 200, description: 'Overview', schema: z.object({}).passthrough() }] } },
}

export { GET }
