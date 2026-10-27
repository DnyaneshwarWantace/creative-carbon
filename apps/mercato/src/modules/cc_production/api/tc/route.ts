import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, resolveOrderContext } from '../../../cc_orders/lib/server'
import { tcCreateSchema, tcListQuerySchema, tcUpdateSchema } from '../../data/validators'
import { certificateView, createCertificate, findCertificate, listCertificates, updateCertificate } from '../../lib/tc'
import { plantErrorResponse, runPlantGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.quality.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_production.quality.enter'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_production.quality.enter'] },
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = tcListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Check the search' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json(await certificateView(ctx, await findCertificate(ctx, parsed.data.id)))
    return NextResponse.json({ items: await listCertificates(ctx, parsed.data.search, parsed.data.orderId) })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = tcCreateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Choose a template and a date' }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.tc', resourceId: 'new', operation: 'create', payload: parsed.data }, async () => certificateView(ctx, await createCertificate(ctx, parsed.data, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = tcUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the certificate' }, { status: 400 })
  try {
    const row = await findCertificate(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.tc', resourceId: row.id, current: row.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.tc', resourceId: row.id, operation: 'update', payload: parsed.data }, async () => certificateView(ctx, await updateCertificate(ctx, row, parsed.data, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

const viewSchema = z.object({}).passthrough()

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Quality',
  summary: 'Test certificates (TC): numbered, with observed values checked against the IS 2036 specification',
  methods: {
    GET: { summary: 'List certificates, or one with ?id=', tags: ['Creative Carbon Quality'], query: tcListQuerySchema, responses: [{ status: 200, description: 'Certificates', schema: viewSchema }] },
    POST: { summary: 'Start a certificate from a template', tags: ['Creative Carbon Quality'], requestBody: { schema: tcCreateSchema }, responses: [{ status: 201, description: 'Created with the next TC number', schema: viewSchema }] },
    PUT: { summary: 'Enter observed values and details', tags: ['Creative Carbon Quality'], requestBody: { schema: tcUpdateSchema }, responses: [{ status: 200, description: 'Saved', schema: viewSchema }], errors: [{ status: 409, description: 'Issued, or changed by someone else' }] },
  },
}

export { GET, POST, PUT }
