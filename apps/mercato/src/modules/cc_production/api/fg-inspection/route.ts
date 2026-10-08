import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { fgReportInputSchema, fgReportUpdateSchema, finishingListSchema } from '../../data/validators'
import { fgReportView, findFgReport, listFgReports, saveFgReport } from '../../lib/finishing'
import { plantErrorResponse, runPlantGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.quality.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_production.quality.enter'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_production.quality.enter'] },
}

function inputError(error: z.ZodError) {
  const path = error.issues[0]?.path ?? []
  return path[0] === 'rows' ? `Row ${typeof path[1] === 'number' ? path[1] + 1 : ''}: check ${String(path[2] ?? 'the row')}` : 'Check the report'
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = finishingListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json(fgReportView(await findFgReport(ctx, parsed.data.id)))
    return NextResponse.json({ items: await listFgReports(ctx, parsed.data.month ?? null) })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = fgReportInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: inputError(parsed.error) }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.fg_inspection', resourceId: 'new', operation: 'create', payload: parsed.data }, async () => fgReportView(await saveFgReport(ctx, null, parsed.data, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = fgReportUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: inputError(parsed.error) }, { status: 400 })
  try {
    const report = await findFgReport(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.fg_inspection', resourceId: report.id, current: report.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.fg_inspection', resourceId: report.id, operation: 'update', payload: parsed.data }, async () => fgReportView(await saveFgReport(ctx, report, parsed.data, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'Finished goods inspection test report CCCPL/F/QC/04',
  methods: {
    GET: { summary: 'List reports (?month=) or one (?id=)', tags: ['Creative Carbon Finishing'], query: finishingListSchema, responses: [{ status: 200, description: 'Reports', schema: z.object({}).passthrough() }] },
    POST: { summary: 'New report (not posted)', tags: ['Creative Carbon Finishing'], requestBody: { schema: fgReportInputSchema }, responses: [{ status: 201, description: 'Report', schema: z.object({}).passthrough() }] },
    PUT: { summary: 'Change a report that is not posted', tags: ['Creative Carbon Finishing'], requestBody: { schema: fgReportUpdateSchema }, responses: [{ status: 200, description: 'Report', schema: z.object({}).passthrough() }] },
  },
}

export { GET, POST, PUT }
