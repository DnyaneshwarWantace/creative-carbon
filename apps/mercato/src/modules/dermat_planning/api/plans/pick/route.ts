import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../../dermat_orders/lib/server'
import { PlanningPlan } from '../../../data/entities'
import { findPlan, pickList, planView } from '../../../lib/storeHandoff'
import { planningErrorResponse } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_store.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const id = new URL(req.url).searchParams.get('id')
  try {
    if (id) {
      if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
      return NextResponse.json(await pickList(ctx, await findPlan(ctx, id)))
    }
    const plans = await ctx.em.find(PlanningPlan, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, storeStatus: { $ne: null } }, { orderBy: { sentAt: 'desc' }, limit: 100 })
    return NextResponse.json({ items: plans.map(planView) })
  } catch (error) {
    return planningErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Planning',
  summary: 'Plans sent to the store, or one plan as a pick list with batches to take (oldest expiry first)',
  methods: { GET: { summary: 'Store plans / pick list', tags: ['Dermat Planning'], responses: [{ status: 200, description: 'Plans or pick list', schema: z.object({}).passthrough() }] } },
}

export { GET }
