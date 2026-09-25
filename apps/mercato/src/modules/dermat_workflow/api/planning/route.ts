import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { buildPlanning } from '../../lib/planning'
import { resolveWorkflowRequest, workflowErrorResponse } from '../../lib/request'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
}

const querySchema = z.object({
  orderIds: z
    .string()
    .transform((value) => value.split(',').map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).min(1).max(50)),
})

export async function GET(req: Request) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const { orderIds } = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams.entries()))
    const em = ctx.container.resolve<EntityManager>('em').fork()
    return NextResponse.json(await buildPlanning(em, scope, orderIds))
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.planning')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'Material planning for orders',
  methods: {
    GET: {
      summary: 'Material requirement for one or more orders',
      description: 'Explodes each order line through its product BOMs (bulk KG from pack size, plus wastage), adds shared materials together, and returns per material: required, stock, reserved for the selected orders, reserved by other orders, available, pending from vendor and to be ordered.',
      query: z.object({ orderIds: z.string().describe('Comma-separated order ids') }),
      responses: [{ status: 200, description: 'Planning', schema: z.object({ orders: z.array(z.any()), materials: z.array(z.any()), warnings: z.array(z.string()) }) }],
    },
  },
}
