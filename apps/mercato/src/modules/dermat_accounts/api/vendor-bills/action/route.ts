import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveOrderContext } from '../../../../dermat_orders/lib/server'
import { vendorBillActionSchema } from '../../../data/validators'
import { actOnBill, billView, findBill } from '../../../lib/payables'
import { accountsErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_accounts.record'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = vendorBillActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  try {
    const bill = await findBill(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'dermat_accounts.vendor_bill', resourceId: bill.id, current: bill.updatedAt, request: req })
    const result = await runGuarded(ctx, req, bill.id, parsed.data as Record<string, unknown>, async () => {
      await actOnBill(ctx, bill, parsed.data)
      return billView(bill)
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Accounts',
  summary: 'Pay or cancel a vendor bill',
  methods: {
    POST: { summary: 'Record a payment to the vendor (full or part) or cancel an unpaid bill', tags: ['Dermat Accounts'], requestBody: { schema: vendorBillActionSchema }, responses: [{ status: 200, description: 'Bill', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { POST }
