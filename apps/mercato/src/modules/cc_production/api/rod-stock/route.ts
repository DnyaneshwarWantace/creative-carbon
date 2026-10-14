import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../cc_store/lib/server'
import { RodStock } from '../../data/entities'
import { findRods } from '../../lib/rodStock'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['cc_production.masters.view'] },
}

const querySchema = z.object({
  od: z.coerce.number().positive().max(10000).optional(),
  length: z.coerce.number().positive().max(100000).optional(),
  lengthTolerance: z.coerce.number().min(0).max(5000).default(0),
})

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Check the search' }, { status: 400 })
  const stored = await ctx.em.find(RodStock, { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, isActive: true }, { orderBy: { odFrom: 'asc', lengthMm: 'asc' } })
  const rows = stored.map((row) => ({ id: row.id, srNo: row.srNo ?? null, odText: row.odText, odFrom: Number(row.odFrom), odTo: row.odTo == null ? null : Number(row.odTo), lengthMm: row.lengthMm, quantity: row.quantity }))
  const items = findRods(rows, parsed.data).slice(0, 200)
  return NextResponse.json({ items, totalPieces: items.reduce((sum, item) => sum + item.quantity, 0) })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Masters',
  summary: 'Rod stock from the tube rod list: find rods by OD and length',
  methods: {
    GET: { summary: 'Find rods (?od=&length=&lengthTolerance=)', tags: ['Creative Carbon Masters'], query: querySchema, responses: [{ status: 200, description: 'Rods and total pieces', schema: z.object({ items: z.array(z.object({}).passthrough()), totalPieces: z.number() }) }] },
  },
}

export { GET }
