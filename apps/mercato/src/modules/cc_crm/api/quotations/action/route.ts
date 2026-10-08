import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { quotationActionSchema } from '../../../data/validators'
import { findQuotation, quotationAction } from '../../../lib/quotations'
import { crmErrorResponse, runCrmGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_crm.manage'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = quotationActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  try {
    const row = await findQuotation(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_crm.quotation', resourceId: row.id, current: row.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runCrmGuarded(ctx, req, { resourceKind: 'cc_crm.quotation', resourceId: row.id, operation: 'custom', payload: parsed.data }, async () => {
      const outcome = await quotationAction(ctx, row, parsed.data, byName)
      return { ok: true, status: outcome.quotation.status, order: outcome.order }
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return crmErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon CRM',
  summary: 'Mark a quotation sent / accepted / rejected, reopen it, or convert it to an order',
  methods: {
    POST: { summary: 'Quotation action (convert also needs cc_orders.manage)', tags: ['Creative Carbon CRM'], requestBody: { schema: quotationActionSchema }, responses: [{ status: 200, description: 'Result', schema: z.object({ ok: z.boolean() }).passthrough() }] },
  },
}

export { POST }
