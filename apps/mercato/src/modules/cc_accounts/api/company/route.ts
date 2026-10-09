import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveOrderContext } from '../../../cc_orders/lib/server'
import { CompanyProfile } from '../../data/entities'
import { companyInputSchema } from '../../data/validators'
import { companyView, loadCompany } from '../../lib/documents'
import { accountsErrorResponse, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_accounts.view'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_accounts.record'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return NextResponse.json(companyView(await loadCompany(ctx)))
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = companyInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the company details', details: parsed.error.flatten() }, { status: 400 })
  try {
    const existing = await loadCompany(ctx)
    if (existing) enforceCommandOptimisticLock({ resourceKind: 'cc_accounts.company', resourceId: existing.id, current: existing.updatedAt, request: req })
    return await runGuarded(ctx, req, existing?.id ?? 'company', parsed.data, async () => {
      const profile = existing ?? ctx.em.create(CompanyProfile, { organizationId: ctx.organizationId, tenantId: ctx.tenantId, name: parsed.data.name })
      const clean = (value: string | null | undefined) => (value && value.trim() ? value.trim() : null)
      profile.name = parsed.data.name
      profile.legalName = clean(parsed.data.legalName)
      profile.gstin = clean(parsed.data.gstin)?.toUpperCase() ?? null
      profile.pan = clean(parsed.data.pan)?.toUpperCase() ?? null
      profile.address = clean(parsed.data.address)
      profile.phone = clean(parsed.data.phone)
      profile.email = clean(parsed.data.email)
      profile.website = clean(parsed.data.website)
      profile.bankName = clean(parsed.data.bankName)
      profile.bankBranch = clean(parsed.data.bankBranch)
      profile.bankAccount = clean(parsed.data.bankAccount)
      profile.bankIfsc = clean(parsed.data.bankIfsc)?.toUpperCase() ?? null
      profile.upiId = clean(parsed.data.upiId)
      profile.signatory = clean(parsed.data.signatory)
      profile.piTerms = clean(parsed.data.piTerms)
      profile.invoiceTerms = clean(parsed.data.invoiceTerms)
      profile.piValidityDays = parsed.data.piValidityDays
      profile.grnOverPercent = parsed.data.grnOverPercent
      profile.iec = clean(parsed.data.iec)?.toUpperCase() ?? null
      profile.lutArn = clean(parsed.data.lutArn)?.toUpperCase() ?? null
      profile.lutValidTill = clean(parsed.data.lutValidTill)
      profile.updatedAt = new Date()
      ctx.em.persist(profile)
      await ctx.em.flush()
      return NextResponse.json(companyView(profile))
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Company details printed on every document',
  methods: {
    GET: { summary: 'Company name, GSTIN, address, bank and default terms', tags: ['Creative Carbon Accounts'], responses: [{ status: 200, description: 'Company', schema: z.object({ name: z.string() }).passthrough() }] },
    PUT: { summary: 'Save company details', tags: ['Creative Carbon Accounts'], requestBody: { schema: companyInputSchema }, responses: [{ status: 200, description: 'Saved', schema: z.object({ name: z.string() }).passthrough() }] },
  },
}

export { GET, PUT }
