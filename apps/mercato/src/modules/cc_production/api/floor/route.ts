import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { hasFeatures } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { ownerQuerySchema } from '../../data/validators'
import { productionFloor } from '../../lib/floor'
import { plantErrorResponse } from '../../lib/server'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['cc_production.press.view'] } }

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = ownerQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give the date' }, { status: 400 })
  try {
    const owner = await hasFeatures(ctx as never, ['cc_production.owner.view'])
    return NextResponse.json(await productionFloor(ctx, parsed.data.date, owner))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Production',
  summary: 'Production floor: every reactor, dryer and press with its state today, the live feed of entries, and (for the owner) output, plan and alerts',
  methods: { GET: { summary: 'Production floor for a date', tags: ['Creative Carbon Production'], query: ownerQuerySchema, responses: [{ status: 200, description: 'Machines, feed and figures', schema: z.object({}).passthrough() }] } },
}

export { GET }
