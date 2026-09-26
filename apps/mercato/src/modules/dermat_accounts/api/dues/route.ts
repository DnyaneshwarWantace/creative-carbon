import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { DermatOrder, DermatOrderLine } from '../../../dermat_orders/data/entities'
import { loadCustomers, resolveOrderContext } from '../../../dermat_orders/lib/server'
import { priceOrder } from '../../../dermat_orders/lib/pricing'
import { duesQuerySchema } from '../../data/validators'
import { paymentsFor, received } from '../../lib/service'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_accounts.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = duesQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const orders = await ctx.em.find(DermatOrder, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, status: { $ne: 'cancelled' } }, { orderBy: { orderDate: 'desc' }, limit: 500 })
  const ids = orders.map((order) => order.id)
  const [lines, payments, customers] = await Promise.all([
    ids.length ? ctx.em.find(DermatOrderLine, { orderId: { $in: ids } }) : Promise.resolve([] as DermatOrderLine[]),
    paymentsFor(ctx, ids),
    loadCustomers(ctx, orders.map((order) => order.customerId)),
  ])
  const term = (parsed.data.search ?? '').toLowerCase()
  const items = orders
    .map((order) => {
      const own = lines.filter((line) => line.orderId === order.id)
      const totals = priceOrder(
        own.map((line) => ({ quantity: Number(line.quantity), rate: line.rate == null ? null : Number(line.rate), gstPercent: Number(line.gstPercent ?? 18), discountPercent: Number(line.discountPercent ?? 0) })),
        order.pricesIncludeGst,
      )
      const ownPayments = payments.filter((payment) => payment.orderId === order.id)
      const paid = received(ownPayments)
      const last = ownPayments.filter((payment) => !payment.voidedAt).at(-1)
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        orderDate: order.orderDate,
        deliveryDate: order.deliveryDate ?? null,
        status: order.status,
        customerId: order.customerId,
        customerName: customers.get(order.customerId)?.name ?? '—',
        customerPhone: customers.get(order.customerId)?.phone ?? null,
        paymentTerms: order.paymentTerms ?? null,
        total: totals.total,
        received: paid,
        due: Math.round((totals.total - paid) * 100) / 100,
        priced: own.some((line) => line.rate != null && Number(line.rate) > 0),
        lastPayment: last ? { amount: Number(last.amount), paidOn: last.paidOn } : null,
      }
    })
    .filter((row) => (parsed.data.view === 'due' ? row.due > 0.5 : true))
    .filter((row) => !term || `${row.orderNo} ${row.customerName}`.toLowerCase().includes(term))
  const summary = {
    orders: items.length,
    total: Math.round(items.reduce((sum, row) => sum + row.total, 0) * 100) / 100,
    received: Math.round(items.reduce((sum, row) => sum + row.received, 0) * 100) / 100,
    due: Math.round(items.reduce((sum, row) => sum + Math.max(0, row.due), 0) * 100) / 100,
    unpriced: items.filter((row) => !row.priced).length,
  }
  return NextResponse.json({ items, summary })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Accounts',
  summary: 'Order totals, payments received and dues',
  methods: {
    GET: { summary: 'Per order: total (after discount and GST), received, due, last payment', tags: ['Dermat Accounts'], query: duesQuerySchema, responses: [{ status: 200, description: 'Dues', schema: z.object({ items: z.array(z.object({ orderId: z.string() }).passthrough()) }).passthrough() }] },
  },
}

export { GET }
