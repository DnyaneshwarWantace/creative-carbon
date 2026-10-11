import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName, hasFeatures } from '../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { clashSchema } from '../../data/validators'
import { clashView, findClash, listClashes, logClash } from '../../lib/clashes'
import { plantErrorResponse } from '../../lib/server'

export const metadata = { GET: { requireAuth: true }, POST: { requireAuth: true } }

const querySchema = z.object({ id: z.string().uuid().optional(), status: z.enum(['open', 'resolved', 'all']).default('all') })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  if (!(await hasFeatures(ctx, ['cc_production.owner.view']))) return NextResponse.json({ error: 'Only the plant manager sees sync clashes' }, { status: 403 })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json(clashView(await findClash(ctx, parsed.data.id)))
    return NextResponse.json({ items: await listClashes(ctx, parsed.data.status) })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = clashSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Say which screen and record' }, { status: 400 })
  try {
    const clash = await logClash(ctx, parsed.data, await currentUserName(ctx))
    return NextResponse.json({ id: clash.id }, { status: 201 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Owner',
  summary: 'Sync clashes: a save made offline that overwrote a newer change (last save wins; both versions kept)',
  methods: {
    GET: { summary: 'List clashes (?status=open|resolved|all) or one (?id=)', tags: ['Creative Carbon Owner'], query: querySchema, responses: [{ status: 200, description: 'Clashes', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Log a sync clash with the offline body; the server version is captured before the offline save lands', tags: ['Creative Carbon Owner'], requestBody: { schema: clashSchema }, responses: [{ status: 201, description: 'Logged', schema: z.object({ id: z.string() }) }] },
  },
}

export { GET, POST }
