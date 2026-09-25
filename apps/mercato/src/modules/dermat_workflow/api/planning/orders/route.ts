import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { listDefinitions, normalizeOrderStageCode } from '../../../lib/engine'
import { planningCandidates } from '../../../lib/planning'
import { resolveWorkflowRequest, workflowErrorResponse } from '../../../lib/request'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
}

export async function GET(req: Request) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const definitions = await listDefinitions(em, scope)
    const orderDefs = definitions.filter((definition) => definition.subjectType === 'order').sort((a, b) => a.sequence - b.sequence)
    const codes = orderDefs.map((definition) => definition.code)
    const names = new Map(orderDefs.map((definition) => [definition.code, definition.name]))
    const lastCode = codes[codes.length - 1]
    const rows = await planningCandidates(em, scope)
    const items = rows
      .map((row) => {
        const stageCode = normalizeOrderStageCode(row.stage, codes) ?? codes[0] ?? null
        return {
          orderId: row.id,
          orderNumber: row.order_number,
          stageCode,
          stageName: stageCode ? names.get(stageCode) ?? stageCode : null,
          reservedQuantity: Number(row.reserved) || 0,
        }
      })
      .filter((row) => row.stageCode !== lastCode)
    return NextResponse.json({ items })
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.planning.orders')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'Orders available for planning',
  methods: {
    GET: {
      summary: 'List open orders for material planning',
      description: 'Every order not yet dispatched, with its current stage and how much stock is already reserved for it.',
      responses: [{ status: 200, description: 'Orders', schema: z.object({ items: z.array(z.object({ orderId: z.string(), orderNumber: z.string().nullable() }).passthrough()) }) }],
    },
  },
}
