import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, hasFeatures } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { clashPickSchema } from '../../../data/validators'
import { clashEditFeature, clashView, findClash, pickVersion } from '../../../lib/clashes'
import { plantErrorResponse, runPlantGuarded } from '../../../lib/server'
import { logCorrection } from '../../../../cc_audit/lib/activity'
import { reasonIssue } from '../../../../cc_audit/lib/reason'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['cc_production.owner.view'] } }

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = clashPickSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Say which version to keep' }, { status: 400 })
  try {
    const clash = await findClash(ctx, parsed.data.id)
    const feature = clashEditFeature(clash)
    if (parsed.data.keep === 'server' && feature && !(await hasFeatures(ctx, [feature]))) return NextResponse.json({ error: 'Putting the other version back needs the right to edit that register' }, { status: 403 })
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.sync_clash', resourceId: clash.id, current: clash.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const reason = parsed.data.reason ?? ''
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.sync_clash', resourceId: clash.id, operation: 'custom', payload: parsed.data }, async () => clashView(await pickVersion(ctx, clash, parsed.data.keep, byName, reason)))
    if (result instanceof Response) return result
    const kept = parsed.data.keep === 'offline' ? 'the offline save' : 'the version it overwrote'
    await logCorrection(ctx, { recordType: 'sync_clash', recordId: clash.id, action: 'resolved', summary: `Kept ${kept}; the other version stays in this clash`, reason, changes: [{ field: 'kept', label: 'Version kept', from: 'offline (last save wins)', to: parsed.data.keep === 'offline' ? 'offline' : 'earlier version' }] })
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Owner',
  summary: 'Settle a sync clash by keeping the offline save or putting back the version it overwrote',
  methods: { POST: { summary: 'Pick a version', tags: ['Creative Carbon Owner'], requestBody: { schema: clashPickSchema }, responses: [{ status: 200, description: 'Clash', schema: z.object({}).passthrough() }] } },
}

export { POST }
