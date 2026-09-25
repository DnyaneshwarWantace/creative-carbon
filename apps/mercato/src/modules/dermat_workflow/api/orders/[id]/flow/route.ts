import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getOrderFlow } from '../../../../lib/engine'
import { resolveWorkflowRequest, workflowErrorResponse } from '../../../../lib/request'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
}

export async function GET(req: Request, routeCtx: { params: { id: string } }) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const orderId = z.string().uuid().parse(routeCtx.params.id)
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const flow = await getOrderFlow(em, scope, orderId)
    return NextResponse.json(flow)
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.orders.flow')
  }
}

const stageSchema = z.object({
  code: z.string(),
  name: z.string(),
  department: z.string(),
  kind: z.string(),
  state: z.enum(['done', 'current', 'upcoming', 'skipped']),
}).passthrough()

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'Order workflow progress',
  methods: {
    GET: {
      summary: 'Get the full stage flow of an order',
      description: 'Returns every order-level stage with its state and saved data, plus each product line\'s production batch and its Manufacturing / Filling / Packing sub-stages.',
      responses: [
        {
          status: 200,
          description: 'Order flow',
          schema: z.object({
            order: z.object({ id: z.string(), orderNumber: z.string().nullable(), currentStageCode: z.string().nullable() }).passthrough(),
            stages: z.array(stageSchema),
            lines: z.array(z.object({ lineId: z.string(), stages: z.array(stageSchema) }).passthrough()),
          }),
        },
      ],
    },
  },
}
