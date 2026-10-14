import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { findQuotation, quotationDetail, saveQuoteLetter } from '../../../lib/quotations'
import { quoteLetterSchema } from '../../../lib/quoteLetter'
import { crmErrorResponse, runCrmGuarded } from '../../../lib/server'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['cc_crm.manage'] },
}

const letterInputSchema = z.object({ id: z.string().uuid(), letter: quoteLetterSchema })

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = letterInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the quotation letter' }, { status: 400 })
  try {
    const row = await findQuotation(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_crm.quotation', resourceId: row.id, current: row.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runCrmGuarded(ctx, req, { resourceKind: 'cc_crm.quotation', resourceId: row.id, operation: 'update', payload: parsed.data }, async () => {
      await saveQuoteLetter(ctx, row, parsed.data.letter, byName)
      return quotationDetail(ctx, row)
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return crmErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon CRM',
  summary: 'The printed quotation letter: To block, kind attention, reference line, terms and drawing numbers',
  methods: {
    PUT: { summary: 'Save the quotation letter', tags: ['Creative Carbon CRM'], requestBody: { schema: letterInputSchema }, responses: [{ status: 200, description: 'Quotation', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { PUT }
