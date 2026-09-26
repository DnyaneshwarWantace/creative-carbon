import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../../dermat_orders/lib/server'
import { piActionSchema } from '../../../data/validators'
import { findPi, markPiSent, piView } from '../../../lib/documents'
import { AccountsError } from '../../../lib/service'
import { accountsErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['dermat_accounts.record'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = piActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  try {
    const first = await findPi(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'dermat_accounts.proforma', resourceId: first.id, current: first.updatedAt, request: req })
    return await runGuarded(ctx, req, first.id, parsed.data, async () => {
      const byName = await currentUserName(ctx)
      const result = await ctx.em.transactional(async (em) => {
        const txCtx = { ...ctx, em: em as EntityManager }
        const pi = await findPi(txCtx, parsed.data.id)
        if (parsed.data.action === 'send') await markPiSent(txCtx, pi, byName)
        else {
          if (pi.status === 'cancelled') throw new AccountsError('Already cancelled', 409)
          if (!parsed.data.reason?.trim()) throw new AccountsError('Write why it is cancelled')
          pi.status = 'cancelled'
          pi.cancelReason = parsed.data.reason.trim()
          pi.history = [...(pi.history ?? []), { action: 'cancelled', by: byName, at: new Date().toISOString(), note: pi.cancelReason }]
        }
        pi.updatedAt = new Date()
        await em.flush()
        return pi
      })
      return NextResponse.json(piView(result))
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Accounts',
  summary: 'Send or cancel a proforma invoice',
  methods: {
    POST: {
      summary: 'send: marks it sent and fills the PI no. and advance on the order Advance stage; cancel: needs a reason',
      tags: ['Dermat Accounts'],
      requestBody: { schema: piActionSchema },
      responses: [{ status: 200, description: 'Updated', schema: z.object({ id: z.string() }).passthrough() }],
    },
  },
}

export { POST }
