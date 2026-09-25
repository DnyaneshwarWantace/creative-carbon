import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { listDefinitions } from '../../lib/engine'
import { hasFeatures, resolveWorkflowRequest, withMutationGuards, workflowErrorResponse } from '../../lib/request'
import type { StageActionCommandInput, StageActionCommandResult } from '../../commands/stages'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
}

const requestSchema = z.object({
  action: z.enum(['save', 'complete', 'skip', 'revert']),
  orderId: z.string().uuid(),
  subjectType: z.enum(['order', 'order_line']),
  subjectId: z.string().uuid(),
  stageCode: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional(),
  reason: z.string().max(2000).optional().nullable(),
})

export async function POST(req: Request) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const body = requestSchema.parse(await readJsonSafe<Record<string, unknown>>(req, {}))
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const definitions = await listDefinitions(em, scope)
    const definition = definitions.find((candidate) => candidate.code === body.stageCode && candidate.subjectType === body.subjectType)
    if (!definition) throw new CrudHttpError(400, { error: 'Unknown stage' })
    const allowed = await hasFeatures(ctx, [`dermat_workflow.department.${definition.department}`])
    if (!allowed) {
      throw new CrudHttpError(403, { error: `You do not have permission to work on ${definition.name}`, code: 'department_forbidden' })
    }
    const result = await withMutationGuards(
      req,
      ctx,
      { resourceKind: 'dermat_workflow.stage_run', resourceId: body.subjectId, operation: 'update' },
      async () => {
        const commandBus = ctx.container.resolve<CommandBus>('commandBus')
        const executed = await commandBus.execute<StageActionCommandInput, StageActionCommandResult>(
          'dermat_workflow.stage.action',
          {
            input: {
              ...scope,
              action: body.action,
              orderId: body.orderId,
              subjectType: body.subjectType,
              subjectId: body.subjectId,
              stageCode: body.stageCode,
              data: body.data,
              reason: body.reason ?? null,
              actorName: ctx.auth?.email ?? null,
            },
            ctx,
          },
        )
        return executed.result ?? { ok: true as const, stageCode: null }
      },
    )
    if (result instanceof NextResponse) return result
    return NextResponse.json(result)
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.stage_action')
  }
}

const errorSchema = z.object({ error: z.string(), code: z.string().optional() })

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'Save, complete, skip or revert a stage',
  methods: {
    POST: {
      summary: 'Stage action',
      description: 'Saves stage data as a draft, completes the stage (required fields and QC results are validated, then the work moves to the next stage), skips an optional stage, or reverts to the previous stage with a mandatory reason. Requires the department permission of the stage.',
      requestBody: { contentType: 'application/json', schema: requestSchema },
      responses: [{ status: 200, description: 'Action applied', schema: z.object({ ok: z.boolean(), stageCode: z.string().nullable() }) }],
      errors: [
        { status: 403, description: 'No permission for this department', schema: errorSchema },
        { status: 409, description: 'Stage is not current', schema: errorSchema },
        { status: 422, description: 'Required fields missing, QC failed, or revert reason missing', schema: errorSchema },
      ],
    },
  },
}
