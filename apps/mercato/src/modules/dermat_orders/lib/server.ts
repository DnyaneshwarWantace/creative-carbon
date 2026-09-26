import type { EntityManager } from '@mikro-orm/postgresql'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { findOneWithDecryption, findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'
import { DermatOrder } from '../data/entities'
import { financialYear } from './stages'

export type OrderContext = {
  container: Awaited<ReturnType<typeof createRequestContainer>>
  em: EntityManager
  tenantId: string
  organizationId: string
  userId: string | null
  auth: NonNullable<Awaited<ReturnType<typeof getAuthFromRequest>>>
}

export type CustomerSummary = {
  id: string
  name: string
  gstin: string | null
  paymentTerms: string | null
  paymentRemarks: string | null
  salesManager: string | null
  phone: string | null
  email: string | null
}

export type ProductSummary = {
  id: string
  title: string
  code: string | null
  sku: string | null
  kind: string | null
  unit: string | null
  packSize: string | null
  brandName: string | null
  mrp: number | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UNREADABLE_RE = /^[A-Za-z0-9+/=]{8,}:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:v\d+$/

export function readableText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed || UNREADABLE_RE.test(trimmed)) return null
  return trimmed
}

export class OrderError extends Error {
  constructor(
    message: string,
    public status = 400,
    public details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export async function resolveOrderContext(req: Request): Promise<OrderContext | { error: string; status: number }> {
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

export async function userNames(ctx: OrderContext, ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((id) => UUID_RE.test(id))))
  const result = new Map<string, string>()
  if (!unique.length) return result
  const users = await findWithDecryption(
    ctx.em,
    User,
    { id: { $in: unique }, tenantId: ctx.tenantId, deletedAt: null },
    undefined,
    { tenantId: ctx.tenantId, organizationId: ctx.organizationId },
  )
  for (const user of users) {
    const name = typeof user.name === 'string' && user.name.trim() ? user.name.trim() : typeof user.email === 'string' ? user.email : ''
    if (name) result.set(user.id, name)
  }
  return result
}

export async function currentUserName(ctx: OrderContext): Promise<string | null> {
  if (!ctx.userId) return null
  return (await userNames(ctx, [ctx.userId])).get(ctx.userId) ?? null
}

export async function listPeople(ctx: OrderContext): Promise<Array<{ id: string; name: string }>> {
  const users = await findWithDecryption(
    ctx.em,
    User,
    { tenantId: ctx.tenantId, deletedAt: null },
    { limit: 500 },
    { tenantId: ctx.tenantId, organizationId: ctx.organizationId },
  )
  return users
    .map((user) => ({
      id: user.id,
      name: typeof user.name === 'string' && user.name.trim() ? user.name.trim() : typeof user.email === 'string' ? user.email : user.id,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function loadCustomers(ctx: Pick<OrderContext, 'em' | 'tenantId' | 'organizationId'>, ids: string[]): Promise<Map<string, CustomerSummary>> {
  const unique = Array.from(new Set(ids.filter((id) => UUID_RE.test(id))))
  const result = new Map<string, CustomerSummary>()
  if (!unique.length) return result
  const entities = await findWithDecryption(
    ctx.em,
    CustomerEntity,
    { id: { $in: unique }, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null },
    undefined,
    { tenantId: ctx.tenantId, organizationId: ctx.organizationId },
  )
  const rows = await ctx.em.getConnection().execute<Array<{ entity_id: string; field_key: string; value_text: string | null }>>(
    `select c.entity_id, v.field_key, v.value_text
       from customer_companies c
       join custom_field_values v on v.record_id = c.id::text and v.entity_id = 'customers:customer_company_profile' and v.deleted_at is null
      where c.entity_id = any(?::uuid[]) and v.field_key in ('gstin', 'payment_terms', 'payment_remarks', 'sales_manager', 'legal_trade_name')`,
    [`{${unique.join(',')}}`],
  )
  const fields = new Map<string, Record<string, string>>()
  for (const row of rows) {
    const current = fields.get(row.entity_id) ?? {}
    if (row.value_text) current[row.field_key] = row.value_text
    fields.set(row.entity_id, current)
  }
  for (const entity of entities) {
    const extra = fields.get(entity.id) ?? {}
    result.set(entity.id, {
      id: entity.id,
      name: readableText(entity.displayName) ?? extra.legal_trade_name ?? '',
      gstin: extra.gstin ?? null,
      paymentTerms: extra.payment_terms ?? null,
      paymentRemarks: extra.payment_remarks ?? null,
      salesManager: extra.sales_manager ?? null,
      phone: readableText(entity.primaryPhone),
      email: readableText(entity.primaryEmail),
    })
  }
  return result
}

export async function customerExists(ctx: OrderContext, customerId: string): Promise<boolean> {
  const entity = await findOneWithDecryption(
    ctx.em,
    CustomerEntity,
    { id: customerId, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null },
    undefined,
    { tenantId: ctx.tenantId, organizationId: ctx.organizationId },
  )
  return Boolean(entity)
}

export async function loadProducts(ctx: OrderContext, ids: string[]): Promise<Map<string, ProductSummary>> {
  const unique = Array.from(new Set(ids.filter((id) => UUID_RE.test(id))))
  const result = new Map<string, ProductSummary>()
  if (!unique.length) return result
  const rows = await ctx.em.getConnection().execute<
    Array<{ id: string; title: string; sku: string | null; kind: string | null; unit: string | null; field_key: string | null; value_text: string | null; value_num: string | null }>
  >(
    `select p.id, p.title, p.sku, p.custom_fieldset_code as kind, p.default_unit as unit, v.field_key, v.value_text,
            coalesce(v.value_float::numeric, v.value_int::numeric)::text as value_num
       from catalog_products p
       left join custom_field_values v on v.record_id = p.id::text and v.entity_id = 'catalog:catalog_product'
        and v.deleted_at is null and v.field_key in ('item_code', 'pack_size', 'brand_name', 'mrp')
      where p.id = any(?::uuid[]) and p.tenant_id = ? and p.organization_id = ?`,
    [`{${unique.join(',')}}`, ctx.tenantId, ctx.organizationId],
  )
  for (const row of rows) {
    const current = result.get(row.id) ?? {
      id: row.id,
      title: row.title,
      code: null,
      sku: row.sku,
      kind: row.kind,
      unit: row.unit,
      packSize: null,
      brandName: null,
      mrp: null,
    }
    if (row.field_key === 'item_code' && row.value_text) current.code = row.value_text
    if (row.field_key === 'pack_size' && row.value_text) current.packSize = row.value_text
    if (row.field_key === 'brand_name' && row.value_text) current.brandName = row.value_text
    if (row.field_key === 'mrp' && (row.value_num || row.value_text)) current.mrp = Number(row.value_num ?? row.value_text)
    result.set(row.id, current)
  }
  return result
}

export async function approvedPackBoms(ctx: OrderContext, productIds: string[]): Promise<Map<string, { id: string; version: number; status: string }>> {
  const unique = Array.from(new Set(productIds.filter((id) => UUID_RE.test(id))))
  const result = new Map<string, { id: string; version: number; status: string }>()
  if (!unique.length) return result
  const rows = await ctx.em.getConnection().execute<Array<{ product_id: string; id: string; version: number; status: string }>>(
    `select distinct on (product_id) product_id, id, version, status
       from dermat_bom_headers
      where product_id = any(?::uuid[]) and tenant_id = ? and organization_id = ? and deleted_at is null and status <> 'superseded'
      order by product_id, (status = 'approved') desc, version desc`,
    [`{${unique.join(',')}}`, ctx.tenantId, ctx.organizationId],
  )
  for (const row of rows) result.set(row.product_id, { id: row.id, version: row.version, status: row.status })
  return result
}

export async function bulkForProducts(ctx: OrderContext, productIds: string[]): Promise<string[]> {
  const unique = Array.from(new Set(productIds.filter((id) => UUID_RE.test(id))))
  if (!unique.length) return []
  const rows = await ctx.em.getConnection().execute<Array<{ product_id: string; bulk_id: string | null }>>(
    `select h.product_id, i.component_product_id as bulk_id
       from dermat_bom_headers h
       left join dermat_bom_items i on i.bom_id = h.id and i.component_kind = 'bulk'
      where h.product_id = any(?::uuid[]) and h.tenant_id = ? and h.organization_id = ? and h.deleted_at is null and h.status = 'approved'`,
    [`{${unique.join(',')}}`, ctx.tenantId, ctx.organizationId],
    'all',
    ctx.em.getTransactionContext(),
  )
  const bulks = new Map<string, string[]>()
  for (const row of rows) {
    if (row.bulk_id) bulks.set(row.product_id, [...(bulks.get(row.product_id) ?? []), row.bulk_id])
  }
  return Array.from(new Set(unique.flatMap((id) => bulks.get(id) ?? [id])))
}

export async function nextOrderNo(ctx: OrderContext, orderDate: string): Promise<string> {
  const prefix = `DER/SO/${financialYear(new Date(`${orderDate}T00:00:00`))}/`
  const [row] = await ctx.em.getConnection().execute<Array<{ max: number | null }>>(
    `select max(nullif(substring(order_no from length(?) + 1), '')::int) as max
       from dermat_orders where tenant_id = ? and organization_id = ? and order_no like ?`,
    [prefix, ctx.tenantId, ctx.organizationId, `${prefix}%`],
  )
  return `${prefix}${String(Number(row?.max ?? 0) + 1).padStart(4, '0')}`
}

export async function findOrder(ctx: OrderContext, id: string): Promise<DermatOrder> {
  const order = await ctx.em.findOne(DermatOrder, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null })
  if (!order) throw new OrderError('Order not found', 404)
  return order
}
