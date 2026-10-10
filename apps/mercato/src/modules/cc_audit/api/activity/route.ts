import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { activityQuerySchema } from '../../data/validators'
import { RECORD_TYPES, recordTimeline } from '../../lib/timeline'

export const metadata = {
  GET: { requireAuth: true },
}

type RbacLike = { userHasAllFeatures: (userId: string, features: string[], scope: { tenantId: string | null; organizationId: string | null }) => Promise<boolean> }

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = activityQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' }, { status: 400 })
  const def = RECORD_TYPES[parsed.data.type]
  if (!def) return NextResponse.json({ error: 'Unknown record type' }, { status: 400 })
  if (!ctx.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rbac = ctx.container.resolve('rbacService') as RbacLike
  const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
  const [canSee, isAuditor, showMoney] = await Promise.all([
    rbac.userHasAllFeatures(ctx.userId, [def.viewFeature], scope),
    rbac.userHasAllFeatures(ctx.userId, ['cc_audit.view'], scope),
    rbac.userHasAllFeatures(ctx.userId, ['cc_orders.money'], scope),
  ])
  if (!canSee && !isAuditor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return NextResponse.json(await recordTimeline(ctx, parsed.data.type, parsed.data.id, { kind: parsed.data.kind, page: parsed.data.page, pageSize: parsed.data.pageSize, showMoney: showMoney || isAuditor }))
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Activity',
  summary: 'Timeline of one record: who did what, when and why, with old → new values (new log plus the history the record already kept)',
  methods: {
    GET: {
      summary: 'Activity of one record',
      tags: ['Creative Carbon Activity'],
      query: activityQuerySchema,
      responses: [{ status: 200, description: 'Timeline page', schema: z.object({ total: z.number(), items: z.array(z.object({ id: z.string(), at: z.string(), action: z.string() }).passthrough()) }).passthrough() }],
      errors: [{ status: 403, description: 'No right to see this kind of record' }],
    },
  },
}

export { GET }
