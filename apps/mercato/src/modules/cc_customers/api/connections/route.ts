import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { hasFeatures, resolveOrderContext, type OrderContext } from '../../../cc_orders/lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['customers.companies.view'] },
}

const querySchema = z.object({ id: z.string().uuid() })

type Scoped = { tenantId: string; organizationId: string }

async function rows<T>(ctx: OrderContext, sql: string, params: unknown[]): Promise<T[]> {
  return ctx.em.getConnection().execute<T[]>(sql, params)
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give the customer id' }, { status: 400 })
  const scope: Scoped = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const id = parsed.data.id
  const [crm, accounts, masters, quality] = await Promise.all([
    hasFeatures(ctx, ['cc_crm.view']),
    hasFeatures(ctx, ['cc_accounts.view']),
    hasFeatures(ctx, ['cc_production.masters.view']),
    hasFeatures(ctx, ['cc_production.quality.view']),
  ])
  const base = [id, scope.tenantId, scope.organizationId]
  const [enquiries, quotations, proformas, invoices, dies, labTests] = await Promise.all([
    crm
      ? rows<{ id: string; enquiry_no: string; received_at: string | null; subject: string | null; stage: string; next_action_on: string | null; owner_name: string | null }>(
          ctx,
          `select id, enquiry_no, received_at, subject, stage, next_action_on, owner_name from cc_enquiries
            where customer_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null order by received_at desc nulls last limit 50`,
          base,
        )
      : null,
    crm
      ? rows<{ id: string; quote_no: string; quote_date: string; status: string; total_amount: string; order_id: string | null; order_no: string | null }>(
          ctx,
          `select id, quote_no, quote_date, status, total_amount, order_id, order_no from cc_quotations
            where customer_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null order by quote_date desc limit 50`,
          base,
        )
      : null,
    accounts
      ? rows<{ id: string; code: string; pi_date: string; status: string; order_id: string | null; order_no: string | null; totals: { total?: number } | null }>(
          ctx,
          `select id, code, pi_date, status, order_id, order_no, totals from cc_proforma_invoices
            where customer_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null order by pi_date desc limit 50`,
          base,
        )
      : null,
    accounts
      ? rows<{ id: string; code: string; kind: string; invoice_date: string; due_date: string | null; status: string; order_id: string | null; order_no: string | null; totals: { payable?: number } | null }>(
          ctx,
          `select id, code, kind, invoice_date, due_date, status, order_id, order_no, totals from cc_tax_invoices
            where customer_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null order by invoice_date desc limit 50`,
          base,
        )
      : null,
    masters
      ? rows<{ id: string; die_no: string; description: string | null; customer_mould_no: string | null; is_active: boolean }>(
          ctx,
          `select id, die_no, description, customer_mould_no, is_active from cc_moulds
            where customer_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null order by die_no limit 200`,
          base,
        )
      : null,
    quality
      ? rows<{ id: string; test_date: string; report_no: string | null; item_title: string | null; test_type: string | null; result: string; order_id: string | null; order_no: string | null }>(
          ctx,
          `select id, test_date, report_no, item_title, test_type, result, order_id, order_no from cc_lab_tests
            where customer_id = ? and tenant_id = ? and organization_id = ? and deleted_at is null order by test_date desc limit 50`,
          base,
        )
      : null,
  ])
  return NextResponse.json({
    enquiries: enquiries?.map((row) => ({ id: row.id, no: row.enquiry_no, date: row.received_at, subject: row.subject, stage: row.stage, nextActionOn: row.next_action_on, ownerName: row.owner_name })) ?? null,
    quotations: quotations?.map((row) => ({ id: row.id, no: row.quote_no, date: row.quote_date, status: row.status, total: Number(row.total_amount), orderId: row.order_id, orderNo: row.order_no })) ?? null,
    proformas: proformas?.map((row) => ({ id: row.id, no: row.code, date: row.pi_date, status: row.status, total: Number(row.totals?.total ?? 0), orderId: row.order_id, orderNo: row.order_no })) ?? null,
    invoices:
      invoices?.map((row) => ({ id: row.id, no: row.code, kind: row.kind, date: row.invoice_date, dueDate: row.due_date, status: row.status, total: Number(row.totals?.payable ?? 0), orderId: row.order_id, orderNo: row.order_no })) ?? null,
    dies: dies?.map((row) => ({ id: row.id, dieNo: row.die_no, description: row.description, customerMouldNo: row.customer_mould_no, isActive: row.is_active })) ?? null,
    labTests: labTests?.map((row) => ({ id: row.id, date: row.test_date, reportNo: row.report_no, itemTitle: row.item_title, testType: row.test_type, result: row.result, orderId: row.order_id, orderNo: row.order_no })) ?? null,
  })
}

const listOrNull = <T extends z.ZodTypeAny>(item: T) => z.array(item).nullable()

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Customers',
  summary: 'Everything linked to one customer: enquiries, quotations, proformas, invoices, dies and lab reports (each null when you lack the right to see it)',
  methods: {
    GET: {
      summary: 'Customer connections',
      tags: ['Creative Carbon Customers'],
      query: querySchema,
      responses: [
        {
          status: 200,
          description: 'Connections',
          schema: z.object({
            enquiries: listOrNull(z.object({ id: z.string(), no: z.string() }).passthrough()),
            quotations: listOrNull(z.object({ id: z.string(), no: z.string() }).passthrough()),
            proformas: listOrNull(z.object({ id: z.string(), no: z.string() }).passthrough()),
            invoices: listOrNull(z.object({ id: z.string(), no: z.string() }).passthrough()),
            dies: listOrNull(z.object({ id: z.string(), dieNo: z.string() }).passthrough()),
            labTests: listOrNull(z.object({ id: z.string() }).passthrough()),
          }),
        },
      ],
    },
  },
}

export { GET }
