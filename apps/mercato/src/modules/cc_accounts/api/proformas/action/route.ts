import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { piActionSchema } from '../../../data/validators'
import { advanceReceived, findPi, markPiSent, piView, revisePi } from '../../../lib/documents'
import { AccountsError } from '../../../lib/service'
import { accountsErrorResponse, runGuarded } from '../../../lib/server'
import { logCorrection, recordActivity } from '../../../../cc_audit/lib/activity'
import { reasonIssue } from '../../../../cc_audit/lib/reason'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_accounts.record'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = piActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Invalid action' }, { status: 400 })
  try {
    const first = await findPi(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_accounts.proforma', resourceId: first.id, current: first.updatedAt, request: req })
    return await runGuarded(ctx, req, first.id, parsed.data, async () => {
      const byName = await currentUserName(ctx)
      const result = await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const pi = await findPi(txCtx, parsed.data.id)
        if (parsed.data.action === 'send') await markPiSent(txCtx, pi, byName, { sentTo: parsed.data.sentTo, channel: parsed.data.channel })
        else if (parsed.data.action === 'revise') {
          const changes = await revisePi(txCtx, pi, { reason: parsed.data.reason!.trim(), validUntil: parsed.data.validUntil, advancePercent: parsed.data.advancePercent }, byName)
          recordActivity(em as EntityManager, ctx, { recordType: 'proforma', recordId: pi.id, action: 'revised', kind: 'change', summary: `Revision ${pi.revision} made; revision ${pi.revision - 1} kept for printing`, reason: parsed.data.reason!.trim(), changes, actorUserId: ctx.userId ?? null, actorName: byName })
        } else {
          if (pi.status === 'cancelled') throw new AccountsError('Already cancelled', 409)
          const paid = await advanceReceived(txCtx, pi.orderId)
          if (paid > 0) throw new AccountsError(`₹${paid.toLocaleString('en-IN')} advance is received against this order. Refund or void it first.`, 409)
          if (!parsed.data.reason?.trim()) throw new AccountsError('Write why it is cancelled')
          pi.status = 'cancelled'
          pi.cancelReason = parsed.data.reason.trim()
          pi.history = [...(pi.history ?? []), { action: 'cancelled', by: byName, at: new Date().toISOString(), note: pi.cancelReason }]
        }
        pi.updatedAt = new Date()
        await em.flush()
        return pi
      })
      if (parsed.data.action === 'cancel') await logCorrection(ctx, { recordType: 'proforma', recordId: parsed.data.id, action: 'cancelled', summary: 'Proforma cancelled', reason: parsed.data.reason ?? '' })
      return NextResponse.json(piView(result))
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Send or cancel a proforma invoice',
  methods: {
    POST: {
      summary: 'send: marks it sent and fills the PI no. and advance on the order Advance stage; revise: new revision from the order lines, old one kept (reason, not after advance); cancel: needs a reason, not after advance',
      tags: ['Creative Carbon Accounts'],
      requestBody: { schema: piActionSchema },
      responses: [{ status: 200, description: 'Updated', schema: z.object({ id: z.string() }).passthrough() }],
    },
  },
}

export { POST }
