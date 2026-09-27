import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { DermatOrder } from '../../dermat_orders/data/entities'
import { loadProducts, type OrderContext } from '../../dermat_orders/lib/server'
import { round } from './service'

const logger = createLogger('dermat_planning')

export async function askToReserveArrival(ctx: OrderContext, input: { productId: string; quantity: number; orderIds: string[]; sourceCode: string }) {
  if (!input.orderIds.length || input.quantity <= 0) return false
  const orders = await ctx.em.find(
    DermatOrder,
    { id: { $in: input.orderIds }, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, status: { $nin: ['cancelled', 'completed'] } },
    { orderBy: { deliveryDate: 'asc' } },
  )
  if (!orders.length) return false
  try {
    const product = (await loadProducts(ctx, [input.productId])).get(input.productId)
    const service = resolveNotificationService(ctx.container as unknown as { resolve: (name: string) => unknown })
    await service.createForFeature(
      {
        type: 'dermat_planning.reservation.arrived',
        requiredFeature: 'dermat_planning.reserve',
        title: `${product?.title ?? 'Material'} arrived for ${orders.map((order) => order.orderNo).join(', ')}: reserve it?`,
        body: `${round(input.quantity)} ${product?.unit ?? ''} passed QC on ${input.sourceCode}. It is free stock until you reserve it. Open the Planning board to decide which order gets it.`,
        severity: 'info',
        sourceModule: 'dermat_planning',
        sourceEntityType: 'dermat_orders:order',
        sourceEntityId: orders[0].id,
        linkHref: `/backend/planning?orders=${orders.map((order) => order.id).join(',')}`,
      },
      { tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    )
    return true
  } catch (error) {
    logger.error('Failed to send arrival question', { err: error })
    return false
  }
}
