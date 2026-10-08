import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { traceLots } from '../../../lib/records'
import { plantErrorResponse } from '../../../lib/server'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['cc_store.view'] } }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const querySchema = z.object({ ids: z.string().max(4000) })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give lot ids (?ids=a,b)' }, { status: 400 })
  const ids = parsed.data.ids.split(',').map((id) => id.trim()).filter((id) => UUID.test(id)).slice(0, 100)
  try {
    return NextResponse.json({ items: [...(await traceLots(ctx, ids)).values()] })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Owner',
  summary: 'For each lot: the document that made it and every document that used it',
  methods: { GET: { summary: 'Lot trace', tags: ['Creative Carbon Owner'], query: querySchema, responses: [{ status: 200, description: 'Traces', schema: z.object({ items: z.array(z.object({ lotId: z.string() }).passthrough()) }) }] } },
}

export { GET }
