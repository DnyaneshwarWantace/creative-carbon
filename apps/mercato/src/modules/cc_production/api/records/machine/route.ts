import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { machineDetail } from '../../../lib/records'
import { plantErrorResponse } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.masters.view'] },
}

const querySchema = z.object({ kind: z.enum(['reactor', 'dryer', 'press']), id: z.string().uuid() })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give the machine kind and id' }, { status: 400 })
  try {
    return NextResponse.json(await machineDetail(ctx, parsed.data.kind, parsed.data.id))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Masters',
  summary: 'One reactor, dryer or press with the last 60 days of work done on it',
  methods: { GET: { summary: 'Machine detail', tags: ['Creative Carbon Masters'], query: querySchema, responses: [{ status: 200, description: 'Machine', schema: z.object({}).passthrough() }] } },
}

export { GET }
