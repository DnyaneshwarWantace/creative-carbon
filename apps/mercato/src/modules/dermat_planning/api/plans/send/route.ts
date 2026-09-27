import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveOrderContext } from '../../../../dermat_orders/lib/server'
import { planSendSchema } from '../../../data/validators'
import { findPlan, planView, sendToStore } from '../../../lib/storeHandoff'
import { planningErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_planning.reserve'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = planSendSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pick the plan' }, { status: 400 })
  try {
    const plan = await findPlan(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'dermat_planning.plan', resourceId: plan.id, current: plan.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: 'dermat_planning.plan', resourceId: plan.id, operation: 'custom', payload: parsed.data }, async () => {
      await sendToStore(ctx, plan, { prepareBy: parsed.data.prepareBy ?? null, note: parsed.data.note ?? null })
      return NextResponse.json(planView(plan))
    })
  } catch (error) {
    return planningErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Planning',
  summary: 'Send a saved plan to the store so they prepare the material',
  methods: { POST: { summary: 'Send plan to store', tags: ['Dermat Planning'], requestBody: { schema: planSendSchema }, responses: [{ status: 200, description: 'Plan', schema: z.object({ id: z.string() }).passthrough() }] } },
}

export { POST }
