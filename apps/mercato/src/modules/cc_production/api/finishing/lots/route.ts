import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { allLots } from '../../../lib/finishing'
import { plantErrorResponse } from '../../../lib/server'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['cc_production.quality.view'] } }

const querySchema = z.object({ kinds: z.string().max(200).optional() })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    return NextResponse.json({ items: await allLots(ctx, parsed.data.kinds ? parsed.data.kinds.split(',') : null) })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'Every lot with stock, in any store (?kinds=laminate,moulded)',
  methods: { GET: { summary: 'Lots with stock', tags: ['Creative Carbon Finishing'], query: querySchema, responses: [{ status: 200, description: 'Lots', schema: z.object({ items: z.array(z.object({}).passthrough()) }) }] } },
}

export { GET }
