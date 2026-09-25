import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { PRODUCT_KINDS, type ProductKind } from '../../../dermat_products/lib/kinds'
import { searchProducts } from '../../../dermat_products/lib/productSearch'
import { loadProducts, loadStock, resolveBomContext } from '../../lib/server'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['dermat_boms.view'] },
}

const KIND_CODES = PRODUCT_KINDS.map((kind) => kind.code) as [ProductKind, ...ProductKind[]]

const querySchema = z.object({
  kinds: z
    .string()
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(z.enum(KIND_CODES)).min(1)),
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

const itemSchema = z.object({
  id: z.string(),
  title: z.string(),
  code: z.string().nullable(),
  sku: z.string().nullable(),
  kind: z.string(),
  unit: z.string().nullable(),
  onHand: z.number(),
  specificGravity: z.number().nullable(),
  packSize: z.string().nullable(),
})

async function GET(req: Request) {
  const ctx = await resolveBomContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const { kinds, search, limit } = parsed.data
  const rows = await searchProducts(ctx.em, {
    tenantId: ctx.tenantId,
    organizationId: ctx.organizationId,
    kinds,
    query: search,
    limit,
    activeOnly: true,
  })
  const ids = rows.map((row) => row.id)
  const [stock, details] = await Promise.all([loadStock(ctx, ids), loadProducts(ctx, ids)])
  return NextResponse.json({
    items: rows.map((row) => ({
      ...row,
      onHand: stock.get(row.id)?.onHand ?? 0,
      specificGravity: details.get(row.id)?.specificGravity ?? null,
      packSize: details.get(row.id)?.packSize ?? null,
    })),
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat BOM',
  summary: 'Search materials for a BOM line',
  methods: {
    GET: {
      summary: 'Search products of the given types by name or code',
      tags: ['Dermat BOM'],
      query: querySchema,
      responses: [{ status: 200, description: 'Matching products', schema: z.object({ items: z.array(itemSchema) }) }],
    },
  },
}

export { GET }
