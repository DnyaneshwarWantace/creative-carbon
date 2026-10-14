import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveStoreContext } from '../../../../cc_store/lib/server'
import { loadCustomers } from '../../../../cc_orders/lib/server'
import { Mould } from '../../../data/entities'
import { dimensionMatch } from '../../../lib/dieChart'
import { DIE_FAMILY_KEYS } from '../../../lib/dieFamilies'

export const metadata = { GET: { requireAuth: true, requireFeatures: ['cc_production.masters.view'] } }

const querySchema = z.object({
  family: z.enum(DIE_FAMILY_KEYS as [string, ...string[]]).optional(),
  search: z.string().trim().max(120).optional(),
  tolerance: z.coerce.number().min(0).max(100).default(2),
})

async function GET(req: Request) {
  const ctx = await resolveStoreContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const params = Object.fromEntries(new URL(req.url).searchParams)
  const parsed = querySchema.safeParse(params)
  if (!parsed.success) return NextResponse.json({ error: 'Check the search' }, { status: 400 })
  const wanted: Record<string, number> = {}
  for (const [key, value] of Object.entries(params)) {
    const match = key.match(/^dim\.([A-Za-z0-9]{1,6})$/)
    if (match && value.trim() && Number.isFinite(Number(value))) wanted[match[1]] = Number(value)
  }
  const where: Record<string, unknown> = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null }
  if (parsed.data.family) where.family = parsed.data.family
  if (parsed.data.search) {
    const like = `%${parsed.data.search.replace(/[%_]/g, '')}%`
    where.$or = [{ dieNo: { $ilike: like } }, { customerRef: { $ilike: like } }, { drawingNo: { $ilike: like } }, { description: { $ilike: like } }]
  }
  const rows = await ctx.em.find(Mould, where, { orderBy: { family: 'asc', chartNo: 'asc', dieNo: 'asc' }, limit: 2000 })
  const matched = rows.filter((row) => dimensionMatch(row.dimensions, wanted, parsed.data.tolerance))
  const scored = Object.keys(wanted).length
    ? matched
        .map((row) => ({ row, distance: Object.entries(wanted).reduce((sum, [key, value]) => sum + Math.abs(Number(row.dimensions?.[key] ?? 0) - value), 0) }))
        .sort((left, right) => left.distance - right.distance)
        .map((entry) => entry.row)
    : matched
  const top = scored.slice(0, 100)
  const customers = await loadCustomers(ctx, top.map((row) => row.customerId ?? '').filter(Boolean))
  return NextResponse.json({
    total: matched.length,
    items: top.map((row) => ({
      id: row.id,
      dieNo: row.dieNo,
      family: row.family ?? null,
      mouldType: row.mouldType,
      description: row.description ?? null,
      dimensions: row.dimensions ?? {},
      weightKg: row.weightKg == null ? null : Number(row.weightKg),
      cavities: row.cavities ?? null,
      chartNo: row.chartNo ?? null,
      chartPage: row.chartPage ?? null,
      customerRef: row.customerRef ?? null,
      customerName: row.customerId ? (customers.get(row.customerId)?.name ?? null) : null,
      drawingNo: row.drawingNo ?? null,
      isActive: row.isActive,
    })),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Creative Carbon Masters',
  summary: 'Find a die by family, code / customer text and dimensions (dim.R1=50&dim.T=25&tolerance=2)',
  methods: { GET: { summary: 'Die finder', tags: ['Creative Carbon Masters'], query: querySchema, responses: [{ status: 200, description: 'Dies', schema: z.object({ items: z.array(z.object({ id: z.string() }).passthrough()) }).passthrough() }] } },
}

export { GET }
