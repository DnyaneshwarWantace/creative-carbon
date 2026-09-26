import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { DermatOrder } from '../../../dermat_orders/data/entities'
import { currentUserName, resolveOrderContext } from '../../../dermat_orders/lib/server'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { OrderPayment } from '../../data/entities'
import { paymentInputSchema, paymentUpdateSchema } from '../../data/validators'
import { AccountsError, paymentView, paymentsFor, recordPayment, updatePayment } from '../../lib/service'
import { accountsErrorResponse, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_accounts.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_accounts.record'] },
  PUT: { requireAuth: true, requireFeatures: ['dermat_accounts.record'] },
}

const querySchema = z.object({ orderId: z.string().uuid() })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
  return NextResponse.json({ items: (await paymentsFor(ctx, [parsed.data.orderId])).map(paymentView) })
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = paymentInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter the amount and the date' }, { status: 400 })
  try {
    const order = await ctx.em.findOne(DermatOrder, { id: parsed.data.orderId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
    if (!order) throw new AccountsError('Order not found', 404)
    if (order.status === 'cancelled') throw new AccountsError('This order is cancelled', 409)
    return await runGuarded(ctx, req, order.id, parsed.data, async () => {
      const payment = await recordPayment(ctx, { ...parsed.data, orderNo: order.orderNo }, await currentUserName(ctx))
      return NextResponse.json(paymentView(payment), { status: 201 })
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = paymentUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Write why the payment is changed', details: parsed.error.flatten() }, { status: 400 })
  try {
    const payment = await ctx.em.findOne(OrderPayment, { id: parsed.data.id, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
    if (!payment) throw new AccountsError('Payment not found', 404)
    enforceCommandOptimisticLock({ resourceKind: 'dermat_accounts.payment', resourceId: payment.id, current: payment.updatedAt, request: req })
    return await runGuarded(ctx, req, payment.id, parsed.data, async () => {
      await updatePayment(ctx, payment, parsed.data, await currentUserName(ctx))
      await ctx.em.flush()
      return NextResponse.json(paymentView(payment))
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Accounts',
  summary: 'Payments received against an order',
  methods: {
    GET: { summary: 'Payments of one order (voided ones included, marked)', tags: ['Dermat Accounts'], query: querySchema, responses: [{ status: 200, description: 'Payments', schema: z.object({ items: z.array(z.object({ id: z.string() }).passthrough()) }) }] },
    PUT: { summary: 'Correct a payment (amount, date, mode, reference, matched invoice) with a reason; every change is kept in its history', tags: ['Dermat Accounts'], requestBody: { schema: paymentUpdateSchema }, responses: [{ status: 200, description: 'Updated', schema: z.object({ id: z.string() }).passthrough() }] },
    POST: { summary: 'Record a payment (advance, balance or other)', tags: ['Dermat Accounts'], requestBody: { schema: paymentInputSchema }, responses: [{ status: 201, description: 'Recorded', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { GET, POST, PUT }
