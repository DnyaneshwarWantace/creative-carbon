import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../../cc_orders/lib/server'
import { TcTemplate } from '../../../data/entities'
import { tcTemplateSchema } from '../../../data/validators'
import { listTemplates, saveTemplate } from '../../../lib/tc'
import { plantErrorResponse, runPlantGuarded } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.quality.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_production.masters.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_production.masters.manage'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  return NextResponse.json({ items: await listTemplates(ctx, await currentUserName(ctx)) })
}

async function write(req: Request, creating: boolean) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = tcTemplateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success || (!creating && !parsed.data.id)) return NextResponse.json({ error: parsed.success ? 'Send the template id' : (parsed.error.issues[0]?.message ?? 'Check the template') }, { status: 400 })
  try {
    if (!creating) {
      const current = await ctx.em.findOne(TcTemplate, { id: parsed.data.id!, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
      if (current) enforceCommandOptimisticLock({ resourceKind: 'cc_production.tc_template', resourceId: current.id, current: current.updatedAt, request: req })
    }
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.tc_template', resourceId: parsed.data.id ?? 'new', operation: creating ? 'create' : 'update', payload: parsed.data }, () => saveTemplate(ctx, parsed.data, byName))
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: creating ? 201 : 200 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

const POST = (req: Request) => write(req, true)
const PUT = (req: Request) => write(req, false)

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Quality',
  summary: 'Test certificate templates: the properties and IS 2036 values per grade',
  methods: {
    GET: { summary: 'List templates', tags: ['Creative Carbon Quality'], responses: [{ status: 200, description: 'Templates', schema: z.object({ items: z.array(z.object({}).passthrough()) }) }] },
    POST: { summary: 'Add a template', tags: ['Creative Carbon Quality'], requestBody: { schema: tcTemplateSchema }, responses: [{ status: 201, description: 'Created', schema: z.object({}).passthrough() }] },
    PUT: { summary: 'Change a template', tags: ['Creative Carbon Quality'], requestBody: { schema: tcTemplateSchema }, responses: [{ status: 200, description: 'Saved', schema: z.object({}).passthrough() }], errors: [{ status: 409, description: 'Changed by someone else' }] },
  },
}

export { GET, POST, PUT }
