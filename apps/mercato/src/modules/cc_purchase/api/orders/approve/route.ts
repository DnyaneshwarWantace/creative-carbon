import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveOrderContext } from '../../../../cc_orders/lib/server'
import { poActionSchema } from '../../../data/validators'
import { approvePo, findPo, poView } from '../../../lib/service'
import { purchaseErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_purchase.approve'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = poActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  try {
    const po = await findPo(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_purchase.order', resourceId: po.id, current: po.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: 'cc_purchase.order', resourceId: po.id, operation: 'custom', payload: parsed.data }, async () => {
      await approvePo(ctx, po, parsed.data.note ?? null)
      return NextResponse.json(await poView(ctx, po))
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Purchase',
  summary: 'Approve a PO so goods can be received against it',
  methods: {
    POST: { summary: 'Approve a PO so goods can be received against it', tags: ['Creative Carbon Purchase'], requestBody: { schema: poActionSchema }, responses: [{ status: 200, description: 'The PO', schema: z.object({ id: z.string() }).passthrough() }], errors: [{ status: 409, description: 'Wrong status or changed by someone else' }] },
  },
}

export { POST }
