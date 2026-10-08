import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { lotFamily } from '../../../lib/records'
import { plantErrorResponse } from '../../../lib/server'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['cc_store.view'] } }

const querySchema = z.object({ id: z.string().uuid() })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give the lot id' }, { status: 400 })
  try {
    return NextResponse.json(await lotFamily(ctx, parsed.data.id))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Owner',
  summary: 'The lot tree: parent lots back to the first one, child lots made from it, what made and used each, and the orders holding it',
  methods: { GET: { summary: 'Lot family', tags: ['Creative Carbon Owner'], query: querySchema, responses: [{ status: 200, description: 'Lot family', schema: z.object({ lotId: z.string() }).passthrough() }] } },
}

export { GET }
