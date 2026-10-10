import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { TallyPush } from '../../../data/entities'
import { tallyPushListSchema, tallyPushSchema } from '../../../data/validators'
import { findPush, pushRange, pushView } from '../../../lib/tallyPush'
import { accountsErrorResponse, runGuarded } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_accounts.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_accounts.tally'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = tallyPushListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const query = parsed.data
  try {
    if (query.id) return NextResponse.json(pushView(await findPush(ctx, query.id), true))
  } catch (error) {
    return accountsErrorResponse(error)
  }
  const where = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, ...(query.status ? { status: query.status } : {}) }
  const [items, total] = await ctx.em.findAndCount(TallyPush, where, { orderBy: { createdAt: 'desc' }, limit: query.pageSize, offset: (query.page - 1) * query.pageSize })
  return NextResponse.json({ items: items.map((push) => pushView(push)), total, page: query.page, pageSize: query.pageSize, totalPages: Math.max(1, Math.ceil(total / query.pageSize)) })
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = tallyPushSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the dates and kinds' }, { status: 400 })
  if (parsed.data.from > parsed.data.to) return NextResponse.json({ error: 'The start date is after the end date' }, { status: 400 })
  try {
    return await runGuarded(ctx, req, 'tally-push', parsed.data, async () => {
      const push = await pushRange(ctx, parsed.data, await currentUserName(ctx))
      return NextResponse.json(pushView(push), { status: 201 })
    })
  } catch (error) {
    return accountsErrorResponse(error)
  }
}

const pushSchema = z.object({ id: z.string(), code: z.string(), status: z.enum(['sent', 'partial', 'failed', 'manual']) }).passthrough()

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Accounts',
  summary: 'Send sales, credit notes, receipts, purchases and vendor payments straight to Tally; every push is logged with what was sent and what Tally answered',
  methods: {
    GET: { summary: 'List Tally pushes, or one with ?id= (includes the XML sent and the answer)', tags: ['Creative Carbon Accounts'], query: tallyPushListSchema, responses: [{ status: 200, description: 'Pushes', schema: z.object({ items: z.array(pushSchema) }).passthrough() }] },
    POST: { summary: 'Push a date range to Tally (entries already in Tally are skipped unless listed in again)', tags: ['Creative Carbon Accounts'], requestBody: { schema: tallyPushSchema }, responses: [{ status: 201, description: 'Logged push (status sent, partial or failed)', schema: pushSchema }], errors: [{ status: 409, description: 'Nothing new to send' }] },
  },
}

export { GET, POST }
