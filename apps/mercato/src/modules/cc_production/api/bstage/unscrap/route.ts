import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { reasonIssue, requireReasonFor } from '../../../../cc_audit/lib/reason'
import { undoScrap } from '../../../lib/bstage'
import { plantErrorResponse, runPlantGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_production.bstage.manage'] },
}

const unscrapSchema = z.object({ lotId: z.string().uuid(), movementId: z.string().uuid(), reason: z.string().trim().max(500).optional() }).superRefine(requireReasonFor([]))

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = unscrapSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Invalid request' }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.bstage_lot', resourceId: parsed.data.lotId, operation: 'custom', payload: parsed.data }, () => undoScrap(ctx, { ...parsed.data, reason: parsed.data.reason!.trim() }, byName))
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Coating',
  summary: 'Undo a B-stage scrap within 7 days (reason needed); a linked counter-entry puts the kg back',
  methods: { POST: { summary: 'Undo scrap', tags: ['Creative Carbon Coating'], requestBody: { schema: unscrapSchema }, responses: [{ status: 200, description: 'Lot', schema: z.object({}).passthrough() }], errors: [{ status: 409, description: 'Already undone or too old' }] } },
}

export { POST }
