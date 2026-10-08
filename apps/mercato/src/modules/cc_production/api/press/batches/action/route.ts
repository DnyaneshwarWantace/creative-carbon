import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, hasFeatures } from '../../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../../cc_store/lib/server'
import { pressActionSchema } from '../../../../data/validators'
import { cancelPressBatch, findPressBatch, postPressBatch, pressBatchView, reopenPressBatch, reviewPressBatch } from '../../../../lib/press'
import { plantErrorResponse, runPlantGuarded } from '../../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_production.press.view'] },
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = pressActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Say which batch and what to do' }, { status: 400 })
  const { id, action, reason } = parsed.data
  const feature = action === 'review' ? 'cc_production.press.review' : 'cc_production.press.enter'
  if (!(await hasFeatures(ctx, [feature]))) return NextResponse.json({ error: action === 'review' ? 'You cannot review press batches' : 'You cannot change press batches' }, { status: 403 })
  try {
    const batch = await findPressBatch(ctx, id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.press_batch', resourceId: batch.id, current: batch.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.press_batch', resourceId: batch.id, operation: 'custom', payload: parsed.data }, async () => {
      if (action === 'post') return pressBatchView(ctx, await postPressBatch(ctx, batch, byName))
      if (action === 'reopen') return pressBatchView(ctx, await reopenPressBatch(ctx, batch, byName))
      if (action === 'cancel') return pressBatchView(ctx, await cancelPressBatch(ctx, batch, reason ?? '', byName))
      return pressBatchView(ctx, await reviewPressBatch(ctx, batch, byName))
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Press',
  summary: 'Post, reopen, cancel or review a press batch',
  methods: {
    POST: {
      summary: 'Post (B-stage out oldest first per grade, one pressed lot per grade + thickness), reopen (while no pressed lot is touched), cancel a draft (number stays, marked cancelled) or review',
      tags: ['Creative Carbon Press'],
      requestBody: { schema: pressActionSchema },
      responses: [{ status: 200, description: 'Batch', schema: z.object({}).passthrough() }],
      errors: [{ status: 409, description: 'Not enough B-stage, already posted, lot already used, or changed by someone else' }],
    },
  },
}

export { POST }
