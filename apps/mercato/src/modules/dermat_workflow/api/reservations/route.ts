import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { hasFeatures, resolveWorkflowRequest, withMutationGuards, workflowErrorResponse } from '../../lib/request'
import type { ReservationCommandInput, ReservationCommandResult } from '../../commands/reservations'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
}

const requestSchema = z.object({
  action: z.enum(['reserve', 'clear']),
  orderIds: z.array(z.string().uuid()).min(1).max(50),
})

export async function POST(req: Request) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const body = requestSchema.parse(await readJsonSafe<Record<string, unknown>>(req, {}))
    if (!(await hasFeatures(ctx, ['dermat_workflow.department.planning']))) {
      throw new CrudHttpError(403, { error: 'Only Planning can reserve or clear stock', code: 'department_forbidden' })
    }
    const result = await withMutationGuards(
      req,
      ctx,
      { resourceKind: 'dermat_workflow.stock_reservation', resourceId: body.orderIds[0], operation: 'update' },
      async () => {
        const commandBus = ctx.container.resolve<CommandBus>('commandBus')
        const executed = await commandBus.execute<ReservationCommandInput, ReservationCommandResult>(
          'dermat_workflow.reservations.action',
          { input: { ...scope, ...body, actorName: ctx.auth?.email ?? null }, ctx },
        )
        return executed.result ?? { reservedLines: 0, shortMaterials: 0, released: 0 }
      },
    )
    if (result instanceof NextResponse) return result
    return NextResponse.json(result)
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.reservations')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'Reserve or clear stock for orders',
  methods: {
    POST: {
      summary: 'Reserve stock / clear reservation',
      description: 'Reserve: holds what each selected order still needs from its BOM, limited to stock not reserved by other orders — stock is not debited. Clear: releases the selected orders\' active reservations. Requires the Planning department permission.',
      requestBody: { contentType: 'application/json', schema: requestSchema },
      responses: [{ status: 200, description: 'Done', schema: z.object({ reservedLines: z.number(), shortMaterials: z.number(), released: z.number() }) }],
    },
  },
}
