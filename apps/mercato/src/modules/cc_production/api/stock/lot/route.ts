import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { lotDetail } from '../../../lib/owner'
import { plantErrorResponse } from '../../../lib/server'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['cc_store.view'] } }

const querySchema = z.object({ id: z.string().uuid() })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give the lot id' }, { status: 400 })
  try {
    return NextResponse.json(await lotDetail(ctx, parsed.data.id))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Owner',
  summary: 'One lot: where it is, what is left, and every movement in and out',
  methods: { GET: { summary: 'Lot page', tags: ['Creative Carbon Owner'], query: querySchema, responses: [{ status: 200, description: 'Lot', schema: z.object({}).passthrough() }] } },
}

export { GET }
