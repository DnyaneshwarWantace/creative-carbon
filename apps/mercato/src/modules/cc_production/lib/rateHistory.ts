import type { OrderContext } from '../../cc_orders/lib/server'
import { diffFields, recordActivity } from '../../cc_audit/lib/activity'
import { PriceRate } from '../data/entities'
import { PlantError } from './server'

type Row = Record<string, unknown>

const RATE_FIELDS = {
  sizeClass: { label: 'Size' },
  grade: { label: 'Grade' },
  thicknessFrom: { label: 'From (mm)' },
  thicknessTo: { label: 'To (mm)' },
  ratePerKg: { label: 'Rate per kg', money: true },
  currency: { label: 'Currency' },
  notes: { label: 'Notes' },
  isActive: { label: 'In use' },
}

export async function logRateChange(ctx: OrderContext, id: string, before: Row | null, after: Row, reason: string | null, byName: string | null) {
  const changes = diffFields(before, after, RATE_FIELDS)
  if (before && !changes.length) return
  recordActivity(ctx.em, ctx, {
    recordType: 'price_rate',
    recordId: id,
    action: before ? 'changed' : 'created',
    kind: before ? 'change' : 'change',
    summary: before ? null : `Rate set: ${after.grade} ${after.sizeClass} at ${after.currency} ${after.ratePerKg} per kg`,
    reason: reason?.trim() || null,
    changes,
    actorUserId: ctx.userId ?? null,
    actorName: byName,
  })
  await ctx.em.flush()
}

export async function rateHistory(ctx: OrderContext, id: string) {
  const rate = await ctx.em.findOne(PriceRate, { id, tenantId: ctx.tenantId, organizationId: ctx.organizationId })
  if (!rate) throw new PlantError('Rate not found', 404)
  const connection = ctx.em.getConnection()
  const changes = await connection.execute<Array<{ created_at: Date; changes: Array<{ field: string; from: unknown; to: unknown }> | null }>>(
    `select created_at, changes from cc_activity_log where record_type = 'price_rate' and record_id = ? and tenant_id = ? and organization_id = ? order by created_at asc`,
    [id, ctx.tenantId, ctx.organizationId],
  )
  const rates = new Set<number>([Number(rate.ratePerKg)])
  for (const entry of changes) for (const change of entry.changes ?? []) if (change.field === 'ratePerKg') [change.from, change.to].forEach((value) => value !== null && value !== undefined && rates.add(Number(value)))
  const from = rate.thicknessFrom == null ? null : Number(rate.thicknessFrom)
  const to = rate.thicknessTo == null ? null : Number(rate.thicknessTo)
  const quotations = await connection.execute<Array<{ id: string; quote_no: string; quote_date: string; status: string; rate: string; thickness: string | null }>>(
    `select q.id, q.quote_no, q.quote_date, q.status, l->>'rate' as rate, l->'specs'->'material'->>'thickness_mm' as thickness
       from cc_quotations q, jsonb_array_elements(q.data->'lines') l
      where q.tenant_id = ? and q.organization_id = ? and q.deleted_at is null and q.currency = ?
        and lower(coalesce(l->'specs'->'material'->>'grade', '')) = lower(?)
        and (l->>'rate')::numeric = any(?::numeric[])
      order by q.quote_date desc limit 100`,
    [ctx.tenantId, ctx.organizationId, rate.currency, rate.grade, `{${[...rates].join(',')}}`],
  )
  const inRange = (thickness: string | null) => {
    if (thickness === null || thickness === '') return true
    const value = Number(thickness)
    return (from === null || value >= from) && (to === null || value <= to)
  }
  return {
    id: rate.id,
    sizeClass: rate.sizeClass,
    grade: rate.grade,
    thicknessFrom: from,
    thicknessTo: to,
    ratePerKg: Number(rate.ratePerKg),
    currency: rate.currency,
    isActive: rate.isActive,
    updatedByName: rate.updatedByName ?? null,
    updatedAt: rate.updatedAt.toISOString(),
    quotations: quotations.filter((row) => inRange(row.thickness)).map((row) => ({ id: row.id, quoteNo: row.quote_no, quoteDate: row.quote_date, status: row.status, rate: Number(row.rate) })),
  }
}
