import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { mouldingSetup } from '../../../lib/moulding'
import { plantErrorResponse } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.moulding.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  try {
    return NextResponse.json(await mouldingSetup(ctx))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Moulding',
  summary: 'What the moulding register needs: machines, operators, chindi and cloth items',
  methods: { GET: { summary: 'Moulding setup', tags: ['Creative Carbon Moulding'], responses: [{ status: 200, description: 'Setup', schema: z.object({}).passthrough() }] } },
}

export { GET }
