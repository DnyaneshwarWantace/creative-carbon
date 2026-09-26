import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveOrderContext } from '../../../dermat_orders/lib/server'
import { Vendor } from '../../../dermat_vendors/data/entities'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_purchase.view'] },
}

const querySchema = z.object({ q: z.string().trim().max(120).optional(), id: z.string().uuid().optional() })

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const where: Record<string, unknown> = { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null, isActive: true }
  if (parsed.data.id) where.id = parsed.data.id
  if (parsed.data.q) {
    const term = `%${parsed.data.q.replace(/[%_]/g, '')}%`
    where.$or = [{ name: { $ilike: term } }, { code: { $ilike: term } }, { gstNumber: { $ilike: term } }]
  }
  const vendors = await ctx.em.find(Vendor, where, { orderBy: { name: 'asc' }, limit: 20 })
  return NextResponse.json({
    items: vendors.map((vendor) => ({
      id: vendor.id,
      name: vendor.name,
      code: vendor.code ?? null,
      gstNumber: vendor.gstNumber ?? null,
      contactPerson: vendor.contactPerson ?? null,
      contactPhone: vendor.contactPhone ?? null,
      address: vendor.address ?? null,
      paymentTerms: vendor.paymentTerms ?? null,
    })),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Purchase',
  summary: 'Find a vendor by name, code or GST number',
  methods: {
    GET: { summary: 'Active vendors matching the search', tags: ['Dermat Purchase'], query: querySchema, responses: [{ status: 200, description: 'Vendors', schema: z.object({ items: z.array(z.object({ id: z.string() }).passthrough()) }) }] },
  },
}

export { GET }
