import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { listBomOptions } from '../../../lib/materialPlans'
import { resolveWorkflowRequest, workflowErrorResponse } from '../../../lib/request'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
}

export async function GET(req: Request) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const em = ctx.container.resolve<EntityManager>('em').fork()
    return NextResponse.json({ items: await listBomOptions(em, scope) })
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.material_plans.boms')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'BOMs available for planning',
  methods: {
    GET: {
      summary: 'List active BOMs',
      description: 'Active BOMs with their product, the pack size known from the product or BOM name, and the number of material rows.',
      responses: [{ status: 200, description: 'BOMs', schema: z.object({ items: z.array(z.object({ bomId: z.string(), bomName: z.string() }).passthrough()) }) }],
    },
  },
}
