import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../cc_orders/lib/server'
import { quotationInputSchema, quotationListSchema, quotationUpdateSchema } from '../../data/validators'
import { findQuotation, listQuotations, quotationDetail, saveQuotation } from '../../lib/quotations'
import { crmErrorResponse, runCrmGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_crm.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_crm.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_crm.manage'] },
}

const RESOURCE = 'cc_crm.quotation'

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = quotationListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json(await quotationDetail(ctx, await findQuotation(ctx, parsed.data.id)))
    return NextResponse.json({ items: await listQuotations(ctx, parsed.data) })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = quotationInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid quotation', details: parsed.error.flatten() }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runCrmGuarded(ctx, req, { resourceKind: RESOURCE, resourceId: 'new', operation: 'create', payload: parsed.data }, async () => {
      const row = await saveQuotation(ctx, null, parsed.data, byName)
      return { id: row.id, quoteNo: row.quoteNo }
    })
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = quotationUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid quotation', details: parsed.error.flatten() }, { status: 400 })
  try {
    const row = await findQuotation(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: RESOURCE, resourceId: row.id, current: row.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const { id, ...input } = parsed.data
    const result = await runCrmGuarded(ctx, req, { resourceKind: RESOURCE, resourceId: id, operation: 'update', payload: parsed.data }, async () => {
      await saveQuotation(ctx, row, input, byName)
      return { ok: true, id: row.id, quoteNo: row.quoteNo }
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return crmErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon CRM',
  summary: 'Quotations (lines as on an order; currency, incoterm, valid until)',
  methods: {
    GET: { summary: 'List (?status=&enquiryId=) or one (?id=)', tags: ['Creative Carbon CRM'], query: quotationListSchema, responses: [{ status: 200, description: 'Quotations', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Make a quotation (number CCCPL/QT/<FY>/<n>); orderDate is the quotation date', tags: ['Creative Carbon CRM'], requestBody: { schema: quotationInputSchema }, responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.string(), quoteNo: z.string() }) }] },
    PUT: { summary: 'Change a quotation (until it becomes an order)', tags: ['Creative Carbon CRM'], requestBody: { schema: quotationUpdateSchema }, responses: [{ status: 200, description: 'Saved', schema: z.object({ ok: z.boolean() }).passthrough() }] },
  },
}

export { GET, POST, PUT }
