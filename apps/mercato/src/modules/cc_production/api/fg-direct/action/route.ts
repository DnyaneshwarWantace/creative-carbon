import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { FgDirectIn } from '../../../data/entities'
import { directInActionSchema } from '../../../data/validators'
import { correctDirectIn, reverseDirectIn } from '../../../lib/finishing'
import { PlantError, plantErrorResponse, runPlantGuarded } from '../../../lib/server'
import { logCorrection } from '../../../../cc_audit/lib/activity'
import type { ActivityChange } from '../../../../cc_audit/data/entities'
import { reasonIssue } from '../../../../cc_audit/lib/reason'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['cc_store.adjust'] } }

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = directInActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Check the entry' }, { status: 400 })
  const input = parsed.data
  try {
    const record = await ctx.em.findOne(FgDirectIn, { id: input.id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
    if (!record) throw new PlantError('Bought-in entry not found', 404)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.direct_in', resourceId: record.id, current: record.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.direct_in', resourceId: record.id, operation: 'custom', payload: input }, async () => {
      if (input.action === 'reverse') {
        await reverseDirectIn(ctx, record, byName)
        return { changes: [] as ActivityChange[] }
      }
      return {
        changes: await correctDirectIn(ctx, record, { supplier: input.supplier ?? record.supplier, invoiceNo: input.invoiceNo === undefined ? record.invoiceNo ?? null : input.invoiceNo, sheetSize: input.sheetSize === undefined ? record.sheetSize ?? null : input.sheetSize, thicknessMm: input.thicknessMm === undefined ? (record.thicknessMm ? Number(record.thicknessMm) : null) : input.thicknessMm }, byName),
      }
    })
    if (result instanceof Response) return result
    const links = record.lotId ? [{ type: 'lot', id: record.lotId, label: record.lotNumber ?? null }] : []
    if (input.action === 'reverse') await logCorrection(ctx, { recordType: 'fg_direct_in', recordId: record.id, action: 'reversed', summary: `Bought-in reversed; ${record.lotNumber ?? 'the lot'} taken out of FG stock`, reason: input.reason ?? '', links })
    else await logCorrection(ctx, { recordType: 'fg_direct_in', recordId: record.id, action: 'corrected', summary: 'Entry details corrected', reason: input.reason ?? '', changes: result.changes })
    if (record.lotId && input.action === 'reverse') await logCorrection(ctx, { recordType: 'lot', recordId: record.lotId, action: 'reversed', summary: 'Bought-in receipt reversed', reason: input.reason ?? '', links: [{ type: 'fg_direct_in', id: record.id, label: record.supplier }] })
    return NextResponse.json({ ok: true, status: record.status, updatedAt: record.updatedAt.toISOString() })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'Reverse bought-in goods while the lot is unused, or correct the paperwork details',
  methods: { POST: { summary: 'Bought-in correction', tags: ['Creative Carbon Finishing'], requestBody: { schema: directInActionSchema }, responses: [{ status: 200, description: 'Done', schema: z.object({ ok: z.boolean() }).passthrough() }] } },
}

export { POST }
