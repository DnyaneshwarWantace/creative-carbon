import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CustomerEntity } from '@open-mercato/core/modules/customers/data/entities'
import type { OrderListQuery } from '../data/validators'
import { readableText, type OrderContext } from './server'

async function matchingCustomerIds(ctx: OrderContext, search: string): Promise<string[]> {
  const entities = await findWithDecryption(
    ctx.em,
    CustomerEntity,
    { tenantId: ctx.tenantId, organizationId: ctx.organizationId, deletedAt: null },
    { limit: 2000 },
    { tenantId: ctx.tenantId, organizationId: ctx.organizationId },
  )
  const needle = search.toLowerCase()
  const byName = entities.filter((entity) => (readableText(entity.displayName) ?? '').toLowerCase().includes(needle)).map((entity) => entity.id)
  const byLegal = await ctx.em.getConnection().execute<Array<{ entity_id: string }>>(
    `select c.entity_id from customer_companies c
       join custom_field_values v on v.record_id = c.id::text and v.field_key = 'legal_trade_name' and v.deleted_at is null
      where c.tenant_id = ? and c.organization_id = ? and v.value_text ilike ?`,
    [ctx.tenantId, ctx.organizationId, `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`],
  )
  return Array.from(new Set([...byName, ...byLegal.map((row) => row.entity_id)]))
}

export type OrderFilterQuery = Pick<OrderListQuery, 'customerId' | 'productId' | 'status' | 'stage' | 'stageStatus' | 'search'>

export async function orderFilter(ctx: OrderContext, query: OrderFilterQuery): Promise<{ where: string[]; params: unknown[] }> {
  const where: string[] = ['o.tenant_id = ?', 'o.organization_id = ?', 'o.deleted_at is null']
  const params: unknown[] = [ctx.tenantId, ctx.organizationId]
  if (query.customerId) {
    where.push('o.customer_id = ?')
    params.push(query.customerId)
  }
  if (query.productId) {
    where.push('exists (select 1 from cc_order_lines l where l.order_id = o.id and l.product_id = ?)')
    params.push(query.productId)
  }
  if (query.status === 'on_hold') where.push(`exists (select 1 from cc_order_stages s where s.order_id = o.id and s.status = 'on_hold')`)
  else if (query.status === 'open') where.push(`o.status in ('booked', 'confirmed')`)
  else if (query.status) {
    where.push('o.status = ?')
    params.push(query.status)
  }
  if (query.stage) {
    const statuses = query.stageStatus === 'waiting' ? `('waiting')` : query.stageStatus === 'done' ? `('done', 'skipped')` : `('open', 'on_hold')`
    where.push(`exists (select 1 from cc_order_stages s where s.order_id = o.id and s.stage_key = ? and s.status in ${statuses})`)
    params.push(query.stage)
  }
  if (query.search) {
    const term = `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
    const compact = `%${query.search.toLowerCase().replace(/[^a-z0-9]/g, '')}%`
    const customerIds = await matchingCustomerIds(ctx, query.search)
    const conditions = [
      'o.order_no ilike ?',
      'o.customer_po_ref ilike ?',
      `exists (select 1 from cc_order_lines l join catalog_products p on p.id = l.product_id
                left join custom_field_values v on v.record_id = p.id::text and v.field_key = 'item_code' and v.deleted_at is null
               where l.order_id = o.id and (p.title ilike ? or regexp_replace(lower(coalesce(v.value_text, '')), '[^a-z0-9]', '', 'g') like ? or l.batch_no ilike ?))`,
    ]
    params.push(term, term, term, compact, term)
    if (customerIds.length) {
      conditions.push('o.customer_id = any(?::uuid[])')
      params.push(`{${customerIds.join(',')}}`)
    }
    where.push(`(${conditions.join(' or ')})`)
  }
  return { where, params }
}
