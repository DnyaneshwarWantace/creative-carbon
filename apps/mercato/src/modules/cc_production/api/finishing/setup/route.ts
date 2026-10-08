import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { finishingSetup } from '../../../lib/finishing'
import { plantErrorResponse } from '../../../lib/server'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['cc_production.quality.view'] } }

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  try {
    return NextResponse.json(await finishingSetup(ctx))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'Pressed and moulded lots on the shop floor, cut sizes, rejection reasons, lab lists',
  methods: { GET: { summary: 'Finishing setup', tags: ['Creative Carbon Finishing'], responses: [{ status: 200, description: 'Setup', schema: z.object({}).passthrough() }] } },
}

export { GET }
