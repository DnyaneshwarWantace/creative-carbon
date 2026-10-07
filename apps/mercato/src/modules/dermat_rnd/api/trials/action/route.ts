import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { hasFeatures, resolveOrderContext } from '../../../../dermat_orders/lib/server'
import { rdTrialActionSchema } from '../../../data/validators'
import { actOnTrial, findTrial, trialView } from '../../../lib/trials'
import { rdErrorResponse, runRdGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_rnd.manage'] },
}

const RESOURCE = 'dermat_rnd.trial'

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = rdTrialActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  if (parsed.data.action === 'make_bom' && !(await hasFeatures(ctx, ['dermat_boms.manage']))) return NextResponse.json({ error: 'Only someone who can create BOMs can do this' }, { status: 403 })
  try {
    const trial = await findTrial(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: RESOURCE, resourceId: trial.id, current: trial.updatedAt, request: req })
    const result = await runRdGuarded(ctx, req, trial.id, 'update', parsed.data as Record<string, unknown>, async () => {
      const outcome = await actOnTrial(ctx, trial, parsed.data)
      return { ...trialView(trial), bomId: outcome.bomId ?? null }
    }, RESOURCE)
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return rdErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat R&D',
  summary: 'Move an R&D trial',
  methods: {
    POST: { summary: 'Send for testing, record the lab result, run stability, approve, reject, reopen, or make the BOM', tags: ['Dermat R&D'], requestBody: { schema: rdTrialActionSchema }, responses: [{ status: 200, description: 'Trial', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { POST }
