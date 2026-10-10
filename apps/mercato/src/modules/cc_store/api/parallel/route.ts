import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { resolveStoreContext, storeErrorResponse } from '../../lib/server'
import { parallelQuerySchema, parallelSaveSchema } from '../../data/validators'
import { parallelSheet, parallelSummary, saveParallel } from '../../lib/parallel'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_store.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_store.adjust'] },
}

function today(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = parallelQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Pick the store and date' }, { status: 400 })
  try {
    if (parsed.data.summary) return NextResponse.json(await parallelSummary(ctx, parsed.data.targetDays ?? 14))
    return NextResponse.json(await parallelSheet(ctx, parsed.data.place, parsed.data.date ?? today()))
  } catch (error) {
    return storeErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = parallelSaveSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the paper figures' }, { status: 400 })
  const guard = await runRouteMutationGuards({
    container: ctx.container,
    req,
    auth: { userId: ctx.userId ?? 'system', tenantId: ctx.tenantId, organizationId: ctx.organizationId },
    input: { resourceKind: 'cc_store.parallel_check', resourceId: `${parsed.data.date}:${parsed.data.place}`, operation: 'custom', mutationPayload: parsed.data },
  })
  if (!guard.ok) return guard.response
  try {
    const result = await saveParallel(ctx, parsed.data)
    await guard.runAfterSuccess()
    return NextResponse.json(result)
  } catch (error) {
    return storeErrorResponse(error)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Store',
  summary: 'Parallel run: the paper stock book against the system, store by store, day by day',
  methods: {
    GET: { summary: 'The sheet for a store and day (system figures and saved paper figures), or ?summary=1 for the days so far and the streak', tags: ['Creative Carbon Store'], query: parallelQuerySchema, responses: [{ status: 200, description: 'Sheet or summary', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Save the paper balances for a store; differences beyond 0.1% (at least 0.5) are flagged', tags: ['Creative Carbon Store'], requestBody: { schema: parallelSaveSchema }, responses: [{ status: 200, description: 'Sheet with differences', schema: z.object({}).passthrough() }], errors: [{ status: 409, description: 'A past day without a saved check' }] },
  },
}

export { GET, POST }
