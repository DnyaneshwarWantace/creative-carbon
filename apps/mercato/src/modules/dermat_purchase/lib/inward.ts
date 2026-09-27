import { QcCheck } from '../../dermat_quality/data/entities'
import { resolveStoreContext } from '../../dermat_store/lib/server'
import { askToReserveArrival } from '../../dermat_planning/lib/arrivalQuestion'
import { GoodsReceipt, GoodsReceiptLine, PurchaseOrder } from '../data/entities'
import { applyDecision } from './service'

export async function applyInwardDecision(req: Request, checkId: string): Promise<void> {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return
  const check = await ctx.em.findOne(QcCheck, { id: checkId, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  if (!check || check.operation !== 'purchase_receipt' || check.status === 'reworked' || check.status === 'rejected') return
  await applyDecision(ctx, check.id, check.status, check.code)
  if (check.status !== 'passed') return
  const line = await ctx.em.findOne(GoodsReceiptLine, { qcCheckId: check.id })
  if (!line) return
  const grn = await ctx.em.findOne(GoodsReceipt, { id: line.grnId })
  const po = grn?.poId ? await ctx.em.findOne(PurchaseOrder, { id: grn.poId }) : null
  const orderIds = (po?.orderRefs ?? []).map((ref) => ref.orderId)
  if (!orderIds.length) return
  await askToReserveArrival(ctx, { productId: line.productId, quantity: Number(line.quantity) - Number(line.returnedQty ?? 0), orderIds, sourceCode: grn?.code ?? check.code })
}
