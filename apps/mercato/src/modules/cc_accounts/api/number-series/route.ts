import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveOrderContext, type OrderContext } from '../../../cc_orders/lib/server'
import { CompanyProfile } from '../../data/entities'
import { numberSeriesInputSchema } from '../../data/validators'
import { loadCompany } from '../../lib/documents'
import { SERIES_DEFS, formatSeriesCode, lastSeriesNumber, mergeSeries, renderTemplate, type SeriesKey } from '../../lib/numberSeries'
import { accountsErrorResponse, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_accounts.series'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_accounts.series'] },
}

async function view(ctx: OrderContext) {
  const profile = await loadCompany(ctx)
  const settings = mergeSeries(profile?.numberSeries ?? null)
  const today = new Date()
  const items = []
  for (const def of SERIES_DEFS) {
    const setting = settings[def.key]
    const last = await lastSeriesNumber(ctx, def, setting, today)
    items.push({
      key: def.key,
      label: def.label,
      department: def.department,
      defaults: { prefix: def.prefix, suffix: def.suffix, pad: def.pad, startAt: def.startAt },
      ...setting,
      kind: def.kind ?? 'series',
      tokens: def.tokens ?? [],
      required: def.required ?? [],
      sample: def.sample ?? {},
      lastUsed: last,
      next: def.kind === 'template' ? renderTemplate(setting.prefix, today, def.sample ?? {}) : formatSeriesCode(setting, Math.max(last + 1, setting.startAt), today),
    })
  }
  return { items, updatedAt: profile?.updatedAt?.toISOString() ?? null, hasCompany: Boolean(profile) }
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return NextResponse.json(await view(ctx))
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = numberSeriesInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the number series', details: parsed.error.flatten() }, { status: 400 })
  try {
    const existing = await loadCompany(ctx)
    if (!existing) return NextResponse.json({ error: 'Save the company details first (Masters → Company details)' }, { status: 409 })
    enforceCommandOptimisticLock({ resourceKind: 'cc_accounts.company', resourceId: existing.id, current: existing.updatedAt, request: req })
    return await runGuarded(ctx, req, existing.id, parsed.data, async () => {
      const merged = mergeSeries(existing.numberSeries ?? null)
      for (const entry of parsed.data.items) {
        merged[entry.key as SeriesKey] = { prefix: entry.prefix, suffix: entry.suffix ?? '', pad: entry.pad, startAt: entry.startAt }
      }
      for (const def of SERIES_DEFS.filter((entry) => entry.kind === 'template')) {
        const missing = (def.required ?? []).filter((token) => !merged[def.key].prefix.includes(token))
        if (missing.length) return NextResponse.json({ error: `${def.label} must keep ${missing.join(' and ')} so two lots never get the same number` }, { status: 400 })
      }
      const prefixes = new Map<string, string>()
      for (const def of SERIES_DEFS.filter((entry) => entry.kind !== 'template')) {
        const identity = `${def.table}|${merged[def.key].prefix}|${merged[def.key].suffix}`
        const clash = prefixes.get(identity)
        if (clash) return NextResponse.json({ error: `${def.label} and ${clash} would get the same numbers. Give them different prefixes.` }, { status: 400 })
        prefixes.set(identity, def.label)
      }
      const profile = existing as CompanyProfile
      profile.numberSeries = merged
      profile.updatedAt = new Date()
      await ctx.em.flush()
      return NextResponse.json(await view(ctx))
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Document number series (prefix, digits, next number) for orders, invoices, POs, GRNs, QC and more',
  methods: {
    GET: { summary: 'Every number series with its next number', tags: ['Creative Carbon Accounts'], responses: [{ status: 200, description: 'Series', schema: z.object({ items: z.array(z.object({ key: z.string() }).passthrough()) }).passthrough() }] },
    PUT: { summary: 'Change one or more number series', tags: ['Creative Carbon Accounts'], requestBody: { schema: numberSeriesInputSchema }, responses: [{ status: 200, description: 'Saved', schema: z.object({ items: z.array(z.object({ key: z.string() }).passthrough()) }).passthrough() }] },
  },
}

export { GET, PUT }
