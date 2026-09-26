import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveStoreContext } from '../../../../dermat_store/lib/server'
import { grnReturnSchema } from '../../../data/validators'
import { findGrn, grnView, returnToVendor } from '../../../lib/service'
import { purchaseErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_purchase.receive'] },
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = grnReturnSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Write why it goes back' }, { status: 400 })
  try {
    const grn = await findGrn(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'dermat_purchase.grn', resourceId: grn.id, current: grn.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: 'dermat_purchase.grn', resourceId: grn.id, operation: 'custom', payload: parsed.data }, async () => {
      await returnToVendor(ctx, grn, parsed.data.lineId, parsed.data.note)
      return NextResponse.json(await grnView(ctx, grn))
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Purchase',
  summary: 'Return rejected material to the vendor',
  methods: {
    POST: {
      summary: 'Take a QC-rejected batch out of the store and reopen that quantity on the PO',
      tags: ['Dermat Purchase'],
      requestBody: { schema: grnReturnSchema },
      responses: [{ status: 200, description: 'The GRN', schema: z.object({ id: z.string() }).passthrough() }],
      errors: [{ status: 409, description: 'Not rejected, or changed by someone else' }],
    },
  },
}

export { POST }
