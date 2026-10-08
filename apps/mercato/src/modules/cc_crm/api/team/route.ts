import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { addMember, listTeam, resetMemberPassword, setMemberRole } from '../../lib/team'
import { crmErrorResponse, runCrmGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_crm.team'] },
  POST: { requireAuth: true, requireFeatures: ['cc_crm.team'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_crm.team'] },
}

const crmRole = z.enum(['manager', 'sales'])
const addSchema = z.object({ name: z.string().trim().min(2).max(120), email: z.string().trim().email().max(200), password: z.string().min(8).max(200), crmRole })
const changeSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('role'), id: z.string().uuid(), crmRole: crmRole.nullable() }),
  z.object({ action: z.literal('password'), id: z.string().uuid(), password: z.string().min(8).max(200) }),
])

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  try {
    return NextResponse.json({ items: await listTeam(ctx) })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = addSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter the name, a valid email, a password of at least 8 characters and the CRM role', details: parsed.error.flatten() }, { status: 400 })
  try {
    const result = await runCrmGuarded(ctx, req, { resourceKind: 'cc_crm.team', resourceId: 'new', operation: 'create', payload: { ...parsed.data, password: '***' } }, async () => addMember(ctx, parsed.data))
    if (result instanceof Response) return result
    return NextResponse.json({ ok: true, items: await listTeam(ctx) }, { status: 201 })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = changeSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid change', details: parsed.error.flatten() }, { status: 400 })
  try {
    const input = parsed.data
    const result = await runCrmGuarded(ctx, req, { resourceKind: 'cc_crm.team', resourceId: input.id, operation: 'update', payload: input.action === 'password' ? { ...input, password: '***' } : input }, async () => {
      if (input.action === 'role') await setMemberRole(ctx, input.id, input.crmRole)
      else await resetMemberPassword(ctx, input.id, input.password)
      return null
    })
    if (result instanceof Response) return result
    return NextResponse.json({ ok: true, items: await listTeam(ctx) })
  } catch (error) {
    return crmErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon CRM',
  summary: 'CRM team: people, CRM roles and CRM-only logins (cannot grant ERP access)',
  methods: {
    GET: { summary: 'Everyone in the organisation with their CRM role and whether they also use the ERP', tags: ['Creative Carbon CRM'], responses: [{ status: 200, description: 'Team', schema: z.object({ items: z.array(z.object({}).passthrough()) }) }] },
    POST: { summary: 'Add a CRM-only login (CRM manager or sales)', tags: ['Creative Carbon CRM'], requestBody: { schema: addSchema }, responses: [{ status: 201, description: 'Added', schema: z.object({ ok: z.boolean() }).passthrough() }] },
    PUT: { summary: 'Give/remove a CRM role, or reset the password of a CRM-only user', tags: ['Creative Carbon CRM'], requestBody: { schema: changeSchema }, responses: [{ status: 200, description: 'Saved', schema: z.object({ ok: z.boolean() }).passthrough() }] },
  },
}

export { GET, POST, PUT }
