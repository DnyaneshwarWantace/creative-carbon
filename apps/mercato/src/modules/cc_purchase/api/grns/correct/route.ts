import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { hasFeatures } from '../../../../cc_orders/lib/server'
import { requireReasonFor, reasonIssue } from '../../../../cc_audit/lib/reason'
import { findGrn, grnView } from '../../../lib/service'
import { cancelGrn, correctReceivedQty, undoQc } from '../../../lib/grnCorrections'
import { purchaseErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_purchase.view'] },
}

const correctSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum(['quantity', 'undo_qc', 'cancel']),
    lineId: z.string().uuid().optional(),
    quantity: z.coerce.number().positive().max(100_000_000).optional(),
    reason: z.string().trim().max(1000).optional(),
  })
  .superRefine(requireReasonFor([]))

const RIGHT: Record<string, string> = { quantity: 'cc_purchase.receive', undo_qc: 'cc_production.quality.enter', cancel: 'cc_purchase.approve' }

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = correctSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Invalid request' }, { status: 400 })
  const input = parsed.data
  if (!(await hasFeatures(ctx, [RIGHT[input.action]]))) return NextResponse.json({ error: input.action === 'undo_qc' ? 'Only QC can undo a QC result' : input.action === 'cancel' ? 'Only an approver can cancel a GRN' : 'Only the store can correct a receipt' }, { status: 403 })
  if (input.action !== 'cancel' && !input.lineId) return NextResponse.json({ error: 'Pick the line' }, { status: 400 })
  if (input.action === 'quantity' && input.quantity === undefined) return NextResponse.json({ error: 'Give the correct quantity' }, { status: 400 })
  try {
    const grn = await findGrn(ctx, input.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_purchase.grn', resourceId: grn.id, current: grn.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: 'cc_purchase.grn', resourceId: grn.id, operation: 'custom', payload: input }, async () => {
      const reason = input.reason!.trim()
      if (input.action === 'quantity') await correctReceivedQty(ctx, grn, input.lineId!, input.quantity!, reason)
      else if (input.action === 'undo_qc') await undoQc(ctx, grn, input.lineId!, reason)
      else await cancelGrn(ctx, grn, reason)
      return NextResponse.json(await grnView(ctx, grn))
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Purchase',
  summary: 'Correct a goods receipt',
  methods: {
    POST: {
      summary: 'quantity: fix the received kg of a lot (counter-entry for the difference; not once the lot is used or billed); undo_qc: back to under QC within 24 hours; cancel: reverse every lot (not once used or billed). Reason needed.',
      tags: ['Creative Carbon Purchase'],
      requestBody: { schema: correctSchema },
      responses: [{ status: 200, description: 'The GRN', schema: z.object({ id: z.string() }).passthrough() }],
      errors: [{ status: 409, description: 'Lot used, bill entered, too late, or already cancelled' }],
    },
  },
}

export { POST }
