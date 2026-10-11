import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { hasFeatures } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { reasonIssue, requireReasonFor } from '../../../../cc_audit/lib/reason'
import { plantErrorResponse, runPlantGuarded } from '../../../lib/server'
import { approveStocktake, findStocktake, postStocktakeRecord, recountStocktake, reverseStocktake, stocktakeView } from '../../../lib/stocktakes'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_store.adjust'] },
}

const actionSchema = z
  .object({
    id: z.string().uuid(),
    action: z.enum(['recount', 'approve', 'post', 'reverse']),
    lines: z.array(z.object({ lotId: z.string().uuid(), counted: z.coerce.number().min(0).max(100_000_000) })).max(500).optional(),
    reason: z.string().trim().max(500).optional().nullable(),
  })
  .superRefine(requireReasonFor(['recount', 'reverse']))

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = actionSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Invalid action' }, { status: 400 })
  const input = parsed.data
  if ((input.action === 'approve' || input.action === 'reverse') && !(await hasFeatures(ctx, ['cc_store.approve']))) return NextResponse.json({ error: 'Only the store manager can approve or reverse a count' }, { status: 403 })
  if (input.action === 'recount' && !input.lines?.length) return NextResponse.json({ error: 'Give the counted quantities' }, { status: 400 })
  try {
    const row = await findStocktake(ctx, input.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_store.stocktake', resourceId: row.id, current: row.updatedAt, request: req })
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_store.stocktake', resourceId: row.id, operation: 'custom', payload: input }, async () => {
      if (input.action === 'recount') await recountStocktake(ctx, row, input.lines ?? [], input.reason!.trim())
      else if (input.action === 'approve') await approveStocktake(ctx, row, input.reason?.trim() || null)
      else if (input.action === 'post') await postStocktakeRecord(ctx, row)
      else await reverseStocktake(ctx, row, input.reason!.trim())
      return stocktakeView(row)
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Owner',
  summary: 'Recount, approve, post or reverse a stocktake',
  methods: {
    POST: { summary: 'recount (reason); approve (store manager); post (after approval); reverse (store manager, within 7 days, not if stock moved since; reason)', tags: ['Creative Carbon Owner'], requestBody: { schema: actionSchema }, responses: [{ status: 200, description: 'Stocktake', schema: z.object({ id: z.string() }).passthrough() }], errors: [{ status: 409, description: 'Wrong status, too old, or stock moved since' }] },
  },
}

export { POST }
