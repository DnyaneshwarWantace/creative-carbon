import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { ownerQuerySchema, planSaveSchema } from '../../data/validators'
import { findPlan, planView, savePlan } from '../../lib/owner'
import { plantErrorResponse, runPlantGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.owner.view'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_production.plan.manage'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = ownerQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give the date' }, { status: 400 })
  return NextResponse.json(planView(await findPlan(ctx, parsed.data.date), parsed.data.date))
}

async function PUT(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = planSaveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Each plan line needs an area, a planned quantity and a unit' }, { status: 400 })
  try {
    const existing = await findPlan(ctx, parsed.data.planDate)
    if (existing) enforceCommandOptimisticLock({ resourceKind: 'cc_production.plan', resourceId: existing.id, current: existing.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.plan', resourceId: parsed.data.planDate, operation: 'update', payload: parsed.data }, async () => planView(await savePlan(ctx, parsed.data.planDate, parsed.data.lines, parsed.data.notes, byName), parsed.data.planDate))
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Owner',
  summary: 'Production plan for a day (written the day before)',
  methods: {
    GET: { summary: 'Plan for a date', tags: ['Creative Carbon Owner'], query: ownerQuerySchema, responses: [{ status: 200, description: 'Plan', schema: z.object({}).passthrough() }] },
    PUT: { summary: 'Save the plan for a date', tags: ['Creative Carbon Owner'], requestBody: { schema: planSaveSchema }, responses: [{ status: 200, description: 'Plan', schema: z.object({}).passthrough() }] },
  },
}

export { GET, PUT }
