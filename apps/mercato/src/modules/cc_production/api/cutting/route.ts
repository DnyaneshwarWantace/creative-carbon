import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { cuttingInputSchema, finishingListSchema } from '../../data/validators'
import { createCutting, cuttingView, listCuttings } from '../../lib/finishing'
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
  return NextResponse.json({ items: await listCuttings(ctx, parsed.data.month ?? null) })
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = cuttingInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pick the pressed lot, the cut size and enter each sheet weight' }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.cutting', resourceId: parsed.data.lotId, operation: 'create', payload: parsed.data }, async () => cuttingView(await createCutting(ctx, parsed.data, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'Cutting and trimming of pressed sheets',
  methods: {
    GET: { summary: 'List cutting entries (?month=)', tags: ['Creative Carbon Finishing'], query: finishingListSchema, responses: [{ status: 200, description: 'Entries', schema: z.object({ items: z.array(z.object({}).passthrough()) }) }] },
    POST: { summary: 'Cut and trim sheets from a pressed lot: trimmed lot in, trim loss out', tags: ['Creative Carbon Finishing'], requestBody: { schema: cuttingInputSchema }, responses: [{ status: 201, description: 'Entry', schema: z.object({}).passthrough() }] },
  },
}

export { GET, POST }
