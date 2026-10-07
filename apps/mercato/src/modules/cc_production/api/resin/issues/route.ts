import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { currentUserName } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { chemicalIssueInputSchema, chemicalIssueListSchema } from '../../../data/validators'
import { createIssue, listIssues } from '../../../lib/chemicals'
import { plantErrorResponse, runPlantGuarded } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.resin.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_production.chemicals.issue'] },
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = chemicalIssueListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  return NextResponse.json({ items: await listIssues(ctx, parsed.data) })
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = chemicalIssueInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Enter the date, chemical, kg and what it was used for' }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.chemical_issue', resourceId: parsed.data.productId, operation: 'create', payload: parsed.data }, () => createIssue(ctx, parsed.data, byName))
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Resin',
  summary: 'Chemical issues outside resin batches (methanol, DBP, oleic acid to coating, other use)',
  methods: {
    GET: { summary: 'List chemical issues (?month=YYYY-MM&productId=)', tags: ['Creative Carbon Resin'], query: chemicalIssueListSchema, responses: [{ status: 200, description: 'Issues', schema: z.object({ items: z.array(z.object({}).passthrough()) }) }] },
    POST: { summary: 'Issue a chemical (stock out, oldest lot first)', tags: ['Creative Carbon Resin'], requestBody: { schema: chemicalIssueInputSchema }, responses: [{ status: 201, description: 'Issue', schema: z.object({}).passthrough() }], errors: [{ status: 409, description: 'Not enough stock' }] },
  },
}

export { GET, POST }
