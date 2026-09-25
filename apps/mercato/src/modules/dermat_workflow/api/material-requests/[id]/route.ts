import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { loadRequestDetail } from '../../../lib/materialPlans'
import { serializeRequest } from '../../../lib/materialPlanViews'
import { resolveWorkflowRequest, workflowErrorResponse } from '../../../lib/request'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
}

export async function GET(req: Request, routeCtx: { params: { id: string } }) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const requestId = z.string().uuid().parse(routeCtx.params.id)
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const { request, lines, currentStock } = await loadRequestDetail(em, scope, requestId)
    return NextResponse.json({
      request: serializeRequest(request),
      lines: lines.map((line) => ({
        id: line.id,
        materialId: line.materialId,
        code: line.materialCode ?? null,
        name: line.materialName ?? null,
        unit: line.unit ?? null,
        requiredQty: Number(line.requiredQty),
        stockAtRequest: Number(line.stockAtRequest),
        currentStock: currentStock.get(line.materialId) ?? 0,
        issuedQty: line.issuedQty != null ? Number(line.issuedQty) : null,
      })),
    })
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.material_requests.detail')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'One material request',
  methods: {
    GET: {
      summary: 'Get a material request',
      description: 'Request header and lines: required quantity, stock when it was requested, current stock and issued quantity.',
      responses: [{ status: 200, description: 'Request', schema: z.object({ request: z.object({ id: z.string() }).passthrough(), lines: z.array(z.object({}).passthrough()) }) }],
    },
  },
}
