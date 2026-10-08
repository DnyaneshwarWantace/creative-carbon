import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../cc_orders/lib/server'
import { enquiryInputSchema, enquiryListSchema, enquiryUpdateSchema } from '../../data/validators'
import { enquiryDetail, findEnquiry, listEnquiries, saveEnquiry } from '../../lib/enquiries'
import { crmErrorResponse, runCrmGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_crm.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_crm.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_crm.manage'] },
}

const RESOURCE = 'cc_crm.enquiry'

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = enquiryListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json(await enquiryDetail(ctx, await findEnquiry(ctx, parsed.data.id)))
    return NextResponse.json(await listEnquiries(ctx, parsed.data))
  } catch (error) {
    return crmErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = enquiryInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter the source, when it came in and what they asked for', details: parsed.error.flatten() }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runCrmGuarded(ctx, req, { resourceKind: RESOURCE, resourceId: 'new', operation: 'create', payload: parsed.data }, async () => enquiryDetail(ctx, await saveEnquiry(ctx, null, parsed.data, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = enquiryUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter the source, when it came in and what they asked for', details: parsed.error.flatten() }, { status: 400 })
  try {
    const row = await findEnquiry(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: RESOURCE, resourceId: row.id, current: row.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runCrmGuarded(ctx, req, { resourceKind: RESOURCE, resourceId: row.id, operation: 'update', payload: parsed.data }, async () => enquiryDetail(ctx, await saveEnquiry(ctx, row, parsed.data, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return crmErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon CRM',
  summary: 'Enquiries (IndiaMART, WhatsApp, email, phone, walk-in, referral)',
  methods: {
    GET: { summary: 'List (?stage=open|overdue|new|quoted|negotiating|won|lost|all&search=) or one (?id=) with its quotations', tags: ['Creative Carbon CRM'], query: enquiryListSchema, responses: [{ status: 200, description: 'Enquiries', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Log an enquiry (number CCCPL/ENQ/<FY>/<n>)', tags: ['Creative Carbon CRM'], requestBody: { schema: enquiryInputSchema }, responses: [{ status: 201, description: 'Enquiry', schema: z.object({}).passthrough() }] },
    PUT: { summary: 'Change an enquiry', tags: ['Creative Carbon CRM'], requestBody: { schema: enquiryUpdateSchema }, responses: [{ status: 200, description: 'Enquiry', schema: z.object({}).passthrough() }] },
  },
}

export { GET, POST, PUT }
