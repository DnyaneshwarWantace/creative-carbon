import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName, resolveOrderContext } from '../../../cc_orders/lib/server'
import { crmErrorResponse, runCrmGuarded } from '../../lib/server'
import { findFollowUp, followUpView, listFollowUps, planFollowUp } from '../../lib/followUps'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_crm.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_crm.manage'] },
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const kind = z.enum(['call', 'visit', 'sample', 'quote_chase', 'other'])
const querySchema = z.object({ id: z.string().uuid().optional(), view: z.enum(['mine', 'all']).default('mine'), status: z.enum(['open', 'done', 'all']).default('open') })
const planSchema = z
  .object({ enquiryId: z.string().uuid().optional().nullable(), quotationId: z.string().uuid().optional().nullable(), kind: kind.optional().nullable(), dueOn: isoDate, note: z.string().trim().max(500).optional().nullable(), ownerName: z.string().trim().max(120).optional().nullable() })
  .refine((value) => Boolean(value.enquiryId || value.quotationId), { message: 'Give the enquiry or quotation' })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json(await followUpView(ctx, await findFollowUp(ctx, parsed.data.id)))
    const me = await currentUserName(ctx)
    return NextResponse.json({ items: await listFollowUps(ctx, { view: parsed.data.view, status: parsed.data.status, owner: me }) })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = planSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid follow-up' }, { status: 400 })
  try {
    const result = await runCrmGuarded(ctx, req, { resourceKind: 'cc_crm.follow_up', resourceId: parsed.data.enquiryId ?? parsed.data.quotationId ?? 'new', operation: 'create', payload: parsed.data }, async () => followUpView(ctx, await planFollowUp(ctx, parsed.data, await currentUserName(ctx))))
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon CRM',
  summary: 'Follow-ups on enquiries and quotations',
  methods: {
    GET: { summary: 'One follow-up (id), or mine / all, open / done', tags: ['Creative Carbon CRM'], query: querySchema, responses: [{ status: 200, description: 'Follow-ups', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Plan a follow-up (call, visit, sample, quote chase)', tags: ['Creative Carbon CRM'], requestBody: { schema: planSchema }, responses: [{ status: 201, description: 'Planned', schema: z.object({ id: z.string() }).passthrough() }] },
  },
}

export { GET, POST }
