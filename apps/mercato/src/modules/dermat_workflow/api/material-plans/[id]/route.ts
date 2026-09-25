import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { planDetail, planSaveSchema } from '../../../lib/materialPlanViews'
import { hasFeatures, resolveWorkflowRequest, withMutationGuards, workflowErrorResponse } from '../../../lib/request'
import type { MaterialPlanSaveInput } from '../../../commands/materialPlans'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
  PUT: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
}

export async function GET(req: Request, routeCtx: { params: { id: string } }) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const planId = z.string().uuid().parse(routeCtx.params.id)
    const em = ctx.container.resolve<EntityManager>('em').fork()
    return NextResponse.json(await planDetail(em, scope, planId))
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.material_plans.detail')
  }
}

export async function PUT(req: Request, routeCtx: { params: { id: string } }) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const planId = z.string().uuid().parse(routeCtx.params.id)
    const body = planSaveSchema.parse(await readJsonSafe<Record<string, unknown>>(req, {}))
    if (!(await hasFeatures(ctx, ['dermat_workflow.department.planning']))) {
      throw new CrudHttpError(403, { error: 'Only Planning can change a plan', code: 'department_forbidden' })
    }
    const result = await withMutationGuards(
      req,
      ctx,
      { resourceKind: 'dermat_workflow.material_plan', resourceId: planId, operation: 'update' },
      async () => {
        const commandBus = ctx.container.resolve<CommandBus>('commandBus')
        const executed = await commandBus.execute<MaterialPlanSaveInput, { id: string; planNumber: string }>(
          'dermat_workflow.material_plan.save',
          { input: { ...scope, ...body, planId, actorName: ctx.auth?.email ?? null }, ctx },
        )
        return executed.result
      },
    )
    if (result instanceof NextResponse) return result
    return NextResponse.json(result)
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.material_plans.update')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'One material plan',
  methods: {
    GET: {
      summary: 'Get a plan with its calculation',
      description: 'Plan header, its BOM rows, the combined RM / PM requirement against stock and reservations, and the requests sent to the stores.',
      responses: [{ status: 200, description: 'Plan', schema: z.object({ plan: z.object({ id: z.string() }).passthrough() }).passthrough() }],
    },
    PUT: {
      summary: 'Update a plan',
      description: 'Replaces the plan BOM rows. Not allowed once a store request is open for the plan.',
      requestBody: { contentType: 'application/json', schema: planSaveSchema },
      responses: [{ status: 200, description: 'Saved', schema: z.object({ id: z.string().uuid(), planNumber: z.string() }) }],
    },
  },
}
