import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { hasFeatures, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { indentActionSchema } from '../../../data/validators'
import { actOnIndent, findIndent, indentViews } from '../../../lib/indents'
import { purchaseErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_purchase.view'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = indentActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  const needed = parsed.data.action === 'cancel' ? ['cc_purchase.indent'] : ['cc_purchase.approve']
  if (!(await hasFeatures(ctx, needed))) return NextResponse.json({ error: parsed.data.action === 'cancel' ? 'Only the person who can raise indents can cancel one' : 'Only an approver can approve or reject an indent' }, { status: 403 })
  try {
    const indent = await findIndent(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_purchase.indent', resourceId: indent.id, current: indent.updatedAt, request: req })
    const result = await runGuarded(ctx, req, { resourceKind: 'cc_purchase.indent', resourceId: indent.id, operation: 'update', payload: parsed.data as Record<string, unknown> }, async () => {
      await actOnIndent(ctx, indent, parsed.data.action, parsed.data.note ?? null)
      return (await indentViews(ctx, [indent]))[0]
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return purchaseErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Purchase',
  summary: 'Approve, reject or cancel an indent',
  methods: {
    POST: { summary: 'Approve or reject (approvers) or cancel (requesters) an indent', tags: ['Creative Carbon Purchase'], requestBody: { schema: indentActionSchema }, responses: [{ status: 200, description: 'Indent', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { POST }
