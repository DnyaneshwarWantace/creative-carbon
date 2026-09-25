import type { EntityManager } from '@mikro-orm/postgresql'

export type ProductSearchRow = {
  id: string
  title: string
  code: string | null
  sku: string | null
  kind: string
  unit: string | null
}

export type ProductSearchInput = {
  tenantId: string
  organizationId: string
  kinds: string[]
  query?: string | null
  limit: number
  activeOnly?: boolean
}

export function normalizeCode(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

export async function searchProducts(em: EntityManager, input: ProductSearchInput): Promise<ProductSearchRow[]> {
  const term = (input.query ?? '').trim()
  const compact = normalizeCode(term)
  const params: unknown[] = [input.tenantId, input.organizationId, `{${input.kinds.join(',')}}`]
  let filter = ''
  let order = 'p.title asc'
  const orderParams: unknown[] = []
  if (term) {
    const conditions = ['p.title ilike ?']
    params.push(`%${escapeLike(term)}%`)
    if (compact) {
      conditions.push(`regexp_replace(lower(coalesce(code.value_text, '')), '[^a-z0-9]', '', 'g') like ?`)
      conditions.push(`regexp_replace(lower(coalesce(p.sku, '')), '[^a-z0-9]', '', 'g') like ?`)
      params.push(`%${compact}%`, `%${compact}%`)
    }
    filter = `and (${conditions.join(' or ')})`
    order = `case
        when regexp_replace(lower(coalesce(code.value_text, '')), '[^a-z0-9]', '', 'g') = ? then 0
        when regexp_replace(lower(coalesce(code.value_text, '')), '[^a-z0-9]', '', 'g') like ? then 1
        when p.title ilike ? then 2
        else 3 end, p.title asc`
    orderParams.push(compact || '\u0000', `${compact || '\u0000'}%`, `${escapeLike(term)}%`)
  }
  return em.getConnection().execute<ProductSearchRow[]>(
    `select p.id, p.title, code.value_text as code, p.sku, p.custom_fieldset_code as kind, p.default_unit as unit
       from catalog_products p
       left join lateral (
         select v.value_text from custom_field_values v
          where v.entity_id = 'catalog:catalog_product' and v.record_id = p.id::text and v.field_key = 'item_code'
            and v.deleted_at is null and coalesce(v.value_text, '') <> ''
          order by v.created_at desc limit 1
       ) code on true
      where p.tenant_id = ? and p.organization_id = ? and p.deleted_at is null ${input.activeOnly ? 'and p.is_active = true' : ''}
        and p.custom_fieldset_code = any(?::text[]) ${filter}
      order by ${order}
      limit ?`,
    [...params, ...orderParams, input.limit],
  )
}
