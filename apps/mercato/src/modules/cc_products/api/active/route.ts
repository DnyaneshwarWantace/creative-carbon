import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../cc_orders/lib/server'
import { resolveStoreContext, runCommand } from '../../../cc_store/lib/server'
import { changeRuleError, logProductChange, productSnapshot, stockOnHand } from '../../lib/changeLog'
import { reasonIssue, requireReasonFor } from '../../../cc_audit/lib/reason'

export const metadata = { POST: { requireAuth: true, requireFeatures: ['cc_production.masters.manage'] } }

const activeSchema = z.object({ id: z.string().uuid(), active: z.boolean(), reason: z.string().trim().max(500).optional() }).superRefine(requireReasonFor([]))

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = activeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Say which item' }, { status: 400 })
  const { id, active } = parsed.data
  const reason = parsed.data.reason ?? ''
  const current = await productSnapshot(ctx, id)
  if (!current) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  if (current.snapshot.isActive === active) return NextResponse.json({ error: active ? 'This item is already active' : 'This item is already inactive' }, { status: 409 })
  const [row] = await ctx.em.getConnection().execute<Array<{ updated_at: Date }>>('select updated_at from catalog_products where id = ?', [id])
  try {
    enforceCommandOptimisticLock({ resourceKind: 'catalog.product', resourceId: id, current: row.updated_at, request: req })
  } catch (error) {
    const status = (error as { status?: number }).status ?? 409
    return NextResponse.json({ error: 'This item was changed by someone else. Reload and try again.' }, { status })
  }
  const blocked = changeRuleError(current.snapshot, { isActive: active }, await stockOnHand(ctx, id), reason)
  if (blocked) return NextResponse.json({ error: blocked.message }, { status: blocked.status })
  await runCommand(ctx, 'catalog.products.update', { id, isActive: active })
  const after = await productSnapshot(ctx, id)
  logProductChange(ctx, { productId: id, before: current.snapshot, after: after?.snapshot ?? { ...current.snapshot, isActive: active }, labels: current.labels, reason, byName: await currentUserName(ctx) })
  await ctx.em.flush()
  return NextResponse.json({ ok: true, active })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Items',
  summary: 'Set an item inactive (hidden on new entries; refused while stock is on hand) or active again',
  methods: { POST: { summary: 'Set active / inactive', tags: ['Creative Carbon Items'], requestBody: { schema: activeSchema }, responses: [{ status: 200, description: 'Done', schema: z.object({ ok: z.boolean(), active: z.boolean() }) }], errors: [{ status: 409, description: 'Stock on hand or changed by someone else' }] } },
}

export { POST }
