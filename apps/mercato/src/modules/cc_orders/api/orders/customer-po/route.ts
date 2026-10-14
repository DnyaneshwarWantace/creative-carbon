import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { CcOrderLine } from '../../../data/entities'
import { logEvent } from '../../../lib/engine'
import { OrderError, currentUserName, findOrder, resolveOrderContext } from '../../../lib/server'
import { enforceOrderLock, orderErrorResponse, runGuarded } from '../../../lib/guard'
import { customerPoLineSchema, customerPoOf, customerPoSchema } from '../../../lib/customerPo'
import { logEdit } from '../../../../cc_audit/lib/activity'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['cc_orders.manage'] },
}

const bodySchema = z.object({ id: z.string().uuid(), customerPo: customerPoSchema, lines: z.array(customerPoLineSchema).max(50).default([]), amendmentNote: z.string().trim().max(500).optional() })

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the customer PO details' }, { status: 400 })
  try {
    const order = await findOrder(ctx, parsed.data.id)
    if (order.status === 'cancelled') throw new OrderError('This order is cancelled', 409)
    enforceOrderLock(order, req)
    const before = customerPoOf(order.customerPo)
    const next = parsed.data.customerPo
    const amended = next.amendmentNo > (before?.amendmentNo ?? 0)
    if (amended && (parsed.data.amendmentNote ?? '').length < 3) throw new OrderError(`Write what amendment ${next.amendmentNo} changes (at least 3 letters)`)
    return await runGuarded(ctx, req, { resourceId: order.id, operation: 'update', payload: parsed.data }, async () => {
      const byName = await currentUserName(ctx)
      const lines = await ctx.em.find(CcOrderLine, { orderId: order.id })
      const lineBefore: Record<string, unknown> = {}
      const lineAfter: Record<string, unknown> = {}
      for (const entry of parsed.data.lines) {
        const line = lines.find((candidate) => candidate.id === entry.lineId)
        if (!line) throw new OrderError('A line is not on this order', 404)
        const label = `line ${line.position}`
        lineBefore[label] = line.specs?.customer ?? {}
        const customer = Object.fromEntries(Object.entries({ item_code: entry.itemCode, description: entry.description, delivery_date: entry.deliveryDate }).filter(([, value]) => value))
        lineAfter[label] = customer
        const specs = { ...(line.specs ?? {}) }
        if (Object.keys(customer).length) specs.customer = customer
        else delete specs.customer
        line.specs = specs
      }
      order.customerPo = next as unknown as Record<string, unknown>
      order.updatedAt = new Date()
      logEdit(ctx.em, ctx, { recordType: 'order', recordId: order.id, before: { po: before ?? {}, lines: lineBefore }, after: { po: next, lines: lineAfter }, byName, labels: { po: 'Customer PO', lines: 'PO line' }, action: 'customer_po' })
      if (amended) {
        order.revision = (order.revision ?? 1) + 1
        order.revisedAt = new Date()
        order.revisedByName = byName
        order.revisionNote = `PO amendment ${next.amendmentNo}: ${parsed.data.amendmentNote}`.slice(0, 2000)
        logEvent(ctx, order, 'edited', null, `Revision ${order.revision} — PO amendment ${next.amendmentNo}: ${parsed.data.amendmentNote}`, byName)
      }
      await ctx.em.flush()
      return NextResponse.json({ ok: true, revision: order.revision, updatedAt: order.updatedAt.toISOString() })
    })
  } catch (error) {
    return orderErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Orders',
  summary: 'The customer PO on an order: PO date, amendment, our offer ref, vendor code, buyer, commercial terms, documents asked for; item code and delivery per line',
  methods: {
    PUT: { summary: 'Save the customer PO details (a higher amendment no. raises the order revision and needs a note)', tags: ['Creative Carbon Orders'], requestBody: { schema: bodySchema }, responses: [{ status: 200, description: 'Saved', schema: z.object({ ok: z.boolean() }).passthrough() }] },
  },
}

export { PUT }
