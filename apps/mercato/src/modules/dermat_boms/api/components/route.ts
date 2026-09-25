import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { PRODUCT_KINDS, type ProductKind } from '../../../dermat_products/lib/kinds'
import { loadStock, resolveBomContext } from '../../lib/server'

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
})

async function GET(req: Request) {
  const ctx = await resolveBomContext(req)
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const { kinds, search, limit } = parsed.data
  const params: unknown[] = [ctx.tenantId, ctx.organizationId, `{${kinds.join(',')}}`]
  let filter = ''
  let order = 'p.title asc'
  if (search) {
    const escaped = search.replace(/[\\%_]/g, (char) => `\\${char}`)
    filter = 'and (p.title ilike ? or code.value_text ilike ? or p.sku ilike ?)'
    params.push(`%${escaped}%`, `%${escaped}%`, `%${escaped}%`)
    order = `case when lower(code.value_text) = lower(?) then 0 when code.value_text ilike ? then 1 when p.title ilike ? then 2 else 3 end, p.title asc`
  }
  const rankParams = search ? [search, `${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`, `${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`] : []
  const rows = await ctx.em.getConnection().execute<
    Array<{ id: string; title: string; code: string | null; sku: string | null; kind: string; unit: string | null }>
  >(
    `select p.id, p.title, code.value_text as code, p.sku, p.custom_fieldset_code as kind, p.default_unit as unit
       from catalog_products p
       left join lateral (
         select v.value_text from custom_field_values v
          where v.entity_id = 'catalog:catalog_product' and v.record_id = p.id::text and v.field_key = 'item_code'
            and v.deleted_at is null and coalesce(v.value_text, '') <> ''
          order by v.created_at desc limit 1
       ) code on true
      where p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null and p.is_active = true
        and p.custom_fieldset_code = any(?::text[]) ${filter}
      order by ${order}
      limit ?`,
    [...params, ...rankParams, limit],
  )
  const stock = await loadStock(
    ctx,
    rows.map((row) => row.id),
  )
  return NextResponse.json({
    items: rows.map((row) => ({ ...row, onHand: stock.get(row.id)?.onHand ?? 0 })),
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
