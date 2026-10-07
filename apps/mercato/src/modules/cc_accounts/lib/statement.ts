import { CcOrder, CcOrderLine } from '../../cc_orders/data/entities'
import { priceOrder } from '../../cc_orders/lib/pricing'
import type { OrderContext } from '../../cc_orders/lib/server'
import { OrderPayment, TaxInvoice } from '../data/entities'

type Entry = {
  date: string
  kind: 'invoice' | 'credit_note' | 'payment'
  ref: string
  id: string
  orderNo: string
  detail: string
  debit: number
  credit: number
  balance: number
}

type OpenInvoice = { id: string; code: string; orderNo: string; invoiceDate: string; dueDate: string | null; amount: number; paid: number; open: number; daysOverdue: number }

function round(value: number): number {
  return Math.round(value * 100) / 100
}

function todayIso(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000)
}

export async function customerStatement(ctx: OrderContext, customerId: string) {
  const orders = await ctx.em.find(CcOrder, { customerId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, status: { $ne: 'cancelled' } })
  const orderIds = orders.map((order) => order.id)
  const [lines, docs, payments] = await Promise.all([
    orderIds.length ? ctx.em.find(CcOrderLine, { orderId: { $in: orderIds } }) : Promise.resolve([] as CcOrderLine[]),
    orderIds.length ? ctx.em.find(TaxInvoice, { orderId: { $in: orderIds }, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, status: 'issued' }) : Promise.resolve([] as TaxInvoice[]),
    orderIds.length ? ctx.em.find(OrderPayment, { orderId: { $in: orderIds }, tenantId: ctx.tenantId, organizationId: ctx.organizationId, voidedAt: null }) : Promise.resolve([] as OrderPayment[]),
  ])
  const raw: Array<Omit<Entry, 'balance'> & { order: number }> = []
  for (const doc of docs) {
    const credit = doc.kind === 'credit_note'
    raw.push({
      date: doc.invoiceDate,
      kind: doc.kind,
      ref: doc.code,
      id: doc.id,
      orderNo: doc.orderNo,
      detail: credit ? `Credit note against ${doc.againstCode ?? ''}${doc.notes ? ` · ${doc.notes}` : ''}` : `Tax invoice${doc.dueDate ? `, due ${doc.dueDate}` : ''}`,
      debit: credit ? 0 : doc.totals.payable,
      credit: credit ? doc.totals.payable : 0,
      order: credit ? 1 : 0,
    })
  }
  for (const payment of payments) {
    raw.push({
      date: payment.paidOn,
      kind: 'payment',
      ref: payment.reference ?? `${payment.kind} payment`,
      id: payment.id,
      orderNo: payment.orderNo,
      detail: `${payment.kind === 'advance' ? 'Advance' : payment.kind === 'balance' ? 'Balance' : 'Payment'}${payment.mode ? ` · ${payment.mode}` : ''}${payment.invoiceCode ? ` · for ${payment.invoiceCode}` : ''}`,
      debit: 0,
      credit: Number(payment.amount),
      order: 2,
    })
  }
  raw.sort((a, b) => (a.date === b.date ? a.order - b.order : a.date < b.date ? -1 : 1))
  let balance = 0
  const entries: Entry[] = raw.map(({ order: _order, ...entry }) => {
    balance = round(balance + entry.debit - entry.credit)
    return { ...entry, balance }
  })

  const invoices = docs.filter((doc) => doc.kind === 'invoice').sort((a, b) => (a.invoiceDate < b.invoiceDate ? -1 : 1))
  const creditsFor = (id: string) => docs.filter((doc) => doc.kind === 'credit_note' && doc.againstId === id).reduce((sum, doc) => sum + doc.totals.payable, 0)
  const open: OpenInvoice[] = invoices.map((doc) => ({
    id: doc.id,
    code: doc.code,
    orderNo: doc.orderNo,
    invoiceDate: doc.invoiceDate,
    dueDate: doc.dueDate ?? null,
    amount: round(doc.totals.payable - creditsFor(doc.id)),
    paid: 0,
    open: round(doc.totals.payable - creditsFor(doc.id)),
    daysOverdue: 0,
  }))
  let unmatched = 0
  for (const payment of payments) {
    const target = payment.invoiceId ? open.find((row) => row.id === payment.invoiceId) : null
    if (target) {
      const used = Math.min(target.open, Number(payment.amount))
      target.paid = round(target.paid + used)
      target.open = round(target.open - used)
      unmatched += Number(payment.amount) - used
    } else unmatched += Number(payment.amount)
  }
  for (const row of open) {
    if (unmatched <= 0) break
    const used = Math.min(row.open, unmatched)
    row.paid = round(row.paid + used)
    row.open = round(row.open - used)
    unmatched -= used
  }
  const today = todayIso()
  const ageing = { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0 }
  for (const row of open) {
    if (row.open <= 0.005) continue
    row.daysOverdue = row.dueDate ? Math.max(0, daysBetween(row.dueDate, today)) : 0
    const bucket = row.daysOverdue === 0 ? 'current' : row.daysOverdue <= 30 ? 'd1_30' : row.daysOverdue <= 60 ? 'd31_60' : row.daysOverdue <= 90 ? 'd61_90' : 'd90'
    ageing[bucket] = round(ageing[bucket] + row.open)
  }
  const orderValue = round(
    orders.reduce(
      (sum, order) =>
        sum +
        priceOrder(
          lines
            .filter((line) => line.orderId === order.id)
            .map((line) => ({ quantity: Number(line.quantity), rate: line.rate == null ? null : Number(line.rate), gstPercent: Number(line.gstPercent ?? 18), discountPercent: Number(line.discountPercent ?? 0) })),
          order.pricesIncludeGst,
        ).total,
      0,
    ),
  )
  const invoiced = round(invoices.reduce((sum, doc) => sum + doc.totals.payable - creditsFor(doc.id), 0))
  const paidTotal = round(payments.reduce((sum, payment) => sum + Number(payment.amount), 0))
  return {
    customerId,
    asOf: today,
    entries,
    openInvoices: open.filter((row) => row.open > 0.005),
    ageing,
    summary: {
      orders: orders.length,
      orderValue,
      invoiced,
      notInvoiced: round(Math.max(0, orderValue - invoiced)),
      received: paidTotal,
      balance,
      advanceOnAccount: round(Math.max(0, unmatched)),
      overdue: round(ageing.d1_30 + ageing.d31_60 + ageing.d61_90 + ageing.d90),
    },
  }
}
