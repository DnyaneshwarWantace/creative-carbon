import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { currentUserName, hasFeatures } from '../../../lib/server'
import { orderErrorResponse, runGuarded } from '../../../lib/guard'
import { correctDespatch, despatchView, findDespatch, returnGoods } from '../../../lib/despatch'
import { requireReasonFor, reasonIssue } from '../../../../cc_audit/lib/reason'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_orders.view'] },
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const field = z.string().trim().max(120).nullable().optional()

const bodySchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('correct'), id: z.string().uuid(), reason: z.string().trim().max(500).optional(), fields: z.object({ transporter: field, vehicle_no: field, lr_number: field, container_no: field, seal_no: field, port: field }) })
    .superRefine(requireReasonFor([])),
  z
    .object({ action: z.literal('return'), id: z.string().uuid(), reason: z.string().trim().max(500).optional(), allocationId: z.string().uuid(), qty: z.coerce.number().positive().max(10_000_000), returnedOn: isoDate })
    .superRefine(requireReasonFor([])),
])

const RIGHT: Record<string, string> = { correct: 'cc_orders.work.dispatch', return: 'cc_orders.reopen' }

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Check the details' }, { status: 400 })
  const input = parsed.data
  if (!(await hasFeatures(ctx, [RIGHT[input.action]]))) return NextResponse.json({ error: input.action === 'return' ? 'Only a manager with the reopen right can book a sales return' : 'Only despatch can correct these details' }, { status: 403 })
  try {
    const { stage, order } = await findDespatch(ctx, input.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_orders.despatch', resourceId: stage.id, current: stage.updatedAt, request: req })
    return await runGuarded(ctx, req, { resourceId: order.id, operation: 'custom', payload: input }, async () => {
      const byName = await currentUserName(ctx)
      const reason = input.reason!.trim()
      if (input.action === 'correct') await correctDespatch(ctx, stage, order, { fields: input.fields, reason }, byName)
      else await returnGoods(ctx, stage, order, { allocationId: input.allocationId, qty: input.qty, reason, returnedOn: input.returnedOn }, byName)
      return NextResponse.json(await despatchView(ctx, stage, order))
    })
  } catch (error) {
    return orderErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Orders',
  summary: 'Correct a despatch or book a sales return',
  methods: {
    POST: {
      summary: 'correct: vehicle / LR / container details within 48 hours of despatch; return: goods that came back go into the FG store as a new lot on hold. Both need a reason.',
      tags: ['Creative Carbon Orders'],
      requestBody: { schema: bodySchema },
      responses: [{ status: 200, description: 'The despatch', schema: z.object({ id: z.string() }).passthrough() }],
      errors: [{ status: 409, description: 'Past the 48-hour limit, not despatched, or more than went out' }],
    },
  },
}

export { POST }
