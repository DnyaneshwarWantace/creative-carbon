import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../dermat_orders/lib/server'
import { VendorBill } from '../../data/entities'
import { vendorBillInputSchema, vendorBillListSchema } from '../../data/validators'
import { billView, createBill, findBill, unbilledGrns } from '../../lib/payables'
import { accountsErrorResponse, runGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_accounts.view'] },
  POST: { requireAuth: true, requireFeatures: ['dermat_accounts.record'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = vendorBillListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json(billView(await findBill(ctx, parsed.data.id)))
    if (parsed.data.unbilledFor) return NextResponse.json({ items: await unbilledGrns(ctx, parsed.data.unbilledFor) })
    const where: Record<string, unknown> = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }
    if (parsed.data.vendorId) where.vendorId = parsed.data.vendorId
    const all = (await ctx.em.find(VendorBill, where, { orderBy: { billDate: 'desc' }, limit: 500 })).map(billView)
    const open = all.filter((bill) => bill.status === 'open' || bill.status === 'partly_paid')
    const summary = {
      toPay: Math.round(open.reduce((sum, bill) => sum + bill.balance, 0) * 100) / 100,
      overdue: Math.round(open.filter((bill) => bill.overdueDays > 0).reduce((sum, bill) => sum + bill.balance, 0) * 100) / 100,
      overdueBills: open.filter((bill) => bill.overdueDays > 0).length,
      openBills: open.length,
    }
    const items =
      parsed.data.view === 'to_pay' ? open : parsed.data.view === 'overdue' ? open.filter((bill) => bill.overdueDays > 0) : parsed.data.view === 'paid' ? all.filter((bill) => bill.status === 'paid') : all
    return NextResponse.json({ items, summary })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = vendorBillInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter the vendor, bill number and date' }, { status: 400 })
  try {
    const result = await runGuarded(ctx, req, 'vendor-bill', parsed.data as Record<string, unknown>, async () => billView(await createBill(ctx, parsed.data)))
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Accounts',
  summary: 'Vendor bills',
  methods: {
    GET: { summary: 'Vendor bills to pay / overdue / paid, one bill, or goods receipts of a vendor not billed yet', tags: ['Dermat Accounts'], query: vendorBillListSchema, responses: [{ status: 200, description: 'Bills', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Enter a vendor bill, usually against goods receipts (amounts taken from what was received)', tags: ['Dermat Accounts'], requestBody: { schema: vendorBillInputSchema }, responses: [{ status: 201, description: 'Bill', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { GET, POST }
