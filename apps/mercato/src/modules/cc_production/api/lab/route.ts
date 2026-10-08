import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { labInputSchema, labListSchema, labUpdateSchema } from '../../data/validators'
import { findLabTest, labDetail, labView, lastLabTest, listLabTests, saveLabTest } from '../../lib/lab'
import { plantErrorResponse, runPlantGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.quality.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_production.quality.enter'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_production.quality.enter'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = labListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json(await labDetail(ctx, await findLabTest(ctx, parsed.data.id)))
    if (parsed.data.last && (parsed.data.customerName || parsed.data.itemTitle)) return NextResponse.json({ item: await lastLabTest(ctx, parsed.data.customerName ?? null, parsed.data.itemTitle ?? null) })
    return NextResponse.json({ items: await listLabTests(ctx, { month: parsed.data.month, orderId: parsed.data.orderId, result: parsed.data.result, testPoint: parsed.data.testPoint, search: parsed.data.search }) })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = labInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter the date, customer and test type' }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.lab_test', resourceId: 'new', operation: 'create', payload: parsed.data }, async () => labView(await saveLabTest(ctx, null, parsed.data, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = labUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter the date, customer and test type' }, { status: 400 })
  try {
    const row = await findLabTest(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.lab_test', resourceId: row.id, current: row.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.lab_test', resourceId: row.id, operation: 'update', payload: parsed.data }, async () => labView(await saveLabTest(ctx, row, parsed.data, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'Lab test reports (per customer specification; the report file is attached to the test)',
  methods: {
    GET: { summary: 'List (?month=), one (?id=), or the last test for a customer and item (?last=true&customerName=&itemTitle=)', tags: ['Creative Carbon Finishing'], query: labListSchema, responses: [{ status: 200, description: 'Tests', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Record a lab test', tags: ['Creative Carbon Finishing'], requestBody: { schema: labInputSchema }, responses: [{ status: 201, description: 'Test', schema: z.object({}).passthrough() }] },
    PUT: { summary: 'Change a lab test', tags: ['Creative Carbon Finishing'], requestBody: { schema: labUpdateSchema }, responses: [{ status: 200, description: 'Test', schema: z.object({}).passthrough() }] },
  },
}

export { GET, POST, PUT }
