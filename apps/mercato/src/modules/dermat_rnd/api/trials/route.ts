import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveOrderContext } from '../../../dermat_orders/lib/server'
import { rdTrialInputSchema, rdTrialListSchema, rdTrialUpdateSchema } from '../../data/validators'
import { createTrial, findTrial, listTrials, trialView, updateTrial } from '../../lib/trials'
import { rdErrorResponse, runRdGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_rnd.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_rnd.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['dermat_rnd.manage'] },
}

const RESOURCE = 'dermat_rnd.trial'

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = rdTrialListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success || (!parsed.data.id && !parsed.data.requestId)) return NextResponse.json({ error: 'Pass a request or a trial' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json(trialView(await findTrial(ctx, parsed.data.id)))
    const trials = await listTrials(ctx, parsed.data.requestId as string)
    return NextResponse.json({ items: trials.map(trialView) })
  } catch (error) {
    return rdErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = rdTrialInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid trial' }, { status: 400 })
  try {
    const result = await runRdGuarded(ctx, req, parsed.data.requestId, 'create', parsed.data as Record<string, unknown>, async () => trialView(await createTrial(ctx, parsed.data.requestId, parsed.data.copyFrom)), RESOURCE)
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return rdErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = rdTrialUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Check the formula: every line needs a name and a % between 0 and 100' }, { status: 400 })
  try {
    const trial = await findTrial(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: RESOURCE, resourceId: trial.id, current: trial.updatedAt, request: req })
    const result = await runRdGuarded(ctx, req, trial.id, 'update', parsed.data as Record<string, unknown>, async () => {
      await updateTrial(ctx, trial, parsed.data)
      return trialView(trial)
    }, RESOURCE)
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return rdErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat R&D',
  summary: 'R&D trial batches',
  methods: {
    GET: { summary: 'Trials of a request, or one trial', tags: ['Dermat R&D'], query: rdTrialListSchema, responses: [{ status: 200, description: 'Trials', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Make a new trial batch, copying the formula of the last (or a chosen) trial', tags: ['Dermat R&D'], requestBody: { schema: rdTrialInputSchema }, responses: [{ status: 201, description: 'Trial', schema: z.object({ id: z.string() }).passthrough() }] },
    PUT: { summary: 'Edit a draft trial: batch details and formula', tags: ['Dermat R&D'], requestBody: { schema: rdTrialUpdateSchema }, responses: [{ status: 200, description: 'Trial', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { GET, POST, PUT }
