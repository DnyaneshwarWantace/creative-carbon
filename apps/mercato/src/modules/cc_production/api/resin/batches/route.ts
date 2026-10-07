import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { resinBatchInputSchema, resinBatchUpdateSchema, resinListSchema } from '../../../data/validators'
import { batchView, createBatch, findBatch, listBatches, updateBatch } from '../../../lib/resin'
import { plantErrorResponse, runPlantGuarded } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.resin.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_production.resin.enter'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_production.resin.enter'] },
}

function inputError(error: z.ZodError) {
  const first = error.issues[0]
  const field = first?.path.join('.') ?? ''
  if (field.startsWith('reactorId')) return 'Pick the vessel (reactor)'
  if (field.startsWith('grade')) return 'Tick one grade: PFC, PFA, PFAC or E-GLASS'
  if (field.startsWith('batchDate')) return 'Enter the batch date'
  if (field.startsWith('process')) return `Check the process readings (${field.replace('process.', '')}): times like 9:10, temperatures as numbers`
  if (field.startsWith('materials')) return 'Enter material quantities in kg'
  return `Check ${field || 'the form'}`
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = resinListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json(await batchView(ctx, await findBatch(ctx, parsed.data.id)))
    return NextResponse.json(await listBatches(ctx, parsed.data))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = resinBatchInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: inputError(parsed.error) }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.resin_batch', resourceId: 'new', operation: 'create', payload: parsed.data }, async () =>
      batchView(ctx, await createBatch(ctx, parsed.data, byName)),
    )
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = resinBatchUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: inputError(parsed.error) }, { status: 400 })
  try {
    const batch = await findBatch(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.resin_batch', resourceId: batch.id, current: batch.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.resin_batch', resourceId: batch.id, operation: 'update', payload: parsed.data }, async () =>
      batchView(ctx, await updateBatch(ctx, batch, parsed.data, byName)),
    )
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

const batchSchema = z.object({ id: z.string(), batchNo: z.string(), status: z.string() }).passthrough()

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Resin',
  summary: 'Resin batch report (CCCPL/F/QC/03)',
  methods: {
    GET: { summary: 'List resin batches, or one batch with ?id=', tags: ['Creative Carbon Resin'], query: resinListSchema, responses: [{ status: 200, description: 'Batches or one batch', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Enter a resin batch (saved as draft)', tags: ['Creative Carbon Resin'], requestBody: { schema: resinBatchInputSchema }, responses: [{ status: 201, description: 'Batch', schema: batchSchema }], errors: [{ status: 409, description: 'Batch No. already used' }] },
    PUT: { summary: 'Change a draft resin batch', tags: ['Creative Carbon Resin'], requestBody: { schema: resinBatchUpdateSchema }, responses: [{ status: 200, description: 'Batch', schema: batchSchema }], errors: [{ status: 409, description: 'Posted, or changed by someone else' }] },
  },
}

export { GET, POST, PUT }
