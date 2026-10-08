import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { bstageScrapSchema } from '../../../data/validators'
import { scrapBstage } from '../../../lib/bstage'
import { plantErrorResponse, runPlantGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_production.bstage.manage'] },
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = bstageScrapSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Write why the lot is scrapped' }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.bstage_lot', resourceId: parsed.data.lotId, operation: 'custom', payload: parsed.data }, () => scrapBstage(ctx, parsed.data, byName))
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Coating',
  summary: 'Scrap a B-stage lot (all of it, or some kg) with a reason',
  methods: { POST: { summary: 'Scrap B-stage', tags: ['Creative Carbon Coating'], requestBody: { schema: bstageScrapSchema }, responses: [{ status: 200, description: 'Lot', schema: z.object({}).passthrough() }] } },
}

export { POST }
