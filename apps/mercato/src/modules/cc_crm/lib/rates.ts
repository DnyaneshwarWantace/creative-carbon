import type { OrderContext } from '../../cc_orders/lib/server'

export type RateSuggestion = { id: string; sizeClass: string; grade: string; thicknessFrom: number | null; thicknessTo: number | null; ratePerKg: number; currency: string; notes: string | null }

export async function suggestRates(ctx: OrderContext, query: { grade?: string; thickness?: number; currency?: string }): Promise<RateSuggestion[]> {
  const where = ['tenant_id = ?', 'organization_id = ?', 'deleted_at is null', 'is_active = true']
  const params: unknown[] = [ctx.tenantId, ctx.organizationId]
  if (query.grade) {
    where.push(`regexp_replace(lower(grade), '[^a-z0-9]', '', 'g') = regexp_replace(lower(?), '[^a-z0-9]', '', 'g')`)
    params.push(query.grade)
  }
  if (query.thickness != null) {
    where.push('(thickness_from is null or thickness_from <= ?) and (thickness_to is null or thickness_to >= ?)')
    params.push(query.thickness, query.thickness)
  }
  if (query.currency) {
    where.push('currency = ?')
    params.push(query.currency.toUpperCase())
  }
  const rows = await ctx.em.getConnection().execute<Array<{ id: string; size_class: string; grade: string; thickness_from: string | null; thickness_to: string | null; rate_per_kg: string; currency: string; notes: string | null }>>(
    `select id, size_class, grade, thickness_from, thickness_to, rate_per_kg, currency, notes from cc_price_rates where ${where.join(' and ')} order by grade, size_class, thickness_from nulls first limit 50`,
    params,
  )
  return rows.map((row) => ({
    id: row.id,
    sizeClass: row.size_class,
    grade: row.grade,
    thicknessFrom: row.thickness_from == null ? null : Number(row.thickness_from),
    thicknessTo: row.thickness_to == null ? null : Number(row.thickness_to),
    ratePerKg: Number(row.rate_per_kg),
    currency: row.currency,
    notes: row.notes,
  }))
}
