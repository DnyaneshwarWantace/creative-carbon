import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { currentUserName } from '../../../cc_orders/lib/server'
import { resolveStoreContext, storeErrorResponse } from '../../../cc_store/lib/server'
import { CompanyProfile } from '../../../cc_accounts/data/entities'
import { goLiveUpdateSchema } from '../../data/validators'
import { goLiveReport, goLiveSettings } from '../../lib/golive'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_dashboard.view'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_dashboard.golive'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  try {
    return NextResponse.json(await goLiveReport(ctx))
  } catch (error) {
    return storeErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = goLiveUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the entry' }, { status: 400 })
  const guard = await runRouteMutationGuards({
    container: ctx.container,
    req,
    auth: { userId: ctx.userId ?? 'system', tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    input: { resourceKind: 'cc_dashboard.golive', resourceId: 'golive', operation: 'update', mutationPayload: parsed.data },
  })
  if (!guard.ok) return guard.response
  const profile = await ctx.em.findOne(CompanyProfile, { tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  if (!profile) return NextResponse.json({ error: 'Save the company details first (Accounts → Company details)' }, { status: 400 })
  const current = goLiveSettings(profile)
  const confirmed = { ...(current.confirmed ?? {}) }
  if (parsed.data.confirm) {
    if (parsed.data.confirm.done) confirmed[parsed.data.confirm.key] = { by: await currentUserName(ctx), at: new Date().toISOString() }
    else delete confirmed[parsed.data.confirm.key]
  }
  profile.goLive = {
    cutoverDate: parsed.data.cutoverDate !== undefined ? parsed.data.cutoverDate : (current.cutoverDate ?? null),
    targetDays: parsed.data.targetDays ?? current.targetDays,
    confirmed,
  }
  await ctx.em.flush()
  await guard.runAfterSuccess()
  return NextResponse.json(await goLiveReport(ctx))
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Overview',
  summary: 'Go-live checklist: masters, opening stock, Tally, test data, parallel run and the on-site confirmations',
  methods: {
    GET: { summary: 'The checklist, worked out from the live data', tags: ['Creative Carbon Overview'], responses: [{ status: 200, description: 'Checklist', schema: z.object({ percent: z.number(), checks: z.array(z.object({ key: z.string(), state: z.string() }).passthrough()) }).passthrough() }] },
    PUT: { summary: 'Set the cutover date, the parallel-run target, or tick an on-site item', tags: ['Creative Carbon Overview'], requestBody: { schema: goLiveUpdateSchema }, responses: [{ status: 200, description: 'Checklist', schema: z.object({}).passthrough() }] },
  },
}

export { GET, PUT }
