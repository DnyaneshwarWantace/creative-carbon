import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName } from '../../../../cc_orders/lib/server'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { coatingListSchema, coatingSheetInputSchema, coatingSheetUpdateSchema } from '../../../data/validators'
import { createSheet, findSheet, listSheets, sheetView, updateSheet } from '../../../lib/coating'
import { plantErrorResponse, runPlantGuarded } from '../../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.coating.view'] },
  POST: { requireAuth: true, requireFeatures: ['cc_production.coating.enter'] },
  PUT: { requireAuth: true, requireFeatures: ['cc_production.coating.enter'] },
}

function inputError(error: z.ZodError) {
  const issue = error.issues[0]
  const path = issue?.path ?? []
  if (path[0] === 'rows') return `Row ${typeof path[1] === 'number' ? path[1] + 1 : ''}: check ${String(path[2] ?? 'the values')}`
  if (path[0] === 'slots') return 'Check the time slots: times like 8.00, kg as numbers'
  if (path[0] === 'dryerId') return 'Pick the dryer'
  if (path[0] === 'sheetDate') return 'Enter the date'
  return 'Check the sheet'
}

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = coatingListSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  try {
    if (parsed.data.id) return NextResponse.json(await sheetView(ctx, await findSheet(ctx, parsed.data.id)))
    return NextResponse.json({ items: await listSheets(ctx, parsed.data) })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function POST(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = coatingSheetInputSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: inputError(parsed.error) }, { status: 400 })
  try {
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.coating_sheet', resourceId: 'new', operation: 'create', payload: parsed.data }, async () => sheetView(ctx, await createSheet(ctx, parsed.data, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = coatingSheetUpdateSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: inputError(parsed.error) }, { status: 400 })
  try {
    const sheet = await findSheet(ctx, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: 'cc_production.coating_sheet', resourceId: sheet.id, current: sheet.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: 'cc_production.coating_sheet', resourceId: sheet.id, operation: 'update', payload: parsed.data }, async () => sheetView(ctx, await updateSheet(ctx, sheet, parsed.data, byName)))
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

const sheetSchema = z.object({ id: z.string(), status: z.string() }).passthrough()

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Coating',
  summary: 'Dryer day sheets (Quality Control Report, Dryer No. N)',
  methods: {
    GET: { summary: 'List sheets (?date= or ?month=) or one sheet (?id=)', tags: ['Creative Carbon Coating'], query: coatingListSchema, responses: [{ status: 200, description: 'Sheets', schema: z.object({}).passthrough() }] },
    POST: { summary: 'Enter a dryer sheet (not posted)', tags: ['Creative Carbon Coating'], requestBody: { schema: coatingSheetInputSchema }, responses: [{ status: 201, description: 'Sheet', schema: sheetSchema }], errors: [{ status: 409, description: 'A sheet for that dryer and day exists' }] },
    PUT: { summary: 'Change a dryer sheet that is not posted', tags: ['Creative Carbon Coating'], requestBody: { schema: coatingSheetUpdateSchema }, responses: [{ status: 200, description: 'Sheet', schema: sheetSchema }], errors: [{ status: 409, description: 'Posted, or changed by someone else' }] },
  },
}

export { GET, POST, PUT }
