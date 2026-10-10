import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { logEvent, serializeOrder } from '../../../lib/engine'
import { OrderError, currentUserName, findOrder } from '../../../lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { releaseAllForOrder } from '../../../lib/fulfilment'
import { enforceOrderLock, orderErrorResponse, runGuarded } from '../../../lib/guard'
import { logCorrection } from '../../../../cc_audit/lib/activity'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_orders.manage'] },
}

const bodySchema = z.object({ id: z.string().uuid(), reason: z.string().trim().min(1).max(1000) })

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Write why the order is cancelled' }, { status: 400 })
  try {
    const order = await findOrder(ctx, parsed.data.id)
    if (order.status === 'completed') throw new OrderError('A dispatched order cannot be cancelled', 409)
    if (order.status === 'cancelled') throw new OrderError('Order is already cancelled', 409)
    enforceOrderLock(order, req)
    return await runGuarded(ctx, req, { resourceId: order.id, operation: 'custom', payload: parsed.data }, async () => {
      order.status = 'cancelled'
      order.updatedAt = new Date()
      const byName = await currentUserName(ctx)
      logEvent(ctx, order, 'cancelled', null, parsed.data.reason, byName)
      await logCorrection(ctx, { recordType: 'order', recordId: order.id, action: 'cancelled', summary: 'Order cancelled; allocations released', reason: parsed.data.reason })
      await ctx.em.flush()
      await releaseAllForOrder(ctx, order, byName)
      return NextResponse.json(await serializeOrder(ctx, order))
    })
  } catch (error) {
    return orderErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Orders',
  summary: 'Cancel an order',
  methods: {
    POST: {
      summary: 'Cancel an order with a reason',
      tags: ['Creative Carbon Orders'],
      requestBody: { schema: bodySchema },
      responses: [{ status: 200, description: 'The cancelled order', schema: z.object({ id: z.string() }).passthrough() }],
      errors: [{ status: 409, description: 'Already dispatched or cancelled' }],
    },
  },
}

export { POST }
