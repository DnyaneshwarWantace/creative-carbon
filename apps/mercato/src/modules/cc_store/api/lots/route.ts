import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName } from '../../../cc_orders/lib/server'
import { recordActivity } from '../../../cc_audit/lib/activity'
import { reasonIssue, requireReasonFor } from '../../../cc_audit/lib/reason'
import { StoreError, resolveStoreContext, runCommand, runGuarded, storeErrorResponse } from '../../lib/server'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['cc_store.adjust'] },
}

const statusSchema = z.object({ lotId: z.string().uuid(), status: z.enum(['hold', 'available']), reason: z.string().trim().max(500).optional() }).superRefine(requireReasonFor([]))

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = statusSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Invalid request' }, { status: 400 })
  try {
    const [lot] = await ctx.em.getConnection().execute<Array<{ status: string | null; lot_number: string }>>('select status, lot_number from wms_inventory_lots where id = ? and tenant_id = ? and organization_id = ? and deleted_at is null', [parsed.data.lotId, ctx.tenantId, ctx.organizationId])
    if (!lot) throw new StoreError('Lot not found', 404)
    const from = lot.status ?? 'available'
    if (from === parsed.data.status) throw new StoreError(parsed.data.status === 'hold' ? 'The lot is already on hold' : 'The lot is already available', 409)
    const result = await runGuarded(ctx, req, { resourceKind: 'cc_store.lot', resourceId: parsed.data.lotId, operation: 'custom', payload: parsed.data as Record<string, unknown> }, async () => {
      const reason = parsed.data.reason!.trim()
      await runCommand(ctx, 'wms.lots.update', { id: parsed.data.lotId, status: parsed.data.status, notes: `${parsed.data.status === 'hold' ? 'Put on hold' : 'Released'}: ${reason}` })
      recordActivity(ctx.em, ctx, { recordType: 'lot', recordId: parsed.data.lotId, action: parsed.data.status === 'hold' ? 'held' : 'released', kind: parsed.data.status === 'hold' ? 'correction' : 'change', summary: parsed.data.status === 'hold' ? 'Put on hold; it cannot be issued or allocated' : 'Released; it can be used again', reason, changes: [{ field: 'status', label: 'Status', from, to: parsed.data.status }], actorUserId: ctx.userId ?? null, actorName: await currentUserName(ctx) })
      await ctx.em.flush()
      return { ok: true, status: parsed.data.status }
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return storeErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Store',
  summary: 'Put a lot on hold or release it',
  methods: {
    POST: { summary: 'Change the lot status with a reason (kept in its timeline)', tags: ['Creative Carbon Store'], requestBody: { schema: statusSchema }, responses: [{ status: 200, description: 'Done', schema: z.object({ ok: z.boolean() }) }] },
  },
}

export { POST }
