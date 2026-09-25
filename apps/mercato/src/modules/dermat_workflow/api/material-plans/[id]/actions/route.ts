import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { hasFeatures, resolveWorkflowRequest, withMutationGuards, workflowErrorResponse } from '../../../../lib/request'
import type { MaterialPlanActionInput, MaterialPlanActionResult } from '../../../../commands/materialPlans'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
}

const actionSchema = z.object({
  action: z.enum(['reserve', 'clear', 'send_request', 'cancel_request']),
  store: z.enum(['raw_material', 'packaging_material']).nullable().optional(),
  requestId: z.string().uuid().nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
})

export async function POST(req: Request, routeCtx: { params: { id: string } }) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const planId = z.string().uuid().parse(routeCtx.params.id)
    const body = actionSchema.parse(await readJsonSafe<Record<string, unknown>>(req, {}))
    if (body.action === 'send_request' && !body.store) throw new CrudHttpError(400, { error: 'Choose the store' })
    if (body.action === 'cancel_request' && !body.requestId) throw new CrudHttpError(400, { error: 'Choose the request' })
    if (!(await hasFeatures(ctx, ['dermat_workflow.department.planning']))) {
      throw new CrudHttpError(403, { error: 'Only Planning can do this', code: 'department_forbidden' })
    }
    const result = await withMutationGuards(
      req,
      ctx,
      { resourceKind: 'dermat_workflow.material_plan', resourceId: planId, operation: 'update' },
      async () => {
        const commandBus = ctx.container.resolve<CommandBus>('commandBus')
        const executed = await commandBus.execute<MaterialPlanActionInput, MaterialPlanActionResult>(
          'dermat_workflow.material_plan.action',
          { input: { ...scope, ...body, planId, actorName: ctx.auth?.email ?? null }, ctx },
        )
        return executed.result ?? {}
      },
    )
    if (result instanceof NextResponse) return result
    return NextResponse.json(result)
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.material_plans.action')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'Material plan actions',
  methods: {
    POST: {
      summary: 'Reserve, clear, send or cancel a store request',
      description: 'reserve: hold free stock for the plan without deducting it. clear: release the plan reservation. send_request: send the plan RM or PM requirement to that store as a numbered request. cancel_request: cancel a request the store has not issued yet.',
      requestBody: { contentType: 'application/json', schema: actionSchema },
      responses: [{ status: 200, description: 'Done', schema: z.object({ requestNumber: z.string().optional() }).passthrough() }],
    },
  },
}
