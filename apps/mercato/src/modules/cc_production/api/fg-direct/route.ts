import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { directInSchema, finishingListSchema } from '../../data/validators'
import { createDirectIn, listDirectAndDamage } from '../../lib/finishing'
import { plantErrorResponse, runPlantGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.quality.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_production.cutting.enter'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = finishingListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  return NextResponse.json(await listDirectAndDamage(ctx, parsed.data.month ?? null))
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = directInSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter supplier, item and kg' }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.fg_direct_in', resourceId: parsed.data.productId, operation: 'create', payload: parsed.data }, async () => {
      const record = await createDirectIn(ctx, parsed.data, byName)
      return { id: record.id, lotId: record.lotId ?? null, lotNumber: record.lotNumber ?? null }
    })
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'Bought-in finished goods straight into the FG store, and the list of damaged material',
  methods: {
    GET: { summary: 'Bought-in and damaged (?month=)', tags: ['Creative Carbon Finishing'], query: finishingListSchema, responses: [{ status: 200, description: 'Lists', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Receive bought-in goods into the FG store', tags: ['Creative Carbon Finishing'], requestBody: { schema: directInSchema }, responses: [{ status: 201, description: 'Lot', schema: z.object({}).passthrough() }] },
  },
}

export { GET, POST }
