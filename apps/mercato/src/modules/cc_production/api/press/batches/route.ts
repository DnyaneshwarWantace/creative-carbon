import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { pressBatchInputSchema, pressBatchUpdateSchema, pressListSchema } from '../../../data/validators'
import { createPressBatch, findPressBatch, listPressBatches, pressBatchView, updatePressBatch } from '../../../lib/press'
import { plantErrorResponse, runPlantGuarded } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.press.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_production.press.enter'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_production.press.enter'] },
}

function inputError(error: z.ZodError) {
  const path = error.issues[0]?.path ?? []
  if (path[0] === 'daylights') return `Daylight ${typeof path[1] === 'number' ? path[1] + 1 : ''}: check ${String(path[4] ?? path[2] ?? 'the sheets')} (thickness, count, loading weight and grade are needed)`
  if (path[0] === 'pressId') return 'Pick the press'
  if (path[0] === 'batchDate') return 'Enter the date'
  return 'Check the batch'
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = pressListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json(await pressBatchView(ctx, await findPressBatch(ctx, parsed.data.id)))
    return NextResponse.json({ items: await listPressBatches(ctx, parsed.data) })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = pressBatchInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: inputError(parsed.error) }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.press_batch', resourceId: 'new', operation: 'create', payload: parsed.data }, async () => pressBatchView(ctx, await createPressBatch(ctx, parsed.data, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = pressBatchUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: inputError(parsed.error) }, { status: 400 })
  try {
    const batch = await findPressBatch(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.press_batch', resourceId: batch.id, current: batch.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.press_batch', resourceId: batch.id, operation: 'update', payload: parsed.data }, async () => pressBatchView(ctx, await updatePressBatch(ctx, batch, parsed.data, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

const batchSchema = z.object({ id: z.string(), batchNo: z.string(), status: z.string() }).passthrough()

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Press',
  summary: 'Press batches (daily production batch report CCCPL/F/PRP/02 + press loading register)',
  methods: {
    GET: { summary: 'List press batches (?date=, ?month=, ?pressId=) or one (?id=)', tags: ['Creative Carbon Press'], query: pressListSchema, responses: [{ status: 200, description: 'Batches', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Enter a press batch (gets the next F/NN/MM/YYYY)', tags: ['Creative Carbon Press'], requestBody: { schema: pressBatchInputSchema }, responses: [{ status: 201, description: 'Batch', schema: batchSchema }] },
    PUT: { summary: 'Change a press batch that is not posted', tags: ['Creative Carbon Press'], requestBody: { schema: pressBatchUpdateSchema }, responses: [{ status: 200, description: 'Batch', schema: batchSchema }], errors: [{ status: 409, description: 'Posted, other month, or changed by someone else' }] },
  },
}

export { GET, POST, PUT }
