import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { AccessLogError, accessChangeView, listAccessChanges, syncAccess } from '../../lib/accessLog'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['auth.acl.manage'] },
  POST: { requireAuth: true, requireFeatures: ['auth.acl.manage'] },
}

const querySchema = z.object({ subjectType: z.enum(['role', 'user']).optional(), subjectId: z.string().uuid().optional() })
const syncSchema = z
  .object({
    subjectType: z.enum(['role', 'user']),
    subjectId: z.string().uuid(),
    phase: z.enum(['before', 'after']),
    reason: z.string().trim().max(500).nullable().optional(),
    undoOf: z.string().uuid().nullable().optional(),
  })
  .refine((value) => !value.undoOf || (value.reason ?? '').trim().length >= 3, { message: 'Write why (kept in the history)', path: ['reason'] })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  return NextResponse.json({ items: await listAccessChanges(ctx, parsed.data) })
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = syncSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Say whose access' }, { status: 400 })
  try {
    const change = await syncAccess(ctx, parsed.data)
    return NextResponse.json({ change: change ? accessChangeView(change) : null })
  } catch (error) {
    if (error instanceof AccessLogError) return NextResponse.json({ error: error.message }, { status: error.status })
    throw error
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Departments',
  summary: 'Access change log: who granted or removed which right, with undo for 7 days',
  methods: {
    GET: { summary: 'Access changes (?subjectType=role|user&subjectId=)', tags: ['Creative Carbon Departments'], query: querySchema, responses: [{ status: 200, description: 'Changes', schema: z.object({ items: z.array(z.object({}).passthrough()) }) }] },
    POST: { summary: 'Record the access of a role or person as it is now (before / after a change); the server reads the rights itself and logs what changed', tags: ['Creative Carbon Departments'], requestBody: { schema: syncSchema }, responses: [{ status: 200, description: 'Logged change, if any', schema: z.object({ change: z.object({}).passthrough().nullable() }) }] },
  },
}

export { GET, POST }
