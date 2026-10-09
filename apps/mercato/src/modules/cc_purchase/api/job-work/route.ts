import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { jobWorkCreateSchema, jobWorkListSchema } from '../../data/validators'
import { createJobWork, findJobWork, jobWorkLots, jobWorkView, listJobWork } from '../../lib/jobWork'
import { purchaseErrorResponse, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_purchase.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_purchase.jobwork'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = jobWorkListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.lots) return NextResponse.json({ items: await jobWorkLots(ctx, parsed.data.q) })
    if (parsed.data.id) return NextResponse.json(jobWorkView(await findJobWork(ctx, parsed.data.id)))
    return NextResponse.json({ items: await listJobWork(ctx, parsed.data) })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = jobWorkCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the challan' }, { status: 400 })
  try {
    return await runGuarded(ctx, req, { resourceKind: 'cc_purchase.job_work', resourceId: 'new', operation: 'create', payload: parsed.data }, async () => NextResponse.json(jobWorkView(await createJobWork(ctx, parsed.data)), { status: 201 }))
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

const viewSchema = z.object({ id: z.string(), code: z.string(), status: z.string() }).passthrough()

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Purchase',
  summary: 'Job-work challans: material sent to a job worker and received back',
  methods: {
    GET: { summary: 'List challans, one by id, or (lots=1) the approved lots that can be sent', tags: ['Creative Carbon Purchase'], query: jobWorkListSchema, responses: [{ status: 200, description: 'Challans or lots', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Send lots to a job worker: makes the challan and moves the stock to "At job worker"', tags: ['Creative Carbon Purchase'], requestBody: { schema: jobWorkCreateSchema }, responses: [{ status: 201, description: 'Challan', schema: viewSchema }], errors: [{ status: 409, description: 'Lot not free, on hold or under test' }] },
  },
}

export { GET, POST }
