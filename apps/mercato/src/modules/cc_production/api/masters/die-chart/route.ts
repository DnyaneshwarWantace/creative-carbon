import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { recordActivity } from '../../../../cc_audit/lib/activity'
import { importChart, parseChartWorkbook } from '../../../lib/dieChart'
import { plantErrorResponse, runPlantGuarded } from '../../../lib/server'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['cc_production.masters.manage'] } }

const MAX_BYTES = 10 * 1024 * 1024

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  try {
    const form = await req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose the Excel file' }, { status: 400 })
    if (file.size > MAX_BYTES) return NextResponse.json({ error: 'The file is larger than 10 MB' }, { status: 400 })
    if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: 'Upload the .xlsx file' }, { status: 400 })
    const dryRun = String(form?.get('dryRun') ?? 'true') !== 'false'
    const buffer = Buffer.from(await file.arrayBuffer())
    const parsed = await parseChartWorkbook(buffer).catch(() => null)
    if (!parsed) return NextResponse.json({ error: 'This is not the die chart, the rod & tube cavity list or the rod stock list' }, { status: 400 })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.die_chart', resourceId: file.name, operation: dryRun ? 'custom' : 'create', payload: { fileName: file.name, dryRun } }, async () => {
      const report = await importChart(ctx, parsed, { dryRun, byName, fileName: file.name })
      if (!dryRun && (report.created || report.updated)) {
        recordActivity(ctx.em, ctx, { recordType: 'master', recordId: ctx.organizationId, action: 'chart_imported', kind: 'change', summary: `${file.name}: ${report.created} new, ${report.updated} updated, ${report.unchanged} unchanged`, actorUserId: ctx.userId ?? null, actorName: byName })
        await ctx.em.flush()
      }
      return { ...report, dryRun, fileName: file.name }
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Masters',
  summary: 'Import the client die chart (fibre bearing, key, hanger, inside bearing, plates), the rod & tube cavity list, or the rod stock list',
  methods: { POST: { summary: 'Upload the .xlsx (multipart: file, dryRun) and get created / updated / unchanged counts', tags: ['Creative Carbon Masters'], responses: [{ status: 200, description: 'Report', schema: z.object({ kind: z.string() }).passthrough() }] } },
}

export { POST }
