import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { fgActionSchema } from '../../../data/validators'
import { fgReportView, findFgReport, postFgReport, reopenFgReport } from '../../../lib/finishing'
import { plantErrorResponse, runPlantGuarded } from '../../../lib/server'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['cc_production.quality.enter'] } }

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = fgActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Say which report and what to do' }, { status: 400 })
  try {
    const report = await findFgReport(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.fg_inspection', resourceId: report.id, current: report.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.fg_inspection', resourceId: report.id, operation: 'custom', payload: parsed.data }, async () =>
      fgReportView(parsed.data.action === 'post' ? await postFgReport(ctx, report, byName) : await reopenFgReport(ctx, report, byName)),
    )
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'Post an FG inspection report (passed pieces into the FG store as finished lots, rejected pieces to scrap) or reopen it',
  methods: { POST: { summary: 'Post or reopen', tags: ['Creative Carbon Finishing'], requestBody: { schema: fgActionSchema }, responses: [{ status: 200, description: 'Report', schema: z.object({}).passthrough() }] } },
}

export { POST }
