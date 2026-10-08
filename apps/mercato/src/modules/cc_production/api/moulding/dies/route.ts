import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { dieAvailability, dieLookup } from '../../../lib/moulding'
import { plantErrorResponse } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.moulding.view'] },
}

const querySchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), lookup: z.string().max(2000).optional() })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success || (!parsed.data.date && !parsed.data.lookup)) return NextResponse.json({ error: 'Give a date or die numbers' }, { status: 400 })
  try {
    if (parsed.data.lookup) return NextResponse.json({ items: await dieLookup(ctx, parsed.data.lookup.split(',')) })
    return NextResponse.json(await dieAvailability(ctx, parsed.data.date!))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Moulding',
  summary: 'Die availability by shift (?date=) or die details for the grid (?lookup=500,1155)',
  methods: { GET: { summary: 'Die availability or lookup', tags: ['Creative Carbon Moulding'], query: querySchema, responses: [{ status: 200, description: 'Dies', schema: z.object({}).passthrough() }] } },
}

export { GET }
