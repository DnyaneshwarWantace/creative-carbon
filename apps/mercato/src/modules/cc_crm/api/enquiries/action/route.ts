import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { enquiryActionSchema } from '../../../data/validators'
import { enquiryAction, enquiryDetail, findEnquiry } from '../../../lib/enquiries'
import { crmErrorResponse, runCrmGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_crm.manage'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = enquiryActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  try {
    const row = await findEnquiry(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_crm.enquiry', resourceId: row.id, current: row.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runCrmGuarded(ctx, req, { resourceKind: 'cc_crm.enquiry', resourceId: row.id, operation: 'custom', payload: parsed.data }, async () => enquiryDetail(ctx, await enquiryAction(ctx, row, parsed.data, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return crmErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon CRM',
  summary: 'Move an enquiry (stage, lost reason), set the next follow-up, or add a note',
  methods: {
    POST: { summary: 'Enquiry action', tags: ['Creative Carbon CRM'], requestBody: { schema: enquiryActionSchema }, responses: [{ status: 200, description: 'Enquiry', schema: z.object({}).passthrough() }] },
  },
}

export { POST }
