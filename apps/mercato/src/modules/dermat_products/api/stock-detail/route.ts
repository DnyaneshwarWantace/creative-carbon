import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['catalog.products.view'] },
}

const querySchema = z.object({ productId: z.string().uuid() })

const responseSchema = z.object({
  stores: z.array(z.object({ code: z.string(), onHand: z.number(), reserved: z.number(), available: z.number() })),
  batches: z.array(
    z.object({ lotNumber: z.string(), store: z.string().nullable(), onHand: z.number(), expiresAt: z.string().nullable(), manufacturedAt: z.string().nullable(), status: z.string().nullable() }),
  ),
  movements: z.array(
    z.object({ at: z.string(), type: z.string(), quantity: z.number(), from: z.string().nullable(), to: z.string().nullable(), lotNumber: z.string().nullable(), reason: z.string().nullable() }),
  ),
})

async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'productId is required' }, { status: 400 })
  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = scope?.selectedId ?? auth.orgId ?? null
  if (!organizationId) return NextResponse.json({ error: 'Select an organization first' }, { status: 400 })
  const connection = (container.resolve('em') as EntityManager).fork().getConnection()
  const params = [parsed.data.productId, auth.tenantId, organizationId]
  const variantFilter = `select v.id from catalog_product_variants v where v.product_id = ? and v.deleted_at is null`
  const [stores, batches, movements] = await Promise.all([
    connection.execute<Array<{ code: string; on_hand: string; reserved: string; available: string }>>(
      `select coalesce(l.code, 'Unknown') as code, sum(b.quantity_on_hand) as on_hand, sum(b.quantity_reserved) as reserved, sum(b.quantity_available) as available
         from wms_inventory_balances b left join wms_warehouse_locations l on l.id = b.location_id
        where b.catalog_variant_id in (${variantFilter}) and b.tenant_id = ? and b.organization_id = ? and b.deleted_at is null
        group by l.code order by l.code`,
      params,
    ),
    connection.execute<Array<{ lot_number: string; store: string | null; on_hand: string; expires_at: Date | null; manufactured_at: Date | null; status: string | null }>>(
      `select lot.lot_number, l.code as store, sum(b.quantity_on_hand) as on_hand, lot.expires_at, lot.manufactured_at, lot.status
         from wms_inventory_balances b
         join wms_inventory_lots lot on lot.id = b.lot_id
         left join wms_warehouse_locations l on l.id = b.location_id
        where b.catalog_variant_id in (${variantFilter}) and b.tenant_id = ? and b.organization_id = ? and b.deleted_at is null
        group by lot.lot_number, l.code, lot.expires_at, lot.manufactured_at, lot.status
        having sum(b.quantity_on_hand) <> 0
        order by lot.expires_at nulls last, lot.lot_number`,
      params,
    ),
    connection.execute<Array<{ at: Date; type: string; quantity: string; from_code: string | null; to_code: string | null; lot_number: string | null; reason: string | null }>>(
      `select coalesce(m.performed_at, m.created_at) as at, m.type, m.quantity, lf.code as from_code, lt.code as to_code, lot.lot_number, m.reason
         from wms_inventory_movements m
         left join wms_warehouse_locations lf on lf.id = m.location_from_id
         left join wms_warehouse_locations lt on lt.id = m.location_to_id
         left join wms_inventory_lots lot on lot.id = m.lot_id
        where m.catalog_variant_id in (${variantFilter}) and m.tenant_id = ? and m.organization_id = ? and m.deleted_at is null
        order by coalesce(m.performed_at, m.created_at) desc limit 30`,
      params,
    ),
  ])
  const iso = (value: Date | null) => (value ? new Date(value).toISOString() : null)
  return NextResponse.json({
    stores: stores.map((row) => ({ code: row.code, onHand: Number(row.on_hand), reserved: Number(row.reserved), available: Number(row.available) })),
    batches: batches.map((row) => ({
      lotNumber: row.lot_number,
      store: row.store,
      onHand: Number(row.on_hand),
      expiresAt: iso(row.expires_at),
      manufacturedAt: iso(row.manufactured_at),
      status: row.status,
    })),
    movements: movements.map((row) => ({
      at: iso(row.at) ?? '',
      type: row.type,
      quantity: Number(row.quantity),
      from: row.from_code,
      to: row.to_code,
      lotNumber: row.lot_number,
      reason: row.reason,
    })),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Products',
  summary: 'Stock of one product by store, batch and recent movements',
  methods: {
    GET: {
      summary: 'Stock by store, batches with expiry, last 30 movements',
      tags: ['Dermat Products'],
      query: querySchema,
      responses: [{ status: 200, description: 'Stock detail', schema: responseSchema }],
    },
  },
}

export { GET }
