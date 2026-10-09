import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../../cc_orders/lib/server'
import { testConnection } from '../../../lib/tallyPush'
import { accountsErrorResponse } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_accounts.view'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  try {
    return NextResponse.json(await testConnection(ctx))
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Test the Tally connection: companies open in Tally, the ledgers there, and which mapped ledger names are missing',
  methods: {
    POST: { summary: 'Test the connection to Tally', tags: ['Creative Carbon Accounts'], responses: [{ status: 200, description: 'Result', schema: z.object({ ok: z.boolean(), companies: z.array(z.string()), missing: z.array(z.string()) }).passthrough() }] },
  },
}

export { POST }
