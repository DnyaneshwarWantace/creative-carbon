import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, hasFeatures, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { tcIdSchema } from '../../../data/validators'
import { certificateView, findCertificate, issueCertificate, issueCheck } from '../../../lib/tc'
import { plantErrorResponse, runPlantGuarded } from '../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_production.quality.enter'] },
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = tcIdSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Send the certificate id' }, { status: 400 })
  try {
    const row = await findCertificate(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.tc', resourceId: row.id, current: row.updatedAt, request: req })
    const check = issueCheck(row, await hasFeatures(ctx, ['cc_production.quality.release']))
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 409 })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.tc', resourceId: row.id, operation: 'custom', payload: parsed.data }, async () => certificateView(ctx, await issueCertificate(ctx, row, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Quality',
  summary: 'Issue a test certificate once every value is in and OK (or the Director approves the reason)',
  methods: { POST: { summary: 'Issue', tags: ['Creative Carbon Quality'], requestBody: { schema: tcIdSchema }, responses: [{ status: 200, description: 'Issued', schema: z.object({}).passthrough() }], errors: [{ status: 409, description: 'Something is missing or Not OK' }] } },
}

export { POST }
