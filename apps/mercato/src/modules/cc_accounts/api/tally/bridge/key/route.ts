import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../../../cc_orders/lib/server'
import { CompanyProfile } from '../../../../data/entities'
import { hashBridgeToken, newBridgeToken } from '../../../../lib/tallyClient'
import { AccountsError } from '../../../../lib/service'
import { accountsErrorResponse, runGuarded } from '../../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_accounts.tally'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  try {
    return await runGuarded(ctx, req, 'tally-bridge-key', {}, async () => {
      const profile = await ctx.em.findOne(CompanyProfile, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
      if (!profile) throw new AccountsError('Save the company details first (Accounts → Company details)')
      const token = newBridgeToken()
      profile.tallySettings = { url: null, company: null, ledgers: {}, ...(profile.tallySettings ?? {}), bridgeTokenHash: hashBridgeToken(token), bridgeSeenAt: null, bridgeTallyUrl: null }
      await ctx.em.flush()
      return NextResponse.json({ key: token, erpUrl: new URL(req.url).origin })
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Make a new key for the Tally bridge (shown once; the old key stops working)',
  methods: {
    POST: { summary: 'New Tally bridge key', tags: ['Creative Carbon Accounts'], responses: [{ status: 200, description: 'Key', schema: z.object({ key: z.string(), erpUrl: z.string() }) }] },
  },
}

export { POST }
