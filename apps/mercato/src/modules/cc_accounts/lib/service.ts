import type { EntityManager } from '@mikro-orm/postgresql'
import { OrderPayment, ProformaInvoice, TaxInvoice, type PaymentKind } from '../data/entities'
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
    orderId: payment.orderId,
    orderNo: payment.orderNo,
    invoiceId: payment.invoiceId ?? null,
    invoiceCode: payment.invoiceCode ?? null,
    history: payment.history ?? [],
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  }
}

export function received(payments: OrderPayment[]): number {
  return money(payments.filter((payment) => !payment.voidedAt).reduce((sum, payment) => sum + Number(payment.amount), 0))
}

export async function invoiceForPayment(ctx: Scope, orderId: string, invoiceId: string | null | undefined): Promise<TaxInvoice | null> {
  if (!invoiceId) return null
  const invoice = await ctx.em.findOne(TaxInvoice, { id: invoiceId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!invoice || invoice.orderId !== orderId || invoice.kind !== 'invoice') throw new AccountsError('That invoice is not on this order')
  if (invoice.status !== 'issued') throw new AccountsError('Payments can be matched only to an issued invoice')
  return invoice
}

export async function recordPayment(ctx: Scope, input: PaymentInput & { orderNo: string }, byName: string | null): Promise<OrderPayment> {
  const invoice = await invoiceForPayment(ctx, input.orderId, input.invoiceId)
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
    invoiceId: invoice?.id ?? null,
    invoiceCode: invoice?.code ?? null,
    history: [{ action: 'recorded', by: byName, at: new Date().toISOString(), note: null }],
  })
  ctx.em.persist(payment)
  await ctx.em.flush()
  const { recordActivity } = await import('../../cc_audit/lib/activity')
  if (invoice) {
    recordActivity(ctx.em, ctx, { recordType: 'invoice', recordId: invoice.id, action: 'payment_applied', kind: 'stage', summary: `₹${money(input.amount).toLocaleString('en-IN')} received and applied (${input.kind}${input.reference ? `, ${input.reference}` : ''})`, links: [{ type: 'payment', id: payment.id, label: input.reference ?? 'Payment' }], actorUserId: (ctx as { userId?: string | null }).userId ?? null, actorName: byName })
    await ctx.em.flush()
  } else {
    const proformas = await ctx.em.find(ProformaInvoice, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, orderId: input.orderId, deletedAt: null, status: { $ne: 'cancelled' } })
    for (const pi of proformas) {
      recordActivity(ctx.em, ctx, { recordType: 'proforma', recordId: pi.id, action: 'advance_received', kind: 'stage', summary: `₹${money(input.amount).toLocaleString('en-IN')} received against it (${input.kind}${input.reference ? `, ${input.reference}` : ''})`, links: [{ type: 'payment', id: payment.id, label: input.reference ?? 'Payment' }], actorUserId: (ctx as { userId?: string | null }).userId ?? null, actorName: byName })
    }
    if (proformas.length) await ctx.em.flush()
  }
  return payment
}

type TrackedField = 'kind' | 'amount' | 'paidOn' | 'mode' | 'reference' | 'note' | 'invoiceCode'

const MONEY_FIELDS: Array<[TrackedField, string]> = [
  ['kind', 'Kind'],
  ['amount', 'Amount'],
  ['paidOn', 'Date'],
  ['mode', 'Mode'],
  ['reference', 'Reference'],
  ['note', 'Note'],
  ['invoiceCode', 'Invoice'],
]

export async function updatePayment(
  ctx: Scope,
  payment: OrderPayment,
  input: { kind?: PaymentKind; amount?: number; paidOn?: string; mode?: string | null; reference?: string | null; note?: string | null; invoiceId?: string | null; reason: string },
  byName: string | null,
): Promise<void> {
  if (payment.voidedAt) throw new AccountsError('A voided payment cannot be changed', 409)
  await assertNotInTally(ctx, payment.id)
  const oldInvoice = payment.invoiceId ? { id: payment.invoiceId, code: payment.invoiceCode ?? null } : null
  const shown = (key: TrackedField) => (key === 'amount' ? Number(payment.amount).toFixed(2) : String(payment[key] ?? ''))
  const before = Object.fromEntries(MONEY_FIELDS.map(([key]) => [key, shown(key)]))
  if (input.kind) payment.kind = input.kind
  if (input.amount !== undefined) payment.amount = String(money(input.amount))
  if (input.paidOn) payment.paidOn = input.paidOn
  if (input.mode !== undefined) payment.mode = input.mode
  if (input.reference !== undefined) payment.reference = input.reference?.trim() || null
  if (input.note !== undefined) payment.note = input.note?.trim() || null
  if (input.invoiceId !== undefined) {
    const invoice = await invoiceForPayment(ctx, payment.orderId, input.invoiceId)
    payment.invoiceId = invoice?.id ?? null
    payment.invoiceCode = invoice?.code ?? null
  }
  const changed = MONEY_FIELDS.filter(([key]) => shown(key) !== before[key])
  const changes = changed.map(([key, label]) => `${label}: ${before[key] || '—'} → ${shown(key) || '—'}`)
  if (!changes.length) throw new AccountsError('Nothing changed')
  payment.history = [...(payment.history ?? []), { action: 'edited', by: byName, at: new Date().toISOString(), note: `${changes.join('; ')} · ${input.reason}` }]
  payment.updatedAt = new Date()
  const { recordActivity } = await import('../../cc_audit/lib/activity')
  const actor = { actorUserId: (ctx as { userId?: string | null }).userId ?? null, actorName: byName }
  const moved = (oldInvoice?.id ?? null) !== (payment.invoiceId ?? null)
  recordActivity(ctx.em, ctx, {
    recordType: 'payment',
    recordId: payment.id,
    action: moved ? 're_applied' : 'corrected',
    kind: 'correction',
    summary: moved ? `Applied to ${payment.invoiceCode ?? 'no invoice'} instead of ${oldInvoice?.code ?? 'no invoice'}` : 'Payment details corrected',
    reason: input.reason,
    changes: changed.map(([key, label]) => ({ field: key, label, from: before[key] || null, to: shown(key) || null, ...(key === 'amount' ? { money: true } : {}) })),
    ...actor,
  })
  if (moved && oldInvoice) recordActivity(ctx.em, ctx, { recordType: 'invoice', recordId: oldInvoice.id, action: 'payment_moved_out', kind: 'correction', summary: `Payment of ₹${Number(payment.amount).toLocaleString('en-IN')} moved to ${payment.invoiceCode ?? 'no invoice'}`, reason: input.reason, links: [{ type: 'payment', id: payment.id, label: payment.reference ?? 'Payment' }], ...actor })
  if (moved && payment.invoiceId) recordActivity(ctx.em, ctx, { recordType: 'invoice', recordId: payment.invoiceId, action: 'payment_applied', kind: 'stage', summary: `Payment of ₹${Number(payment.amount).toLocaleString('en-IN')} applied${oldInvoice ? ` (moved from ${oldInvoice.code ?? 'another invoice'})` : ''}`, reason: input.reason, links: [{ type: 'payment', id: payment.id, label: payment.reference ?? 'Payment' }], ...actor })
}

async function assertNotInTally(ctx: Scope, recordId: string) {
  const { tallyPushOf } = await import('./tallyLog')
  const pushed = await tallyPushOf(ctx, recordId)
  if (pushed) throw new AccountsError(`This is already in Tally (${pushed}). Change it in Tally, or record a new entry.`, 409)
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
  const paidOn = typeof data.received_on === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(data.received_on) ? data.received_on : new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
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
  await assertNotInTally(ctx, payment.id)
  payment.voidedAt = new Date()
  payment.voidReason = `${reason}${byName ? ` (${byName})` : ''}`
  await ctx.em.flush()
  return payment
}
