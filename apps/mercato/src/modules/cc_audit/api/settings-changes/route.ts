import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { hasFeatures } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { SettingsChange, type SettingsArea } from '../../data/entities'
import { SETTINGS_AREAS, SettingsError, settingsChangeView, undoAvailability, undoSettingsChange } from '../../lib/settings'
import { reasonIssue, requireReasonFor } from '../../lib/reason'

export const metadata = { GET: { requireAuth: true }, POST: { requireAuth: true } }

const AREAS = Object.keys(SETTINGS_AREAS) as [SettingsArea, ...SettingsArea[]]
const querySchema = z.object({ id: z.string().uuid().optional(), area: z.enum(AREAS).optional() })
const undoSchema = z.object({ id: z.string().uuid(), reason: z.string().trim().max(500).optional() }).superRefine(requireReasonFor([]))

type Ctx = Exclude<Awaited<ReturnType<typeof resolveStoreContext>>, { error: string }>

async function mayUse(ctx: Ctx, change: Pick<SettingsChange, 'area' | 'settingKey'>): Promise<boolean> {
  for (const feature of SETTINGS_AREAS[change.area].features(change.settingKey)) if (await hasFeatures(ctx, [feature])) return true
  return false
}

function failure(error: unknown) {
  if (error instanceof SettingsError) return NextResponse.json({ error: error.message }, { status: error.status })
  if (error instanceof CrudHttpError) return NextResponse.json(error.body, { status: error.status })
  if (error instanceof Error && 'status' in error && typeof (error as { status: unknown }).status === 'number') return NextResponse.json({ error: error.message }, { status: (error as { status: number }).status })
  throw error
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  try {
    if (parsed.data.id) {
      const change = await ctx.em.findOne(SettingsChange, { ...scope, id: parsed.data.id })
      if (!change || !(await mayUse(ctx, change))) return NextResponse.json({ error: 'Change not found' }, { status: 404 })
      const check = await undoAvailability(ctx, change)
      return NextResponse.json({ ...settingsChangeView(change), ...check })
    }
    const rows = await ctx.em.find(SettingsChange, { ...scope, ...(parsed.data.area ? { area: parsed.data.area } : {}) }, { orderBy: { createdAt: 'desc' }, limit: 200 })
    const visible = []
    for (const row of rows) if (await mayUse(ctx, row)) visible.push(settingsChangeView(row))
    return NextResponse.json({ items: visible })
  } catch (error) {
    return failure(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = undoSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Say which change' }, { status: 400 })
  try {
    const change = await ctx.em.findOne(SettingsChange, { id: parsed.data.id, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
    if (!change) return NextResponse.json({ error: 'Change not found' }, { status: 404 })
    if (!(await mayUse(ctx, change))) return NextResponse.json({ error: 'Undoing this needs the same right as changing it' }, { status: 403 })
    enforceCommandOptimisticLock({ resourceKind: 'cc_audit.settings_change', resourceId: change.id, current: change.updatedAt, request: req })
    await undoSettingsChange(ctx, change, parsed.data.reason ?? '')
    return NextResponse.json(settingsChangeView(change))
  } catch (error) {
    return failure(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Audit',
  summary: 'One change log for every settings screen (lists, number series, company, Tally, order stages), with undo for 7 days',
  methods: {
    GET: { summary: 'Settings changes (?area=) or one (?id=) with what blocks its undo', tags: ['Creative Carbon Audit'], query: querySchema, responses: [{ status: 200, description: 'Changes', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Undo a settings change (old value restored and logged)', tags: ['Creative Carbon Audit'], requestBody: { schema: undoSchema }, responses: [{ status: 200, description: 'Change', schema: z.object({}).passthrough() }], errors: [{ status: 409, description: 'Too old, changed again since, or the number series is already used' }] },
  },
}

export { GET, POST }
