import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext, hasFeatures } from '../../../../cc_orders/lib/server'
import { quotationActionSchema } from '../../../data/validators'
import { findQuotation, quotationAction } from '../../../lib/quotations'
import { crmErrorResponse, runCrmGuarded } from '../../../lib/server'
import { logCorrection } from '../../../../cc_audit/lib/activity'
import { reasonIssue } from '../../../../cc_audit/lib/reason'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_crm.manage'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = quotationActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Invalid action' }, { status: 400 })
  if (parsed.data.action === 'undo_convert' && !(await hasFeatures(ctx, ['cc_crm.team']))) return NextResponse.json({ error: 'Only the CRM manager can undo a conversion' }, { status: 403 })
  try {
    const row = await findQuotation(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_crm.quotation', resourceId: row.id, current: row.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runCrmGuarded(ctx, req, { resourceKind: 'cc_crm.quotation', resourceId: row.id, operation: 'custom', payload: parsed.data }, async () => {
      const outcome = await quotationAction(ctx, row, parsed.data, byName)
      return { ok: true, status: outcome.quotation.status, revision: outcome.quotation.revision ?? 1, order: outcome.order }
    })
    if (result instanceof Response) return result
    if (parsed.data.action === 'reopen') await logCorrection(ctx, { recordType: 'quotation', recordId: parsed.data.id, action: 'reopened', summary: 'Quotation reopened', reason: parsed.data.note ?? '' })
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
