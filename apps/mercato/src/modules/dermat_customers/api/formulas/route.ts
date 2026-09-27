import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { loadProducts, resolveOrderContext } from '../../../dermat_orders/lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_orders.view'] },
}

const querySchema = z.object({ customerId: z.string().uuid() })

type LineRow = { product_id: string; orders: string; pieces: string; last_order: string; last_order_id: string; last_order_no: string; rd_numbers: string | null; batches: string | null }
type BomRow = { id: string; code: string; product_id: string; version: number; status: string; order_id: string | null; bulk_id: string | null }

async function GET(req: Request) {
  const ctx = await resolveOrderContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Customer id is required' }, { status: 400 })
  const connection = ctx.em.getConnection()
  const rows = await connection.execute<LineRow[]>(
    `select l.product_id, count(distinct o.id)::text as orders, sum(l.quantity)::text as pieces, max(o.order_date) as last_order,
            (array_agg(o.id order by o.order_date desc))[1]::text as last_order_id, (array_agg(o.order_no order by o.order_date desc))[1] as last_order_no,
            string_agg(distinct l.rd_number, ', ') as rd_numbers, string_agg(distinct l.batch_no, ', ') as batches
       from dermat_order_lines l join dermat_orders o on o.id = l.order_id
      where o.customer_id = ? and o.tenant_id = ? and o.organization_id = ? and o.deleted_at is null and o.status <> 'cancelled'
      group by l.product_id order by max(o.order_date) desc`,
    [parsed.data.customerId, ctx.tenantId, ctx.organizationId],
  )
  const productIds = rows.map((row) => row.product_id)
  const boms = productIds.length
    ? await connection.execute<BomRow[]>(
        `select h.id, h.code, h.product_id, h.version, h.status, h.order_id,
                (select i.component_product_id from dermat_bom_items i where i.bom_id = h.id and i.component_kind = 'bulk' order by i.position limit 1) as bulk_id
           from dermat_bom_headers h
          where h.product_id = any(?::uuid[]) and h.tenant_id = ? and h.organization_id = ? and h.deleted_at is null
          order by h.version desc`,
        [`{${productIds.join(',')}}`, ctx.tenantId, ctx.organizationId],
      )
    : []
  const bulkIds = [...new Set(boms.map((bom) => bom.bulk_id).filter((id): id is string => Boolean(id)))]
  const formulas = bulkIds.length
    ? await connection.execute<BomRow[]>(
        `select h.id, h.code, h.product_id, h.version, h.status, h.order_id, null as bulk_id
           from dermat_bom_headers h
          where h.product_id = any(?::uuid[]) and h.tenant_id = ? and h.organization_id = ? and h.deleted_at is null
          order by h.version desc`,
        [`{${bulkIds.join(',')}}`, ctx.tenantId, ctx.organizationId],
      )
    : []
  const products = await loadProducts(ctx, [...productIds, ...bulkIds])
  const pick = (list: BomRow[], productId: string) => list.find((bom) => bom.product_id === productId && bom.status === 'approved' && !bom.order_id) ?? list.find((bom) => bom.product_id === productId) ?? null
  const view = (bom: BomRow | null) => (bom ? { id: bom.id, code: bom.code, version: bom.version, status: bom.status, orderSpecific: Boolean(bom.order_id) } : null)
  return NextResponse.json({
    items: rows.map((row) => {
      const pack = pick(boms, row.product_id)
      const bulkId = pack?.bulk_id ?? null
      return {
        productId: row.product_id,
        title: products.get(row.product_id)?.title ?? '(deleted product)',
        code: products.get(row.product_id)?.code ?? null,
        orders: Number(row.orders),
        pieces: Number(row.pieces),
        lastOrder: row.last_order,
        lastOrderId: row.last_order_id,
        lastOrderNo: row.last_order_no,
        rdNumbers: row.rd_numbers,
        batches: row.batches,
        packBom: view(pack),
        orderSpecificBoms: boms.filter((bom) => bom.product_id === row.product_id && bom.order_id).length,
        bulkId,
        bulkTitle: bulkId ? (products.get(bulkId)?.title ?? null) : null,
        formula: bulkId ? view(pick(formulas, bulkId)) : null,
      }
    }),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Customers',
  summary: 'Products a customer buys, with their pack BOM, bulk formula, R&D numbers and batches',
  methods: {
    GET: { summary: 'Customer products and formulas', tags: ['Dermat Customers'], query: querySchema, responses: [{ status: 200, description: 'Products', schema: z.object({ items: z.array(z.object({ productId: z.string() }).passthrough()) }) }] },
  },
}

export { GET }
