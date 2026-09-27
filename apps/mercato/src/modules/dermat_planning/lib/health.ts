import { resolveNotificationService } from '@open-mercato/core/modules/notifications/lib/notificationService'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { EntityManager } from '@mikro-orm/postgresql'
import { DermatOrder, DermatOrderStage } from '../../dermat_orders/data/entities'
import { loadProducts } from '../../dermat_orders/lib/server'
import { isUsable } from '../../dermat_products/lib/stock'
import { reservationsFor, round, storeLots } from './service'

const logger = createLogger('dermat_planning')
const EPSILON = 0.0001
const DAY_MS = 86400000

type Scope = { em: EntityManager; tenantId: string; organizationId: string }

export type ReservationHealth = {
  reservationId: string
  orderId: string
  orderNo: string
  productId: string
  quantity: number
  backed: number
  missing: number
  needBy: string | null
  ageDays: number
  expiring: { lotNumber: string | null; expiresAt: string; quantity: number } | null
}

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export async function reservationHealth(ctx: Scope, filter: { orderIds?: string[]; productIds?: string[] } = {}): Promise<Map<string, ReservationHealth>> {
  const scoped = await reservationsFor(ctx, filter)
  const productIds = [...new Set(scoped.map((entry) => entry.productId))]
  const result = new Map<string, ReservationHealth>()
  if (!productIds.length) return result
  const reservations = await reservationsFor(ctx, { productIds })
  const orderIds = [...new Set(reservations.map((entry) => entry.orderId))]
  const [orders, stages, { variants, lots }] = await Promise.all([
    ctx.em.find(DermatOrder, { id: { $in: orderIds } }),
    ctx.em.find(DermatOrderStage, { orderId: { $in: orderIds }, stageKey: { $in: ['planning', 'manufacturing'] } }),
    storeLots(ctx, productIds),
  ])
  const needBy = new Map<string, string | null>()
  for (const order of orders) {
    const own = stages.filter((stage) => stage.orderId === order.id)
    const planned = own.find((stage) => stage.stageKey === 'planning')?.data?.planned_for
    const made = own.find((stage) => stage.stageKey === 'manufacturing')?.data?.mfg_date
    needBy.set(order.id, typeof planned === 'string' && planned ? planned : typeof made === 'string' && made ? made : (order.deliveryDate ?? null))
  }
  const now = Date.now()
  for (const productId of productIds) {
    const variantId = variants.get(productId)
    const pool = lots
      .filter((lot) => lot.variantId === variantId && isUsable(lot) && lot.onHand > EPSILON)
      .map((lot) => ({ lotNumber: lot.lotNumber, expiresAt: lot.expiresAt, left: lot.onHand }))
      .sort((a, b) => (a.expiresAt ?? '9999').localeCompare(b.expiresAt ?? '9999'))
    const holders = reservations
      .filter((entry) => entry.productId === productId)
      .sort((a, b) => (needBy.get(a.orderId) ?? '9999').localeCompare(needBy.get(b.orderId) ?? '9999') || a.since.getTime() - b.since.getTime())
    for (const entry of holders) {
      const wanted = num(entry.quantity)
      const need = needBy.get(entry.orderId) ?? null
      let left = wanted
      let expiring: ReservationHealth['expiring'] = null
      for (const lot of pool) {
        if (left <= EPSILON) break
        if (lot.left <= EPSILON) continue
        const take = Math.min(left, lot.left)
        lot.left -= take
        left -= take
        if (lot.expiresAt && need && lot.expiresAt.slice(0, 10) < need && !expiring) expiring = { lotNumber: lot.lotNumber, expiresAt: lot.expiresAt.slice(0, 10), quantity: round(take) }
      }
      result.set(entry.id, {
        reservationId: entry.id,
        orderId: entry.orderId,
        orderNo: entry.orderNo,
        productId,
        quantity: round(wanted),
        backed: round(wanted - Math.max(0, left)),
        missing: round(Math.max(0, left)),
        needBy: need,
        ageDays: Math.floor((now - entry.since.getTime()) / DAY_MS),
        expiring,
      })
    }
  }
  if (filter.orderIds || filter.productIds) {
    for (const [id, health] of result) {
      if (filter.orderIds && !filter.orderIds.includes(health.orderId)) result.delete(id)
      else if (filter.productIds && !filter.productIds.includes(health.productId)) result.delete(id)
    }
  }
  return result
}

const lastSweep = new Map<string, number>()

export async function sweepReservationProblems(ctx: Scope & { container: { resolve: (name: string) => unknown } }, options: { force?: boolean } = {}): Promise<number> {
  const key = `${ctx.tenantId}:${ctx.organizationId}`
  if (!options.force && Date.now() - (lastSweep.get(key) ?? 0) < 30 * 60 * 1000) return 0
  lastSweep.set(key, Date.now())
  const em = ctx.em.fork()
  const scope = { em, tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const health = [...(await reservationHealth(scope)).values()].filter((entry) => entry.missing > EPSILON || entry.expiring)
  if (!health.length) return 0
  const already = await em.getConnection().execute<Array<{ group_key: string }>>(
    `select group_key from notifications where tenant_id = ? and organization_id = ? and type in ('dermat_planning.reservation.short', 'dermat_planning.reservation.expiring') and created_at > now() - interval '7 days'`,
    [ctx.tenantId, ctx.organizationId],
  ).catch(() => [] as Array<{ group_key: string }>)
  const sent = new Set(already.map((row) => row.group_key))
  const products = await loadProducts(scope as unknown as Parameters<typeof loadProducts>[0], health.map((entry) => entry.productId))
  let count = 0
  for (const entry of health) {
    const title = products.get(entry.productId)?.title ?? 'A material'
    const unit = products.get(entry.productId)?.unit ?? ''
    const kind = entry.missing > EPSILON ? 'short' : 'expiring'
    const groupKey = `dermat_planning:reservation:${entry.reservationId}:${kind}`
    if (sent.has(groupKey)) continue
    try {
      const service = resolveNotificationService(ctx.container)
      await service.createForFeature(
        {
          type: `dermat_planning.reservation.${kind}`,
          requiredFeature: 'dermat_planning.reserve',
          title: kind === 'short' ? `${entry.orderNo}: reserved ${title} is no longer all in the store` : `${entry.orderNo}: reserved ${title} expires before it is needed`,
          body: kind === 'short'
            ? `${round(entry.missing)} ${unit} of the ${round(entry.quantity)} ${unit} reserved ${entry.ageDays} days ago is missing (used, removed, rejected or expired). Buy or move stock before ${entry.needBy ?? 'the order starts'}.`
            : `Batch ${entry.expiring?.lotNumber ?? '—'} expires ${entry.expiring?.expiresAt}; the order needs it by ${entry.needBy}.`,
          severity: 'warning',
          sourceModule: 'dermat_planning',
          sourceEntityType: 'dermat_orders:order',
          sourceEntityId: entry.orderId,
          linkHref: `/backend/orders/${entry.orderId}?tab=materials`,
          groupKey,
        },
        { tenantId: ctx.tenantId, organizationId: ctx.organizationId },
      )
      count += 1
    } catch (error) {
      logger.error('Failed to send reservation alert', { err: error })
    }
  }
  return count
}
