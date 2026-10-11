import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext, storeErrorResponse } from '../../../lib/server'
import { movementDetail } from '../../../lib/stockBook'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_store.view'] },
}

const querySchema = z.object({ id: z.string().uuid() })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give the movement' }, { status: 400 })
  try {
    return NextResponse.json(await movementDetail(ctx, parsed.data.id))
  } catch (error) {
    return storeErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Store',
  summary: 'One stock movement with its document and its reversal pair',
  methods: {
    GET: { summary: 'Movement detail', tags: ['Creative Carbon Store'], query: querySchema, responses: [{ status: 200, description: 'Movement', schema: z.object({ id: z.string() }).passthrough() }], errors: [{ status: 404, description: 'Not found' }] },
  },
}

export { GET }
