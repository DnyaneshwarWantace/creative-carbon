import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { readJsonSafe } from '@open-mercato/shared/lib/http/readJsonSafe'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { calculatePlan } from '../../../lib/materialPlans'
import { planItemSchema } from '../../../lib/materialPlanViews'
import { resolveWorkflowRequest, workflowErrorResponse } from '../../../lib/request'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_workflow.view'] },
}

const calculateSchema = z.object({
  planId: z.string().uuid().nullable().optional(),
  items: z.array(planItemSchema).max(100),
})

export async function POST(req: Request) {
  try {
    const { ctx, scope } = await resolveWorkflowRequest(req)
    const body = calculateSchema.parse(await readJsonSafe<Record<string, unknown>>(req, {}))
    const em = ctx.container.resolve<EntityManager>('em').fork()
    return NextResponse.json(await calculatePlan(em, scope, body.items, body.planId ?? null))
  } catch (err) {
    return workflowErrorResponse(err, 'dermat_workflow.material_plans.calculate')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'DermatWorkflow',
  summary: 'Calculate a plan requirement',
  methods: {
    POST: {
      summary: 'Calculate RM / PM need for BOM rows',
      description: 'Read-only: adds up the material of every BOM row (per 100 kg BOM × bulk kg) and compares it with store stock, reservations and pending purchase orders. Nothing is saved.',
      requestBody: { contentType: 'application/json', schema: calculateSchema },
      responses: [{ status: 200, description: 'Calculation', schema: z.object({ items: z.array(z.object({}).passthrough()), materials: z.array(z.object({}).passthrough()) }).passthrough() }],
    },
  },
}
