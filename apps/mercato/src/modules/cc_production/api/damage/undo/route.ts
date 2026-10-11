import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { DamageEntry } from '../../../data/entities'
import { damageUndoSchema } from '../../../data/validators'
import { undoDamage } from '../../../lib/finishing'
import { PlantError, plantErrorResponse, runPlantGuarded } from '../../../lib/server'
import { logCorrection } from '../../../../cc_audit/lib/activity'
import { reasonIssue } from '../../../../cc_audit/lib/reason'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['cc_store.adjust'] } }

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = damageUndoSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Say which damage entry' }, { status: 400 })
  try {
    const record = await ctx.em.findOne(DamageEntry, { id: parsed.data.id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
    if (!record) throw new PlantError('Damage entry not found', 404)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.damage', resourceId: record.id, current: record.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.damage', resourceId: record.id, operation: 'custom', payload: parsed.data }, async () => {
      await undoDamage(ctx, record, byName)
      return { ok: true }
    })
    if (result instanceof Response) return result
    const reason = parsed.data.reason ?? ''
    await logCorrection(ctx, { recordType: 'damage', recordId: record.id, action: 'undone', summary: `Write-off undone; ${Number(record.kg)} back in ${record.lotNumber ?? 'the lot'}`, reason, links: [{ type: 'lot', id: record.lotId, label: record.lotNumber ?? null }] })
    await logCorrection(ctx, { recordType: 'lot', recordId: record.lotId, action: 'damage_undone', summary: `Damage write-off of ${Number(record.kg)} undone`, reason, links: [{ type: 'damage', id: record.id, label: record.reason }] })
    return NextResponse.json({ ok: true, status: record.status, updatedAt: record.updatedAt.toISOString() })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'Undo a damage write-off within 7 days',
  methods: { POST: { summary: 'Undo damage', tags: ['Creative Carbon Finishing'], requestBody: { schema: damageUndoSchema }, responses: [{ status: 200, description: 'Done', schema: z.object({ ok: z.boolean() }).passthrough() }] } },
}

export { POST }
