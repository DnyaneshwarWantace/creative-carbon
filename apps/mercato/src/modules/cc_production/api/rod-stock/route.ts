import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { RodStock } from '../../data/entities'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['cc_production.masters.view'] }, DELETE: { requireAuth: true, requireFeatures: ['cc_production.masters.manage'] } }

const querySchema = z.object({ od: z.coerce.number().positive().max(10000).optional(), length: z.coerce.number().positive().max(100000).optional(), lengthTolerance: z.coerce.number().min(0).max(5000).default(50) })

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Check the search' }, { status: 400 })
  const rows = await ctx.em.find(RodStock, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, isActive: true }, { orderBy: { odFrom: 'asc', lengthMm: 'asc' } })
  const { od, length, lengthTolerance } = parsed.data
  const items = rows
    .filter((row) => od === undefined || (od >= Number(row.odFrom) && od <= Number(row.odTo ?? row.odFrom)))
    .filter((row) => length === undefined || Math.abs(row.lengthMm - length) <= lengthTolerance)
    .map((row) => ({ id: row.id, srNo: row.srNo ?? null, odText: row.odText, odFrom: Number(row.odFrom), odTo: row.odTo == null ? null : Number(row.odTo), lengthMm: row.lengthMm, quantity: row.quantity, updatedAt: row.updatedAt.toISOString() }))
  return NextResponse.json({ items, totalPieces: items.reduce((sum, item) => sum + item.quantity, 0) })
}

async function DELETE(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const id = new URL(req.url).searchParams.get('id') ?? ''
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Say which rod row' }, { status: 400 })
  const row = await ctx.em.findOne(RodStock, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!row) return NextResponse.json({ error: 'Rod row not found' }, { status: 404 })
  row.deletedAt = new Date()
  await ctx.em.flush()
  return NextResponse.json({ ok: true })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Masters',
  summary: 'Rod stock from the tube rod list: find rods by OD and length',
  methods: { DELETE: { summary: 'Remove a rod stock row (?id=)', tags: ['Creative Carbon Masters'], responses: [{ status: 200, description: 'Removed', schema: z.object({ ok: z.boolean() }) }] }, GET: { summary: 'Rod stock (?od=25&length=800)', tags: ['Creative Carbon Masters'], query: querySchema, responses: [{ status: 200, description: 'Rods', schema: z.object({ items: z.array(z.object({ id: z.string() }).passthrough()) }).passthrough() }] } },
}

export { DELETE, GET }
