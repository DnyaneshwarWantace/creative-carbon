import { NextResponse } from 'next/server'
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { runRouteMutationGuards } from '@open-mercato/shared/lib/crud/route-mutation-guard'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { productUpdateSchema } from '@open-mercato/core/modules/catalog/data/validators'
import { PRODUCT_KINDS } from '../../lib/kinds'
import { activeOptions } from '../../../dermat_lists/lib/service'
import { createProductWithStockSetup } from '../../lib/createProduct'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['catalog.products.view'] },
  POST: { requireAuth: true, requireFeatures: ['catalog.products.manage'] },
}

const querySchema = z.object({ productId: z.string().uuid().optional() })
const bodySchema = z.object({ productId: z.string().uuid(), types: z.array(z.string().trim().min(1).max(60)).max(30) })

const linkedSchema = z.object({ id: z.string(), title: z.string(), type: z.string(), sku: z.string().nullable(), unit: z.string().nullable() })

type Scope = { em: EntityManager; tenantId: string; organizationId: string }

function packingName(type: string, productTitle: string): string {
  return `${type} - ${productTitle}`
}

function skuSuffix(type: string): string {
  return type.toUpperCase().replace(/[^A-Z0-9]+/g, '')
}

async function resolveScope(req: Request) {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) return null
  const container = await createRequestContainer()
  const organizationScope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = organizationScope?.selectedId ?? auth.orgId ?? null
  if (!organizationId) return null
  const em = (container.resolve('em') as EntityManager).fork()
  return { auth, container, organizationScope, organizationId, tenantId: auth.tenantId, em }
}

async function loadParent(scope: Scope, productId: string) {
  const [row] = await scope.em.getConnection().execute<Array<{ id: string; title: string; sku: string | null; kind: string | null }>>(
    `select id, title, sku, custom_fieldset_code as kind from catalog_products
      where id = ? and tenant_id = ? and organization_id = ? and deleted_at is null`,
    [productId, scope.tenantId, scope.organizationId],
  )
  return row ?? null
}

async function loadLinked(scope: Scope, productId: string) {
  return scope.em.getConnection().execute<Array<{ id: string; title: string; type: string; sku: string | null; unit: string | null }>>(
    `select p.id, p.title, coalesce(t.value_text, '') as type, p.sku, p.default_unit as unit
       from custom_field_values l
       join catalog_products p on p.id::text = l.record_id and p.deleted_at is null
       left join custom_field_values t on t.record_id = l.record_id and t.field_key = 'packing_item_type' and t.deleted_at is null
      where l.entity_id = 'catalog:catalog_product' and l.field_key = 'parent_product_id' and l.value_text = ? and l.deleted_at is null
        and p.tenant_id = ? and p.organization_id = ?
      order by p.title`,
    [productId, scope.tenantId, scope.organizationId],
  )
}

async function loadTypes(scope: Scope) {
  return activeOptions(scope, 'packing_item_types')
}

async function GET(req: Request) {
  const scope = await resolveScope(req)
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'productId is required' }, { status: 400 })
  const [items, types] = await Promise.all([parsed.data.productId ? loadLinked(scope, parsed.data.productId) : [], loadTypes(scope)])
  return NextResponse.json({ items, types })
}

async function POST(req: Request) {
  const scope = await resolveScope(req)
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid packing items' }, { status: 400 })
  const parent = await loadParent(scope, parsed.data.productId)
  if (!parent) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
  if (parent.kind !== 'finished_goods') return NextResponse.json({ error: 'Packing items can only be created for a Finished Good' }, { status: 400 })

  const userId = typeof scope.auth.sub === 'string' ? scope.auth.sub : 'system'
  const guard = await runRouteMutationGuards({
    container: scope.container,
    req,
    auth: { userId, tenantId: scope.tenantId, organizationId: scope.organizationId },
    input: { resourceKind: 'dermat_products.packing_items', resourceId: parent.id, operation: 'custom', mutationPayload: parsed.data },
  })
  if (!guard.ok) return guard.response

  const ctx: CommandRuntimeContext = {
    container: scope.container,
    auth: scope.auth,
    organizationScope: scope.organizationScope,
    selectedOrganizationId: scope.organizationId,
    organizationIds: scope.organizationScope?.filterIds ?? [scope.organizationId],
    request: req,
  }
  const commandBus = scope.container.resolve('commandBus') as CommandBus
  const connection = scope.em.getConnection()
  const linked = await loadLinked(scope, parent.id)
  const linkedTypes = new Set(linked.map((item) => item.type.toLowerCase()))

  for (const item of linked) {
    const expected = packingName(item.type || 'Packing', parent.title)
    if (item.title === expected) continue
    const input = productUpdateSchema.parse({ id: item.id, title: expected, tenantId: scope.tenantId, organizationId: scope.organizationId })
    await commandBus.execute('catalog.products.update', { input, ctx })
  }

  const wanted = Array.from(new Map(parsed.data.types.map((type) => [type.toLowerCase(), type])).values())
  const missing = wanted.filter((type) => !linkedTypes.has(type.toLowerCase()))
  if (missing.length) {
    const pmLabel = PRODUCT_KINDS.find((kind) => kind.code === 'packing_material')?.label ?? 'Packing Material'
    const [category] = await connection.execute<Array<{ id: string }>>(
      `select id from catalog_product_categories where tenant_id = ? and organization_id = ? and name = ? and parent_id is null and deleted_at is null limit 1`,
      [scope.tenantId, scope.organizationId, pmLabel],
    )
    const [tax] = await connection.execute<Array<{ id: string }>>(
      `select id from sales_tax_rates where tenant_id = ? and organization_id = ? and is_default = true and deleted_at is null limit 1`,
      [scope.tenantId, scope.organizationId],
    )
    for (const type of missing) {
      await createProductWithStockSetup(commandBus, ctx, connection, {
        title: packingName(type, parent.title),
        kind: 'packing_material',
        unit: 'pc',
        categoryId: category?.id ?? null,
        taxRateId: tax?.id ?? null,
        sku: parent.sku ? `${parent.sku}-${skuSuffix(type)}` : null,
        custom: { cf_parent_product_id: parent.id, cf_packing_item_type: type },
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
      })
    }
  }
  await guard.runAfterSuccess()
  return NextResponse.json({ items: await loadLinked(scope, parent.id), created: missing })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Dermat Products',
  summary: 'Packing items that belong to a Finished Good',
  methods: {
    GET: {
      summary: 'List the packing items made for a Finished Good, and the packing item types',
      tags: ['Dermat Products'],
      query: querySchema,
      responses: [{ status: 200, description: 'Linked packing items', schema: z.object({ items: z.array(linkedSchema), types: z.array(z.string()) }) }],
    },
    POST: {
      summary: 'Create missing packing items (named "<Type> - <product>", SKU = main SKU + type) and keep their names in sync',
      tags: ['Dermat Products'],
      requestBody: { schema: bodySchema },
      responses: [{ status: 200, description: 'Linked packing items', schema: z.object({ items: z.array(linkedSchema), created: z.array(z.string()) }) }],
      errors: [{ status: 400, description: 'Not a Finished Good' }],
    },
  },
}

export { GET, POST }
