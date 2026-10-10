import { NextResponse } from 'next/server'
import { z } from 'zod'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { OrderPayment } from '../../../data/entities'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { paymentVoidSchema } from '../../../data/validators'
import { paymentView, voidPayment } from '../../../lib/service'
import { accountsErrorResponse, runGuarded } from '../../../lib/server'
import { logCorrection } from '../../../../cc_audit/lib/activity'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_accounts.record'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = paymentVoidSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Write why the payment is voided' }, { status: 400 })
  try {
    const payment = await ctx.em.findOne(OrderPayment, { id: parsed.data.id, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
    if (payment) enforceCommandOptimisticLock({ resourceKind: 'cc_accounts.payment', resourceId: payment.id, current: payment.updatedAt, request: req })
    return await runGuarded(ctx, req, parsed.data.id, parsed.data, async () => {
      const voided = await voidPayment(ctx, parsed.data.id, parsed.data.reason, await currentUserName(ctx))
      await logCorrection(ctx, { recordType: 'payment', recordId: parsed.data.id, action: 'voided', summary: 'Payment voided', reason: parsed.data.reason })
      return NextResponse.json(paymentView(voided))
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Void a payment entered by mistake',
  methods: {
    POST: { summary: 'Void a payment (kept in the list, not counted)', tags: ['Creative Carbon Accounts'], requestBody: { schema: paymentVoidSchema }, responses: [{ status: 200, description: 'Voided', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { POST }
