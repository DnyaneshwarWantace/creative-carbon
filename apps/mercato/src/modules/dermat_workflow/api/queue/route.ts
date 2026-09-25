import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getQueue } from '../../lib/engine'
import { resolveWorkflowRequest, workflowErrorResponse } from '../../lib/request'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
}

const querySchema = z.object({
  department: z.string().optional(),
  phase: z.string().optional(),
  stageCode: z.string().optional(),
  search: z.string().optional(),
})

export async function GET(req: Request) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const params = Object.fromEntries(new URL(req.url).searchParams.entries())
    const filters = querySchema.parse(params)
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const items = await getQueue(em, scope, filters)
    return NextResponse.json({ items, total: items.length })
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.queue')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'Department work queue',
  methods: {
    GET: {
      summary: 'List work waiting at a department\'s stages',
      description: 'Orders and production batches currently sitting at a stage owned by the given department (optionally one production phase or stage). Search matches order number, customer, product name/code and batch number.',
      query: querySchema,
      responses: [
        {
          status: 200,
          description: 'Queue items',
          schema: z.object({ items: z.array(z.object({ key: z.string(), orderId: z.string(), stageCode: z.string() }).passthrough()), total: z.number() }),
        },
      ],
    },
  },
}
