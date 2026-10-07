import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { currentUserName, hasFeatures, resolveOrderContext, type OrderContext } from '../../../cc_orders/lib/server'
import { masterDeleteSchema, masterListQuerySchema, masterWriteSchema } from '../../data/validators'
import { masterDef, type MasterDef } from '../../lib/masterDefs'
import { createMaster, deleteMaster, findMaster, listMasters, masterRow, updateMaster } from '../../lib/masters'
import { plantErrorResponse, runPlantGuarded } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true },
  POST: { requireAuth: true },
  PUT: { requireAuth: true },
  DELETE: { requireAuth: true },
}

async function allowed(ctx: OrderContext, def: MasterDef, write: boolean): Promise<boolean> {
  return hasFeatures(ctx, [write ? def.manageFeature : def.viewFeature])
}

function forbidden(def: MasterDef, write: boolean) {
  return NextResponse.json({ error: write ? `You cannot change ${def.label.toLowerCase()}` : `You cannot see ${def.label.toLowerCase()}` }, { status: 403 })
}

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = masterListQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Say which master to list' }, { status: 400 })
  const def = masterDef(parsed.data.type)!
  if (!(await allowed(ctx, def, false))) return forbidden(def, false)
  const items = await listMasters(ctx, def, { search: parsed.data.search, includeInactive: parsed.data.includeInactive !== 'false' })
  return NextResponse.json({ type: def.type, label: def.label, items, canManage: await allowed(ctx, def, true) })
}

async function POST(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = masterWriteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Send the master type and its values' }, { status: 400 })
  const def = masterDef(parsed.data.type)!
  if (!(await allowed(ctx, def, true))) return forbidden(def, true)
  try {
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: `cc_production.${def.type}`, resourceId: 'new', operation: 'create', payload: parsed.data }, async () =>
      masterRow(ctx, def, await createMaster(ctx, def, parsed.data.values, byName)),
    )
    if (result instanceof Response) return result
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function PUT(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = masterWriteSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success || !parsed.data.id) return NextResponse.json({ error: 'Send the master type, id and values' }, { status: 400 })
  const def = masterDef(parsed.data.type)!
  if (!(await allowed(ctx, def, true))) return forbidden(def, true)
  try {
    const entity = await findMaster(ctx, def, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: `cc_production.${def.type}`, resourceId: entity.id, current: entity.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: `cc_production.${def.type}`, resourceId: entity.id, operation: 'update', payload: parsed.data }, async () =>
      masterRow(ctx, def, await updateMaster(ctx, def, entity, parsed.data.values, byName)),
    )
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

async function DELETE(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = masterDeleteSchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Send the master type and id' }, { status: 400 })
  const def = masterDef(parsed.data.type)!
  if (!(await allowed(ctx, def, true))) return forbidden(def, true)
  try {
    const entity = await findMaster(ctx, def, parsed.data.id)
    enforceCommandOptimisticLock({ resourceKind: `cc_production.${def.type}`, resourceId: entity.id, current: entity.updatedAt, request: req })
    const byName = await currentUserName(ctx)
    const result = await runPlantGuarded(ctx, req, { resourceKind: `cc_production.${def.type}`, resourceId: entity.id, operation: 'delete', payload: parsed.data }, async () => {
      await deleteMaster(ctx, entity, byName)
      return { ok: true }
    })
    if (result instanceof Response) return result
    return NextResponse.json(result)
  } catch (error) {
    return plantErrorResponse(error)
  }
}

const rowSchema = z.record(z.string(), z.unknown())

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Plant',
  summary: 'Plant masters: reactors, dryers, presses, moulds, loading tolerance, price lists',
  methods: {
    GET: { summary: 'List one master (?type=reactors|dryers|presses|moulds|tolerances|prices)', tags: ['Creative Carbon Plant'], query: masterListQuerySchema, responses: [{ status: 200, description: 'Rows', schema: z.object({ items: z.array(rowSchema) }).passthrough() }] },
    POST: { summary: 'Add a row', tags: ['Creative Carbon Plant'], requestBody: { schema: masterWriteSchema }, responses: [{ status: 201, description: 'Created row', schema: rowSchema }], errors: [{ status: 409, description: 'Already exists' }] },
    PUT: { summary: 'Change a row', tags: ['Creative Carbon Plant'], requestBody: { schema: masterWriteSchema }, responses: [{ status: 200, description: 'Updated row', schema: rowSchema }], errors: [{ status: 409, description: 'Already exists, or changed by someone else' }] },
    DELETE: { summary: 'Remove a row (?type=&id=)', tags: ['Creative Carbon Plant'], query: masterDeleteSchema, responses: [{ status: 200, description: 'Removed', schema: z.object({ ok: z.boolean() }) }] },
  },
}

export { GET, POST, PUT, DELETE }
