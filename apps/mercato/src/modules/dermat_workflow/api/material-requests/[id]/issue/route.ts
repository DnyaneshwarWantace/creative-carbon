import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { MaterialRequest } from '../../../../data/entities'
import { hasFeatures, resolveWorkflowRequest, withMutationGuards, workflowErrorResponse } from '../../../../lib/request'
import type { MaterialRequestIssueInput } from '../../../../commands/materialPlans'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
}

const issueSchema = z.object({
  lines: z.array(z.object({ lineId: z.string().uuid(), issuedQty: z.coerce.number().min(0) })).min(1).max(200),
})

export async function POST(req: Request, routeCtx: { params: { id: string } }) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const requestId = z.string().uuid().parse(routeCtx.params.id)
    const body = issueSchema.parse(await readJsonSafe<Record<string, unknown>>(req, {}))
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const existing = await em.findOne(MaterialRequest, { id: requestId, organizationId: scope.organizationId, tenantId: scope.tenantId, deletedAt: null })
    if (!existing) throw new CrudHttpError(404, { error: 'Request not found' })
    if (!(await hasFeatures(ctx, ['dermat_workflow.department.store']))) {
      throw new CrudHttpError(403, { error: 'Only the store can issue material', code: 'department_forbidden' })
    }
    const result = await withMutationGuards(
      req,
      ctx,
      { resourceKind: 'dermat_workflow.material_request', resourceId: requestId, operation: 'update' },
      async () => {
        const commandBus = ctx.container.resolve<CommandBus>('commandBus')
        const executed = await commandBus.execute<MaterialRequestIssueInput, { requestId: string; requestNumber: string }>(
          'dermat_workflow.material_request.issue',
          { input: { ...scope, requestId, lines: body.lines, actorName: ctx.auth?.email ?? null }, ctx },
        )
        return executed.result
      },
    )
    if (result instanceof NextResponse) return result
    return NextResponse.json(result)
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.material_requests.issue')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'Issue a material request',
  methods: {
    POST: {
      summary: 'Issue material against a request',
      description: 'The store gives the material: each line quantity is deducted from store stock (never more than is in stock) and the plan reservation for it is used up. Requires the Store department permission.',
      requestBody: { contentType: 'application/json', schema: issueSchema },
      responses: [{ status: 200, description: 'Issued', schema: z.object({ requestId: z.string(), requestNumber: z.string() }) }],
    },
  },
}
