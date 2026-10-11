import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, hasFeatures } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { ThicknessInspection } from '../../../data/entities'
import { thicknessActionSchema } from '../../../data/validators'
import { correctThickness, releaseThicknessHold, thicknessView } from '../../../lib/finishing'
import { PlantError, plantErrorResponse, runPlantGuarded } from '../../../lib/server'
import { logCorrection } from '../../../../cc_audit/lib/activity'
import { reasonIssue } from '../../../../cc_audit/lib/reason'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['cc_production.quality.view'] } }

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = thicknessActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Enter all 12 readings in mm' }, { status: 400 })
  const { action } = parsed.data
  const needed = action === 'release' ? 'cc_production.quality.release' : 'cc_production.quality.enter'
  if (!(await hasFeatures(ctx, [needed]))) return NextResponse.json({ error: action === 'release' ? 'Releasing a thickness hold needs the quality release right' : 'You cannot correct quality readings' }, { status: 403 })
  if (action === 'correct' && !parsed.data.readings) return NextResponse.json({ error: 'Enter all 12 readings in mm' }, { status: 400 })
  try {
    const row = await ctx.em.findOne(ThicknessInspection, { id: parsed.data.id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
    if (!row) throw new PlantError('Thickness inspection not found', 404)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.thickness', resourceId: row.id, current: row.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const reason = parsed.data.reason ?? ''
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.thickness', resourceId: row.id, operation: 'custom', payload: parsed.data }, async () => {
      if (action === 'release') {
        await releaseThicknessHold(ctx, row, byName, reason)
        return { changes: [{ field: 'result', label: 'Result', from: 'hold', to: 'released' }] }
      }
      const corrected = await correctThickness(ctx, row, parsed.data.readings!, byName)
      return { changes: corrected.changes }
    })
    if (result instanceof Response) return result
    if (action === 'release') await logCorrection(ctx, { recordType: 'thickness', recordId: row.id, action: 'hold_released', summary: row.lotId ? 'Hold released; the lot is free for FG inspection' : 'Hold released', reason, changes: result.changes })
    else await logCorrection(ctx, { recordType: 'thickness', recordId: row.id, action: 'reading_corrected', summary: `Readings corrected; ${row.outOfTolerance} of 12 out, ${row.result}`, reason, changes: result.changes })
    return NextResponse.json(thicknessView(row))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'Correct thickness readings (24 hours, before FG inspection) or release a hold',
  methods: { POST: { summary: 'Thickness correction', tags: ['Creative Carbon Finishing'], requestBody: { schema: thicknessActionSchema }, responses: [{ status: 200, description: 'Inspection', schema: z.object({}).passthrough() }] } },
}

export { POST }
