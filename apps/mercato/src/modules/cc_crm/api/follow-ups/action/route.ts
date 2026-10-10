import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { crmErrorResponse, runCrmGuarded } from '../../../lib/server'
import { findFollowUp, followUpAction, followUpView } from '../../../lib/followUps'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_crm.manage'] },
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const actionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['done', 'skip', 'reschedule', 'undo']),
  outcome: z.string().trim().max(1000).optional().nullable(),
  reason: z.string().trim().max(500).optional().nullable(),
  dueOn: isoDate.optional().nullable(),
  next: z.object({ dueOn: isoDate, kind: z.enum(['call', 'visit', 'sample', 'quote_chase', 'other']).optional().nullable(), note: z.string().trim().max(500).optional().nullable() }).optional().nullable(),
})

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = actionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  try {
    const row = await findFollowUp(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_crm.follow_up', resourceId: row.id, current: row.updatedAt, request: req })
    const result = await runCrmGuarded(ctx, req, { resourceKind: 'cc_crm.follow_up', resourceId: row.id, operation: 'custom', payload: parsed.data }, async () => {
      const outcome = await followUpAction(ctx, row, parsed.data, await currentUserName(ctx))
      return { ...(await followUpView(ctx, outcome.row)), nextId: outcome.next?.id ?? null }
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return crmErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon CRM',
  summary: 'Close, skip, move or undo a follow-up',
  methods: {
    POST: { summary: 'done (outcome; optional next follow-up), skip (reason), reschedule (new date + reason, old date kept), undo (same person, within 24 hours, reason; not when a newer follow-up exists)', tags: ['Creative Carbon CRM'], requestBody: { schema: actionSchema }, responses: [{ status: 200, description: 'Follow-up', schema: z.object({ id: z.string() }).passthrough() }], errors: [{ status: 409, description: 'Closed, too late, or a newer follow-up exists' }] },
  },
}

export { POST }
