import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { loadCustomers, resolveOrderContext } from '../../../dermat_orders/lib/server'
import { OrderPayment } from '../../data/entities'
import { receiptsQuerySchema } from '../../data/validators'
import { paymentView } from '../../lib/service'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_accounts.view'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = receiptsQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const query = parsed.data
  const where: string[] = ['p.tenant_id = ?', 'p.organization_id = ?']
  const params: unknown[] = [ctx.tenantId, ctx.organizationId]
  if (query.includeVoided === '0') where.push('p.voided_at is null')
  if (query.from) {
    where.push('p.paid_on >= ?')
    params.push(query.from)
  }
  if (query.to) {
    where.push('p.paid_on <= ?')
    params.push(query.to)
  }
  if (query.mode) {
    where.push('p.mode = ?')
    params.push(query.mode)
  }
  if (query.customerId) {
    where.push('o.customer_id = ?')
    params.push(query.customerId)
  }
  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
    where.push('(p.order_no ilike ? or p.reference ilike ? or p.invoice_code ilike ?)')
    params.push(term, term, term)
  }
  const from = `from dermat_order_payments p join dermat_orders o on o.id = p.order_id where ${where.join(' and ')}`
  const connection = ctx.em.getConnection()
  const [agg] = await connection.execute<Array<{ total: string; amount: string | null }>>(`select count(*) as total, sum(case when p.voided_at is null then p.amount else 0 end) as amount ${from}`, params)
  const rows = await connection.execute<Array<{ id: string; customer_id: string }>>(`select p.id, o.customer_id ${from} order by p.paid_on desc, p.created_at desc limit ? offset ?`, [...params, query.pageSize, (query.page - 1) * query.pageSize])
  const payments = rows.length ? await ctx.em.find(OrderPayment, { id: { $in: rows.map((row) => row.id) } }) : []
  const customers = await loadCustomers(ctx, rows.map((row) => row.customer_id))
  const total = Number(agg?.total ?? 0)
  return NextResponse.json({
    items: rows
      .map((row) => {
        const payment = payments.find((entry) => entry.id === row.id)
        return payment ? { ...paymentView(payment), customerId: row.customer_id, customerName: customers.get(row.customer_id)?.name ?? '' } : null
      })
      .filter(Boolean),
    total,
    amount: Math.round(Number(agg?.amount ?? 0) * 100) / 100,
    page: query.page,
    pageSize: query.pageSize,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Accounts',
  summary: 'All payments received',
  methods: {
    GET: { summary: 'Receipts across orders (newest first) with customer, filters and the sum', tags: ['Dermat Accounts'], query: receiptsQuerySchema, responses: [{ status: 200, description: 'Receipts', schema: z.object({}).passthrough() }] },
  },
}

export { GET }
