import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { User } from '@open-mercato/core/modules/auth/data/entities'

export type BomRequestContext = {
  container: Awaited<ReturnType<typeof createRequestContainer>>
  em: EntityManager
  tenantId: string
  organizationId: string
  userId: string | null
  auth: NonNullable<Awaited<ReturnType<typeof getAuthFromRequest>>>
}

export type ProductSummary = {
  id: string
  title: string
  kind: string | null
  unit: string | null
  sku: string | null
  code: string | null
  cost: number | null
  specificGravity: number | null
  packSize: string | null
}

export type StockSummary = { onHand: number; reserved: number; available: number }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function resolveBomContext(req: Request): Promise<BomRequestContext | { error: string; status: number }> {
  const auth = await getAuthFromRequest(req)
  if (!auth?.tenantId) return { error: 'Unauthorized', status: 401 }
  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request: req })
  const organizationId = scope?.selectedId ?? auth.orgId ?? null
  if (!organizationId) return { error: 'Select an organization first', status: 400 }
  const em = (container.resolve('em') as EntityManager).fork()
  const userId = [auth.sub, auth.userId].find((value): value is string => typeof value === 'string' && UUID_RE.test(value)) ?? null
  return { container, em, tenantId: auth.tenantId, organizationId, userId, auth }
}

export async function loadProducts(ctx: BomRequestContext, ids: string[]): Promise<Map<string, ProductSummary>> {
  const unique = Array.from(new Set(ids)).filter((id) => UUID_RE.test(id))
  const result = new Map<string, ProductSummary>()
  if (!unique.length) return result
  const rows = await ctx.em.getConnection().execute<
    Array<{
      id: string
      title: string
      custom_fieldset_code: string | null
      default_unit: string | null
      sku: string | null
      item_code: string | null
      cost_price: string | null
      specific_gravity: string | null
      pack_size: string | null
    }>
  >(
    `select p.id, p.title, p.custom_fieldset_code, p.default_unit, p.sku,
            (select v.value_text from custom_field_values v
              where v.entity_id = 'catalog:catalog_product' and v.record_id = p.id::text and v.field_key = 'item_code'
                and v.deleted_at is null and coalesce(v.value_text, '') <> ''
              order by v.created_at desc limit 1) as item_code,
            (select coalesce(v.value_float::numeric, v.value_int::numeric, nullif(regexp_replace(coalesce(v.value_text, ''), '[^0-9.]', '', 'g'), '')::numeric)
               from custom_field_values v
              where v.entity_id = 'catalog:catalog_product' and v.record_id = p.id::text and v.field_key = 'cost_price' and v.deleted_at is null
              order by v.created_at desc limit 1) as cost_price,
            (select coalesce(v.value_float::numeric, v.value_int::numeric, nullif(regexp_replace(coalesce(v.value_text, ''), '[^0-9.]', '', 'g'), '')::numeric)
               from custom_field_values v
              where v.entity_id = 'catalog:catalog_product' and v.record_id = p.id::text and v.field_key = 'specific_gravity' and v.deleted_at is null
              order by v.created_at desc limit 1) as specific_gravity,
            (select v.value_text from custom_field_values v
              where v.entity_id = 'catalog:catalog_product' and v.record_id = p.id::text and v.field_key = 'pack_size' and v.deleted_at is null
              order by v.created_at desc limit 1) as pack_size
       from catalog_products p
      where p.id = any(?::uuid[]) and p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null`,
    [`{${unique.join(',')}}`, ctx.tenantId, ctx.organizationId],
  )
  for (const row of rows) {
    result.set(row.id, {
      id: row.id,
      title: row.title,
      kind: row.custom_fieldset_code,
      unit: row.default_unit,
      sku: row.sku,
      code: row.item_code,
      cost: row.cost_price == null ? null : Number(row.cost_price),
      specificGravity: row.specific_gravity == null ? null : Number(row.specific_gravity),
      packSize: row.pack_size,
    })
  }
  return result
}

export async function loadStock(ctx: BomRequestContext, productIds: string[]): Promise<Map<string, StockSummary>> {
  const unique = Array.from(new Set(productIds)).filter((id) => UUID_RE.test(id))
  const result = new Map<string, StockSummary>()
  if (!unique.length) return result
  const rows = await ctx.em.getConnection().execute<Array<{ product_id: string; on_hand: string | null; reserved: string | null; available: string | null }>>(
    `select v.product_id,
            sum(b.quantity_on_hand) as on_hand,
            sum(b.quantity_reserved) as reserved,
            sum(b.quantity_available) as available
       from catalog_product_variants v
       join wms_inventory_balances b on b.catalog_variant_id = v.id and b.deleted_at is null
      where v.product_id = any(?::uuid[]) and v.deleted_at is null and b.tenant_id = ? and b.organization_id = ?
      group by v.product_id`,
    [`{${unique.join(',')}}`, ctx.tenantId, ctx.organizationId],
  )
  for (const row of rows) {
    result.set(row.product_id, {
      onHand: Number(row.on_hand ?? 0),
      reserved: Number(row.reserved ?? 0),
      available: Number(row.available ?? 0),
    })
  }
  return result
}

export async function currentUserName(ctx: BomRequestContext): Promise<string | null> {
  if (!ctx.userId) return null
  const user = await findOneWithDecryption(
    ctx.em,
    User,
    { id: ctx.userId, deletedAt: null },
    undefined,
    { tenantId: ctx.tenantId, organizationId: ctx.organizationId },
  )
  if (!user) return null
  const name = typeof user.name === 'string' ? user.name.trim() : ''
  return name || (typeof user.email === 'string' ? user.email : null)
}

export async function nextBomCode(ctx: BomRequestContext): Promise<string> {
  const [row] = await ctx.em.getConnection().execute<Array<{ max: number | null }>>(
    `select max(nullif(regexp_replace(code, '\\D', '', 'g'), '')::int) as max
       from dermat_bom_headers where tenant_id = ? and organization_id = ?`,
    [ctx.tenantId, ctx.organizationId],
  )
  const next = Number(row?.max ?? 0) + 1
  return `BOM-${String(next).padStart(5, '0')}`
}
