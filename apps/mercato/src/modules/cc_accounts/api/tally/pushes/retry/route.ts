import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName, resolveOrderContext } from '../../../../../cc_orders/lib/server'
import { findPush, pushView, retryPush } from '../../../../lib/tallyPush'
import { accountsErrorResponse, runGuarded } from '../../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_accounts.tally'] },
}

const retrySchema = z.object({ id: z.string().uuid() })

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = retrySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Give the push id' }, { status: 400 })
  try {
    return await runGuarded(ctx, req, parsed.data.id, parsed.data, async () => {
      const push = await retryPush(ctx, await findPush(ctx, parsed.data.id), await currentUserName(ctx))
      return NextResponse.json(pushView(push, true))
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Send a failed or partly failed Tally push again, exactly as before',
  methods: {
    POST: { summary: 'Retry a Tally push', tags: ['Creative Carbon Accounts'], requestBody: { schema: retrySchema }, responses: [{ status: 200, description: 'Push after the new attempt', schema: z.object({ status: z.string() }).passthrough() }], errors: [{ status: 409, description: 'Already sent, or entries sent elsewhere since' }] },
  },
}

export { POST }
