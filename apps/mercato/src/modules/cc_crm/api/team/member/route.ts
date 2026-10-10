import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { currentUserName, hasFeatures } from '../../../../cc_orders/lib/server'
import { requireReasonFor, reasonIssue } from '../../../../cc_audit/lib/reason'
import { crmErrorResponse, runCrmGuarded } from '../../../lib/server'
import { handOver, personView } from '../../../lib/salesPerson'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_crm.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_crm.team'] },
}

const querySchema = z.object({ id: z.string().uuid() })
const handOverSchema = z.object({ id: z.string().uuid(), action: z.literal('hand_over'), toName: z.string().trim().min(1).max(200), reason: z.string().trim().max(500).optional() }).superRefine(requireReasonFor([]))

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Give the person' }, { status: 400 })
  try {
    const view = await personView(ctx, parsed.data.id)
    const self = view.id === ctx.userId
    if (!self && !(await hasFeatures(ctx, ['cc_crm.team']))) return NextResponse.json({ error: 'Only the CRM manager can see other people’s work' }, { status: 403 })
    return NextResponse.json(view)
  } catch (error) {
    return crmErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = handOverSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: reasonIssue(parsed.error) ?? 'Pick who takes over' }, { status: 400 })
  try {
    const result = await runCrmGuarded(ctx, req, { resourceKind: 'cc_crm.team', resourceId: parsed.data.id, operation: 'custom', payload: parsed.data }, async () => handOver(ctx, parsed.data.id, parsed.data.toName, parsed.data.reason!.trim(), await currentUserName(ctx)))
    if (result instanceof Response) return result
    return NextResponse.json({ ok: true, moved: result })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon CRM',
  summary: 'One salesperson: their work, and hand-over of all their open work',
  methods: {
    GET: { summary: 'Profile, counts, enquiries, quotations, follow-ups, won orders and a work feed', tags: ['Creative Carbon CRM'], query: querySchema, responses: [{ status: 200, description: 'Person', schema: z.object({ id: z.string() }).passthrough() }] },
    POST: { summary: 'Hand over open enquiries, planned follow-ups and open orders to another person (reason needed)', tags: ['Creative Carbon CRM'], requestBody: { schema: handOverSchema }, responses: [{ status: 200, description: 'Moved', schema: z.object({ ok: z.boolean() }).passthrough() }] },
  },
}

export { GET, POST }
