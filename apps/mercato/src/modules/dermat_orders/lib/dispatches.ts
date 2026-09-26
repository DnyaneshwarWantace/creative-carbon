import { DermatOrder, DermatOrderLine, DermatOrderStage } from '../data/entities'
import { TaxInvoice } from '../../dermat_accounts/data/entities'
import { loadCustomers, type OrderContext } from './server'
import { priceOrder } from './pricing'

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const out = String(value).trim()
  return out || null
}

export async function dispatchRegister(ctx: OrderContext, filter: { view: 'ready' | 'done' | 'all'; q?: string; from?: string; to?: string }) {
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const statuses = filter.view === 'ready' ? ['open', 'on_hold'] : filter.view === 'done' ? ['done'] : ['open', 'on_hold', 'done']
  const stages = await ctx.em.find(DermatOrderStage, { ...scope, stageKey: 'dispatch', status: { $in: statuses } }, { orderBy: { updatedAt: 'desc' }, limit: 500 })
  const orderIds = [...new Set(stages.map((stage) => stage.orderId))]
  if (!orderIds.length) return { items: [], summary: { ready: 0, dispatched: 0, awaitingDelivery: 0 } }
  const [orders, lines, invoices, billing] = await Promise.all([
    ctx.em.find(DermatOrder, { id: { $in: orderIds }, ...scope, deletedAt: null, status: { $ne: 'cancelled' } }),
    ctx.em.find(DermatOrderLine, { orderId: { $in: orderIds } }),
    ctx.em.find(TaxInvoice, { orderId: { $in: orderIds }, ...scope, deletedAt: null, status: 'issued', kind: 'invoice' }),
    ctx.em.find(DermatOrderStage, { orderId: { $in: orderIds }, stageKey: 'billing' }),
  ])
  const customers = await loadCustomers(ctx, orders.map((order) => order.customerId))
  let items = stages
    .map((stage) => {
      const order = orders.find((entry) => entry.id === stage.orderId)
      if (!order) return null
      const data = stage.data ?? {}
      const own = lines.filter((line) => line.orderId === order.id)
      const invoice = invoices.filter((entry) => entry.orderId === order.id).map((entry) => entry.code)
      const billData = billing.find((entry) => entry.orderId === order.id)?.data ?? {}
      const value = priceOrder(own.map((line) => ({ quantity: Number(line.quantity), rate: line.rate == null ? null : Number(line.rate), gstPercent: Number(line.gstPercent ?? 18), discountPercent: Number(line.discountPercent ?? 0) })), order.pricesIncludeGst).total
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        customer: customers.get(order.customerId)?.name ?? null,
        shippingAddress: order.shippingAddress ?? null,
        priority: order.priority,
        status: stage.status,
        pieces: own.reduce((sum, line) => sum + Number(line.quantity), 0),
        value: Math.round(value * 100) / 100,
        invoices: invoice.length ? invoice : text(billData.invoice_number) ? [String(billData.invoice_number)] : [],
        dispatchDate: text(data.dispatch_date),
        transporter: text(data.transporter),
        lrNumber: text(data.lr_number),
        vehicleNo: text(data.vehicle_no),
        ewayBillNo: text(data.eway_bill_no),
        packages: text(data.packages),
        deliveredOn: text(data.delivered_on),
        ewayNeeded: value > 50000,
        waitingSince: stage.openedAt ? stage.openedAt.toISOString() : null,
      }
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
  const summary = {
    ready: items.filter((row) => row.status !== 'done').length,
    dispatched: items.filter((row) => row.status === 'done').length,
    awaitingDelivery: items.filter((row) => row.status === 'done' && !row.deliveredOn).length,
  }
  const term = filter.q?.trim().toLowerCase()
  if (term) items = items.filter((row) => [row.orderNo, row.customer, row.transporter, row.lrNumber, row.vehicleNo, row.ewayBillNo, ...row.invoices].some((value) => (value ?? '').toLowerCase().includes(term)))
  if (filter.from) items = items.filter((row) => !row.dispatchDate || row.dispatchDate >= (filter.from as string))
  if (filter.to) items = items.filter((row) => !row.dispatchDate || row.dispatchDate <= (filter.to as string))
  items.sort((a, b) => (b.dispatchDate ?? '9999').localeCompare(a.dispatchDate ?? '9999'))
  return { items, summary }
}
