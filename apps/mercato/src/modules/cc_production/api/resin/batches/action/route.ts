import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, hasFeatures } from '../../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../../cc_store/lib/server'
import { resinActionSchema } from '../../../../data/validators'
import { batchView, deleteBatch, failBatch, findBatch, postBatch, reopenBatch, signBatch } from '../../../../lib/resin'
import { plantErrorResponse, runPlantGuarded } from '../../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_production.resin.view'] },
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = resinActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Say which batch and what to do' }, { status: 400 })
  const { id, action, reason } = parsed.data
  const signing = action === 'sign_chemist' || action === 'sign_incharge'
  if (!(await hasFeatures(ctx, [signing ? 'cc_production.resin.sign' : 'cc_production.resin.enter']))) {
    return NextResponse.json({ error: signing ? 'You cannot sign resin batches' : 'You cannot post or change resin batches' }, { status: 403 })
  }
  try {
    const batch = await findBatch(ctx, id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.resin_batch', resourceId: batch.id, current: batch.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.resin_batch', resourceId: batch.id, operation: action === 'delete' ? 'delete' : 'custom', payload: parsed.data }, async () => {
      if (action === 'post') return batchView(ctx, await postBatch(ctx, batch, byName))
      if (action === 'fail') return batchView(ctx, await failBatch(ctx, batch, reason ?? '', byName))
      if (action === 'reopen') return batchView(ctx, await reopenBatch(ctx, batch, byName))
      if (action === 'delete') {
        await deleteBatch(ctx, batch, byName)
        return { ok: true }
      }
      return batchView(ctx, await signBatch(ctx, batch, action === 'sign_chemist' ? 'chemist' : 'incharge', byName))
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Resin',
  summary: 'Post, fail, reopen, sign or delete a resin batch',
  methods: {
    POST: {
      summary: 'Post (chemicals out, resin into the tank), mark failed (chemicals out as scrap), reopen within 24 h (reverses both), sign, or delete a draft',
      tags: ['Creative Carbon Resin'],
      requestBody: { schema: resinActionSchema },
      responses: [{ status: 200, description: 'Batch', schema: z.object({}).passthrough() }],
      errors: [{ status: 409, description: 'Not enough stock, already posted, too late to reopen, or changed by someone else' }],
    },
  },
}

export { POST }
