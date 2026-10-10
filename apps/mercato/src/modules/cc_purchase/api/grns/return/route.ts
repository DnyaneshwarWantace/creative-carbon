import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { grnReturnSchema } from '../../../data/validators'
import { findGrn, grnView, returnToVendor } from '../../../lib/service'
import { purchaseErrorResponse, runGuarded } from '../../../lib/server'
import { logCorrection } from '../../../../cc_audit/lib/activity'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_purchase.receive'] },
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = grnReturnSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Write why it goes back' }, { status: 400 })
  try {
    const grn = await findGrn(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_purchase.grn', resourceId: grn.id, current: grn.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: 'cc_purchase.grn', resourceId: grn.id, operation: 'custom', payload: parsed.data }, async () => {
      await returnToVendor(ctx, grn, parsed.data.lineId, parsed.data.note)
      await logCorrection(ctx, { recordType: 'grn', recordId: grn.id, action: 'returned', summary: 'Rejected material returned to the vendor', reason: parsed.data.note })
      return NextResponse.json(await grnView(ctx, grn))
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Purchase',
  summary: 'Return rejected material to the vendor',
  methods: {
    POST: {
      summary: 'Take a QC-rejected batch out of the store and reopen that quantity on the PO',
      tags: ['Creative Carbon Purchase'],
      requestBody: { schema: grnReturnSchema },
      responses: [{ status: 200, description: 'The GRN', schema: z.object({ id: z.string() }).passthrough() }],
      errors: [{ status: 409, description: 'Not rejected, or changed by someone else' }],
    },
  },
}

export { POST }
