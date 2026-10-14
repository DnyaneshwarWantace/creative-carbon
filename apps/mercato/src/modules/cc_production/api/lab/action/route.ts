import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { labActionSchema } from '../../../data/validators'
import { amendLabTest, findLabTest, issueLabTest, labDetail } from '../../../lib/lab'
import { plantErrorResponse, runPlantGuarded } from '../../../lib/server'
import { logCorrection, recordActivity } from '../../../../cc_audit/lib/activity'
import { reasonIssue } from '../../../../cc_audit/lib/reason'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['cc_production.quality.enter'] } }

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = labActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Say which lab test' }, { status: 400 })
  const { action } = parsed.data
  try {
    const row = await findLabTest(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.lab_test', resourceId: row.id, current: row.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.lab_test', resourceId: row.id, operation: 'custom', payload: parsed.data }, async () => {
      if (action === 'issue') {
        await issueLabTest(ctx, row, byName, parsed.data.reason ?? null)
        return { files: 0 }
      }
      const amended = await amendLabTest(ctx, row, byName, parsed.data.reason ?? '')
      return { files: amended.files.length }
    })
    if (result instanceof Response) return result
    if (action === 'issue') {
      recordActivity(ctx.em, ctx, { recordType: 'lab_test', recordId: row.id, action: 'issued', kind: 'document', summary: `Report${row.revision ? ` Rev ${row.revision}` : ''} issued to ${row.customerName ?? 'the customer'}`, actorUserId: ctx.userId ?? null, actorName: byName })
      await ctx.em.flush()
    } else {
      await logCorrection(ctx, { recordType: 'lab_test', recordId: row.id, action: 'amended', summary: `Amended to Rev ${row.revision}; ${result.files} earlier report file${result.files === 1 ? '' : 's'} kept as superseded`, reason: parsed.data.reason ?? '', changes: [{ field: 'revision', label: 'Revision', from: row.revision - 1, to: row.revision }] })
    }
    return NextResponse.json(await labDetail(ctx, row))
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Finishing',
  summary: 'Issue a lab report to the customer, or amend an issued one into a new revision',
  methods: { POST: { summary: 'Lab report issue / amend', tags: ['Creative Carbon Finishing'], requestBody: { schema: labActionSchema }, responses: [{ status: 200, description: 'Lab test', schema: z.object({}).passthrough() }] } },
}

export { POST }
