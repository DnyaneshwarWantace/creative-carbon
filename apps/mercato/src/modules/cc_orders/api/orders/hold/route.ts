import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CcOrderStage } from '../../../data/entities'
import { logEvent, serializeOrder } from '../../../lib/engine'
import { OrderError, currentUserName, findOrder, resolveOrderContext } from '../../../lib/server'
import { enforceOrderLock, orderErrorResponse, runGuarded } from '../../../lib/guard'
import { notifyOrderHeld } from '../../../lib/notify'
import { requireReasonFor, reasonIssue } from '../../../../cc_audit/lib/reason'
import { recordActivity } from '../../../../cc_audit/lib/activity'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_orders.manage'] },
}

const bodySchema = z
  .object({ id: z.string().uuid(), action: z.enum(['hold', 'release']), reason: z.string().trim().max(1000).optional() })
  .superRefine(requireReasonFor(['hold', 'release']))

function hoursText(ms: number): string {
  const hours = ms / 3600_000
  return hours >= 48 ? `${Math.round(hours / 24)} days` : `${Math.max(1, Math.round(hours))} hours`
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Invalid request' }, { status: 400 })
  const reason = parsed.data.reason!.trim()
  try {
    const order = await findOrder(ctx, parsed.data.id)
    if (order.status === 'cancelled' || order.status === 'completed') throw new OrderError('This order is closed', 409)
    if (parsed.data.action === 'hold' && order.heldAt) throw new OrderError('The order is already on hold', 409)
    if (parsed.data.action === 'release' && !order.heldAt) throw new OrderError('The order is not on hold', 409)
    enforceOrderLock(order, req)
    return await runGuarded(ctx, req, { resourceId: order.id, operation: 'custom', payload: parsed.data }, async () => {
      const byName = await currentUserName(ctx)
      const stages = await ctx.em.find(CcOrderStage, { orderId: order.id, status: { $in: ['open', 'on_hold'] } })
      if (parsed.data.action === 'hold') {
        order.heldAt = new Date()
        order.holdReason = reason
        order.heldByName = byName
        logEvent(ctx, order, 'order_held', null, reason, byName)
        recordActivity(ctx.em, ctx, { recordType: 'order', recordId: order.id, action: 'held', kind: 'stage', summary: 'Order put on hold; stage clocks paused', reason, actorUserId: ctx.userId ?? null, actorName: byName })
      } else {
        const pausedMs = Date.now() - (order.heldAt as Date).getTime()
        for (const stage of stages) if (stage.openedAt) stage.openedAt = new Date(stage.openedAt.getTime() + pausedMs)
        const summary = `Released after ${hoursText(pausedMs)}; open stage clocks moved on by the same time`
        order.heldAt = null
        order.holdReason = null
        order.heldByName = null
        logEvent(ctx, order, 'order_released', null, `${reason} — ${summary}`, byName)
        recordActivity(ctx.em, ctx, { recordType: 'order', recordId: order.id, action: 'released', kind: 'stage', summary, reason, actorUserId: ctx.userId ?? null, actorName: byName })
      }
      order.updatedAt = new Date()
      await ctx.em.flush()
      await notifyOrderHeld(ctx, order, stages.map((stage) => stage.stageKey), parsed.data.action, reason, byName)
      return NextResponse.json(await serializeOrder(ctx, order))
    })
  } catch (error) {
    return orderErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Orders',
  summary: 'Put an order on hold or release it',
  methods: {
    POST: {
      summary: 'hold: stage work stops and stage clocks pause (reason needed); release: open stages get the held time back',
      tags: ['Creative Carbon Orders'],
      requestBody: { schema: bodySchema },
      responses: [{ status: 200, description: 'The order', schema: z.object({ id: z.string() }).passthrough() }],
      errors: [{ status: 409, description: 'Closed order, or already on hold / not on hold' }],
    },
  },
}

export { POST }
