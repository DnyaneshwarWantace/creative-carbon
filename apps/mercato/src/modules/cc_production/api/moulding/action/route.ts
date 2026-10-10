import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, hasFeatures } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { MouldingEntry } from '../../../data/entities'
import { mouldingActionSchema } from '../../../data/validators'
import { mouldingDay, postShift, reopenEntry, shiftVersion, signShift } from '../../../lib/moulding'
import { PlantError, plantErrorResponse, runPlantGuarded } from '../../../lib/server'
import { logCorrection } from '../../../../cc_audit/lib/activity'
import { reasonIssue } from '../../../../cc_audit/lib/reason'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_production.moulding.view'] },
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = mouldingActionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Say which day, shift and what to do' }, { status: 400 })
  const { entryDate, shift, action, pressId } = parsed.data
  const signing = action.startsWith('sign_')
  if (!(await hasFeatures(ctx, [signing ? 'cc_production.moulding.sign' : 'cc_production.moulding.enter']))) return NextResponse.json({ error: signing ? 'You cannot sign the moulding register' : 'You cannot post moulding entries' }, { status: 403 })
  try {
    const existing = await ctx.em.find(MouldingEntry, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, entryDate, shift, deletedAt: null })
    if (!signing) enforceCommandOptimisticLock({ resourceKind: 'cc_production.moulding_shift', resourceId: `${entryDate}:${shift}`, current: shiftVersion(existing), request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.moulding_shift', resourceId: `${entryDate}:${shift}`, operation: 'custom', payload: parsed.data }, async () => {
      let errors: string[] = []
      if (action === 'post') errors = (await postShift(ctx, entryDate, shift, pressId ?? null, byName)).errors
      else if (action === 'reopen') {
        if (!pressId) throw new PlantError('Say which machine to reopen')
        await reopenEntry(ctx, entryDate, shift, pressId, byName)
        const entry = existing.find((row) => row.pressId === pressId)
        if (entry) await logCorrection(ctx, { recordType: 'moulding_entry', recordId: entry.id, action: 'reopened', summary: 'Reopened; chindi, cloth and the moulded lot reversed', reason: parsed.data.reason ?? '' })
      } else await signShift(ctx, entryDate, shift, action, byName)
      return { ...(await mouldingDay(ctx, entryDate)), errors }
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Moulding',
  summary: 'Post a shift (or one machine), reopen a machine, or sign the shift',
  methods: {
    POST: {
      summary: 'Post: chindi, cloth and B-stage out, moulded lot in (pieces; kg = pieces × article weight). Reopen while the lot is untouched. Sign-offs never block posting.',
      tags: ['Creative Carbon Moulding'],
      requestBody: { schema: mouldingActionSchema },
      responses: [{ status: 200, description: 'Day', schema: z.object({}).passthrough() }],
      errors: [{ status: 409, description: 'Not enough stock, lot already used, or changed by someone else' }],
    },
  },
}

export { POST }
