import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { stageActionSchema } from '../../../data/validators'
import { DermatOrderStage } from '../../../data/entities'
import { applyStageAction, serializeOrder } from '../../../lib/engine'
import { findOrder, resolveOrderContext } from '../../../lib/server'
import { enforceOrderLock, orderErrorResponse, runGuarded } from '../../../lib/guard'
import { STORE_STAGE_KEYS, consumeForStage, type StoreStage } from '../../../../dermat_store/lib/service'
import { resolveStoreContext } from '../../../../dermat_store/lib/server'
import { releaseAllForOrder } from '../../../../dermat_planning/lib/service'
import { onProductionStageDone } from '../../../lib/productionStock'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_orders.stages'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = stageActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid stage action', details: parsed.error.flatten() }, { status: 400 })
  try {
    const order = await findOrder(ctx, parsed.data.orderId)
    if (parsed.data.action !== 'assign' && parsed.data.action !== 'save') enforceOrderLock(order, req)
    return await runGuarded(ctx, req, { resourceId: order.id, operation: 'custom', payload: parsed.data }, async () => {
      await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const fresh = await findOrder(txCtx, order.id)
        await applyStageAction(txCtx, fresh, parsed.data)
        if (fresh.status === 'completed') await releaseAllForOrder(txCtx, fresh.id, 'Order completed', null)
        await em.flush()
      })
      if (parsed.data.action === 'complete' && STORE_STAGE_KEYS.includes(parsed.data.stageKey as StoreStage)) {
        const storeCtx = await resolveStoreContext(req)
        if (!('error' in storeCtx)) {
          const stage = await ctx.em.fork().findOne(DermatOrderStage, { orderId: order.id, stageKey: parsed.data.stageKey })
          const saved = stage?.data?.batch_no ?? (await ctx.em.fork().findOne(DermatOrderStage, { orderId: order.id, stageKey: 'manufacturing' }))?.data?.batch_no
          const batchNo = typeof saved === 'string' || typeof saved === 'number' ? String(saved) : null
          await consumeForStage(storeCtx, order.id, parsed.data.stageKey, batchNo)
        }
      }
      if (parsed.data.action === 'reject_batch') {
        const storeCtx = await resolveStoreContext(req)
        if (!('error' in storeCtx)) {
          const stage = await ctx.em.fork().findOne(DermatOrderStage, { orderId: order.id, stageKey: parsed.data.stageKey })
          const rounds = Array.isArray(stage?.data?.__rework) ? (stage?.data?.__rework as Array<{ batchNo?: string | null }>) : []
          await consumeForStage(storeCtx, order.id, parsed.data.stageKey, rounds[rounds.length - 1]?.batchNo ?? null, parsed.data.note ?? 'Rejected by QC')
        }
      }
      if (parsed.data.action === 'complete' && ['manufacturing', 'filling', 'packing', 'dispatch'].includes(parsed.data.stageKey)) {
        const stockCtx = await resolveStoreContext(req)
        if (!('error' in stockCtx)) await onProductionStageDone(stockCtx, order.id, parsed.data.stageKey)
      }
      return NextResponse.json(await serializeOrder(ctx, await findOrder({ ...ctx, em: ctx.em.fork() }, order.id)))
    })
  } catch (error) {
    return orderErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Orders',
  summary: 'Work on an order stage',
  methods: {
    POST: {
      summary: 'Save, complete, hold, resume, reopen, skip or assign an order stage',
      tags: ['Dermat Orders'],
      requestBody: { schema: stageActionSchema },
      responses: [{ status: 200, description: 'The updated order', schema: z.object({ id: z.string() }).passthrough() }],
      errors: [
        { status: 400, description: 'Required fields missing or BOM not approved' },
        { status: 409, description: 'Stage not in the right state, or the order changed' },
      ],
    },
  },
}

export { POST }
