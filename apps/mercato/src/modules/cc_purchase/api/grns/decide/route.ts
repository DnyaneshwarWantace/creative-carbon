import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { grnDecideSchema } from '../../../data/validators'
import { decideLine, findGrn, grnView } from '../../../lib/service'
import { purchaseErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_purchase.receive'] },
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = grnDecideSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Pick pass or hold for the line' }, { status: 400 })
  try {
    const grn = await findGrn(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_purchase.grn', resourceId: grn.id, current: grn.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: 'cc_purchase.grn', resourceId: grn.id, operation: 'custom', payload: parsed.data }, async () => {
      await decideLine(ctx, grn, parsed.data.lineId, parsed.data.decision, parsed.data.note?.trim() || null)
      return NextResponse.json(await grnView(ctx, grn))
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Purchase',
  summary: 'Pass or hold a received batch',
  methods: {
    POST: {
      summary: 'Pass a received batch into usable stock, or put it on hold with a reason',
      tags: ['Creative Carbon Purchase'],
      requestBody: { schema: grnDecideSchema },
      responses: [{ status: 200, description: 'The GRN', schema: z.object({ id: z.string() }).passthrough() }],
      errors: [{ status: 409, description: 'Already returned, or changed by someone else' }],
    },
  },
}

export { POST }
