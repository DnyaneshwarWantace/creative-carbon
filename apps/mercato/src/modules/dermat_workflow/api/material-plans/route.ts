import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { MaterialPlan, MaterialPlanItem, MaterialRequest } from '../../data/entities'
import { planSaveSchema } from '../../lib/materialPlanViews'
import { hasFeatures, resolveWorkflowRequest, withMutationGuards, workflowErrorResponse } from '../../lib/request'
import type { MaterialPlanSaveInput } from '../../commands/materialPlans'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
}

export async function GET(req: Request) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const where = { organizationId: scope.organizationId, tenantId: scope.tenantId, deletedAt: null }
    const plans = await em.find(MaterialPlan, where, { orderBy: { createdAt: 'desc' }, limit: 100 })
    const planIds = plans.map((plan) => plan.id)
    const [items, requests] = planIds.length
      ? await Promise.all([
          em.find(MaterialPlanItem, { ...where, planId: { $in: planIds } }),
          em.find(MaterialRequest, { ...where, planId: { $in: planIds }, status: { $ne: 'cancelled' } }),
        ])
      : [[], []]
    return NextResponse.json({
      items: plans.map((plan) => {
        const planLines = items.filter((item) => item.planId === plan.id)
        return {
          id: plan.id,
          planNumber: plan.planNumber,
          name: plan.name ?? null,
          status: plan.status,
          bomNames: planLines.map((item) => item.bomName ?? ''),
          totalBulkKg: planLines.reduce((sum, item) => sum + Number(item.bulkKg), 0),
          requests: requests
            .filter((request) => request.planId === plan.id)
            .map((request) => ({ id: request.id, requestNumber: request.requestNumber, store: request.store, status: request.status })),
          createdBy: plan.createdBy ?? null,
          createdAt: plan.createdAt.toISOString(),
          updatedAt: plan.updatedAt.toISOString(),
        }
      }),
    })
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.material_plans.list')
  }
}

export async function POST(req: Request) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const body = planSaveSchema.parse(await readJsonSafe<Record<string, unknown>>(req, {}))
    if (!(await hasFeatures(ctx, ['dermat_workflow.department.planning']))) {
      throw new CrudHttpError(403, { error: 'Only Planning can create a plan', code: 'department_forbidden' })
    }
    const result = await withMutationGuards(
      req,
      ctx,
      { resourceKind: 'dermat_workflow.material_plan', resourceId: '', operation: 'create' },
      async () => {
        const commandBus = ctx.container.resolve<CommandBus>('commandBus')
        const executed = await commandBus.execute<MaterialPlanSaveInput, { id: string; planNumber: string }>(
          'dermat_workflow.material_plan.save',
          { input: { ...scope, ...body, actorName: ctx.auth?.email ?? null }, ctx },
        )
        return executed.result
      },
    )
    if (result instanceof NextResponse) return result
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.material_plans.create')
  }
}

const planSummary = z.object({
  id: z.string().uuid(),
  planNumber: z.string(),
  name: z.string().nullable(),
  status: z.string(),
  bomNames: z.array(z.string()),
  totalBulkKg: z.number(),
}).passthrough()

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'Production material plans',
  methods: {
    GET: {
      summary: 'List material plans',
      description: 'Latest 100 plans with their BOMs, total bulk kg and store requests.',
      responses: [{ status: 200, description: 'Plans', schema: z.object({ items: z.array(planSummary) }) }],
    },
    POST: {
      summary: 'Create a material plan',
      description: 'Creates a plan from several BOMs with quantities. Bulk kg is calculated from pieces × pack size when not given. Requires the Planning department permission.',
      requestBody: { contentType: 'application/json', schema: planSaveSchema },
      responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.string().uuid(), planNumber: z.string() }) }],
    },
  },
}
