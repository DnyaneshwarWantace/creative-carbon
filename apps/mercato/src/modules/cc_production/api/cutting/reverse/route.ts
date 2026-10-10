import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { CuttingEntry } from '../../../data/entities'
import { cuttingReverseSchema } from '../../../data/validators'
import { reverseCutting } from '../../../lib/finishing'
import { PlantError, plantErrorResponse, runPlantGuarded } from '../../../lib/server'
import { logCorrection } from '../../../../cc_audit/lib/activity'
import { reasonIssue } from '../../../../cc_audit/lib/reason'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['cc_production.cutting.enter'] } }

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = cuttingReverseSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Say which cutting entry' }, { status: 400 })
  try {
    const cut = await ctx.em.findOne(CuttingEntry, { id: parsed.data.id, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
    if (!cut) throw new PlantError('Cutting entry not found', 404)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.cutting', resourceId: cut.id, current: cut.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.cutting', resourceId: cut.id, operation: 'custom', payload: parsed.data }, async () => {
      await reverseCutting(ctx, cut, byName)
      return { ok: true }
    })
    if (result instanceof Response) return result
    await logCorrection(ctx, { recordType: 'cutting', recordId: cut.id, action: 'reversed', summary: 'Cutting reversed; the pressed lot is back, the trimmed lot removed', reason: parsed.data.reason ?? '' })
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'Reverse a cutting entry while its trimmed lot is untouched',
  methods: { POST: { summary: 'Reverse cutting', tags: ['Creative Carbon Finishing'], requestBody: { schema: cuttingReverseSchema }, responses: [{ status: 200, description: 'Done', schema: z.object({ ok: z.boolean() }) }] } },
}

export { POST }
