import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../../cc_orders/lib/server'
import { tallyCheckSchema } from '../../../data/validators'
import { TALLY_KINDS, type TallyKind } from '../../../lib/tally'
import { checkAgainstTally } from '../../../lib/tallyPush'
import { accountsErrorResponse } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_accounts.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = tallyCheckSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Pick the dates' }, { status: 400 })
  if (parsed.data.from > parsed.data.to) return NextResponse.json({ error: 'The start date is after the end date' }, { status: 400 })
  const kinds = (parsed.data.kinds ? parsed.data.kinds.split(',') : TALLY_KINDS).filter((kind): kind is TallyKind => (TALLY_KINDS as string[]).includes(kind))
  try {
    return NextResponse.json(await checkAgainstTally(ctx, { from: parsed.data.from, to: parsed.data.to }, kinds))
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Read the vouchers back from Tally and compare them with the ERP: matched, amount differs, not in Tally, only in Tally',
  methods: {
    GET: { summary: 'Check ERP entries against Tally for a date range', tags: ['Creative Carbon Accounts'], query: tallyCheckSchema, responses: [{ status: 200, description: 'Comparison', schema: z.object({ counts: z.record(z.string(), z.number()), rows: z.array(z.object({ status: z.string() }).passthrough()) }).passthrough() }] },
  },
}

export { GET }
