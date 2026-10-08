import type { OrderContext } from '../../cc_orders/lib/server'
import { loadCustomers } from '../../cc_orders/lib/server'
import { CcEnquiry, CcQuotation } from '../data/entities'
import { overdueEnquiries } from './enquiries'
import { todayIst } from './server'

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export async function crmDashboard(ctx: OrderContext) {
  const today = todayIst()
  const monthStart = `${today.slice(0, 7)}-01`
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }
  const connection = ctx.em.getConnection()
  const [stageRows, monthRows, dueToday, expiring, openValue, overdue] = await Promise.all([
    connection.execute<Array<{ stage: string; total: string }>>('select stage, count(*) as total from cc_enquiries where tenant_id = ? and organization_id = ? and deleted_at is null group by stage', [ctx.tenantId, ctx.organizationId]),
    connection.execute<Array<{ stage: string; total: string }>>(
      `select stage, count(*) as total from cc_enquiries where tenant_id = ? and organization_id = ? and deleted_at is null and stage in ('won','lost') and updated_at >= ?::date group by stage`,
      [ctx.tenantId, ctx.organizationId, monthStart],
    ),
    ctx.em.find(CcEnquiry, { ...scope, stage: { $in: ['new', 'quoted', 'negotiating'] }, nextActionOn: today }, { orderBy: { receivedAt: 'asc' }, limit: 20 }),
    ctx.em.find(CcQuotation, { ...scope, status: { $in: ['draft', 'sent', 'accepted'] }, validUntil: { $gte: today, $lte: addDays(today, 7) } }, { orderBy: { validUntil: 'asc' }, limit: 20 }),
    connection.execute<Array<{ currency: string; total: string; count: string }>>(
      `select currency, sum(total_amount) as total, count(*) as count from cc_quotations where tenant_id = ? and organization_id = ? and deleted_at is null and status in ('draft','sent','accepted') group by currency`,
      [ctx.tenantId, ctx.organizationId],
    ),
    overdueEnquiries(ctx, 20),
  ])
  const customers = await loadCustomers(ctx, [...dueToday.map((row) => row.customerId), ...expiring.map((row) => row.customerId)].filter((id): id is string => Boolean(id)))
  return {
    today,
    pipeline: Object.fromEntries(stageRows.map((row) => [row.stage, Number(row.total)])),
    month: Object.fromEntries(monthRows.map((row) => [row.stage, Number(row.total)])),
    openQuotes: openValue.map((row) => ({ currency: row.currency, total: Number(row.total), count: Number(row.count) })),
    overdue,
    dueToday: dueToday.map((row) => ({ id: row.id, enquiryNo: row.enquiryNo, partyName: (row.customerId ? customers.get(row.customerId)?.name : null) ?? row.companyName ?? row.contactName ?? null, subject: row.subject, nextActionNote: row.nextActionNote ?? null, ownerName: row.ownerName ?? null })),
    expiring: expiring.map((row) => ({ id: row.id, quoteNo: row.quoteNo, customerName: customers.get(row.customerId)?.name ?? '', validUntil: row.validUntil ?? null, status: row.status, currency: row.currency, totalAmount: Number(row.totalAmount) })),
  }
}
