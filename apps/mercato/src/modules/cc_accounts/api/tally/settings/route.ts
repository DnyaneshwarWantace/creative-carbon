import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../../cc_orders/lib/server'
import { CompanyProfile } from '../../../data/entities'
import { tallySettingsSchema } from '../../../data/validators'
import { DEFAULT_LEDGERS } from '../../../lib/tally'
import { cleanTallyUrl, settingsView } from '../../../lib/tallyPush'
import { AccountsError } from '../../../lib/service'
import { accountsErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_accounts.view'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_accounts.tally'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const profile = await ctx.em.findOne(CompanyProfile, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  return NextResponse.json({ ...settingsView(profile), hasCompany: Boolean(profile), defaults: DEFAULT_LEDGERS })
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = tallySettingsSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the Tally settings' }, { status: 400 })
  try {
    return await runGuarded(ctx, req, 'tally-settings', parsed.data, async () => {
      const profile = await ctx.em.findOne(CompanyProfile, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
      if (!profile) throw new AccountsError('Save the company details first (Accounts → Company details)')
      const current = settingsView(profile)
      const ledgers = { ...current.ledgers }
      for (const key of Object.keys(DEFAULT_LEDGERS) as Array<keyof typeof DEFAULT_LEDGERS>) {
        const value = parsed.data.ledgers?.[key]
        if (value !== undefined) ledgers[key] = value || DEFAULT_LEDGERS[key]
      }
      profile.tallySettings = {
        url: parsed.data.url !== undefined ? cleanTallyUrl(parsed.data.url) : current.url,
        company: parsed.data.company !== undefined ? parsed.data.company || null : current.company,
        ledgers,
      }
      await ctx.em.flush()
      return NextResponse.json({ ...settingsView(profile), hasCompany: true, defaults: DEFAULT_LEDGERS })
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Tally connection: address of the Tally gateway, company name in Tally and ledger names',
  methods: {
    GET: { summary: 'Read the Tally settings', tags: ['Creative Carbon Accounts'], responses: [{ status: 200, description: 'Settings', schema: z.object({ url: z.string().nullable(), company: z.string().nullable() }).passthrough() }] },
    PUT: { summary: 'Save the Tally settings', tags: ['Creative Carbon Accounts'], requestBody: { schema: tallySettingsSchema }, responses: [{ status: 200, description: 'Saved', schema: z.object({ url: z.string().nullable() }).passthrough() }] },
  },
}

export { GET, PUT }
