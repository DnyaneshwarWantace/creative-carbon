import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { damageSchema } from '../../data/validators'
import { recordDamage } from '../../lib/finishing'
import { plantErrorResponse, runPlantGuarded } from '../../lib/server'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['cc_production.cutting.enter'] } }

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = damageSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pick the lot, enter the quantity and the reason' }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.damage', resourceId: parsed.data.lotId, operation: 'create', payload: parsed.data }, async () => {
      const record = await recordDamage(ctx, parsed.data, byName)
      return { id: record.id }
    })
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'Write off damaged material from a lot (scrap with a reason)',
  methods: { POST: { summary: 'Damaged material', tags: ['Creative Carbon Finishing'], requestBody: { schema: damageSchema }, responses: [{ status: 201, description: 'Recorded', schema: z.object({ id: z.string() }) }] } },
}

export { POST }
