import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveOrderContext } from '../../../../cc_orders/lib/server'
import { requireReasonFor, reasonIssue } from '../../../../cc_audit/lib/reason'
import { shortClosePo, findPo, poView } from '../../../lib/service'
import { purchaseErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_purchase.approve'] },
}

const shortCloseSchema = z.object({ id: z.string().uuid(), note: z.string().trim().max(1000).optional().nullable() }).superRefine(requireReasonFor([], 'note'))

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = shortCloseSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Invalid request' }, { status: 400 })
  try {
    const po = await findPo(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_purchase.order', resourceId: po.id, current: po.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: 'cc_purchase.order', resourceId: po.id, operation: 'custom', payload: parsed.data }, async () => {
      await shortClosePo(ctx, po, parsed.data.note!.trim())
      return NextResponse.json(await poView(ctx, po))
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Purchase',
  summary: 'Short-close a PO: the pending quantity is dropped',
  methods: {
    POST: { summary: 'Short-close a PO (reason needed)', tags: ['Creative Carbon Purchase'], requestBody: { schema: shortCloseSchema }, responses: [{ status: 200, description: 'The PO', schema: z.object({ id: z.string() }).passthrough() }], errors: [{ status: 409, description: 'Not approved, or already received' }] },
  },
}

export { POST }
