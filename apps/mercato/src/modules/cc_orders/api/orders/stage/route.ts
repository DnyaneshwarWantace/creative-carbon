import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { stageActionSchema } from '../../../data/validators'
import { CcOrderStage } from '../../../data/entities'
import { applyStageAction, serializeOrder } from '../../../lib/engine'
import { currentUserName, findOrder, hasFeatures, resolveOrderContext } from '../../../lib/server'
import { notifyAssigned, notifyStagesOpened, notifyStagesPaused } from '../../../lib/notify'
import { canSeeMoney } from '../../../lib/money'
import { stageDef, stageWorkFeature } from '../../../lib/stages'
import { enforceOrderLock, orderErrorResponse, runGuarded } from '../../../lib/guard'
import { withStageOverrides } from '../../../lib/stageSettings'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_orders.stages'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return withStageOverrides(ctx, async () => {
    const parsed = stageActionSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Invalid stage action', details: parsed.error.flatten() }, { status: 400 })
    const money = await canSeeMoney(ctx)
    const reopenAnyTime = parsed.data.action === 'revert' && (await hasFeatures(ctx, ['cc_orders.reopen']))
    const allowed =
      reopenAnyTime ||
      (await hasFeatures(ctx, [stageWorkFeature(parsed.data.stageKey)])) ||
      ((parsed.data.action === 'assign' || parsed.data.action === 'delivered') && (await hasFeatures(ctx, ['cc_orders.manage'])))
    if (!allowed) {
      const def = stageDef(parsed.data.stageKey)
      return NextResponse.json({ error: `Only the ${def?.department ?? 'responsible'} department can work on ${def?.label ?? 'this stage'}` }, { status: 403 })
    }
    try {
      const order = await findOrder(ctx, parsed.data.orderId)
      const before = await ctx.em.fork().find(CcOrderStage, { orderId: order.id })
      const statusBefore = new Map(before.map((stage) => [stage.stageKey, stage.status]))
      let paused: string[] = []
      if (parsed.data.action !== 'assign' && parsed.data.action !== 'save') enforceOrderLock(order, req)
      return await runGuarded(ctx, req, { resourceId: order.id, operation: 'custom', payload: parsed.data }, async () => {
        await ctx.em.transactional(async (em) => {
          const txCtx = { ...ctx, em: em as EntityManager }
          const fresh = await findOrder(txCtx, order.id)
          paused = await applyStageAction(txCtx, fresh, parsed.data, { reopenAnyTime, money })
          await em.flush()
        })
        const freshCtx = { ...ctx, em: ctx.em.fork() }
        const freshOrder = await findOrder(freshCtx, order.id)
        const after = await freshCtx.em.find(CcOrderStage, { orderId: order.id })
        const opened = after.filter((stage) => stage.status === 'open' && statusBefore.get(stage.stageKey) !== 'open' && statusBefore.get(stage.stageKey) !== 'on_hold').map((stage) => stage.stageKey)
        await notifyStagesOpened(ctx, freshOrder, opened)
        if (parsed.data.action === 'revert') await notifyStagesPaused(ctx, freshOrder, parsed.data.stageKey, paused, parsed.data.note ?? '', await currentUserName(ctx))
        if (parsed.data.action === 'assign' && parsed.data.responsibleUserId && parsed.data.responsibleUserId !== ctx.userId) {
          await notifyAssigned(ctx, freshOrder, parsed.data.stageKey, parsed.data.responsibleUserId, await currentUserName(ctx))
        }
        return NextResponse.json(await serializeOrder(freshCtx, freshOrder))
      })
    } catch (error) {
      return orderErrorResponse(error)
    }
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Orders',
  summary: 'Work on an order stage',
  methods: {
    POST: {
      summary: 'Save, complete, hold, resume, reopen, skip or assign an order stage',
      tags: ['Creative Carbon Orders'],
      requestBody: { schema: stageActionSchema },
      responses: [{ status: 200, description: 'The updated order', schema: z.object({ id: z.string() }).passthrough() }],
      errors: [
        { status: 400, description: 'Required fields, steps or documents missing' },
        { status: 409, description: 'Stage not in the right state, or the order changed' },
      ],
    },
  },
}

export { POST }
