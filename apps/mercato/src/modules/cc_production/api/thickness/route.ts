import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { finishingListSchema, thicknessInputSchema } from '../../data/validators'
import { createThickness, listThickness, thicknessView } from '../../lib/finishing'
import { plantErrorResponse, runPlantGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.quality.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_production.quality.enter'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = finishingListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  return NextResponse.json({ items: await listThickness(ctx, parsed.data.month ?? null) })
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = thicknessInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter all 12 readings in mm' }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.thickness', resourceId: parsed.data.lotId ?? 'new', operation: 'create', payload: parsed.data }, async () => thicknessView(await createThickness(ctx, parsed.data, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'Thickness inspection, 12-point grid',
  methods: {
    GET: { summary: 'List inspections (?month=)', tags: ['Creative Carbon Finishing'], query: finishingListSchema, responses: [{ status: 200, description: 'Inspections', schema: z.object({ items: z.array(z.object({}).passthrough()) }) }] },
    POST: { summary: 'Record 12 readings; hold keeps the lot out of FG', tags: ['Creative Carbon Finishing'], requestBody: { schema: thicknessInputSchema }, responses: [{ status: 201, description: 'Inspection', schema: z.object({}).passthrough() }] },
  },
}

export { GET, POST }
