import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { loadProducts, resolveBomContext } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_boms.view'] },
}

const querySchema = z.object({ productId: z.string().uuid() })

const usageSchema = z.object({
  bomId: z.string(),
  version: z.number(),
  status: z.string(),
  productId: z.string(),
  productName: z.string(),
  productCode: z.string().nullable(),
  productKind: z.string().nullable(),
  percent: z.number().nullable(),
  perPiece: z.number().nullable(),
  fillQty: z.number().nullable(),
  fillUnit: z.string().nullable(),
  unit: z.string(),
})

async function GET(req: Request) {
  const ctx = await resolveBomContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'productId is required' }, { status: 400 })
  const connection = ctx.em.getConnection()
  const direct = await connection.execute<
    Array<{ bom_id: string; version: number; status: string; product_id: string; percent: string | null; qty_per_unit: string | null; fill_qty: string | null; fill_unit: string | null; unit: string }>
  >(
    `select h.id as bom_id, h.version, h.status, h.product_id, i.percent, i.qty_per_unit, i.fill_qty, i.fill_unit, i.unit
       from dermat_bom_items i
       join dermat_bom_headers h on h.id = i.bom_id and h.deleted_at is null and h.status <> 'superseded'
      where i.component_product_id = ? and h.tenant_id = ? and h.organization_id = ?
      order by h.status = 'approved' desc, h.version desc`,
    [parsed.data.productId, ctx.tenantId, ctx.organizationId],
  )
  const upward = await connection.execute<Array<{ product_id: string }>>(
    `with recursive up(product_id) as (
        select ?::uuid
      union
        select h.product_id from up
          join dermat_bom_items i on i.component_product_id = up.product_id
          join dermat_bom_headers h on h.id = i.bom_id and h.deleted_at is null and h.status <> 'superseded'
           and h.tenant_id = ? and h.organization_id = ?
     )
     select product_id from up`,
    [parsed.data.productId, ctx.tenantId, ctx.organizationId],
  )
  const ids = Array.from(new Set([...direct.map((row) => row.product_id), ...upward.map((row) => row.product_id)]))
  const products = await loadProducts(ctx, ids)
  const finishedGoods = upward
    .map((row) => products.get(row.product_id))
    .filter((product) => product && product.kind === 'finished_goods' && product.id !== parsed.data.productId)
    .map((product) => ({ id: product!.id, title: product!.title, code: product!.code }))
  return NextResponse.json({
    usedIn: direct.map((row) => {
      const product = products.get(row.product_id)
      return {
        bomId: row.bom_id,
        version: row.version,
        status: row.status,
        productId: row.product_id,
        productName: product?.title ?? '(deleted product)',
        productCode: product?.code ?? null,
        productKind: product?.kind ?? null,
        percent: row.percent == null ? null : Number(row.percent),
        perPiece: row.qty_per_unit == null ? null : Number(row.qty_per_unit),
        fillQty: row.fill_qty == null ? null : Number(row.fill_qty),
        fillUnit: row.fill_unit,
        unit: row.unit,
      }
    }),
    finishedGoods,
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat BOM',
  summary: 'Where a product is used',
  methods: {
    GET: {
      summary: 'BOMs that use this product, and every Finished Good it ends up in',
      tags: ['Dermat BOM'],
      query: querySchema,
      responses: [
        {
          status: 200,
          description: 'Usage',
          schema: z.object({ usedIn: z.array(usageSchema), finishedGoods: z.array(z.object({ id: z.string(), title: z.string(), code: z.string().nullable() })) }),
        },
      ],
    },
  },
}

export { GET }
