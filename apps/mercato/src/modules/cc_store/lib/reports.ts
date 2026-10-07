import { loadProducts } from '../../cc_orders/lib/server'
import { LOCATION_CODES, ccWarehouse } from '../../cc_products/lib/stock'
import { StoreError, type StoreContext } from './server'

const DAY_MS = 86400000
const PLACES = Object.entries(LOCATION_CODES) as Array<['rm' | 'pm' | 'production' | 'fg', string]>

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

async function locations(ctx: StoreContext) {
  const warehouse = await ccWarehouse(ctx)
  if (!warehouse) throw new StoreError('The Creative Carbon warehouse is not set up yet', 409)
  const byId = new Map<string, 'rm' | 'pm' | 'production' | 'fg'>()
  for (const [place, code] of PLACES) {
    const id = warehouse.locations.get(code)
    if (id) byId.set(id, place)
  }
  return byId
}

type BalanceRow = { product_id: string; location_id: string; on_hand: string; status: string | null; expires_at: Date | null; received: Date }

async function balances(ctx: StoreContext): Promise<BalanceRow[]> {
  return ctx.em.getConnection().execute<BalanceRow[]>(
    `select v.product_id, b.location_id, b.quantity_on_hand as on_hand, coalesce(lot.status, 'available') as status, lot.expires_at, coalesce(lot.created_at, b.created_at) as received
       from wms_inventory_balances b
       join catalog_product_variants v on v.id = b.catalog_variant_id
       left join wms_inventory_lots lot on lot.id = b.lot_id
      where b.tenant_id = ? and b.organization_id = ? and b.deleted_at is null and b.quantity_on_hand > 0`,
    [ctx.tenantId, ctx.organizationId],
  )
}

export async function stockOverview(ctx: StoreContext) {
  const byId = await locations(ctx)
  const rows = await balances(ctx)
  const productIds = [...new Set(rows.map((row) => row.product_id))]
  const products = await loadProducts(ctx, productIds)
  const items = new Map<string, { productId: string; code: string | null; title: string; kind: string | null; unit: string | null; rm: number; pm: number; production: number; fg: number; underTest: number; onHold: number; total: number; free: number }>()
  for (const row of rows) {
    const place = byId.get(row.location_id)
    if (!place) continue
    const product = products.get(row.product_id)
    const entry = items.get(row.product_id) ?? { productId: row.product_id, code: product?.code ?? null, title: product?.title ?? '(deleted product)', kind: product?.kind ?? null, unit: product?.unit ?? null, rm: 0, pm: 0, production: 0, fg: 0, underTest: 0, onHold: 0, total: 0, free: 0 }
    const quantity = Number(row.on_hand)
    entry[place] = round(entry[place] + quantity)
    entry.total = round(entry.total + quantity)
    if (row.status === 'quarantine') entry.underTest = round(entry.underTest + quantity)
    if (row.status === 'hold' || row.status === 'expired') entry.onHold = round(entry.onHold + quantity)
    items.set(row.product_id, entry)
  }
  for (const entry of items.values()) {
    entry.free = round(Math.max(0, entry.rm + entry.pm - entry.underTest - entry.onHold))
  }
  return [...items.values()].sort((a, b) => (a.kind ?? '').localeCompare(b.kind ?? '') || (a.code ?? a.title).localeCompare(b.code ?? b.title))
}

const BUCKETS = [
  { key: 'd30', label: '0–30 days', max: 30 },
  { key: 'd90', label: '31–90 days', max: 90 },
  { key: 'd180', label: '91–180 days', max: 180 },
  { key: 'older', label: 'Over 180 days', max: Infinity },
] as const

export async function stockAgeing(ctx: StoreContext) {
  const byId = await locations(ctx)
  const rows = (await balances(ctx)).filter((row) => byId.has(row.location_id))
  const products = await loadProducts(ctx, [...new Set(rows.map((row) => row.product_id))])
  const now = Date.now()
  const items = new Map<string, { productId: string; code: string | null; title: string; kind: string | null; unit: string | null; d30: number; d90: number; d180: number; older: number; total: number; oldestDays: number; expired: number; expiring90: number }>()
  for (const row of rows) {
    const product = products.get(row.product_id)
    const entry = items.get(row.product_id) ?? { productId: row.product_id, code: product?.code ?? null, title: product?.title ?? '(deleted product)', kind: product?.kind ?? null, unit: product?.unit ?? null, d30: 0, d90: 0, d180: 0, older: 0, total: 0, oldestDays: 0, expired: 0, expiring90: 0 }
    const age = Math.floor((now - new Date(row.received).getTime()) / DAY_MS)
    const bucket = BUCKETS.find((entryBucket) => age <= entryBucket.max) ?? BUCKETS[BUCKETS.length - 1]
    const quantity = Number(row.on_hand)
    entry[bucket.key] = round(entry[bucket.key] + quantity)
    entry.total = round(entry.total + quantity)
    entry.oldestDays = Math.max(entry.oldestDays, age)
    if (row.expires_at) {
      const left = Math.floor((new Date(row.expires_at).getTime() - now) / DAY_MS)
      if (left < 0) entry.expired = round(entry.expired + quantity)
      else if (left <= 90) entry.expiring90 = round(entry.expiring90 + quantity)
    }
    items.set(row.product_id, entry)
  }
  return { buckets: BUCKETS.map((bucket) => ({ key: bucket.key, label: bucket.label })), items: [...items.values()].sort((a, b) => b.oldestDays - a.oldestDays) }
}

export async function consumption(ctx: StoreContext, range: { from: string; to: string }) {
  const rows = await ctx.em.getConnection().execute<Array<{ product_id: string; month: string; used: string; rejected: string }>>(
    `select v.product_id, to_char(m.performed_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month,
            sum(case when m.reason_code = 'production_use' then abs(m.quantity) else 0 end) as used,
            sum(case when m.reason_code = 'production_reject' then abs(m.quantity) else 0 end) as rejected
       from wms_inventory_movements m
       join catalog_product_variants v on v.id = m.catalog_variant_id
      where m.tenant_id = ? and m.organization_id = ? and m.deleted_at is null
        and m.reason_code in ('production_use', 'production_reject')
        and (m.performed_at at time zone 'Asia/Kolkata')::date between ?::date and ?::date
      group by v.product_id, month`,
    [ctx.tenantId, ctx.organizationId, range.from, range.to],
  )
  const products = await loadProducts(ctx, [...new Set(rows.map((row) => row.product_id))])
  const months = [...new Set(rows.map((row) => row.month))].sort()
  const items = new Map<string, { productId: string; code: string | null; title: string; kind: string | null; unit: string | null; used: number; rejected: number; byMonth: Record<string, number> }>()
  for (const row of rows) {
    const product = products.get(row.product_id)
    const entry = items.get(row.product_id) ?? { productId: row.product_id, code: product?.code ?? null, title: product?.title ?? '(deleted product)', kind: product?.kind ?? null, unit: product?.unit ?? null, used: 0, rejected: 0, byMonth: {} }
    entry.used = round(entry.used + Number(row.used))
    entry.rejected = round(entry.rejected + Number(row.rejected))
    entry.byMonth[row.month] = round((entry.byMonth[row.month] ?? 0) + Number(row.used) + Number(row.rejected))
    items.set(row.product_id, entry)
  }
  return { months, items: [...items.values()].sort((a, b) => b.used + b.rejected - (a.used + a.rejected)) }
}
