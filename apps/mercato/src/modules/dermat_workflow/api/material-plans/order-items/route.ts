import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { planItemsFromOrders } from '../../../lib/materialPlans'
import { resolveWorkflowRequest, workflowErrorResponse } from '../../../lib/request'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
}

export async function GET(req: Request) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const raw = new URL(req.url).searchParams.get('orderIds') ?? ''
    const orderIds = z.array(z.string().uuid()).min(1).max(50).parse(raw.split(',').filter(Boolean))
    const em = ctx.container.resolve<EntityManager>('em').fork()
    return NextResponse.json({ items: await planItemsFromOrders(em, scope, orderIds) })
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.material_plans.order_items')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'Plan rows from orders',
  methods: {
    GET: {
      summary: 'Build plan rows from orders',
      description: 'For ?orderIds=a,b returns one plan row per product line and BOM with pieces and pack size prefilled.',
      query: z.object({ orderIds: z.string() }),
      responses: [{ status: 200, description: 'Rows', schema: z.object({ items: z.array(z.object({ bomId: z.string() }).passthrough()) }) }],
    },
  },
}
