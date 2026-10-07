import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../../cc_store/lib/server'
import { chemicalIssueCancelSchema } from '../../../../data/validators'
import { cancelIssue, findIssue } from '../../../../lib/chemicals'
import { plantErrorResponse, runPlantGuarded } from '../../../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_production.chemicals.issue'] },
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = chemicalIssueCancelSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Write why the issue is cancelled' }, { status: 400 })
  try {
    const issue = await findIssue(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.chemical_issue', resourceId: issue.id, current: issue.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.chemical_issue', resourceId: issue.id, operation: 'custom', payload: parsed.data }, () => cancelIssue(ctx, issue, parsed.data.reason, byName))
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Resin',
  summary: 'Cancel a chemical issue (stock goes back to the same lots)',
  methods: {
    POST: { summary: 'Cancel a chemical issue', tags: ['Creative Carbon Resin'], requestBody: { schema: chemicalIssueCancelSchema }, responses: [{ status: 200, description: 'Issue', schema: z.object({}).passthrough() }] },
  },
}

export { POST }
