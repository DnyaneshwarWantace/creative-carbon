import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName, resolveOrderContext } from '../../../../../cc_orders/lib/server'
import { findPush, markPushManual, pushView } from '../../../../lib/tallyPush'
import { accountsErrorResponse, runGuarded } from '../../../../lib/server'
import { requireReasonFor, reasonIssue } from '../../../../../cc_audit/lib/reason'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_accounts.record'] },
}

const manualSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().max(500).optional() }).superRefine(requireReasonFor([]))

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = manualSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Give the push id' }, { status: 400 })
  try {
    return await runGuarded(ctx, req, parsed.data.id, parsed.data, async () => {
      const push = await markPushManual(ctx, await findPush(ctx, parsed.data.id), parsed.data.reason!.trim(), await currentUserName(ctx))
      return NextResponse.json(pushView(push, true))
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Mark a failed Tally push as entered in Tally by hand',
  methods: {
    POST: { summary: 'Stops retries; its entries count as in Tally (corrections are then blocked). Reason needed.', tags: ['Creative Carbon Accounts'], requestBody: { schema: manualSchema }, responses: [{ status: 200, description: 'Push', schema: z.object({ status: z.string() }).passthrough() }], errors: [{ status: 409, description: 'Already sent or already marked' }] },
  },
}

export { POST }
