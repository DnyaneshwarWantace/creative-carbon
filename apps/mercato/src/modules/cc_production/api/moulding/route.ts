import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { MouldingEntry } from '../../data/entities'
import { mouldingDaySchema, mouldingShiftSchema } from '../../data/validators'
import { mouldingDay, mouldingEntryView, saveShift, shiftVersion } from '../../lib/moulding'
import { plantErrorResponse, runPlantGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.moulding.view'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_production.moulding.enter'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const params = Object.fromEntries(new URL(req.url).searchParams)
  try {
    if (params.id) return NextResponse.json(await mouldingEntryView(ctx, params.id))
    const parsed = mouldingDaySchema.safeParse(params)
    if (!parsed.success) return NextResponse.json({ error: 'Give the date' }, { status: 400 })
    return NextResponse.json(await mouldingDay(ctx, parsed.data.date))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = mouldingShiftSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path ?? []
    return NextResponse.json({ error: path[0] === 'entries' ? `Machine column ${typeof path[1] === 'number' ? path[1] + 1 : ''}: check ${String(path[2] ?? 'the values')} (die no., weight of article and production are needed)` : 'Check the date and shift' }, { status: 400 })
  }
  try {
    const { entryDate, shift, entries } = parsed.data
    const existing = await ctx.em.find(MouldingEntry, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, entryDate, shift, deletedAt: null })
    if (existing.length) enforceCommandOptimisticLock({ resourceKind: 'cc_production.moulding_shift', resourceId: `${entryDate}:${shift}`, current: shiftVersion(existing), request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.moulding_shift', resourceId: `${entryDate}:${shift}`, operation: 'update', payload: parsed.data }, async () => {
      await saveShift(ctx, entryDate, shift, entries, byName)
      return mouldingDay(ctx, entryDate)
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Moulding',
  summary: 'Moulded products daily production register: machines 1–20, two shifts',
  methods: {
    GET: { summary: 'One day of the register (?date=) or one entry (?id=)', tags: ['Creative Carbon Moulding'], query: mouldingDaySchema, responses: [{ status: 200, description: 'Day', schema: z.object({}).passthrough() }] },
    PUT: {
      summary: 'Save one shift block (all machine columns); posted columns are left as they are',
      tags: ['Creative Carbon Moulding'],
      requestBody: { schema: mouldingShiftSchema },
      responses: [{ status: 200, description: 'Day', schema: z.object({}).passthrough() }],
      errors: [{ status: 409, description: 'Die already on another machine in that shift, or changed by someone else' }],
    },
  },
}

export { GET, PUT }
