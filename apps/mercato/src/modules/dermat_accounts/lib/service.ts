import type { EntityManager } from '@mikro-orm/postgresql'
import { OrderPayment, type PaymentKind } from '../data/entities'
import type { PaymentInput } from '../data/validators'

type Scope = { em: EntityManager; tenantId: string; organizationId: string }

export class AccountsError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}

function money(value: number): number {
  return Math.round(value * 100) / 100
}

export async function paymentsFor(ctx: Scope, orderIds: string[]): Promise<OrderPayment[]> {
  if (!orderIds.length) return []
  return ctx.em.find(OrderPayment, { orderId: { $in: orderIds }, tenantId: ctx.tenantId, organizationId: ctx.organizationId }, { orderBy: { paidOn: 'asc', createdAt: 'asc' } })
}

export function paymentView(payment: OrderPayment) {
  return {
    id: payment.id,
    kind: payment.kind,
    amount: Number(payment.amount),
    paidOn: payment.paidOn,
    mode: payment.mode ?? null,
    reference: payment.reference ?? null,
    note: payment.note ?? null,
    byName: payment.byName ?? null,
    voided: Boolean(payment.voidedAt),
    voidReason: payment.voidReason ?? null,
    createdAt: payment.createdAt.toISOString(),
  }
}

export function received(payments: OrderPayment[]): number {
  return money(payments.filter((payment) => !payment.voidedAt).reduce((sum, payment) => sum + Number(payment.amount), 0))
}

export async function recordPayment(ctx: Scope, input: PaymentInput & { orderNo: string }, byName: string | null): Promise<OrderPayment> {
  const payment = ctx.em.create(OrderPayment, {
    organizationId: ctx.organizationId,
    tenantId: ctx.tenantId,
    orderId: input.orderId,
    orderNo: input.orderNo,
    kind: input.kind,
    amount: String(money(input.amount)),
    paidOn: input.paidOn,
    mode: input.mode ?? null,
    reference: input.reference ?? null,
    note: input.note ?? null,
    byName,
  })
  ctx.em.persist(payment)
  await ctx.em.flush()
  return payment
}

export async function recordAdvanceFromStage(
  ctx: Scope,
  order: { id: string; orderNo: string },
  data: Record<string, unknown>,
  byName: string | null,
): Promise<boolean> {
  const amount = Number(data.advance_amount)
  if (!Number.isFinite(amount) || amount <= 0) return false
  const existing = await ctx.em.findOne(OrderPayment, { orderId: order.id, kind: 'advance' as PaymentKind, voidedAt: null, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  const paidOn = typeof data.received_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.received_on) ? data.received_on : new Date().toISOString().slice(0, 10)
  if (existing) {
    const reference = typeof data.payment_ref === 'string' && data.payment_ref.trim() ? data.payment_ref.trim() : existing.reference ?? null
    if (Math.abs(Number(existing.amount) - money(amount)) < 0.005 && existing.paidOn === paidOn && (existing.reference ?? null) === reference) return false
    existing.note = `${existing.note ? `${existing.note} · ` : ''}Checked at Advance stage: was ${existing.amount} on ${existing.paidOn}`
    existing.amount = String(money(amount))
    existing.paidOn = paidOn
    existing.reference = reference
    return true
  }
  ctx.em.persist(
    ctx.em.create(OrderPayment, {
      organizationId: ctx.organizationId,
      tenantId: ctx.tenantId,
      orderId: order.id,
      orderNo: order.orderNo,
      kind: 'advance',
      amount: String(money(amount)),
      paidOn,
      mode: 'NEFT / RTGS',
      reference: typeof data.payment_ref === 'string' ? data.payment_ref : null,
      note: 'From the Advance stage',
      byName,
    }),
  )
  return true
}

export async function voidPayment(ctx: Scope, id: string, reason: string, byName: string | null) {
  const payment = await ctx.em.findOne(OrderPayment, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  if (!payment) throw new AccountsError('Payment not found', 404)
  if (payment.voidedAt) throw new AccountsError('This payment is already voided', 409)
  payment.voidedAt = new Date()
  payment.voidReason = `${reason}${byName ? ` (${byName})` : ''}`
  await ctx.em.flush()
  return payment
}
