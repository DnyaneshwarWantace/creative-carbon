import { QcCheck } from '../../dermat_quality/data/entities'
import { resolveStoreContext } from '../../dermat_store/lib/server'
import { applyDecision } from './service'

export async function applyInwardDecision(req: Request, checkId: string): Promise<void> {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return
  const check = await ctx.em.findOne(QcCheck, { id: checkId, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  if (!check || check.operation !== 'purchase_receipt' || check.status === 'reworked' || check.status === 'rejected') return
  await applyDecision(ctx, check.id, check.status, check.code)
}
