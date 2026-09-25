import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['catalog.products.view'] },
}

const querySchema = z.object({
  productIds: z
    .string()
    .transform((value) => value.split(',').map((id) => id.trim()).filter(Boolean))
    .pipe(z.array(z.string().uuid()).max(100)),
})

const stockSchema = z.object({
  onHand: z.number(),
  reserved: z.number(),
  available: z.number(),
})

const responseSchema = z.object({ items: z.record(z.string(), stockSchema) })

type StockRow = { product_id: string; on_hand: string | null; reserved: string | null; available: string | null }

async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId || !auth.orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const parsed = querySchema.safeParse({ productIds: new URL(req.url).searchParams.get('productIds') ?? '' })
  if (!parsed.success) {
    return NextResponse.json({ error: 'productIds must be a comma-separated list of ids' }, { status: 400 })
  }
  const productIds = parsed.data.productIds
  if (!productIds.length) return NextResponse.json({ items: {} })

  const container = await createRequestContainer()
  const em = container.resolve('em') as EntityManager
  const rows = await em.getConnection().execute<StockRow[]>(
    `select v.product_id,
            sum(b.quantity_on_hand) as on_hand,
            sum(b.quantity_reserved) as reserved,
            sum(b.quantity_available) as available
       from catalog_product_variants v
       join wms_inventory_balances b on b.catalog_variant_id = v.id and b.deleted_at is null
      where v.product_id = any(?::uuid[])
        and v.deleted_at is null
        and b.tenant_id = ?
        and b.organization_id = ?
      group by v.product_id`,
    [`{${productIds.join(',')}}`, auth.tenantId, auth.orgId],
  )
  const items: Record<string, z.infer<typeof stockSchema>> = {}
  for (const row of rows) {
    items[row.product_id] = {
      onHand: Number(row.on_hand ?? 0),
      reserved: Number(row.reserved ?? 0),
      available: Number(row.available ?? 0),
    }
  }
  return NextResponse.json({ items })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Products',
  summary: 'Stock totals per product',
  methods: {
    GET: {
      summary: 'Sum wms stock (on hand, reserved, available) across all stores for the given products',
      tags: ['Dermat Products'],
      query: querySchema,
      responses: [{ status: 200, description: 'Stock totals keyed by product id', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid productIds' },
        { status: 401, description: 'Unauthorized' },
      ],
    },
  },
}

export { GET }
