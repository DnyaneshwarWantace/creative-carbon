import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { hasFeatures } from '../../../../cc_orders/lib/server'
import { reasonIssue, requireReasonFor } from '../../../../cc_audit/lib/reason'
import { resolveStoreContext, runGuarded, storeErrorResponse } from '../../../lib/server'
import { adjustmentView, decideAdjustment, findAdjustment, reverseAdjustment } from '../../../lib/adjustments'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_store.adjust'] },
}

const actionSchema = z
  .object({ id: z.string().uuid(), action: z.enum(['approve', 'reject', 'reverse']), reason: z.string().trim().max(500).optional().nullable() })
  .superRefine(requireReasonFor(['reject', 'reverse']))

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = actionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Invalid action' }, { status: 400 })
  if (parsed.data.action !== 'reverse' && !(await hasFeatures(ctx, ['cc_store.approve']))) return NextResponse.json({ error: 'Only the store manager can approve or reject' }, { status: 403 })
  try {
    const row = await findAdjustment(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_store.adjustment', resourceId: row.id, current: row.updatedAt, request: req })
    const result = await runGuarded(ctx, req, { resourceKind: 'cc_store.adjustment', resourceId: row.id, operation: 'custom', payload: parsed.data as Record<string, unknown> }, async () => {
      if (parsed.data.action === 'reverse') await reverseAdjustment(ctx, row, parsed.data.reason!.trim())
      else await decideAdjustment(ctx, row, parsed.data.action === 'approve', parsed.data.reason?.trim() || null)
      return adjustmentView(ctx, row)
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return storeErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Store',
  summary: 'Approve, reject or reverse a store adjustment',
  methods: {
    POST: { summary: 'approve / reject (store manager, adjustments over the limit); reverse (within 7 days, not if the lot was used since; reason needed)', tags: ['Creative Carbon Store'], requestBody: { schema: actionSchema }, responses: [{ status: 200, description: 'Adjustment', schema: z.object({ id: z.string() }).passthrough() }], errors: [{ status: 409, description: 'Wrong status, too old, or the lot was used' }] },
  },
}

export { POST }
