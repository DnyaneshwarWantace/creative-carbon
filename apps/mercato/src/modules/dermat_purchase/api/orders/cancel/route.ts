import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveOrderContext } from '../../../../dermat_orders/lib/server'
import { poCancelSchema } from '../../../data/validators'
import { cancelPo, findPo, poView } from '../../../lib/service'
import { purchaseErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_purchase.manage'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = poCancelSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Write why the PO is cancelled' }, { status: 400 })
  try {
    const po = await findPo(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'dermat_purchase.order', resourceId: po.id, current: po.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: 'dermat_purchase.order', resourceId: po.id, operation: 'custom', payload: parsed.data }, async () => {
      await cancelPo(ctx, po, parsed.data.note)
      return NextResponse.json(await poView(ctx, po))
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Purchase',
  summary: 'Cancel a PO nothing has been received on',
  methods: {
    POST: { summary: 'Cancel a PO nothing has been received on', tags: ['Dermat Purchase'], requestBody: { schema: poCancelSchema }, responses: [{ status: 200, description: 'The PO', schema: z.object({ id: z.string() }).passthrough() }], errors: [{ status: 409, description: 'Wrong status or changed by someone else' }] },
  },
}

export { POST }
