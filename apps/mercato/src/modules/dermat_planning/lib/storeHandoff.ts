import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { DermatOrder } from '../../dermat_orders/data/entities'
import { currentUserName, type OrderContext } from '../../dermat_orders/lib/server'
import { LOCATION_CODES, dermatWarehouse, isUsable, lotsAtLocation, variantsForProducts } from '../../dermat_products/lib/stock'
import { PlanningPlan } from '../data/entities'
import { PlanningError, calculate, round } from './service'

const logger = createLogger('dermat_planning')

export async function findPlan(ctx: OrderContext, id: string): Promise<PlanningPlan> {
  const plan = await ctx.em.findOne(PlanningPlan, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!plan) throw new PlanningError('Plan not found', 404)
  return plan
}

export async function pickList(ctx: OrderContext, plan: PlanningPlan) {
  const items = plan.items ?? []
  if (!items.length) throw new PlanningError('This plan has no orders or products in it', 409)
  const calc = await calculate(ctx, items)
  const orderIds = [...new Set(items.map((item) => item.orderId).filter((id): id is string => Boolean(id)))]
  const orders = orderIds.length ? await ctx.em.find(DermatOrder, { id: { $in: orderIds }, tenantId: ctx.tenantId, organizationId: ctx.organizationId }) : []
  const warehouse = await dermatWarehouse(ctx)
  const variants = await variantsForProducts(ctx, calc.rows.map((row) => row.productId))
  const rmId = warehouse?.locations.get(LOCATION_CODES.rm)
  const pmId = warehouse?.locations.get(LOCATION_CODES.pm)
  const allVariants = Array.from(variants.values())
  const lots = [
    ...(rmId && allVariants.length ? (await lotsAtLocation(ctx, allVariants, rmId)).map((lot) => ({ ...lot, store: 'RM store' })) : []),
    ...(pmId && allVariants.length ? (await lotsAtLocation(ctx, allVariants, pmId)).map((lot) => ({ ...lot, store: 'PM store' })) : []),
  ]
  const rows = calc.rows.map((row) => {
    const variantId = variants.get(row.productId)
    const usable = lots
      .filter((lot) => lot.variantId === variantId && isUsable(lot))
      .sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999'))
    const allowed = round(Math.min(row.required, row.free + row.reservedHere))
    let left = allowed
    const pick: Array<{ lotNumber: string | null; store: string; quantity: number; expiresAt: string | null }> = []
    for (const lot of usable) {
      if (left <= 0.0001) break
      const take = round(Math.min(left, lot.onHand))
      if (take <= 0) continue
      pick.push({ lotNumber: lot.lotNumber, store: lot.store, quantity: take, expiresAt: lot.expiresAt })
      left = round(left - take)
    }
    return {
      productId: row.productId,
      code: row.code,
      title: row.title,
      kind: row.kind,
      unit: row.unit,
      store: row.kind === 'raw_material' ? 'RM store' : 'PM store',
      required: row.required,
      reserved: row.reservedHere,
      short: row.short,
      underTest: row.underTest,
      onOrder: row.onOrder,
      pick,
      notInStore: round(Math.max(0, row.required - allowed + left)),
      heldForOthers: round(Math.max(0, Math.min(row.required - allowed, row.inStore - row.free - row.reservedHere))),
      orders: row.sources.filter((source) => source.orderNo).map((source) => ({ orderNo: source.orderNo, required: source.required })),
    }
  })
  rows.sort((a, b) => a.store.localeCompare(b.store) || (a.code ?? a.title).localeCompare(b.code ?? b.title))
  return {
    plan: planView(plan),
    orders: orders.map((order) => ({ id: order.id, orderNo: order.orderNo, deliveryDate: order.deliveryDate ?? null })),
    rows,
    missingBoms: calc.missingBoms,
  }
}

export function planView(plan: PlanningPlan) {
  return {
    id: plan.id,
    code: plan.code,
    name: plan.name,
    notes: plan.notes ?? null,
    items: plan.items ?? [],
    createdByName: plan.createdByName ?? null,
    storeStatus: plan.storeStatus ?? null,
    sentAt: plan.sentAt ? plan.sentAt.toISOString() : null,
    sentByName: plan.sentByName ?? null,
    prepareBy: plan.prepareBy ?? null,
    storeNote: plan.storeNote ?? null,
    storeUpdatedAt: plan.storeUpdatedAt ? plan.storeUpdatedAt.toISOString() : null,
    storeByName: plan.storeByName ?? null,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  }
}

async function notify(ctx: OrderContext, input: { type: string; feature: string; title: string; body: string; plan: PlanningPlan }) {
  try {
    const service = resolveNotificationService(ctx.container as unknown as { resolve: (name: string) => unknown })
    await service.createForFeature(
      { type: input.type, requiredFeature: input.feature, title: input.title, body: input.body, severity: 'info', sourceModule: 'dermat_planning', sourceEntityType: 'dermat_planning:plan', sourceEntityId: input.plan.id, linkHref: `/backend/store/plans?id=${input.plan.id}` },
      { tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    )
  } catch (error) {
    logger.error('Failed to send plan notification', { err: error })
  }
}

export async function sendToStore(ctx: OrderContext, plan: PlanningPlan, input: { prepareBy: string | null; note: string | null }) {
  if (!(plan.items ?? []).length) throw new PlanningError('Add orders to the plan before sending it', 409)
  const byName = await currentUserName(ctx)
  plan.storeStatus = 'sent'
  plan.sentAt = new Date()
  plan.sentByName = byName
  plan.prepareBy = input.prepareBy
  plan.storeNote = input.note
  plan.storeUpdatedAt = new Date()
  plan.storeByName = null
  plan.updatedAt = new Date()
  await ctx.em.flush()
  await notify(ctx, {
    type: 'dermat_planning.plan.sent',
    feature: 'dermat_store.issue',
    title: `Prepare material for plan ${plan.code}`,
    body: [`${plan.name}`, input.prepareBy ? `ready by ${input.prepareBy}` : null, byName ? `from ${byName}` : null, input.note].filter(Boolean).join(' · '),
    plan,
  })
}

export async function storeUpdate(ctx: OrderContext, plan: PlanningPlan, input: { status: 'preparing' | 'ready'; note: string | null }) {
  if (!plan.storeStatus) throw new PlanningError('This plan has not been sent to the store', 409)
  const byName = await currentUserName(ctx)
  plan.storeStatus = input.status
  plan.storeUpdatedAt = new Date()
  plan.storeByName = byName
  if (input.note) plan.storeNote = input.note
  plan.updatedAt = new Date()
  await ctx.em.flush()
  if (input.status === 'ready') {
    await notify(ctx, {
      type: 'dermat_planning.plan.ready',
      feature: 'dermat_planning.reserve',
      title: `Store has material ready for plan ${plan.code}`,
      body: [plan.name, byName ? `by ${byName}` : null, input.note].filter(Boolean).join(' · '),
      plan,
    })
  }
}
