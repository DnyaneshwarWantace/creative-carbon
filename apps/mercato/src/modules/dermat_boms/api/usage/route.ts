import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { loadProducts, resolveBomContext } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_boms.view'] },
}

const querySchema = z.object({ productId: z.string().uuid() })

const itemSchema = z.object({
  bomId: z.string(),
  bomCode: z.string(),
  version: z.number(),
  status: z.string(),
  productId: z.string(),
  productName: z.string(),
  productCode: z.string().nullable(),
  packSize: z.string().nullable(),
  perPiece: z.number(),
  fillQty: z.number().nullable(),
  fillUnit: z.string().nullable(),
})

async function GET(req: Request) {
  const ctx = await resolveBomContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'productId is required' }, { status: 400 })
  const rows = await ctx.em.getConnection().execute<
    Array<{ bom_id: string; code: string; version: number; status: string; product_id: string; qty_per_unit: string | null; fill_qty: string | null; fill_unit: string | null }>
  >(
    `select distinct on (h.product_id) h.id as bom_id, h.code, h.version, h.status, h.product_id, i.qty_per_unit, i.fill_qty, i.fill_unit
       from dermat_bom_items i
       join dermat_bom_headers h on h.id = i.bom_id and h.deleted_at is null and h.status <> 'superseded'
      where i.component_product_id = ? and h.tenant_id = ? and h.organization_id = ? and h.product_kind = 'finished_goods'
      order by h.product_id, (h.status = 'approved') desc, h.version desc`,
    [parsed.data.productId, ctx.tenantId, ctx.organizationId],
  )
  const products = await loadProducts(
    ctx,
    rows.map((row) => row.product_id),
  )
  const items = rows
    .map((row) => {
      const product = products.get(row.product_id)
      return {
        bomId: row.bom_id,
        bomCode: row.code,
        version: row.version,
        status: row.status,
        productId: row.product_id,
        productName: product?.title ?? '(deleted product)',
        productCode: product?.code ?? null,
        packSize: product?.packSize ?? null,
        perPiece: Number(row.qty_per_unit ?? 0),
        fillQty: row.fill_qty == null ? null : Number(row.fill_qty),
        fillUnit: row.fill_unit,
      }
    })
    .sort((a, b) => a.perPiece - b.perPiece)
  return NextResponse.json({ items })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat BOM',
  summary: 'Finished goods filled from a bulk',
  methods: {
    GET: {
      summary: 'Pack BOMs that use this bulk, with fill size and bulk per piece (for the fill plan)',
      tags: ['Dermat BOM'],
      query: querySchema,
      responses: [{ status: 200, description: 'Pack sizes filled from the bulk', schema: z.object({ items: z.array(itemSchema) }) }],
    },
  },
}

export { GET }
