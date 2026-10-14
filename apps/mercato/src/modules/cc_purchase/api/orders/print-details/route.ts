import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { logEdit } from '../../../../cc_audit/lib/activity'
import { PurchaseError, findPo, poView } from '../../../lib/service'
import { poPrintSchema } from '../../../lib/poPrint'
import { purchaseErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['cc_purchase.manage'] },
}

const inputSchema = z.object({ id: z.string().uuid(), printDetails: poPrintSchema })

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = inputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the PO print details' }, { status: 400 })
  try {
    const po = await findPo(ctx, parsed.data.id)
    if (po.status === 'cancelled') throw new PurchaseError('This PO is cancelled', 409)
    enforceCommandOptimisticLock({ resourceKind: 'cc_purchase.order', resourceId: po.id, current: po.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceKind: 'cc_purchase.order', resourceId: po.id, operation: 'update', payload: parsed.data }, async () => {
      const before = (await poView(ctx, po)).printDetails
      po.printDetails = parsed.data.printDetails
      po.updatedAt = new Date()
      logEdit(ctx.em, ctx, { recordType: 'po', recordId: po.id, before: { print: before }, after: { print: parsed.data.printDetails }, byName: await currentUserName(ctx), labels: { print: 'PO print details' }, action: 'print_details' })
      await ctx.em.flush()
      return NextResponse.json(await poView(ctx, po))
    })
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Purchase',
  summary: 'What prints on the purchase order: form no., special instructions, delivery place, terms, warranty, test certificate',
  methods: {
    PUT: { summary: 'Save the PO print details', tags: ['Creative Carbon Purchase'], requestBody: { schema: inputSchema }, responses: [{ status: 200, description: 'The PO', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { PUT }
