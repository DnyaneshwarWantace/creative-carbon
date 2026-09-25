import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { MaterialRequest, MaterialRequestLine } from '../../data/entities'
import { serializeRequest } from '../../lib/materialPlanViews'
import { resolveWorkflowRequest, workflowErrorResponse } from '../../lib/request'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
}

const querySchema = z.object({
  store: z.enum(['raw_material', 'packaging_material']).optional(),
  status: z.enum(['requested', 'issued', 'cancelled']).optional(),
})

export async function GET(req: Request) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const params = new URL(req.url).searchParams
    const query = querySchema.parse({ store: params.get('store') || undefined, status: params.get('status') || undefined })
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const where: Record<string, unknown> = { organizationId: scope.organizationId, tenantId: scope.tenantId, deletedAt: null }
    if (query.store) where.store = query.store
    if (query.status) where.status = query.status
    const requests = await em.find(MaterialRequest, where, { orderBy: { createdAt: 'desc' }, limit: 100 })
    const lines = requests.length
      ? await em.find(MaterialRequestLine, { requestId: { $in: requests.map((request) => request.id) }, deletedAt: null })
      : []
    return NextResponse.json({
      items: requests.map((request) => {
        const own = lines.filter((line) => line.requestId === request.id)
        return {
          ...serializeRequest(request),
          lineCount: own.length,
          shortLines: own.filter((line) => Number(line.requiredQty) > Number(line.stockAtRequest)).length,
        }
      }),
    })
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.material_requests.list')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'Store material requests',
  methods: {
    GET: {
      summary: 'List material requests',
      description: 'Requests sent from planning to the RM or PM store, newest first. Filter with ?store= and ?status=.',
      query: querySchema,
      responses: [{ status: 200, description: 'Requests', schema: z.object({ items: z.array(z.object({ id: z.string() }).passthrough()) }) }],
    },
  },
}
