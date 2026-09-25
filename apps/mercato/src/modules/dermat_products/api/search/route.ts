import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { PRODUCT_KINDS, type ProductKind } from '../../lib/kinds'
import { searchProducts } from '../../lib/productSearch'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['catalog.products.view'] },
}

const KIND_CODES = PRODUCT_KINDS.map((kind) => kind.code) as [ProductKind, ...ProductKind[]]

const querySchema = z.object({
  kinds: z
    .string()
    .transform((value) => value.split(',').filter(Boolean))
    .pipe(z.array(z.enum(KIND_CODES)).min(1)),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

const itemSchema = z.object({
  id: z.string(),
  title: z.string(),
  code: z.string().nullable(),
  sku: z.string().nullable(),
  kind: z.string(),
  unit: z.string().nullable(),
})

async function GET(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = scope?.selectedId ?? auth.orgId ?? null
  if (!organizationId) return NextResponse.json({ error: 'Select an organization first' }, { status: 400 })
  const em = (container.resolve('em') as EntityManager).fork()
  const items = await searchProducts(em, {
    tenantId: auth.tenantId,
    organizationId,
    kinds: parsed.data.kinds,
    query: parsed.data.q,
    limit: parsed.data.limit,
  })
  return NextResponse.json({ items })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Products',
  summary: 'Search products by internal ID or name',
  methods: {
    GET: {
      summary: 'Search products of the given types by internal ID (spaces and dashes ignored), name or SKU',
      tags: ['Dermat Products'],
      query: querySchema,
      responses: [{ status: 200, description: 'Matching products, best match first', schema: z.object({ items: z.array(itemSchema) }) }],
    },
  },
}

export { GET }
