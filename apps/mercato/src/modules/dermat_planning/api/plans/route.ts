import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../dermat_orders/lib/server'
import { PlanningPlan } from '../../data/entities'
import { planInputSchema, planUpdateSchema } from '../../data/validators'
import { PlanningError, nextPlanCode } from '../../lib/service'
import { planningErrorResponse, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_planning.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_planning.reserve'] },
  PUT: { requireAuth: true, requireFeatures: ['dermat_planning.reserve'] },
  DELETE: { requireAuth: true, requireFeatures: ['dermat_planning.reserve'] },
}

const RESOURCE = 'dermat_planning.plan'

function view(plan: PlanningPlan) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    notes: plan.notes ?? null,
    items: plan.items ?? [],
    createdByName: plan.createdByName ?? null,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  }
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const id = new URL(req.url).searchParams.get('id')
  const plans = await ctx.em.find(PlanningPlan, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, ...(id ? { id } : {}) }, { orderBy: { updatedAt: 'desc' }, limit: 100 })
  if (id) return plans[0] ? NextResponse.json(view(plans[0])) : NextResponse.json({ error: 'Plan not found' }, { status: 404 })
  return NextResponse.json({ items: plans.map(view) })
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = planInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Name the plan' }, { status: 400 })
  try {
    return await runGuarded(ctx, req, { resourceKind: RESOURCE, resourceId: 'new', operation: 'create', payload: parsed.data }, async () => {
      const plan = ctx.em.create(PlanningPlan, {
        organizationId: ctx.organizationId,
        tenantId: ctx.tenantId,
        code: await nextPlanCode(ctx),
        name: parsed.data.name,
        notes: parsed.data.notes ?? null,
        items: parsed.data.items,
        createdByName: await currentUserName(ctx),
      })
      ctx.em.persist(plan)
      await ctx.em.flush()
      return NextResponse.json(view(plan), { status: 201 })
    })
  } catch (error) {
    return planningErrorResponse(error)
  }
}

async function findPlan(ctx: Parameters<typeof nextPlanCode>[0], id: string) {
  const plan = await ctx.em.findOne(PlanningPlan, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!plan) throw new PlanningError('Plan not found', 404)
  return plan
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = planUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Name the plan' }, { status: 400 })
  try {
    const plan = await findPlan(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: RESOURCE, resourceId: plan.id, current: plan.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: RESOURCE, resourceId: plan.id, operation: 'update', payload: parsed.data }, async () => {
      plan.name = parsed.data.name
      plan.notes = parsed.data.notes ?? null
      plan.items = parsed.data.items
      plan.updatedAt = new Date()
      await ctx.em.flush()
      return NextResponse.json(view(plan))
    })
  } catch (error) {
    return planningErrorResponse(error)
  }
}

async function DELETE(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  try {
    const plan = await findPlan(ctx, id)
    enforceCommandOptimisticLock({ resourceKind: RESOURCE, resourceId: plan.id, current: plan.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: RESOURCE, resourceId: plan.id, operation: 'delete', payload: { id } }, async () => {
      plan.deletedAt = new Date()
      await ctx.em.flush()
      return NextResponse.json({ ok: true })
    })
  } catch (error) {
    return planningErrorResponse(error)
  }
}

const planSchema = z.object({ id: z.string(), code: z.string(), name: z.string() }).passthrough()

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Planning',
  summary: 'Saved plans',
  methods: {
    GET: { summary: 'List saved plans or one plan', tags: ['Dermat Planning'], responses: [{ status: 200, description: 'Plans', schema: z.object({ items: z.array(planSchema) }).or(planSchema) }] },
    POST: { summary: 'Save a plan (picked orders / BOMs and quantities)', tags: ['Dermat Planning'], requestBody: { schema: planInputSchema }, responses: [{ status: 201, description: 'Saved', schema: planSchema }] },
    PUT: { summary: 'Update a saved plan', tags: ['Dermat Planning'], requestBody: { schema: planUpdateSchema }, responses: [{ status: 200, description: 'Saved', schema: planSchema }] },
    DELETE: { summary: 'Delete a saved plan', tags: ['Dermat Planning'], responses: [{ status: 200, description: 'Deleted', schema: z.object({ ok: z.boolean() }) }] },
  },
}

export { GET, POST, PUT, DELETE }
